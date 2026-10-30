// Рендер ролика: node render.mjs <scene.html> <out.mp4> <audio.wav>  (кадры 540×960 ×2, 30 к/с, параллельно 6 потоков)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = await import('playwright').catch(() => import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'));
const [html, out, wav] = process.argv.slice(2);
const dir = path.join(path.dirname(path.resolve(out)), '.frames-' + path.basename(out, '.mp4')); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const url = 'file://' + path.resolve(html);
const b0 = await chromium.launch({ executablePath: exe, args: ['--allow-file-access-from-files'] });
const p0 = await b0.newPage(); await p0.goto(url); await p0.waitForFunction(() => window.OK || window.READY === true);
const N = Math.round((await p0.evaluate(() => window.DUR)) * 30); await b0.close();
const C = 6, st = Math.ceil(N / C);
await Promise.all([...Array(C)].map(async (_, k) => {
  const b = await chromium.launch({ executablePath: exe, args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await p.goto(url); await p.waitForFunction(() => window.OK || window.READY === true);
  for (let t = 0; t < N / 30; t += 1.5) { await p.evaluate((t) => window.render(t), t); await p.waitForTimeout(60); }
  for (let i = k * st; i < Math.min(N, (k + 1) * st); i++) { await p.evaluate((t) => window.render(t), i / 30); await p.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 }); }
  await b.close();
}));
execSync(`ffmpeg -y -loglevel error -framerate 30 -i ${dir}/%04d.jpg -i ${wav} -c:v libx264 -pix_fmt yuv420p -crf 23 -preset slow -c:a aac -b:a 160k -shortest -movflags +faststart "${out}.part.mp4"`);
fs.renameSync(`${out}.part.mp4`, out);
fs.rmSync(dir, { recursive: true, force: true });
console.log('ok', out, N, 'frames');
