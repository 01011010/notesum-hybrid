import { Decoration, ViewPlugin, WidgetType, EditorView } from "@codemirror/view";
import { RangeSetBuilder, StateField, StateEffect } from "@codemirror/state";
import ParserWorker from '../workers/parser_worker.js?worker';
import pageChangeTracker from '../utils/pageChangeTracker'; // Import the tracker

// Custom effects
const togglePinEffect = StateEffect.define();
const applyResultEffect = StateEffect.define();
// Add a new transaction effect for page changes
const pageChangeEffect = StateEffect.define();

let calendarStore = null; // Store reference to prevent reloading
let settingsStore = null;

class EventTracker {
    constructor(calendarStore) {
        this.calendarStore = calendarStore;
        this.eventMap = new Map(); // eventId -> event data
    }
    rebuildEvents(doc) {
        // 1. Get all parsed events from the document
        const parsedEvents = [];
        for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
            const lineText = doc.line(lineNum).text.trim();
            if (!lineText) continue;

            const parsedResult = this.getParsedResult(lineNum, lineText);
            if (parsedResult && parsedResult.type === 'event') {
                parsedEvents.push(JSON.parse(JSON.stringify(parsedResult.original))); //remove reactivity
            }
        }
        // 2. Generate IDs for the parsed events
        const newEventMap = new Map();
        parsedEvents.forEach(event => {
            const eventId = this.calendarStore.generateEventId(event);
            newEventMap.set(eventId, event);
        });

        // 3. Reconcile with the Pinia store
        const currentEvents = new Map();
        Object.values(this.calendarStore.groupedByMonth).forEach(monthEvents => {
            monthEvents.forEach(event => {
                currentEvents.set(event.id, event);
            });
        });

        // 4. Remove events that are no longer present
        currentEvents.forEach((event, eventId) => {
            if (!newEventMap.has(eventId)) {
                this.calendarStore.removeEvent(event);
            }
        });

        // 5. Add or update events that are present
        newEventMap.forEach((event, eventId) => {
            if (!currentEvents.has(eventId)) {
                this.calendarStore.addEvent(event);
            } else {
                //Check if the events are the same, if not, update.
                if (JSON.stringify(currentEvents.get(eventId)) !== JSON.stringify(event)){
                    this.calendarStore.updateEvent(currentEvents.get(eventId), event);
                }
            }
        });

        // 6. Update the eventMap
        this.eventMap = newEventMap;

        // console.log(`Rebuilt events: ${newEventMap.size} events in document.`);
        return { added: newEventMap.size, removed: currentEvents.size - newEventMap.size };
    }

    // This method needs to be called from the worker callback
    // with the parsed result for a line
    setParsedResult(lineNumber, result) {
        // Store the result in a map that can be accessed by rebuildEvents
        if (!this.parsedResults) this.parsedResults = new Map();
        this.parsedResults.set(lineNumber, result);
    }
    
    getParsedResult(lineNumber, lineText) {
        return this.parsedResults ? this.parsedResults.get(lineNumber) : null;
    }
    
    // Get events for a specific line
    getEventsForLine(lineNumber) {
        return Array.from(this.eventMap.values())
            .filter(data => data.sourceLineNumber === lineNumber);
    }
    
    // Clear all events (for page changes)
    clear() {
        // Remove all events from calendar store
        for (const [_, eventData] of this.eventMap) {
            this.calendarStore.removeEvent(eventData.event);
        }
        this.eventMap.clear();
        if (this.parsedResults) this.parsedResults.clear();
    }
    // Getter to expose eventMap
    getEventMap() {
        return this.eventMap;
    }
}

