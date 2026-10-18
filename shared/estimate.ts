import { toKop, fromKop, pctOfKop } from './money';
import { pickVariant, type Tier } from './materialTiers';

/** Раздел «По желанию…» — позиции на выбор заказчика: показываются, но в итог не входят */
export const isOptionalSection = (c?: string | null) => /^\s*по желанию/i.test(c || '');
export const OPTIONAL_SECTION = 'По желанию';

/**
 * Расчёт итогов сметы. Порядок применения (един для всего приложения):
 *  1. Сумма строки            = кол-во × (цена работы + цена материала) × коэф. строки × коэф. раздела
 *     (часть «работа» и часть «материал» считаются отдельно и идут в свои подытоги)
 *  2. Подытог                 = Σ сумм строк
 *  3. Резерв на потери        = подытог материалов × резерв%
 *  4. Наценка                 = (подытог + резерв) × наценка%
 *  5. Скидка                  = (подытог + резерв + наценка) × скидка%
 *  6. Доставка, доп. расходы  — фиксированные суммы
 *  7. База налога             = подытог + резерв + наценка − скидка + доставка + доп. расходы
 *  8. Налог                   = база × налог%  (начисляется сверху)
 *  9. Итого заказчику         = база + налог
 * Себестоимость (прямые затраты) = Σ кол-во × закупочная цена.
 * Плановая прибыль = (итого − налог) − себестоимость. Маржа = прибыль / (итого − налог), если выручка > 0.
 */
export type LineType = 'work' | 'material' | 'equipment' | 'service' | 'other';

export interface LineInput {
  qty: number;
  price: number;              // цена за единицу (для работ — цена работы)
  matPrice?: number | null;   // цена материала за единицу в той же строке (работа + материал)
  coef?: number | null;       // коэффициент строки (зимние работы ×1,15 и т.п.)
  costPrice?: number | null;  // себестоимость единицы (вся строка)
  type?: LineType | string;
  category?: string | null;
  /** материал покупает заказчик сам: в сумму исполнителя не входит (у строки работы — только часть «материал») */
  byCustomer?: boolean | null;
  /** группа вариантов на выбор заказчика (плитка A / B / C): в итог идёт только выбранный */
  choiceGroup?: string | null;
  chosen?: boolean | null;
}

/** Индексы строк-вариантов, которые НЕ выбраны (в каждой группе выбран один: отмеченный, иначе первый) */
export function unchosenAlternatives(lines: { choiceGroup?: string | null; chosen?: boolean | null }[]): Set<number> {
  const groups = new Map<string, number[]>();
  lines.forEach((l, i) => { const g = (l.choiceGroup || '').trim(); if (g) groups.set(g, [...(groups.get(g) || []), i]); });
  const off = new Set<number>();
  for (const idx of groups.values()) {
    const pick = idx.find((i) => lines[i].chosen) ?? idx[0];
    idx.forEach((i) => { if (i !== pick) off.add(i); });
  }
  return off;
}

export interface EstimateParams {
  discountPct?: number;
  markupPct?: number;
  taxPct?: number;
  lossReservePct?: number;
  delivery?: number;
  extraCosts?: number;
  sectionCoefs?: Record<string, number> | null; // коэффициент на раздел (по названию раздела)
  roundAdjust?: number; // округление итога: прибавляется к итогу после налога (может быть отрицательным)
}

export interface EstimateTotals {
  lineAmounts: number[];
  lineWork: number[];      // часть суммы строки «работа»
  lineMat: number[];       // часть суммы строки «материал»
  lineUnit: { work: number; mat: number; k: number }[]; // цены за единицу с учётом коэффициентов
  sections: { name: string; amount: number; work: number; mat: number }[];
  subtotal: number;
  worksSubtotal: number;
  materialsSubtotal: number;
  otherSubtotal: number;
  reserve: number;
  markup: number;
  discount: number;
  delivery: number;
  extraCosts: number;
  taxBase: number;
  tax: number;
  roundAdjust: number;
  total: number;
  revenueExTax: number;
  /** сумма позиций «по желанию» (в итог не входят) */
  optionalTotal: number;
  /** материалы, которые покупает заказчик (справочно, в итог не входят) */
  customerMaterials: number;
  /** по строке: сумма материала, который покупает заказчик */
  lineCustomer: number[];
  /** строка — невыбранный вариант (в итог не входит) */
  lineOff: boolean[];
  directCost: number;
  linesWithoutCost: number;
  plannedProfit: number;
  marginPct: number | null;
  byCategory: { category: string; amount: number }[];
  costByGroup: { materials: number; equipment: number; labor: number; other: number };
}

