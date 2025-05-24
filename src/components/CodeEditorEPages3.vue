<template>
    <div class="editor-container bg-white dark:bg-custom-dark">
        <div ref="editor" class="editor"></div>
        <div class="status-bar">
            <span>Last saved: {{ this.lastSavedTime }}</span>
            <span v-if="this.isDirty">*</span>
            <button 
      @click="forceSync" 
      class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded shadow-lg transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" width="40" height="40" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
        <path d="M19.933 13.041a8 8 0 1 1 -9.925 -8.788c3.899 -1 7.935 1.007 9.425 4.747"></path>
        <path d="M20 4v5h-5"></path>
      </svg>
      <span class="hidden sm:block">Force Sync</span>
    </button>
        </div>
    </div>
</template>

<script>
import { ref, watch, onBeforeUnmount, nextTick, inject } from 'vue';
import { useCalendarStore } from '../store/calendar';
import { useSettingsStore } from '../store/settings';
import { basicSetup } from "codemirror";
import { EditorView, ViewPlugin, Decoration } from "@codemirror/view";
import { EditorState, EditorSelection, Compartment, StateEffect , StateField} from "@codemirror/state";
import { history, undo, redo } from "@codemirror/commands";
import { enhancedGhostTextExtension as ghostTextExtension, pageChangeEffect } from "../utils/ghostTextExtension6";
import { noteTextStorage, appMetadataStorage } from '../utils/noteTextStorage';
import { useDark, useToggle } from '@vueuse/core';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion } from "@codemirror/autocomplete";
import { syncDexieToFirestore } from "@/firebase2";
import { regexHighlightExtension } from '../utils/regexHighlighter'; // Import the regex highlighter
import { createSmartSyncManager } from '../smartSync';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const PLACEHOLDER = "";


// Define the predefined functions
const predefinedFunctions = {
    sum: (...args) => math.sum(args),
    avg: (...args) => math.mean(args),
    median: (...args) => math.median(args),
    stddev: (...args) => math.std(args),
    factorial: (n) => math.factorial(n),
    percentage: (value, total) => (value / total) * 100,
    roi: (gain, cost) => ((gain - cost) / cost) * 100,
    compound_interest: (principal, rate, time) => principal * Math.pow(1 + rate, time),
    break_even: (fixedCosts, price, variableCosts) => fixedCosts / (price - variableCosts),
    velocity: (distance, time) => distance / time,
    burn_rate: (startBalance, endBalance, months) => (startBalance - endBalance) / months,
    pert: (optimistic, mostLikely, pessimistic) => (optimistic + 4 * mostLikely + pessimistic) / 6,
    cycle_time: (completedTasks, timeElapsed) => timeElapsed / completedTasks,
    communication_channels: (numberOfStakeholders) => numberOfStakeholders * (numberOfStakeholders - 1) / 2,
    resource_utilization: (actualHours, plannedHours) => (actualHours / plannedHours) * 100,
    resource_overallocation: (resource_usage, resource_capacity) => resource_usage - resource_capacity,
    variance: (actual, planned) => ((actual - planned) / planned) * 100,
};
// Natural language patterns
const nlPatterns = {
    sum: ['sum of', 'total of', 'add'],
    avg: ['average of', 'mean of', 'avg of'],
    median: ['median of'],
    stddev: ['standard deviation of', 'std dev of'],
    factorial: ['factorial of'],
    percentage: ['percentage of', 'percent of'],
    roi: ['roi of'],
    compound_interest: ['interest of'],
    break_even: ['break even of'],
    velocity: ['velocity of'],
    burn_rate: ['burn rate of'],
    pert: ['pert of'],
    cycle_time: ['cycle time of'],
    communication_channels: ['comms channels of'],
    resource_utilization: ['resource utilization of'],
    resource_overallocation: ['resource over of'],
    variance: ['variance of']
};
function formulaCompletions(context) {
    // Match after = including any characters that follow
    let wordAfterEquals = context.matchBefore(/=[a-zA-Z]*$/);
    
    if (wordAfterEquals) {
        // We're in a formula context
        const searchText = wordAfterEquals.text.slice(1).toLowerCase(); // Remove the = and convert to lowercase
        const options = Object.entries(predefinedFunctions)
            .filter(([name]) => name.toLowerCase().startsWith(searchText))
            .map(([name]) => ({
                label: name,
                type: "function",
                info: `Calculate ${name} of numbers`,
                apply: `${name}()`,
                detail: "formula"
        }));

        return {
            from: wordAfterEquals.from + 1, // +1 to keep the = symbol
            options: options
        };
    }

    // Natural language completions
    let wordPattern = context.matchBefore(/\w+$/);
    if (!wordPattern && !context.explicit) return null;

    const options = [];
    if (wordPattern) {
        const searchText = wordPattern.text.toLowerCase();
        Object.entries(nlPatterns).forEach(([func, patterns]) => {
            patterns.forEach(pattern => {
                if (pattern.toLowerCase().startsWith(searchText)) {
                    options.push({
                        label: pattern,
                        type: "text",
                        info: `Calculate ${func} of numbers`,
                        apply: `${pattern} `,
                        //detail: "natural language"
                    });
                }
            });
        });
    }
    return {
        from: wordPattern ? wordPattern.from : context.pos,
        options: options
    };
}

