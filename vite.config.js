import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { web_pen_sdk: fileURLToPath(new URL('./vendor/neo-web-sdk/src/index.ts', import.meta.url)) } },
  plugins: [tailwindcss(), { name: 'neo-paper-xml', enforce: 'pre', async load(id) {
    if (id.endsWith('.nproj')) return `export default ${JSON.stringify(await readFile(id, 'utf8'))}`;
  } }], esbuild: { jsx: 'automatic' },
  // Prebundle SDK dependencies so the first Bluetooth connection cannot trigger
  // Vite's dependency-discovery reload and disconnect a newly chosen pen.
  optimizeDeps: { include: ['three/addons/loaders/FBXLoader.js', 'three/addons/loaders/GLTFLoader.js', 'three/addons/controls/OrbitControls.js',
    'firebase/app', 'firebase/storage', 'jquery', 'jszip'] },
  server: { host: '127.0.0.1', watch: { ignored: ['**/.local/**', '**/output/**', '**/server/**', '**/tests/**'] } },
});
