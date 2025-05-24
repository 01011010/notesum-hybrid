<template>
    <div
        class="left-0 h-[calc(100vh-3rem)] transition-all duration-300 ease-in-out flex bg-white dark:bg-custom-dark"
    >
        <div
            class="bg-white dark:bg-custom-dark transition-all duration-300 ease-in-out w-full"
            :class="[isSidebarOpen ? 'translate-x-0' : '-translate-x-full']"
        >
            <form @submit.prevent="handleCreatePage()" class="p-2 border-b dark:border-gray-700">
                <div class="flex gap-2" v-if="pageList.length < MAX_PAGES">
                    <input
                        v-model="newPageName"
                        placeholder="New page name"
                        :disabled="isProcessing"
                        class="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-100 bg-white dark:bg-gray-800 dark:border-gray-700"
                    />
                    <!-- Page Type Selector -->
                    <select
                        v-model="newPageType"
                        :disabled="isProcessing"
                        class="px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-100"
                    >
                        <option value="note">📝 Note</option>
                        <option value="drawing">✏️ Drawing</option>
                        <option value="hybrid">🔀 Hybrid</option>
                    </select>
                    <button
                        type="submit"
                        :disabled="isProcessing"
                        class="px-3 py-1 text-sm bg-blue-50 text-gray-800 dark:bg-gray-800 dark:text-white rounded dark:hover:bg-gray-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        +
                    </button>
                </div>
                <div class="p-1 text-sm text-gray-600 dark:text-gray-400" v-else>
                    Page limit reached ({{ MAX_PAGES }}). Upgrade for more.
                </div>
            </form>

            <div class="p-2 border-b dark:border-gray-700">
                <div class="flex gap-2 items-center">
                    <input
                        v-model="searchTerm"
                        type="text"
                        placeholder="Search pages..."
                        class="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-100 bg-white dark:bg-gray-800 dark:border-gray-700"
                    />
                    <button
                        v-if="searchTerm"
                        @click="clearSearch"
                        title="Clear search"
                        class="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                        ✕
                    </button>
                </div>
            </div>
            <SearchContent :handlePageSelect="handlePageSelect" v-if="pageList.length > 0"/>
            <div class="flex items-center justify-end px-2 pt-1 text-xs text-gray-500 dark:text-gray-400 gap-2">
                <span v-if="!isFilterActive">{{ pageList.length }} pages</span>
                <span v-else>{{ filteredPageCount }} matching pages</span>
                <button
                    v-if="!isFilterActive && pageList.length > 0"
                    @click="toggleAllGroups"
                    class="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:focus:ring-gray-500"
                    :title="isAnyGroupOpen ? 'Collapse all groups' : 'Expand all groups'"
                    aria-label="Toggle all groups" >
                    <span v-if="isAnyGroupOpen">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" />
                        </svg>
                    </span>
                    <span v-else>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m4.5 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                        </svg>
                    </span>
                </button>
            </div>
            <ul v-if="isFilterActive" class="px-2">
                <PageListItem
                    v-for="(page, index) in filteredPages"
                    :key="page.id"
                    :page="page"
                    :isSelected="page.id === selectedPageId"
                    :isProcessing="isProcessing"
                    :isArchived="!!page.isArchived" :isEven="index % 2 === 0"
                    :isPinned="page.isPinned"
                    @select="handlePageSelect"
                    @rename="promptRename"
                    @delete="confirmDelete"
                    @archive="handleArchive"   
                    @unarchive="handleUnarchive" 
                    @pin="handlePin"
                    @unpin="handleUnpin"
                    />
            </ul>
            <div v-else v-for="(group, groupName) in groupedPages" :key="groupName">
                <div
                    v-if="group.length > 0"
                    @click="toggleGroup(groupName)"
                    class="cursor-pointer p-2 border-b dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-custom-dark z-10 hover:bg-gray-50 dark:hover:bg-gray-800"
                    :class="{'bg-gray-100 dark:bg-gray-800': openGroups[groupName]}"
                >
                    <span class="font-semibold text-sm">{{ groupName }}</span>
                    <span class="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">{{ group.length }}</span>
                </div>
                <draggable
                    v-if="openGroups[groupName] && group.length > 0"
                    :model-value="group"
                    @update:model-value="val => groupedPages[groupName] = val" 
                    group="pages"
                    @start="drag = true"
                    @end="handleDragEnd"
                    item-key="id"
                    tag="ul" 
                    class="list-none p-0 m-0" 
                    :disabled="true" 
                >
                    <template #item="{ element, index }">
                        <PageListItem
                                :page="element"
                                :isSelected="element.id === selectedPageId"
                                :isProcessing="isProcessing"
                                :isArchived="!!element.isArchived" :isEven="index % 2 === 0"
                                :isPinned="element.isPinned"
                                @select="handlePageSelect"
                                @rename="promptRename"
                                @delete="confirmDelete"
                                @archive="handleArchive"   
                                @unarchive="handleUnarchive" 
                                @pin="handlePin"
                                @unpin="handleUnpin"
                                />
                    </template>
                </draggable>
            </div>
        </div>
    </div>