export function createIsolatedHistoryExtension() {
  return EditorState.transactionFilter.of((tr) => {
    // Prevent undo/redo transactions that would change document content
    if ((tr.isUserEvent("undo") || tr.isUserEvent("redo")) && tr.docChanged) {
      return [];
    }
    return tr;
  });
}

export const historyCompartment = new Compartment();

// Create and export the autocomplete extension
export const autocompleteExtension = autocompletion({
    override: [formulaCompletions]
});


// Create a line limit extension
export const createLineLimitExtension = (maxLines) => {
  return EditorState.transactionFilter.of(tr => {
    if (!tr.docChanged) return tr;
    
    const doc = tr.newDoc;
    const lines = doc.lines;
    
    if (lines > maxLines) {
      // Get the position of the line that exceeds the limit
      const limitPos = doc.line(maxLines + 1).from - 1;
      
      // Create a new transaction that truncates the document
      return [
        tr.change({
          from: limitPos,
          to: doc.length,
          insert: ""
        })
      ];
    }
    
    return tr;
  });
};


export const transactionFilter = () => {
    return EditorState.transactionFilter.of(tr => {
        return tr.isUserEvent("undo") ? [] : tr;
        });
    };


// Add a plugin to show visual feedback when limit is reached
export const lineLimitNotifier = (maxLines) => {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.notification = null;
      this.checkLines(view);
    }
    
    update(update) {
      if (update.docChanged) {
        this.checkLines(update.view);
      }
    }
    
    checkLines(view) {
      const lines = view.state.doc.lines;
      
      if (lines >= maxLines) {
        this.showNotification(view);
      } else if (this.notification) {
        this.hideNotification();
      }
    }
    
    showNotification(view) {
      if (this.notification) return;
      
      // Create a notification element
      this.notification = document.createElement('div');
      this.notification.className = 'editor-line-limit-notification';
      this.notification.textContent = `Maximum of ${maxLines} lines reached`;
      this.notification.style.position = 'absolute';
      this.notification.style.bottom = '30px';
      this.notification.style.right = '10px';
      this.notification.style.backgroundColor = 'rgba(255, 100, 100, 0.8)';
      this.notification.style.color = 'white';
      this.notification.style.padding = '5px 10px';
      this.notification.style.borderRadius = '3px';
      this.notification.style.zIndex = '10';
      
      // Add it to the editor
      view.dom.parentNode.appendChild(this.notification);
      
      // Automatically hide after a few seconds
      setTimeout(() => {
        this.hideNotification();
      }, 3000);
    }
    
    hideNotification() {
      if (this.notification && this.notification.parentNode) {
        this.notification.parentNode.removeChild(this.notification);
        this.notification = null;
      }
    }
    
    destroy() {
      this.hideNotification();
    }
  });
};

