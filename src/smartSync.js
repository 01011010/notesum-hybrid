import { debounce, isEqual } from 'lodash';
import dayjs from 'dayjs';
import { syncDexieToFirestore } from "@/firebase2";
import Emitter from 'tiny-emitter';
import { noteTextStorage } from './utils/noteTextStorage';

/**
 * SmartSync - An intelligent sync manager that optimizes when and how to sync data
 * Features:
 * - Intelligent change detection
 * - Multi-level sync tiers (local save vs cloud sync)
 * - Content-aware chunking
 * - Differential syncing
 * - Adaptive timing based on user behavior
 */
class SmartSync {
  constructor(options = {}, emitter) {

    this.emitter = emitter; // <-- Store it
    
    // Configuration with defaults
    this.config = {
      // Basic timing settings
      localSaveDelay: options.localSaveDelay || 5000, // 5 second
      cloudSyncDelay: options.cloudSyncDelay || 30000, // 30 seconds
      maxSyncDelay: options.maxSyncDelay || 300000, // 5 minutes (maximum time without sync)
      
      // Change sensitivity
      minChangeThreshold: options.minChangeThreshold || 10, // Minimum character changes to trigger a save
      significantChangeThreshold: options.significantChangeThreshold || 100, // Character change threshold for immediate sync
      
      // Adaptive behavior settings
      adaptiveTiming: options.adaptiveTiming !== false, // Enable adaptive timing by default
      collectMetrics: options.collectMetrics !== false, // Collect usage metrics by default
      
      // Callbacks
      onLocalSave: options.onLocalSave || (async () => {}),
      onCloudSync: options.onCloudSync || (async () => {}),
      onError: options.onError || console.error,
      getTimezone: options.getTimezone || (() => dayjs.tz.guess())
    };
    
    // State tracking
    this.state = {
      lastContent: null,
      lastLocalSave: null,
      lastCloudSync: null,
      pendingChanges: false,
      syncScheduled: false,
      forceSyncScheduled: false,
      consecutiveChanges: 0,
      changeHistory: [],
      editorActiveTime: 0,
      editorInactiveTime: 0,
      userPatterns: {
        avgEditSessionLength: 0,
        avgTimeBetweenEdits: 0,
        typicalChangeSize: 0,
        sessionCount: 0
      }
    };
    
    // Setup debounced functions
    this.debouncedLocalSave = debounce(this._performLocalSave.bind(this), this.config.localSaveDelay);
    this.debouncedCloudSync = debounce(this._performCloudSync.bind(this), this.config.cloudSyncDelay);
    
    // Force sync timer
    this.forceSyncTimer = null;
    
    // Activity tracking
    this.lastActivityTime = Date.now();
    this.activityInterval = setInterval(() => this._trackActivity(), 5000);

    this.serverDocumentTimestamps = {}
  }
  
  /**
   * Handle content changes and determine appropriate save/sync actions
   * @param {string} pageId - The ID of the page being edited
   * @param {string} content - The current content
   * @returns {Promise} - Resolves when appropriate save actions have been scheduled
   */
  async handleContentChange(pageId, content) {
    // Track user activity
    this.lastActivityTime = Date.now();
    
    // Calculate change metrics
    const changeMetrics = this._calculateChangeMetrics(content);
    
    // Update state
    this.state.pendingChanges = true;
    this.state.consecutiveChanges++;
    
    //console.log(changeMetrics)

    // Always save locally with debounce if there are actual changes
    if (changeMetrics.hasChanged) {
      this.debouncedLocalSave(pageId, content);
      // Collect change metrics for adaptive timing
      if (this.config.collectMetrics) {
        this.state.changeHistory.push({
          timestamp: Date.now(),
          changeSize: changeMetrics.changeSize,
          timeSinceLastChange: this.state.lastLocalSave ? 
            Date.now() - this.state.lastLocalSave : 0
        });
        
        // Limit history size
        if (this.state.changeHistory.length > 100) {
          this.state.changeHistory.shift();
        }
      }
    }
    
    // Determine if we should cloud sync based on intelligent rules
    const shouldCloudSync = this._shouldTriggerCloudSync(changeMetrics);
    
    if (shouldCloudSync) {
      // Cancel existing sync if any
      this.debouncedCloudSync.cancel();
      
      // Schedule a new sync
      if (!this.state.syncScheduled) {
        this.state.syncScheduled = true;
        this.debouncedCloudSync(pageId, content);
      }
    }
    
    // Always ensure a maximum time between syncs for data safety
    this._ensureMaxSyncDelay(pageId, content);
    
    return {
      savedLocally: changeMetrics.hasChanged,
      scheduledForSync: shouldCloudSync
    };
  }
  
