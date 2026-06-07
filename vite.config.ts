import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
    },
  },
  server: {
    port: 4890,
    strictPort: true,
    watch: {
      // Exclude Python virtual environments from file watching to prevent hot-reload spam
      ignored: ['**/graphrag/.venv/**', '**/node_modules/**', '**/.git/**'],
    },
  },
});