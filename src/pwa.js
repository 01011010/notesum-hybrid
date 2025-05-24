// src/pwa.js
import { registerSW } from 'virtual:pwa-register'

export function registerPWA() {
    const updateSW = registerSW({
        onNeedRefresh() {
            // Show update notification
            if (confirm('New content available. Reload?')) {
                updateSW()
            }
        },
        onOfflineReady() {
            console.log('App ready to work offline')
        }
    })
}
