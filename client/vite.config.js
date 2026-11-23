import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API and socket server run on port 4000 (see server/.env.example).
// Proxying keeps the browser on a single origin, so cookies and SameSite=Lax behave as in production.
const API_TARGET = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': API_TARGET,
      '/socket.io': { target: API_TARGET, ws: true },
    },
  },
  build: {
    // Source maps are not published: they roughly double the size of what is deployed and expose
    // the original source to anyone. Turn on locally with `vite build --sourcemap` when debugging.
    sourcemap: false,
    rollupOptions: {
      // offline.html is a second entry: the service worker serves it when a navigation fails.
      input: { main: 'index.html', offline: 'offline.html' },
    },
  },
});
