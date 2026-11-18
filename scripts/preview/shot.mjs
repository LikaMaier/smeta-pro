// Скриншоты экранов телефона: node scripts/preview/shot.mjs сценарий.mjs [папка]
// Сценарий экспортирует default async ({ page, shot, go }); go(url, seed) — открыть экран (seed — данные мока), shot(имя, вся_страница)
const { chromium } = await import(`${process.env.NPM_TOOLS || '/opt/npm-tools/node_modules'}/playwright-core/index.mjs`);
import path from 'node:path';
const scen = (await import(path.resolve(process.argv[2]))).default;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--disable-sync', '--disable-default-apps'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.DPR || 1.5), locale: 'ru-RU', isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
const out = process.argv[3] || '/tmp/smeta-shots';
(await import('node:fs')).mkdirSync(out, { recursive: true });
const shot = async (name, full = false) => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${name}.png`, fullPage: full }); console.log('shot', name); };
const go = async (url, seed) => { if (seed) await page.addInitScript((s) => { window.__SEED = s; }, seed); await page.goto(`http://127.0.0.1:5199${url}${url.includes('?') ? '&' : '?'}dev=1`); await page.waitForTimeout(700); };
try { await scen({ page, shot, go }); } catch (e) { console.log('SCENARIO ERROR', e.message); await page.screenshot({ path: `${out}/_error.png` }); }
await browser.close();
