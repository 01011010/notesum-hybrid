import { fileURLToPath, URL } from "node:url";
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
// https://vite.dev/config/
/*
export default defineConfig({
  plugins: [vue({
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag.startsWith("svg:style"),
      },
    },
  }
  )],
})
*/
/*
export default defineConfig({
  plugins: [vue({
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag.startsWith("svg:style"),
      },
    },
  })],
  base: './', // Ensures relative asset paths for static hosting
  //base: 'https://storage.googleapis.com/notesum_static/',
}) 
*/

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.npm_package_version || 'unknown'
    )
  },
  plugins: [vue({
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag.startsWith("svg:style"),
        isCustomElement: (tag) => tag.startsWith('excalidraw-')
      },
    },
  }),
  
  VitePWA({
      registerType: 'prompt', //'autoUpdate',
      devOptions: {
        enabled: true, //true
        type: 'module',
      },
      manifest: {
        name: 'Notesum',
        short_name: 'Notesum',
        description: 'Smart notepad, calculator and event tracker with persistent storage.',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // globPatterns: ['**/*.{js,css,html,ico,png,svg}', '!parser_worker.js'], // Exclude worker
        // Cache the Dexie database operations
        runtimeCaching: [
          
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/__/auth'),
            handler: 'NetworkOnly',
            options: {
              cacheName: 'firebase-auth',
            },
          },
          {
            //urlPattern: new RegExp('^https://.*'),
            urlPattern: ({ url }) => {
              return url.protocol === 'https:' && !url.pathname.startsWith('/__/auth');
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /lh3\.googleusercontent\.com/,
            handler: 'CacheFirst', // Use CacheFirst - cache and then network
            options: {
              cacheName: 'google-profile-images',
              //networkTimeoutSeconds: 3, // Optional:  If network is slow, timeout
              expiration: {
                maxEntries: 20, // Limit number of images cached
                maxAgeSeconds: 7 * 24 * 60 * 60 // Cache for 7 days (adjust as needed)
              },
              cacheableResponse: {
                statuses: [0, 200] // Only cache successful responses
              }
            },
          },
        ]
      },
  })
  ],
  base: './',
  /*
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        worker: 'src/utils/parser_worker.js' // Adjust path as needed
      }
    }
  },
  */
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@excalidraw/excalidraw']
  }
  /*
  worker: {
    format: 'es',
  },
  */
})