  /**
   * Force an immediate sync regardless of change detection
   * @param {string} pageId - The ID of the page
   * @param {string} content - The current content
   * @returns {Promise} - Resolves when sync is complete
   */
  async forceSync(pageId, content) {
    // Cancel any pending operations
    this.debouncedLocalSave.cancel();
    this.debouncedCloudSync.cancel();
    
    // Perform local save first
    await this._performLocalSave(pageId, content);
    
    // Then perform cloud sync
    return this._performCloudSync(pageId, content);
  }
  
  /**
 * Perform a global sync of all pages with pending changes
 * Similar to Microsoft Outlook's "Send/Receive All"
 * @param {Object} options - Configuration options
 * @param {boolean} options.forceAll - If true, sync all pages regardless of pending changes
 * @param {boolean} options.localOnly - If true, only save locally without cloud sync
 * @returns {Promise<Object>} - Results of the sync operation
 */
async syncAll(options = {}) {
  const { forceAll = false, localOnly = false, initialSync = false } = options;
  ////console.log("Sync All accessed")
  try {
    // Cancel any pending operations
    this.debouncedLocalSave.cancel();
    this.debouncedCloudSync.cancel();
    
    // For initial sync, check for remote changes first
    if (initialSync && !localOnly) {
      await syncDexieToFirestore.download
    }
    

    // Get list of pages that need syncing
    let pagesToSync = [];
    
    if (forceAll) {
      // Get all pages from local storage
      pagesToSync = await this._getAllPages();
    } else {
      // Get only pages with pending changes
      pagesToSync = await this._getPagesWithPendingChanges();
    }
    
    // Track results for each page
    const results = {
      total: pagesToSync.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      details: {}
    };
    
    let processedCount = 0; // Keep track of items processed

    // Process each page
    for (const pageInfo of pagesToSync) {
      processedCount++; // Increment before processing
      try {
        const { pageId, content } = pageInfo;
        
        // Emit progress before processing the page
        this.emitter.emit('sync-progress', {
          status: 'processing',
          pageId: pageId,
          processed: processedCount - 1, // Items *before* this one
          total: results.total
          // Add more detail if needed, e.g., page title
        });

        // Skip pages with no content unless forceAll is true
        if (!content && !forceAll) {
          results.skipped++;
          results.details[pageId] = { status: 'skipped', reason: 'no content' };
          // Emit progress after deciding to skip
          this.emitter.emit('sync-progress', {
            status: 'skipped',
            pageId: pageId,
            processed: processedCount, // Items *including* this one
            total: results.total
          });
          continue;
        }
        
        // Always perform local save
        await this._performLocalSave(pageId, content);
        
        // Perform cloud sync if not localOnly
        if (!localOnly) {
          const syncResult = await this._performCloudSync(pageId, content);
          
          if (syncResult.success) {
            results.succeeded++;
            results.details[pageId] = { status: 'success' };
            // Emit progress after successful sync
            this.emitter.emit('sync-progress', {
              status: 'synced',
              pageId: pageId,
              processed: processedCount,
              total: results.total
            });
          } else {
            results.failed++;
            results.details[pageId] = { 
              status: 'failed', 
              error: syncResult.error
            };
            // Emit progress after failed sync
            this.emitter.emit('sync-progress', {
              status: 'failed',
              pageId: pageId,
              processed: processedCount,
              total: results.total,
              error: syncResult.error
            });
          }
        } else {
          results.succeeded++;
          results.details[pageId] = { status: 'local-only-success' };
          // Emit progress for local only
          this.emitter.emit('sync-progress', {
            status: 'local-saved',
            pageId: pageId,
            processed: processedCount,
            total: results.total
          });
        }
      } catch (error) {
        results.failed++;
        results.details[pageInfo.pageId] = { 
          status: 'failed', 
          error: error.message
        };
        // Emit progress on exception
        this.emitter.emit('sync-progress', {
          status: 'error',
          pageId: pageInfo.pageId,
          processed: processedCount,
          total: results.total,
          error: error.message
        });
      }
      // Optional: add a small delay to make progress visible for fast syncs
      // await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Update state
    this.state.lastGlobalSync = Date.now();
    
    return {
      success: results.failed === 0,
      results
    };
  } catch (error) {
    this.config.onError('Error during global sync', error);
    this.emitter.emit('sync-error', error);
    return { 
      success: false, 
      error,
      results: { total: 0, succeeded: 0, failed: 1, skipped: 0, details: {} }
    };
  }
}

/**
 * Helper method to get all pages from storage
 * @private
 * @returns {Promise<Array>} - Array of {pageId, content} objects
 */
async _getAllPages() {
  try {
    // This implementation depends on your storage mechanism
    // You'll need to adapt this to your specific storage API
    // return await this.config.getAllPages();
    return await noteTextStorage.getPages();
  } catch (error) {
    this.config.onError('Error getting all pages', error);
    return [];
  }
}



async _syncFromCloud() {
  // Get last sync timestamp from app metadata
  const metadata = await appMetadataStorage.getItem('lastSyncTime'); 
  const lastSyncTime = metadata ? new Date(metadata.value) : new Date(0);
  
  // Fetch changes from Firestore since last sync
  const cloudChanges = await this._getCloudChangesSince(lastSyncTime);
  
  // Process each cloud change
  for (const change of cloudChanges) {
    const localPage = await this.db.pages.get(change.id);
    
    if (!localPage) {
      // New page from cloud - add to local
      await this.db.pages.add({
        id: change.id,
        content: change.content,
        name: change.name,
        order: change.order,
        lastModified: change.lastModified,
        lastSynced: new Date().toISOString(),
        pendingSync: 0,
        syncStatus: 'synced',
        createdAt: change.createdAt
      });
    } else if (new Date(change.lastModified) > new Date(localPage.lastModified)) {
      // Cloud version is newer - update local
      await this.db.pages.update(change.id, {
        content: change.content,
        name: change.name,
        order: change.order,
        lastModified: change.lastModified,
        lastSynced: new Date().toISOString(),
        pendingSync: 0,
        syncStatus: 'synced'
      });
    }
    // If local is newer, it will be handled by the regular sync process
  }
  
  // Handle deletions (pages that exist locally but were deleted remotely)
  // You'll need to track deletions in Firestore somehow
  
  // Update last sync time
  await this.db.appMetadata.put({ key: 'lastSyncTime', value: new Date().toISOString() });
}

async _getCloudChangesSince(timestamp) {
  // Query Firestore for documents modified since the given timestamp
  const userId = this.config.getCurrentUserId();
  const query = this.firestore
    .collection('pages')
    .where('userId', '==', userId)
    .where('lastModified', '>', timestamp);
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data());
}

/**
 * Helper method to get pages with pending changes
 * @private
 * @returns {Promise<Array>} - Array of {pageId, content} objects
 */
async _getPagesWithPendingChanges() {
  try {
    // This implementation depends on your tracking mechanism
    // You might store this in app metadata or have another way to track changes
    //return await this.config.getPagesWithPendingChanges();
    return await noteTextStorage.getPendingSyncPages();
  } catch (error) {
    this.config.onError('Error getting pages with pending changes', error);
    return [];
  }
}


