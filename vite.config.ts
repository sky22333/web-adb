import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/web-adb/',

  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
  },

  preview: {
    host: '127.0.0.1',
    port: 4173,
  },

  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'ADB / Fastboot 工具箱',
        short_name: 'Web ADB',
        description: '在浏览器中通过 WebUSB 直接控制 Android 设备',
        theme_color: '#3f5f90',
        background_color: '#f7f9ff',
        display: 'standalone',
        lang: 'zh-CN',
        start_url: '/web-adb/',
        scope: '/web-adb/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,woff2,woff,svg,webmanifest}'],
      },
    }),
  ],
});
