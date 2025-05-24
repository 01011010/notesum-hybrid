<template>
    <li
        class="group relative flex items-center border-b dark:border-gray-700 last:border-b-0 transition-colors text-sm"
        :class="[
            { 'bg-blue-50 dark:bg-slate-700': isSelected },
            { 'bg-gray-50/50 dark:bg-gray-900/50': !isSelected && !isEven },
            { 'bg-white dark:bg-custom-dark': !isSelected && isEven },
            { 'opacity-70 italic': isArchived && !isSelected } // Style archived items slightly differently
        ]"
    >
        <span
            @click="$emit('select', page.id)"
            class="flex-1 p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            :title="page.name"
        >
        <!--
            <span v-if="isArchived" class="text-xs" title="Archived">🗄️</span>
-->
            <div class="flex-1 overflow-hidden">
                <span class="block truncate font-medium">{{ displayName }}</span>
                <small class="text-xs text-gray-500 dark:text-gray-400">{{ displayedDate }}</small>
            </div>
        </span>
        <!-- top-1/2 -translate-y-1/2 group-hover:flex group-focus-within:flex bg-inherit  -->
        <div class="absolute right-2 gap-1 p-1 rounded items-center">
            <button
                v-if="!isPinned"
                @click.stop="$emit('pin', page.id)"
                :disabled="isProcessing"
                title="Pin page"
                class="p-1 text-sm text-gray-500 hover:text-yellow-600 dark:hover:bg-gray-600 hover:bg-blue-100 dark:hover:text-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                ☆
            </button>
            <button
                v-else
                @click.stop="$emit('unpin', page.id)"
                :disabled="isProcessing"
                title="Unpin page"
                class="p-1 text-sm text-gray-500 hover:text-green-600 dark:hover:bg-gray-600 hover:bg-blue-100 dark:text-gray-400 dark:hover:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                ⭐
            </button>
            <button
                v-if="!isArchived"
                @click.stop="$emit('archive', page.id)"
                :disabled="isProcessing"
                title="Archive page"
                class="p-1 text-sm text-gray-500 hover:text-yellow-600 dark:hover:bg-gray-600 hover:bg-blue-100 dark:hover:text-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                🗄️
            </button>
            <button
                v-else
                @click.stop="$emit('unarchive', page.id)"
                :disabled="isProcessing"
                title="Unarchive page"
                class="p-1 text-sm text-gray-500 hover:text-green-600 dark:hover:bg-gray-600 hover:bg-blue-100 dark:text-gray-400 dark:hover:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                📤
            </button>
            <button
                @click.stop="$emit('rename', page)"
                :disabled="isProcessing"
                title="Rename page"
                class="p-1 text-sm text-gray-500 hover:text-blue-600 dark:hover:bg-gray-600 hover:bg-blue-100 dark:text-gray-400 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                ✎
            </button>
            <button
                @click.stop="$emit('delete', page.id)"
                :disabled="isProcessing"
                title="Delete page"
                class="p-1 text-sm text-gray-500 hover:text-red-600 dark:hover:bg-gray-600 hover:bg-blue-100 dark:text-gray-400 dark:hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                ✕
            </button>
        </div>
    </li>
</template>

<script setup>
import { computed, ref, watchEffect } from 'vue';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { appMetadataStorage } from '../utils/noteTextStorage';
dayjs.extend(utc);
dayjs.extend(timezone);

const props = defineProps({
    page: {
        type: Object,
        required: true,
    },
    isSelected: {
        type: Boolean,
        default: false,
    },
    isProcessing: {
        type: Boolean,
        default: false,
    },
    isEven: { // For alternating row colors
        type: Boolean,
        default: false,
    },
    // *** Add isArchived prop ***
    isArchived: {
        type: Boolean,
        default: false,
    },
    isPinned: {
        type: Boolean,
        default: false,
    }
});

defineEmits(['select', 'rename', 'delete', 'archive', 'unarchive', 'pin', 'unpin']);
// 1. Create a ref to hold the formatted date string
const displayedDate = ref('No date'); // Initialize with default/loading state

// Attempt to show a cleaner name by removing the timestamp suffix
const displayName = computed(() => {
    // Basic split, adjust regex if format is more complex
    return props.page.name.replace(/_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/, '') || props.page.name;
});

const formattedDate = computed( async () => {
    // Display last modified time, fallback to created time
    /*
    const dateToShow = props.page.lastModified || props.page.createdAt;
    return dateToShow ? dayjs(dateToShow).format('MMM D, h:mm A') : 'No date';
    */
    // Show archived date if available and archived, otherwise last modified/created
    const dateToShow = props.isArchived
        ? (props.page.archivedAt || props.page.lastModified || props.page.createdAt)
        : (props.page.lastModified || props.page.createdAt);

    let prefix = '';

    if (props.isArchived && props.page.archivedAt) {
        prefix = ' '; // Add prefix to date if archived
    }

    let targetTimezone = await appMetadataStorage.getItem('selectedTimezone') || 'UTC';
    const tz = (typeof targetTimezone === 'string' && targetTimezone) ? targetTimezone : dayjs.tz.guess(); // Fallback to guessed timezone if invalid/null
    const parsedDate = dayjs(dateToShow);
    const dateInTargetZone = parsedDate.tz(tz);
    const formattedDate = dateInTargetZone.format('D MMM, YYYY, HH:mm'); 
    
    //return dateToShow ? `${prefix}${dayjs(dateToShow).format('D MMM, YYYY, HH:mm')}` : 'No date';
    return dateToShow ? `${prefix}${formattedDate}` : 'No date';

});

watchEffect(async () => {
    try {
        // Determine the date to show based on props (same logic as before)
        const dateToShow = props.isArchived
            ? (props.page.archivedAt || props.page.lastModified || props.page.createdAt)
            : (props.page.lastModified || props.page.createdAt);

        // If no valid date source, update ref and exit
        if (!dateToShow) {
            displayedDate.value = 'No date';
            return;
        }

        let prefix = '';
        if (props.isArchived && props.page.archivedAt === dateToShow) { // Ensure prefix applies to the date being shown
            prefix = 'Archived: '; // Example prefix
        } else if (props.page.lastModified === dateToShow) {
             prefix = 'Modified: '; // Example prefix
        } else if (props.page.createdAt === dateToShow) {
            prefix = 'Created: '; // Example prefix
        }


        // Perform the async operation and formatting
        let targetTimezone = await appMetadataStorage.getItem('selectedTimezone') || 'UTC';
        const tz = (typeof targetTimezone === 'string' && targetTimezone) ? targetTimezone : dayjs.tz.guess();

        const parsedDate = dayjs(dateToShow);

        if (!parsedDate.isValid()) {
            displayedDate.value = 'Invalid date'; // Handle invalid parsed date
            return;
        }

        const dateInTargetZone = parsedDate.tz(tz);
        const formattedOutput = dateInTargetZone.format('D MMM, YYYY, HH:mm'); // Your format

        // 3. Update the ref with the final computed string
        displayedDate.value = `${prefix}${formattedOutput}`;

    } catch (error) {
        console.error("Error calculating displayed date:", error);
        // Update ref with an error message or fallback
        displayedDate.value = 'Error loading date';
    }
});
</script>

<style scoped>
/* Add any specific styles for PageListItem if needed */
li span {
    /* Prevent text selection interfering with click */
    user-select: none;
}
</style>