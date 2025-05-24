<template>
    <div :class="{ dark: isDark }" class="h-screen w-full text-gray-900 bg-white dark:bg-custom-dark dark:text-white">

        <template>
            <div v-if="syncDetailStatus.state === 'pending'">Preparing sync...</div>
            <div v-if="syncDetailStatus.state === 'processing'">
            Syncing {{ syncDetailStatus.processed }} of {{ syncDetailStatus.total }}...
            <span v-if="syncDetailStatus.currentPageId">
                ({{ syncDetailStatus.currentPageStatus }} page {{ syncDetailStatus.currentPageId }})
            </span>
            </div>
            <div v-if="syncDetailStatus.state === 'complete'">Sync complete!</div>
            <div v-if="syncDetailStatus.state === 'complete-with-errors'" class="warning">
            Sync complete with some errors.
            </div>
            <div v-if="syncDetailStatus.state === 'error'" class="error">
            Sync failed: {{ syncDetailStatus.error }}
            </div>

            <div v-if="syncDetailStatus.results">
            Summary: {{ syncDetailStatus.results.succeeded }} succeeded,
                        {{ syncDetailStatus.results.failed }} failed,
                        {{ syncDetailStatus.results.skipped }} skipped.
            </div>
        </template>

        <div v-if="globalError" class="flex items-center justify-center h-full">
            <div class="text-center p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                <h2 class="font-bold mb-2">Application Error</h2>
                <p>{{ globalError }}</p>
                <p class="mt-2 text-sm">Please try refreshing the page.</p>
            </div>
        </div>

        <div v-else-if="appState === APP_STATES.LOADING" class="flex items-center justify-center h-full">
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
                    @unlock-error="handleVaultUnlockError"
                />
                <div v-else-if="appState === APP_STATES.NEEDS_AUTH" class="flex-1 flex flex-col items-center justify-center p-4">
                    <!--
                    <p v-if="!isProcessingEmailLink" class="mb-4">Please log in to continue.</p>
                    -->
                    <div v-if="isProcessingEmailLink" class="flex items-center justify-center h-full">
                        <div class="text-center">
                            <h2>Completing Sign In...</h2>
                            <p v-if="emailLinkStatusMessage" class="mt-2">{{ emailLinkStatusMessage }}</p>
                            <p v-if="emailLinkError" class="mt-2 text-red-500">{{ emailLinkError }}</p>
                            <!--
                            <button v-if="emailLinkError" @click="navigateToAuth" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Go to Login</button>
                            -->
                        </div>
                    </div>
                    <AuthForm @authenticated="handleAuthenticated" @auth-error="handleAuthError"/>
                    <p v-if="!isOnline" class="text-sm text-orange-600 dark:text-orange-400 mt-2">(Requires internet connection for initial sign-in)</p>
                    <p v-if="authErrorMessage" class="mt-4 text-red-500 text-center">{{ authErrorMessage }}</p>
                </div>
                <div v-else-if="appState === APP_STATES.OFFLINE_NEEDS_CHECK" class="flex-1 flex flex-col items-center justify-center p-4">
                    <p class="mb-2">Cannot verify vault status while offline.</p>
                    <p class="text-sm text-orange-600 dark:text-orange-400">Please connect to the internet to continue.</p>
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
                    <ExcalidrawEditor :drawing-id="currentDrawingId" />
                    <!--
                    <excalidraw-element 
      :initial-data="JSON.stringify(drawingData)"
      theme="light"
      @excalidraw-change="handleDrawingChange"
      @excalidraw-pointer-update="handlePointerUpdate"
       style="height: 500px; width:50%;"
      >
    </excalidraw-element>
-->
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
                                        <!--
                                        <DrawingComponent/>
                                        -->
                                        <!-- Use the custom element like any HTML tag -->

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
                <div v-else class="flex items-center justify-center h-full">
                    <div class="text-center p-4 bg-gray-100 border border-gray-400 text-gray-700 rounded">
                        <h2 class="font-bold mb-2">Unknown Application State</h2>
                        <p>The application is in an unexpected state: {{ appState }}</p>
                        <p class="mt-2 text-sm">Please try refreshing the page.</p>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
<script>
import { ref, reactive, onMounted, computed, provide, watch, onBeforeUnmount } from 'vue';
import { useOnline, useDark, useToggle } from "@vueuse/core";
import { noteTextStorage, appMetadataStorage } from './utils/noteTextStorage';
import { useCalendarStore } from './store/calendar';
import {
    auth,
    onAuthStateChanged,
    getEncryptedKeyFromFirestore,
    isSignInWithEmailLink,
    signInWithEmailLink,
    linkWithCredential,
    EmailAuthProvider
} from "./firebase2"; // Assuming firebase2 exports these
import { createAppSyncManager } from './sync-manager'; // Assuming sync-manager is in place
import { Splitpanes, Pane } from 'splitpanes';
import TopBar from './components/TopBar.vue';
import SidebarComponent from './components/Sidebar3.vue';

