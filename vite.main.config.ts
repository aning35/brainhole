import { defineConfig } from 'vite';
import { builtinModules } from 'module';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        'electron',
        'better-sqlite3',
        'pdf-parse',
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
      ],
    },
  },
}); 