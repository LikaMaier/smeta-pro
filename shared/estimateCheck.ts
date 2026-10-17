import { scheduleSum, PayStage } from './payments';

/** Проверка сметы перед отправкой заказчику: ошибки (лучше исправить) и предупреждения */
export interface CheckLine { name: string; qty: number; price: number; matPrice?: number | null; unit?: string; note?: string | null; unconfirmed?: boolean; catalogItemId?: string | null }
export interface CheckParams { delivery?: number; lossReservePct?: number; taxPct?: number; extraCosts?: number }
export interface CheckInput { title?: string; customer?: string | null; address?: string | null; lines: CheckLine[]; paySchedule?: PayStage[] | null; total?: number;
  /** параметры сметы — включают проверки «как у сметчиков»: налог, запас материала, вывоз мусора, доставка */
  params?: CheckParams }
export interface CheckIssue { level: 'error' | 'warn'; text: string; lines?: number[] }

export function checkEstimate(e: CheckInput): CheckIssue[] {
  const out: CheckIssue[] = [];
  const idx = (f: (l: CheckLine) => boolean) => e.lines.map((l, i) => (f(l) ? i + 1 : 0)).filter(Boolean);
  if (!e.lines.length) out.push({ level: 'error', text: 'В смете нет позиций' });
  const zeroPrice = idx((l) => !(Number(l.price) > 0) && !(Number(l.matPrice) > 0));
  if (zeroPrice.length) out.push({ level: 'error', text: `Нет цены: позиции ${zeroPrice.join(', ')}`, lines: zeroPrice });
  const zeroQty = idx((l) => !(Number(l.qty) > 0));
  if (zeroQty.length) out.push({ level: 'error', text: `Не указано количество: позиции ${zeroQty.join(', ')}`, lines: zeroQty });
  const unconf = idx((l) => Boolean(l.unconfirmed) || /Примерная цена|типовое — уточните/i.test(l.note || ''));
  if (unconf.length) out.push({ level: 'warn', text: `Примерные цены или типовые объёмы — проверьте: позиции ${unconf.join(', ')}`, lines: unconf });
  const names = new Map<string, number[]>();
  e.lines.forEach((l, i) => { const k = `${l.name.trim().toLowerCase()}|${l.unit || ''}`; names.set(k, [...(names.get(k) || []), i + 1]); });
  const dups = [...names.values()].filter((v) => v.length > 1);
  if (dups.length) out.push({ level: 'warn', text: `Одинаковые позиции: ${dups.map((d) => d.join(' и ')).join('; ')}` });
  if (!e.customer?.trim()) out.push({ level: 'warn', text: 'Не указан заказчик' });
  if (!e.address?.trim()) out.push({ level: 'warn', text: 'Не указан адрес объекта' });
  if (!e.title?.trim() || /^новая смета$/i.test(e.title.trim())) out.push({ level: 'warn', text: 'Дайте смете понятное название — заказчик увидит его первым' });
  const ps = scheduleSum(e.paySchedule);
  if (e.paySchedule?.length && ps !== 100) out.push({ level: 'error', text: `График оплаты в сумме ${ps}%, а должно быть 100%` });
  if (e.params) out.push(...practiceChecks(e.lines, e.params));
  return out;
}

/** Частые ошибки коммерческих смет (из практики сметчиков): то, за что заказчик потом спорит или подрядчик доплачивает сам */
export function practiceChecks(lines: CheckLine[], p: CheckParams): CheckIssue[] {
  const out: CheckIssue[] = [];
  const has = (re: RegExp) => lines.some((l) => re.test(`${l.name} ${l.note || ''}`));
  const withMat = lines.some((l) => Number(l.matPrice) > 0 || /материал/i.test(l.note || ''));
  if (Number(p.taxPct) === 20) out.push({ level: 'warn', text: 'Налог 20% — это ставка НДС. Её начисляют только на общей системе налогообложения. На УСН и самозанятости НДС заказчику не выставляют: поставьте свой налог или уберите его.' });
  if (withMat && !(Number(p.lossReservePct) > 0) && !has(/запас|отход|подрезк|резерв|бой/i)) out.push({ level: 'warn', text: 'Нет запаса материала на подрезку и бой (обычно 5–10%). Поставьте «Резерв на потери» в «Скидка, наценка, налог», иначе докупать придётся за свой счёт.' });
  if (lines.length >= 3 && !has(/вывоз|мусор|контейнер|уборк/i)) out.push({ level: 'warn', text: 'Нет вывоза мусора и уборки — заказчики часто спрашивают про это. Добавьте строку или напишите в примечании, что это не входит.' });
  if (withMat && !(Number(p.delivery) > 0) && !(Number(p.extraCosts) > 0) && !has(/доставк|подъ[её]м|разгрузк|занос|погрузк/i)) out.push({ level: 'warn', text: 'Не учтены доставка и подъём материалов на этаж — частая причина «доплат», которых заказчик не ждал.' });
  return out;
}
