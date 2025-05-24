<template>
  <div class="max-w-md mx-auto mt-10 p-6 bg-white dark:bg-custom-dark rounded-lg shadow-md">
    <h2 class="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Secure Vault Setup</h2>

    <!-- If an encrypted key exists, show unlock UI -->
    <div v-if="vaultKeyExists" class="space-y-4">
      <p class="text-gray-600 dark:text-gray-300">Enter your passphrase to unlock your vault:</p>
      <input 
        type="password" 
        v-model="passphrase" 
        placeholder="Enter passphrase" 
        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
      />
      <button 
        @click="unlockVault"
        class="w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-300"
      >
        Unlock
      </button>
    </div>

    <!-- If no key exists, show passphrase setup UI -->
    <div v-else class="space-y-4">
      <div>
        <label for="passphrase" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enter Passphrase:</label>
        <input 
          id="passphrase"
          type="password" 
          v-model="passphrase" 
          placeholder="Enter passphrase" 
          class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
      </div>

      <div>
        <label for="confirmPassphrase" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm Passphrase:</label>
        <input 
          id="confirmPassphrase"
          type="password" 
          v-model="confirmPassphrase" 
          placeholder="Confirm passphrase" 
          class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
      </div>

      <button 
        @click="generateKey"
        class="w-full px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors duration-300"
      >
        Set Key
      </button>
<!--
      <label class="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
        
        <input 
          type="checkbox" 
          v-model="saveKey"
          class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
        />
        <span>Encrypted key will be saved in the cloud (optional)</span>
      
        
      </label>
      -->
    </div>

    <p v-if="errorMessage" class="mt-4 text-red-600 dark:text-red-400">{{ errorMessage }}</p>
    <p v-if="successMessage" class="mt-4 text-green-600 dark:text-green-400">{{ successMessage }}</p>
  </div>
</template>


<script>
import { encryptData, generateKeyFromPassphrase } from "../utils/cryptoUtils";
import { auth, saveEncryptedKeyToFirestore, getEncryptedKeyFromFirestore, unlockUserVault, syncDexieToFirestore } from "../firebase2";
//import { getAuth } from "firebase/auth";

/*
export default {
  data() {
    return {
      passphrase: "",
      confirmPassphrase: "",
      saveKey: true,
      errorMessage: "",
      successMessage: "",
      vaultKeyExists: false,
    };
  },
  async created() {
   // await this.checkForExistingKey();
  },
  
  methods: {
    async checkForExistingKey() {
      //const auth = auth();
      const user = auth.currentUser;
      
      if (!user) return;

      try {
        const encryptedKey = await getEncryptedKeyFromFirestore(user.uid);
        if (encryptedKey) {
          this.vaultKeyExists = true;
        }
      } catch (error) {
        console.error("Error checking for existing key:", error);
      }
    },
    async generateKey() {
        if (this.passphrase !== this.confirmPassphrase) {
            this.errorMessage = "Passphrases do not match.";
            return;
        }

  try {
    const encryptionKey = await generateKeyFromPassphrase(this.passphrase);
    const encryptedKey = await encryptData(encryptionKey, this.passphrase);
    let decryptedKey = null;
    if (this.saveKey) {
      //const auth = auth();
      const user = auth.currentUser;
      if (user) {
        await saveEncryptedKeyToFirestore(user.uid, encryptedKey);
        this.successMessage = "Vault passphrase set and saved successfully!";
        this.$emit("passphrase-set", this.passphrase); // Emit key to be used for encryption/decryption
        
        if(this.passphrase) {
          decryptedKey = await unlockUserVault(this.passphrase);
        }
   
        if (decryptedKey) {
          await syncDexieToFirestore();

        } else {
          throw new Error("Incorrect passphrase");
        }
   
      } else {
        this.errorMessage = "You must be logged in to save the key.";
        return;
      }
    } else {
      this.successMessage = "Vault passphrase set successfully!";
    }

    this.errorMessage = "";
  } catch (error) {
    console.error("Error setting passphrase:", error);
    this.errorMessage = "Failed to set passphrase.";
  }
},
  },
};
*/
export default {
  data() {
    return {
      passphrase: "",
      confirmPassphrase: "",
      saveKey: true,
      errorMessage: "",
      successMessage: "",
      vaultKeyExists: false,
      isProcessing: false,
    };
  },
  
  async created() {
    //await this.checkForExistingKey();
  },
  
  methods: {
    async checkForExistingKey() {
      const user = auth.currentUser;
      if (!user) return;
      
      try {
        const encryptedKey = await getEncryptedKeyFromFirestore(user.uid);
        this.vaultKeyExists = !!encryptedKey;
      } catch (error) {
        console.error("Error checking for existing key:", error);
      }
    },
    
    async generateKey() {
      // Clear previous messages
      this.errorMessage = "";
      this.successMessage = "";
      
      // Validate input
      if (this.passphrase !== this.confirmPassphrase) {
        this.errorMessage = "Passphrases do not match.";
        return;
      }
      
      if (!this.passphrase || this.passphrase.length < 3) {
        this.errorMessage = "Passphrase must be at least 4 characters.";
        return;
      }
      
      // Prevent multiple submissions
      if (this.isProcessing) return;
      this.isProcessing = true;
      
      try {
        const encryptionKey = await generateKeyFromPassphrase(this.passphrase);
        const encryptedKey = await encryptData(encryptionKey, this.passphrase);
        
        if (this.saveKey) {
          const user = auth.currentUser;
          if (!user) {
            this.errorMessage = "You must be logged in to save the key.";
            this.isProcessing = false;
            return;
          }
          
          // Save key to Firestore first
          let saveSuccess = false;
          try {
            await saveEncryptedKeyToFirestore(user.uid, encryptedKey);
            saveSuccess = true;
          } catch (saveError) {
            console.error("Failed to save key to Firestore:", saveError);
            this.errorMessage = "Failed to save passphrase to cloud. Your passphrase was not saved.";
            this.isProcessing = false;
            return;
          }
          
          // Only proceed if save was successful
          if (saveSuccess) {
            let decryptedKey = null;
            try {
              decryptedKey = await unlockUserVault(this.passphrase);
            } catch (unlockError) {
              console.error("Failed to unlock vault:", unlockError);
              this.errorMessage = "Passphrase saved but failed to unlock vault.";
              this.isProcessing = false;
              return;
            }
            
            if (decryptedKey) {
              try {
                await syncDexieToFirestore();
                this.successMessage = "Vault passphrase set and saved successfully!";
                this.$emit("passphrase-set", this.passphrase);
              } catch (syncError) {
                console.error("Failed to sync data:", syncError);
                this.errorMessage = "Passphrase saved but failed to sync data.";
                this.isProcessing = false;
                return;
              }
            } else {
              this.errorMessage = "Incorrect passphrase. Please try again.";
              this.isProcessing = false;
              return;
            }
          }
        } else {
          // Not saving to Firestore, just emit the event
          this.successMessage = "Vault passphrase set successfully!";
          this.$emit("passphrase-set", this.passphrase);
        }
      } catch (error) {
        console.error("Error setting passphrase:", error);
        this.errorMessage = `Failed to set passphrase: ${error.message || "Unknown error"}`;
      } finally {
        this.isProcessing = false;
      }
    },
    
    // Add a method to clear sensitive data when component is destroyed
    clearSensitiveData() {
      this.passphrase = "";
      this.confirmPassphrase = "";
    }
  },
  
  beforeDestroy() {
    this.clearSensitiveData();
  }
};
</script>