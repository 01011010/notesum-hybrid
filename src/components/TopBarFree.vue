<template>
    <div class="flex flex-row w-full bg-white text-gray-900 dark:bg-custom-dark dark:text-white">
        <SideToggleButton :isSidebarOpen="isSidebarOpen" @toggleSidebar="$emit('toggleSidebar')"/>  
        <DarkToggleButton :isDark="isDark" :toggleDark="toggleDark"/>  
        <TimezoneDropdown />
    </div>
</template>
<script>
    import SideToggleButton from './buttons/SidebarToggleButton.vue';
    import DarkToggleButton from './buttons/DarkToggleButton.vue';
    import TimezoneDropdown from './buttons/TimezoneDropdown.vue';
    
    export default {
        name: 'TopBar',
        components: {
            SideToggleButton,
            DarkToggleButton,
            TimezoneDropdown,
        },
        props: {
            isSidebarOpen: {
                type: Boolean,
                required: true
            },
            isDark: {
                type: Boolean,
                required: true
            },
            toggleDark: {
                type: Function,
                required: true
            }
        },
        emits: ['toggleSidebar', 'toggleDark'], 
        setup(props) {
            return {};
        }
    }
</script>
<style scoped>
    /* Additional styling if needed */
</style>