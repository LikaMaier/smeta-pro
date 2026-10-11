import { CALCULATORS, getCalculator, runCalc } from './calculators';

/**
 * Ответ языковой модели (строгий JSON). Модель НЕ считает: количества берутся
 * либо из явных слов пользователя (qty), либо из детерминированного калькулятора (fromCalc).
 */
/** values — массив пар, т.к. строгая JSON-схема не допускает произвольных ключей */
export interface AiCalc { id: string; values: { key: string; value: string }[] }
export interface AiItem {
  name: string; unit: string; type: 'work' | 'material' | 'equipment' | 'service' | 'other'; category: string;
  qty: number | null; fromCalc: { calc: number; row: string } | null; note: string | null;
}
export interface AiReply {
  reply: string;
  status: 'need_info' | 'draft';
  known: string[];
  assumptions: string[];
  calculations: AiCalc[];
  items: AiItem[];
}

export interface DraftLine {
  name: string; qty: number; unit: string; type: string; category: string;
  price: number; costPrice: number | null; catalogItemId: string | null;
  priceSource: 'catalog' | 'approx' | 'none'; unconfirmed: boolean; note: string | null;
}

export interface PriceSource {
  catalog: { id: string; name: string; unit: string; price: number; costPrice: number | null }[];
  approx: { name: string; unit: string; price: number }[];
}

/** JSON-схема ответа для structured outputs */
export const AI_SCHEMA = {
  name: 'estimate_assistant',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    required: ['reply', 'status', 'known', 'assumptions', 'calculations', 'items'],
    properties: {
      reply: { type: 'string' },
      status: { type: 'string', enum: ['need_info', 'draft'] },
      known: { type: 'array', items: { type: 'string' } },
      assumptions: { type: 'array', items: { type: 'string' } },
      calculations: {
        type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['id', 'values'],
          properties: { id: { type: 'string' }, values: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'value'], properties: { key: { type: 'string' }, value: { type: 'string' } } } } },
        },
      },
      items: {
        type: 'array', items: {
          type: 'object', additionalProperties: false,
          required: ['name', 'unit', 'type', 'category', 'qty', 'fromCalc', 'note'],
          properties: {
            name: { type: 'string' }, unit: { type: 'string' },
            type: { type: 'string', enum: ['work', 'material', 'equipment', 'service', 'other'] },
            category: { type: 'string' },
            qty: { type: ['number', 'null'] },
            fromCalc: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['calc', 'row'], properties: { calc: { type: 'integer' }, row: { type: 'string' } } }] },
            note: { type: ['string', 'null'] },
          },
        },
      },
    },
  },
};

/** Описание калькуляторов для модели: id, поля, строки результата */
export function calculatorsForPrompt(): string {
  return CALCULATORS.map((c) => {
    const defaults: Record<string, any> = {};
    c.fields.forEach((f) => (defaults[f.key] = f.default === '' ? 1 : f.default));
    let rows: string[] = [];
    try { rows = runCalc(c, defaults).output?.rows.map((r) => r.label) || []; } catch { /* */ }
    const fields = c.fields.map((f) => `${f.key} (${f.label}${f.unit ? ', ' + f.unit : ''}${f.type === 'select' ? ': ' + f.options!.map((o) => o.value).join('|') : ''})`).join('; ');
    return `- ${c.id}: ${c.title}. Поля: ${fields}. Результат: ${rows.join(' | ')}`;
  }).join('\n');
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();

/** Превращает ответ модели в строки черновика: количества — только из калькуляторов или слов пользователя */
export function buildDraft(ai: AiReply, prices: PriceSource): { lines: DraftLine[]; problems: string[] } {
  const problems: string[] = [];
  const calcOut = ai.calculations.map((c, i) => {
    const calc = getCalculator(c.id);
    if (!calc) { problems.push(`Неизвестный расчёт ${c.id}`); return null; }
    const vals: Record<string, string> = {};
    (c.values || []).forEach((v) => (vals[v.key] = v.value));
    calc.fields.forEach((f) => { if (vals[f.key] == null && f.default !== '' && f.default != null) vals[f.key] = String(f.default); });
    const res = runCalc(calc, vals);
    if (!res.output) { problems.push(`Расчёт «${calc.title}»: не хватает данных (${Object.values(res.errors).join(', ')})`); return null; }
    return res.output;
  });
  const cat = new Map(prices.catalog.map((p) => [norm(p.name), p]));
  const approx = new Map(prices.approx.map((p) => [norm(p.name), p]));
  const lines: DraftLine[] = [];
  for (const it of ai.items) {
    let qty: number | null = null;
    if (it.fromCalc) {
      const out = calcOut[it.fromCalc.calc];
      const row = out?.rows.find((r) => norm(r.label) === norm(it.fromCalc!.row)) || out?.rows.find((r) => norm(r.label).includes(norm(it.fromCalc!.row)));
      if (row) qty = row.value; else problems.push(`Не нашёл результат «${it.fromCalc.row}» для «${it.name}»`);
    } else if (typeof it.qty === 'number' && Number.isFinite(it.qty) && it.qty >= 0) qty = it.qty;
    const own = cat.get(norm(it.name));
    const ap = !own ? approx.get(norm(it.name)) : undefined;
    lines.push({
      name: own?.name || it.name, qty: qty ?? 0, unit: own?.unit || it.unit || 'шт', type: it.type, category: it.category || 'Прочее',
      price: own ? own.price : ap ? ap.price : 0, costPrice: own?.costPrice ?? null, catalogItemId: own?.id ?? null,
      priceSource: own ? 'catalog' : ap ? 'approx' : 'none',
      unconfirmed: !own || qty == null,
      note: [qty == null ? 'Количество не определено — уточните' : null, ap ? 'Примерная цена' : !own ? 'Цены нет в справочнике' : null, it.note].filter(Boolean).join('; ') || null,
    });
  }
  return { lines, problems };
}