class EnhancedGhostTextWidget extends WidgetType {
    // Cache DOM elements
    static buttonSVGs = {
        apply: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"></path>
            </svg>`,
        copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>`,
        pin: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L12 22M2 12L22 12"></path>
            </svg>`
    };

    constructor(text, isPinned = false, lineNumber, lineEnd) {
        super();
        this.text = text;
        this.isPinned = isPinned;
        this.lineNumber = lineNumber;
        this.lineEnd = lineEnd; // Store line end position for insertion
    }

    eq(other) {
        return other instanceof EnhancedGhostTextWidget &&
            this.text === other.text && 
            this.isPinned === other.isPinned &&
            this.lineNumber === other.lineNumber &&
            this.lineEnd === other.lineEnd;
    }

    toDOM(view) {
        const wrapper = document.createElement("span");
        wrapper.className = "ghost-text-wrapper";

        // Set a fixed height for the wrapper to prevent jumping
        wrapper.style.height = "1.5em"; // Adjust to match your line height
        
        // Fix layout to prevent reflowing
        wrapper.style.position = "relative"; // Make positioning more stable
        wrapper.style.display = "inline-flex";
        wrapper.style.alignItems = "center";
        wrapper.style.verticalAlign = "top"; // Align consistently with text
        

        const resultSpan = document.createElement("span");
        resultSpan.textContent = ` ⟶ ${this.text}`;
        resultSpan.className = `ghost-text ${this.isPinned ? 'pinned' : ''}`;

        const actionsSpan = document.createElement("span");
        actionsSpan.className = "ghost-text-actions";

        // Apply button
        const applyButton = document.createElement("button");
        applyButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"></path>
        </svg>`;
        applyButton.className = "ghost-text-button apply-button";
        applyButton.title = "Insert result on new line";
        
        applyButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            view.dispatch({
                changes: {
                    from: this.lineEnd,
                    insert: `\n${this.text}`
                },
                selection: { anchor: this.lineEnd + this.text.length + 1 }
            });
            
            applyButton.classList.add('applied');
            setTimeout(() => applyButton.classList.remove('applied'), 1000);
        });

        // Copy button
        const copyButton = document.createElement("button");
        copyButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>`;
        copyButton.className = "ghost-text-button copy-button";
        copyButton.title = "Copy result";
        
        copyButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                navigator.clipboard.writeText(this.text).then(() => {
                    copyButton.classList.add('copied');
                    setTimeout(() => copyButton.classList.remove('copied'), 1000);
                }).catch(console.error);
            } catch (err) {
                console.error('Failed to copy text:', err);
            }
        });

        // Pin button
        const pinButton = document.createElement("button");
        pinButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L12 22M2 12L22 12"></path>
        </svg>`;
        pinButton.className = `ghost-text-button pin-button ${this.isPinned ? 'active' : ''}`;
        pinButton.title = this.isPinned ? "Unpin result" : "Pin result";
        
        pinButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            view.dispatch({
                effects: togglePinEffect.of({ lineNumber: this.lineNumber })
            });
        });

        //actionsSpan.appendChild(applyButton);
        actionsSpan.appendChild(copyButton);
        actionsSpan.appendChild(pinButton);
        wrapper.appendChild(resultSpan);
        wrapper.appendChild(actionsSpan);

        return wrapper;
    }

    ignoreEvent(event) {
        return event.type !== 'click';
    }
}

/*
const clearParsedOnPageChange = (updatedResults) => {
    if (pageChangeTracker.pageChanged) {
        updatedResults.clear();
        pageChangeTracker.reset(); // Reset the flag
        //console.log("parsed results cleared due to page change");
    }
};
*/

