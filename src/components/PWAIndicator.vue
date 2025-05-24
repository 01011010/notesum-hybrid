<template>
  <div v-if="needRefresh || shouldShowInstallPrompt" class="pwa-indicator p-3 bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700 rounded shadow-md text-sm text-blue-800 dark:text-blue-200">

    <div v-if="needRefresh" class="flex items-center justify-between gap-3">
      <span>New content available, click reload to update.</span>
      <button
        @click="refreshApp"
        :disabled="reloading"
        class="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
      >
        <svg v-if="reloading" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <svg v-else v-bind="ype">
           <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
           <path d="M19.933 13.041a8 8 0 1 1 -9.925 -8.788c3.899 -1 7.935 1.007 9.425 4.747"></path>
           <path d="M20 4v5h-5"></path>
        </svg>
        <span>Reload</span>
      </button>
    </div>

    <div v-else-if="shouldShowInstallPrompt" class="flex items-center justify-between gap-3">
       <span>Install this app?</span>
       <div class="flex gap-2">
          <button
            @click="installApp"
             class="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded inline-flex items-center"
          >
             Install
          </button>
          <button
            @click="dismissInstall"
            class="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded inline-flex items-center"
          >
            Dismiss
          </button>
       </div>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue';
// Correctly import the composable we created
import { usePwaLogic } from '../usePwaLogic';

// Instantiate the composable
const {
  needRefresh,
  updateServiceWorker, // The function to trigger the update
  reloading,           // The state for the reload button's disabled/spinner status

  showInstallPrompt,   // Reactive ref from the composable (based on prompt event)
  hideInstallPrompt,   // Reactive ref from the composable (based on localStorage)
  isInstalled,         // Computed ref from the composable
  install,             // Install function from the composable
  cancelInstall,       // Cancel/Dismiss function from the composable
} = usePwaLogic();

// Computed property to simplify the v-if condition for install prompt
const shouldShowInstallPrompt = computed(() => {
  return showInstallPrompt.value && !isInstalled.value && !hideInstallPrompt.value;
});


// --- Methods ---
// Wrapper for the update function (already handles reloading state internally now)
const refreshApp = () => {
  updateServiceWorker();
};

// Wrapper for the install function
const installApp = () => {
  install();
};

// Wrapper for the dismiss/cancel function
const dismissInstall = () => {
  cancelInstall();
};

// --- Static objects derived from compiled code (for SVG binding) ---
const ype = {
  // key: 1, // Key is usually not needed here unless in v-for
  xmlns: "http://www.w3.org/2000/svg",
  class: "h-4 w-4", // Tailwind class
  width: "40",
  height: "40",
  viewBox: "0 0 24 24",
  "stroke-width": "3",
  stroke: "currentColor",
  fill: "none",
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};
// Note: `gpe` is removed as classes are applied directly

</script>

<style scoped>
.pwa-indicator {
  position: fixed;
  bottom: 1rem;
  right: 10rem;
  z-index: 100; /* Ensure it's above other content */
  max-width: calc(100% - 2rem); /* Prevent overflow on small screens */
}
</style>