  /**
   * Prepare for editor to be closed
   * @param {string} pageId - The ID of the page
   * @param {string} content - The current content
   * @returns {Promise} - Resolves when all pending operations complete
   */
  async prepareClose(pageId, content) {
    // Cancel all debounced operations
    this.debouncedLocalSave.cancel();
    this.debouncedCloudSync.cancel();
    
    // Force immediate sync if there are pending changes
    if (this.state.pendingChanges) {
      await this._performLocalSave(pageId, content);
      await this._performCloudSync(pageId, content);
    }
    
    // Clear timers
    if (this.forceSyncTimer) {
      clearTimeout(this.forceSyncTimer);
    }
    if (this.activityInterval) {
      clearInterval(this.activityInterval);
    }
    
    return true;
  }

  // Add this to your smart sync manager class
async handlePageDeletion(pageId) {
  // console.log("handle Page deletion....")
  try {
    // Ensure serverDocumentTimestamps is initialized
    if (!this.serverDocumentTimestamps) {
      this.serverDocumentTimestamps = {};
    }
    
    // Clear any pending syncs for this page
    if (this.state.currentPage === pageId) {
      this.state.pendingChanges = false;
      this.state.syncScheduled = false;
      if (this._syncTimeout) {
        clearTimeout(this._syncTimeout);
        this._syncTimeout = null;
      }
    }
    
    // Remove from local storage
    await this.config.onLocalSave(pageId, null);
    // console.log("Remove from local storage is done")

    console.log("SYNC MANAGER HANDLE PAGE DELECTION BEFORE CLOUD")
    // Sync deletion to server
    const response = await this.config.onCloudSync(pageId, {
      pageId,
      metadata: {
        operation: 'delete',
        timestamp: Date.now()
      },
      content: null,
      isDeleteOperation: true
    }, true);
    // console.log("smartSync - handlePageDeletion:")
    // console.log(response)
    
    // Clean up any local references
    if (this.serverDocumentTimestamps[pageId]) {
      delete this.serverDocumentTimestamps[pageId];
    }
    
    return { 
      success: response && response.success, 
      error: response?.error
    };
  } catch (error) {
    this.config.onError('Error during page deletion', error);
    return { success: false, error };
  }
}
  
