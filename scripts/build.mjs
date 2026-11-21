// PROTOTYPE build: bundle the shared frontend into dist/ for both Electron and Tauri.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
await build({
  entryPoints: { app: 'src/app.js', looks: 'src/looks/looks.js' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120', 'safari17'],
  outdir: 'dist',
  loader: { '.wasm': 'file', '.ttf': 'file', '.woff': 'file', '.woff2': 'file' },
  logLevel: 'warning',
});
cpSync('src/index.html', 'dist/index.html');
cpSync('src/style.css', 'dist/style.css');
cpSync('src/looks/looks.html', 'dist/looks.html');
cpSync('src/looks/looks.css', 'dist/looks-page.css');
cpSync('node_modules/ghostty-web/ghostty-vt.wasm', 'dist/ghostty-vt.wasm');
console.log('built dist/');
