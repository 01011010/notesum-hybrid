<template>
    <button
        v-if="!user"
        @click="loginWithGoogle"
        class="
        tsb p-1 w-8 h-8 text-zinc-500 dark:text-zinc-400 border-transparent 
        focus:border-transparent focus:ring-0 rounded z-30
        transition-colors 
        hover:bg-zinc-200 dark:hover:bg-zinc-700 
        hover:text-zinc-700 dark:hover:text-zinc-300"
    >
      <svg xmlns="http://www.w3.org/2000/svg" 
      width="24" height="24" viewBox="0 0 24 24" 
      fill="none" stroke="currentColor" stroke-width="2" 
      class="h-5 w-5"
      stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20v-2a4 4 0 0 1 4-4h4" />
          <path d="M16 16l4-4-4-4" />
      </svg>

    </button>
    <template v-else>
      
    <img :src="user.photoURL" alt="User Avatar" class=" tsb p-1 w-8 h-8 w-5 h-5 rounded-full" />
    <button
      @click="logout"
      class="
      tsb p-1 w-8 h-8
      text-zinc-500 dark:text-zinc-400 border-transparent 
      focus:border-transparent focus:ring-0 rounded z-30
      transition-colors 
      hover:bg-zinc-200 dark:hover:bg-zinc-700 
      hover:text-zinc-700 dark:hover:text-zinc-300 text-sm"
    >
    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">  
      <path d="M9 15l-5-5 5-5" />
      <path d="M4 10h12" />
      <path d="M17 3h3v18h-3" />
    </svg>
  </button>
</template>
  
    
  </template>
  
  <script>
  import { ref, onMounted } from "vue";
  import { auth, lockUserVault } from "../../firebase2";
  import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
  
  
  export default {
    name: "GoogleAuthButton",
    setup() {
        
      const user = ref(null); // Reactive user state
      const isAuthenticating = ref(false); // Prevent duplicate popups
  
      const loginWithGoogle = async () => {

        if (isAuthenticating.value) return; // Prevent multiple popups
        isAuthenticating.value = true;
  
        try {
          const provider = new GoogleAuthProvider();
          const result = await signInWithPopup(auth, provider);
          user.value = result.user; // Set user after login
        } catch (error) {
          if (error.code === "auth/cancelled-popup-request") {
            console.warn("Popup request was canceled.");
          } else if (error.code === "auth/popup-closed-by-user") {
            console.warn("Popup closed by user.");
          } else {
            console.error("Error signing in:", error);
          }
        } finally {
          isAuthenticating.value = false;
        }
      };
  
      const logout = async () => {
        try {
          await signOut(auth);
          lockUserVault();
          user.value = null; // Clear user state
        } catch (error) {
          console.error("Error signing out:", error);
        }
      };
  
      const checkAuthState = () => {
        onAuthStateChanged(auth, (currentUser) => {
          user.value = currentUser; // Keep user logged in across sessions
        });
      };
  
      onMounted(() => {
        checkAuthState(); // Check if user is already logged in
      });
  
      return { user, loginWithGoogle, logout };
    },
  };
  </script>
  

<style scoped>
/* Optional extra styling */


/* // Check if the user exists in Firestore
const userRef = firestore.collection('users').doc(user.uid);
const userDoc = await userRef.get();

if (!userDoc.exists) {
    // If the user is logging in for the first time, register them
    await userRef.set({
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        role: 'free',
        maxPages: 3,
        cloudSync: false
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
} else {
    // Existing user: Load their tier info
    const userData = userDoc.data();
    this.role = userData.role;
    this.maxPages = userData.maxPages;
    this.cloudSync = userData.cloudSync;
}

// If user is still free, show upgrade button
if (this.role === 'free') {
    showUpgradePopup();
}
*/
</style>

