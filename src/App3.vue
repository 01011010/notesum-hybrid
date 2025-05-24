<template>
    <div :class="{ dark: isDark }" class="h-screen w-full text-gray-900 bg-white dark:bg-custom-dark dark:text-white">
        <div v-if="appState === APP_STATES.LOADING" class="flex items-center justify-center h-full">
            <p>Loading application...</p>
        </div>

        <div v-else-if="appState === APP_STATES.ERROR" class="flex items-center justify-center h-full">
            <p class="text-red-500">Failed to initialize the application. Please try refreshing.</p>
            </div>

        <template v-else>
            <TopBar
                :isSidebarOpen="isSidebarOpen"
                :isEventbarOpen="isEventbarOpen"
                @toggleSidebar="toggleSidebar"
                @toggleEventbar="toggleEventbar"
                :isDark="isDark"
                :toggleDark="toggleDark"
                :componentToShow="appState"
                :isVaultUnlocked="isVaultUnlocked"
                :isOnline="isOnline" 
            />
            <!--
            <UpdateNotificationPWA />
            -->
            <PWAIndicator />
            <div v-if="!isOnline && appState !== APP_STATES.LOADING" class="bg-yellow-500 text-black text-center p-1 text-sm">
                You are currently offline. Some features may be unavailable. Changes are saved locally.
            </div>

            <div class="flex flex-1">
                <PassphraseSetup
                    v-if="appState === APP_STATES.NEEDS_VAULT_SETUP"
                    @passphrase-set="handlePassphraseSet"
                    :is-online="isOnline" class="flex-1"
                />
                <VaultUnlock
                    v-else-if="appState === APP_STATES.NEEDS_VAULT_UNLOCK"
                    @vault-unlocked="handleVaultUnlocked"
                    :isDark="isDark"
                    :is-online="isOnline" class="flex-1"
                />
                <div v-else-if="appState === APP_STATES.NEEDS_AUTH" class="flex-1 flex flex-col items-center justify-center">
                    <p>Please log in to continue.</p>
                    <p v-if="!isOnline" class="text-sm text-orange-600 dark:text-orange-400 mt-2">(Requires internet connection)</p>
                </div>
                <div v-else-if="appState === APP_STATES.OFFLINE_NEEDS_CHECK" class="flex-1 flex flex-col items-center justify-center">
                    <p>Cannot verify vault status while offline.</p>
                    <p class="text-sm text-orange-600 dark:text-orange-400 mt-2">Please connect to the internet to continue.</p>
                </div>

                <div v-else-if="appState === APP_STATES.READY" class="flex flex-1">
                    <transition name="sidebar">
                        <aside v-if="isSidebarOpen" class="w-64 mr-2">
                            <SidebarComponent
                                v-model:isSidebarOpen="isSidebarOpen"
                                :selectedPageId="selectedPageId"
                                @page-selected="handlePageSelect"
                            />
                            
                        </aside>
                    </transition>
                    <splitpanes
                        :class="{ dark: isDark }"
                        class="default-theme"
                        @resized="handlePaneResize"
                        
                    >
                        <pane :size="midPaneSize" min-size="30">
                            <transition name="main-content">
                                <main class="flex-1 overflow-y-auto">
                                    <EditorComponent ref="editorRef"
                                        :currentPage="selectedPage"
                                        :isDarkMode="isDark"
                                        :vaultKey="userVaultKey"
                                        :is-read-only="!userVaultKey" />
                                </main>
                            </transition>
                        </pane>
                        <pane :size="eventPaneSize" min-size="15" v-if="hasEvents && isEventbarOpen">
                            <CalendarEventList
                                @jump-to-line="handleSidebarClick"
                                v-model:isEventbarOpen="isEventbarOpen"
                                class=""
                            />
                        </pane>
                    </splitpanes>
                </div>
            </div>
        </template>
    </div>
</template>

<script>
import { ref, onMounted, computed, provide, watch } from 'vue'; // Added watch
import { useOnline, useDark, useToggle } from "@vueuse/core"; // Added useOnline
import { noteTextStorage, appMetadataStorage } from './utils/noteTextStorage';
import { useCalendarStore } from './store/calendar';
import { auth, onAuthStateChanged, getEncryptedKeyFromFirestore, syncDexieToFirestore } from "./firebase2";
import { createAppSyncManager } from './sync-manager';
import { Splitpanes, Pane } from 'splitpanes';
//import 'splitpanes/dist/splitpanes.css';