export function validateLine(l: LineInput): string | null {
  if (!Number.isFinite(Number(l.qty)) || Number(l.qty) < 0) return 'Количество не может быть отрицательным';
  if (!Number.isFinite(Number(l.price)) || Number(l.price) < 0) return 'Цена не может быть отрицательной';
  if (l.costPrice != null && (!Number.isFinite(Number(l.costPrice)) || Number(l.costPrice) < 0))
    return 'Закупочная цена не может быть отрицательной';
  return null;
}

export function lineAmountKop(qty: number, price: number): number {
  // qty до 4 знаков, price до 2 — считаем в копейках и округляем один раз
  return Math.round(Number(qty) * toKop(price));
}

/** Группа фактических расходов, к которой относится тип строки сметы */
export function costGroupOf(type?: string): 'materials' | 'equipment' | 'labor' | 'other' {
  if (type === 'material') return 'materials';
  if (type === 'equipment') return 'equipment';
  if (type === 'work') return 'labor';
  return 'other';
}

const posNum = (v: any, d = 0) => (Number.isFinite(Number(v)) && Number(v) >= 0 && v !== null && v !== '' ? Number(v) : d);
/** Итоговый коэффициент строки: свой × коэффициент раздела */
export function lineCoef(l: LineInput, sectionCoefs?: Record<string, number> | null) {
  const own = posNum(l.coef, 1) || 1;
  const sec = sectionCoefs ? posNum(sectionCoefs[l.category || ''], 1) || 1 : 1;
  return own * sec;
}

export function calcEstimate(lines: LineInput[], p: EstimateParams = {}): EstimateTotals {
  const ks = lines.map((l) => lineCoef(l, p.sectionCoefs));
  const workKop = lines.map((l, i) => Math.round(Number(l.qty) * toKop(Number(l.price) * ks[i])));
  const matKop = lines.map((l, i) => Math.round(Number(l.qty) * toKop(posNum(l.matPrice) * ks[i])));
  // материал заказчика: строка-материал целиком (цена в price), у работы — часть «материал»
  const custKop = lines.map((l, i) => (!l.byCustomer ? 0 : l.type === 'material' ? workKop[i] + matKop[i] : matKop[i]));
  lines.forEach((l, i) => { if (!l.byCustomer) return; if (l.type === 'material') workKop[i] = 0; matKop[i] = 0; });
  const offSet = unchosenAlternatives(lines);
  const amountsKop = lines.map((_, i) => workKop[i] + matKop[i]);
  const secMap = new Map<string, { a: number; w: number; m: number }>();
  const opt = lines.map((l, i) => isOptionalSection(l.category) || offSet.has(i));
  const subtotalKop = amountsKop.reduce((a, b, i) => a + (opt[i] ? 0 : b), 0);
  const optionalKop = amountsKop.reduce((a, b, i) => a + (opt[i] && !offSet.has(i) ? b : 0), 0);
  const customerKop = custKop.reduce((a, b, i) => a + (opt[i] ? 0 : b), 0);
  let worksKop = 0, materialsKop = 0, otherKop = 0;
  const catMap = new Map<string, number>();
  const costGroups = { materials: 0, equipment: 0, labor: 0, other: 0 };
  let directCostKop = 0;
  let withoutCost = 0;

  lines.forEach((l, i) => {
    const a = amountsKop[i];
    if (offSet.has(i)) return; // невыбранный вариант — нигде не считается
    if (opt[i]) { // «по желанию»: только в своём разделе, в подытоги и себестоимость не идёт
      const sm = secMap.get(l.category || '') || { a: 0, w: 0, m: 0 };
      sm.a += a; sm.w += l.type === 'material' ? 0 : workKop[i]; sm.m += l.type === 'material' ? a : matKop[i];
      secMap.set(l.category || '', sm);
      return;
    }
    // материал внутри строки работы — в подытог материалов; строка-материал целиком — материалы
    const w = l.type === 'material' ? 0 : workKop[i];
    const m = l.type === 'material' ? a : matKop[i];
    materialsKop += m;
    if (l.type === 'work' || l.type === 'material') worksKop += w; else otherKop += w;
    const sec = l.category || '';
    const sm = secMap.get(sec) || { a: 0, w: 0, m: 0 };
    sm.a += a; sm.w += w; sm.m += m;
    secMap.set(sec, sm);
    const cat = l.category || 'Без категории';
    catMap.set(cat, (catMap.get(cat) || 0) + a);
    if (l.byCustomer && l.type === 'material') return; // материал заказчика — не наши затраты
    if (l.costPrice != null && l.costPrice !== ('' as any)) {
      const c = lineAmountKop(l.qty, Number(l.costPrice));
      directCostKop += c;
      costGroups[costGroupOf(l.type as string)] += c;
    } else if (Number(l.qty) > 0) {
      withoutCost++;
    }
  });

  const reserveKop = pctOfKop(materialsKop, p.lossReservePct || 0);
  const markupKop = pctOfKop(subtotalKop + reserveKop, p.markupPct || 0);
  const discountKop = pctOfKop(subtotalKop + reserveKop + markupKop, p.discountPct || 0);
  const deliveryKop = toKop(p.delivery || 0);
  const extraKop = toKop(p.extraCosts || 0);
  const taxBaseKop = subtotalKop + reserveKop + markupKop - discountKop + deliveryKop + extraKop;
  const taxKop = pctOfKop(taxBaseKop, p.taxPct || 0);
  const roundKop = toKop(p.roundAdjust || 0);
  const totalKop = taxBaseKop + taxKop + roundKop;
  const revenueExTaxKop = totalKop - taxKop;
  const profitKop = revenueExTaxKop - directCostKop;

  return {
    lineAmounts: amountsKop.map(fromKop),
    lineWork: lines.map((l, i) => fromKop(l.type === 'material' ? 0 : workKop[i])),
    lineMat: lines.map((l, i) => fromKop(l.type === 'material' ? amountsKop[i] : matKop[i])),
    lineUnit: lines.map((l, i) => ({ work: Math.round(Number(l.price) * ks[i] * 100) / 100, mat: Math.round(posNum(l.matPrice) * ks[i] * 100) / 100, k: ks[i] })),
    sections: [...secMap.entries()].map(([name, v]) => ({ name, amount: fromKop(v.a), work: fromKop(v.w), mat: fromKop(v.m) })),
    subtotal: fromKop(subtotalKop),
    worksSubtotal: fromKop(worksKop),
    materialsSubtotal: fromKop(materialsKop),
    otherSubtotal: fromKop(otherKop),
    reserve: fromKop(reserveKop),
    markup: fromKop(markupKop),
    discount: fromKop(discountKop),
    delivery: fromKop(deliveryKop),
    extraCosts: fromKop(extraKop),
    taxBase: fromKop(taxBaseKop),
    tax: fromKop(taxKop),
    roundAdjust: fromKop(roundKop),
    total: fromKop(totalKop),
    revenueExTax: fromKop(revenueExTaxKop),
    optionalTotal: fromKop(optionalKop),
    customerMaterials: fromKop(customerKop),
    lineCustomer: custKop.map(fromKop),
    lineOff: lines.map((_, i) => offSet.has(i)),
    directCost: fromKop(directCostKop),
    linesWithoutCost: withoutCost,
    plannedProfit: fromKop(profitKop),
    marginPct: revenueExTaxKop > 0 ? Math.round((profitKop / revenueExTaxKop) * 10000) / 100 : null,
    byCategory: [...catMap.entries()].map(([category, a]) => ({ category, amount: fromKop(a) })),
    costByGroup: {
      materials: fromKop(costGroups.materials),
      equipment: fromKop(costGroups.equipment),
      labor: fromKop(costGroups.labor),
      other: fromKop(costGroups.other),
    },
  };
}