</template>

<script setup>
// Using <script setup> for more concise syntax
import { ref, onMounted, computed, inject, reactive, watch } from 'vue';
import draggable from 'vuedraggable';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { noteTextStorage, appMetadataStorage } from '../utils/noteTextStorage';
import { usePageStore } from '../store/page';
import { defaultPage } from './defaultPage';
import PageListItem from './PageListItem.vue'; // Import the new component
import SearchContent from './SearchContent.vue'; // Keep if used separately

dayjs.extend(utc);
dayjs.extend(timezone);

// --- Constants ---
const MAX_PAGES = 300;
const GROUP_NAMES = {
    TODAY: 'Today',
    YESTERDAY: 'Yesterday',
    THIS_WEEK: 'This Week',
    LAST_WEEK: 'Last Week',
    LAST_MONTH: 'Last Month',
    OLDER: 'Older',
    ARCHIVE: 'Archive', // Assuming Archive isn't time-based, handle separately if needed
    PIN: 'Pin'
};
const GROUP_ORDER = [
    GROUP_NAMES.PIN,    
    GROUP_NAMES.TODAY,
    GROUP_NAMES.YESTERDAY,
    GROUP_NAMES.THIS_WEEK,
    GROUP_NAMES.LAST_WEEK,
    GROUP_NAMES.LAST_MONTH,
    GROUP_NAMES.OLDER,
    GROUP_NAMES.ARCHIVE,
];

// --- Props and Emits ---
const props = defineProps({
    selectedPageId: {
        type: String,
        default: null
    },
    isSidebarOpen: {
        type: Boolean,
        required: true
    },
});

const emit = defineEmits(['toggleSidebar', 'page-created', 'page-deleted', 'page-selected', 'page-renamed', 'pages-reordered', 'page-archived', 'page-unarchived', 'page-pin', 'page-unpin']);

// --- Injected Dependencies ---
const syncManager = inject('syncManager');
const pageStore = usePageStore();

// --- Reactive State ---
const isProcessing = ref(false);
const pageList = ref([]); // Master list of all pages
const newPageName = ref('');
// New hybrid setup start
const newPageType = ref('note'); // Default to note

const searchTerm = ref('');
const drag = ref(false); // For draggable state
const lastSelectedPageId = ref(null); // Persisted state loaded in onMounted


// --- Grouping State ---
const initialGroupState = GROUP_ORDER.reduce((acc, name) => {
    acc[name] = name === GROUP_NAMES.TODAY || name === GROUP_NAMES.PIN; // Default Today open, others closed
    return acc;
}, {});
const openGroups = reactive(initialGroupState);

// --- Computed Properties ---
const isFilterActive = computed(() => searchTerm.value.trim().length > 0);

const filteredPages = computed(() => {
    if (!isFilterActive.value) return []; // Only filter when active
    const lowerSearchTerm = searchTerm.value.toLowerCase();
    return pageList.value.filter(page =>
        page.name.toLowerCase().includes(lowerSearchTerm)
    );
});

const filteredPageCount = computed(() => filteredPages.value.length);

// NEW: Check if any group is currently open
const isAnyGroupOpen = computed(() => {
    // Check the values of the openGroups reactive object
    return Object.values(openGroups).some(isOpen => isOpen === true);
});

