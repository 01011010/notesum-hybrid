<template>
    <button @click="$emit('toggleSidebar')" selected="false" 
    class="tsb p-1 w-8 h-8 
    text-zinc-500 dark:text-zinc-400 border-transparent 
    focus:border-transparent focus:ring-0 rounded z-30
    transition-colors 
    hover:bg-zinc-200 dark:hover:bg-zinc-700 
    hover:text-zinc-700 dark:hover:text-zinc-300">
        <svg xmlns="http://www.w3.org/2000/svg" 
        width="24" height="24" 
        viewBox="-1 -1 26 26" 
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" 
        class="h-5 w-5">
            <path d="M21 3H3C1.89543 3 1 3.89543 1 5V19C1 20.1046 1.89543 21 3 21H21C22.1046 21 23 20.1046 23 19V5C23 3.89543 22.1046 3 21 3Z"></path>
            <path d="M10 4V20"></path>
            <path d="M4 7H7"></path><path d="M4 10H7"></path><path d="M4 13H7"></path>
        </svg>
    </button>
</template>
<script>
export default {
    name: 'SideToggleButton',
    props: {
        isSidebarOpen: {
            type: Boolean,
            required: true
        }
    },
    emits: ['toggleSidebar'],
    setup() { 
        return {}
    } 
}
</script>
