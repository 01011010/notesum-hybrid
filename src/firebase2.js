// src/firebase.js
import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    onAuthStateChanged, 
    isSignInWithEmailLink, // Import for email link check
    signInWithEmailLink, // Import for email link sign-in
    linkWithCredential, // Import for linking email
    EmailAuthProvider // Import for creating email credential 
} from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, Timestamp, orderBy, writeBatch, limit } from "firebase/firestore";
import { noteTextStorage, appMetadataStorage } from '../src/utils/noteTextStorage';
import { encryptData, decryptData, generateKeyFromPassphrase } from "./utils/cryptoUtils";
import { v4 as uuidv4 } from "uuid"; // Add this dependency for sync job IDs

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const DELETED_PAGES_COLLECTION = 'deletedPages';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);
const db = getFirestore(app);

let notified = false;
let userVaultKey = null;
let key = null;

// Sync configuration constants
const SYNC_CONFIG = {
    BATCH_SIZE: 20,             // Number of documents per batch operation
    MAX_RETRIES: 5,             // Maximum number of retry attempts
    BASE_RETRY_DELAY: 200,      // Base delay for exponential backoff (ms)
    SYNC_PAGE_LIMIT: 50,        // Maximum number of documents to fetch in one query
    ERROR_LOG_LIMIT: 100,       // Maximum number of errors to store in error log
    RECOVERY_INTERVAL: 60 * 1000, // Interval to attempt recovery of failed syncs (1 minute)
    PROGRESS_UPDATE_INTERVAL: 500 // How often to update progress (ms)
};

// Sync state tracking
const syncState = {
    inProgress: false,
    currentJobId: null,
    totalItems: 0,
    processedItems: 0,
    startTime: null,
    failedItems: [],
    resumeToken: null,
    errorLog: new Map(),
    aborted: false,
    syncProgress: {
        phase: null, // "uploading", "downloading", "deleting"
        currentBatch: 0,
        totalBatches: 0
    }
};

/**
 * Vault management functions
 */
async function unlockUserVault(passphrase) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        // Retrieve encrypted key from Firestore
        const encryptedKey = await getEncryptedKeyFromFirestore(user.uid);
        if (!encryptedKey) {
            console.warn("No encryption key found for user");
            return false;
        }

        // Try to decrypt the key using the entered passphrase
        key = await generateKeyFromPassphrase(passphrase);
        const decryptedKey = await decryptData(key, encryptedKey);

        if (decryptedKey) {
            userVaultKey = decryptedKey;
            return decryptedKey;
        } else {
            return false;
        }
    } catch (error) {
        console.error("Vault Unlock Error:", error);
        logSyncError("vault_unlock", null, error);
        return false;
    }
}

function lockUserVault() {
    userVaultKey = null;
    key = null;
}

async function uploadTombstone(userId, pageId) {
    try {
        const tombstoneRef = collection(db, "users", userId, "deletedPages");
        const pageRef = doc(tombstoneRef, pageId);
            
        await setDoc(pageRef, { // Use doc() to auto-generate ID
            userId: userId,
            pageId: pageId,
            deletedAt: Timestamp.now(),
        });
        console.log(`Tombstone uploaded for page: ${pageId}`);
    } catch (error) {
        console.error('Error uploading tombstone:', error);
        // Handle error appropriately (e.g., retry mechanism)
    }
}

async function fetchNewTombstones(userId, lastSyncTime) {
    try {
        const q = query(
            collection(db, "users", userId, "deletedPages"),
            where('deletedAt', '>', lastSyncTime ? Timestamp.fromDate(new Date(lastSyncTime)) : Timestamp.fromDate(new Date(0))), // Fetch tombstones created after last sync
            orderBy('deletedAt')
        );
        const querySnapshot = await getDocs(q);
        const tombstones = [];
        querySnapshot.forEach((doc) => {
            tombstones.push({ pageId: doc.data().pageId, deletedAt: doc.data().deletedAt.toDate() });
        });
        return tombstones;
    } catch (error) {
        console.error('Error fetching new tombstones:', error);
        return [];
    }
}

async function processRemoteDeletions(userId) {
    try {
        const lastSyncTime = await appMetadataStorage.getItem("lastSyncTime") || "1970-01-01T00:00:00Z";
        const newTombstones = await fetchNewTombstones(userId, lastSyncTime);

        if (newTombstones && newTombstones.length > 0) {
            console.log('Processing new tombstones:', newTombstones);
            for (const tombstone of newTombstones) {
                try {
                    await noteTextStorage.pages.delete(tombstone.pageId);
                    console.log(`Processed tombstone, deleted page locally: ${tombstone.pageId}`);
                } catch (error) {
                    console.error(`Error deleting page ${tombstone.pageId} from tombstone:`, error);
                    logSyncError("process_tombstone_delete", tombstone.pageId, error);
                }
            }
            // Optionally, update lastSyncTime here after processing tombstones
            // or let the main sync function handle it.
        } else {
            console.log('No new tombstones to process.');
        }
    } catch (error) {
        console.error('Error processing remote deletions:', error);
        logSyncError("fetch_tombstones", null, error);
    }
}

