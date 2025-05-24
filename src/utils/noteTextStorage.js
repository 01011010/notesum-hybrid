import Dexie from 'dexie';

// Define the database
class NotesDatabase extends Dexie {
  constructor() {
    super('NotesDatabase');
    
    // Define tables and indexes
    this.version(1).stores({
      pages: '++id, name, order, createdAt, lastModified, lastSynced, isArchived, archivedAt, content, isEncrypted, pendingSync, syncStatus', //++id auto-generates unique IDs for new pages locally.
      metadata: '&key, value' // Key-value store for app metadata (e.g., lastSyncTime)
    });

    // Define version 2 - add isPinned field
    this.version(2).stores({
      pages: '++id, name, order, createdAt, lastModified, lastSynced, isArchived, archivedAt, content, isEncrypted, pendingSync, syncStatus, isPinned, pinnedAt' // Added isPinned
    }).upgrade(tx => {
      // Upgrade function - initialize isPinned to false for all existing records
      return tx.pages.toCollection().modify(page => {
        page.isPinned = false;
        page.pinnedAt = ''
      });
    });
    // Define version 2 - add isPinned field
    this.version(3).stores({
      pages: '++id, name, order, createdAt, lastModified, lastSynced, isArchived, archivedAt, content, isEncrypted, pendingSync, syncStatus, isPinned, pinnedAt, type' // Added isPinned
    }).upgrade(tx => {
      // Upgrade function - initialize isPinned to false for all existing records
      return tx.pages.toCollection().modify(page => {
        page.type = 'note';
      });
    });
  }
}

// Create database instance
const db = new NotesDatabase();

// Helper functions for database operations
// track pending changes locally and push only those to Firestore
// Helper function for metadata operations
export const appMetadataStorage = {
  metadata: db.metadata, // Expose the Dexie table
  async getItem(key) {
    return (await db.metadata.get(key))?.value || null;
  },

  async setItem(key, value) {
    await db.metadata.put({ key, value });
  },

  // Remove pinned result
  async removeItem(item) {
    try {
      await db.metadata.delete(item);
    } catch (error) {
      console.error('Error removing pinned result:', error);
    }
  },

  // Functions to manage the deleted pages list
  async getDeletedPageIds() {
    const deletedIds = await this.getItem('deletedPageIds');
  return new Set(deletedIds || []);
},

async markPageForDeletion(pageId) {
  const deletedIds = await this.getDeletedPageIds();
  deletedIds.add(pageId);
  await this.setItem('deletedPageIds', Array.from(deletedIds));
},

async clearDeletedPageId(pageId) {
  const deletedIds = await this.getDeletedPageIds();
  deletedIds.delete(pageId);
  await this.setItem('deletedPageIds', Array.from(deletedIds));
}

  
};

export const noteTextStorage = {
  pages: db.pages, // Expose the Dexie table
  async savePage(pageId, content, vaultKey = null) {
    try {

      // Use this to encryt local storage - in this case content search doesn't work
      // const encryptionKey = await generateKeyFromPassphrase(vaultKey); 
      // const encryptedContent = await encryptData(encryptionKey, content);

      await db.pages.update(pageId, { 
        content: content, //encryptedContent
        lastModified: new Date().toISOString(),
        pendingSync: 1  // New field to track unsynced changes
      });
      return true; // Indicate success
    } catch (error) {
      console.error('Error saving page content:', error);
    }
  },

  async getPage(pageId, vaultKey = null) {
    try {
      const latest = await db.pages.get(pageId);
        return latest?.content || '';
        
        /** 
         * Use this to decrypt the content of local storage - currently not used
         * Dexie storage is not encrypted currently
         *  if (!latest?.content) return "";
         *   const encryptionKey = await generateKeyFromPassphrase(vaultKey); 
         *   return await decryptData(encryptionKey, latest.content); 
         */
    } catch (error) {
      console.error('Error getting page:', error);
      return null;
    }
  },

  async updatePage (pageId, updates) {
    // console.log("note store: updatePage");
    try {
      //await db.pages.update(pageId, updates);
      await db.pages.update(pageId, { ...updates, pendingSync: 1 });
      return true; // Indicate success
    } catch (error) {
      console.error('Error updating page:', error);
    }
  },

  async createPageFromFirestore(
    pageId, name, order, 
    createdAt, lastModified, lastSynced, 
    content, isEncrypted, pendingSync, syncStatus ) {
    try {
      const existingPage = await db.pages.get(pageId);
      const now = new Date().toISOString();

      const data = {
        name: name,
        order: order,
        createdAt: createdAt  || now,
        lastModified: lastModified || now,
        lastSynced: lastSynced || now,
        content: content,
        isEncrypted: isEncrypted,
        pendingSync: pendingSync,
        syncStatus: syncStatus
      };

      if (existingPage) {
        await db.pages.update(pageId, data);
      } else {
        await db.pages.add(pageId, data);
      }
      
    } catch (error) {
      console.error('Failed to create page:', error);
      throw error;
    }
  },
  
  async createPage(newPage) {
    // console.log("note store: createPage");
    try {
      await db.pages.add(newPage);
    } catch (error) {
      console.error('Failed to create page:', error);
      throw error;
    }
  },

  async deletePage(pageId) {
    try {
      await db.pages.delete(pageId);
    } catch (error) {
      console.error('Failed to delete page:', error);
      throw error;
    }
  },

  async getRawPages() {
    try {
      return await db.pages;
    } catch (error) {
      console.error('Failed to load pages:', error);
      throw error;
    }
  },

  async getPages() {
    try {
      return await db.pages.orderBy('order').toArray();
    } catch (error) {
      console.error('Failed to load pages:', error);
      throw error;
    }
  },

  async getPendingSyncPages() {
    try {
      return await db.pages
      .where('pendingSync')
      .equals(1)
      .toArray();
    } catch (error) {
      console.error('Failed to fetch pending pages:', error);
      throw error;
    }
  },

  async updatePageOrder(updates) {
    try {
      await Promise.all(
        updates.map(page => db.pages.update(page.id, { order: page.order }))
      );
    } catch (error) {
      console.error('Failed to update page order:', error);
      throw error;
    }
  },
};