// State field for pinned results (unchanged)
const pinnedResults = StateField.define({
    create() {
        return new Map();
    },
    update(pinned, tr) {
        const updated = new Map(pinned);
        if (tr.docChanged) {
            const changes = tr.changes;
            const newPinned = new Map();

            for (const [lineNum, content] of updated) 
            {
                const newPos = changes.mapPos(tr.startState.doc.line(lineNum).from);
                if (newPos !== null) {
                    const newLine = tr.state.doc.lineAt(newPos);
                    newPinned.set(newLine.number, tr.state.doc.lineAt(newPos).text);
                }
            }
            updated.clear();
            newPinned.forEach((content, line) => updated.set(line, content));
        }
        for (const effect of tr.effects) 
        {
            if (effect.is(togglePinEffect))
            {
                const { lineNumber } = effect.value;
                const lineContent = tr.state.doc.line(lineNumber).text;
                if (updated.has(lineNumber)) {
                    updated.delete(lineNumber);
                } else {
                    updated.set(lineNumber, lineContent);
                }
            }
        }
        return updated;
    }
});

// New StateEffect version with modifications
const parsedResultsField = StateField.define({
    create() {
        return new Map(); // Stores { lineNumber -> parsedResult }
    },
    update(parsedResults, tr) {
        
        const updatedResults = new Map(parsedResults);
        // First check for page change effects - this needs to happen BEFORE mapping
        let pageChanged = false;
        for (let effect of tr.effects) {
            if (effect.is(pageChangeEffect)) {
                pageChanged = true;
                break;
            }
        }
        // If page changed, clear all results and return empty map immediately
        if (pageChanged) {
            // console.log("Page changed, clearing all parsed results");
            return new Map();
        }
        // Handle document changes
        if (tr.docChanged) {
            const changes = tr.changes;
            const newResults = new Map();
            // Map old line positions to new ones
            for (const [oldLineNum, content] of updatedResults) {
                try {
                    // Get the position at the start of the old line
                    const oldPos = tr.startState.doc.line(oldLineNum).from;
                    // Map it to its new position
                    const newPos = changes.mapPos(oldPos);
                    if (newPos !== null) {
                        // Get the new line number for this position
                        const newLine = tr.state.doc.lineAt(newPos);
                        newResults.set(newLine.number, content);
                    }
                } catch (e) {
                    // Line no longer exists, skip it
                    continue;
                }
            }
            // Replace the old map with the new one
            updatedResults.clear();
            newResults.forEach((content, line) => updatedResults.set(line, content));
        }
        // Process regular parsing results
        for (let effect of tr.effects) {
            if (effect.is(applyResultEffect)) {
                const { lineNumber, result } = effect.value;
                if (result != null) {
                    updatedResults.set(lineNumber, result);
                } else {
                    updatedResults.delete(lineNumber);
                }
            }
        }
        return updatedResults;
    }
});

