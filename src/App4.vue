<template>
    <div :class="{ dark: isDark }" class="h-screen w-full text-gray-900 bg-white dark:bg-custom-dark dark:text-white">

        <div v-if="globalError" class="flex items-center justify-center h-full">
            <div class="text-center p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                <h2 class="font-bold mb-2">Application Error</h2>
                <p>{{ globalError }}</p>
                 <p class="mt-2 text-sm">Please try refreshing the page.</p>
            </div>
        </div>

        <div v-else-if="isProcessingEmailLink" class="flex items-center justify-center h-full">
            <div class="text-center">
                <h2>Completing Sign In...</h2>
                <p v-if="emailLinkStatusMessage" class="mt-2">{{ emailLinkStatusMessage }}</p>
                <p v-if="emailLinkError" class="mt-2 text-red-500">{{ emailLinkError }}</p>
                <button v-if="emailLinkError" @click="navigateToAuth" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Go to Login</button>
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
                    <p class="mb-4">Please log in to continue.</p>
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
import { ref, onMounted, computed, provide, watch } from 'vue';
import { useOnline, useDark, useToggle } from "@vueuse/core";
import { noteTextStorage, appMetadataStorage } from './utils/noteTextStorage';
import { useCalendarStore } from './store/calendar';
import {
    auth,
    onAuthStateChanged,
    getEncryptedKeyFromFirestore,
    syncDexieToFirestore, // Consider error handling for this
    isSignInWithEmailLink,
    signInWithEmailLink,
    linkWithCredential,
    EmailAuthProvider
} from "./firebase2";
import { createAppSyncManager } from './sync-manager'; // Consider error handling in sync-manager
import { Splitpanes, Pane } from 'splitpanes';
//import 'splitpanes/dist/splitpanes.css'; // Ensure this is handled in your build

// Import Components (assuming they exist)
import TopBar from './components/TopBar.vue';
import SidebarComponent from './components/Sidebar3.vue';
import EditorComponent from './components/CodeEditorEPages4.vue';
import CalendarEventList from './components/CalendarEventList.vue';