  /**
   * Perform local save operation
   * @private
   */
  async _performLocalSave(pageId, content) {
    try {
      console.log("performing local save");
      // Capture timing for metrics
      const startTime = Date.now();
      
      // Call the provided save function
      await this.config.onLocalSave(pageId, content);
      
      // Update state
      this.state.lastContent = content;
      this.state.lastLocalSave = Date.now();
      
      // Track performance
      const duration = Date.now() - startTime;
      
      // Update user timezone for the UI
      const timezone = await this.config.getTimezone();
      const formattedTime = dayjs().tz(timezone).format('HH:mm:ss');
      
      // Return success with timing information
      return {
        success: true,
        duration,
        timestamp: formattedTime
      };
    } catch (error) {
      this.config.onError('Error during local save', error);
      return { success: false, error };
    }
  }
  
  /**
   * Perform cloud sync operation
   * @private
   */
  /* based on diff sync version - disabled for now in favor of full sync
  async _performCloudSync(pageId, content) {
    try {
      // Perform differential sync if possible
      const diffSync = this._prepareDifferentialSync(content);
      
      // Call the provided sync function
      await this.config.onCloudSync(pageId, content, diffSync);
      
      // Update state
      this.state.lastCloudSync = Date.now();
      this.state.pendingChanges = false;
      this.state.syncScheduled = false;
      this.state.forceSyncScheduled = false;
      this.state.consecutiveChanges = 0;
      
      // Clear force sync timer if exists
      if (this.forceSyncTimer) {
        clearTimeout(this.forceSyncTimer);
        this.forceSyncTimer = null;
      }
      
      // Update adaptive timing based on recent behavior
      if (this.config.adaptiveTiming) {
        this._updateAdaptiveTiming();
      }
      
      // Return success
      return { success: true };
    } catch (error) {
      this.config.onError('Error during cloud sync', error);
      
      // Keep the pending changes flag to retry later
      this.state.syncScheduled = false;
      this.state.forceSyncScheduled = false;
      
      return { success: false, error };
    }
  }
    */

