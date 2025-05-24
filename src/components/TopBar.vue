<template>
    <div class="flex flex-row w-full bg-white text-gray-900 dark:bg-custom-dark dark:text-white">
        
        <SideToggleButton 
            :isSidebarOpen="isSidebarOpen" 
            @toggleSidebar="$emit('toggleSidebar')"
        />  
        <EventToggleButton 
            :isEventbarOpen="isEventbarOpen" 
            @toggleEventbar="$emit('toggleEventbar')"
        />  
        <DarkToggleButton :isDark="isDark" :toggleDark="toggleDark"/>  
        <VaultStatus :isUnlocked="isVaultUnlocked"/>
        <GoogleLoginButton />
        <TimezoneDropdown />
        <!--
        <VersionChecker />
        -->
        
        
        
        
    </div>
</template>
<script>
    import SideToggleButton from './buttons/SidebarToggleButton.vue';
    import EventToggleButton from './buttons/EventbarToggleButton.vue';
    import DarkToggleButton from './buttons/DarkToggleButton.vue';
    import GoogleLoginButton from './buttons/GoogleLoginButton.vue';
    import TimezoneDropdown from './buttons/TimezoneDropdown.vue';
    import VaultStatus from './buttons/VaultStatus.vue';
//    import VersionChecker from './VersionChecker.vue';

    export default {
        name: 'TopBar',
        components: {
            SideToggleButton,
            EventToggleButton,
            DarkToggleButton,
            TimezoneDropdown,
            GoogleLoginButton,
            VaultStatus,
  //          VersionChecker
        },
        props: {
            isSidebarOpen: {
                type: Boolean,
                required: true
            },
            isEventbarOpen: {
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
            },
            isVaultUnlocked: {
                type: Boolean,
                default: false
            },
            componentToShow: {
                type: String,
                required: false
            }
        },
        emits: ['toggleSidebar','toggleEventbar','toggleDark'], 
        setup(props) {
            return {};
        }
    }
</script>
<style scoped>
    /* Additional styling if needed */
</style>