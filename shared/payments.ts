import { toKop, fromKop } from './money';

/** График оплаты сметы: этапы в процентах от итога и отметка, какие уже покрыты полученными деньгами */
export interface PayStage { title: string; pct: number }
export const DEFAULT_SCHEDULE: PayStage[] = [
  { title: 'Аванс при подписании договора', pct: 50 },
  { title: 'При поступлении материала и техники на объект', pct: 30 },
  { title: 'По окончании работ', pct: 20 },
];

export function payStages(total: number, schedule: PayStage[] | null | undefined, received = 0) {
  const st = (schedule || []).filter((s) => s && s.title && Number(s.pct) > 0);
  const totalKop = toKop(total);
  let left = toKop(Math.max(0, received));
  let used = 0;
  return st.map((s, i) => {
    // последний этап забирает остаток копеек, чтобы сумма этапов = итог
    const amt = i === st.length - 1 && st.reduce((a, x) => a + Number(x.pct), 0) === 100 ? totalKop - used : Math.round((totalKop * Number(s.pct)) / 100);
    used += amt;
    const paid = Math.min(left, amt);
    left -= paid;
    return { title: s.title, pct: Number(s.pct), amount: fromKop(amt), paid: fromKop(paid), status: paid >= amt ? 'paid' : paid > 0 ? 'partial' : 'due' as 'paid' | 'partial' | 'due' };
  });
}

export const scheduleSum = (s: PayStage[] | null | undefined) => (s || []).reduce((a, x) => a + (Number(x.pct) || 0), 0);

/** Текст графика для договора и примечаний */
export function scheduleText(total: number, s: PayStage[] | null | undefined) {
  return payStages(total, s).map((x) => `${x.title} — ${x.pct}% (${Math.round(x.amount).toLocaleString('ru-RU')} ₽)`).join('; ');
}
