import pw from '/opt/npm-tools/node_modules/playwright/index.js'; const { chromium } = pw;
import path from 'node:path';
const [html, out, ...ts] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + path.resolve(html)); await p.waitForFunction(() => window.OK, null, { timeout: 15000 }).catch(() => {});
const t0 = Date.now(); let i = 0;
for (const t of ts) { await p.evaluate((t) => window.render(+t), t); await p.screenshot({ path: `${out}-${i++}.png` }); }
console.log('ms/frame', (Date.now() - t0) / ts.length, errs.slice(0, 5).join(' | '));
await b.close();