// Import Components (assuming they exist)
import TopBar from './components/TopBar.vue';
import SidebarComponent from './components/Sidebar3.vue';
import EditorComponent from './components/CodeEditorEPages4.vue';
import CalendarEventList from './components/CalendarEventList.vue';
import VaultUnlock from './components/VaultUnlock.vue';
import PassphraseSetup from './components/PassphraseSetup.vue';
//import UpdateNotificationPWA from './components/UpdateNotificationPWA.vue';
import PWAIndicator from './components/PWAIndicator.vue';
// --- Constants ---
const STORAGE_KEYS = {
    MAIN_PANE_SIZE: 'mainPaneSize',
    IS_SIDEBAR_OPEN: 'isSidebarOpen',
    IS_EVENTBAR_OPEN: 'isEventbarOpen',
    LAST_SELECTED_PAGE_ID: 'lastSelectedPageId',
};

const APP_STATES = {
    LOADING: 'loading',
    NEEDS_AUTH: 'needsAuth',
    NEEDS_VAULT_SETUP: 'needsVaultSetup',
    NEEDS_VAULT_UNLOCK: 'needsVaultUnlock',
    OFFLINE_NEEDS_CHECK: 'offlineNeedsCheck', // New state for when offline and cannot verify vault
    READY: 'ready',
    ERROR: 'error',
};
// --- End Constants ---