/** Итог сметы, если все материалы взять эконом / стандарт / премиум (класс — по правилам materialTiers) */
export function variantTotals(lines: (LineInput & { name: string })[], p: EstimateParams = {}): Record<Tier, number> | null {
  const hasMat = lines.some((l) => !isOptionalSection(l.category) && !l.byCustomer && ((l.type === 'material' && Number(l.price) > 0) || posNum(l.matPrice) > 0));
  if (!hasMat) return null;
  const at = (t: Tier) => calcEstimate(lines.map((l) => {
    if (l.type === 'material' && Number(l.price) > 0) return { ...l, price: pickVariant(l.name, Number(l.price), t).price };
    if (posNum(l.matPrice) > 0) return { ...l, matPrice: pickVariant(`${l.name} (материал)`, posNum(l.matPrice), t).price };
    return l;
  }), p).total;
  return { eco: at('eco'), std: at('std'), prem: at('prem') };
}

/** Строка сметы из базы / формы → вход расчёта (числа уже приведены вызывающим) */
export const calcLine = (l: any, num: (v: any) => number = Number): LineInput & { name: string } => ({
  name: l.name, qty: num(l.qty), price: num(l.price), matPrice: l.matPrice == null || l.matPrice === '' ? null : num(l.matPrice),
  coef: l.coef == null || l.coef === '' ? 1 : num(l.coef) || 1, costPrice: l.costPrice == null || l.costPrice === '' ? null : num(l.costPrice),
  type: l.type, category: l.category, byCustomer: Boolean(l.byCustomer), choiceGroup: l.choiceGroup || null, chosen: Boolean(l.chosen),
});