// Grouping Logic - only runs when not filtering
const groupedPages = computed(() => {
    // If filtering, return empty or handle differently if needed
    // This avoids recalculating groups unnecessarily while searching
    if (isFilterActive.value) return {};

    const groups = GROUP_ORDER.reduce((acc, name) => {
        acc[name] = [];
        return acc;
    }, {});

    // Sort pages once: archived last, then newest non-archived first
    const sortedPages = [...pageList.value].sort((a, b) => {

        // First prioritize pinned pages
        if (a.isPinned && !b.isPinned) return -1; // a goes before b (pinned first)
        if (!a.isPinned && b.isPinned) return 1;  // a goes after b
        
        // Prioritize non-archived pages
        if (a.isArchived && !b.isArchived) return 1; // a goes after b
        if (!a.isArchived && b.isArchived) return -1; // a goes before b

        // If both are archived or both non-archived, sort by date
        const dateA = a.lastModified || a.createdAt; // Use lastModified for relevance
        const dateB = b.lastModified || b.createdAt;
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        // Newest first for non-archived, maybe oldest first for archived? (User preference)
        // Let's keep newest first for both for now.
        return dayjs(dateB).diff(dayjs(dateA));
    });

    sortedPages.forEach(page => {
        // *** Check for Archive status FIRST ***
         // Check for Pinned status FIRST
        if (page.isPinned) {
            groups[GROUP_NAMES.PIN].push(page);
        }
        // Then check for Archive status
        else if (page.isArchived) {
            groups[GROUP_NAMES.ARCHIVE].push(page);
        } else {
            // If not archived, use time-based grouping
            const groupName = getPageGroup(page.createdAt, page.lastModified);
            if (groups[groupName]) {
                groups[groupName].push(page);
            } else {
                groups[GROUP_NAMES.OLDER].push(page); // Fallback
            }
        }
    });

    return groups;
});
// Provides the group names in the desired display order for the template v-for
const orderedGroupNames = computed(() => {
    // Only return names of groups that actually contain pages after grouping
    // This prevents rendering empty group headers.
    return GROUP_ORDER.filter(name => groupedPages.value[name]?.length > 0);
});
// --- Date & Time Formatting ---
const formatDateTime = (date) => {
    if (!date) return '';
    return dayjs(date).format('MMM D, YYYY [at] h:mm A');
};

// --- Helper Functions ---
const getPageGroup = (pageDate, lastModifiedDate) => {
    const today = dayjs.utc().startOf('day');
    const dateToCompare = pageDate || lastModifiedDate;
    if (!dateToCompare) return GROUP_NAMES.OLDER; // Or handle as needed

    const compareDay = dayjs.utc(dateToCompare).startOf('day');
    const daysDiff = today.diff(compareDay, 'day');

    if (daysDiff === 0) return GROUP_NAMES.TODAY;
    if (daysDiff === 1) return GROUP_NAMES.YESTERDAY;
    // Corrected week logic (start of week depends on locale, dayjs handles it)
    if (compareDay.isSame(today, 'week')) return GROUP_NAMES.THIS_WEEK;
    if (compareDay.isSame(today.subtract(1, 'week'), 'week')) return GROUP_NAMES.LAST_WEEK;
    // Corrected month logic
    if (compareDay.isSame(today, 'month')) return GROUP_NAMES.LAST_MONTH; // Assuming 'Last Month' means 'Within this calendar month' before this week
    // *previous* calendar month, use:
    // if (compareDay.isSame(today.subtract(1, 'month'), 'month')) return GROUP_NAMES.LAST_MONTH;

    return GROUP_NAMES.OLDER;
};


// --- Persistence ---
const loadGroupStates = async () => {
    try {
        const savedStates = await appMetadataStorage.getItem('sidebarGroupStates');
        if (savedStates) {
            Object.keys(savedStates).forEach(key => {
                if (openGroups.hasOwnProperty(key)) {
                    openGroups[key] = savedStates[key];
                }
            });
        }
    } catch (error) {
        console.error("Failed to load group states:", error);
    }
};

const saveGroupStates = async () => {
    try {
        // Use a shallow copy to avoid reactivity issues with storage
        await appMetadataStorage.setItem('sidebarGroupStates', { ...openGroups });
    } catch (error) {
        console.error("Failed to save group states:", error);
    }
};

