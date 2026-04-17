import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  build: {
    outDir: '../../build/client',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'src/client/index.html',
        battle: 'src/client/battle.html',
        replays: 'src/client/replays.html',
        workshop: 'src/client/workshop.html',
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/client/app/**/*.test.js'],
  },
});
