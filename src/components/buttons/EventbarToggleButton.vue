<template>
   <button @click="$emit('toggleEventbar')" selected="false"
    class="tsb p-1 w-8 h-8 
    text-zinc-500 dark:text-zinc-400 border-transparent 
    focus:border-transparent focus:ring-0 rounded z-30
    transition-colors 
    hover:bg-zinc-200 dark:hover:bg-zinc-700 
    hover:text-zinc-700 dark:hover:text-zinc-300">
    <svg xmlns="http://www.w3.org/2000/svg" 
        width="24" height="24" 
        viewBox="0 0 24 24" 
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" 
        class="h-5 w-5">
        <!-- Heroicons Calendar Icon -->
        <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
    </svg>
</button>
</template>
<script>
export default {
    name: 'EventToggleButton',
    props: {
        isEventbarOpen: {
            type: Boolean,
            required: true
        }
    },
    emits: ['toggleEventbar'],
    setup() { 
        return {}
    } 
}
</script>
