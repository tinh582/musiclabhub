import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@tensorflow')) return 'vendor-tensorflow';
          if (id.includes('node_modules/@supabase')) return 'vendor-supabase';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, 'localhost+2-key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, 'localhost+2.pem')),
    },
  },
});
