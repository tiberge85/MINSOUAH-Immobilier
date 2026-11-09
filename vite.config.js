import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Seulement ce qu'il faut au démarrage. firebase/storage et
          // firebase/database restent dans des fichiers à part, chargés par les
          // écrans qui s'en servent.
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-ui': ['@tanstack/react-query'],
        },
      },
    },
  },
});
