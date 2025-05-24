<!-- version 2 - refactored -->
<template>
    <div :class="{ dark: isDark }" class="h-screen w-full text-gray-900 bg-white dark:bg-custom-dark dark:text-white flex flex-col">
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
                :componentToShow="appState" :isVaultUnlocked="isVaultUnlocked"
            />
            <UpdateNotificationPWA />

            <div class="flex flex-1 overflow-hidden">
                 <PassphraseSetup
                    v-if="appState === APP_STATES.NEEDS_VAULT_SETUP"
                    @passphrase-set="handlePassphraseSet"
                    class="flex-1" />
                <VaultUnlock
                    v-else-if="appState === APP_STATES.NEEDS_VAULT_UNLOCK"
                    @vault-unlocked="handleVaultUnlocked"
                    :isDark="isDark"
                    class="flex-1" />
                <div v-else-if="appState === APP_STATES.NEEDS_AUTH" class="flex-1 flex items-center justify-center">
                    <p>Please log in to continue.</p>
                    </div>

                <div v-else-if="appState === APP_STATES.READY" class="flex flex-1 overflow-hidden">
                    <transition name="sidebar">
                        <aside v-if="isSidebarOpen" class="w-64 mr-2 flex-shrink-0 overflow-y-auto">
                           <SidebarComponent
                                v-model:isSidebarOpen="isSidebarOpen"
                                :selectedPageId="selectedPageId"
                                @page-selected="handlePageSelect"
                            />
                        </aside>
                    </transition>
                    <splitpanes
                        :class="{ dark: isDark }"
                        class="default-theme flex-1"
                        @resized="handlePaneResize"
                        horizontal="false" >
                        <pane :size="midPaneSize" min-size="30"> <transition name="main-content">
                                <main class="flex-1 overflow-y-auto h-full"> <EditorComponent ref="editorRef"
                                        :currentPage="selectedPage"
                                        :isDarkMode="isDark"
                                        :vaultKey="userVaultKey"
                                    />
                                </main>
                            </transition>
                        </pane>
                        <pane :size="eventPaneSize" min-size="15" v-if="hasEvents && isEventbarOpen"> <CalendarEventList
                                @jump-to-line="handleSidebarClick"
                                v-model:isEventbarOpen="isEventbarOpen"
                                class="h-full" />
                        </pane>
                    </splitpanes>
                </div>
            </div>
        </template>
    </div>
</template>

<script>
import { ref, onMounted, computed, provide } from 'vue';
import { useDark, useToggle } from "@vueuse/core";
import { noteTextStorage, appMetadataStorage } from './utils/noteTextStorage';
import { useCalendarStore } from './store/calendar';
import { auth, onAuthStateChanged, getEncryptedKeyFromFirestore, syncDexieToFirestore } from "./firebase2"; // Assuming firebase setup
import { createAppSyncManager } from './sync-manager'; // Assuming sync manager setup
import { Splitpanes, Pane } from 'splitpanes';
import 'splitpanes/dist/splitpanes.css';

// Import Components
import TopBar from './components/TopBar.vue';
import SidebarComponent from './components/Sidebar2.vue';
import EditorComponent from './components/CodeEditorEPages4.vue';
import CalendarEventList from './components/CalendarEventList.vue';
import VaultUnlock from './components/VaultUnlock.vue';
import PassphraseSetup from './components/PassphraseSetup.vue';
import UpdateNotificationPWA from './components/UpdateNotificationPWA.vue';

// --- Constants ---
const STORAGE_KEYS = {
    MAIN_PANE_SIZE: 'mainPaneSize', // Use a more descriptive name
    IS_SIDEBAR_OPEN: 'isSidebarOpen',
    IS_EVENTBAR_OPEN: 'isEventbarOpen',
    LAST_SELECTED_PAGE_ID: 'lastSelectedPageId',
};

