<template>
    <div v-if="updateAvailable" class="update-notification">
      A new version is available.
      <button @click="refreshPage">Update</button>
    </div>
  </template>
  
  <script>
  export default {
    data() {
      return {
        updateAvailable: false,
        currentVersion: "1.0.0", // Update this manually on each deployment
      };
    },
    mounted() {
      this.checkForUpdates();
      setInterval(this.checkForUpdates, 60000); // Check every minute
    },
    methods: {
      async checkForUpdates() {
        try {
          const response = await fetch("/index.html", { cache: "no-store" });
          //console.log(response);
          const version = response.headers.get("X-App-Version");
          //console.log(version)
          if (version && version !== this.currentVersion) {
            this.updateAvailable = true;
          }
        } catch (error) {
          console.error("Error checking for updates:", error);
        }
      },
      refreshPage() {
        window.location.reload();
      },
    },
  };
  </script>
  
  <style>
  .update-notification {
    position: fixed;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: #ffcc00;
    padding: 10px;
    border-radius: 5px;
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);
  }
  </style>
  