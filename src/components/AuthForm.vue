<template>
    <div class="max-w-md mx-auto mt-12 p-8 bg-white rounded-xl shadow-lg space-y-8">
      <h2 class="text-2xl font-bold text-gray-800 text-center">Sign Up or Sign In</h2>
  
      <!-- Google Sign-In Button -->
      <button
        @click="signInWithGoogle"
        class="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-md py-2 px-4 text-gray-700 font-semibold shadow-sm hover:bg-gray-50 transition"
        aria-label="Sign in with Google"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M21.35 11.1h-9.17v2.98h5.27c-.23 1.23-1.4 3.62-5.27 3.62-3.17 0-5.76-2.62-5.76-5.85s2.59-5.85 5.76-5.85c1.81 0 3.03.77 3.73 1.43l2.55-2.49C17.03 3.7 15.11 2.8 12.99 2.8c-5.04 0-9.14 4.09-9.14 9.15s4.1 9.15 9.14 9.15c5.26 0 8.75-3.7 8.75-8.89 0-.6-.07-1.07-.16-1.46z"/>
        </svg>
        Sign in with Google
      </button>
  
      <div class="flex items-center my-4">
        <div class="flex-grow border-t border-gray-200"></div>
        <span class="mx-4 text-gray-400 text-sm">or</span>
        <div class="flex-grow border-t border-gray-200"></div>
      </div>
  
      <!-- Email and Password Auth -->
      <div>
        <h3 class="text-lg font-semibold text-gray-700 mb-2">Email and Password</h3>
        <div class="space-y-4">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-600">Email</label>
            <input
              type="email"
              id="email"
              v-model="email"
              class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring focus:ring-blue-200"
              autocomplete="email"
            />
          </div>
          <div>
            <label for="password" class="block text-sm font-medium text-gray-600">Password</label>
            <input
              type="password"
              id="password"
              v-model="password"
              class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring focus:ring-blue-200"
              autocomplete="current-password"
            />
          </div>
          <div class="flex gap-2">
            <button
              @click="signUpWithEmail"
              class="flex-1 bg-blue-600 text-white py-2 rounded-md font-semibold hover:bg-blue-700 transition"
            >
              Sign Up
            </button>
            <button
              @click="signInWithEmail"
              class="flex-1 bg-gray-700 text-white py-2 rounded-md font-semibold hover:bg-gray-800 transition"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
  
      <!-- Email Link Auth -->
      <div>
        <h3 class="text-lg font-semibold text-gray-700 mb-2">Sign in with Email Link</h3>
        <p class="text-sm text-gray-500 mb-2">Enter your email to receive a sign-in link.</p>
        <div class="mb-4">
          <label for="emailLink" class="block text-sm font-medium text-gray-600">Email</label>
          <input
            type="email"
            id="emailLink"
            v-model="emailLink"
            class="mt-1 w-full px-3 py-2 dark:text-black border border-gray-300 rounded-md focus:outline-none focus:ring focus:ring-blue-200"
          />
        </div>
        <button
          @click="sendSignInLink"
          class="w-full bg-green-600 text-white py-2 rounded-md font-semibold hover:bg-green-700 transition"
        >
          Send Sign-in Link
        </button>
      </div>
  
      <!-- Feedback Messages -->
      <p v-if="authError" class="text-red-600 text-center font-medium">{{ authError }}</p>
      <p v-if="emailLinkSentMessage" class="text-green-600 text-center font-medium">{{ emailLinkSentMessage }}</p>
    </div>
  </template>
  

<script setup>
import { ref, watch } from 'vue';
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    validatePassword, // Optional: for client-side validation feedback
    sendSignInLinkToEmail, // Import for email link
} from "firebase/auth";

const emit = defineEmits(['authenticated']);

const email = ref('');
const password = ref('');
const emailLink = ref(''); // For email link input
const authError = ref(null);
const emailLinkSentMessage = ref(null);
const auth = getAuth();

// Optional: Reactive password validation
const passwordValidationStatus = ref(null);
    watch(password, async (newPassword) => {
        if (newPassword) {
            passwordValidationStatus.value = await validatePassword(auth, newPassword);
        } else {
            passwordValidationStatus.value = null;
        }
    });


const signInWithGoogle = async () => {
    authError.value = null;
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        // onAuthStateChanged listener in App.vue will handle the rest
        emit('authenticated'); // Indicate authentication flow initiated/completed
    } catch (error) {
        console.error("Error signing in with Google:", error);
        authError.value = error.message;
    }
};

const signUpWithEmail = async () => {
    authError.value = null;
     // Optional: Basic client-side validation before calling Firebase
    if (!email.value || !password.value) {
        authError.value = "Please enter both email and password.";
        return;
    }
    try {
        await createUserWithEmailAndPassword(auth, email.value, password.value);
        // onAuthStateChanged listener in App.vue will handle the rest
        emit('authenticated'); // Indicate authentication flow initiated/completed
    } catch (error) {
        console.error("Error signing up with email:", error);
        authError.value = error.message;
    }
};

const signInWithEmail = async () => {
    authError.value = null;
     // Optional: Basic client-side validation before calling Firebase
    if (!email.value || !password.value) {
        authError.value = "Please enter both email and password.";
        return;
    }
    try {
        await signInWithEmailAndPassword(auth, email.value, password.value);
        // onAuthStateChanged listener in App.vue will handle the rest
         emit('authenticated'); // Indicate authentication flow initiated/completed
    } catch (error) {
        console.error("Error signing in with email:", error);
        authError.value = error.message;
    }
};

// Define actionCodeSettings for the email link
const actionCodeSettings = {
  // This URL is where the user will be redirected after clicking the link in the email.
  // This domain MUST be in the authorized domains list in your Firebase Console.
  // The path (e.g., /finish-auth) is where your application will handle the sign-in.
  //url: `${window.location.origin}/`,
  url: window.location.origin,
  handleCodeInApp: true, // This must be true for the link to be handled by your app
  // Optional: Specify iOS and Android bundle IDs for deep linking in mobile apps
  // iOS: { bundleId: 'com.example.ios' },
  // android: { packageName: 'com.example.android', installApp: true, minimumVersion: '12' },
   // Optional: if using a custom domain for auth emails
  // linkDomain: 'custom-domain.com'
};

const sendSignInLink = async () => {
    authError.value = null;
    emailLinkSentMessage.value = null;
    if (!emailLink.value) {
        authError.value = "Please enter your email address.";
        return;
    }
    try {
        await sendSignInLinkToEmail(auth, emailLink.value, actionCodeSettings);
        emailLinkSentMessage.value = `A sign-in link has been sent to ${emailLink.value}. Please check your inbox.`;
        // Save the email locally so we don't need to ask the user for it again
        // if they open the link on the same device.
        window.localStorage.setItem('emailForSignIn', emailLink.value);
        emailLink.value = ''; // Clear the input after sending
    } catch (error) {
        console.error("Error sending sign-in link:", error);
        authError.value = error.message;
    }
};
</script>