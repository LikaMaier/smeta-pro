import { toKop, fromKop } from './money';

/**
 * Промежуточные акты: сколько выполнено по каждой позиции сметы и сколько осталось.
 * Позиции сметы сопоставляются по названию и единице (id строк меняются при сохранении).
 * Цены в акте — цены сметы за единицу с учётом коэффициентов, наценки, резерва, скидки,
 * доставки и доп. расходов (пропорционально), без налога. Налог начисляется сверху по ставке сметы.
 */
export const lineKey = (l: { name: string; unit?: string | null }) => `${(l.name || '').trim().toLowerCase()}|${(l.unit || '').trim().toLowerCase()}`;

export interface ActLine { key: string; name: string; unit: string; qty: number; amount: number; category?: string | null; composition?: string | null }
export interface ActItem { key: string; name: string; unit: string; qty: number; unitPrice: number; amount: number; category?: string | null }
export interface ActRec { items: ActItem[]; deletedAt?: any }

/** k — во сколько раз итог без налога больше суммы позиций (наценка, скидка, доставка…) */
export const priceFactor = (subtotal: number, totalExTax: number) => (subtotal > 0 ? totalExTax / subtotal : 1);

/** Позиции сметы с выполненным и оставшимся объёмом (одинаковые позиции суммируются) */
export function progress(lines: ActLine[], acts: ActRec[], k: number) {
  const map = new Map<string, { key: string; name: string; unit: string; qty: number; amount: number; category?: string | null; done: number }>();
  for (const l of lines) {
    const key = l.key || lineKey(l);
    const r = map.get(key) || { key, name: l.name, unit: l.unit, qty: 0, amount: 0, category: l.category, done: 0 };
    r.qty += Number(l.qty) || 0; r.amount += Number(l.amount) || 0;
    map.set(key, r);
  }
  for (const a of acts) {
    if (a.deletedAt) continue;
    for (const it of a.items || []) { const r = map.get(it.key); if (r) r.done += Number(it.qty) || 0; }
  }
  return [...map.values()].map((r) => {
    const unitPrice = r.qty > 0 ? Math.round((r.amount / r.qty) * k * 100) / 100 : 0;
    const left = Math.max(0, Math.round((r.qty - r.done) * 10000) / 10000);
    return { ...r, unitPrice, left, pct: r.qty > 0 ? Math.min(100, Math.round((r.done / r.qty) * 1000) / 10) : 0 };
  });
}

/** Собрать акт из выбранных объёмов; налог — по ставке сметы */
export function buildAct(rows: ReturnType<typeof progress>, sel: Record<string, number>, taxPct = 0) {
  const items: ActItem[] = [];
  for (const r of rows) {
    const q = Math.min(Number(sel[r.key]) || 0, r.left);
    if (q <= 0) continue;
    items.push({ key: r.key, name: r.name, unit: r.unit, qty: q, unitPrice: r.unitPrice, amount: fromKop(Math.round(q * toKop(r.unitPrice))), category: r.category });
  }
  const subKop = items.reduce((a, i) => a + toKop(i.amount), 0);
  const taxKop = Math.round((subKop * (Number(taxPct) || 0)) / 100);
  return { items, subtotal: fromKop(subKop), tax: fromKop(taxKop), total: fromKop(subKop + taxKop) };
}
