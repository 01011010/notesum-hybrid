<template>
<div class="flex items-center gap-x-2 text-xs text-gray-600 dark:text-zinc-400 flex-shrink-0">
    <!-- Display Current Time -->
    <p class="whitespace-nowrap">
        {{ formattedDate }}
    </p>
    <!-- Dropdown -->
    <select 
        v-model="selectedTimezone" 
        @change="updateTimezone" 
        id="timezone" 
        class="bg-white dark:bg-custom-dark dark:border-zinc-600 rounded p-1 text-gray-600 dark:text-zinc-400 w-32"
    >
        <option 
            v-for="tz in simplifiedTimezones" 
            :key="tz.value" 
            :value="tz.value"
        >
            {{ tz.label }}
        </option>
    </select>
</div>
</template>
<script>
    import { ref, computed, onMounted } from 'vue';
    import { DateTime } from 'luxon';
    //import { appMetadataStorage } from '../../utils/noteTextStorage'; // Import your Dexie helper
    import { useSettingsStore } from '../../store/settings';

    export default {
        setup() {
            const settingsStore = useSettingsStore();
            const localTimezone = DateTime.local().zoneName;
            //const selectedTimezone = ref(localTimezone);
            const selectedTimezone = ref(settingsStore.currentTimezone);

            const simplifiedTimezones = computed(() => [
                { value: localTimezone, label: `Local (${localTimezone})` },
                { value: 'UTC', label: 'UTC' },
                { value: 'Europe/London', label: 'Western European Time (WET/GMT)' },
                { value: 'Europe/Paris', label: 'Central European Time (CET)' },
                { value: 'Europe/Athens', label: 'Eastern European Time (EET)' },
                { value: 'America/New_York', label: 'Eastern Time (ET)' },
                { value: 'America/Chicago', label: 'Central Time (CT)' },
                { value: 'America/Denver', label: 'Mountain Time (MT)' },
                { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
                { value: 'Asia/Dubai', label: 'Gulf Standard Time (GST)' },
                { value: 'Asia/Kolkata', label: 'India Standard Time (IST)' },
                { value: 'Asia/Singapore', label: 'Singapore Standard Time (SGT)' },
                { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
                { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET)' },
                { value: 'Pacific/Auckland', label: 'New Zealand Standard Time (NZST)' },
            ]);
            // Format the current time based on the selected timezone
            const formattedDate = computed(() => {
                return DateTime.now().setZone(selectedTimezone.value).toLocaleString(DateTime.DATETIME_MED);
            });
            // Update the selected timezone (for persistence purposes)
            const updateTimezone = async () => {
                // Save to Dexie
                // await appMetadataStorage.setItem('selectedTimezone', selectedTimezone.value);
                settingsStore.setTimezone(selectedTimezone.value)
            };
            
            onMounted(async () => {
            // Retrieve from Dexie
                // First initialize the timezone from storage
                await settingsStore.initializeTimezone();    
                // const savedTimezone = await appMetadataStorage.getItem('selectedTimezone');
                selectedTimezone.value = settingsStore.currentTimezone;
                /*
                if (savedTimezone) {
                    selectedTimezone.value = savedTimezone;
                    // Update Pinia store
                    // store.setSelectedTimezone(savedTimezone);
                } else {
                    appMetadataStorage.setItem('selectedTimezone', localTimezone)
                }
                */
            });
            return {
                selectedTimezone,
                formattedDate,
                simplifiedTimezones,
                updateTimezone
            };
        }
    };
</script>