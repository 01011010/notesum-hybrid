<template>
    <div 
    class="left-0 h-[calc(100vh-3rem)] transition-all duration-300 ease-in-out flex bg-white dark:bg-custom-dark"
    :class="[isSidebarOpen ? 'w-64' : 'w-1']"
    >
        <!-- Main sidebar content -->
        <div 
            class="w-64 bg-white dark:bg-custom-dark transition-all duration-300 ease-in-out"
            :class="[isSidebarOpen ? 'translate-x-0' : '-translate-x-full']"
            >
            <form @submit.prevent="createPage()" class="p-2 border-b dark:border-gray-700">
                
                <div class="flex gap-2" v-if="pageList.length != 300">
                    <input
                        v-model="newPageName" 
                        placeholder="New page name"
                        :disabled="isProcessing"
                        class="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-100 bg-white dark:bg-gray-800 dark:border-gray-700"
                    />
                    <button
                        type="submit"
                        
                        class="px-3 py-1 text-sm bg-blue-50 bg-white dark:bg-gray-800 dark:text-white rounded dark:hover:bg-gray-700  hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        +
                    </button>
                </div>
                <div class="flex gap-2 text-sm" v-else>
                    <p>You’ve reached the maximum number of pages allowed in this version of the app. Need more? Go pro.</p>
                </div>
            </form>                    
            
            <div class="p-2 border-b dark:border-gray-700">
                <div class="flex gap-2">
                    <input 
                        v-model="searchTerm"
                        type="text"
                        placeholder="Search pages..."
                        class="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-100 bg-white dark:bg-gray-800 dark:border-gray-700"
                    />
                    <button v-if="searchTerm" @click="clearSearch" class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed">×</button>
                </div>
            </div>
            <SearchContent :handlePageSelect="handlePageSelect" v-if="pageList.length > 0"/>
            <draggable
                v-model="pageList"
                group="pages"
                @start="drag = true"
                @end="handleDragEnd"
                item-key="id"
                :disabled="isFilterActive || isProcessing"
                v-if="pageList.length > 0"
            >
                <template #item="{ element }">
                    <div v-if="isPageVisible(element)">
                        <li 
                            class="group relative flex items-center border-b dark:border-gray-700 last:border-b-0 transition-colors"
                            :class="{ 'bg-blue-50 dark:bg-gray-800': element.id === selectedPageId }"
                        >
                            <span 
                                @click="handlePageSelect(element.id)"
                                class="flex-1 p-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                <small>{{ element.name }}</small><br />
                                <small>{{ formatDateTime(element.createdAt)}}</small>
                            </span>
                            
                            <!-- Action buttons - only show on hover -->
                            <div class="absolute right-2 hidden group-hover:flex gap-1">
                                <button
                                    @click.stop="handleRename(element)"
                                    :disabled="isProcessing"
                                    class="p-1 text-m text-gray-600 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400"
                                >
                                    ✎
                                </button>
                                <button
                                    @click.stop="handleDelete(element.id)"
                                    :disabled="isProcessing"
                                    class="p-1 text-m text-gray-600 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                                >
                                    ×
                                </button>
                            </div>
                        </li>
                    </div>
                </template>
            </draggable>
        </div>
    </div>
</template>
<script>
import { ref, onMounted, computed, inject } from 'vue'
import draggable from 'vuedraggable'
import {noteTextStorage, appMetadataStorage } from '../utils/noteTextStorage'
import { usePageStore } from '../store/page';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {defaultPage} from './defaultPage'
import SearchContent from './SearchContent.vue';
//import { createSmartSyncManager } from '../smartSync';

dayjs.extend(utc);
dayjs.extend(timezone);

