<template>
    <div :class="{ dark: isDark }" class="h-screen w-full text-gray-900 bg-white dark:bg-custom-dark dark:text-white">
        
        <TopBar 
            :isSidebarOpen="isSidebarOpen" 
            :isEventbarOpen="isEventbarOpen" 
            @toggleSidebar="toggleSidebar" 
            @toggleEventbar="toggleEventbar"
            :isDark="isDark" 
            :toggleDark="toggleDark"
            :componentToShow="componentToShow"
            :isVaultUnlocked="isVaultUnlocked"
        />
        <UpdateNotificationPWA />
        <template v-if="showComponents">
            <!-- Show Passphrase Setup if no encrypted key exists -->
            <PassphraseSetup 
                v-if="componentToShow === 'PassphraseSetup'"
                @passphrase-set="handlePassphraseSet"
            />
            <!-- Show Vault Unlock if an encrypted key exists -->
            <VaultUnlock 
                v-else-if="componentToShow === 'VaultUnlock'"
                @vault-unlocked="handleVaultUnlocked"
                :isDark="isDark" 
            />
            <div v-else-if="componentToShow === 'Editor'">
                <div class="flex flex-1">
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
                        @resized="storePaneSize">
                        <pane :size="midSize" min-size="50">
                            <transition name="main-content">
                                <main class="flex-1 overflow-y-auto">
                                    <EditorComponent ref="editorRef"
                                        :currentPage="selectedPage"
                                        :isDarkMode="isDark"
                                        :vaultKey="userVaultKey"
                                    />
                                </main>
                            </transition>
                        </pane>
                        <pane :size="eventPanelSize" min-size="15" v-if="hasEvents && isEventbarOpen">
                            <CalendarEventList 
                                @jump-to-line="handleSidebarClick" 
                                v-model:isEventbarOpen="isEventbarOpen" 
                            />
                        </pane>
                    </splitpanes>        
                </div>
            </div>
        </template>
    </div>
</template>
<script>
import { ref, onMounted, computed, provide, watchEffect } from 'vue'
import { useDark, useToggle } from "@vueuse/core";
import { noteTextStorage, appMetadataStorage } from './utils/noteTextStorage'
import { useCalendarStore } from './store/calendar';
import { auth, onAuthStateChanged, getEncryptedKeyFromFirestore , syncDexieToFirestore} from "./firebase2";
import { createAppSyncManager } from './sync-manager';
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'

import TopBar from './components/TopBar.vue';
import SidebarComponent from './components/Sidebar2.vue';
import EditorComponent from './components/CodeEditorEPages4.vue';
import CalendarEventList from './components/CalendarEventList.vue';
import VaultUnlock from './components/VaultUnlock.vue';
import PassphraseSetup from './components/PassphraseSetup.vue';
import UpdateNotificationPWA from './components/UpdateNotificationPWA.vue'

