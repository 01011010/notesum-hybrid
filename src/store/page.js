// store/page.js (Pinia store)
import { defineStore } from 'pinia';

export const usePageStore = defineStore('page', {
    state: () => ({
        selectedPageId: null,
        listeners: []
    }),
    actions: {
        selectPage(pageId) {
            this.selectedPageId = pageId;
            this.listeners.forEach(listener => listener(pageId));
        },
        addListener(callback) {
            this.listeners.push(callback);
        },
        removeListener(callback) {
            this.listeners = this.listeners.filter(listener => listener !== callback);
        }
    }
});