import AuthForm from './components/AuthForm.vue';
import VaultUnlock from './components/VaultUnlock.vue';
import PassphraseSetup from './components/PassphraseSetup.vue';

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
    OFFLINE_NEEDS_CHECK: 'offlineNeedsCheck',
    READY: 'ready',
    ERROR: 'error', // For general application errors that prevent function
};
// --- End Constants ---

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
    },
    setup() {
        const editorRef = ref(null);
        const appState = ref(APP_STATES.LOADING);
        const globalError = ref(null); // New state for critical unrecoverable errors

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
            return calendarStore.groupedByMonth && Object.keys(calendarStore.groupedByMonth).length > 0;
        });
        // --- End Calendar Store & Event State ---

        // --- Sync Manager ---
        const syncManager = ref(null);
        provide('syncManager', syncManager);

        const initializeSyncManager = () => {
            if (!syncManager.value) { // Create only once
                // Add error handling for sync operations within the sync manager itself
                // or wrap syncManager.value.syncAll calls in try/catch if errors need
                // to affect the UI state (e.g., show a sync error notification)
                syncManager.value = createAppSyncManager(noteTextStorage, appMetadataStorage);
            }
        };

        // Modified performGlobalSync to handle potential errors
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
             if (!isVaultUnlocked.value || !userVaultKey.value) {
                 console.warn("Sync skipped: Vault is not unlocked.");
                 return; // Cannot sync without the decrypted key
             }

            try {
                console.log("Attempting global sync (Online)...");
                 // Pass the decrypted key to the sync manager
                 const result = await syncManager.value.syncAll({ forceAll: false, vaultKey: userVaultKey.value });
                console.log('Global sync result:', result);
                // Optionally provide sync success feedback
            } catch(error) {
                console.error('Global sync failed:', error);
                // Provide user feedback about sync failure
                // This might not be a critical app error, so perhaps a notification
                // rather than setting appState.value = APP_STATES.ERROR
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

                const size = storedPaneSize?.value ?? storedPaneSize;
                if (typeof size === 'number' && size >= 10 && size <= 90) { // Adjusted max size slightly
                    mainPaneSize.value = size;
                } else {
                    mainPaneSize.value = 70; // Fallback to default
                    if (size !== null && size !== undefined) {
                        console.warn(`Invalid stored pane size (${size}), using default.`);
                    }
                }

                if (lastPageId) {
                     // Defer loading page content until vault is unlocked if needed
                    selectedPageId.value = lastPageId;
                }

            } catch (error) {
                console.error("Failed to load layout state from storage:", error);
                // This might not be a critical error, app can proceed with defaults
                // Optionally show a user notification about loading issues
            }
        };

        const toggleSidebar = async () => {
            isSidebarOpen.value = !isSidebarOpen.value;
            try {
                await appMetadataStorage.setItem(STORAGE_KEYS.IS_SIDEBAR_OPEN, isSidebarOpen.value ? 1 : 0);
            } catch (error) {
                console.error("Failed to save sidebar state:", error);
                // Optionally show a user notification
            }
        };

        const toggleEventbar = async () => {
            isEventbarOpen.value = !isEventbarOpen.value;
            try {
                await appMetadataStorage.setItem(STORAGE_KEYS.IS_EVENTBAR_OPEN, isEventbarOpen.value ? 1 : 0);
            } catch (error) {
                console.error("Failed to save event bar state:", error);
                // Optionally show a user notification
            }
        };

        const handlePaneResize = async ({ panes }) => {
            const newSize = panes[0]?.size;
            if (typeof newSize === 'number') {
                mainPaneSize.value = newSize;
                try {
                    // Consider debouncing this in a real app if resizing is frequent
                    await appMetadataStorage.setItem(STORAGE_KEYS.MAIN_PANE_SIZE, newSize);
                } catch (error) {
                    console.error("Failed to save pane size:", error);
                    // Optionally show a user notification
                }
            }
        };

        const handlePageSelect = async (pageId) => {
            // Only attempt to load page content if vault is unlocked
            if (!isVaultUnlocked.value || !userVaultKey.value) {
                console.warn("Vault not unlocked, cannot select page content.");
                // Optionally provide user feedback
                selectedPageId.value = pageId; // Still mark ID, but content is null
                // Defer setting selectedPage until vault is unlocked?
                // Or EditorComponent handles read-only state based on vaultKey?
                 selectedPage.value = pageId; // Pass the ID
                await appMetadataStorage.setItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID, pageId);
                return;
            }

            selectedPageId.value = pageId;
            if (pageId) {
                try {
                    // Assuming pageId is sufficient to identify the page data needed by EditorComponent
                    // If you need to load content here:
                    // selectedPage.value = await noteTextStorage.getItem(pageId); // Example loading content
                     selectedPage.value = pageId; // Pass the ID for now, EditorComponent loads content
                    await appMetadataStorage.setItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID, pageId);
                } catch (error) {
                    console.error('Failed to load or set last page:', error);
                    selectedPage.value = null; // Clear selection on error
                     // Add user feedback (e.g., toast)
                }
            } else {
                selectedPage.value = null;
                try {
                    await appMetadataStorage.removeItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID);
                } catch (error) {
                     console.error('Failed to remove last page ID:', error);
                     // Optionally show user feedback
                }
            }
        };

         // Re-select the last page ID after vault unlock if one was previously selected
         const reselectLastPage = async () => {
             if (selectedPageId.value && isVaultUnlocked.value && userVaultKey.value) {
                 console.log(`Vault unlocked, attempting to re-select page: ${selectedPageId.value}`);
                 await handlePageSelect(selectedPageId.value); // Re-run page select logic
             } else {
                  console.log("Vault unlocked, but no last page selected or vault still locked.");
             }
         };


        const handleSidebarClick = (lineNumber) => {
            editorRef.value?.scrollToLine(lineNumber);
        };
        // --- End Layout State ---

        // --- Vault & Auth State ---
        const isAuthenticated = ref(false);
        const hasEncryptedKey = ref(false); // Tracks if the *mechanism* exists (key stored in Firestore)
        const userVaultKey = ref(null);     // The *decrypted* key, only in memory when unlocked
        const isVaultUnlocked = ref(false); // Tracks if the user has successfully unlocked in this session

        // Refs for email link handling feedback
        const isProcessingEmailLink = ref(false);
        const emailLinkStatusMessage = ref(null);
        const emailLinkError = ref(null);

         // Ref for general authentication errors (e.g., wrong password in AuthForm)
         const authErrorMessage = ref(null);


        // Modified to handle offline and errors gracefully
        const checkEncryptedKeyOnline = async (userId) => {
            if (!isOnline.value) {
                console.log("Offline: Cannot check encrypted key status online.");
                return { status: 'offline' }; // Indicate offline status
            }
            try {
                console.log(`Online: Checking encrypted key status for user ${userId}...`);
                const keyExists = await getEncryptedKeyFromFirestore(userId);
                console.log(`Online check result: Encrypted key exists in Firestore: ${!!keyExists}.`);
                return { status: 'online', exists: !!keyExists };
            } catch (error) {
                 // Differentiate network errors from others if possible
                 // Firebase errors like 'unavailable' often indicate network issues
                 if (error.code === 'unavailable' || (error.message && error.message.includes('offline'))) {
                    console.warn("Firestore key check failed due to network:", error);
                    return { status: 'offline' }; // Treat as offline for state purposes
                }
                console.error("Failed to fetch encrypted key online:", error);
                // This is a potentially critical error during the auth flow
                return { status: 'error', error: error }; // Indicate error
            }
        };

        const handleVaultUnlocked = (decryptedKey) => {
            console.log("Vault unlocked successfully.");
             // Clear any previous unlock errors
            authErrorMessage.value = null;
            userVaultKey.value = decryptedKey;
            isVaultUnlocked.value = true; // Mark as unlocked for this session
            appState.value = APP_STATES.READY;
            initializeSyncManager(); // Initialize sync manager now that key is available
             reselectLastPage(); // Attempt to load the last page content
            // Attempt sync only if online
            if (isOnline.value) {
                 // Assuming syncDexieToFirestore uses the provided vault key
                 // If it relies on the global userVaultKey ref, that's fine.
                performGlobalSync(); // Use the new error-handled sync
            } else {
                console.log("Vault unlocked, but offline. Sync deferred.");
            }
        };

        const handleVaultUnlockError = (error) => {
             console.error("Vault unlock failed:", error);
             // Provide user feedback
             authErrorMessage.value = `Vault unlock failed. Please check your passphrase. (${error.message || error})`;
             // Stay in NEEDS_VAULT_UNLOCK state
             isVaultUnlocked.value = false;
             userVaultKey.value = null;
        };


        const handlePassphraseSet = async (passphrase) => {
            if (!isOnline.value) {
                console.error("Cannot set up passphrase while offline.");
                authErrorMessage.value = "Cannot set up passphrase while offline. Please connect to the internet.";
                return; // Stay in NEEDS_VAULT_SETUP state
            }
             authErrorMessage.value = null; // Clear previous errors
            console.log("Passphrase set by user (Online).");

            try {
                const derivedKey = passphrase; // <<< !!! REPLACE WITH ACTUAL KEY DERIVATION !!!
                // Assume: await storeEncryptedKeyCheckInFirestore(auth.currentUser.uid, derivedKey...); succeeds
                // This operation also needs robust error handling in its implementation.
                // If storing the key fails, we should ideally report an error and potentially
                // stay in the NEEDS_VAULT_SETUP state or move to an error state.

                userVaultKey.value = derivedKey;
                hasEncryptedKey.value = true; // Mark key mechanism as now existing
                isVaultUnlocked.value = true; // Mark as unlocked
                appState.value = APP_STATES.READY;
                initializeSyncManager(); // Initialize sync manager
                 reselectLastPage(); // Attempt to load the last page content

                // Perform initial sync after setup
                await performGlobalSync(); // Use the new error-handled sync

            } catch (error) {
                console.error("Error during passphrase setup:", error);
                 authErrorMessage.value = `Failed to set up vault: ${error.message || error}. Please try again.`;
                // Stay in NEEDS_VAULT_SETUP state, user might need to retry
                userVaultKey.value = null;
                isVaultUnlocked.value = false;
                // hasEncryptedKey might still be true if the *firestore* op succeeded but a later step failed.
                // Re-evaluating auth state on online change might correct this.
            }
        };

        const resetVaultState = () => {
            isAuthenticated.value = false;
            hasEncryptedKey.value = false;
            userVaultKey.value = null;
            isVaultUnlocked.value = false;
             authErrorMessage.value = null; // Clear auth errors on logout
        };
        // --- End Vault & Auth State ---

        // --- Initialization ---
        let authInitialized = false; // Prevent multiple listener setups if initializeApp is called again

         // Helper to clear email link processing state and URL
         const clearEmailLinkState = () => {
             isProcessingEmailLink.value = false;
             emailLinkStatusMessage.value = null;
             emailLinkError.value = null;
             // Clean up URL parameters
             history.replaceState({}, document.title, window.location.pathname);
             window.localStorage.removeItem('emailForSignIn'); // Clean up stored email
         };

        const initializeApp = async () => {
            console.log(`Initializing App. Online: ${isOnline.value}`);
             // Reset global error state at the start of initialization
             globalError.value = null;

             // Keep current state if already READY or OFFLINE_NEEDS_CHECK, unless there's a global error
             if (appState.value !== APP_STATES.READY && appState.value !== APP_STATES.OFFLINE_NEEDS_CHECK && !globalError.value) {
                 appState.value = APP_STATES.LOADING;
             }

            try {
                // Load local UI state regardless of connectivity
                 await loadLayoutState();
                 console.log("Layout state loaded.");

                // Setup Auth Listener only once
                if (!authInitialized) {
                    authInitialized = true;
                    console.log("Setting up onAuthStateChanged listener...");

                    // --- Email Link Handling Logic (Check on initial load) ---
                    if (isSignInWithEmailLink(auth, window.location.href)) {
                        isProcessingEmailLink.value = true;
                        emailLinkStatusMessage.value = 'Email link detected. Attempting to sign in...';

                        let email = window.localStorage.getItem('emailForSignIn');
                        if (!email) {
                            email = window.prompt('Please provide your email for confirmation to complete sign in.');
                            if (!email) {
                                emailLinkError.value = 'Email is required to complete sign in via link.';
                                console.warn("Email link sign-in failed: Email not provided.");
                                clearEmailLinkState();
                                // The onAuthStateChanged listener will run and set state to NEEDS_AUTH
                                return; // Stop email link processing
                            }
                        }

                        try {
                            if (auth.currentUser) {
                                // User is already signed in, link the email
                                emailLinkStatusMessage.value = `Linking email ${email} to your existing account...`;
                                const credential = EmailAuthProvider.credentialWithLink(email, window.location.href);
                                await linkWithCredential(auth.currentUser, credential);
                                emailLinkStatusMessage.value = 'Email successfully linked to your account!';
                                console.log("Email successfully linked.");
                            } else {
                                // No user is signed in, perform standard sign-in with email link
                                emailLinkStatusMessage.value = `Signing in as ${email}...`;
                                await signInWithEmailLink(auth, email, window.location.href);
                                emailLinkStatusMessage.value = 'Sign in successful!';
                                console.log("Email sign-in successful.");
                            }

                             // Clear state and URL on success or anticipated success (before auth state change)
                            clearEmailLinkState();

                            // The onAuthStateChanged listener will be triggered automatically upon successful sign-in/linking
                            // and handle the subsequent state transition (checking vault status).
                            return; // Exit initializeApp after handling the email link flow

                        } catch (e) {
                            console.error("Error completing email link sign-in/linking:", e);
                            // Provide specific error message for invalid/expired links
                            if (e.code === 'auth/invalid-action-code' || e.code === 'auth/expired-action-code') {
                                emailLinkError.value = 'The sign-in link is invalid or has expired. Please request a new link.';
                            } else {
                                emailLinkError.value = `Sign-in failed: ${e.message}`;
                            }
                            // Clear state and URL on error
                            clearEmailLinkState();
                            // onAuthStateChanged will run next, find no user (or an unlinked user), and go to NEEDS_AUTH
                            return; // Exit initializeApp after handling the email link error
                        }
                    }
                    // --- End Email Link Handling Logic ---

                    // This listener is the central point for reacting to auth state changes
                    onAuthStateChanged(auth, async (user) => {
                        console.log(`Auth State Changed. User: ${user ? user.uid : 'null'}. Online: ${isOnline.value}`);

                        if (isProcessingEmailLink.value) {
                            // If we are still processing an email link (e.g., just finished sign-in),
                            // let the email link handling logic in initializeApp complete its cleanup
                            // before the state changes here. This avoids flickering.
                            console.log("Auth state changed while processing email link. Deferring state update.");
                             // The state will be re-evaluated once email link processing completes and clears its flag.
                             // However, if the email link process finishes *before* this listener runs for the new user,
                             // this logic ensures the new user state is correctly handled.
                             if (!isProcessingEmailLink.value) {
                                // If processing finished *just* before this ran, continue with the user check.
                                 // This else block is important to ensure state updates if the listener lags cleanup.
                             } else {
                                 return; // Still processing, wait for it to finish.
                             }
                        }


                        if (user) {
                            isAuthenticated.value = true;
                            authErrorMessage.value = null; // Clear auth errors on successful auth state change

                            // Check key status online if possible
                            const keyCheckResult = await checkEncryptedKeyOnline(user.uid);

                            if (keyCheckResult.status === 'online') {
                                hasEncryptedKey.value = keyCheckResult.exists;
                                // Reset vault unlocked state on auth state change, user must re-unlock per session
                                isVaultUnlocked.value = false;
                                userVaultKey.value = null;

                                if (!hasEncryptedKey.value) {
                                    console.log("Auth state: User authenticated, no encrypted key found. Needs vault setup.");
                                    appState.value = APP_STATES.NEEDS_VAULT_SETUP;
                                } else {
                                    console.log("Auth state: User authenticated, encrypted key found. Needs vault unlock.");
                                    appState.value = APP_STATES.NEEDS_VAULT_UNLOCK;
                                }
                            } else if (keyCheckResult.status === 'offline') {
                                // Offline: Authenticated via Firebase's cache. Cannot verify vault status online.
                                // Can proceed *only* if the vault was already unlocked in this session.
                                if (isVaultUnlocked.value && userVaultKey.value) {
                                    console.log("Auth state: Offline, but vault was already unlocked. Entering Ready state (offline).");
                                    appState.value = APP_STATES.READY; // Stay in ready state, but offline functionality
                                    initializeSyncManager(); // Ensure sync manager is initialized (though sync will be deferred)
                                     reselectLastPage(); // Attempt to load the last page content
                                } else {
                                    console.log("Auth state: Offline. Cannot verify vault status. Blocking until online.");
                                    appState.value = APP_STATES.OFFLINE_NEEDS_CHECK;
                                    // Reset flags just in case, as we don't know the true state
                                    isVaultUnlocked.value = false;
                                    userVaultKey.value = null;
                                    hasEncryptedKey.value = false; // Don't assume online status while offline
                                }
                            } else { // keyCheckResult.status === 'error'
                                console.error("Auth state: Error checking key online:", keyCheckResult.error);
                                globalError.value = `Failed to verify account status: ${keyCheckResult.error.message || keyCheckResult.error}`;
                                appState.value = APP_STATES.ERROR; // Treat as critical error
                                resetVaultState(); // Clear potentially stale vault/auth info
                            }
                        } else { // No user is signed in
                            console.log("Auth state: No user signed in. Needs authentication.");
                            resetVaultState(); // Clear any previous user/vault state
                            appState.value = APP_STATES.NEEDS_AUTH;
                        }
                        console.log(`App State after auth check: ${appState.value}`);
                    });
                } else if (isOnline.value) {
                    // If already initialized (listener is set) and coming online, re-evaluate state
                    console.log("Re-evaluating state after coming online...");
                    const user = auth.currentUser;
                    if (user) {
                         // If we were in a state that required online connectivity to resolve:
                        if (appState.value === APP_STATES.OFFLINE_NEEDS_CHECK || appState.value === APP_STATES.NEEDS_AUTH) {
                            console.log("Was blocked by offline/needs auth, re-running online checks.");
                            // Re-run the checks as if auth state just changed
                            const keyCheckResult = await checkEncryptedKeyOnline(user.uid);
                            if (keyCheckResult.status === 'online') {
                                hasEncryptedKey.value = keyCheckResult.exists;
                                // Require re-unlock unless persistence handles it (not in current setup)
                                isVaultUnlocked.value = false;
                                userVaultKey.value = null;
                                appState.value = hasEncryptedKey.value ? APP_STATES.NEEDS_VAULT_UNLOCK : APP_STATES.NEEDS_VAULT_SETUP;
                            } else if (keyCheckResult.status === 'error') {
                                console.error("Error re-checking key online after coming back:", keyCheckResult.error);
                                globalError.value = `Failed to verify account status after reconnecting: ${keyCheckResult.error.message || keyCheckResult.error}`;
                                appState.value = APP_STATES.ERROR;
                                resetVaultState();
                            }
                            // If still offline somehow (unlikely after isOnline is true), state remains OFFLINE_NEEDS_CHECK
                        } else if (appState.value === APP_STATES.READY && isVaultUnlocked.value) {
                            // Already ready and unlocked, coming online means we can sync
                             console.log("Came back online in READY state, attempting sync.");
                            performGlobalSync();
                        }
                         // If in LOADING, NEEDS_VAULT_SETUP, NEEDS_VAULT_UNLOCK, stay there unless the auth listener
                         // or subsequent actions change it. The logic inside the listener handles these online.
                    } else {
                        // Became online but no user (e.g., was offline in NEEDS_AUTH state)
                        console.log("Came back online with no authenticated user.");
                        resetVaultState();
                        appState.value = APP_STATES.NEEDS_AUTH;
                    }
                }

                // The initial state is primarily determined by the onAuthStateChanged listener.
                // The LOADING state serves as a brief interim until the listener fires.
                // If the listener fails critically or an early init step fails, globalError is set.

            } catch (error) {
                console.error("Critical Initialization Error:", error);
                // Catch any unhandled errors during the initialization process
                globalError.value = `A critical error occurred during application startup: ${error.message || error}`;
                appState.value = APP_STATES.ERROR; // Explicitly set state
                resetVaultState(); // Ensure no stale user/vault data is kept
                 clearEmailLinkState(); // Clean up email link state if an error happened mid-processing
            }
        };

        // Method to handle successful authentication from AuthForm component
        const handleAuthenticated = () => {
            console.log("Authentication flow completed via AuthForm. onAuthStateChanged listener will handle state update.");
            authErrorMessage.value = null; // Clear any previous auth errors
            // The onAuthStateChanged listener will be triggered by Firebase
            // upon successful sign-in and will handle the state transition
            // based on whether the user has an encrypted key.
        };

         // Method to handle errors from AuthForm component
         const handleAuthError = (error) => {
             console.error("Authentication failed in AuthForm:", error);
              // Provide user-friendly error message from Firebase Auth errors
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
                           authErrorMessage.value = 'Email/password sign-in is not enabled.'; // Or specific provider
                           break;
                       case 'auth/too-many-requests':
                            authErrorMessage.value = 'Too many unsuccessful login attempts. Please try again later.';
                            break;
                      default:
                          authErrorMessage.value = `Authentication failed: ${error.message || error}`;
                  }
              } else {
                   authErrorMessage.value = `Authentication failed: ${error.message || error}`;
              }
             // The app state remains NEEDS_AUTH
         };

        // Navigation helper for email link errors
        const navigateToAuth = () => {
            clearEmailLinkState(); // Ensure link state is fully cleared
            appState.value = APP_STATES.NEEDS_AUTH; // Explicitly go to auth state
             // You might also want to clear any remnants of the email link from the URL
             history.replaceState({}, document.title, window.location.pathname);
        };


        onMounted(() => {
            initializeApp();
        });

        // --- Watch for Online/Offline Changes ---
        watch(isOnline, (currentlyOnline, previouslyOnline) => {
            console.log(`Network status changed. Was Online: ${previouslyOnline}, Is Online: ${currentlyOnline}`);
            if (currentlyOnline && !previouslyOnline) {
                 // Attempt to re-initialize or re-check state when coming online
                 console.log("Coming back online, re-initializing app state check.");
                 initializeApp(); // Re-run checks, potentially trigger sync or state change
            } else if (!currentlyOnline && previouslyOnline) {
                console.log("Application went offline.");
                 // If in a state that *requires* online to proceed (auth, setup, online check):
                 if (appState.value === APP_STATES.NEEDS_AUTH || appState.value === APP_STATES.NEEDS_VAULT_SETUP || appState.value === APP_STATES.NEEDS_VAULT_UNLOCK) {
                     // The onAuthStateChanged listener logic already handles transitioning to OFFLINE_NEEDS_CHECK
                     // if it detects it's offline and the vault isn't already unlocked.
                     // If the user was mid-action (like setting a passphrase), that action
                     // should have its own offline check and potentially fail gracefully.
                     console.warn(`App state ${appState.value} may be blocked until online.`);
                     // No explicit state change needed here for these states as initializeApp/listener handles it.
                 } else if (appState.value === APP_STATES.READY) {
                     // Stay READY, but syncs will fail / be deferred.
                     console.log("Offline in READY state. Functionality is limited.");
                 }
                  // If already in OFFLINE_NEEDS_CHECK or ERROR, no state change needed.
            }
        });

         // Watch vault unlocked status to trigger page load if needed
         watch(isVaultUnlocked, (isUnlocked) => {
             if (isUnlocked) {
                 reselectLastPage();
             } else {
                  // If vault becomes locked, clear the decrypted key
                  userVaultKey.value = null;
                 // Editor should become read-only
             }
         });

         // Watch selectedPageId changes to potentially load content (handled in handlePageSelect)
         // watch(selectedPageId, (newPageId) => { /* handlePageSelect already does this */ });


        // --- End Watch ---

        return {
            // App State & Constants
            appState,
            APP_STATES,
            isOnline, // Expose online status
            globalError, // Expose global error state

            // Email Link Processing State
            isProcessingEmailLink,
            emailLinkStatusMessage,
            emailLinkError,
            navigateToAuth, // Expose helper to go to auth state

            // Layout State & Methods
            isSidebarOpen, isEventbarOpen, mainPaneSize, midPaneSize, eventPaneSize,
            selectedPageId, selectedPage, editorRef,
            toggleSidebar, toggleEventbar, handlePaneResize, handlePageSelect, handleSidebarClick,

            // Theme
            isDark, toggleDark,

            // Vault & Auth State & Methods
            // isAuthenticated, hasEncryptedKey // Less needed directly
            isVaultUnlocked, userVaultKey,
            handleVaultUnlocked, handlePassphraseSet, handleAuthenticated,
             handleVaultUnlockError, // Expose vault unlock error handler
             handleAuthError, // Expose auth form error handler
             authErrorMessage, // Expose auth error message

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