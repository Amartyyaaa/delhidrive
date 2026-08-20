import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves a project site from https://<user>.github.io/<repo>/,
// so every asset URL needs that prefix. The deploy workflow sets VITE_BASE to
// "/<repo>/"; locally and on hosts that serve from the domain root it stays "/".
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5180, strictPort: false },
  build: {
    rollupOptions: {
      output: {
        // Supabase and jsPDF are large and change rarely — splitting them out
        // keeps the app chunk small and lets the browser cache them across
        // deploys.
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          pdf: ['jspdf', 'jspdf-autotable'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
