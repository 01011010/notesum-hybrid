// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, writeBatch, limit } from "firebase/firestore";
import { noteTextStorage, appMetadataStorage } from '../src/utils/noteTextStorage';
import { encryptData, decryptData, generateKeyFromPassphrase } from "./utils/cryptoUtils";
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);
const db = getFirestore(app);

let notified = false;
let userVaultKey = null;
let key = null;

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
    }
}
// Function to lock the vault (e.g., on logout)
function lockUserVault() {
    userVaultKey = null;
    key = null;
}

const syncDexieToFirestore = async () => {
    
    const user = auth.currentUser;
    if (!user) {
        if (!notified) {
            console.warn("User not authenticated, skipping sync.");
            notified = true;
        }
        return; // Early return if user is not logged in
    }
    // User is logged in, reset notified flag and perform sync
    notified = false;
    const userId = user.uid;

    // Check if we have the vault key in memory
    if (!userVaultKey) {
        console.warn("Vault is locked. Please unlock the vault before syncing.");
        return;
    }

    const userPagesRef = collection(db, "users", userId, "pages");

    try {
        // Fetch lastSyncTime from IndexedDB
        let lastSyncTime = await appMetadataStorage.getItem("lastSyncTime");
        if (!lastSyncTime) {
          lastSyncTime = "1970-01-01T00:00:00Z"; // Default fallback
        }
        const q = query(userPagesRef, where("lastModified", ">", lastSyncTime), orderBy("lastModified"), limit(50));
        const querySnapshot = await getDocs(q)
        
        const firestorePages = new Map(
            querySnapshot.docs.map(doc => [doc.id, doc.data()])
        );

        // Get all pages that need syncing
        const pendingPages = await noteTextStorage.pages.where("pendingSync").equals(1).toArray();
        if (pendingPages.length === 0) {
            // nothing to sync
        } else {
            const batch = writeBatch(db);
            const dexieBatchUpdates = []; // Collect Dexie updates
            for (const page of pendingPages) {
                const pageRef = doc(userPagesRef, page.id);
                const firestorePage = firestorePages.get(page.id);
                // Perform a diff check
                if (!firestorePage || isDifferent(page, firestorePage)) {

                    // Encrypt implementation
                    // Create a copy of the page to avoid modifying the original
                    const pageToUpload = { ...page };

                    try {
                        // Encrypt the content before uploading
                        pageToUpload.content = await encryptData(key, page.content);
                        // Add metadata to indicate this content is encrypted
                        pageToUpload.isEncrypted = 1;

                        batch.set(pageRef, pageToUpload, { merge: true });
                        dexieBatchUpdates.push(page.id);
                    } catch (error) {
                        console.error("Error encrypting page content:", error);
                    }
                } else {
                    // skipping upload; no change detected
                }
            }
            await commitBatchWithRetry(batch);
            try {
                await Promise.all(dexieBatchUpdates.map(id => 
                    noteTextStorage.pages.update(id, { pendingSync: 0 })
                ));
            } catch (error) {
                console.error("Error resetting pendingSync flags:", error);
            }
        }
        // Sync Firestore -> Dexie
        for (const [firestorePageId, firestorePage] of firestorePages) {
            const dexiePage = await noteTextStorage.pages.get(firestorePageId);
            
            // Prepare content - decrypt if needed
            let decryptedContent = firestorePage.content || "";
            
            if (firestorePage.isEncrypted && firestorePage.content) {
                try {
                    decryptedContent = await decryptData(key, firestorePage.content);
                } catch (error) {
                    console.error("Error decrypting page content:", error);
                    // Skip this page or handle the error appropriately
                    continue;
                }
            }
            
            if (!dexiePage) {
                await noteTextStorage.createPageFromFirestore({
                    id: firestorePageId,
                    name: firestorePage.name,
                    //content: firestorePage.content || "",
                    content: decryptedContent || "",
                    lastModified: firestorePage.lastModified || new Date().toISOString(),
                    order: firestorePage.order,
                    isEncrypted: firestorePage.isEncrypted || 0
                });
            } else if (new Date(firestorePage.lastModified) > new Date(dexiePage.lastModified)) {
                try {
                    await noteTextStorage.savePage(firestorePageId, decryptedContent); //firestorePage.content
                } catch (error) {
                    console.error("Error updating Dexie page:", error);
                }
            }
        }
        // Sync Dexie -> Firestore (Upload new or updated pages, and delete missing ones)
        const dexiePages = await noteTextStorage.pages.toArray();

        // we need to do this, because the initial query limits the range due to last sync
        let allFirestorePages = firestorePages;
        if (firestorePages.size === 0) {
            const getAllQuery = await getDocs(userPagesRef);
            allFirestorePages = new Map(
                getAllQuery.docs.map(doc => [doc.id, doc.data()])
            );
        }
        const firestorePageIds = new Set(Array.from(allFirestorePages.keys()));
        const dexiePageIds = new Set(dexiePages.map(page => page.id));

        const batch = writeBatch(db);
        let deletionsPending = false; // Flag to track if any deletions are needed

        // Delete pages in Firestore that are missing in Dexie
        for (const firestorePageId of firestorePageIds) {
            if (!dexiePageIds.has(firestorePageId)) {
                const pageRef = doc(userPagesRef, firestorePageId);
                batch.delete(pageRef);
                deletionsPending = true; // Set the flag
            }
        }
        // Only commit the batch if there are deletions
        if (deletionsPending) {
            await commitBatchWithRetry(batch);
        } else {
            // no firestore pages to delete
        }

        await appMetadataStorage.setItem("lastSyncTime", new Date().toISOString());
    } catch (error) {
        console.error("Error syncing Dexie to Firestore:", error);
    }
};

