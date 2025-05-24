<template>
  <div
    class=""
    :class="[
      Object.keys(groupedByMonth).length === 0 ? '' : 'ml-2 bg-white dark:bg-custom-dark',
    ]"
  >
    <div class="overflow-y-auto">
      <div v-for="(tasks, month) in sortedGroupedByMonth" :key="month" class="mb-2">
        <h3 class="text-sm font-semibold text-gray-500 mb-1">{{ month }}</h3>
        <ul>
          <li
            v-for="task in tasks"
            :key="task.rawText"
            @click="handleClick(task.lineNumber)"
            :class="[
              'text-sm cursor-pointer p-1 mr-2 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition border-b border-gray-700 last:border-b-0',
              { 'opacity-50': task.status === 'completed' }
            ]"
          >
            <template v-if="task.isRange">
              <div class="flex flex-col space-y-2 mb-2">
                <div class="flex items-center">
                  <span :class="['w-4 h-0.5 mr-2', task.status === 'complete' ? 'bg-gray-500' : 'bg-blue-500']"></span>
                  <span class="text-sm text-gray-600">{{ formatDateRange(task.start, task.end) }}</span>
                </div>
                <div>
                  <h4 class="font-medium break-words">{{ truncateText(task.title, 30) }}</h4>
                  <p class="text-sm text-gray-400 break-words">{{ truncateText(task.description, 50) }}</p>
                </div>
                <div class="flex justify-between items-center">
                  <span
                    v-if="task.status !== 'completed'"
                    class="text-xs self-start"
                    :class="getDaysLeftClass(task)"
                  >
                    {{ getDaysLeftText(task) }}
                  </span>
                  <span
                    v-else
                    class="text-xs self-start bg-gray-200 text-gray-700"
                  >
                    Complete
                  </span>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="flex flex-col mb-2">
                <div class="flex items-center">
                  <span :class="['w-2 h-2 rounded-full mr-2', task.status === 'completed' ? 'bg-gray-700' : 'bg-blue-500']"></span>
                  <span class="text-sm text-gray-500">{{ formatDateRange(task.start, task.end) }}</span>
                </div>
                <h4 class="font-medium break-words">{{ truncateText(task.title, 30) }}</h4>
                <p class="text-sm text-gray-600 break-words">{{ truncateText(task.description, 50) }}</p>
                <div class="flex justify-between items-center">
                  <span
                    v-if="task.status !== 'completed'"
                    class="text-xs self-start"
                    :class="getDaysLeftClass(task)"
                  >
                    {{ getDaysLeftText(task) }}
                  </span>
                  <span
                    v-else
                    class="text-xs self-start bg-gray-200 text-gray-700"
                  >
                    Complete
                  </span>
                </div>
              </div>
            </template>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineEmits } from 'vue';
import dayjs from "dayjs";
import { useCalendarStore } from "../store/calendar";

const props = defineProps(['isEventbarOpen'])
const calendarStore = useCalendarStore();
const groupedByMonth = calendarStore.groupedByMonth;

// Create a computed property for the sorted groupedByMonth
const sortedGroupedByMonth = computed(() => {
  const groupedByMonth = calendarStore.groupedByMonth;
  
  // Convert the object to an array of [key, value] pairs
  const monthEntries = Object.entries(groupedByMonth);
  
  // Sort the array based on the month/year
  monthEntries.sort((a, b) => {
    const dateA = dayjs(a[0], 'MMMM YYYY');
    const dateB = dayjs(b[0], 'MMMM YYYY');
    return dateA.diff(dateB);
  });
  
  // Convert the sorted array back to an object
  return Object.fromEntries(monthEntries);
});


function truncateText(text, maxLength) {
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

function formatMonth(month) {
  return dayjs(month).format('MMMM YYYY');
}

function formatDateTime(date) {
  return dayjs(date).format('MMM D, YYYY [at] h:mm A');
}

function getDaysLeftClass(task) {
  const daysLeft = dayjs(task.end).diff(dayjs(), 'day');
  if (daysLeft < 0) return 'text-red-800';
  if (daysLeft <= 3) return 'text-yellow-800';
  return 'text-green-800';
}

function getDaysLeftText(task) {
  const daysLeft = dayjs(task.end).diff(dayjs(), 'day');
  if (daysLeft < 0) return 'Overdue';
  if (daysLeft === 0) return 'Today';
  if (daysLeft === 1) return 'Tomorrow';
  return `${daysLeft} days left`;
}

function formatDateRange(start, end) {
  const startDate = dayjs(start);
  const endDate = dayjs(end);
  
  if (startDate.isSame(endDate, 'day')) {
    return startDate.format('MMM D, YYYY');
  } else {
    return `${startDate.format('MMM D')} - ${endDate.format('MMM D, YYYY')}`;
  }
}
// Jump to Task in CodeMirror
const jumpToTask = (task) => {

};


const emit = defineEmits(['jump-to-line','toggleEventbar']);

const handleClick = (lineNumber) => {
  console.log(lineNumber);
  emit("jump-to-line", lineNumber);
};


</script>
