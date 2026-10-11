import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { env } from './env';
import { num } from './util';
import { estimateTotals } from './routes/estimates';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pdf/estimate_pdf.py');

/** Данные для PDF заказчику: без закупочных цен, себестоимости и прибыли */
export function pdfData(e: any, user: any, number: number, free = false) {
  const t = estimateTotals(e);
  return {
    company: user.companyName || [user.firstName, user.username ? `@${user.username}` : ''].filter(Boolean).join(' ') || 'Смета',
    contacts: user.contacts || '',
    freeMark: free, title: e.title, number: String(number), customer: e.customer, address: e.address,
    date: new Date(e.date).toISOString().slice(0, 10), validDays: e.validDays ?? 14,
    paymentTerms: e.paymentTerms, notes: e.notes,
    grouped: e.lines.some((l: any) => l.category),
    lines: e.lines.map((l: any, i: number) => ({ name: l.name, category: l.category, qty: num(l.qty), unit: l.unit, price: num(l.price), amount: t.lineAmounts[i], note: l.note })),
    totals: {
      works: t.worksSubtotal, materials: t.materialsSubtotal, other: t.otherSubtotal,
      overhead: Math.round((t.reserve + t.markup) * 100) / 100, // резерв и наценка — одной строкой «накладные»
      delivery: t.delivery, extraCosts: t.extraCosts, discount: t.discount, discountPct: num(e.discountPct),
      tax: t.tax, taxPct: num(e.taxPct), total: t.total,
    },
  };
}

export function renderPdf(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.PYTHON_BIN || 'python3', [SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = []; const err: Buffer[] = [];
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('PDF создаётся слишком долго')); }, 30000);
    p.stdout.on('data', (c) => out.push(c));
    p.stderr.on('data', (c) => err.push(c));
    p.on('error', (e) => { clearTimeout(timer); reject(new Error(`Генератор PDF недоступен: ${e.message}`)); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`Ошибка генерации PDF: ${Buffer.concat(err).toString().slice(0, 400)}`));
    });
    p.stdin.end(JSON.stringify(data));
  });
}

/** Подписанная ссылка на PDF — открывается во внешнем браузере без заголовка авторизации */
export function pdfLink(estimateId: string, ttlSec = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = crypto.createHmac('sha256', env.SESSION_SECRET || 'dev-secret').update(`pdf:${estimateId}:${exp}`).digest('base64url');
  return `/files/estimates/${estimateId}.pdf?exp=${exp}&sig=${sig}`;
}
export function checkPdfSig(estimateId: string, exp: string, sig: string) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const e = crypto.createHmac('sha256', env.SESSION_SECRET || 'dev-secret').update(`pdf:${estimateId}:${exp}`).digest('base64url');
  return e.length === sig.length && crypto.timingSafeEqual(Buffer.from(e), Buffer.from(sig));
}

export const pdfFileName = (title: string) => `${(title || 'Смета').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60)}.pdf`;