/**
 * Main sync function with enhanced error handling, retry mechanisms, and checkpointing
 */
const syncDexieToFirestore = async (pageId = null, metadata = null, isDeleteOperation = false) => {
    // Skip if already syncing
    if (syncState.inProgress) {
        console.log("Sync already in progress. Skipping new sync request.");
        return { success: false, reason: "SYNC_IN_PROGRESS" };
    }
    
    // Basic validation
    const user = auth.currentUser;
    if (!user) {
        if (!notified) {
            console.warn("User not authenticated, skipping sync.");
            notified = true;
        }
        return { success: false, reason: "NOT_AUTHENTICATED" };
    }

    // User is logged in, reset notified flag
    notified = false;
    const userId = user.uid;

    // Check if we have the vault key in memory
    if (!userVaultKey) {
        console.warn("Vault is locked. Please unlock the vault before syncing.");
        return { success: false, reason: "VAULT_LOCKED" };
    }

    // Initialize sync state
    resetSyncState();
    syncState.inProgress = true;
    syncState.currentJobId = uuidv4();
    syncState.startTime = Date.now();
    
    try {
        if(isDeleteOperation) {
            uploadTombstone(userId, pageId);
        }
        // Check for pending sync jobs to resume
        const pendingSync = await appMetadataStorage.getItem("pendingSyncJob");
        if (pendingSync && !syncState.aborted) {
            await resumeSyncJob(pendingSync, userId);
        } else {
            // Start fresh sync job
            await startNewSyncJob(userId);
        }
        
        // Clear any pending sync job if we've completed successfully
        await appMetadataStorage.removeItem("pendingSyncJob");
        await appMetadataStorage.setItem("lastSyncTime", new Date().toISOString());
        await appMetadataStorage.setItem("lastSuccessfulSync", {
            timestamp: new Date().toISOString(),
            duration: Date.now() - syncState.startTime,
            itemsProcessed: syncState.processedItems
        });
        if(syncState.processedItems > 0) {
            console.log(`Sync completed successfully. Processed ${syncState.processedItems} items in ${(Date.now() - syncState.startTime) / 1000}s`);
        }
        return { success: true, stats: getCompletionStats() };
    } catch (error) {
        console.error("Sync failed:", error);
        
        // Save checkpoint for later resume
        await saveCheckpoint();
        
        // Schedule recovery if appropriate
        scheduleRecovery();
        
        return { success: false, reason: "SYNC_ERROR", error: error.message };
    } finally {
        syncState.inProgress = false;
    }
};

/**
 * Starts a completely new sync job
 * @param {string} userId - Current user ID
 */
async function startNewSyncJob(userId) {
    const userPagesRef = collection(db, "users", userId, "pages");
    const pendingSync = await appMetadataStorage.getItem("pendingSyncJob");
    if (pendingSync && !syncState.aborted) {
        await resumeSyncJob(pendingSync, userId);
    } else {
        try {
            
            // Phase 4: Download and process tombstones
            await processRemoteDeletions(userId);

            // Phase 2: Upload from Dexie to Firestore
            await uploadFromDexieToFirestore(userId, userPagesRef);

            // Phase 3: Handle deletions
            await handleDeletions(userId, userPagesRef);
            
            // Phase 1: Download from Firestore to Dexie
            await downloadFromFirestore(userId, userPagesRef);
            
            
        } catch (error) {
            logSyncError("sync_job", null, error);
            throw error;
        }
    }
}

/**
 * Resume a previously interrupted sync job
 * @param {Object} pendingSync - Saved checkpoint data
 * @param {string} userId - Current user ID
 */