  /*
  async _performCloudSync(pageId, content) {
    //console.log("_performCloudSync: ", pageId)
    //console.log("_performCloudSync: ", content)
    try {
      // Prepare sync data with timestamp approach
      const syncData = this._prepareTimestampBasedSync(pageId, content);
      
      // Send to server
      const response = await this.config.onCloudSync(pageId, syncData);
      //console.log("Wtf response: ", response)
      // Update local state based on server response
      if (response.success) {
        //console.log("_performCloudSync ", response )
        this.state.lastCloudSync = Date.now();
        this.state.pendingChanges = false;
        this.state.syncScheduled = false;
        this.serverDocumentTimestamps[pageId] = response.serverTimestamp;
        
        // If server sent updated content, update local content
        if (response.serverContent) {
          this.state.lastContent = response.serverContent;
          // Notify editor to update content if needed
        }

         // Update adaptive timing based on recent behavior
        if (this.config.adaptiveTiming) {
          this._updateAdaptiveTiming();
        }
      }
      
      return { success: true };
    } catch (error) {
      this.config.onError('Error during cloud sync', error);
      return { success: false, error };
    }
  }
    */
  
  async _performCloudSync(pageId, content) {
    try {
      // Ensure serverDocumentTimestamps is initialized
      if (!this.serverDocumentTimestamps) {
        this.serverDocumentTimestamps = {};
      }
  
      // Prepare sync data with timestamp approach
      const syncData = this._prepareTimestampBasedSync(pageId, content);
      
      // Send to server
      const response = await this.config.onCloudSync(pageId, syncData);
      
      // Update local state based on server response
      if (response && response.success) {
        this.state.lastCloudSync = Date.now();
        this.state.pendingChanges = false;
        this.state.syncScheduled = false;
        this.serverDocumentTimestamps[pageId] = response.serverTimestamp;
        
        // If server sent updated content, update local content
        if (response.serverContent) {
          this.state.lastContent = response.serverContent;
          // Notify editor to update content if needed
          if (this.config.onContentUpdate) {
            this.config.onContentUpdate(response.serverContent);
          }
        }
        
        // Update adaptive timing based on recent behavior
        if (this.config.adaptiveTiming) {
          this._updateAdaptiveTiming();
        }
        
        return { success: true };
      } else {
        // Handle case where response exists but success is false
        return { success: false, error: response?.error || 'Unknown server error' };
      }
    } catch (error) {
      this.config.onError('Error during cloud sync', error);
      return { success: false, error };
    }
  }
  /**
   * Calculate metrics about the changes made
   * @private
   */
  _calculateChangeMetrics(newContent) {
    const previousContent = this.state.lastContent;
    
    // If no previous content, consider it a significant change
    if (!previousContent) {
      return {
        hasChanged: true,
        changeSize: newContent.length,
        isSignificant: true
      };
    }
    
    // Simple change detection
    const hasChanged = !isEqual(previousContent, newContent);
    
    // Calculate change size (character difference)
    // In a real implementation, you'd use a proper diff algorithm
    const changeSize = Math.abs(newContent.length - previousContent.length);
    
    // Determine if this is a significant change
    const isSignificant = changeSize >= this.config.significantChangeThreshold;
    
    return {
      hasChanged,
      changeSize,
      isSignificant
    };
  }
  
  /**
   * Determine if a cloud sync should be triggered
   * @private
   */
  _shouldTriggerCloudSync(changeMetrics) {
    // Always sync for significant changes
    if (changeMetrics.isSignificant) {
      return true;
    }
    
    // Check if we're past the minimum threshold for a sync
    if (changeMetrics.changeSize < this.config.minChangeThreshold) {
      return false;
    }
    
    // Check time-based thresholds
    const timeSinceLastSync = this.state.lastCloudSync ? 
      Date.now() - this.state.lastCloudSync : Infinity;
      
    // If it's been a while since sync, do it now
    if (timeSinceLastSync > this.config.cloudSyncDelay * 2) {
      return true;
    }
    
    // Consider consecutive changes - sync if multiple small changes add up
    if (this.state.consecutiveChanges > 10) {
      return true;
    }
    
    // Consider user patterns (if adaptive timing is enabled)
    if (this.config.adaptiveTiming && this.state.userPatterns.sessionCount > 5) {
      // If user typically stops editing after this much activity, sync proactively
      if (this.state.consecutiveChanges > this.state.userPatterns.avgEditSessionLength * 0.8) {
        return true;
      }
    }
    
    // Default to false - let the normal debounced sync handle it
    return false;
  }
  
