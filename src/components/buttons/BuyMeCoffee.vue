<template>
  <div>
    <!-- The Buy Me a Coffee button will load dynamically -->
  </div>
</template>

<script>
export default {
  mounted() {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js';
    script.setAttribute('data-name', 'BMC-Widget');
    script.setAttribute('data-cfasync', 'false');
    script.setAttribute('data-id', 'mentalfuse');
    script.setAttribute('data-description', 'Support me on Buy me a coffee!');
    script.setAttribute('data-message', 'Thank you for visiting. If you like the app, you can buy me a coffee.');
    script.setAttribute('data-color', '#5F7FFF');
    script.setAttribute('data-position', 'Right');
    script.setAttribute('data-x_margin', '18');
    script.setAttribute('data-y_margin', '18');
    script.id = 'bmc-widget-script';

    script.onload = () => {
      console.log('Buy Me a Coffee script loaded!');
      setTimeout(() => {
        if (typeof BMC !== 'undefined' && BMC.init) {
          BMC.init();
          console.log('BMC initialized!');
        } else {
          console.error('BMC is still undefined after loading script.');
        }
      }, 500);
    };

    document.body.appendChild(script);
  }
};
</script>

<style scoped>
#bmc-widget {
    
    height: 48px !important; /* optional */
    width: 48px !important; /* optional */
}
</style>