// stores/settingsStore.js
import { defineStore } from 'pinia';
import { appMetadataStorage } from '../utils/noteTextStorage';

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    timezone: 'UTC',
    worker: null,
  }),
  actions: {
    setTimezone(newTimezone) {
      this.timezone = newTimezone;
      
      // Update the worker if it exists
      /*
      if (this.worker) {
        this.worker.postMessage({ type: 'updateTimezone', timezone: newTimezone });
      }
        */
      
      // You might also persist this to your storage
      appMetadataStorage.setItem('selectedTimezone', newTimezone);
    },
    /*
    setWorker(worker) {
      this.worker = worker;
      
      // Initialize worker with current timezone
      worker.postMessage({ type: 'updateTimezone', timezone: this.timezone });
    },
    */
    async initializeTimezone() {
      try {
        const storedTimezone = await appMetadataStorage.getItem('selectedTimezone');
        if (storedTimezone) {
          this.timezone = storedTimezone;
        }
      } catch (error) {
        console.error('Failed to get timezone:', error);
      }
    }
  },
  getters: {
    currentTimezone: (state) => state.timezone
  }
});