async function resumeSyncJob(pendingSync, userId) {
    console.log("Resuming interrupted sync job", pendingSync.jobId);
    
    // Restore sync state from checkpoint
    syncState.resumeToken = pendingSync.resumeToken;
    syncState.processedItems = pendingSync.processedItems || 0;
    syncState.totalItems = pendingSync.totalItems || 0;
    syncState.failedItems = pendingSync.failedItems || [];
    
    const userPagesRef = collection(db, "users", userId, "pages");
    
    // Resume from the appropriate phase
    try {
        switch(pendingSync.phase) {
            case "downloading":
                await processRemoteDeletions(userId);    
                await uploadFromDexieToFirestore(userId, userPagesRef);    
                await handleDeletions(userId, userPagesRef);
                await downloadFromFirestore(userId, userPagesRef, pendingSync.resumeToken);
                break;
                
            case "uploading":
                await uploadFromDexieToFirestore(userId, userPagesRef, pendingSync.resumeToken);
                await handleDeletions(userId, userPagesRef);
                break;
                
            case "deleting":
                await handleDeletions(userId, userPagesRef, pendingSync.resumeToken);
                break;
                
            default:
                console.warn("Unknown sync phase in checkpoint, starting fresh sync");
                await startNewSyncJob(userId);
        }
    } catch (error) {
        logSyncError("resume_sync", null, error);
        throw error;
    }
}

/**
 * Download data from Firestore to local Dexie DB with pagination
 * @param {string} userId - Current user ID
 * @param {CollectionReference} userPagesRef - Firestore collection reference
 * @param {string} resumeToken - Optional cursor for resuming downloads
 */
async function downloadFromFirestore(userId, userPagesRef, resumeToken = null) {
    updateSyncProgress("downloading", 0, 0);
    
    let lastSyncTime = await appMetadataStorage.getItem("lastSyncTime") || "1970-01-01T00:00:00Z";
    let lastDocId = resumeToken;
    let hasMoreDocs = true;
    let totalDownloadedbatches = 0;
    
    while (hasMoreDocs && !syncState.aborted) {
        if (await checkVaultLock()) return; // Check if vault is locked
        try {
            // Build query with pagination support
            let baseQuery = query(
                userPagesRef, 
                where("lastModified", ">", lastSyncTime),
                orderBy("lastModified"),
                limit(SYNC_CONFIG.SYNC_PAGE_LIMIT)
            );
            
            // Apply cursor if resuming
            if (lastDocId) {
                const lastDocRef = doc(userPagesRef, lastDocId);
                const lastDocSnap = await getDoc(lastDocRef);
                if (lastDocSnap.exists()) {
                    baseQuery = query(baseQuery, where("__id", ">", lastDocId));
                }
            }
            
            // Execute query
            const querySnapshot = await executeWithRetry(() => getDocs(baseQuery));
            
            if (querySnapshot.empty) {
                hasMoreDocs = false;
                continue;
            }
            
            totalDownloadedbatches++;
            updateSyncProgress("downloading", totalDownloadedbatches, null);
            
            // Process documents in smaller batches for memory efficiency
            const docs = querySnapshot.docs;
            syncState.totalItems += docs.length;
            
            for (let i = 0; i < docs.length; i += SYNC_CONFIG.BATCH_SIZE) {
                const batch = docs.slice(i, i + SYNC_CONFIG.BATCH_SIZE);
                await processDownloadBatch(batch);
                
                // Update resume token to the last processed document
                lastDocId = batch[batch.length - 1].id;
                await saveResumeCheckpoint("downloading", lastDocId);
            }
            
            // Check if we've reached the end
            if (docs.length < SYNC_CONFIG.SYNC_PAGE_LIMIT) {
                hasMoreDocs = false;
            }
        } catch (error) {
            logSyncError("download_batch", lastDocId, error);
            
            // Allow retry mechanism to handle this
            const retryResult = await handleSyncRetry("downloading", lastDocId);
            if (!retryResult) {
                throw new Error(`Failed to download data from Firestore: ${error.message}`);
            }
        }
    }
}

/**
 * Process a batch of downloaded documents
 * @param {Array} docBatch - Array of Firestore document snapshots
 */
// Process a batch of downloaded documents
async function processDownloadBatch(docBatch) {
    for (const docSnapshot of docBatch) {
        // Check if sync has been aborted
        if (syncState.aborted) {
            console.log("Sync aborted during download batch processing");
            break;
        }
        if (await checkVaultLock()) return; // Check if vault is locked
        try {
            const firestorePage = docSnapshot.data();
            const firestorePageId = docSnapshot.id;
            
            // Skip if already processed in this sync
            if (syncState.failedItems.includes(firestorePageId)) {
                continue;
            }
            
            const dexiePage = await noteTextStorage.pages.get(firestorePageId);
            
            // Prepare content - decrypt if needed
            let decryptedContent = firestorePage.content || "";
            
            if (firestorePage.isEncrypted && firestorePage.content) {
                try {
                    decryptedContent = await decryptData(key, firestorePage.content);
                } catch (error) {
                    logSyncError("decrypt_error", firestorePageId, error);
                    syncState.failedItems.push(firestorePageId);
                    continue;
                }
            }
            
            if (!dexiePage) {
                await noteTextStorage.createPageFromFirestore({
                    // Base information
                    id: firestorePageId,
                    name: firestorePage.name,
                    order: firestorePage.order,
                    // Timestamps
                    createdAt: firestorePage.createdAt,
                    lastModified: firestorePage.lastModified,
                    lastSynced: firestorePage.lastSynced,
                    // Content
                    content: decryptedContent,
                    isEncrypted: firestorePage.isEncrypted || 0,
                    // Sync state
                    pendingSync: firestorePage.pendingSync || 0,
                    syncStatus: firestorePage.syncStatus || 'synced',
                    
                });
            } else if (shouldMergePages(dexiePage, firestorePage)) {
                // Intelligent merge based on changes
                await mergeAndSavePages(dexiePage, firestorePage, decryptedContent);
            }
            
            syncState.processedItems++;
            updateProgressCounter();
        } catch (error) {
            logSyncError("process_download", docSnapshot.id, error);
            syncState.failedItems.push(docSnapshot.id);
        }
    }
}