// Helper function to compare local and remote page data
function isDifferent(localPage, remotePage) {
    return (
        localPage.content !== remotePage.content ||
        localPage.name !== remotePage.name ||
        new Date(localPage.lastModified) > new Date(remotePage.lastModified)
    );
}

/**
 * Save the encrypted key to Firestore under the user's profile.
 * @param {string} userId - The user's unique ID.
 * @param {string} encryptedKey - The encrypted vault key.
 */
async function saveEncryptedKeyToFirestore(userId, encryptedKey) {
    // Validate inputs
    if (!userId || !encryptedKey) {
        console.error("Invalid parameters: userId and encryptedKey are required");
        return Promise.reject(new Error("Invalid parameters"));
    }
    const userVaultRef = doc(db, "users", userId, "vault", "key");

    try {
        // Ensure the key is in the correct format (as a string)
        const dataToSave = { 
            encryptedKey: typeof encryptedKey === 'string' ? 
                encryptedKey : 
                JSON.stringify(encryptedKey),
            updatedAt: new Date().toISOString()
        };
        
        await setDoc(userVaultRef, dataToSave);
        
        return true;
    } catch (error) {
        console.error("Error saving encrypted key:", error);
        throw error;
    }
}

/**
 * Retrieves the encrypted vault key from Firestore for the current user.
 * @param {string} userId - The ID of the currently logged-in user.
 * @returns {Promise<string|null>} - The encrypted key or null if not found.
 */
async function getEncryptedKeyFromFirestore(userId) {
    
    try {
        // Reference to the user's encrypted vault key document in Firestore
        const encryptedKeyRef = doc(db, "users", userId, "vault", "key");
        // Fetch the document
        const docSnapshot = await getDoc(encryptedKeyRef);
        // Check if the document exists
        if (docSnapshot.exists()) {
            return docSnapshot.data().encryptedKey;
        } else {
            console.warn("No encrypted vault key found for the user.");
        return null;
        }
    } catch (error) {
        console.error("Error fetching encrypted key from Firestore:", error);
        throw new Error("Failed to retrieve encrypted key.");
    }
}

// Function to commit a Firestore batch with retries
async function commitBatchWithRetry(batch, maxRetries = 3) {
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            await batch.commit();
            return; // Exit function if successful
        } catch (error) {
            attempt++;
            console.error(`Batch commit failed (Attempt ${attempt}/${maxRetries}):`, error);
            if (attempt >= maxRetries) {
                console.error("Max retries reached. Failed to commit batch.");
                throw error; // Throw error after max retries
            }
            // Exponential backoff before retrying
            const delay = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Export authentication instance
export {app, auth, onAuthStateChanged, analytics, unlockUserVault, lockUserVault, syncDexieToFirestore, saveEncryptedKeyToFirestore, getEncryptedKeyFromFirestore}; 