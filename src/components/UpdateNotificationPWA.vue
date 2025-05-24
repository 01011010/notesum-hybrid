<template>
  <div v-if="updateAvailable" class="fixed bottom-4 right-4 z-50">
    <button 
      @click="performUpdate" 
      class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded shadow-lg transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" width="40" height="40" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
        <path d="M19.933 13.041a8 8 0 1 1 -9.925 -8.788c3.899 -1 7.935 1.007 9.425 4.747"></path>
        <path d="M20 4v5h-5"></path>
      </svg>
      <span class="hidden sm:block">Update</span>
    </button>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

export default {
  setup() {
    const updateAvailable = ref(false)
    const intervalMS = 60 * 60 * 1000 // 60 minutes
    
    // Register service worker with a periodic check interval
    const { updateServiceWorker } = useRegisterSW({
      immediate: true,
      onRegistered(r) {
        //console.log('SW registered:', r)
      },
      onRegisterError(error) {
        console.error('SW registration error', error)
      },
      onOfflineReady() {
        console.log('App ready to work offline')
      },
      onNeedRefresh() {
        // This is triggered when a new version is available
        updateAvailable.value = true
      },
      registerType: 'autoUpdate',
      registerSW: true,
      intervalMS,
    })
    
    // Function to handle the update button click
    const performUpdate = () => {
      console.log('Updating application...')
      updateServiceWorker(true) // Pass true to reload the page after update
    }
    
    // For testing only - in development mode
    onMounted(() => {
      if (import.meta.env.DEV) {
        setTimeout(() => {
          updateAvailable.value = true
        }, 3000) // Show update button after 3 seconds
      }
    })

    return {
      updateAvailable,
      performUpdate
    }
  }
}
</script>