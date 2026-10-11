import { toKop, fromKop } from './money';

/**
 * Итоги календаря — кассовый метод («сколько заработал на руки»):
 *  - Получено      = Σ поступлений денег (аванс, промежуточный, окончательный) с датой в периоде
 *  - Потрачено     = Σ фактически оплаченных сумм расходов с датой в периоде
 *  - Заработано    = Получено − Потрачено
 *  - Не оплачено   = Σ (начислено − оплачено) по расходам периода — справочно, в «Заработано» не входит
 * Изменения стоимости договора (доп. работы, изменение цены) — не деньги, в календарь не попадают.
 * Дата оплаты расхода = дата операции.
 */
export interface CalOp {
  kind: string;
  incomeType?: string | null;
  amount: number;
  paidAmount?: number;
  date: string | Date;
  projectId?: string | null;
}

export interface Totals { received: number; spent: number; earned: number; unpaid: number }
const PAYMENT = ['advance', 'interim', 'final'];

export const dayKey = (d: string | Date) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
export const monthKey = (d: string | Date) => dayKey(d).slice(0, 7);

/** Учитывается ли операция как движение денег */
export const isMoney = (o: CalOp) => (o.kind === 'income' ? PAYMENT.includes(o.incomeType || '') : o.kind === 'expense');

function acc() { return { r: 0, s: 0, u: 0 }; }
function fin(a: { r: number; s: number; u: number }): Totals {
  return { received: fromKop(a.r), spent: fromKop(a.s), earned: fromKop(a.r - a.s), unpaid: fromKop(a.u) };
}
function add(a: { r: number; s: number; u: number }, o: CalOp) {
  if (o.kind === 'income') a.r += toKop(o.amount);
  else { const p = toKop(o.paidAmount || 0); a.s += p; a.u += toKop(o.amount) - p; }
}

/** Итоги по дням, по объектам и за весь набор операций */
export function summarize(ops: CalOp[]) {
  const total = acc();
  const days = new Map<string, ReturnType<typeof acc>>();
  const projects = new Map<string, ReturnType<typeof acc>>();
  for (const o of ops) {
    if (!isMoney(o)) continue;
    add(total, o);
    const k = dayKey(o.date);
    if (!days.has(k)) days.set(k, acc());
    add(days.get(k)!, o);
    const p = o.projectId || '';
    if (!projects.has(p)) projects.set(p, acc());
    add(projects.get(p)!, o);
  }
  return {
    total: fin(total),
    days: Object.fromEntries([...days].map(([k, v]) => [k, fin(v)])) as Record<string, Totals>,
    projects: Object.fromEntries([...projects].map(([k, v]) => [k, fin(v)])) as Record<string, Totals>,
  };
}

/** Итоги по месяцам года (12 значений) */
export function byMonth(ops: CalOp[], year: number): Totals[] {
  const m = Array.from({ length: 12 }, acc);
  for (const o of ops) {
    if (!isMoney(o)) continue;
    const k = dayKey(o.date);
    if (Number(k.slice(0, 4)) !== year) continue;
    add(m[Number(k.slice(5, 7)) - 1], o);
  }
  return m.map(fin);
}

/** Сетка месяца: недели с понедельника, null — дни соседних месяцев */
export function monthGrid(year: number, month1: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month1 - 1, 1));
  const daysIn = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // пн = 0
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysIn; d++) cells.push(`${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
