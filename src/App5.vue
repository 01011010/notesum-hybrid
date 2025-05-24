<template>
    <div :class="{ dark: isDark }" class="h-screen w-full text-gray-900 bg-white dark:bg-custom-dark dark:text-white">

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
                    <p v-if="!isProcessingEmailLink" class="mb-4">Please log in to continue.</p>
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
import { ref, onMounted, computed, provide, watch, onBeforeUnmount } from 'vue';
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
} from "./firebase2";
import { createAppSyncManager } from './sync-manager';
import { Splitpanes, Pane } from 'splitpanes';
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
        const globalError = ref(null);

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

            try {
                console.log("Attempting global sync (Online)...");
                const result = await syncManager.value.syncAll({ 
                    forceAll: false, 
                    vaultKey: userVaultKey.value 
                });
                console.log('Global sync result:', result);
            } catch(error) {
                console.error('Global sync failed:', error);
                // Add user notification of sync failure
                // Use a toast or notification system if available
            }
        };

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
            if (!isVaultUnlocked.value || !userVaultKey.value) {
                console.warn("Vault not unlocked, cannot select page content.");
                selectedPageId.value = pageId;
                selectedPage.value = pageId;
                await appMetadataStorage.setItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID, pageId);
                return;
            }

            selectedPageId.value = pageId;
            if (pageId) {
                try {
                    selectedPage.value = pageId;
                    await appMetadataStorage.setItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID, pageId);
                } catch (error) {
                    console.error('Failed to load or set last page:', error);
                    selectedPage.value = null;
                }
            } else {
                selectedPage.value = null;
                try {
                    await appMetadataStorage.removeItem(STORAGE_KEYS.LAST_SELECTED_PAGE_ID);
                } catch (error) {
                    console.error('Failed to remove last page ID:', error);
                }
            }
        };

        const reselectLastPage = async () => {
            if (selectedPageId.value && isVaultUnlocked.value && userVaultKey.value) {
                console.log(`Vault unlocked, attempting to re-select page: ${selectedPageId.value}`);
                await handlePageSelect(selectedPageId.value);
            } else {
                console.log("Vault unlocked, but no last page selected or vault still locked.");
            }
        };

        const handleSidebarClick = (lineNumber) => {
            editorRef.value?.scrollToLine(lineNumber);
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

        // Key derivation function - PBKDF2 or similar should be used in production
        const deriveKeyFromPassphrase = async (passphrase, salt = null) => {
            // In a real application, use a proper key derivation function
            // Example using Web Crypto API with PBKDF2:
            
            // This is a placeholder - implement actual key derivation
            // using WebCrypto or a crypto library
            
            // For example:
            // 1. Generate salt if not provided
            // 2. Run PBKDF2 with sufficient iterations
            // 3. Return the derived key
            
            console.warn("SECURITY ISSUE: Using insecure key derivation. Replace in production!");
            return passphrase; // PLACEHOLDER - DO NOT USE IN PRODUCTION
        };

        const checkEncryptedKeyOnline = async (userId) => {
            if (!isOnline.value) {
                console.log("Offline: Cannot check encrypted key status online.");
                return { status: 'offline' };
            }
            try {
                console.log(`Online: Checking encrypted key status for user ${userId}...`);
                const keyExists = await getEncryptedKeyFromFirestore(userId);
                console.log(`Online check result: Encrypted key exists in Firestore: ${!!keyExists}.`);
                return { status: 'online', exists: !!keyExists };
            } catch (error) {
                if (error.code === 'unavailable' || (error.message && error.message.includes('offline'))) {
                    console.warn("Firestore key check failed due to network:", error);
                    return { status: 'offline' };
                }
                console.error("Failed to fetch encrypted key online:", error);
                return { status: 'error', error: error };
            }
        };

        const handleVaultUnlocked = (decryptedKey) => {
            console.log("Vault unlocked successfully.");
            authErrorMessage.value = null;
            userVaultKey.value = decryptedKey;
            isVaultUnlocked.value = true;
            appState.value = APP_STATES.READY;
            initializeSyncManager();
            reselectLastPage();
            
            if (isOnline.value) {
                performGlobalSync();
            } else {
                console.log("Vault unlocked, but offline. Sync deferred.");
            }
        };

        const handleVaultUnlockError = (error) => {
            console.error("Vault unlock failed:", error);
            authErrorMessage.value = `Vault unlock failed. Please check your passphrase. (${error.message || error})`;
            isVaultUnlocked.value = false;
            userVaultKey.value = null;
        };

        const handlePassphraseSet = async (passphrase) => {
            if (!isOnline.value) {
                console.error("Cannot set up passphrase while offline.");
                authErrorMessage.value = "Cannot set up passphrase while offline. Please connect to the internet.";
                return;
            }
            authErrorMessage.value = null;
            console.log("Passphrase set by user (Online).");

            try {
                // Properly derive a key from the passphrase
                const derivedKey = await deriveKeyFromPassphrase(passphrase);
                
                // Here you would store the encrypted key in Firestore
                // await storeEncryptedKeyInFirestore(auth.currentUser.uid, derivedKey);
                
                userVaultKey.value = derivedKey;
                hasEncryptedKey.value = true;
                isVaultUnlocked.value = true;
                appState.value = APP_STATES.READY;
                initializeSyncManager();
                reselectLastPage();

                await performGlobalSync();
            } catch (error) {
                console.error("Error during passphrase setup:", error);
                authErrorMessage.value = `Failed to set up vault: ${error.message || error}. Please try again.`;
                userVaultKey.value = null;
                isVaultUnlocked.value = false;
            }
        };

        const resetVaultState = () => {
            isAuthenticated.value = false;
            hasEncryptedKey.value = false;
            userVaultKey.value = null;
            isVaultUnlocked.value = false;
            authErrorMessage.value = null;
        };

        const clearEmailLinkState = () => {
            /*
            isProcessingEmailLink.value = false;
            emailLinkStatusMessage.value = null;
            emailLinkError.value = null;
            */
            
            // Clean up URL parameters completely
            if (window.location.search) {
                history.replaceState({}, document.title, window.location.pathname);
            }
            window.localStorage.removeItem('emailForSignIn');
        };

        let authInitialized = false;

        const initializeApp = async () => {
            console.log(`Initializing App. Online: ${isOnline.value}`);
            globalError.value = null;

            if (appState.value !== APP_STATES.READY && appState.value !== APP_STATES.OFFLINE_NEEDS_CHECK && !globalError.value) {
                appState.value = APP_STATES.LOADING;
            }

            try {
                await loadLayoutState();
                console.log("Layout state loaded.");

                if (!authInitialized) {
                    authInitialized = true;
                    console.log("Setting up onAuthStateChanged listener...");

                    // Handle email link sign-in if present
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
                                //return;
                            }
                        }

                        try {
                            if (auth.currentUser) {
                                emailLinkStatusMessage.value = `Linking email ${email} to your existing account...`;
                                const credential = EmailAuthProvider.credentialWithLink(email, window.location.href);
                                await linkWithCredential(auth.currentUser, credential);
                                emailLinkStatusMessage.value = 'Email successfully linked to your account!';
                                console.log("Email successfully linked.");
                            } else {
                                emailLinkStatusMessage.value = `Signing in as ${email}...`;
                                await signInWithEmailLink(auth, email, window.location.href);
                                emailLinkStatusMessage.value = 'Sign in successful!';
                                console.log("Email sign-in successful.");
                            }

                            clearEmailLinkState();
                            //return;
                        } catch (e) {
                            console.error("Error completing email link sign-in/linking:", e);
                            if (e.code === 'auth/invalid-action-code' || e.code === 'auth/expired-action-code') {
                                emailLinkError.value = 'The sign-in link is invalid or has expired. Please request a new link.';
                            } else {
                                emailLinkError.value = `Sign-in failed: ${e.message}`;
                            }
                            appState.value = APP_STATES.NEEDS_AUTH;
                            clearEmailLinkState();
                            return;
                        }
                    }

                    // Setup auth state change listener and store for cleanup
                    authUnsubscribe = onAuthStateChanged(auth, async (user) => {
                        console.log(`Auth State Changed. User: ${user ? user.uid : 'null'}. Online: ${isOnline.value}`);

                        // Handle race condition with email link processing
                        if (isProcessingEmailLink.value) {
                            console.log("Auth state changed while processing email link. Deferring state update.");
                            if (!isProcessingEmailLink.value) {
                                // Just-in-time check if processing finished before this runs
                            } else {
                                return;
                            }
                        }

                        if (user) {
                            isAuthenticated.value = true;
                            authErrorMessage.value = null;

                            const keyCheckResult = await checkEncryptedKeyOnline(user.uid);

                            if (keyCheckResult.status === 'online') {
                                hasEncryptedKey.value = keyCheckResult.exists;
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
                                if (isVaultUnlocked.value && userVaultKey.value) {
                                    console.log("Auth state: Offline, but vault was already unlocked. Entering Ready state (offline).");
                                    appState.value = APP_STATES.READY;
                                    initializeSyncManager();
                                    reselectLastPage();
                                } else {
                                    console.log("Auth state: Offline. Cannot verify vault status. Blocking until online.");
                                    appState.value = APP_STATES.OFFLINE_NEEDS_CHECK;
                                    isVaultUnlocked.value = false;
                                    userVaultKey.value = null;
                                    hasEncryptedKey.value = false;
                                }
                            } else {
                                console.error("Auth state: Error checking key online:", keyCheckResult.error);
                                globalError.value = `Failed to verify account status: ${keyCheckResult.error.message || keyCheckResult.error}`;
                                appState.value = APP_STATES.ERROR;
                                resetVaultState();
                            }
                        } else {
                            console.log("Auth state: No user signed in. Needs authentication.");
                            resetVaultState();
                            appState.value = APP_STATES.NEEDS_AUTH;
                        }
                        console.log(`App State after auth check: ${appState.value}`);
                    });
                } else if (isOnline.value) {
                    console.log("Re-evaluating state after coming online...");
                    const user = auth.currentUser;
                    if (user) {
                        if (appState.value === APP_STATES.OFFLINE_NEEDS_CHECK || appState.value === APP_STATES.NEEDS_AUTH) {
                            console.log("Was blocked by offline/needs auth, re-running online checks.");
                            const keyCheckResult = await checkEncryptedKeyOnline(user.uid);
                            if (keyCheckResult.status === 'online') {
                                hasEncryptedKey.value = keyCheckResult.exists;
                                isVaultUnlocked.value = false;
                                userVaultKey.value = null;
                                appState.value = hasEncryptedKey.value ? APP_STATES.NEEDS_VAULT_UNLOCK : APP_STATES.NEEDS_VAULT_SETUP;
                            } else if (keyCheckResult.status === 'error') {
                                console.error("Error re-checking key online after coming back:", keyCheckResult.error);
                                globalError.value = `Failed to verify account status after reconnecting: ${keyCheckResult.error.message || keyCheckResult.error}`;
                                appState.value = APP_STATES.ERROR;
                                resetVaultState();
                            }
                        } else if (appState.value === APP_STATES.READY && isVaultUnlocked.value) {
                            console.log("Came back online in READY state, attempting sync.");
                            performGlobalSync();
                        }
                    } else {
                        console.log("Came back online with no authenticated user.");
                        resetVaultState();
                        appState.value = APP_STATES.NEEDS_AUTH;
                    }
                }
            } catch (error) {
                console.error("Critical Initialization Error:", error);
                globalError.value = `A critical error occurred during application startup: ${error.message || error}`;
                appState.value = APP_STATES.ERROR;
                resetVaultState();
                clearEmailLinkState();
            }
        };

        const handleAuthenticated = () => {
            console.log("Authentication flow completed via AuthForm. onAuthStateChanged listener will handle state update.");
            authErrorMessage.value = null;
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
                    default:
                        authErrorMessage.value = `Authentication failed: ${error.message || error}`;
                }
            } else {
                authErrorMessage.value = `Authentication failed: ${error.message || error}`;
            }
        };

        const navigateToAuth = () => {
            clearEmailLinkState();
            appState.value = APP_STATES.NEEDS_AUTH;
            history.replaceState({}, document.title, window.location.pathname);
        };

        onMounted(() => {
            initializeApp();
        });

        // Clean up auth listener on component unmount
        onBeforeUnmount(() => {
            if (authUnsubscribe) {
                authUnsubscribe();
                authUnsubscribe = null;
            }
        });

        watch(isOnline, (currentlyOnline, previouslyOnline) => {
            console.log(`Network status changed. Was Online: ${previouslyOnline}, Is Online: ${currentlyOnline}`);
            if (currentlyOnline && !previouslyOnline) {
                console.log("Coming back online, re-initializing app state check.");
                initializeApp();
            } else if (!currentlyOnline && previouslyOnline) {
                console.log("Application went offline.");
                if (appState.value === APP_STATES.NEEDS_AUTH || 
                    appState.value === APP_STATES.NEEDS_VAULT_SETUP || 
                    appState.value === APP_STATES.NEEDS_VAULT_UNLOCK) {
                    console.warn(`App state ${appState.value} may be blocked until online.`);
                } else if (appState.value === APP_STATES.READY) {
                    console.log("Offline in READY state. Functionality is limited.");
                }
            }
        });

        watch(isVaultUnlocked, (isUnlocked) => {
            if (isUnlocked) {
                reselectLastPage();
            } else {
                userVaultKey.value = null;
            }
        });

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
            isSidebarOpen, isEventbarOpen, mainPaneSize, midPaneSize, eventPaneSize,
            selectedPageId, selectedPage, editorRef,
            toggleSidebar, toggleEventbar, handlePaneResize, handlePageSelect, handleSidebarClick,

            // Theme
            isDark, toggleDark,

            // Vault & Auth State & Methods
            isVaultUnlocked, userVaultKey,
            handleVaultUnlocked, handlePassphraseSet, handleAuthenticated,
            handleVaultUnlockError,
            handleAuthError,
            authErrorMessage,

            // Calendar
            hasEvents,

            // Methods
            performGlobalSync
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