/**
 * Upload data from Dexie to Firestore with chunking
 * @param {string} userId - Current user ID
 * @param {CollectionReference} userPagesRef - Firestore collection reference
 * @param {string} resumeToken - Optional token for resuming uploads
 */
async function uploadFromDexieToFirestore(userId, userPagesRef, resumeToken = null) {
    updateSyncProgress("uploading", 0, 0);
    
    try {
        // Get all pages that need syncing
        let pendingPages;
        
        if (resumeToken) {
            pendingPages = await noteTextStorage.pages
                .where("id").above(resumeToken)
                .and(page => page.pendingSync === 1)
                .toArray();
        } else {
            pendingPages = await noteTextStorage.pages
                .where("pendingSync").equals(1)
                .toArray();
        }
        
        if (pendingPages.length === 0) {
            console.log("No pages to upload");
            return;
        }
        
        syncState.totalItems += pendingPages.length;
        
        // Process in manageable chunks
        const totalBatches = Math.ceil(pendingPages.length / SYNC_CONFIG.BATCH_SIZE);
        updateSyncProgress("uploading", 0, totalBatches);
        
        for (let i = 0; i < pendingPages.length && !syncState.aborted; i += SYNC_CONFIG.BATCH_SIZE) {
            if (await checkVaultLock()) return; // Check if vault is locked
            const currentBatch = pendingPages.slice(i, i + SYNC_CONFIG.BATCH_SIZE);
            /* Old approach
            await processUploadBatch(currentBatch, userPagesRef);
            // Update checkpoint
            const lastPageId = currentBatch[currentBatch.length - 1].id;
            await saveResumeCheckpoint("uploading", lastPageId);
            */

            // New approach
            const lastProcessedId = await processUploadBatch(currentBatch, userPagesRef);
            // Update checkpoint with the ID of the last successfully processed item in the batch
            if (lastProcessedId) {
                await saveResumeCheckpoint("uploading", lastProcessedId);
            }
            
            updateSyncProgress("uploading", Math.floor(i / SYNC_CONFIG.BATCH_SIZE) + 1, totalBatches);
        }
    } catch (error) {
        logSyncError("upload_pages", resumeToken, error);
        throw new Error(`Failed to upload pages to Firestore: ${error.message}`);
    }
}

/**
 * Process a batch of pages to upload to Firestore
 * @param {Array} pageBatch - Array of pages to upload
 * @param {CollectionReference} userPagesRef - Firestore collection reference
 */
async function processUploadBatch(pageBatch, userPagesRef) {
    const batch = writeBatch(db);
    const dexieBatchUpdates = [];
    let lastSuccessfulId = null;
    
    try {
        for (const page of pageBatch) {
            if (await checkVaultLock()) return null; // Check if vault is locked
            if (syncState.failedItems.includes(page.id)) {
                continue; // Skip already failed items
            }
            
            const pageRef = doc(userPagesRef, page.id);
            
            try {
                // Create a copy of the page to avoid modifying the original
                const pageToUpload = { ...page };
                
                // Encrypt the content before uploading
                pageToUpload.content = await encryptData(key, page.content);
                pageToUpload.isEncrypted = 1;
                pageToUpload.lastModified = page.lastModified || new Date().toISOString();
                
                batch.set(pageRef, pageToUpload, { merge: true });
                dexieBatchUpdates.push(page.id);
                lastSuccessfulId = page.id; // Update last successful ID
            } catch (error) {
                logSyncError("prepare_upload", page.id, error);
                syncState.failedItems.push(page.id);
            }
        }
        
        // Only commit if there are changes
        if (dexieBatchUpdates.length > 0) {
            await commitBatchWithRetry(batch);
            
            // Update Dexie with sync status
            await Promise.all(dexieBatchUpdates.map(id => 
                noteTextStorage.pages.update(id, { 
                    pendingSync: 0,
                    syncStatus: 'synced',
                    lastSynced: new Date().toISOString()
                })
            ));
            
            syncState.processedItems += dexieBatchUpdates.length;
            updateProgressCounter();
        }
        return lastSuccessfulId; // Return the ID of the last successful item
    } catch (error) {
        // If the batch fails, mark all pages as failed
        syncState.failedItems.push(...pageBatch.map(page => page.id));
        logSyncError("upload_batch", null, error);
        
        // Let retry mechanism handle this
        const retryResult = await handleSyncRetry("uploading", pageBatch[0].id);
        if (!retryResult) {
            throw error;
        }
        return null;
    }
}