import EditorComponent from './components/CodeEditorEPages4.vue';
import CalendarEventList from './components/CalendarEventList.vue';

import AuthForm from './components/AuthForm.vue';
import VaultUnlock from './components/VaultUnlock.vue';
import PassphraseSetup from './components/PassphraseSetup.vue';
import PWAIndicator from './components/PWAIndicator.vue';

import DrawingComponent from './components/DrawingCanvas.vue' // your vue-konva component
import HybridComponent from './components/HybridComponent.vue'   // combined view
import './excalidraw-wrapper.js';
import ExcalidrawEditor from './components/ExcalidrawEditor.vue'

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
    OFFLINE_NEEDS_CHECK: 'offlineNeedsCheck',
    READY: 'ready',
    ERROR: 'error', // For general application errors that prevent function
};

export default {
    name: 'App',
    components: {
        TopBar,
        SidebarComponent,
        EditorComponent,
        CalendarEventList,
        AuthForm,
        VaultUnlock,
        PassphraseSetup,
        PWAIndicator,
        Splitpanes,
        Pane,
        DrawingComponent,
        HybridComponent,
        ExcalidrawEditor
    },
    setup() {
        const editorRef = ref(null);
        const appState = ref(APP_STATES.LOADING);
        const globalError = ref(null);


        const currentElements = ref([])
        const drawingData = reactive({
            elements: [],
            appState: {}
        })

        const currentDrawingId = ref(null);

        // Reactive state for detailed sync progress
        const syncDetailStatus = ref({
            state: 'idle', // 'idle', 'pending', 'processing', 'complete', 'error'
            processed: 0,
            total: 0,
            currentPageId: null, // or page title
            currentPageStatus: null, // e.g., 'processing', 'synced', 'skipped', 'failed'
            error: null,
            results: null // Final results summary
        });
        // --- Online Status ---
        const isOnline = useOnline();

        // --- Theme Management ---
        const isDark = useDark({
            selector: 'body',
            attribute: 'class',
            valueDark: 'dark',
            valueLight: '',
        });
        const toggleDark = useToggle(isDark);

        // --- Calendar Store & Event State ---
        const calendarStore = useCalendarStore();
        const hasEvents = computed(() => {
            return calendarStore.groupedByMonth && Object.keys(calendarStore.groupedByMonth).length > 0;
        });

        // --- Sync Manager ---
        const syncManager = ref(null);
        provide('syncManager', syncManager);

        const initializeSyncManager = () => {
            if (!syncManager.value) {
                syncManager.value = createAppSyncManager(noteTextStorage, appMetadataStorage);
            }
        };

        const performGlobalSync = async () => {
            if (!isOnline.value) {
                console.log("Sync skipped: Application is offline.");
                return;
            }
            if (!syncManager.value) {
                console.warn("Sync Manager not initialized.");
                return;
            }
            if (!isVaultUnlocked.value || !userVaultKey.value) {
                console.warn("Sync skipped: Vault is not unlocked.");
                return;
            }


             // Update status at the start
    syncDetailStatus.value = {
        state: 'pending',
        processed: 0,
        total: 0,
        currentPageId: null,
        currentPageStatus: null,
        error: null,
        results: null
    };

    // Define the event handlers
    const handleProgress = (data) => {
        console.log('Sync Progress:', data);
        syncDetailStatus.value = {
            ...syncDetailStatus.value, // Keep previous state
            state: 'processing', // Set state to processing
            processed: data.processed,
            total: data.total,
            currentPageId: data.pageId,
            currentPageStatus: data.status
        };
    };

    const handleComplete = (data) => {
        console.log('Sync Complete:', data);
        syncDetailStatus.value = {
            state: 'complete',
            processed: data.results.total,
            total: data.results.total,
            currentPageId: null,
            currentPageStatus: 'finished',
            error: null,
            results: data.results // Store final results
        };
         // Unsubscribe from events
        unsubscribe();
    };

     const handleError = (error) => {
         console.error('Sync Error Event:', error);
          syncDetailStatus.value = {
            state: 'error',
            processed: syncDetailStatus.value.processed, // Keep count where it failed
            total: syncDetailStatus.value.total,
            currentPageId: syncDetailStatus.value.currentPageId, // Keep page info
            currentPageStatus: 'error',
            error: error.message || 'Sync process failed',
            results: null // No final results on error
         };
         // Unsubscribe from events
         unsubscribe();
     };


    // Subscribe to events
    syncManager.value.on('sync-progress', handleProgress);
    syncManager.value.on('sync-complete', handleComplete);
    syncManager.value.on('sync-error', handleError); // Listen for top-level errors

    // Function to unsubscribe
    const unsubscribe = () => {
         syncManager.value.off('sync-progress', handleProgress);
         syncManager.value.off('sync-complete', handleComplete);
         syncManager.value.off('sync-error', handleError);
         console.log('Unsubscribed from sync events.');
    };

            try {
                console.log("Attempting global sync (Online)...");
                const result = await syncManager.value.syncAll({
                    forceAll: false,
                    vaultKey: userVaultKey.value
                });
                console.log('Global sync result:', result);

                        // syncAll's catch block might emit 'sync-error', but if it returns
                // an object with success: false, the 'sync-complete' handler
                // should check result.success and set the state to failed there.
                // Or, the 'sync-complete' handler can check data.results.failed > 0

                if (result && result.results && result.results.failed > 0) {
                    // If there were failed items but no top-level exception
                    syncDetailStatus.value.state = 'complete-with-errors'; // Or 'failed' if appropriate
                    syncDetailStatus.value.error = 'Some items failed to sync.';
                }
            } catch(error) {
                console.error('Global sync failed:', error);
                // Add user notification of sync failure
                // Use a toast or notification system if available
                syncDetailStatus.value = {
                ...syncDetailStatus.value,
                state: 'error',
                error: error.message || 'An unexpected error occurred during sync setup/teardown'
             };
              // Ensure unsubscribe happens even if syncAll throws before emitting complete/error
              unsubscribe();
            }
            // If the promise resolves/rejects, but no complete/error event was emitted
         // (e.g., syncAll implementation changed), ensure unsubscribe happens
         // This is less likely with the added emits, but good practice.
         // The event handlers should ideally handle unsubscribe.

        };

        const getPageRenderer = computed(() => {
            if (!selectedPage.value) return null;

            switch (selectedPage.value.type) {
                case 'drawing':
                return DrawingComponent;
                case 'hybrid':
                return HybridComponent;
                case 'note':
                default:
                return HybridComponent;//EditorComponent;
            }
        });

        // --- Layout State ---
        const isSidebarOpen = ref(false);
        const isEventbarOpen = ref(false);
        const mainPaneSize = ref(70);
        const selectedPageId = ref(null);
        const selectedPage = ref(null); // This should ideally hold content/object, not just ID? Revisit if needed.
        const selectedPageType = ref(null);
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

                isSidebarOpen.value = storedSidebar === 1 || storedSidebar === true;
                isEventbarOpen.value = storedEventbar === 1 || storedEventbar === true;

                const size = storedPaneSize?.value ?? storedPaneSize;
                if (typeof size === 'number' && size >= 10 && size <= 90) {
                    mainPaneSize.value = size;
                } else {
                    mainPaneSize.value = 70;
                    if (size !== null && size !== undefined) {
                        console.warn(`Invalid stored pane size (${size}), using default.`);
                    }
                }

                if (lastPageId) {
                    selectedPageId.value = lastPageId;
                }
            } catch (error) {
                console.error("Failed to load layout state from storage:", error);
                // Decide if a layout loading error should block app (probably not critical)
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

        // Debounce function for pane resize to prevent frequent storage operations
        const debounce = (fn, ms) => {
            let timer;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn(...args), ms);
            };
        };

        const saveSize = async (newSize) => {
            try {
                await appMetadataStorage.setItem(STORAGE_KEYS.MAIN_PANE_SIZE, newSize);
            } catch (error) {
                console.error("Failed to save pane size:", error);
            }
        };

        const debouncedSaveSize = debounce(saveSize, 300);

        const handlePaneResize = async ({ panes }) => {
            const newSize = panes[0]?.size;
            if (typeof newSize === 'number') {
                mainPaneSize.value = newSize;
                debouncedSaveSize(newSize);
            }
        };

        const handlePageSelect = async (pageId) => {
            console.log("APP6 - handlePage select")
            if (!isVaultUnlocked.value || !userVaultKey.value) {
                console.warn("Vault not unlocked, cannot select page content.");
                // Still update the ID, just don't load content yet
                selectedPageId.value = pageId;
                selectedPage.value = null; // Ensure content is null if vault locked

                try {
                    await appMetadataStorage.setItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID, pageId);
                } catch (error) {
                    console.error('Failed to set last page ID:', error);
                }
                return;
            }

            selectedPageId.value = pageId;
            if (pageId) {
                try {
                    // Assuming pageId is enough to trigger content load in EditorComponent
                    selectedPage.value = pageId; // Pass the ID to the editor
                    await appMetadataStorage.setItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID, pageId);
                } catch (error) {
                    console.error('Failed to load or set last page:', error);
                    selectedPage.value = null;
                }
            } else {
                selectedPage.value = null; // No page selected
                try {
                    await appMetadataStorage.removeItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID);
                } catch (error) {
                    console.error('Failed to remove last page ID:', error);
                }
            }
        };

        const reselectLastPage = async () => {
            // Only proceed if the vault is unlocked and the user key is available
            if (isVaultUnlocked.value && userVaultKey.value) {
                if (selectedPageId.value) {
                    // There is a previously selected page, re-select it
                    console.log(`Vault unlocked, attempting to re-select page: ${selectedPageId.value}`);
                    await handlePageSelect(selectedPageId.value);
                } else {
                    try {
                        let effectivePageId = selectedPageId.value;
                        // Try to get the last page ID from storage
                        effectivePageId = await appMetadataStorage.getItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID);
                        if (effectivePageId) {
                            await handlePageSelect(effectivePageId);
                        } else {
                            throw new Error("No last page ID found");
                        }
                    } catch (error) {
                        console.warn("Could not get last page ID, selecting first available page. Reason:", error);
                        try {
                            const firstPage = await noteTextStorage.pages.orderBy('lastModified').first();
                            if (firstPage && firstPage.id) {
                                await handlePageSelect(firstPage.id);
                            } else {
                                console.log("No pages found to select.");
                                selectedPage.value = null;
                            }
                        } catch (fallbackError) {
                            console.error("Failed to select first page from noteTextStorage:", fallbackError);
                            selectedPage.value = null;
                        }
                    }
                }
            } else {
                // Vault is not unlocked
                console.log("Vault not unlocked, cannot re-select last page content.");
                // Keep selectedPageId but ensure selectedPage content is null
                if (selectedPageId.value) {
                    selectedPage.value = null;
                }
            }
        };

        const handleSidebarClick = (lineNumber) => {
             // Only attempt to scroll if the vault is unlocked and editor is ready
            if (isVaultUnlocked.value && editorRef.value?.scrollToLine) {
                editorRef.value.scrollToLine(lineNumber);
            } else {
                console.warn("Cannot scroll to line: Vault is locked or editor not ready.");
            }
        };

        // --- Vault & Auth State ---
        const isAuthenticated = ref(false);
        const hasEncryptedKey = ref(false);
        const userVaultKey = ref(null);
        const isVaultUnlocked = ref(false);
        const isProcessingEmailLink = ref(false);
        const emailLinkStatusMessage = ref(null);
        const emailLinkError = ref(null);
        const authErrorMessage = ref(null);
        let authUnsubscribe = null; // Store auth listener for cleanup

        const checkEncryptedKeyOnline = async (userId) => {
            if (!isOnline.value) {
                console.log("Offline: Cannot check encrypted key status online.");
                return { status: 'offline' };
            }
            try {
                console.log(`Online: Checking encrypted key status for user ${userId}...`);
                // Assuming getEncryptedKeyFromFirestore returns the key data if it exists, or null/undefined otherwise
                const keyData = await getEncryptedKeyFromFirestore(userId);
                const keyExists = !!keyData; // Check if any data was returned
                console.log(`Online check result: Encrypted key exists in Firestore: ${keyExists}.`);
                // Optionally, if keyData is the encrypted key itself, you might store it temporarily
                // for the VaultUnlock component, but don't set userVaultKey yet.
                // E.g., return { status: 'online', exists: keyExists, encryptedKeyData: keyData };
                return { status: 'online', exists: keyExists };
            } catch (error) {
                if (error.code === 'unavailable' || (error.message && error.message.includes('offline')) || !isOnline.value) {
                    // Check isOnline.value again in case network status changed during the async call
                    console.warn("Firestore key check failed due to network or offline status:", error);
                    return { status: 'offline' };
                }
                console.error("Failed to fetch encrypted key online:", error);
                return { status: 'error', error: error };
            }
        };

        const handleVaultUnlocked = (decryptedKey) => {
            console.log("Vault unlocked successfully.");
            authErrorMessage.value = null; // Clear any auth errors
            userVaultKey.value = decryptedKey;
            isVaultUnlocked.value = true;
            appState.value = APP_STATES.READY; // Transition to READY
            initializeSyncManager(); // Initialize sync
            reselectLastPage(); // Attempt to load the last page content

            if (isOnline.value) {
                performGlobalSync(); // Perform sync if online
            } else {
                console.log("Vault unlocked, but offline. Sync deferred.");
            }
        };

        const handleVaultUnlockError = (error) => {
            console.error("Vault unlock failed:", error);
            authErrorMessage.value = `Vault unlock failed. Please check your passphrase. (${error.message || error})`;
            isVaultUnlocked.value = false; // Ensure vault is marked as locked
            userVaultKey.value = null; // Clear the key
            // Stay in NEEDS_VAULT_UNLOCK state
            appState.value = APP_STATES.NEEDS_VAULT_UNLOCK;
        };

        const handlePassphraseSet = async (passphrase) => {
            if (!isOnline.value) {
                console.error("Cannot set up passphrase while offline.");
                authErrorMessage.value = "Cannot set up passphrase while offline. Please connect to the internet.";
                // Stay in NEEDS_VAULT_SETUP state
                appState.value = APP_STATES.NEEDS_VAULT_SETUP;
                return;
            }
            authErrorMessage.value = null;
            console.log("Passphrase set by user (Online).");

            try {
                // Properly derive a key from the passphrase and a new salt
                const derivedKey = passphrase; // Add salt generation/handling

                // --- Placeholder for saving encrypted key/salt to Firestore ---
                // await storeEncryptedKeyAndSaltInFirestore(auth.currentUser.uid, derivedKey, salt);
                // -------------------------------------------------------------

                userVaultKey.value = derivedKey; // Store the derived key in memory
                hasEncryptedKey.value = true; // Mark that a key is now set/exists online
                isVaultUnlocked.value = true; // The vault is now unlocked in memory
                appState.value = APP_STATES.READY; // Transition to READY
                initializeSyncManager(); // Initialize sync
                reselectLastPage(); // Attempt to load the last page content

                await performGlobalSync(); // Perform initial sync
            } catch (error) {
                console.error("Error during passphrase setup:", error);
                authErrorMessage.value = `Failed to set up vault: ${error.message || error}. Please try again.`;
                userVaultKey.value = null;
                isVaultUnlocked.value = false;
                 // Stay in NEEDS_VAULT_SETUP or potentially transition to ERROR
                 // depending on error severity
                appState.value = APP_STATES.NEEDS_VAULT_SETUP;
            }
        };

        const resetVaultState = () => {
            isAuthenticated.value = false;
            hasEncryptedKey.value = false;
            userVaultKey.value = null;
            isVaultUnlocked.value = false;
            authErrorMessage.value = null;
            selectedPage.value = null; // Clear loaded page content
            selectedPageId.value = null; // Also clear the ID? Depends on desired behavior on logout.
             // Removing last page ID from storage might be appropriate on logout.
             // appMetadataStorage.removeItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID).catch(console.error);
        };

        const clearEmailLinkState = () => {
            console.log("Clearing email link processing state and URL.");
            isProcessingEmailLink.value = false;
            emailLinkStatusMessage.value = null;
            emailLinkError.value = null;

            // Clean up URL parameters completely
            if (window.location.search) {
                history.replaceState({}, document.title, window.location.pathname);
            }
            window.localStorage.removeItem('emailForSignIn');
        };

        let authInitialized = false; // Flag to prevent multiple auth listener setups

        const initializeApp = async () => {
            console.log(`Initializing App. Online: ${isOnline.value}`);
            globalError.value = null;

            // Set to LOADING unless it's already in a state that indicates progress/readiness
            if (appState.value !== APP_STATES.READY && appState.value !== APP_STATES.OFFLINE_NEEDS_CHECK && appState.value !== APP_STATES.NEEDS_AUTH && appState.value !== APP_STATES.NEEDS_VAULT_SETUP && appState.value !== APP_STATES.NEEDS_VAULT_UNLOCK && !globalError.value && !isProcessingEmailLink.value) {
                console.log("Setting appState to LOADING during init.");
                appState.value = APP_STATES.LOADING;
            } else {
                console.log(`App state already in a relevant state (${appState.value}), keeping it.`);
            }


            try {
                // Load layout state early, as it doesn't depend on auth/vault
                await loadLayoutState();
                console.log("Layout state loaded.");

                // --- Setup auth state change listener FIRST ---
                // This listener will now be active to catch any auth state changes,
                // including the one potentially triggered by email link sign-in below.
                if (!authInitialized) {
                    authInitialized = true;
                    console.log("Setting up onAuthStateChanged listener...");

                    authUnsubscribe = onAuthStateChanged(auth, async (user) => {
                        console.log(`Auth State Changed Listener Fired. User: ${user ? user.uid : 'null'}. Online: ${isOnline.value}. isProcessingEmailLink: ${isProcessingEmailLink.value}`);

                        // Allow the listener to proceed ONLY if we are not actively
                        // processing an email link sign-in AT THIS MOMENT.
                        // The email link handler will clear this flag upon completion (success or failure).
                        if (isProcessingEmailLink.value) {
                            console.log("Auth state change detected while email link is being processed. Deferring full state logic.");
                            // We return here, expecting that once email link processing
                            // finishes and clears the flag, EITHER this listener will
                            // fire again, OR the logic following the email link handling
                            // in initializeApp will correctly re-evaluate the state.
                            return;
                        }

                        // --- Core Listener Logic (runs when auth state changes and not processing email link) ---
                        if (user) {
                            console.log("Auth State Listener: User authenticated.");
                            isAuthenticated.value = true;
                            authErrorMessage.value = null;

                            const keyCheckResult = await checkEncryptedKeyOnline(user.uid);

                            if (keyCheckResult.status === 'online') {
                                hasEncryptedKey.value = keyCheckResult.exists;
                                isVaultUnlocked.value = false; // Always start as locked after auth state change
                                userVaultKey.value = null;

                                if (!hasEncryptedKey.value) {
                                    console.log("Auth state: User authenticated, no encrypted key found online. Needs vault setup.");
                                    appState.value = APP_STATES.NEEDS_VAULT_SETUP;
                                } else {
                                    console.log("Auth state: User authenticated, encrypted key found online. Needs vault unlock.");
                                    appState.value = APP_STATES.NEEDS_VAULT_UNLOCK;
                                }
                            } else if (keyCheckResult.status === 'offline') {
                                // If offline, check if the vault was already unlocked from a previous session
                                if (isVaultUnlocked.value && userVaultKey.value) {
                                    console.log("Auth state: Offline, but vault was already unlocked in memory. Entering Ready state (offline).");
                                    appState.value = APP_STATES.READY;
                                    initializeSyncManager(); // Ensure sync manager is ready for offline
                                    reselectLastPage(); // Attempt to load page from offline storage
                                } else {
                                    console.log("Auth state: Offline. Cannot verify vault status online. Blocking until online or vault unlocked.");
                                    appState.value = APP_STATES.OFFLINE_NEEDS_CHECK;
                                    isVaultUnlocked.value = false;
                                    userVaultKey.value = null;
                                    hasEncryptedKey.value = false; // Assume unknown if offline
                                }
                            } else { // keyCheckResult.status === 'error'
                                console.error("Auth state: Error checking key online:", keyCheckResult.error);
                                globalError.value = `Failed to verify account status: ${keyCheckResult.error.message || keyCheckResult.error}`;
                                appState.value = APP_STATES.ERROR;
                                resetVaultState(); // Reset all auth/vault state on critical error
                            }
                        } else {
                            console.log("Auth state: No user signed in. Needs authentication.");
                            resetVaultState(); // Clear any residual auth/vault state
                            appState.value = APP_STATES.NEEDS_AUTH;
                        }
                        console.log(`App State after auth listener processing: ${appState.value}`);
                        // --- End Core Listener Logic ---
                    });
                }
                // --- End Listener Setup ---


                // --- Handle email link sign-in *after* listener is registered ---
                if (isSignInWithEmailLink(auth, window.location.href)) {
                    console.log("Email link detected in URL.");
                    isProcessingEmailLink.value = true; // Set flag BEFORE async operation starts
                    emailLinkStatusMessage.value = 'Email link detected. Attempting to sign in...';

                    let email = window.localStorage.getItem('emailForSignIn');
                    if (!email) {
                        console.log("Email not found in localStorage, prompting user.");
                        email = window.prompt('Please provide your email for confirmation to complete sign in.');
                        if (!email) {
                            console.warn("Email link sign-in cancelled: Email not provided by user.");
                            emailLinkError.value = 'Email is required to complete sign in via link.';
                            appState.value = APP_STATES.NEEDS_AUTH; // Transition on this specific failure
                            clearEmailLinkState(); // --- IMPORTANT: Clear flag on this specific failure path ---
                            return; // Exit init flow on user cancellation
                        }
                    }

                    try {
                        console.log(`Attempting email link sign-in/linking for ${email}...`);
                        if (auth.currentUser) {
                            // User is already signed in, link the email
                            emailLinkStatusMessage.value = `Linking email ${email} to your existing account...`;
                            const credential = EmailAuthProvider.credentialWithLink(email, window.location.href);
                            await linkWithCredential(auth.currentUser, credential);
                            emailLinkStatusMessage.value = 'Email successfully linked to your account!';
                            console.log("Email successfully linked.");
                        } else {
                            // No user signed in, complete the sign-in with email link
                            emailLinkStatusMessage.value = `Signing in as ${email}...`;
                            await signInWithEmailLink(auth, email, window.location.href);
                            emailLinkStatusMessage.value = 'Sign in successful!';
                            console.log("Email sign-in successful.");
                        }

                        // --- IMPORTANT: Clear flag IMMEDIATELY after successful async operation ---
                        clearEmailLinkState();

                        // DO NOT return here on success.
                        // The onAuthStateChanged listener (which is already registered)
                        // will fire after the sign-in/linking completes. It will now
                        // find isProcessingEmailLink is false and proceed with
                        // checking the user's vault status and setting the appState.

                    } catch (e) {
                        console.error("Error completing email link sign-in/linking:", e);
                        // Handle specific Firebase auth errors
                        if (e.code === 'auth/invalid-action-code' || e.code === 'auth/expired-action-code') {
                            emailLinkError.value = 'The sign-in link is invalid or has expired. Please request a new link.';
                        } else {
                            emailLinkError.value = `Sign-in failed: ${e.message || e}`;
                        }
                        appState.value = APP_STATES.NEEDS_AUTH; // Transition on async email link failure
                        // --- IMPORTANT: Clear flag IMMEDIATELY after async failure ---
                        clearEmailLinkState();
                        return; // Exit init flow on async email link failure
                    }
                }
                // --- End Email Link Handling ---


                // --- Handle coming online or initial load without email link ---
                // This block runs if no email link was processed, OR after email link
                // processing completes (successfully or with error) and returns.
                // The onAuthStateChanged listener should have already fired and set the state
                // for the initial user (if any) upon registration, or after email link auth.
                // This serves as a fallback or re-evaluation point.
                console.log(`Re-evaluating state after email link check (or if no link). Current appState: ${appState.value}`);

                if (appState.value === APP_STATES.LOADING || appState.value === APP_STATES.OFFLINE_NEEDS_CHECK || appState.value === APP_STATES.NEEDS_AUTH) {
                    console.log(`App state is ${appState.value}, checking auth status directly if listener didn't fully set it.`);
                     const user = auth.currentUser;
                     if (user) {
                         console.log("initializeApp re-evaluation: User is authenticated.");
                         // Re-run key check and state logic if online, or if offline but needs check
                         if (isOnline.value || appState.value === APP_STATES.OFFLINE_NEEDS_CHECK) {
                             const keyCheckResult = await checkEncryptedKeyOnline(user.uid);
                             if (keyCheckResult.status === 'online') {
                                 hasEncryptedKey.value = keyCheckResult.exists;
                                 isVaultUnlocked.value = false;
                                 userVaultKey.value = null;
                                 appState.value = hasEncryptedKey.value ? APP_STATES.NEEDS_VAULT_UNLOCK : APP_STATES.NEEDS_VAULT_SETUP;
                             } else if (keyCheckResult.status === 'offline') {
                                  // If still offline, ensure state reflects this unless vault is already unlocked
                                  if (isVaultUnlocked.value && userVaultKey.value) {
                                     appState.value = APP_STATES.READY;
                                     initializeSyncManager();
                                     reselectLastPage();
                                  } else {
                                      appState.value = APP_STATES.OFFLINE_NEEDS_CHECK;
                                      isVaultUnlocked.value = false; userVaultKey.value = null; hasEncryptedKey.value = false;
                                  }
                             } else { // keyCheckResult.status === 'error'
                                 console.error("initializeApp re-evaluation: Error re-checking key online:", keyCheckResult.error);
                                 globalError.value = `Failed to verify account status during re-evaluation: ${keyCheckResult.error.message || keyCheckResult.error}`;
                                 appState.value = APP_STATES.ERROR;
                                 resetVaultState();
                             }
                         } else {
                              // Still offline and wasn't in OFFLINE_NEEDS_CHECK
                             console.log("initializeApp re-evaluation: Offline, keeping current state or NEEDS_AUTH/OFFLINE_NEEDS_CHECK.");
                             if (appState.value !== APP_STATES.NEEDS_AUTH && appState.value !== APP_STATES.OFFLINE_NEEDS_CHECK) {
                                  appState.value = APP_STATES.OFFLINE_NEEDS_CHECK;
                             }
                         }
                     } else {
                        console.log("initializeApp re-evaluation: No authenticated user.");
                         // If still in LOADING or NEEDS_AUTH and no user, ensure it's NEEDS_AUTH
                         if (appState.value !== APP_STATES.NEEDS_AUTH) {
                             resetVaultState();
                             appState.value = APP_STATES.NEEDS_AUTH;
                         }
                     }
                 } else {
                      console.log(`initializeApp re-evaluation: App state is already ${appState.value}, no further action needed.`);
                 }


                // --- Final state checks / fallback ---
                // If after all checks, the state is still LOADING, it indicates a potential issue.
                 if (appState.value === APP_STATES.LOADING) {
                     console.warn("initializeApp finished but appState is still LOADING. Forcing NEEDS_AUTH.");
                     // This is a fallback. Ideally, one of the auth/vault checks
                     // or the email link processing should have set a state.
                     resetVaultState();
                     appState.value = APP_STATES.NEEDS_AUTH;
                 }

                console.log(`Initialization sequence completed. Final appState: ${appState.value}`);

            } catch (error) {
                console.error("Critical Initialization Error:", error);
                globalError.value = `A critical error occurred during application startup: ${error.message || error}`;
                appState.value = APP_STATES.ERROR;
                resetVaultState();
                clearEmailLinkState(); // Ensure flag is cleared even on critical error
            }
        };

        const handleAuthenticated = () => {
            console.log("Authentication flow completed via AuthForm (manual login). onAuthStateChanged listener will handle state update.");
            authErrorMessage.value = null; // Clear any previous auth errors
             // No explicit state transition here; rely on the auth listener.
        };

        const handleAuthError = (error) => {
            console.error("Authentication failed in AuthForm:", error);
            if (error.code) {
                switch (error.code) {
                    case 'auth/user-not-found':
                        authErrorMessage.value = 'No user found with this email.';
                        break;
                    case 'auth/wrong-password':
                        authErrorMessage.value = 'Incorrect password.';
                        break;
                    case 'auth/invalid-email':
                        authErrorMessage.value = 'Invalid email address format.';
                        break;
                    case 'auth/user-disabled':
                        authErrorMessage.value = 'Your account has been disabled.';
                        break;
                    case 'auth/operation-not-allowed':
                        authErrorMessage.value = 'Email/password sign-in is not enabled.';
                        break;
                    case 'auth/too-many-requests':
                        authErrorMessage.value = 'Too many unsuccessful login attempts. Please try again later.';
                        break;
                    case 'auth/popup-closed-by-user':
                         authErrorMessage.value = 'Authentication popup closed.';
                         break;
                     case 'auth/cancelled-popup-request':
                          authErrorMessage.value = 'Authentication popup request cancelled.';
                          break;
                    default:
                        authErrorMessage.value = `Authentication failed: ${error.message || error}`;
                }
            } else {
                authErrorMessage.value = `Authentication failed: ${error.message || error}`;
            }
            // The appState should likely remain NEEDS_AUTH on login errors.
            appState.value = APP_STATES.NEEDS_AUTH;
        };

        const navigateToAuth = () => {
            console.log("Navigating to Auth state.");
            clearEmailLinkState(); // Clear any residual email link state when manually navigating to auth
            appState.value = APP_STATES.NEEDS_AUTH;
            history.replaceState({}, document.title, window.location.pathname); // Clean URL
        };

        
        const handleDrawingChange = (event) => {
  console.log('Drawing changed:', event.detail)
  const { elements, appState } = event.detail
  
  currentElements.value = elements
  drawingData.elements = elements
  drawingData.appState = appState
}
    
    const handlePointerUpdate = (event) => {
      console.log('Pointer update:', event.detail);
    };
    
    const saveDrawing = () => {
      // Save the current drawing state
      localStorage.setItem('my-drawing', JSON.stringify(this.drawingData));
    };
  

        onMounted(() => {
            initializeApp();
        });

        // Clean up auth listener on component unmount
        onBeforeUnmount(() => {
            if (authUnsubscribe) {
                console.log("Cleaning up onAuthStateChanged listener.");
                authUnsubscribe();
                authUnsubscribe = null;
            }
        });

        // Watch for online status changes
        watch(isOnline, (currentlyOnline, previouslyOnline) => {
            console.log(`Network status changed. Was Online: ${previouslyOnline}, Is Online: ${currentlyOnline}`);
            if (currentlyOnline && !previouslyOnline) {
                console.log("Application came back online. Re-evaluating app state.");
                // Re-initialize logic to handle potential state transitions blocked by offline
                 initializeApp(); // Calling initializeApp to re-run checks
            } else if (!currentlyOnline && previouslyOnline) {
                console.log("Application went offline.");
                // If we were in a state that requires online (like NEEDS_AUTH, SETUP, UNLOCK)
                // and weren't already marked offline, transition to OFFLINE_NEEDS_CHECK
                if (appState.value === APP_STATES.NEEDS_AUTH ||
                    appState.value === APP_STATES.NEEDS_VAULT_SETUP ||
                    appState.value === APP_STATES.NEEDS_VAULT_UNLOCK) {
                    console.log(`App state ${appState.value} requires online access. Transitioning to OFFLINE_NEEDS_CHECK.`);
                    appState.value = APP_STATES.OFFLINE_NEEDS_CHECK;
                } else if (appState.value === APP_STATES.READY && isVaultUnlocked.value) {
                    console.log("Offline in READY state (vault unlocked). Functionality is limited.");
                }
            }
        });

        // Watch for vault unlock state changes
        watch(isVaultUnlocked, (isUnlocked) => {
            console.log(`Vault Unlocked state changed: ${isUnlocked}`);
            if (isUnlocked) {
                // Vault just became unlocked, attempt to re-select the last page
                reselectLastPage();
                // If we were in OFFLINE_NEEDS_CHECK and the vault was unlocked (e.g., via local cache/storage),
                // we might be able to transition to READY even if still offline.
                 if (appState.value === APP_STATES.OFFLINE_NEEDS_CHECK) {
                      console.log("Vault unlocked while in OFFLINE_NEEDS_CHECK. Transitioning to READY (potentially offline).");
                      appState.value = APP_STATES.READY;
                      initializeSyncManager(); // Ensure sync manager is initialized
                      // Sync will be attempted if/when online
                 }
            } else {
                // Vault just became locked
                userVaultKey.value = null; // Ensure key is null
                //selectedPage.value = null; // Clear loaded page content
                 // Decide if you want to clear selectedPageId on lock.
                 // Keeping it might allow re-selection after unlock.
                 // If (appState.value === APP_STATES.READY) { ... transition to NEEDS_VAULT_UNLOCK/OFFLINE? ... }
            }
        });

         // Watch appState for logging or debugging transitions
         watch(appState, (newState, oldState) => {
             console.log(`App State Transition: ${oldState} -> ${newState}`);
         }, { immediate: true }); // Log initial state too

        return {
            // App State & Constants
            appState,
            APP_STATES,
            isOnline,
            globalError,

            // Email Link Processing State
            isProcessingEmailLink,
            emailLinkStatusMessage,
            emailLinkError,
            navigateToAuth,

            // Layout State & Methods
            getPageRenderer,
            isSidebarOpen, isEventbarOpen, mainPaneSize, midPaneSize, eventPaneSize,
            selectedPageId, selectedPage, editorRef,
            toggleSidebar, toggleEventbar, handlePaneResize, handlePageSelect, handleSidebarClick,

            // Theme
            isDark, toggleDark,

            // Vault & Auth State & Methods
            isAuthenticated, // Expose auth status if needed for UI elements
            hasEncryptedKey, // Expose if needed for UI elements (e.g., showing vault setup option)
            isVaultUnlocked, userVaultKey,
            handleVaultUnlocked, handlePassphraseSet, handleAuthenticated,
            handleVaultUnlockError,
            handleAuthError,
            authErrorMessage,
            resetVaultState, // Expose if logout functionality is needed

            // Calendar
            hasEvents,

            // Methods
            performGlobalSync,
            syncDetailStatus,

            handleDrawingChange,
            handlePointerUpdate,
            saveDrawing
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