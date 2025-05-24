// pageChangeTracker.js
import { watch } from 'vue';
import { storeToRefs } from 'pinia';
import { usePageStore } from '../store/page'; // Import usePageStore

const pageChangeTracker = {
    pageChanged: false,
    clearParsedResults: false, // Add this flag
    init(pinia) { // Accept the Pinia instance
        if (!pinia) {
            console.error("pinia not initialized");
            return;
        }
        const pageStore = usePageStore(pinia); // Pass Pinia to usePageStore
        const { selectedPageId } = storeToRefs(pageStore);

        watch(selectedPageId, (newValue, oldValue) => {
            if (newValue !== null && newValue !== oldValue) {
                this.pageChanged = true;
                this.clearParsedResults = true; // Set the flag
            }
        });
    },
    reset() {
        this.pageChanged = false;
        this.clearParsedResults = false; // Reset the flag
    }
};
export default pageChangeTracker;