// Updated deletion handler function
async function handleDeletions(userId, userPagesRef, resumeToken = null) {
    updateSyncProgress("deleting", 0, 0);
    
    try {
        // Get deleted page IDs from metadata storage
        const deletedPageIds = await appMetadataStorage.getDeletedPageIds();
        
        // If we have no deleted pages, there's nothing to do
        if (deletedPageIds.size === 0) {
            console.log("No pages marked for deletion");
            return;
        }
        
        syncState.totalItems += deletedPageIds.size;
        
        // Process deletions in batches
        const pagesToDelete = Array.from(deletedPageIds);
        const totalBatches = Math.ceil(pagesToDelete.length / SYNC_CONFIG.BATCH_SIZE);
        updateSyncProgress("deleting", 0, totalBatches);
        
        const processedIds = new Set();
        
        for (let i = 0; i < pagesToDelete.length && !syncState.aborted; i += SYNC_CONFIG.BATCH_SIZE) {
            if (await checkVaultLock()) return; // Check if vault is locked
            const batch = writeBatch(db);
            const currentBatch = pagesToDelete.slice(i, i + SYNC_CONFIG.BATCH_SIZE);
            
            for (const pageId of currentBatch) {
                if (syncState.failedItems.includes(pageId)) {
                    continue; // Skip failed items
                }
                
                const pageRef = doc(userPagesRef, pageId);
                batch.delete(pageRef);
                processedIds.add(pageId);
            }
            
            await commitBatchWithRetry(batch);
            
            syncState.processedItems += currentBatch.length;
            updateProgressCounter();
            
            // Update progress
            updateSyncProgress("deleting", Math.floor(i / SYNC_CONFIG.BATCH_SIZE) + 1, totalBatches);
        }
        
        // Clear successfully deleted pages from our tracking
        for (const pageId of processedIds) {
            await appMetadataStorage.clearDeletedPageId(pageId);
        }
        
    } catch (error) {
        logSyncError("handle_deletions", resumeToken, error);
        throw new Error(`Failed to process deletions: ${error.message}`);
    }
}

/**
 * Intelligent merge strategies for conflict resolution
 */

// Determine if pages should be merged based on changes
function shouldMergePages(localPage, remotePage) {
    // Prioritize local pages with pending sync
    if (localPage.pendingSync === 1) {
        // If local has unsynced changes, we should consider a merge if the remote is different
        if (localPage.content !== remotePage.content ||
            localPage.name !== remotePage.name ||
            localPage.order !== remotePage.order) {
            return true;
        }
        return false; // Local has pending sync, and remote is the same, no need to merge on download
    }
        
    // Check if there's a significant time difference
    const localTime = new Date(localPage.lastModified);
    const remoteTime = new Date(remotePage.lastModified);
    const timeDiff = Math.abs(localTime - remoteTime);
    
    // If one is significantly newer, prefer that one
    if (timeDiff > 60000) { // 1 minute difference
        return true;
    }
    
    // Check if there are actual content differences
    if (localPage.content !== remotePage.content) {
        return true;
    }
    
    // Check if metadata changed
    if (localPage.name !== remotePage.name || localPage.order !== remotePage.order) {
        return true;
    }
    
    return false;
}

