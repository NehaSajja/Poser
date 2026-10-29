import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  // Keep this experiment's dependency cache separate when sharing node_modules.
  cacheDir: '.local/vite-cache',
  resolve: { alias: { web_pen_sdk: fileURLToPath(new URL('./vendor/neo-web-sdk/src/index.ts', import.meta.url)) } },
  plugins: [tailwindcss(), { name: 'neo-paper-xml', enforce: 'pre', async load(id) {
    if (id.endsWith('.nproj')) return `export default ${JSON.stringify(await readFile(id, 'utf8'))}`;
  } }], esbuild: { jsx: 'automatic' },
  // Prebundle SDK dependencies so the first Bluetooth connection cannot trigger
  // Vite's dependency-discovery reload and disconnect a newly chosen pen.
  optimizeDeps: { include: ['three/addons/loaders/FBXLoader.js', 'three/addons/loaders/GLTFLoader.js', 'three/addons/controls/OrbitControls.js',
    'firebase/app', 'firebase/storage', 'jquery', 'jszip'] },
  server: { host: '127.0.0.1', proxy: { '/mhr-experiment/api': { target: 'http://127.0.0.1:4354', rewrite: path => path.replace('/mhr-experiment', '') } }, ...(process.env.VITE_HMR_PORT ? { hmr: { port: Number(process.env.VITE_HMR_PORT) } } : {}), watch: { ignored: ['**/.local/**', '**/output/**', '**/server/**', '**/tests/**'] } },
});
