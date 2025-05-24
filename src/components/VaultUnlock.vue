<template>
  <div :class="{ dark: isDark }" class="max-w-md mx-auto mt-10 p-6 bg-white dark:bg-custom-dark rounded-lg shadow-md">
    <div v-if="!isUnlocked" class="space-y-4">
      <label for="passphrase" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Unlock Vault:
      </label>
      <input
        type="password"
        id="passphrase"
        v-model="passphrase"
        @keyup.enter="unlockVault"
        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        placeholder="Enter passphrase"
      />
      <button
        @click="unlockVault"
        class="w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-300"
      >
        Unlock
      </button>
      <p v-if="errorMessage" class="text-red-600 dark:text-red-400 text-sm mt-2">
        {{ errorMessage }}
      </p>
    </div>

    <div v-else class="text-center space-y-2">
      <span class="text-6xl">🔓</span>
      <p class="text-xl font-semibold text-green-600 dark:text-green-400">Vault Unlocked</p>
    </div>
  </div>
</template>

<script>
import { unlockUserVault, syncDexieToFirestore } from "../firebase2";

export default {
  data() {
    return {
      passphrase: "",
      isUnlocked: false,
      errorMessage: "",
      attemptCount: 0,
      lastAttemptTime: null,
      lockoutUntil: null,
      inactivityTimer: null
    };
  },
  props: {
    isDark: {
      type: Boolean,
      required: true
    },
    // New props for configuration
    maxAttempts: {
      type: Number,
      default: 5
    },
    lockoutDuration: {
      type: Number,
      default: 300000 // 5 minutes in milliseconds
    },
    autoLockTimeout: {
      type: Number,
      default: 600000 // 10 minutes in milliseconds
    }
  },
  created() {
    // Reset attempt counter after lockout period
    this.checkLockoutStatus();
  },
  beforeUnmount() {
    // Clear any timers when component is destroyed
    this.clearInactivityTimer();
  },
  methods: {
    checkLockoutStatus() {
      // Check if user is in lockout period
      if (this.lockoutUntil && new Date() < this.lockoutUntil) {
        const remainingTime = Math.ceil((this.lockoutUntil - new Date()) / 1000);
        this.errorMessage = `Too many failed attempts. Please try again in ${remainingTime} seconds.`;
        return false;
      } else if (this.lockoutUntil) {
        // Reset lockout if the period has passed
        this.lockoutUntil = null;
        this.attemptCount = 0;
        this.errorMessage = "";
      }
      return true;
    },
    
    async unlockVault() {
      try {
        // Check if user is in lockout period
        if (!this.checkLockoutStatus()) {
          return;
        }
        
        // Rate limiting logic
        const now = new Date();
        if (this.lastAttemptTime && (now - this.lastAttemptTime) < 1000) {
          this.errorMessage = "Please wait before trying again.";
          return;
        }
        this.lastAttemptTime = now;
        
        let decryptedKey = null;
        if (this.passphrase) {
          decryptedKey = await unlockUserVault(this.passphrase);
        }
        
        if (decryptedKey) {
          this.isUnlocked = true;
          this.attemptCount = 0;
          this.errorMessage = "";
          
          // Set up inactivity timer
          this.startInactivityTimer();
          
          // Avoid logging sensitive information
          this.$emit("vault-unlock-success");
          
          await syncDexieToFirestore();
          this.$emit("vault-unlocked", decryptedKey); // Emit key to be used for encryption/decryption
        } else {
          throw new Error("Incorrect passphrase");
        }
      } catch (error) {
        // Increment attempt counter and check for lockout
        this.attemptCount++;
        
        if (this.attemptCount >= this.maxAttempts) {
          this.lockoutUntil = new Date(Date.now() + this.lockoutDuration);
          this.errorMessage = `Too many failed attempts. Please try again in ${Math.ceil(this.lockoutDuration/1000)} seconds.`;
        } else {
          console.warn(`Failed unlock attempt ${this.attemptCount}/${this.maxAttempts}`);
          this.errorMessage = `Invalid passphrase. ${this.maxAttempts - this.attemptCount} attempts remaining.`;
        }
      }
    },
    
    startInactivityTimer() {
      this.clearInactivityTimer();
      this.inactivityTimer = setTimeout(() => {
        this.lockVault();
      }, this.autoLockTimeout);
    },
    
    clearInactivityTimer() {
      if (this.inactivityTimer) {
        clearTimeout(this.inactivityTimer);
        this.inactivityTimer = null;
      }
    },
    
    lockVault() {
      if (this.isUnlocked) {
        this.isUnlocked = false;
        this.passphrase = "";
        this.$emit("vault-locked");
      }
    },
    
    // Reset inactivity timer on user activity
    resetInactivityTimer() {
      if (this.isUnlocked) {
        this.startInactivityTimer();
      }
    }
  },
  watch: {
    // Reset timer when user types
    passphrase() {
      this.resetInactivityTimer();
    }
  }
}

/* good, but basic
export default {
  data() {
    return {
      passphrase: "",
      isUnlocked: false,
      errorMessage: "",
    };
  },
  props : {
    isDark: {
                type: Boolean,
                required: true
            },
  },
  methods: {
    async unlockVault() {
      
      try {
        let decryptedKey = null;
          if(this.passphrase) {
            decryptedKey = await unlockUserVault(this.passphrase);
          }
        if (decryptedKey) {
          this.isUnlocked = true;
          console.log("unlocked...")
          await syncDexieToFirestore();
          this.$emit("vault-unlocked", decryptedKey); // Emit key to be used for encryption/decryption
        } else {
          throw new Error("Incorrect passphrase");
        }
      } catch (error) {
        console.error("Vault Unlock Error:", error);
        this.errorMessage = "Invalid passphrase. Please try again.";
      }
    }
        }  
};
*/
    /* old and broken, don't use
    async unlockVault() {
      try {

        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        // Retrieve encrypted key from Firestore
        const encryptedKey = await getEncryptedKeyFromFirestore(user.uid);
        if (!encryptedKey) throw new Error("No vault key found");

        // Try to decrypt the key using the entered passphrase
        const key = await generateKeyFromPassphrase(this.passphrase);
        const decryptedKey = await decryptData(key, encryptedKey);

        if (decryptedKey) {
          this.isUnlocked = true;
          console.log("unlocked...")
          this.$emit("vault-unlocked", decryptedKey); // Emit key to be used for encryption/decryption
        } else {
          throw new Error("Incorrect passphrase");
        }
      } catch (error) {
        console.error("Vault Unlock Error:", error);
        this.errorMessage = "Invalid passphrase. Please try again.";
      }
    },
    */

</script>

<style scoped>
.vault-container {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lock-icon {
  font-size: 24px;
}
.error {
  color: red;
}
</style>