// Merge and save pages using intelligent merge strategy
async function mergeAndSavePages(localPage, remotePage, decryptedRemoteContent) {
    try {
        const localTime = new Date(localPage.lastModified);
        const remoteTime = new Date(remotePage.lastModified);
        
        // Prepare merged page
        const mergedPage = { ...localPage };
        
        // Content merge strategy
        if (remoteTime > localTime) {
            // Remote is newer, but check for potential conflicts
            if (localPage.pendingSync === 1) {
                // Local has unsaved changes, do a smart merge
                if (decryptedRemoteContent !== localPage.content) {
                    // Simple merge strategy - keep longest content
                    mergedPage.content = decryptedRemoteContent.length > localPage.content.length ? 
                        decryptedRemoteContent : localPage.content;
                    
                    // Mark for re-sync to ensure changes propagate
                    mergedPage.pendingSync = 1;
                }
            } else {
                // No local changes, take remote content
                mergedPage.content = decryptedRemoteContent;
            }
            
            // Take remote metadata
            mergedPage.name = remotePage.name;
            mergedPage.order = remotePage.order;
            mergedPage.lastModified = remotePage.lastModified;
        } else {
            // Local is newer or same age, keep local content
            // But take any metadata changes from remote
            if (remotePage.name && remotePage.name !== localPage.name) {
                mergedPage.name = remotePage.name;
                mergedPage.pendingSync = 1; // Mark for sync to push name change
            }
            
            if (remotePage.order && remotePage.order !== localPage.order) {
                mergedPage.order = remotePage.order;
                mergedPage.pendingSync = 1; // Mark for sync to push order change
            }
        }
        
        // Save merged page
        await noteTextStorage.savePage(localPage.id, mergedPage.content, {
            name: mergedPage.name,
            order: mergedPage.order,
            pendingSync: mergedPage.pendingSync,
            lastModified: mergedPage.lastModified,
            syncStatus: 'merged'
        });
        
        // Log the merge operation
        console.log(`Merged page ${localPage.id} with strategy: ${remoteTime > localTime ? 'remote-priority' : 'local-priority'}`);
    } catch (error) {
        logSyncError("merge_operation", localPage.id, error);
        syncState.failedItems.push(localPage.id);
        throw new Error(`Failed to merge page ${localPage.id}: ${error.message}`);
    }
}

/**
 * Helper functions for sync operations
 */

// Commit a Firestore batch with retries and exponential backoff
async function commitBatchWithRetry(batch, maxRetries = SYNC_CONFIG.MAX_RETRIES) {
    return executeWithRetry(() => batch.commit(), maxRetries);
}

