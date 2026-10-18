import { readdirSync } from 'node:fs';
const root = new URL('../server/src', import.meta.url).pathname;
const files = [...readdirSync(root).filter((f) => f.endsWith('.ts') && f !== 'index.ts').map((f) => `${root}/${f}`), ...readdirSync(`${root}/routes`).map((f) => `${root}/routes/${f}`), ...readdirSync(`${root}/ai`).filter((f) => f.endsWith('.ts')).map((f) => `${root}/ai/${f}`)];
let bad = 0;
for (const f of files) { try { await import(f); } catch (e) { bad++; console.log('FAIL', f.replace(root, ''), e.message.split('\n')[0]); } }
console.log(bad ? `${bad} FAILED` : `ALL ${files.length} SERVER MODULES OK`);
process.exit(bad ? 1 : 0);
