import { createPinia } from "pinia";
import { createApp } from 'vue';
import App from './App6.vue';
import VueKonva from 'vue-konva';
import pageChangeTracker from './utils/pageChangeTracker';
import './style.css';
import './assets/splitpanes-theme.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(VueKonva);
pageChangeTracker.init(pinia); // Ensure this line is present
app.mount("#app");

// vue devtools
if (import.meta.env.DEV) {
    const script = document.createElement("script");
    script.src = "http://localhost:8098";
    document.head.append(script);
}