// General retry mechanism with exponential backoff
async function executeWithRetry(operation, maxRetries = SYNC_CONFIG.MAX_RETRIES) {
    let attempt = 0;
    let lastError = null;

    while (attempt < maxRetries) {
        try {
            return await operation();
        } catch (error) {
            attempt++;
            lastError = error;
            console.error(`Operation failed (Attempt ${attempt}/${maxRetries}):`, error);
            
            if (attempt >= maxRetries) {
                console.error("Max retries reached. Operation failed.");
                throw error;
            }
            
            // Exponential backoff with jitter
            const baseDelay = SYNC_CONFIG.BASE_RETRY_DELAY;
            const maxJitter = 0.3 * baseDelay;
            const jitter = Math.floor(Math.random() * maxJitter);
            const exponentialDelay = Math.pow(2, attempt) * baseDelay;
            const delay = exponentialDelay + jitter;
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // This should never be reached, but just in case
    throw lastError || new Error("Operation failed after retries");
}

// Handle retry for a specific sync phase
async function handleSyncRetry(phase, resumeToken) {
    // Save current checkpoint for potential recovery
    await saveResumeCheckpoint(phase, resumeToken);
    
    // Return true to continue, false to abort
    return !syncState.aborted;
}

// Save a checkpoint for the current sync operation
async function saveCheckpoint() {
    const checkpoint = {
        jobId: syncState.currentJobId,
        phase: syncState.syncProgress.phase,
        resumeToken: syncState.resumeToken,
        processedItems: syncState.processedItems,
        totalItems: syncState.totalItems,
        failedItems: syncState.failedItems,
        timestamp: new Date().toISOString()
    };
    
    await appMetadataStorage.setItem("pendingSyncJob", checkpoint);
    return checkpoint;
}

// Save a resume token for the current phase
async function saveResumeCheckpoint(phase, token) {
    syncState.syncProgress.phase = phase;
    syncState.resumeToken = token;
    
    // Only save to storage occasionally to reduce storage operations
    if (Math.random() < 0.2) {
        await saveCheckpoint();
    }
}

// Schedule recovery for failed sync
function scheduleRecovery() {
    if (!syncState.aborted) {
        console.log("Scheduling sync recovery attempt");
        setTimeout(() => {
            syncDexieToFirestore().then(result => {
                if (result.success) {
                    console.log("Recovery sync completed successfully");
                } else {
                    console.warn("Recovery sync failed:", result.reason);
                }
            });
        }, SYNC_CONFIG.RECOVERY_INTERVAL);
    }
}

// Log a sync error with context
function logSyncError(operation, documentId, error) {
    const errorKey = `${operation}:${documentId || 'general'}`;
    const errorInfo = {
        operation,
        documentId,
        error: error.message,
        timestamp: new Date().toISOString(),
        syncJobId: syncState.currentJobId
    };
    
    // Keep error log size manageable
    if (syncState.errorLog.size >= SYNC_CONFIG.ERROR_LOG_LIMIT) {
        // Remove oldest error
        const oldestKey = Array.from(syncState.errorLog.keys())[0];
        syncState.errorLog.delete(oldestKey);
    }
    
    syncState.errorLog.set(errorKey, errorInfo);
    console.error(`Sync Error [${operation}]:`, error);
    
    // Potentially save to IndexedDB for persistent error logging
    appMetadataStorage.getItem("syncErrorLog").then(log => {
        const errorLog = log || [];
        errorLog.push(errorInfo);
        
        // Keep log size manageable
        while (errorLog.length > SYNC_CONFIG.ERROR_LOG_LIMIT) {
            errorLog.shift();
        }
        
        appMetadataStorage.setItem("syncErrorLog", errorLog);
    });
}

// Update sync progress for UI display
function updateSyncProgress(phase, currentBatch, totalBatches) {
    syncState.syncProgress = {
        phase,
        currentBatch,
        totalBatches
    };
    
    // Emit event for UI updates
    const progressEvent = new CustomEvent('syncProgressUpdate', { 
        detail: {
            phase,
            current: currentBatch,
            total: totalBatches,
            percent: totalBatches ? Math.round((currentBatch / totalBatches) * 100) : 0,
            processedItems: syncState.processedItems,
            totalItems: syncState.totalItems
        }
    });
    
    document.dispatchEvent(progressEvent);
}

// Update processed items counter with rate limiting
let lastProgressUpdate = 0;
let updateInProgress = false;
function updateProgressCounter() {
    const now = Date.now();
    
    // If an update is already in progress or we're throttling, skip this update
    if (updateInProgress || now - lastProgressUpdate < SYNC_CONFIG.PROGRESS_UPDATE_INTERVAL) {
        return;
    }
    
    updateInProgress = true;
    lastProgressUpdate = now;
    
    try {
        const progressEvent = new CustomEvent('syncItemProgress', {
            detail: {
                processed: syncState.processedItems,
                total: syncState.totalItems,
                percent: syncState.totalItems ? Math.round((syncState.processedItems / syncState.totalItems) * 100) : 0,
                elapsedTime: (Date.now() - syncState.startTime) / 1000
            }
        });
        
        // Use setTimeout to ensure this is executed asynchronously
        setTimeout(() => {
            document.dispatchEvent(progressEvent);
            updateInProgress = false;
        }, 0);
    } catch (error) {
        console.error("Error updating progress:", error);
        updateInProgress = false;
    }
}

// Reset sync state for a new sync operation
function resetSyncState() {
    syncState.inProgress = false;
    syncState.currentJobId = null;
    syncState.totalItems = 0;
    syncState.processedItems = 0;
    syncState.startTime = null;
    syncState.failedItems = [];
    syncState.resumeToken = null;
    syncState.aborted = false;
    syncState.syncProgress = {
        phase: null,
        currentBatch: 0,
        totalBatches: 0
    };
    // Keep error log for debugging
}

// Get sync completion statistics
function getCompletionStats() {
    return {
        jobId: syncState.currentJobId,
        totalProcessed: syncState.processedItems,
        failedItems: syncState.failedItems.length,
        duration: (Date.now() - syncState.startTime) / 1000,
        timestamp: new Date().toISOString()
    };
}

// Abort current sync operation
async function abortSync() {
    if (syncState.inProgress) {
        syncState.aborted = true;
        await saveCheckpoint(); // Save checkpoint before aborting
        return true;
    }
    return false;
}

/**
 * Firestore key management functions
 */

// Fetch encrypted vault key from Firestore
async function getEncryptedKeyFromFirestore(userId) {
    try {
        // Reference to the user's encrypted vault key document in Firestore
        const userVaultRef = doc(db, "users", userId, "vault", "key");
        // Fetch the document
        const docSnap = await getDoc(userVaultRef);
        // Check if the document exists
        if (docSnap.exists()) {
            const userData = docSnap.data();
            return userData.encryptedKey || null;
        }
        return null;
    } catch (error) {
        console.error("Error fetching encrypted key:", error);
        return null;
    }
}

// Store encrypted vault key to Firestore
async function storeEncryptedKeyToFirestore(userId, encryptedKey) {
    try {
        const userVaultRef = doc(db, "users", userId, "vault", "key");
        await setDoc(userVaultRef, { encryptedKey }, { merge: true });
        return true;
    } catch (error) {
        console.error("Error storing encrypted key:", error);
        return false;
    }
}

async function saveEncryptedKeyToFirestore(userId, encryptedKey) {
    return storeEncryptedKeyToFirestore(userId, encryptedKey);
}

/**
 * User vault creation functions
 */

// Create a new vault for a user
async function createUserVault(passphrase) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");
        
        // Generate encryption key
        key = await generateKeyFromPassphrase(passphrase);
        userVaultKey = await crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
        
        // Export the key
        const exportedKey = await crypto.subtle.exportKey("raw", userVaultKey);
        
        // Encrypt the exported key using passphrase-derived key
        const encryptedVaultKey = await encryptData(key, new Uint8Array(exportedKey));
        
        // Store the encrypted key to Firestore
        const result = await storeEncryptedKeyToFirestore(user.uid, encryptedVaultKey);
        
        if (result) {
            console.log("User vault created successfully");
            return true;
        } else {
            console.error("Failed to create user vault");
            return false;
        }
    } catch (error) {
        console.error("Vault Creation Error:", error);
        logSyncError("vault_creation", null, error);
        return false;
    }
}

