<template>
    <div class="p-2 border-b dark:border-gray-700">
        <div class="flex gap-2">
            <input v-model="query" @input="searchNotes" placeholder="Search notes..." 
            class="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-100 bg-white dark:bg-gray-800 dark:border-gray-700"/>
            <button v-if="searchResults.length" @click="clearSearch" 
            class="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600">✕</button>
            
        </div>
        <!-- class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed" -->
        <div v-if="searchResults.length" class="mt-2 space-y-2 bg-white dark:bg-gray-800 p-2 border border-gray-300 dark:border-gray-700 rounded-md shadow">
                <div v-for="result in searchResults" :key="result.id" @click="handleSelect(result.id)"
                    class="p-2 border-b last:border-b-0 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                    <h4 class="font-medium text-gray-900 dark:text-gray-100">{{ result.name }}</h4>
                    <p class="text-sm text-gray-600 dark:text-gray-400" v-html="highlightMatch(result.content)"></p>
                </div>
            </div>
            <p v-else-if="query" class="text-sm text-gray-500 dark:text-gray-400 italic">No results found</p>
    </div>
</template>

<script>
import { ref } from 'vue';
import { noteTextStorage } from '../utils/noteTextStorage';

export default {
  props: {
    handlePageSelect: Function // Accepting the function from the parent
  },
  setup(props) {
    const query = ref('');
    const searchResults = ref([]);
    
    const searchNotes = async () => {
      if (!query.value.trim()) {
        searchResults.value = [];
        return;
      }

      // Fetch all pages and search for matches
      const pages = await noteTextStorage.pages.toArray();
      searchResults.value = pages
        .filter(page => page.content.toLowerCase().includes(query.value.toLowerCase()))
        .map(page => ({
          id: page.id,
          name: page.name,
          content: getSnippet(page.content, query.value)
        }));
      
    };

    const getSnippet = (content, term) => {
      const index = content.toLowerCase().indexOf(term.toLowerCase());
      if (index === -1) return content.slice(0, 100) + '...';
      const start = Math.max(0, index - 30);
      const end = Math.min(content.length, index + 30);
      return (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');
    };

    const highlightMatch = (text) => {
      const regex = new RegExp(`(${query.value})`, 'gi');
      return text.replace(regex, '<mark>$1</mark>');
    };

    const handleSelect = (pageId) => {
      if (props.handlePageSelect) {
        props.handlePageSelect(pageId); // Call the function passed from the parent
      }
    };


    const clearSearch = () => {
        query.value = '';
        searchResults.value = [];
        };


    return { query, searchResults, searchNotes, highlightMatch, handleSelect, clearSearch };
  }
};
</script>

<style scoped>

</style>