const loadLastSelectedPage = async () => {
    try {
        lastSelectedPageId.value = await appMetadataStorage.getItem('lastSelectedPageId');
    } catch (error) {
        console.error("Failed to load last selected page ID:", error);
    }
};

const saveLastSelectedPage = async (pageId) => {
    try {
        lastSelectedPageId.value = pageId;
        await appMetadataStorage.setItem('lastSelectedPageId', pageId);
    } catch (error) {
        console.error("Failed to save last selected page ID:", error);
    }
};

// --- Page Management Methods ---
const loadPages = async () => {
    isProcessing.value = true;
    try {
        pageList.value = await noteTextStorage.getPages() || [];
        selectInitialPage();
    } catch (error) {
        console.error('Failed to load pages:', error);
        // TODO: Show user-friendly error
    } finally {
        isProcessing.value = false;
    }
};

const selectInitialPage = () => {
    if (pageList.value.length === 0) {
        handleCreateDefaultPage(); // Create default if no pages exist
    } else if (pageList.value.length === 1) {
        handlePageSelect(pageList.value[0].id); // Select the only page
    } else if (lastSelectedPageId.value) {
        const pageExists = pageList.value.some(p => p.id === lastSelectedPageId.value);
        if (pageExists) {
            handlePageSelect(lastSelectedPageId.value); // Select last used
        } else {
            handlePageSelect(pageList.value[0].id); // Fallback to first page if last selected doesn't exist
        }
    } else if (pageList.value.length > 0) {
        handlePageSelect(pageList.value[0].id); // Fallback to first page if no last selected
    }
};

const handleCreatePage = async (defaultContent = '') => {
    let name = newPageName.value.trim();
    const pageType = newPageType.value;

    if (pageList.value.length >= MAX_PAGES) return;
    if (!name) name = 'default';
    
    isProcessing.value = true;
    
    try {
        // Check for duplicate names (case-insensitive)
        if (pageList.value.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            throw new Error(`Page named "${name}" already exists.`);
        }

        const storedTimezone = await appMetadataStorage.getItem('selectedTimezone') || 'UTC';
        const timestamp = dayjs().tz(storedTimezone).format('YYYY-MM-DD_HH-mm-ss');
        const uniqueName = `${name}_${timestamp}`; // Ensure unique name
        const now = dayjs().tz(storedTimezone).format('YYYY-MM-DDTHH:mm:ss.SSSZ');

        const newPageData = {
            id: crypto.randomUUID(),
            name: uniqueName, // Use the generated unique name
            order: pageList.value.length, // Simple order for now
            createdAt: now,
            lastModified: now,
            lastSynced: '',
            content: defaultContent, // Start with empty content
            type: pageType, // <-- added this line
            isPinned: false,
            pinnedAt: '',
            isEncrypted: 0,
            pendingSync: 1,
            syncStatus: 'scheduled'
        };

        await noteTextStorage.createPage(newPageData);
        pageList.value.push(newPageData); // Add to local list
        newPageName.value = ''; // Clear input
        newPageType.value = 'note'; // reset type
        handlePageSelect(newPageData.id); // Select the new page
        emit('page-created', newPageData); // Notify parent

    } catch (error) {
        console.error('Failed to create page:', error);
        alert(error.message || 'Failed to create page. Please try again.'); // Basic alert, replace with better notification
    } finally {
        isProcessing.value = false;
    }
};

const handleCreateDefaultPage = async () => {
     // Simplified - assumes 'default' is the desired name prefix if no pages exist
    if (pageList.value.length > 0) return; // Only create if no pages exist
    await handleCreatePage(defaultPage); // Use the standard creation logic
    // If specific default content is needed, it would require adjusting handleCreatePage
    // or having a separate function that bypasses some checks/name generation.
};


const promptRename = (page) => {
    const currentName = page.name.split('_')[0]; // Attempt to get original name before timestamp
    const newName = prompt('Enter new name:', currentName)?.trim();
    if (newName && newName !== currentName) {
        handleRename(page, newName);
    }
};

