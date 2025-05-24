<template>
<!--
    :class="isUnlocked 
        ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' 
        : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'"
-->
        <!--
hover:bg-zinc-200 dark:hover:bg-zinc-700 
    hover:text-zinc-700 dark:hover:text-zinc-300"-->
<button 
    selected="false"
    disabled="true"
    class="
    tsb p-1 w-8 h-8 text-zinc-500 dark:text-zinc-400 border-transparent 
    focus:border-transparent focus:ring-0 rounded z-30
    transition-colors 
    "
>
    
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        class="h-5 w-5 mx-auto rounded " 
        :class="isUnlocked 
        ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' 
        : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'"
        viewBox="0 0 20 20" 
        fill="currentColor"
      >
        <path 
          v-if="isUnlocked" 
          fill-rule="evenodd" 
          d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2zM8 10a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1h-2a1 1 0 01-1-1v-2z" 
          clip-rule="evenodd" 
        />
        <path 
          v-else 
          fill-rule="evenodd" 
          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" 
          clip-rule="evenodd" 
        />
      </svg> 
    </button>
    <!--
  <div class="flex items-center">
  -->
    <!--
    <span class="ml-2 mr-2 text-sm font-medium text-gray-600 dark:text-zinc-400 hidden md:flex">| Encrypted Sync:</span>
    -->
    <!--
    <span 
      :class="[
        'p-1 rounded-full',
        isUnlocked ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
      ]"
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        class="h-4 w-4" 
        viewBox="0 0 20 20" 
        fill="currentColor"
      >
        <path 
          v-if="isUnlocked" 
          fill-rule="evenodd" 
          d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2zM8 10a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1h-2a1 1 0 01-1-1v-2z" 
          clip-rule="evenodd" 
        />
        <path 
          v-else 
          fill-rule="evenodd" 
          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" 
          clip-rule="evenodd" 
        />
      </svg> 
    </span>
    <span class="ml-2 mr-2 text-sm font-medium text-gray-600 dark:text-zinc-400">|</span>
  </div>
-->
</template>

<script>
export default {
  name: 'VaultStatus',
  props: {
    isUnlocked: {
      type: Boolean,
      default: false
    }
  }
}
</script>