// Change vault passphrase
async function changeVaultPassphrase(currentPassphrase, newPassphrase) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");
        
        // First verify current passphrase works
        const vaultKey = await unlockUserVault(currentPassphrase);
        if (!vaultKey) {
            return { success: false, reason: "INCORRECT_PASSPHRASE" };
        }
        
        // Generate new key from new passphrase
        const newKey = await generateKeyFromPassphrase(newPassphrase);
        
        // Export vault key and encrypt with new passphrase-derived key
        const exportedKey = await crypto.subtle.exportKey("raw", userVaultKey);
        const newEncryptedVaultKey = await encryptData(newKey, new Uint8Array(exportedKey));
        
        // Store new encrypted key
        const result = await storeEncryptedKeyToFirestore(user.uid, newEncryptedVaultKey);
        
        if (result) {
            // Update current key in memory
            key = newKey;
            return { success: true };
        } else {
            return { success: false, reason: "STORAGE_ERROR" };
        }
    } catch (error) {
        console.error("Passphrase Change Error:", error);
        logSyncError("passphrase_change", null, error);
        return { success: false, reason: "UNKNOWN_ERROR", error: error.message };
    }
}

/**
 * Helper function to check if the vault is locked and handle aborting the sync
 * @returns {boolean} - True if the vault is locked and sync was aborted, false otherwise.
 */
async function checkVaultLock() {
    if (!userVaultKey) {
        console.warn("Vault locked during sync. Aborting sync.");
        syncState.aborted = true;
        await saveCheckpoint();
        return true;
    }
    return false;
}
/**
 * Sync status getters
 */

// Get current sync status
function getSyncStatus() {
    return {
        inProgress: syncState.inProgress,
        phase: syncState.syncProgress.phase,
        progress: syncState.totalItems ? Math.round((syncState.processedItems / syncState.totalItems) * 100) : 0,
        processedItems: syncState.processedItems,
        totalItems: syncState.totalItems,
        failedItems: syncState.failedItems.length,
        startTime: syncState.startTime,
        elapsedTime: syncState.startTime ? (Date.now() - syncState.startTime) / 1000 : 0
    };
}

// Get sync error log
async function getSyncErrorLog() {
    try {
        const storedLog = await appMetadataStorage.getItem("syncErrorLog") || [];
        const currentLog = Array.from(syncState.errorLog.values());
        
        // Combine and sort by timestamp (newest first)
        return [...currentLog, ...storedLog]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, SYNC_CONFIG.ERROR_LOG_LIMIT);
    } catch (error) {
        console.error("Error retrieving sync error log:", error);
        return [];
    }
}

// Check if user vault exists
async function checkUserVaultExists() {
    try {
        const user = auth.currentUser;
        if (!user) return false;
        
        const encryptedKey = await getEncryptedKeyFromFirestore(user.uid);
        return !!encryptedKey;
    } catch (error) {
        console.error("Error checking vault existence:", error);
        return false;
    }
}

// Check if vault is currently unlocked
function isVaultUnlocked() {
    return !!userVaultKey;
}

// Export functions and variables
export {
    auth,
    db,
    analytics,
    syncDexieToFirestore,
    unlockUserVault,
    lockUserVault,
    createUserVault,
    changeVaultPassphrase,
    isVaultUnlocked,
    checkUserVaultExists,
    getSyncStatus,
    getSyncErrorLog,
    abortSync,
    getEncryptedKeyFromFirestore,
    storeEncryptedKeyToFirestore,
    saveEncryptedKeyToFirestore,
    onAuthStateChanged,
    uploadTombstone,
    fetchNewTombstones,
    isSignInWithEmailLink, // Import for email link check
    signInWithEmailLink, // Import for email link sign-in
    linkWithCredential, // Import for linking email
    EmailAuthProvider // Import for creating email credential 
};