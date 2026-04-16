import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'build/client',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        battle: 'src/client/app/battle-entry.js',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/client/app/**/*.test.js'],
  },
});