export default {
    name: 'SidebarComponent',
    components: { 
        draggable,
        SearchContent 
    },
    props: {
        selectedPageId: {
            type: String,
            default: null
        },
        isSidebarOpen: {
            type: Boolean,
            required: true
        },
    },
    emits: ['toggleSidebar','page-created', 'page-deleted', 'page-selected', 'page-renamed', 'pages-reordered'],
    inject: ['syncManager'], // Get the sync manager from the parent
    setup(props, { emit }) {
        const syncManager = inject('syncManager');
        const pageStore = usePageStore();
        const numberOfPages = ref(null);
        const selectedPage = ref(null);

        const newPageName = ref('');
        const pageList = ref([]);
        const drag = ref(false);
        const isProcessing = ref(false);

        const lastSelectedPageId = ref(appMetadataStorage.getItem('lastSelectedPageId') || null);

        const searchTerm = ref('');
        const isFilterActive = computed(() => searchTerm.value.trim().length > 0);

        const filteredPages = computed(() => {
            if (!searchTerm.value) return pageList.value;
            return pageList.value.filter(page => 
                page.name.toLowerCase().includes(searchTerm.value.toLowerCase())
            );
        });

        const formatDateTime = (date) => {
            return dayjs(date).format('MMM D, YYYY [at] h:mm A');
        }

        const clearSearch = () => {
            searchTerm.value = '';
        };

        const isPageVisible = (page) => {
        if (!isFilterActive.value) return true;
            return page.name.toLowerCase().includes(searchTerm.value.toLowerCase());
        };

        const sidebarHeightStyle = computed(() => {
            if (pageList.value.length > 0) {
                return { height: 'calc(100vh - 8rem)' };
            } else {
                return { height: '100vh' }; // Or any default height
            }
        });
        // Load pages on component mount
        const loadPages = async () => {
            try {
                isProcessing.value = true
                pageList.value = await noteTextStorage.getPages()
                
                // Handle initial page selection
                if (pageList.value.length > 0) {
                    // If there's only one page, select it
                    if (pageList.value.length === 1) {
                        handlePageSelect(pageList.value[0].id)
                    }
                    // If there are multiple pages, try to select the last selected page
                    else if (lastSelectedPageId.value) {
                        const pageExists = pageList.value.some(p => p.id === lastSelectedPageId.value)
                        if (pageExists) {
                            handlePageSelect(lastSelectedPageId.value)
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to load pages:', error)
            } finally {
                isProcessing.value = false
            }
        }

        const createDefaultPage = async () => {
            const pages = await noteTextStorage.getPages();
            if (pages.length > 0) return;
            
            createPage(defaultPage);
        }

        const createPage = async (placeholder = '') => {
            let name = newPageName.value.trim();
            if(!name) {
                name = 'default';
            }

            let storedTimezone = await appMetadataStorage.getItem('selectedTimezone');
            if (storedTimezone === null) {
                storedTimezone = 'UTC';
            }
            const timestamp = dayjs().tz(storedTimezone).format('YYYY-MM-DD_HH-mm-ss');
            const uniqueName = `${name}_${timestamp}`;
            
            if (!name) return
            try {
                isProcessing.value = true
                if (pageList.value.some(p => p.name.toLowerCase() === name.toLowerCase())) {
                    throw new Error('A page with this name already exists')
                }

                const newPage = {
                    id: crypto.randomUUID(),
                    name: uniqueName,
                    content: placeholder ?? '',
                    order: pageList.value.length,
                    lastModified: new Date().toISOString(),
                    createdAt: new Date().toISOString(),  // Store creation date
                    pendingSync: 1 // Correct: boolean value
                }
                await noteTextStorage.createPage(newPage)
                pageList.value.push(newPage)
                newPageName.value = ''
                handlePageSelect(newPage.id)
            } catch (error) {
                console.error('Failed to create page:', error)
                alert(error.message)
            } finally {
                isProcessing.value = false
            }
        }

        const handleRename = async (page) => {
            try {
                isProcessing.value = true
                const newName = prompt('Enter new name:', page.name)?.trim()
                
                if (!newName) return
                
                if (pageList.value.some(p => 
                    p.id !== page.id && 
                    p.name.toLowerCase() === newName.toLowerCase()
                )) {
                    throw new Error('A page with this name already exists')
                }

                await noteTextStorage.updatePage(page.id, { name: newName })
                const pageIndex = pageList.value.findIndex(p => p.id === page.id)
                pageList.value[pageIndex].name = newName
                emit('page-renamed', { id: page.id, newName })
            } catch (error) {
                console.error('Failed to rename page:', error)
                alert(error.message)
            } finally {
                isProcessing.value = false
            }
        }

        const handleDelete = async (pageId) => {
            if (!confirm('Are you sure you want to delete this page?')) return
        
            try {
                isProcessing.value = true
                await noteTextStorage.deletePage(pageId)
                  // Mark for remote deletion
                await appMetadataStorage.markPageForDeletion(pageId);
                pageList.value = pageList.value.filter(p => p.id !== pageId)
                
                console.log("DELEEEEEEEEEEEEEEEEEEEEEEEETE PAGE")
                const result = await syncManager.value.handlePageDeletion(pageId);
                console.log(result)
                if (result.success) {
                    // Update UI, navigate away from deleted page, etc.
                    // Maybe show confirmation message
                    console.log("Sync Manager: Page deleted sucessfully");
                } else {
                    // Show error, allow retry, etc.
                    console.warn("Sync Manager: Error - page delete");
                }
                
                // If the deleted page was selected, select another page if available
                if (pageId === props.selectedPageId) {
                    const nextPage = pageList.value[0]
                    if (nextPage) {
                        handlePageSelect(nextPage.id)
                    } else {
                        createDefaultPage();
                    }
                }
                emit('page-deleted', pageId)
            } catch (error) {
                console.error('Failed to delete page:', error)
                alert('Failed to delete page')
            } finally {
                isProcessing.value = false
            }
        }

        const handleDragEnd = async ({ moved }) => {
            if (!moved) return

            if (isFilterActive.value) return; // Don't apply changes if filter is active
            
            try {
                isProcessing.value = true
                const updates = pageList.value.map((page, index) => ({
                    ...page,
                    order: index
                }))
                
                await noteTextStorage.updatePageOrder(updates)
                pageList.value = updates; // Update the original pageList
                emit('pages-reordered', pageList.value.map(p => p.id))
            } catch (error) {
                console.error('Failed to update page order:', error)
                await loadPages()
            } finally {
                isProcessing.value = false
                drag.value = false
            }
        }

        // Update the number of pages whenever pages are loaded
        const updateNumberOfPages = async () => {
            const pages = await noteTextStorage.getPages();
            numberOfPages.value = pages.length;
        }
        
        const handlePageDelete = (pageId) => {
            if (selectedPageId.value === pageId) {
                selectedPageId.value = null
                selectedPage.value = null
            }
        }

        const handleContentSaved = async (pageId) => {
            // Optionally refresh the page data after save
            if (pageId === selectedPageId.value) {
                const page = await noteTextStorage.getPage(pageId)
                selectedPage.value = page
            }
        }

        const handlePageSelect = async (pageId) => {
            lastSelectedPageId.value = pageId
            //localStorage.setItem('lastSelectedPageId', pageId)
            await appMetadataStorage.setItem('lastSelectedPageId',pageId);
            // console.log("Sidebar - handlePageSelect");
            emit('page-selected', pageId)
            pageStore.selectPage(pageId);
        }
        onMounted(async () => {
            await createDefaultPage();
            await updateNumberOfPages();
            await loadPages();
        });
        
        return {
            newPageName,
            pageList,
            drag,
            isProcessing,
            isFilterActive,
            createPage,
            createDefaultPage,
            handleRename,
            handleDelete,
            handleDragEnd,
            handlePageDelete,
            handleContentSaved,
            searchTerm,
            filteredPages,
            clearSearch,
            isPageVisible,
            handlePageSelect,
            formatDateTime
        }
    }
}
</script>
<style scoped>
/* styles remain the same */
</style>