// Keep your existing autocompletion code here...
export default {
    name: 'EditorComponent',
    props: {
        currentPage: {
            type: [String, Number],
            default: null
        },
        vaultKey: {
            type: [String],
            default: null
        }
    },
    emits: ['content-saved', 'save-error'],
    inject: ['syncManager'],
    setup(props) {
        const syncManager = inject('syncManager');
        const isDark = useDark();
        const toggleDark = useToggle(isDark);
        const editor = ref(null);
        const editorView = ref(null);
        const isDirty = ref(false);
        const lastSavedTime = ref('');
        const themeCompartment = new Compartment();
        // Define an effect to highlight a line
        const highlightLineEffect = StateEffect.define();

        const calendarStore = useCalendarStore();
        const settingsStore = useSettingsStore();

        const maxLines = 10000; // Set your line limit

        let saveTimeout = null;
        let syncTimeout = null;
        let syncStatus = ref('');

        //Define a field to manage the highlight decoration
        const highlightField = StateField.define({
            create() {
                return Decoration.none;
            },
            update(value, tr) {
                // Check if we have any highlight effects
                for (let e of tr.effects) {
                    if (e.is(highlightLineEffect)) {
                        if (e.value !== null) {
                            // Create line decoration at the exact position
                            const line = tr.state.doc.lineAt(e.value);
                            return Decoration.set([
                                Decoration.line({ class: "highlighted-line" }).range(line.from)
                            ]);
                        } else {
                            return Decoration.none;
                        }
                    }
                }
                return tr.docChanged ? Decoration.none : value;
            },
            provide: (f) => EditorView.decorations.from(f),
        });

        const scrollToLine = (lineNumber) => {

            if (!editorView.value) return;
            
            try {
                const state = editorView.value.state;
                // Get line information - handle line number indexing properly
                // Line numbers typically start from 1, but internal positions are 0-based
                const actualLineNumber = Math.min(lineNumber, state.doc.lines);
                const line = state.doc.line(actualLineNumber);
                const pos = line.from;
                
                // console.log(`Scrolling to line ${actualLineNumber}, position ${pos}`);
                
                // Create a proper selection that places the cursor at the line
                const selection = EditorSelection.cursor(pos);
                
                // Dispatch with explicit selection, scrolling, and highlight effect
                editorView.value.dispatch({
                    selection,
                    scrollIntoView: true,
                    effects: [
                        EditorView.scrollIntoView(pos, { y: "center" }),
                        highlightLineEffect.of(pos)
                    ]
                });
                
                // Force focus on the editor
                editorView.value.focus();
                
                // Remove highlight after 2 seconds
                setTimeout(() => {
                    if (editorView.value) {
                        editorView.value.dispatch({ 
                        effects: highlightLineEffect.of(null) 
                        });
                    }
                }, 2000);
            } catch (error) {
                console.error("Error in scrollToLine:", error);
            }
        };

        const normalizePageId = (id) => {
            if (id === null || id === undefined) return null;
            if (typeof id === 'string' && /^\d+$/.test(id)) {
                return parseInt(id, 10);
            }
            if (typeof id === 'number') {
                return id;
            }
            return String(id);
        };

        const forceSync = async () => {
            console.log('Forcing sync operation....')
            const pageId = props.currentPage;
            const content = await loadContent(props.currentPage);
            syncManager.value.forceSync(pageId,content) // Pass true to reload the page after update
        };

        // In your component's setup function
        /*
        const setupSyncManager = () => {
            console.log("Setting up sync manager");
            const syncManager = createSmartSyncManager(
                noteTextStorage, 
                appMetadataStorage,
                {
                // Configure with your existing Firebase sync function
                onCloudSync: async (pageId, content) => {
                    return syncDexieToFirestore(); // Your existing Firebase sync
                }
                }
            );
        return syncManager;
        };
        const syncManager = setupSyncManager();
        */
        const saveContent = async (pageId, content) => {
            const normalizedId = normalizePageId(pageId);
            // console.log("code editor: saveContent - normalizedId", normalizedId);
            if (!normalizedId || !content) return;
            
            try {
                if(isDirty.value) {
                    // console.log("calling savePage from note store...", isDirty.value);

                    
                    await noteTextStorage.savePage(normalizedId, content, props.vaultKey);
                    isDirty.value = false;
                    // lastSavedTime.value = new Date().toLocaleTimeString();
                    let storedTimezone = await appMetadataStorage.getItem('selectedTimezone');
                    if (storedTimezone === null) {
                        storedTimezone = 'UTC';
                    }
                    
                    lastSavedTime.value = dayjs().tz(storedTimezone || dayjs.tz.guess()).format('HH:mm:ss');
                    
                    // Sync with Firestore after saving
                    scheduleSync();
                }
            } catch (error) {
                console.error('Error saving content:', error);
                throw error;
            }
        };

        const scheduleSync = () => {
            if (syncTimeout) clearTimeout(syncTimeout);
                syncTimeout = setTimeout(async () => {
                    await syncDexieToFirestore(); // Disabled 
            }, 30000); // Delay sync by 30 seconds after last change
        };

        const debouncedSave = (pageId, content) => {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
            }
            
            return new Promise((resolve, reject) => {
                saveTimeout = setTimeout(async () => {
                    try {
                        await saveContent(pageId, content);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                }, 1000);
            });
        };

        const forceSave = async (pageId) => {
            if (!editorView.value || !pageId) return;
            if (saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
            }
            const content = editorView.value.state.doc.toString();
            await saveContent(pageId, content);
        };
        
        const forceSave2 = async (pageId) => {
            if (!editorView.value || !pageId) return;
            const content = editorView.value.state.doc.toString();
            
            // Use sync manager's force sync
            try {
                await syncManager.forceSync(pageId, content);
                isDirty.value = false;
                
                // Update last saved time
                let storedTimezone = await appMetadataStorage.getItem('selectedTimezone') || dayjs.tz.guess();
                lastSavedTime.value = dayjs().tz(storedTimezone).format('HH:mm:ss');
                
                // Update sync status
                syncStatus.value = 'complete';
            } catch (error) {
                console.error('Error forcing sync:', error);
            }
        };

        const loadContent = async (pageId) => {
            const normalizedId = normalizePageId(pageId);
            if (!normalizedId) return null;    
            try {
                const content = await noteTextStorage.getPage(normalizedId, props.vaultKey);
                return content && content.trim() ? content : PLACEHOLDER;
            } catch (error) {
                console.error('Error loading content:', error);
                throw error;
            }
        };

        const getTimezone = async () => {
            let tz = appMetadataStorage.getItem('selectedTimezone');
            const timezone = await tz;
            return timezone;
        };

        const initializeEditor = async (initialContent) => {
            // console.log("codeEditor: initializeEditor")
            const updatePlugin = ViewPlugin.fromClass(class {
                constructor(view) {
                    this.view = view;
                    this.lastProcessedLines = [];  // Track state per line
                }
                update(update) {
                    if (update.docChanged) {
                        isDirty.value = true;
                        const content = update.state.doc.toString();
                        this.processChanges(content);
                        /* testing new smart sync manager instead of this version
                        debouncedSave(props.currentPage, content).catch(error => {
                            console.error('Error in debounced save:', error);
                        });
                        */
                        // Replace debounced save with sync manager
                        syncManager.value.handleContentChange(props.currentPage, content)
                        .then( async result => {
                            if (result.savedLocally) {
                                // Update last saved time
                                let storedTimezone = await getTimezone();
                                if (storedTimezone === null) {
                                    storedTimezone = 'UTC';
                                }
                                
                                lastSavedTime.value = dayjs().tz(storedTimezone || dayjs.tz.guess()).format('HH:mm:ss');
                                isDirty.value = false;
                            }
                            
                            if (result.scheduledForSync) {
                                // Update UI to show sync is scheduled
                                syncStatus.value = 'scheduled';
                            }
                        })
                        .catch(error => {
                            console.error('Error handling content change:', error);
                        });
                    }
                }
                processChanges(currentText) {
                    const lines = currentText.split('\n');
                    lines.forEach(async (line, index) => {
                        const trimmedLine = line.trim();
                        // Check if this line is different from what we last processed at this index
                        if (trimmedLine && trimmedLine !== this.lastProcessedLines[index]) {
                            try {
                                // This here is not actually used. 
                                // This part of the code would save the result of the parsed result into a 'ghostTextDb', but that doesn't exist
                                // This is redundant, but isn't really an issue right now
                                const result = this.computeResult(trimmedLine);
                                if (result) {
                                    await noteTextStorage.saveGhostText(trimmedLine, result);
                                    this.lastProcessedLines[index] = trimmedLine; // Update the processed state for this line
                                }
                            } catch (error) {
                                console.error('Error processing line:', error);
                            }
                        }
                    });
                    // Clean up any extra tracked lines if the document got shorter
                    if (this.lastProcessedLines.length > lines.length) {
                        this.lastProcessedLines.length = lines.length;
                    }
                }
                computeResult(line) {
                    // additional computation logic here or something
                    return null;
                }
            });
            const initialTheme = isDark.value ? oneDark : [];

            // Apply the line limit extensions
            const lineLimitExtensions = [
                createLineLimitExtension(maxLines),
                lineLimitNotifier(maxLines)
            ];

            editorView.value = new EditorView({
                state: EditorState.create({
                    doc: initialContent,
                    extensions: [
                    
                        basicSetup,
                        createIsolatedHistoryExtension(),
                        historyCompartment.of(history()),
                        updatePlugin,
                        autocompleteExtension,
                        ghostTextExtension(calendarStore, settingsStore),
                        regexHighlightExtension(), // Add the regex highlighter if not already included in ghostTextExtension
                        themeCompartment.of(initialTheme),
                        highlightField,
                        ...lineLimitExtensions, // Add our new line limit extensions

                    ],
                }),
                parent: editor.value
            });
            };
    
            const destroyEditor = () => {
                if (editorView.value) {
                    editorView.value.destroy();
                    editorView.value = null;
                }
            };

    // Watch for page changes
    watch(() => props.currentPage, async (newPageId, oldPageId) => {
        // console.log("codeEditor - watch - props.CurrentPage, and oldPageId", newPageId, oldPageId);
        if (oldPageId && isDirty.value) {
            // await forceSave(oldPageId);
        }
        if (!newPageId) {
            destroyEditor();
            return;
        }
        try {
            const content = await loadContent(newPageId);
            await nextTick();

            if (!editorView.value) {
                await initializeEditor(content);
            } else {
                editorView.value.dispatch({
                    changes: {
                        from: 0,
                        to: editorView.value.state.doc.length,
                        insert: content // Check. The correct content is being passed in when the page change happens
                    },
                    effects: [
                        pageChangeEffect.of(null),
                        historyCompartment.reconfigure(null)

                    ]
                });
                // The plugin will automatically reset its line tracking when processing the new content
            }
            isDirty.value = false;
            // lastSavedTime.value = new Date().toLocaleTimeString();
            let storedTimezone = await appMetadataStorage.getItem('selectedTimezone');
            if (storedTimezone === null) {
                storedTimezone = 'UTC';
            }
            lastSavedTime.value = dayjs().tz(storedTimezone || dayjs.tz.guess()).format('HH:mm:ss');
        } catch (error) {
            console.error('Error handling page change:', error);
        }
    }, { immediate: true });
    watch(isDark, () => {
        if (editorView.value) {
            const newTheme = isDark.value ? oneDark : [];
            editorView.value.dispatch({
                effects: themeCompartment.reconfigure(newTheme)
            });
        }
    });

    onBeforeUnmount(async () => {
        if (props.currentPage && isDirty.value) {
            /* this is the debounce version and disabled for now for testing smart sync
            forceSave(props.currentPage);
            */
            const content = editorView.value.state.doc.toString();
            await syncManager.value.prepareClose(props.currentPage, content);
        }
        destroyEditor();
    });

    
    return {
        editor,
        editorView,
        isDirty,
        lastSavedTime,
        isDark,
        scrollToLine,
        forceSync
        };
    },
}
</script>

<style scoped>
.editor-container {
    height: 100%;
    display: flex;
    flex-direction: column;
}
.status-bar {
    padding: 4px 8px;
    font-size: 12px;
    border-top: 1px solid #ddd;
}
.dark .status-bar {
    border-color: #444;
}
</style>