const handleRename = async (page, newName) => {
    if (!newName || isProcessing.value) return;

    isProcessing.value = true;
    try {
        // Check for duplicates (excluding the current page)
        if (pageList.value.some(p => p.id !== page.id && p.name.toLowerCase() === newName.toLowerCase())) {
            throw new Error(`A page with the name "${newName}" already exists.`);
        }
        // Append timestamp to maintain uniqueness pattern if needed, or adjust logic
        const storedTimezone = await appMetadataStorage.getItem('selectedTimezone') || 'UTC';
        const timestamp = dayjs().tz(storedTimezone).format('YYYY-MM-DD_HH-mm-ss');
        const uniqueNewName = `${newName}_${timestamp}`;

        await noteTextStorage.updatePage(page.id, { name: uniqueNewName, lastModified: new Date().toISOString(), pendingSync: 1 }); // Mark for sync

        // Update local list
        const pageIndex = pageList.value.findIndex(p => p.id === page.id);
        if (pageIndex > -1) {
            pageList.value[pageIndex].name = uniqueNewName;
            pageList.value[pageIndex].lastModified = new Date().toISOString();
        }

        emit('page-renamed', { id: page.id, newName: uniqueNewName }); // Emit with the actual saved name
    } catch (error) {
        console.error('Failed to rename page:', error);
        alert(error.message || 'Failed to rename page.');
    } finally {
        isProcessing.value = false;
    }
};

const confirmDelete = (pageId) => {
    if (confirm('Are you sure you want to delete this page? This action cannot be undone.')) {
        handleDelete(pageId);
    }
};

const handleDelete = async (pageId) => {
    if (isProcessing.value) return;
    isProcessing.value = true;

    try {
        await noteTextStorage.deletePage(pageId);
        await appMetadataStorage.markPageForDeletion(pageId); // Mark for remote deletion sync

        pageList.value = pageList.value.filter(p => p.id !== pageId);

        // Trigger background sync for deletion
        syncManager.value?.handlePageDeletion(pageId).then(result => {
            if (result.success) {
                console.log("Sync Manager: Page deletion sync initiated.");
            } else {
                console.warn("Sync Manager: Failed to initiate page deletion sync.");
                // Consider retry logic or user notification here
            }
        });

        // If the deleted page was selected, select another page
        if (pageId === props.selectedPageId) {
            const nextPage = pageList.value[0]; // Select first page as fallback
            if (nextPage) {
                handlePageSelect(nextPage.id);
            } else {
                // No pages left, maybe create a default one or emit 'no-pages'?
                emit('page-selected', null); // Signal no page is selected
                handleCreateDefaultPage(); // Optionally create a default page
            }
        }

        emit('page-deleted', pageId);
    } catch (error) {
        console.error('Failed to delete page:', error);
        alert('Failed to delete page. Please try again.');
    } finally {
        isProcessing.value = false;
    }
};

// --- NEW Archive/Unarchive Handlers ---
const handlePin = async (pageId) => {
    if (isProcessing.value) return;
    isProcessing.value = true;
    
    const storedTimezone = await appMetadataStorage.getItem('selectedTimezone') || 'UTC';
    const now = dayjs().tz(storedTimezone).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
    //const now = new Date().toISOString();

    try {
        const updateData = {
            isPinned: true,
            pinnedAt: now,
            lastModified: now, // Update last modified time
            pendingSync: 1     // Mark for sync
        };
        await noteTextStorage.updatePage(pageId, updateData);

        // Update local state reactively
        const pageIndex = pageList.value.findIndex(p => p.id === pageId);
        if (pageIndex > -1) {
            // Ensure reactivity by updating the object properties or replacing the object
            pageList.value[pageIndex] = { ...pageList.value[pageIndex], ...updateData };
            // OR:
            // pageList.value[pageIndex].isArchived = true;
            // pageList.value[pageIndex].archivedAt = now;
            // pageList.value[pageIndex].lastModified = now;
            // pageList.value[pageIndex].pendingSync = 1;
        }

        emit('page-pin', pageId);
        // Optional: Trigger sync immediately if desired
        // syncManager.value?.triggerSync();

    } catch (error) {
        console.error('Failed to pin page:', error);
        alert('Failed to pin page.'); // Replace with better notification
    } finally {
        isProcessing.value = false;
    }
};