  /**
   * Ensure max sync delay is not exceeded
   * @private
   */
  _ensureMaxSyncDelay(pageId, content) {
    // If we already have a forced sync scheduled, do nothing
    if (this.state.forceSyncScheduled) {
      return;
    }
    
    // Calculate time since last sync
    const timeSinceLastSync = this.state.lastCloudSync ? 
      Date.now() - this.state.lastCloudSync : Infinity;
    
    // Calculate time remaining before we hit max delay
    const timeUntilForceSync = Math.max(0, this.config.maxSyncDelay - timeSinceLastSync);
    
    // Schedule a forced sync if we have pending changes
    if (this.state.pendingChanges) {
      this.state.forceSyncScheduled = true;
      
      this.forceSyncTimer = setTimeout(() => {
        // Only sync if we still have pending changes when the timer fires
        if (this.state.pendingChanges) {
          this._performCloudSync(pageId, content);
        }
        this.state.forceSyncScheduled = false;
      }, timeUntilForceSync);
    }
  }
  
  /**
   * Prepare differential sync data
   * @private
   */
  _prepareDifferentialSync(content) {
    // In a real implementation, you'd use a proper diff algorithm
    // This is a simplified placeholder
    if (!this.state.lastContent) {
      return { fullSync: true, data: content };
    }
    
    // Just a placeholder - in a real implementation you'd use something
    // like Myers diff algorithm or Google's diff-match-patch
    const simpleDiff = {
      oldLength: this.state.lastContent.length,
      newLength: content.length,
      // In reality, you'd compute actual changes here
    };
    
    return {
      fullSync: false,
      basedOn: this.state.lastCloudSync,
      diff: simpleDiff
    };
  }

  /**
 * Prepare sync data using timestamp-based approach
 * @private
 */
_prepareTimestampBasedSync(pageId, content) {
  // Get the document's last sync timestamp from server/storage
  const serverTimestamp = this.serverDocumentTimestamps[pageId] || 0;
  const localTimestamp = this.state.lastCloudSync || 0;
  
  // Calculate if this is a first-time sync for this page
  const isFirstSync = !this.serverDocumentTimestamps.hasOwnProperty(pageId);

  // Include metadata about document
  const metadata = {
    localTimestamp: localTimestamp,
    contentHash: this._calculateContentHash(content),
    contentLength: content.length,
    isFirstSync: isFirstSync
  };
  
  // If server has newer version, we might need to handle conflicts
  // This would be determined by the server during sync
  
  return {
    pageId,
    metadata,
    content,  // Always include full content
    requireFullSync: isFirstSync || serverTimestamp > localTimestamp
  };
}

/**
 * Calculate a hash of content for quick comparison
 * @private
 */
_calculateContentHash(content) {
  // Simple hash function for demonstration
  // In production, use a proper hash function like SHA-256
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(16);
}
  
  /**
   * Track user activity patterns
   * @private
   */
  _trackActivity() {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivityTime;
    
    // Consider user inactive after 1 minute without activity
    const isCurrentlyActive = timeSinceLastActivity < 60000;
    
    if (isCurrentlyActive) {
      this.state.editorActiveTime += 5; // 5 seconds since we check every 5s
    } else {
      this.state.editorInactiveTime += 5;
      
      // If user just became inactive and we have pending changes, sync now
      if (this.state.editorActiveTime > 0 && this.state.pendingChanges) {
        // End of editing session detected, trigger sync
        this.debouncedCloudSync.flush();
      }
    }
  }
  