export default {
    name: 'App',
    components: { 
        SidebarComponent,
        EditorComponent,
        TopBar,
        CalendarEventList,
        VaultUnlock,
        PassphraseSetup,
        UpdateNotificationPWA,
        Splitpanes, 
        Pane
    },
    props: {
        isDarkMode: {
            type: Boolean,
            default: false
        }
    },
   
    setup() {
        const calendarStore = useCalendarStore();

        const hasEvents = computed(() => {
            return Object.keys(calendarStore.groupedByMonth).length > 0;
        });

        const mainPane = ref(50);

        //const midSize = ref(50); // Initialize midSize to a default value
        const midSize = computed(() => mainPane.value ?? 70);
        // Update separately
async function loadPane() {
    const main = await appMetadataStorage.getItem('mainPane');
    mainPane.value = main.value;
}

        
        const storePaneSize = async ({ prevPane }) => {
            if(prevPane) {
                await appMetadataStorage.setItem('mainPane', prevPane.size)
                mainPane.value = prevPane.size;
            }
        }

        const sidebarWidthPercentage = computed(() => {
            // Tailwind's w-64 is 16rem. We need an estimate of the total width
            // to convert this to a percentage. A common large screen width is 1280px.
            // 16rem * 16px/rem = 256px.
            // (256 / 1280) * 100 = 20%.
            // This is an approximation. You might need to adjust based on your layout.
            return 20;
        });
        
        const adjustedMidSize = computed(() => {
            
            if (isSidebarOpen.value) {
                // When sidebar is open, effectively allocate more to the first pane
                // to reduce the space for the second pane.
                //return Math.min(90, main + sidebarWidthPercentage.value);
                //console.log("ELSO")
                //let a = Math.min(90,midSize.value - sidebarWidthPercentage.value);
                let a = midSize.value + sidebarWidthPercentage.value;
                //console.log(a);

                return a;
            } else {
                //console.log("MASODIK")
                //console.log(midSize.value)
                //return midSize.value;
                return midSize.value;
            }
        });
        
        const eventPanelSize = computed(() => {
            //console.log("EVENT")
            //console.log(adjustedMidSize.value)
            let b = Math.max(15, 100 - adjustedMidSize.value);
            //console.log(b)
            return b;
        });



        const syncManager = ref(createAppSyncManager(noteTextStorage, appMetadataStorage));

        // Provide syncManager to child components
        provide('syncManager', syncManager);

        const initialCheckComplete = ref(false)
        const showComponents = ref(false)
        const isLoading = ref(true);
        const editorRef = ref(null);
        const isSidebarOpen = ref(false);
        const isSidebarStateLoaded = ref(false);
        const selectedPageId = ref(null);
        const selectedPage = ref(null);

        const isEventbarOpen = ref(false);

        // vault specific setup
        const hasEncryptedKey = ref(false);
        const isAuthenticated = ref(false);
        const passphraseSet = ref(false);
        const userVaultKey = ref(null);
        const isVaultUnlocked = ref(false);

        
        const isDark = useDark({
            selector: 'body',
            attribute: 'class',
            valueDark: 'dark',
            valueLight: '',
            onChanged(dark) {
                // update the dom, call the API or something
            },
        });
        const handleSidebarClick = async (lineNumber) => {
            editorRef.value?.scrollToLine(lineNumber);
        };
        const toggleDark = useToggle(isDark)
        // Add this method
        const toggleSidebar = async () => {
            isSidebarOpen.value = !isSidebarOpen.value
            await appMetadataStorage.setItem('isSidebarOpen', isSidebarOpen.value ? 1: 0)
        }

        const toggleEventbar = async () => {
            isEventbarOpen.value = !isEventbarOpen.value;
            await appMetadataStorage.setItem('isEventbarOpen', isEventbarOpen.value ? 1: 0)
        }
        const handlePageSelect = async (pageId) => {
            try {
                selectedPageId.value = pageId
                if (pageId) {
                    selectedPage.value = pageId
                } else {
                    selectedPage.value = null
                }
            } catch (error) {
                console.error('Failed to load page:', error)
                selectedPage.value = null
            }
        }

        const initializePanelSize = async () => {
            const DEFAULT_SIZE = 50;
            let sizeToSet = DEFAULT_SIZE;

            try {
                const panelSizeData = await appMetadataStorage.getItem('mainPane');
                const storedValue = panelSizeData?.value;

                // Check if storedValue is a number and within the valid range
                if (typeof storedValue === 'number' && !isNaN(storedValue)) {
                    sizeToSet = storedValue;
                } else if (storedValue !== null && storedValue !== undefined) {
                    // Optional: Log if an invalid value was found
                    console.warn(`Stored panel size is invalid or out of range`);
                    // sizeToSet remains DEFAULT_SIZE
                }
                // If storedValue was null/undefined, the ?? logic is effectively handled by the initial default

            } catch (error) {
                console.error("Failed to retrieve panel size from storage:", error);
                // sizeToSet remains DEFAULT_SIZE
            }

            midSize.value = sizeToSet;
            mainPane.value = sizeToSet;
        }

        const initializeSidebarState = async () => {
            const storedSidebarState = await appMetadataStorage.getItem('isSidebarOpen');
            isSidebarOpen.value = storedSidebarState === 1 || storedSidebarState === true;
            isSidebarStateLoaded.value = true;
        };
        // This function updates the vault state when it is unlocked
        const handleVaultUnlocked = (decryptedKey) => {
            userVaultKey.value = decryptedKey;
            passphraseSet.value = true;
            isVaultUnlocked.value = true;
            syncDexieToFirestore();
        };

        const handlePassphraseSet = async (passphrase) => {
            userVaultKey.value = passphrase;
            passphraseSet.value = true;
            isVaultUnlocked.value = true;
            hasEncryptedKey.value = true;
        };

        const componentToShow = computed(() => {
            if (!initialCheckComplete.value || isLoading.value) return 'Editor'
            if (!isAuthenticated.value || isLoading.value) return 'Editor'
            if (computedSetupVault.value) return 'PassphraseSetup'
            if (computedHasEncryptedKey.value) return 'VaultUnlock'
            return 'Editor'
        });

        const computedHasEncryptedKey = computed(() => {
            return isAuthenticated.value && hasEncryptedKey.value && !passphraseSet.value
        });

        const computedSetupVault = computed(() => {
            return isAuthenticated.value && initialCheckComplete.value && !hasEncryptedKey.value
        });

        const fetchEncryptedKey = async (user) => {
            try {
                const encryptedKey = await getEncryptedKeyFromFirestore(user.uid);
                showComponents.value = true;
                initialCheckComplete.value = true
                return encryptedKey;
            } catch (error) {
                return null;
            }
        };

        const performGlobalSync = async () => {
            try {
                console.log(syncManager);
                const result = await syncManager.value.forceSync({ forceAll: true });
                console.log('Global sync result from setup:', result);
                return result;
            } catch (error) {
                // Handle error
                console.error('Global sync failed:', error);
            }
        };

        // Load last selected page on mount
        onMounted(async () => {
            
            const lastPageId = await appMetadataStorage.getItem('lastSelectedPageId') || null
            if (lastPageId) {
                await handlePageSelect(lastPageId)
            }
            await initializeSidebarState();
            await initializePanelSize();

            onAuthStateChanged(auth, async (user) => {
                try {
                    // Wait for authentication state to be determined
                    if (user) {
                        isAuthenticated.value = true;
                        const encryptedKey = await fetchEncryptedKey(user);
                        hasEncryptedKey.value = !!encryptedKey;
                    } else {
                        isAuthenticated.value = false;
                        hasEncryptedKey.value = false;
                        passphraseSet.value = false;
                        userVaultKey.value = null;
                        isVaultUnlocked.value = false;
                        isLoading.value = true;
                        showComponents.value = false;
                        initialCheckComplete.value = false;
                    }
                } catch (error) {
                    console.error("Error during auth state change handling:", error);
                } finally {
                    isLoading.value = false;
                    showComponents.value = true;  
                }
            })
        })

        return {
            isSidebarOpen,
            toggleSidebar,
            selectedPageId,
            selectedPage,
            handlePageSelect,
            isDark,
            toggleDark,
            editorRef,
            handleSidebarClick,
            isAuthenticated,
            hasEncryptedKey,
            passphraseSet,
            userVaultKey,
            handleVaultUnlocked,
            isVaultUnlocked,
            handlePassphraseSet,
            isLoading, 
            componentToShow,
            showComponents,
            initialCheckComplete,
            syncManager,
            midSize,
            mainPane,
            calendarStore,
            hasEvents,
            storePaneSize,
            eventPanelSize,
            isEventbarOpen,
            toggleEventbar
        }
    }
}
</script>

<style scoped>
.splitpanes.default-theme .splitpanes__pane {
    background-color: var(--pane-bg, white);
}

/* Dark theme override */
.dark .splitpanes.default-theme .splitpanes__pane {
  --pane-bg: theme('colors.custom-dark'); /* Safeguard with fallback */
}

/* Add any additional component-specific styles here */
.sidebar-enter-active,
.sidebar-leave-active {
    /* transition: transform 0.3s ease; */
}

.sidebar-enter-from,
.sidebar-leave-to {
    /*  transform: translateX(-100%); */
}
.main-content-enter-active,
.main-content-leave-active {
    transition: margin-left 0.3s ease;
}

.main-content-enter-from,
.main-content-leave-to {
    margin-left: 0;
}
</style>
