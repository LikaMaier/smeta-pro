import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { env } from './env';
import { num } from './util';
import { estimateTotals } from './routes/estimates';
import { brandPath } from './brand';
import { payStages } from '../../shared/payments';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pdf');
const SCRIPT = path.join(DIR, 'estimate_pdf.py');
const XLSX_SCRIPT = path.join(DIR, 'export_xlsx.py');
const KS_SCRIPT = path.join(DIR, 'ks_forms.py');

/** Данные для PDF заказчику: без закупочных цен, себестоимости и прибыли */
export function pdfData(e: any, user: any, number: number, free = false, paid: number | null = null) {
  const t = estimateTotals(e);
  const split = e.lines.some((l: any) => num(l.matPrice) > 0);
  const schedule = Array.isArray(e.paySchedule) ? e.paySchedule : null;
  return {
    style: user.docStyle === 'modern' ? 'modern' : 'classic',
    split, // колонки «Работа» и «Материал»
    paid, toPay: paid == null ? null : Math.max(0, Math.round((t.total - paid) * 100) / 100),
    stages: schedule ? payStages(t.total, schedule, paid || 0) : [],
    sections: t.sections,
    company: user.companyName || [user.firstName, user.username ? `@${user.username}` : ''].filter(Boolean).join(' ') || 'Смета',
    contacts: user.contacts || '',
    freeMark: free, title: e.title, number: String(number), customer: e.customer, address: e.address,
    date: new Date(e.date).toISOString().slice(0, 10), validDays: e.validDays ?? 14,
    paymentTerms: e.paymentTerms, notes: e.notes,
    logoPath: brandPath(user.logoFile), signPath: brandPath(user.signFile),
    customerDetails: e.customerDetails || '', warrantyMonths: e.warrantyMonths ?? 12,
    workStart: e.workStart ? new Date(e.workStart).toISOString().slice(0, 10) : null,
    workEnd: e.workEnd ? new Date(e.workEnd).toISOString().slice(0, 10) : null,
    approvedAt: e.approvedAt ? new Date(e.approvedAt).toISOString().slice(0, 10) : null,
    grouped: e.lines.some((l: any) => l.category),
    lines: e.lines.map((l: any, i: number) => ({
      name: l.name, category: l.category, qty: num(l.qty), unit: l.unit, type: l.type,
      price: Math.round((t.lineUnit[i].work + t.lineUnit[i].mat) * 100) / 100, // цена за единицу с коэффициентами
      unitWork: l.type === 'material' ? 0 : t.lineUnit[i].work, unitMat: l.type === 'material' ? t.lineUnit[i].work + t.lineUnit[i].mat : t.lineUnit[i].mat,
      work: t.lineWork[i], mat: t.lineMat[i], amount: t.lineAmounts[i], note: l.note,
      composition: (l.composition || '').split('\n').map((x: string) => x.replace(/^[-–•\s]+/, '').trim()).filter(Boolean),
    })),
    totals: {
      works: t.worksSubtotal, materials: t.materialsSubtotal, other: t.otherSubtotal,
      overhead: Math.round((t.reserve + t.markup) * 100) / 100, // резерв и наценка — одной строкой «накладные»
      delivery: t.delivery, extraCosts: t.extraCosts, discount: t.discount, discountPct: num(e.discountPct),
      tax: t.tax, taxPct: num(e.taxPct), roundAdjust: t.roundAdjust, total: t.total,
    },
  };
}

export const renderPdf = (data: any) => runPy(SCRIPT, data, 'PDF');
export const renderXlsx = (data: any) => runPy(XLSX_SCRIPT, data, 'Excel');
export const renderKs = (data: any) => runPy(KS_SCRIPT, data, data.form === 'ks2' ? 'КС-2' : 'КС-3');

export const runImport = (file: Buffer) => runPy(path.join(DIR, 'import_xlsx.py'), file, 'импорт');

function runPy(script: string, data: any, what: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.PYTHON_BIN || 'python3', [script], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = []; const err: Buffer[] = [];
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${what} создаётся слишком долго`)); }, 30000);
    p.stdout.on('data', (c) => out.push(c));
    p.stderr.on('data', (c) => err.push(c));
    p.on('error', (e) => { clearTimeout(timer); reject(new Error(`Генератор ${what} недоступен: ${e.message}`)); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out));
      else if (code === 2) reject(Object.assign(new Error(Buffer.concat(err).toString().slice(0, 400)), { statusCode: 400 }));
      else reject(new Error(`Ошибка генерации ${what}: ${Buffer.concat(err).toString().slice(0, 400)}`));
    });
    p.stdin.end(Buffer.isBuffer(data) ? data : JSON.stringify(data));
  });
}

/** Подписанные ссылки на файлы — открываются во внешнем браузере без заголовка авторизации.
 *  kind: pdf | act | xlsx | xlsxown (смета) ; pxlsx (объект) */
export type FileKind = 'pdf' | 'act' | 'contract' | 'xlsx' | 'xlsxown' | 'pxlsx';
const sign = (kind: string, id: string, exp: number | string) =>
  crypto.createHmac('sha256', env.SESSION_SECRET || 'dev-secret').update(`${kind}:${id}:${exp}`).digest('base64url');

export function fileLink(kind: FileKind, id: string, ttlSec = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const base = kind === 'pxlsx' ? `/files/projects/${id}.xlsx` : `/files/estimates/${id}.${kind === 'xlsx' || kind === 'xlsxown' ? 'xlsx' : 'pdf'}`;
  return `${base}?kind=${kind}&exp=${exp}&sig=${sign(kind, id, exp)}`;
}
export const pdfLink = (id: string) => fileLink('pdf', id);
/** Подписанная ссылка на произвольный путь (акты, КС-2, КС-3) */
export function signedPath(base: string, kind: string, id: string, ttlSec = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `${base}?kind=${kind}&exp=${exp}&sig=${sign(kind, id, exp)}`;
}
export function checkSig(kind: string, id: string, exp: string, sig: string) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const e = sign(kind, id, exp);
  return e.length === sig.length && crypto.timingSafeEqual(Buffer.from(e), Buffer.from(sig));
}
export const checkPdfSig = (id: string, exp: string, sig: string) => checkSig('pdf', id, exp, sig);

/** Данные для Excel-сметы. own — с листом себестоимости и прибыли */
export function xlsxEstimateData(e: any, user: any, number: number, own: boolean) {
  const base = pdfData(e, user, number);
  const t = estimateTotals(e) as any;
  return {
    ...base, kind: 'estimate',
    lines: base.lines.map((l: any, i: number) => ({ ...l, costPrice: own && e.lines[i].costPrice != null ? num(e.lines[i].costPrice) : null })),
    own: own ? { total: t.total, directCost: t.directCost, profit: t.plannedProfit, marginPct: t.marginPct } : false,
  };
}

export const fileName = (title: string, ext: string, fallback = 'Смета') => `${(title || fallback).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60)}.${ext}`;
export const pdfFileName = (title: string) => `${(title || 'Смета').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60)}.pdf`;
