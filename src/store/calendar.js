// stores/useCalendarStore.js
import { defineStore } from "pinia";

export const useCalendarStore = defineStore("calendar", {
    state: () => ({
        groupedByMonth: {},
        eventIds: new Set(), // Keep track of used event IDs
    }),
    actions: {
        formatMonthKey(isoDateString) {
            const date = new Date(isoDateString);
            return date.toLocaleString("en-US", { month: "long", year: "numeric" });
        },
        addEvent(event) {
            // Ensure event has a stable, unique ID
            if (!event.id) {
                event.id = this.generateUniqueEventId(event);
            } else {
                //If event already has an ID, check if it's unique
                if(this.eventIds.has(event.id)){
                    event.id = this.generateUniqueEventId(event);
                }
            }
            this.eventIds.add(event.id);
            const monthKey = this.formatMonthKey(event.start);
            if (!this.groupedByMonth[monthKey]) {
                this.groupedByMonth[monthKey] = [];
            }
            // Check for duplicates before adding
            const exists = this.groupedByMonth[monthKey].some(e => e.id === event.id);
            if (!exists) {
                this.groupedByMonth[monthKey].push(event);
            }
        },
        updateEvent(oldEvent, newEvent) {
            if (!oldEvent || !newEvent) return;
            if (oldEvent.id === newEvent.id) {
                const oldEventCopy = JSON.parse(JSON.stringify(oldEvent));
                const newEventCopy = JSON.parse(JSON.stringify(newEvent));
                if (JSON.stringify(oldEventCopy) === JSON.stringify(newEventCopy)) {
                    return; //Events are identical, no update needed.
                }
            }
            this.removeEvent(oldEvent);
            this.addEvent(newEvent);
        },
        removeEvent(event) {
            if (!event || !event.start) {
                // Not going to broadcast this to the user...
                // console.warn("Attempted to remove invalid event:", event);
                return;
            }
            
            const monthKey = this.formatMonthKey(event.start);
            if (!this.groupedByMonth[monthKey]) return;
            
            // Use a more robust comparison to ensure we remove the correct event
            this.groupedByMonth[monthKey] = this.groupedByMonth[monthKey].filter(e => {
                // First try ID matching
                if (e.id && event.id && e.id === event.id) {
                    return false; // Remove this event
                }
                
                // Then try rawText matching
                if (e.rawText && event.rawText && e.rawText === event.rawText) {
                    return false; // Remove this event
                }
                
                // Finally, try content-based matching
                if (this.eventsMatch(e, event)) {
                    return false; // Remove this event
                }
                return true; // Keep this event
            });
            
            if (this.groupedByMonth[monthKey].length === 0) {
                delete this.groupedByMonth[monthKey]; // Remove empty months
            }
            
            if(event.id){
                this.eventIds.delete(event.id);
            }
        },
        // Generate a stable ID for an event based on its content
        generateEventId(event) {
            // Create a deterministic string representing key event properties
            const parts = [
                event.title || '',
                event.start || '',
                event.rawText || ''
            ];
            
            // Simple hash function for the string
            const str = parts.join('|');
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            
            return `event-${Math.abs(hash)}`;
        },
        generateUniqueEventId(event) {
            let id = this.generateEventId(event);
            let counter = 1;
            while (this.eventIds.has(id)) {
                id = `${this.generateEventId(event)}-${counter++}`;
            }
            return id;
        },
        // Check if two events match based on their content
        eventsMatch(event1, event2) {
            return event1.id === event2.id;
        },
    },
});