const handleUnpin = async (pageId) => {
    if (isProcessing.value) return;
    isProcessing.value = true;
    
    const storedTimezone = await appMetadataStorage.getItem('selectedTimezone') || 'UTC';
    const now = dayjs().tz(storedTimezone).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
    //const now = new Date().toISOString();

    try {
        const updateData = {
            isPinned: false,
            pinneddAt: null, // Clear the archive timestamp
            lastModified: now, // Update last modified time
            pendingSync: 1     // Mark for sync
        };
        await noteTextStorage.updatePage(pageId, updateData);

        // Update local state reactively
        const pageIndex = pageList.value.findIndex(p => p.id === pageId);
        if (pageIndex > -1) {
            pageList.value[pageIndex] = { ...pageList.value[pageIndex], ...updateData };
            // OR:
            // pageList.value[pageIndex].isArchived = false;
            // pageList.value[pageIndex].archivedAt = null;
            // pageList.value[pageIndex].lastModified = now;
            // pageList.value[pageIndex].pendingSync = 1;
        }

        emit('page-unpin', pageId);
        // Optional: Trigger sync immediately if desired
        // syncManager.value?.triggerSync();

    } catch (error) {
        console.error('Failed to unpin page:', error);
        alert('Failed to unpinn page.'); // Replace with better notification
    } finally {
        isProcessing.value = false;
    }
};



// --- NEW Archive/Unarchive Handlers ---
const handleArchive = async (pageId) => {
    if (isProcessing.value) return;
    isProcessing.value = true;
    
    const storedTimezone = await appMetadataStorage.getItem('selectedTimezone') || 'UTC';
    const now = dayjs().tz(storedTimezone).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
    //const now = new Date().toISOString();

    try {
        const updateData = {
            isArchived: true,
            archivedAt: now,
            lastModified: now, // Update last modified time
            pendingSync: 1     // Mark for sync
        };
        await noteTextStorage.updatePage(pageId, updateData);

        // Update local state reactively
        const pageIndex = pageList.value.findIndex(p => p.id === pageId);
        if (pageIndex > -1) {
            // Ensure reactivity by updating the object properties or replacing the object
            pageList.value[pageIndex] = { ...pageList.value[pageIndex], ...updateData };
            // OR:
            // pageList.value[pageIndex].isArchived = true;
            // pageList.value[pageIndex].archivedAt = now;
            // pageList.value[pageIndex].lastModified = now;
            // pageList.value[pageIndex].pendingSync = 1;
        }

        emit('page-archived', pageId);
        // Optional: Trigger sync immediately if desired
        // syncManager.value?.triggerSync();

    } catch (error) {
        console.error('Failed to archive page:', error);
        alert('Failed to archive page.'); // Replace with better notification
    } finally {
        isProcessing.value = false;
    }
};

const handleUnarchive = async (pageId) => {
    if (isProcessing.value) return;
    isProcessing.value = true;
    
    const storedTimezone = await appMetadataStorage.getItem('selectedTimezone') || 'UTC';
    const now = dayjs().tz(storedTimezone).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
    //const now = new Date().toISOString();

    try {
        const updateData = {
            isArchived: false,
            archivedAt: null, // Clear the archive timestamp
            lastModified: now, // Update last modified time
            pendingSync: 1     // Mark for sync
        };
        await noteTextStorage.updatePage(pageId, updateData);

        // Update local state reactively
        const pageIndex = pageList.value.findIndex(p => p.id === pageId);
        if (pageIndex > -1) {
            pageList.value[pageIndex] = { ...pageList.value[pageIndex], ...updateData };
            // OR:
            // pageList.value[pageIndex].isArchived = false;
            // pageList.value[pageIndex].archivedAt = null;
            // pageList.value[pageIndex].lastModified = now;
            // pageList.value[pageIndex].pendingSync = 1;
        }

        emit('page-unarchived', pageId);
        // Optional: Trigger sync immediately if desired
        // syncManager.value?.triggerSync();

    } catch (error) {
        console.error('Failed to unarchive page:', error);
        alert('Failed to unarchive page.'); // Replace with better notification
    } finally {
        isProcessing.value = false;
    }
};

