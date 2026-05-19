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
          'vendor-firebase': [
            'firebase/app', 'firebase/auth', 'firebase/firestore',
            'firebase/storage', 'firebase/database',
          ],
          'vendor-ui': ['@tanstack/react-query'],
        },
      },
    },
  },
});
