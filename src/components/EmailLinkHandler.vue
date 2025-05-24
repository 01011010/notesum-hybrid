<template>
  <div>
    <h2>Completing Sign In...</h2>
    <p v-if="statusMessage">{{ statusMessage }}</p>
    <p v-if="error" style="color: red;">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
    getAuth,
    isSignInWithEmailLink,
    signInWithEmailLink,
    linkWithCredential, // For linking email to an existing account
    EmailAuthProvider // For creating email credential
} from "firebase/auth";

const route = useRoute();
const router = useRouter();
const auth = getAuth();

const statusMessage = ref('Checking email link...');
const error = ref(null);

onMounted(async () => {
  // 1. Check if the current URL is an email sign-in link
  if (isSignInWithEmailLink(auth, window.location.href)) {
    statusMessage.value = 'Email link detected. Attempting to sign in...';

    // 2. Get the email address
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
      // If email is not in local storage, prompt the user.
      // This happens if the user opened the link on a different device.
      email = window.prompt('Please provide your email for confirmation to complete sign in.');
      if (!email) {
        error.value = 'Email is required to complete sign in.';
        statusMessage.value = ''; // Clear status
        return; // Stop the process if no email is provided
      }
    }

    try {
      // 3. Attempt to sign in or link the account
      if (auth.currentUser) {
          // User is already signed in (e.g., via Google or anonymous)
          statusMessage.value = `Linking email ${email} to your existing account...`;
           const credential = EmailAuthProvider.credentialWithLink(email, window.location.href);
           await linkWithCredential(auth.currentUser, credential);
           statusMessage.value = 'Email successfully linked to your account!';
           window.localStorage.removeItem('emailForSignIn'); // Clean up local storage
      } else {
           // No user is currently signed in, perform standard sign-in
           statusMessage.value = `Signing in as ${email}...`;
           await signInWithEmailLink(auth, email, window.location.href);
           statusMessage.value = 'Sign in successful!';
           window.localStorage.removeItem('emailForSignIn'); // Clean up local storage
      }

      // 4. Redirect after successful sign-in or linking
      // The onAuthStateChanged listener in App.vue will detect the change
      // and update the app state accordingly. We can just redirect to
      // a relevant page, like the dashboard or home.
      router.push('/'); // Redirect to home or dashboard

    } catch (e) {
      console.error("Error completing email link sign-in/linking:", e);
      error.value = `Error completing sign in: ${e.message}`;
      statusMessage.value = ''; // Clear status
      // You might want to redirect to an error page or the auth form
       router.push('/'); // Redirect back to auth form on error
    }
  } else {
    // The URL is not an email sign-in link, redirect to home or auth page
    statusMessage.value = 'Invalid email link.';
     router.push('/'); // Redirect to auth form
  }
});
</script>