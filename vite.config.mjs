import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';

import { listRuntimeSourceFiles } from './src/client/app/runtime-source-manifest.js';

function copyRuntimeSourceFilesPlugin() {
  return {
    name: 'copy-runtime-source-files',
    async writeBundle(outputOptions) {
      const outDir = path.resolve(process.cwd(), outputOptions.dir || 'build/client');
      const runtimeFiles = listRuntimeSourceFiles();
      await Promise.all(runtimeFiles.map(async (entry) => {
        const targetPath = path.join(outDir, ...String(entry.src).split('/'));
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(path.resolve(process.cwd(), entry.file), targetPath);
      }));
    },
  };
}

export default defineConfig({
  root: 'src/client',
  plugins: [
    copyRuntimeSourceFilesPlugin(),
  ],
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
