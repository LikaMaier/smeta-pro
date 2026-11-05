/**
 * «Калькулятор для заказчиков» — личная ссылка мастера (Авито, статус WhatsApp, группа ВК):
 * заказчик сам выбирает работу и размер, видит цену по ценам мастера — эконом / стандарт / премиум —
 * и оставляет телефон. Мастеру в Telegram приходит заявка, а в приложении уже лежит готовая смета.
 * Здесь — правила без базы данных: телефон, свои цены, список работ, строки сметы.
 */
import { getJob, jobsFor, jobLines, clampSize, type JobLine, type Sizes, type Opts } from './firstJobs';
import { STARTER_PRICES } from './starterPrices';
import { normName } from './names';
import type { Tier } from './materialTiers';

export const TIERS: Tier[] = ['eco', 'std', 'prem'];

/** Телефон заказчика → «+7 921 123-45-67» (или международный «+375…»); null — не похоже на номер */
export function normPhone(s: string): string | null {
  const raw = String(s || '').trim();
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '8' || d[0] === '7')) d = `7${d.slice(1)}`;
  else if (d.length === 10 && !raw.startsWith('+')) d = `7${d}`;
  else if (!(raw.startsWith('+') && d.length >= 10 && d.length <= 15)) return null;
  if (d.length === 11 && d[0] === '7') return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  return `+${d}`;
}

/**
 * Свои цены мастера для калькулятора — только те, что отличаются от стандартных
 * (стартовый справочник совпадает с ценами мастеров, его не тащим на страницу заказчика).
 */
export function priceOverrides(items: { name: string; price: number | string | { toString(): string }; active?: boolean | null }[]): Record<string, number> {
  const st = new Map(STARTER_PRICES.map((p) => [normName(p.name), p.price]));
  const out: Record<string, number> = {};
  for (const i of items) {
    const p = Number(String(i.price));
    if (i.active === false || !(p > 0)) continue;
    const k = normName(i.name);
    const s = st.get(k);
    if (s != null && Math.abs(s - p) < 0.005) continue;
    out[k] = p;
  }
  return out;
}

/** Какие работы показать заказчику: выбранные мастером (только существующие), иначе — по его специальности */
export function calcJobIds(saved: string[] | null | undefined, trade?: string | null): string[] {
  const ok = [...new Set((saved || []).filter((id) => getJob(id)))];
  return ok.length ? ok.slice(0, 30) : jobsFor(trade).map((j) => j.id);
}

/** Размеры и галочки из запроса — только известные поля работы, числа в пределах */
export function cleanInput(jobId: string, sizes: any, opts: any): { sizes: Sizes; opts: Opts } | null {
  const job = getJob(jobId);
  if (!job) return null;
  const s: Sizes = {};
  for (const f of job.size) s[f.key] = clampSize(f, sizes?.[f.key]);
  const o: Opts = {};
  for (const x of job.opts || []) o[x.key] = typeof opts?.[x.key] === 'boolean' ? opts[x.key] : x.on;
  return { sizes: s, opts: o };
}

/** Строки сметы по ценам мастера: расчёт мастеров + свои цены (по названию) */
export function calcLines(jobId: string, sizes: Sizes, opts: Opts, tier: Tier, own: Record<string, number>): JobLine[] {
  const job = getJob(jobId);
  if (!job) return [];
  return jobLines(job, sizes, opts, tier).map((l) => {
    const p = own[normName(l.name)];
    return p != null ? { ...l, price: p } : l;
  });
}

/** Строки для сохранения в смету мастера (как у «Первой сметы»: материалы — «цена магазина, уточнить») */
export const toEstimateLines = (lines: JobLine[]) => lines.map((l, i) => ({
  position: i, name: l.name, qty: l.qty, unit: l.unit, price: l.price, type: l.type, category: l.category || null,
  costPrice: l.type === 'material' ? l.price : null, composition: l.composition || null, note: l.note || null, unconfirmed: l.type === 'material',
}));

/** Короткий текст для заказчика, которым мастер делится ссылкой */
export const calcShareText = (who: string) => `Посчитайте стоимость работ за 1 минуту — по моим ценам, без звонков и замера.${who ? ` ${who}` : ''}`;
