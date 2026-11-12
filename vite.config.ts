import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { alphaTab } from '@coderline/alphatab-vite';
import { libraryApi } from './server/library-api.mjs';

const library = fileURLToPath(new URL('./library', import.meta.url));
// Don't reload the page when a tab is saved. Only the top-level library/ folder:
// a bare "**/library/**" also matched src/library/ and froze that code in dev (plan §13.5).
const libraryGlob = `${library.replace(/\\/g, '/')}/**`;

export default defineConfig({
  plugins: [react(), alphaTab(), libraryApi(library)],
  server: { host: '127.0.0.1', port: 5183, strictPort: true, hmr: { host: '127.0.0.1' }, watch: { ignored: [libraryGlob] } },
  preview: { host: '127.0.0.1', port: 5183, strictPort: true },
});