export default {
    name: 'App',
    components: {
        SidebarComponent,
        EditorComponent,
        TopBar,
        CalendarEventList,
        VaultUnlock,
        PassphraseSetup,
        //UpdateNotificationPWA,
        Splitpanes,
        Pane,
        PWAIndicator
    },
    setup() {
        const editorRef = ref(null);
        const appState = ref(APP_STATES.LOADING);

        // --- Online Status ---
        const isOnline = useOnline();
        // --- End Online Status ---

        // --- Theme Management (useDarkMode) ---
        const isDark = useDark({
            selector: 'body', 
            attribute: 'class',
            valueDark: 'dark',
            valueLight: '',
        });
        const toggleDark = useToggle(isDark);
        // --- End Theme Management ---

        // --- Calendar Store & Event State ---
        const calendarStore = useCalendarStore();
        const hasEvents = computed(() => {
            // Ensure calendarStore.groupedByMonth is reactive and properly initialized
            return calendarStore.groupedByMonth && Object.keys(calendarStore.groupedByMonth).length > 0;
        });
        // --- End Calendar Store & Event State ---

        // --- Sync Manager ---
        const syncManager = ref(null);
        provide('syncManager', syncManager);

        const initializeSyncManager = () => {
            if (!syncManager.value) { // Create only once
                syncManager.value = createAppSyncManager(noteTextStorage, appMetadataStorage);
            }
        };
        const performGlobalSync = async () => {
            if (!isOnline.value) {
                console.log("Sync skipped: Application is offline.");
                // Optionally provide user feedback (e.g., toast)
                return;
            }
            if (!syncManager.value) {
                console.warn("Sync Manager not initialized.");
                return;
            }
            try {
                console.log("Attempting global sync (Online)...");
                const result = await syncManager.value.syncAll({ forceAll: false });
                console.log('Global sync result:', result);
            } catch(error) {
                console.error('Global sync failed:', error);
            }

        };
        // --- End Sync Manager ---

        // --- Layout State ---
        const isSidebarOpen = ref(false);
        const isEventbarOpen = ref(false);
        const mainPaneSize = ref(70);
        const selectedPageId = ref(null);
        const selectedPage = ref(null);
        const midPaneSize = computed(() => mainPaneSize.value);
        const eventPaneSize = computed(() => 100 - mainPaneSize.value);


        const loadLayoutState = async () => {
            try {
                const [storedSidebar, storedEventbar, storedPaneSize, lastPageId] = await Promise.all([
                    appMetadataStorage.getItem(STORAGE_KEYS.IS_SIDEBAR_OPEN),
                    appMetadataStorage.getItem(STORAGE_KEYS.IS_EVENTBAR_OPEN),
                    appMetadataStorage.getItem(STORAGE_KEYS.MAIN_PANE_SIZE),
                    appMetadataStorage.getItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID)
                ]);

                isSidebarOpen.value = storedSidebar === 1 || storedSidebar === true; // Handle potential number/boolean
                isEventbarOpen.value = storedEventbar === 1 || storedEventbar === true; // Handle potential number/boolean

                // Validate stored pane size
                const size = storedPaneSize?.value ?? storedPaneSize; // Handle localForage structure if needed
                if (typeof size === 'number' && size >= 10 && size <= 100) { // Example validation range
                    mainPaneSize.value = size;
                } else {
                    mainPaneSize.value = 70; // Fallback to default
                    if (size !== null && size !== undefined) {
                        console.warn(`Invalid stored pane size (${size}), using default.`);
                    }
                }

                if (lastPageId) {
                    await handlePageSelect(lastPageId); // Load last selected page content
                }

            } catch (error) {
                console.error("Failed to load layout state:", error);
                // Keep default values
            }
        };

        const toggleSidebar = async () => {
            isSidebarOpen.value = !isSidebarOpen.value;
            try {
                await appMetadataStorage.setItem(STORAGE_KEYS.IS_SIDEBAR_OPEN, isSidebarOpen.value ? 1 : 0);
            } catch (error) {
                console.error("Failed to save sidebar state:", error);
            }
        };

        const toggleEventbar = async () => {
            isEventbarOpen.value = !isEventbarOpen.value;
            try {
                await appMetadataStorage.setItem(STORAGE_KEYS.IS_EVENTBAR_OPEN, isEventbarOpen.value ? 1 : 0);
            } catch (error) {
                console.error("Failed to save event bar state:", error);
            }
        };

        const handlePaneResize = async ({ panes }) => {
             // Assuming the first pane is the main one we want to store
            const newSize = panes[0]?.size;
            if (typeof newSize === 'number') {
                mainPaneSize.value = newSize;
                try {
                     // Debounce this in a real app if resizing is frequent
                    await appMetadataStorage.setItem(STORAGE_KEYS.MAIN_PANE_SIZE, newSize);
                } catch (error) {
                    console.error("Failed to save pane size:", error);
                }
            }
        };

        const handlePageSelect = async (pageId) => {
            selectedPageId.value = pageId;
            if (pageId) {
                try {
                    // Assuming pageId is sufficient to identify the page data needed by EditorComponent
                    // If you need to load content here:
                    // selectedPage.value = await noteTextStorage.getItem(pageId); // Example
                    selectedPage.value = pageId; // Pass the ID for now
                    await appMetadataStorage.setItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID, pageId);
                } catch (error) {
                    console.error('Failed to load or set last page:', error);
                    selectedPage.value = null; // Clear selection on error
                     // Add user feedback
                }
            } else {
                selectedPage.value = null;
                await appMetadataStorage.removeItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID);
            }
        };

        const handleSidebarClick = (lineNumber) => { // Renamed from handleSidebarClick for clarity if needed
            editorRef.value?.scrollToLine(lineNumber);
        };
        // --- End Layout State ---

        // --- Vault & Auth State ---
        const isAuthenticated = ref(false);
        const hasEncryptedKey = ref(false); // Tracks if the *mechanism* exists (key stored in Firestore)
        const userVaultKey = ref(null);     // The *decrypted* key, only in memory when unlocked
        const isVaultUnlocked = ref(false); // Tracks if the user has successfully unlocked in this session

        // Modified to handle offline explicitly
        const checkEncryptedKeyOnline = async (userId) => {
            if (!isOnline.value) {
                console.log("Offline: Cannot check encrypted key status online.");
                return { status: 'offline' }; // Indicate offline status
            }
            try {
                const keyExists = await getEncryptedKeyFromFirestore(userId);
                console.log(`Online check: Encrypted key exists in Firestore.`);
                return { status: 'online', exists: !!keyExists };
            } catch (error) {
                 // Differentiate network errors from others if possible
                 if (error.message.includes('offline') || error.code === 'unavailable') { // Example check
                    console.warn("Offline detected during Firestore key check:", error);
                    return { status: 'offline' };
                }
                console.error("Failed to fetch encrypted key:", error);
                return { status: 'error', error: error }; // Indicate error
            }
        };

        const handleVaultUnlocked = (decryptedKey) => {
            console.log("Vault unlocked successfully.");
            userVaultKey.value = decryptedKey;
            isVaultUnlocked.value = true; // Mark as unlocked for this session
            appState.value = APP_STATES.READY;
            initializeSyncManager();
            // Attempt sync only if online
            if (isOnline.value) {
                syncDexieToFirestore(); // Or performGlobalSync() if preferred
            } else {
                console.log("Vault unlocked, but offline. Sync deferred.");
            }
        };

        const handlePassphraseSet = async (passphrase) => {
            if (!isOnline.value) {
                console.error("Cannot set up passphrase while offline.");
                // Add user feedback (e.g., toast notification)
                return;
            }
            console.log("Passphrase set by user (Online).");
            const derivedKey = passphrase; // <<< !!! REPLACE !!!
            // Assume: await storeEncryptedKeyCheckInFirestore(auth.currentUser.uid, ...); succeeds

            userVaultKey.value = derivedKey;
            hasEncryptedKey.value = true; // Mark key mechanism as now existing
            isVaultUnlocked.value = true; // Mark as unlocked
            appState.value = APP_STATES.READY;
            initializeSyncManager();
            // Perform initial sync after setup
            await performGlobalSync();
        };

        const resetVaultState = () => {
            isAuthenticated.value = false;
            hasEncryptedKey.value = false;
            userVaultKey.value = null;
            isVaultUnlocked.value = false;
        };
        // --- End Vault & Auth State ---

        // --- Initialization ---
        let authInitialized = false; // Prevent multiple listener setups if initializeApp is called again

        const initializeApp = async () => {
            console.log(`Initializing App. Online: ${isOnline.value}`);
             // Don't reset to LOADING if already in a stable state and just coming online
            if (appState.value !== APP_STATES.READY && appState.value !== APP_STATES.OFFLINE_NEEDS_CHECK) {
                appState.value = APP_STATES.LOADING;
            }

            try {
                // Load local UI state regardless of connectivity
                await loadLayoutState();

                // Setup Auth Listener only once
                if (!authInitialized) {
                    authInitialized = true;
                    onAuthStateChanged(auth, async (user) => {
                        console.log(`Auth State Changed. User: ${user ? user.uid : 'null'}. Online: ${isOnline.value}`);
                        if (user) {
                            isAuthenticated.value = true;

                            // Check key status online if possible
                            const keyCheckResult = await checkEncryptedKeyOnline(user.uid);

                            if (keyCheckResult.status === 'online') {
                                hasEncryptedKey.value = keyCheckResult.exists;
                                isVaultUnlocked.value = false; // Require unlock even if key exists, unless session persists unlock (not implemented here)
                                userVaultKey.value = null;

                                if (!hasEncryptedKey.value) {
                                    appState.value = APP_STATES.NEEDS_VAULT_SETUP;
                                } else {
                                    // Key exists, needs unlock
                                    appState.value = APP_STATES.NEEDS_VAULT_UNLOCK;
                                }
                            } else if (keyCheckResult.status === 'offline') {
                                // Offline: We *know* we are authenticated from Firebase's cache.
                                // We *don't know* the vault setup status for sure.
                                // Can we proceed? Only if the vault was *already unlocked* in this session *before* going offline.
                                if (isVaultUnlocked.value && userVaultKey.value) {
                                    console.log("Offline, but vault was already unlocked. Entering Ready state (offline).");
                                    appState.value = APP_STATES.READY; // Stay in ready state, but offline functionality
                                } else {
                                    console.log("Offline: Cannot verify vault status. Blocking until online.");
                                    appState.value = APP_STATES.OFFLINE_NEEDS_CHECK;
                                    // Reset flags just in case
                                    isVaultUnlocked.value = false;
                                    userVaultKey.value = null;
                                    hasEncryptedKey.value = false; // We don't know this for sure offline
                                }
                            } else { // Error during online check
                                console.error("Error checking key online:", keyCheckResult.error);
                                appState.value = APP_STATES.ERROR; // Treat as critical error
                            }
                        } else { // No user
                            resetVaultState();
                            appState.value = APP_STATES.NEEDS_AUTH;
                        }
                        console.log(`App State after auth check: ${appState.value}`);
                    });
                } else if (isOnline.value) {
                    // If already initialized and coming online, re-trigger check logic if needed
                    console.log("Re-evaluating state after coming online...");
                    const user = auth.currentUser;
                    if (user) {
                        if (appState.value === APP_STATES.OFFLINE_NEEDS_CHECK || appState.value === APP_STATES.NEEDS_AUTH) {
                            // Re-run the checks as if auth state just changed
                            const keyCheckResult = await checkEncryptedKeyOnline(user.uid);
                            if (keyCheckResult.status === 'online') {
                                hasEncryptedKey.value = keyCheckResult.exists;
                                isVaultUnlocked.value = false;
                                userVaultKey.value = null;
                                appState.value = hasEncryptedKey.value ? APP_STATES.NEEDS_VAULT_UNLOCK : APP_STATES.NEEDS_VAULT_SETUP;
                            } else if (keyCheckResult.status === 'error') {
                                appState.value = APP_STATES.ERROR;
                            } // If still offline somehow, state remains OFFLINE_NEEDS_CHECK
                        } else if (appState.value === APP_STATES.READY && isVaultUnlocked.value) {
                            // Already ready, just trigger sync
                            performGlobalSync();
                        }
                    } else {
                        // Became online but no user
                        resetVaultState();
                        appState.value = APP_STATES.NEEDS_AUTH;
                    }
                }

                // Initial state is set by the first run of onAuthStateChanged listener
                // If it doesn't run quickly, we stay in LOADING briefly.

            } catch (error) {
                console.error("Critical Initialization Error:", error);
                resetVaultState();
                appState.value = APP_STATES.ERROR;
            }
        };

        onMounted(() => {
            initializeApp();
        });

        // --- Watch for Online/Offline Changes ---
        watch(isOnline, (currentlyOnline, previouslyOnline) => {
            console.log(`Network status changed. Was Online: ${previouslyOnline}, Is Online: ${currentlyOnline}`);
            if (currentlyOnline) {
                 // Attempt to re-initialize or re-check state when coming online
                 initializeApp(); // Re-run checks, potentially trigger sync or state change
            } else {
                // Optional: Add specific logic when going offline (e.g., cancel pending uploads)
                console.log("Application went offline.");
                // If user was in Needs Auth/Setup/Unlock state, they might get stuck until online again
                if (appState.value === APP_STATES.NEEDS_AUTH || appState.value === APP_STATES.NEEDS_VAULT_SETUP || appState.value === APP_STATES.NEEDS_VAULT_UNLOCK) {
                    // Optionally update UI to be clearer about offline block
                    console.warn(`App state ${appState.value} may be blocked until online.`);
                     // No state change needed here, the initializeApp logic handles OFFLINE_NEEDS_CHECK
                } else if (appState.value === APP_STATES.READY) {
                     // Stay READY, but syncs will fail / be deferred
                }
            }
        });
        // --- End Watch ---

        return {
            // App State & Constants
            appState,
            APP_STATES,
            isOnline, // Expose online status

            // Layout State & Methods
            isSidebarOpen, isEventbarOpen, mainPaneSize, midPaneSize, eventPaneSize,
            selectedPageId, selectedPage, editorRef,
            toggleSidebar, toggleEventbar, handlePaneResize, handlePageSelect, handleSidebarClick,

            // Theme
            isDark, toggleDark,

            // Vault & Auth State & Methods
            // isAuthenticated, hasEncryptedKey // Less needed directly
            isVaultUnlocked, userVaultKey,
            handleVaultUnlocked, handlePassphraseSet,

            // Calendar
            hasEvents,

            // Methods
             performGlobalSync // If manual sync button exists
        };
    }
}
</script>

<style scoped>

/* Style for offline indicator if needed */
.offline-indicator {
    background-color: #fbbf24; /* amber-400 */
    color: #1f2937; /* gray-800 */
    text-align: center;
    padding: 0.25rem;
    font-size: 0.875rem;
}

/* Transitions (ensure they target correct properties if uncommented) */
.sidebar-enter-active,
.sidebar-leave-active {
    /* transition: transform 0.3s ease, width 0.3s ease, margin 0.3s ease; */
     transition: all 0.3s ease; /* Example */
}

.sidebar-enter-from,
.sidebar-leave-to {
    /* transform: translateX(-100%); */
    /* width: 0; */
    /* margin-right: 0; */
    opacity: 0; /* Example */
}
.main-content-enter-active,
.main-content-leave-active {
    /* transition: margin-left 0.3s ease; */ /* Adjust if needed */
    transition: opacity 0.3s ease;
}

.main-content-enter-from,
.main-content-leave-to {
    /* margin-left: 0; */ /* Adjust if needed */
    opacity: 0;
}

</style>