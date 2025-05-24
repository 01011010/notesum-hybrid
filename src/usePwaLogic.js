// src/composables/usePwaLogic.js
import { ref, computed, onMounted, onUnmounted } from 'vue';
// Import registerSW function from Vite PWA plugin virtual module
// Note: Depending on your setup/plugin version, you might need 'virtual:pwa-register/vue'
// import { registerSW } from 'virtual:pwa-register';
import { useRegisterSW } from 'virtual:pwa-register/vue'

const PWA_LS_HIDE_KEY = 'hidePwaInstallPrompt';
const PWA_UPDATE_INTERVAL = 60 * 60 * 1000; // Check for updates every hour (example)

export function usePwaLogic() {
   const pwaOfflineReady = ref(false); // Renamed to avoid conflict if destructured later
  const pwaNeedRefresh = ref(false);  // Renamed to avoid conflict if destructured later
  const reloading = ref(false);

  let updateServiceWorker; // Will hold the function to trigger update

    // Rename the variable holding the function from useRegisterSW
  // to avoid collision with the exported function name
  let triggerServiceWorkerUpdate = () => {
    console.warn("Update function called before SW registration completed.");
    return Promise.resolve(); // Return resolved promise if called too early
};

  // --- Install Prompt Logic ---
  const installPromptEvent = ref(null); // Holds the BeforeInstallPromptEvent
  const showInstallPrompt = computed(() => !!installPromptEvent.value);
  const hideInstallPrompt = ref(localStorage.getItem(PWA_LS_HIDE_KEY) === 'true');

  const isInstalled = computed(() => {
    if (typeof window !== 'undefined') {
      // Check standard PWA standalone mode
      if (window.matchMedia('(display-mode: standalone)').matches) {
        return true;
      }
      // Check iOS specific standalone mode (common heuristic)
      if (window.navigator.standalone === true) {
        return true;
      }
    }
    return false;
  });

  const install = async () => {
    const promptEvent = installPromptEvent.value;
    if (!promptEvent) {
      console.warn('Install prompt not available');
      return;
    }
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      // Reset the prompt event as it can only be used once
      installPromptEvent.value = null;
    } catch (error) {
      console.error('Error showing install prompt:', error);
      installPromptEvent.value = null; // Clear on error too
    }
  };

  const cancelInstall = () => {
    installPromptEvent.value = null; // Clear the prompt event
    hideInstallPrompt.value = true; // Set the flag to hide persistently
    localStorage.setItem(PWA_LS_HIDE_KEY, 'true');
  };

  const beforeInstallPromptHandler = (event) => {
    // Prevent the mini-infobar from appearing on mobile
    event.preventDefault();
    console.log('beforeinstallprompt event captured');
    // Stash the event so it can be triggered later.
    installPromptEvent.value = event;
    // Optionally reset the hide flag if a new prompt becomes available
    // hideInstallPrompt.value = false;
    // localStorage.removeItem(PWA_LS_HIDE_KEY);
  };

  const appInstalledHandler = () => {
    console.log('PWA installed');
    // Clear the install prompt event after installation
    installPromptEvent.value = null;
    // Optionally hide the indicator permanently after install
    // hideInstallPrompt.value = true;
    // localStorage.setItem(PWA_LS_HIDE_KEY, 'true');
  };

   // --- Service Worker Registration & Update Logic ---
   const registerPwa = () => {
    // Destructure the result from useRegisterSW
    const {
        offlineReady: swOfflineReady, // Assign to different local const/ref if needed elsewhere
        needRefresh: swNeedRefresh,   // Assign to different local const/ref if needed elsewhere
        updateServiceWorker: swUpdateFn // Assign the function to a temporary name
    } = useRegisterSW({
      immediate: true,
      onNeedRefresh() {
        console.log('PWA: New content available, need refresh.');
        pwaNeedRefresh.value = true; // Update our composable's state
      },
      onOfflineReady() {
        console.log('PWA: App ready to work offline.');
        pwaOfflineReady.value = true; // Update our composable's state
      },
      onRegistered(registration) {
        console.log('PWA: Service Worker registered successfully.', registration);
        // Optional: Set up periodic check for updates (consider clearing interval on unmount)
        if (registration) {
          // ... (interval logic - remember to clear on unmount)
        }
      },
      onRegisterError(error) {
        console.error('PWA: Service Worker registration error:', error);
      },
    });

    // Assign the correctly destructured function to our internal variable
    triggerServiceWorkerUpdate = swUpdateFn;
  };

  // --- Lifecycle Hooks ---
  onMounted(() => {
    window.addEventListener('beforeinstallprompt', beforeInstallPromptHandler);
    window.addEventListener('appinstalled', appInstalledHandler);
    registerPwa(); // Start registration when component mounts
  });

  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', beforeInstallPromptHandler);
    window.removeEventListener('appinstalled', appInstalledHandler);
    // TODO: Clear the interval set in onRegistered if you implement it
  });

  // --- Returned Values ---
  return {
    // SW State & Actions
    offlineReady: pwaOfflineReady, // Return our state refs
    needRefresh: pwaNeedRefresh,
    reloading,
    // Exported function - name matches the key, calls the internal variable
    updateServiceWorker: async () => {
      reloading.value = true;
      // Call the correctly assigned internal function variable
      // Add a check for the function itself for robustness
      if (typeof triggerServiceWorkerUpdate === 'function') {
         try {
            await triggerServiceWorkerUpdate(); // Call the actual update function
         } catch (error) {
            console.error("Error triggering service worker update:", error);
            reloading.value = false; // Reset state on error
         }
      } else {
          console.error("triggerServiceWorkerUpdate is not a function when called.");
          reloading.value = false; // Reset state if function not available
      }
      // Note: Reloading logic still depends on PWA strategy ('prompt' vs 'autoUpdate')
      // Consider adding manual reload logic if using 'prompt' strategy
      // Or a failsafe timeout to reset reloading.value if needed
      // setTimeout(() => reloading.value = false, 5000);
    },

    // Install Prompt State & Actions
    showInstallPrompt,
    hideInstallPrompt,
    isInstalled,
    install,
    cancelInstall,
  };
}