const APP_STATES = {
    LOADING: 'loading',
    NEEDS_AUTH: 'needsAuth',
    NEEDS_VAULT_SETUP: 'needsVaultSetup',
    NEEDS_VAULT_UNLOCK: 'needsVaultUnlock',
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
        UpdateNotificationPWA,
        Splitpanes,
        Pane
    },
    // Removed isDarkMode prop, as useDark manages it internally now
    setup() {
        const editorRef = ref(null);
        const appState = ref(APP_STATES.LOADING);

        // --- Theme Management (useDarkMode) ---
        const isDark = useDark({
            selector: 'body', // Or 'html' if you prefer
            attribute: 'class',
            valueDark: 'dark',
            valueLight: '', // Default light class if needed
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
        // Consider initializing this only when needed (e.g., after vault unlock)
        const syncManager = ref(null); // Initialize as null
        provide('syncManager', syncManager); // Provide the ref

        const initializeSyncManager = () => {
             if (!syncManager.value) { // Create only once
                syncManager.value = createAppSyncManager(noteTextStorage, appMetadataStorage);
             }
        };

        const performGlobalSync = async () => {
            if (!syncManager.value) {
                 console.warn("Sync Manager not initialized.");
                 return;
            }
            try {
                console.log("Attempting global sync...");
                const result = await syncManager.value.forceSync({ forceAll: true });
                console.log('Global sync result:', result);
                // Add user feedback (e.g., toast notification)
                return result;
            } catch (error) {
                console.error('Global sync failed:', error);
                // Add user feedback for error
            }
        };
        // --- End Sync Manager ---


        // --- Layout State (Simulating useLayoutState) ---
        const isSidebarOpen = ref(false);
        const isEventbarOpen = ref(false);
        const mainPaneSize = ref(70); // Default size for the main editor pane
        const selectedPageId = ref(null);
        const selectedPage = ref(null); // Keep this for the editor prop

        const midPaneSize = computed(() => mainPaneSize.value); // Size of the first pane (Editor)
        const eventPaneSize = computed(() => 100 - mainPaneSize.value); // Size of the second pane (Events)

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
                if (typeof size === 'number' && size >= 10 && size <= 90) { // Example validation range
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


        // --- Vault & Auth State (Simulating useVault) ---
        const isAuthenticated = ref(false); // Basic flag, might be redundant with appState
        const hasEncryptedKey = ref(false);
        const userVaultKey = ref(null); // This holds the DECRYPTED key
        const isVaultUnlocked = ref(false); // Explicit unlock status

        const fetchEncryptedKey = async (userId) => {
            try {
                const encryptedKey = await getEncryptedKeyFromFirestore(userId);
                return !!encryptedKey; // Return true if key exists, false otherwise
            } catch (error) {
                console.error("Failed to fetch encrypted key:", error);
                 // Decide how to handle this - treat as no key? Show error?
                 // For now, treat as no key exists for robustness
                return false;
            }
        };

        const handleVaultUnlocked = (decryptedKey) => {
            console.log("Vault unlocked successfully.");
            userVaultKey.value = decryptedKey;
            isVaultUnlocked.value = true;
            appState.value = APP_STATES.READY; // Move to ready state
            initializeSyncManager(); // Init sync manager now that we have the key
            syncDexieToFirestore(); // Consider running async with UI feedback
        };

        const handlePassphraseSet = async (passphrase) => {
            console.log("Passphrase set by user.");
            // 1. Generate/derive the actual encryption key from the passphrase
            //    (e.g., using PBKDF2, Argon2) - THIS IS CRITICAL SECURITY
            // 2. Encrypt something small with this key (e.g., a constant string "VAULT_CHECK")
            // 3. Store the *encrypted check value* and salt securely (e.g., in Firestore)
            // 4. Store the user's actual data encrypted with the derived key in Dexie/localForage.

            // --- Placeholder ---
            // IMPORTANT: Replace this with actual key derivation and secure storage
            const derivedKey = passphrase; //
            // Assume persistence of the *encrypted* key check happens here or in firebase utils
            // Example: await storeEncryptedKeyCheckInFirestore(auth.currentUser.uid, encryptedCheck, salt);

            userVaultKey.value = derivedKey; // Store the derived key for runtime use
            hasEncryptedKey.value = true; // Mark that a key mechanism now exists
            isVaultUnlocked.value = true;
            appState.value = APP_STATES.READY;
            initializeSyncManager();
            // Perform initial sync if needed after setup
            // await performGlobalSync();
        };

         const resetVaultState = () => {
            isAuthenticated.value = false;
            hasEncryptedKey.value = false;
            userVaultKey.value = null;
            isVaultUnlocked.value = false;
            // Do NOT reset syncManager here, might be needed if re-authenticating quickly
        };
        // --- End Vault & Auth State ---

        // --- Initialization ---
        const initializeApp = async () => {
            appState.value = APP_STATES.LOADING;
            try {
                 // Load non-auth-dependent state first
                await loadLayoutState();

                // Setup Auth Listener - this is the core logic flow now
                onAuthStateChanged(auth, async (user) => {
                    if (user) {
                        isAuthenticated.value = true;
                        const keyExists = await fetchEncryptedKey(user.uid);
                        hasEncryptedKey.value = keyExists;

                        // Reset unlock status on user change - require unlock each time
                        isVaultUnlocked.value = false;
                        userVaultKey.value = null;

                        if (!keyExists) {
                            appState.value = APP_STATES.NEEDS_VAULT_SETUP;
                        } else {
                            // Key exists, but we need the user to unlock it
                            appState.value = APP_STATES.NEEDS_VAULT_UNLOCK;
                        }
                        console.log(`Auth state: User logged in. Key exists: ${keyExists}. App state: ${appState.value}`);

                    } else {
                        console.log("Auth state: User logged out.");
                        resetVaultState();
                        appState.value = APP_STATES.NEEDS_AUTH; // Or a public view state
                    }
                });
                 // Note: The initial state (loading -> needsAuth/needsVault...)
                 // is set within the onAuthStateChanged callback when it first runs.

            } catch (error) {
                console.error("Critical Initialization Error:", error);
                resetVaultState(); // Reset state on critical failure
                appState.value = APP_STATES.ERROR;
            }
        };

        onMounted(() => {
            initializeApp();
        });
        // --- End Initialization ---

        return {
            // App State
            appState,
            APP_STATES, // Expose constants to template if needed directly

            // Layout State
            isSidebarOpen,
            isEventbarOpen,
            mainPaneSize,
            midPaneSize,
            eventPaneSize,
            selectedPageId,
            selectedPage,
            toggleSidebar,
            toggleEventbar,
            handlePaneResize,
            handlePageSelect,
            handleSidebarClick, // For jumping to line in editor

            // Theme
            isDark,
            toggleDark,

            // Vault & Auth
            // isAuthenticated, // Less needed directly in template now
            // hasEncryptedKey, // Less needed directly in template now
            isVaultUnlocked, // Still useful for TopBar etc.
            userVaultKey, // Needed for EditorComponent prop
            handleVaultUnlocked,
            handlePassphraseSet,

            // Editor Ref
            editorRef,

            // Calendar/Events
            calendarStore, // If needed directly
            hasEvents,

            // Methods (that need to be exposed)
            // syncManager, // Usually not needed directly in template
            performGlobalSync // If you add a manual sync button
        };
    }
}
</script>

<style scoped>
/* Ensure splitpanes takes up available space */
.splitpanes.default-theme {
    height: 100%;
}

.splitpanes.default-theme .splitpanes__pane {
    background-color: var(--pane-bg, white);
    /* Add overflow handling if content might exceed pane size */
     overflow: auto;
}

/* Dark theme override */
.dark .splitpanes.default-theme .splitpanes__pane {
  --pane-bg: theme('colors.custom-dark'); /* Adjust color if needed */
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