// NEW: Method to toggle all groups open or closed
const toggleAllGroups = () => {
    // Determine the target state: if any are open, close all; otherwise, open all.
    const shouldOpen = !isAnyGroupOpen.value;

    // Iterate through the keys of the openGroups object and set the state
    for (const groupName in openGroups) {
        // Optional: Only toggle groups that actually have items,
        // though toggling empty ones has no visual effect.
        // if (groupedPages.value[groupName]?.length > 0) {
            openGroups[groupName] = shouldOpen;
        // }
    }

    // Persist the new state of all groups
    saveGroupStates();
};

// --- Selection ---
const handlePageSelect = (pageId) => {
    
    if (pageId !== props.selectedPageId) {
        saveLastSelectedPage(pageId); // Persist selection
        emit('page-selected', pageId);
        pageStore.selectPage(pageId); // Update Pinia store
    }
};

// --- Search ---
const clearSearch = () => {
    searchTerm.value = '';
};

// --- Group Toggling ---
const toggleGroup = (groupName) => {
    if (openGroups.hasOwnProperty(groupName)) {
        openGroups[groupName] = !openGroups[groupName];
        saveGroupStates(); // Persist state on toggle
    }
};

// --- Drag and Drop ---
// NOTE: Draggable is currently HARD-DISABLED in the template with :disabled="true".
// The following logic assumes it might be enabled later.
// If drag-and-drop is enabled, the logic for updating order needs careful review,
// especially how it interacts with the grouped view vs. the flat pageList.
// Updating order *within* a group might not map directly to the `order` property
// used in `handleDragEnd` which assumes a flat list.
const handleDragEnd = async ({ moved, oldIndex, newIndex }) => {
    // drag.value = false; // Reset drag state regardless of outcome

    // // Important: This logic assumes dragging affects the main `pageList` order.
    // // If dragging only reorders within visual groups without saving, remove this.
    // // If dragging should save a global order, this needs careful adjustment
    // // when groups are involved, as `pageList` is flat but display is grouped.
    // // This might be simpler if dragging is ONLY allowed when NOT grouped (i.e., during search).

    // console.warn("Drag and drop finished. Reordering logic needs review based on whether grouping is active and how order should be persisted.");

    // // Example logic (likely needs adjustment for grouped view):
    // // if (!moved || isFilterActive.value) { // Prevent reorder during search if desired
    // //     // If filter is active, list order might not match pageList order
    // //     // Might need to reload pages to reset visual order if drag is cancelled
    // //     console.log("Drag cancelled or occurred during filtering. No order change persisted.");
    // //     return;
    // // }

    // // isProcessing.value = true;
    // // try {
    // //     // Create new ordered list based on the flat pageList
    // //     const reorderedList = [...pageList.value]; // Clone
    // //     const [movedItem] = reorderedList.splice(oldIndex, 1);
    // //     reorderedList.splice(newIndex, 0, movedItem);

    // //     // Create updates with new 'order' index
    // //     const updates = reorderedList.map((page, index) => ({
    // //         id: page.id,
    // //         order: index,
    // //         // Also update lastModified and pendingSync if reordering is a syncable action
    // //         lastModified: new Date().toISOString(),
    // //         pendingSync: 1,
    // //     }));

    // //     await noteTextStorage.updatePageOrder(updates); // Assumes this updates order and other fields
    // //     pageList.value = reorderedList.map((page, index) => ({ ...page, order: index })); // Update local state

    // //     emit('pages-reordered', pageList.value.map(p => p.id));
    // // } catch (error) {
    // //     console.error('Failed to update page order:', error);
    // //     alert('Failed to save new page order. Reloading list.');
    // //     await loadPages(); // Reload to revert visual state on error
    // // } finally {
    // //     isProcessing.value = false;
    // // }
};


// --- Lifecycle Hooks ---
onMounted(async () => {
    await loadGroupStates();
    await loadLastSelectedPage();
    await loadPages(); // This will also call selectInitialPage
});

// --- Watchers (Optional Example) ---
// Watch for changes in pageList length if needed elsewhere,
// but numberOfPages isn't directly used in the template anymore.
// watch(() => pageList.value.length, (newLength) => {
//     console.log(`Page count changed to: ${newLength}`);
// });

</script>