  /**
   * Update adaptive timing based on user behavior
   * @private
   */
  _updateAdaptiveTiming() {
    // Only update if we have enough history
    if (this.state.changeHistory.length < 5) {
      return;
    }
    
    // Process change history to identify patterns
    let totalSessionLength = 0;
    let totalChanges = 0;
    let totalTimeBetween = 0;
    let sessionCount = 0;
    
    // Group changes into sessions (changes separated by less than 5 min)
    let currentSession = [];
    let sessions = [];
    
    this.state.changeHistory.forEach((change, index) => {
      if (index === 0) {
        currentSession = [change];
      } else {
        const prevChange = this.state.changeHistory[index - 1];
        const timeDiff = change.timestamp - prevChange.timestamp;
        
        if (timeDiff < 300000) { // 5 minutes
          // Part of current session
          currentSession.push(change);
        } else {
          // New session
          if (currentSession.length > 0) {
            sessions.push(currentSession);
          }
          currentSession = [change];
        }
      }
      
      totalChanges += change.changeSize;
    });
    
    // Add the last session if not empty
    if (currentSession.length > 0) {
      sessions.push(currentSession);
    }
    
    // Calculate session metrics
    sessionCount = sessions.length;
    
    sessions.forEach(session => {
      totalSessionLength += session.length;
      
      // Calculate average time between changes in this session
      if (session.length > 1) {
        for (let i = 1; i < session.length; i++) {
          totalTimeBetween += session[i].timestamp - session[i-1].timestamp;
        }
      }
    });
    
    // Update user patterns
    if (sessionCount > 0) {
      this.state.userPatterns = {
        avgEditSessionLength: totalSessionLength / sessionCount,
        avgTimeBetweenEdits: totalTimeBetween / (totalSessionLength - sessionCount),
        typicalChangeSize: totalChanges / totalSessionLength,
        sessionCount
      };
      
      // Adaptively adjust save/sync timings
      this._adjustTimings();
    }
  }
  
  /**
   * Adjust timings based on observed user behavior
   * @private
   */
  _adjustTimings() {
    const patterns = this.state.userPatterns;
    
    // Only adjust if we have enough data
    if (patterns.sessionCount < 3) return;
    
    // Adjust local save delay based on typing speed
    // Fast typers get longer debounce to avoid interruptions
    if (patterns.avgTimeBetweenEdits < 1000) {
      // User types quickly, increase local save delay
      this.config.localSaveDelay = Math.min(2000, patterns.avgTimeBetweenEdits * 2);
    } else if (patterns.avgTimeBetweenEdits > 5000) {
      // User types slowly, decrease local save delay
      this.config.localSaveDelay = Math.max(500, patterns.avgTimeBetweenEdits / 5);
    }
    
    // Adjust cloud sync timing based on session length
    if (patterns.avgEditSessionLength < 10) {
      // Short editing sessions, sync more quickly
      this.config.cloudSyncDelay = Math.max(10000, patterns.avgEditSessionLength * 1000);
    } else if (patterns.avgEditSessionLength > 50) {
      // Long editing sessions, can wait longer to sync
      this.config.cloudSyncDelay = Math.min(60000, patterns.avgEditSessionLength * 500);
    }
    
    // Update debounced functions with new timings
    this.debouncedLocalSave = debounce(
      this._performLocalSave.bind(this), 
      this.config.localSaveDelay
    );
    
    this.debouncedCloudSync = debounce(
      this._performCloudSync.bind(this), 
      this.config.cloudSyncDelay
    );
  }
  
  /**
   * Get current state metrics
   */
  getMetrics() {
    return {
      lastLocalSave: this.state.lastLocalSave,
      lastCloudSync: this.state.lastCloudSync,
      pendingChanges: this.state.pendingChanges,
      consecutiveChanges: this.state.consecutiveChanges,
      userPatterns: this.state.userPatterns,
      timing: {
        localSaveDelay: this.config.localSaveDelay,
        cloudSyncDelay: this.config.cloudSyncDelay,
        maxSyncDelay: this.config.maxSyncDelay
      }
    };
  }
}



