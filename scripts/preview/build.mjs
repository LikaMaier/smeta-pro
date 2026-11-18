// Сборка приложения с мок-сервером для предпросмотра: node scripts/preview/build.mjs
// Нужны esbuild, react и react-dom из /opt/npm-tools (или поправьте TOOLS).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const TOOLS = process.env.NPM_TOOLS || '/opt/npm-tools/node_modules';
const { build } = await import(`${TOOLS}/esbuild/lib/main.js`);
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dist');
const r = await build({
  entryPoints: [path.join(here, 'entry.tsx')], bundle: true, outfile: path.join(out, 'app.js'), format: 'iife', sourcemap: 'inline', logLevel: 'warning',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
  nodePaths: [TOOLS], alias: { 'react-router-dom': path.join(here, 'router-shim.tsx') },
  loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl' },
  external: ['/fonts/*', '/icon.svg', '/*.png', '/*.jpg'],
});
fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><html lang="ru"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"/><title>СМЕТА PRO</title><link rel="stylesheet" href="/app.css"/></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
console.log('built', r.errors.length, 'errors', r.warnings.length, 'warnings');