function enhancedGhostTextExtension(store, settingsStore) { 
    // Store the view reference when plugin is initialized
    let pluginView = null;
    calendarStore = store; // Injected from CodeEditor.vue
    settingsStore = settingsStore;
    const eventTracker = new EventTracker(store);

    function findCurrentLineNumber(originalLineNumber) {
        if (!pluginView) {
            return null; // Handle the case where pluginView isn't available yet
        }
        const doc = pluginView.state.doc;
        let currentLineNumber = null;
        try {
            const originalLine = doc.line(originalLineNumber);
            if (!originalLine)
            {
                return null; // Handle the case where the original line doesn't exist anymore
            }
            const originalLineFrom = originalLine.from;
            // Find the current line number based on the original position
            currentLineNumber = doc.lineAt(originalLineFrom).number;
        } catch (error) {
            console.error("Error finding current line number:", error);
        }
        return currentLineNumber;
    }

    const worker = new ParserWorker();
    const pendingLines = new Map(); // Tracks in-progress lines
    const processedResults = new Map(); // Cache to track which results we've already processed

    // Add a new cache to track line content
    const lineContentCache = new Map(); // lineNumber -> { content, lastProcessed }

    worker.onmessage = (event) => {

        const { lineNumber, result } = event.data;
        pendingLines.delete(lineNumber);
        const currentLineNumber = findCurrentLineNumber(lineNumber);
        // Store the parsed result in the event tracker
        eventTracker.setParsedResult(lineNumber, result);
        if (currentLineNumber === null) {
            // Original line was deleted, remove from processedResults
            processedResults.delete(lineNumber); // Remove by original number
            lineContentCache.delete(lineNumber); // Also remove from content cache
        }
        if (result) {
            const existingResult = processedResults.get(currentLineNumber);
            if (existingResult?.value === result.value) {
                return; // Skip if we've already processed this exact result
            }
            processedResults.set(currentLineNumber, result); // Use CURRENT line number
            if (pluginView) {
                pluginView.dispatch({
                    effects: applyResultEffect.of({ lineNumber: currentLineNumber, result })
                });
            }
        } else {
            processedResults.delete(currentLineNumber); // Remove by CURRENT line number
        }
    };
    return [
        pinnedResults,
        parsedResultsField,
        
        ViewPlugin.fromClass(
            class {
                constructor(view) {
                    // Constructor doesn't run multuple tipes. Once it loads, it stays. Doesn't change on page change
                    this.view = view;
                    pluginView = view; // Store view reference
                    this.decorations = this.computeDecorations(view);
                }
                update(update) {
                    // This triggers as many times as there are lines inside the document to parse
                    // Check if this is a full document replacement
                    if (update.docChanged) {
                        if (pageChangeTracker.pageChanged) {
                            pendingLines.clear();
                            processedResults.clear();
                            lineContentCache.clear(); // Clear the content cache on page change
                            eventTracker.clear();
                            pageChangeTracker.reset();
                        }
                    }
                    // Do NOT recompute for applyResultEffect
                    if (update.docChanged || update.viewportChanged || this.pinnedResultsChanged(update)) {
                        this.decorations = this.computeDecorations(update.view);
                        eventTracker.rebuildEvents(update.state.doc);
                    } 
                    // For result effects, just update the decorations directly
                    else if (update.transactions.some(tr => 
                        tr.effects.some(e => e.is(applyResultEffect)))) {
                            const builder = new RangeSetBuilder();
                            const pinned = update.view.state.field(pinnedResults);
                            const parsedResults = update.view.state.field(parsedResultsField);
                            // Only update decorations for lines that have results
                            for (let { from, to } of update.view.visibleRanges) {
                                let pos = from;
                                while (pos <= to) {
                                    const line = update.view.state.doc.lineAt(pos);
                                    const result = parsedResults.get(line.number);
                                    if (result) {
                                        const deco = Decoration.widget({
                                            widget: new EnhancedGhostTextWidget(
                                                result.value,
                                                pinned.has(line.number),
                                                line.number,
                                                line.to
                                            ),
                                            side: 1,
                                        });
                                        builder.add(line.to, line.to, deco);
                                    }
                                    pos = line.to + 1;
                                }
                            }
                            this.decorations = builder.finish();
                        }
                    }
                    pinnedResultsChanged(update) {
                        return update.transactions.some(tr => tr.effects.some(e => e.is(togglePinEffect) || e.is(applyResultEffect)));
                    }
                    computeDecorations(view) {
                        const builder = new RangeSetBuilder();
                        const pinned = view.state.field(pinnedResults);
                        const parsedResults = view.state.field(parsedResultsField);
                        
                        // Get visible ranges once
                        const visibleRanges = view.visibleRanges;

                        for (let { from, to } of  visibleRanges) {
                            let pos = from;
                            while (pos <= to) {
                                const line = view.state.doc.lineAt(pos);
                                const lineNumber = line.number;
                                const text = line.text.trim();

                                if (text) {
                                    try {
                                        // Only send to worker if not pending and not already processed
                                        
                                        // Check if line content changed compared to cache
                                        /*
                                        const cachedLineInfo = lineContentCache.get(lineNumber);
                                        const contentChanged = !cachedLineInfo || cachedLineInfo.content !== text;
                                        
                                        // Only send to worker if content changed and not already pending
                                        if (contentChanged && !pendingLines.has(lineNumber)) {
                                            pendingLines.set(lineNumber, true);
                                            
                                            // Update the content cache
                                            lineContentCache.set(lineNumber, {
                                                content: text,
                                                lastProcessed: Date.now()
                                            });
                                            
                                            const currentTimezone = settingsStore.timezone || 'UTC';
                                            worker.postMessage({ lineNumber, lineText: text, timezone: currentTimezone });
                                        }
                                        */
                                        // Old, working, no cache
                                        if (!pendingLines.has(lineNumber)) {
                                            pendingLines.set(lineNumber, true);
                                            const currentTimezone = settingsStore.timezone || 'UTC';
                                            worker.postMessage({ lineNumber, lineText: text, timezone: currentTimezone });
                                        }
                                        const result = parsedResults.get(line.number);
                                        if(result && result.value !== undefined) {
                                            const deco = Decoration.widget({
                                                widget: new EnhancedGhostTextWidget(
                                                    result && result.value !== undefined ? result.value : "", // Check and display "" if undefined
                                                    pinned.has(line.number),
                                                    line.number,
                                                    line.to
                                                ),
                                                side: 1,
                                            });
                                            builder.add(line.to, line.to, deco);
                                        }
                                    } catch (err) {
                                        console.error('Error processing line:', err);
                                    }
                                } else {
                                    // Remove results and pending status for empty lines:
                                    parsedResults.delete(lineNumber);
                                    pendingLines.delete(lineNumber);
                                    lineContentCache.delete(lineNumber); // Also remove from content cache
                                }
                                pos = line.to + 1;
                            }
                        }
                        return builder.finish();
                    }
                },
                {
                    decorations: (v) => v.decorations,
                }
        ),
        EditorView.baseTheme({
            '&': {
                '--ghost-text-fg': '#888',
                '--ghost-text-fg-active': '#ccc',
                '--ghost-text-bg-hover': 'rgba(127, 127, 127, 0.1)',
                '--ghost-text-success': '#34D399',
            },
            '&.light': {
                '--ghost-text-fg': '#666',
                '--ghost-text-fg-active': '#333',
                '--ghost-text-bg-hover': 'rgba(127, 127, 127, 0.1)',
                '--ghost-text-success': '#059669',
            },
            ".ghost-text-wrapper": {
                    position: "absolute",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    opacity: "0.7",
                    transition: "opacity 0.2s",
                    top: "0", // Position at the top of the line
                    right: "0", // Position at the right side
                    left: "auto", // Let it flow naturally from the right
                    zIndex: "1", // Ensure it's above text
                    pointerEvents: "auto", // Make sure it's clickable
                    "&:hover": {
                        opacity: "1"
                    }
                },
            // Make line position relative so absolute positioned elements work
            ".cm-line": {
                position: "relative"
            },
            ".ghost-text": {
                color: "var(--ghost-text-fg)",
                fontStyle: "italic",
                fontSize: "14px",
                "&.pinned": {
                color: "var(--ghost-text-fg-active)",
                fontWeight: "500"
                }
            },
            ".ghost-text-actions": {
                display: "inline-flex",
                gap: "4px",
                opacity: "0",
                transition: "opacity 0.2s",
                ".ghost-text-wrapper:hover &": {
                opacity: "1"
                }
            },
            ".ghost-text-button": {
                padding: "2px",
                border: "none",
                background: "transparent",
                color: "var(--ghost-text-fg)",
                cursor: "pointer",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
                "&:hover": {
                background: "var(--ghost-text-bg-hover)",
                color: "var(--ghost-text-fg-active)"
                },
                "&.active": {
                color: "var(--ghost-text-fg-active)",
                background: "var(--ghost-text-bg-hover)",
                },
                "&.copied, &.applied": {
                color: "var(--ghost-text-success)",
                }
            }
        })
    ];
}
export {
    enhancedGhostTextExtension,
    pageChangeEffect
}