// Example implementation of syncing system
const createSmartSyncManager = (noteTextStorage, appMetadataStorage, options = {}) => {
  const eventEmitter = new Emitter();

  // Create a smart sync instance
  const syncManager = new SmartSync({
    // Configure save and sync handlers
    onLocalSave: async (pageId, content) => {
      const normalizedId = normalizePageId(pageId);
      if (!normalizedId || !content) return;
      
      await noteTextStorage.savePage(normalizedId, content, options?.vaultKey || null); // Vault key omitted for example

      // Emit an event when local save is complete
      eventEmitter.emit('localSaveComplete');

      return true;
    },
    // pageId, content, diffData, isDeleteOperation
    onCloudSync: async (pageId, metadata, isDeleteOperation = false) => {
      const syncFn = options.onCloudSync || syncDexieToFirestore;
      try {
        console.log("SYNC MANAGER HANDLE PAGE DELECTION SYNC CLOUD: ", isDeleteOperation)
        const result = await syncFn(pageId, metadata, isDeleteOperation); // Pass parameters
        return { success: result?.success, error: result?.error }; // Return consistent format
      } catch (error) {
        console.error("Cloud sync error:", error);
        return { success: false, error: error };
      }
    },
    
    // Get timezone function
    getTimezone: async () => {
      let storedTimezone = await appMetadataStorage.getItem('selectedTimezone');
      return storedTimezone || dayjs.tz.guess();
    },
    
    // Configure timing (all in milliseconds)
    localSaveDelay: 5000,        // 1 second for local saves
    cloudSyncDelay: 30000,       // 30 seconds for cloud sync
    maxSyncDelay: 300000,        // 5 minutes maximum before forcing sync
    
    // Change detection thresholds
    minChangeThreshold: 10,           // Minimum characters to consider a save
    significantChangeThreshold: 100,  // Chars threshold for immediate sync
    
    // Enable adaptive behavior
    adaptiveTiming: true,
    collectMetrics: true
  }, eventEmitter); // <-- Pass the factory's emitter here!
  
  return {
    // Handle content changes
    handleContentChange: (pageId, content) => syncManager.handleContentChange(pageId, content),
    
    // Force immediate sync
    forceSync: (pageId, content) => syncManager.forceSync(pageId, content),
    
    // Handle editor closing
    prepareClose: (pageId, content) => syncManager.prepareClose(pageId, content),
    
    handlePageDeletion: (pageId) => syncManager.handlePageDeletion(pageId),

    // Get metrics
    getMetrics: () => syncManager.getMetrics(),

    syncAll: (options) => syncManager.syncAll(options),
    // Expose event emitter for listening to sync events
    on: (eventName, listener) => eventEmitter.on(eventName, listener),
    off: (eventName, listener) => eventEmitter.off(eventName, listener),
  };
};

// Demo of usage
const initializeEditor = async (noteTextStorage, appMetadataStorage) => {
  // Create sync manager
  const syncManager = createSmartSyncManager(noteTextStorage, appMetadataStorage);
  
  // Use in your editor's change handler
  const handleEditorChange = async (pageId, content) => {
    const result = await syncManager.handleContentChange(pageId, content);
    
    // Update UI based on result if needed
    if (result.savedLocally) {
      // Maybe update a "saved" indicator
    }
    
    if (result.scheduledForSync) {
      // Maybe update a "syncing" indicator
    }
  };
  
  // Use when user explicitly requests sync
  const handleSyncButton = async (pageId, content) => {
    await syncManager.forceSync(pageId, content);
    // Update UI to show sync completed
  };
  
  // Use when editor is closing
  const handleEditorClose = async (pageId, content) => {
    await syncManager.prepareClose(pageId, content);
    // Safe to close now
  };
  
  return {
    handleEditorChange,
    handleSyncButton,
    handleEditorClose
  };
};

// Helper functions
const normalizePageId = (pageId) => {
  // Your existing normalization logic
  return pageId ? String(pageId).trim() : null;
};

export { createSmartSyncManager, initializeEditor };