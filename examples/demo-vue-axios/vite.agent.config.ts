import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    ssr: 'src/agent/cli.ts',
    outDir: 'dist-agent',
    emptyOutDir: true,
    rollupOptions: {
      external: ['axios', 'open-web-cli'],
      output: {
        entryFileNames: 'cli.mjs',
        banner: '#!/usr/bin/env node',
      },
    },
  },
});
