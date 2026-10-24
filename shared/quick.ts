/**
 * «Быстрая смета»: пишешь работы обычными словами — получаешь строки сметы из справочника.
 * Без ИИ и без сети: разбор текста, количество и единицы, поиск по названиям работ (свои цены важнее примерных).
 *   «плитка в ванной 12 м², снять старую плитку, 6 розеток и унитаз» →
 *   Укладка плитки на пол · 12 м² / Демонтаж плитки… / Монтаж розетки/выключателя · 6 шт / Установка унитаза · 1 шт
 */
export interface QuickItem { name: string; unit: string; price: number; category?: string; own?: boolean }
export interface QuickLine { text: string; qty: number; unit: string | null; match: QuickItem | null; alts: QuickItem[]; given: boolean }

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

// единицы из текста → единицы справочника
const UNIT_RE = /(\d+(?:[.,]\d+)?)\s*(?:(м2|м²|м\.?\s*кв\.?|кв\.?\s*м\.?|квадрат\w*)|(м3|м³|куб\w*)|(п\.?\s*м\.?|пог\.?\s*м\.?|погонн\w*|метр\w*|м\.?)|(шт\.?|штук\w*|точ\w*)|(компл\w*)|(рулон\w*)|(рейс\w*)|(смен\w*))?(?![\dа-яa-z×x*])/gi;
const UNIT_OF = ['м²', 'м³', 'пог. м', 'шт', 'компл', 'рулон', 'рейс', 'смена'];

// глаголы и разговорные слова → как это называется в справочнике
const ALIAS: [RegExp, string][] = [
  [/^(положи|уложи|укласт|клас|ложи)/, 'укладк'], [/^(поклеи|наклеи|клеи|переклеи)/, 'поклейк'],
  [/^(покрас|перекрас|окрас|крас)/, 'покраск'], [/^(постав|установ|повес|подключ|смонтир|собрат|собер)/, 'монтаж установк'],
  [/^(сня|убра|слома|снест|снос|разобр|демонтир|отбит|сбит|сбив)/, 'демонтаж'], [/^(выровня|выравнив)/, 'выравнив штукатурк'],
  [/^(замен|помен|переделат)/, 'замен монтаж'], [/^утепл/, 'утеплен'], [/^(зашпакл|шпакл|прошпакл)/, 'шпаклевк'],
  [/^(оштукат|штукатур)/, 'штукатурк'], [/^(залит|залив)/, 'заливк стяжк бетонирован'], [/^(провест|протян|проложи)/, 'прокладк'],
  [/^(выры|выкоп|копат|копа)/, 'разработк рыть копк'], [/^(пробури|бури)/, 'бурен'], [/^(построи|возвест|сделат|обустро|организ|нужн|надо|хоч)/, ''],
  [/^кафел/, 'плитк'], [/^крыш/, 'кровл'], [/^проводк/, 'кабел электромонтаж'], [/^(гипсокартон|гипрок)/, 'гкл'],
  [/^водонагрев/, 'бойлер'], [/^(батаре|радиатор)/, 'радиатор'], [/^(профнастил|профлист)/, 'профлист профнастил'],
  [/^(газон)/, 'газон'], [/^(брусчат)/, 'брусчатк'], [/^(тротуарк)/, 'тротуарн плитк'], [/^(мусор)/, 'мусор вывоз'],
  [/^(душев)/, 'душев'], [/^(санузел|санузл|туалет)/, 'санузл'], [/^(сплит|кондиц)/, 'сплит кондиционер'],
];
const STOP = new Set(['на', 'в', 'во', 'под', 'по', 'с', 'со', 'из', 'и', 'для', 'до', 'от', 'за', 'к', 'у', 'о', 'об', 'весь', 'вся', 'все', 'всю', 'там', 'еще',
  'нов', 'стар', 'старый', 'старую', 'старой', 'новый', 'новую', 'новой', 'ещ', 'плюс', 'примерно', 'около', 'где', 'то', 'это', 'мне', 'нам', 'надо', 'нужно']);
// слова, которые есть почти в каждой позиции — слабый вес
const WEAK = new Set(['монтаж', 'установк', 'устройств', 'работ', 'под', 'ключ', 'материал', 'замен', 'ремонт']);
// «другие» работы с тем же предметом: штрафуем, если о них не просили («розетки» ≠ «демонтаж розеток»)
const DEFAULT_ACT = new Set(['укладк', 'монтаж', 'установк', 'устройств', 'поклейк', 'прокладк']);
const SIDE = ['демонтаж', 'прочистк', 'ремонт', 'обслуживан', 'чистк', 'диагностик', 'прозвонк', 'утеплен', 'погрузк', 'антикоррозийн', 'вынос', 'слив', 'изготовлен', 'бетонирован', 'закладн', 'перенос', 'покраск', 'шпаклевк', 'шлифовк', 'армирован', 'грунтовк'];

const ENDINGS = /(иями|ями|ами|ого|его|ому|ему|ыми|ими|ией|ией|ов|ев|ей|ой|ий|ый|ая|яя|ое|ее|ые|ие|ую|юю|ам|ям|ах|ях|ом|ем|ия|ию|а|я|о|е|ы|и|у|ю|ь|й)$/;
export function stem(w: string): string {
  const s = norm(w);
  if (s.length <= 3) return s;
  const t = s.replace(ENDINGS, '');
  return t.length >= 3 ? t : s;
}
// «60х60», «60 x 60», «60×60» → один токен 60x60; голые числа — не слова
const words = (s: string) => norm(s).replace(/(\d)\s*[хx×*]\s*(\d)/g, '$1x$2').split(/[^a-zа-я0-9]+/).filter((w) => w && !/^\d+$/.test(w));
/** Слова фразы; слова после «в/во» («плитка в ванной») — место, а не работа: помечаются ~ */
function tokens(s: string): string[] {
  const out: string[] = [];
  let prev = '';
  for (const w of words(s)) {
    const place = prev === 'в' || prev === 'во';
    prev = w;
    if (STOP.has(w) || w.length < 2) continue;
    if (place) { out.push(`~${stem(w)}`); continue; }
    const a = ALIAS.find(([re]) => re.test(w));
    if (a) { out.push(...a[1].split(' ').filter(Boolean)); continue; }
    out.push(stem(w));
  }
  return out;
}
function same(a: string, b: string): boolean {
  if (a === b) return true;
  const m = Math.min(a.length, b.length);
  if (m < 4) return false;
  let cp = 0;
  while (cp < m && a[cp] === b[cp]) cp++;
  return cp >= 4 && cp >= m - 1;
}

export interface QuickIndex { items: QuickItem[]; toks: string[][] }
export function quickIndex(items: QuickItem[]): QuickIndex {
  return { items, toks: items.map((i) => tokens(i.name).map((t) => t.replace(/^~/, ''))) };
}

function score(q: string[], it: string[], ctx: string[]): number {
  let s = 0, strong = 0;
  for (const raw of q) {
    const place = raw.startsWith('~');
    const t = place ? raw.slice(1) : raw;
    if (!it.some((x) => same(t, x))) continue;
    if (place) s += 0.2; else if (WEAK.has(t)) s += 0.3; else { s += 1; strong++; }
  }
  if (!strong) return 0;
  // главное действие позиции названо в запросе («покраска стен» → «Покраска стен…», а не «Шпаклёвка стен под покраску»)
  if (q.some((t) => same(t, it[0]))) s += 0.35;
  for (const side of SIDE) if (it.some((x) => same(x, side)) && !q.some((t) => same(t, side))) s -= 0.8;
  // соседние фразы как контекст: «плитка …, затирка» → затирка швов плитки
  for (const c of ctx) if (it.some((x) => same(c, x))) s += 0.1;
  // действие не названо («плитка 12 м²») — по умолчанию это укладка/монтаж, а не облицовка экрана
  if (!q.some((t) => same(t, it[0])) && DEFAULT_ACT.has(it[0])) s += 0.2;
  return s - it.length * 0.06; // при равенстве — более короткое (общее) название
}

/** Лучшие совпадения для фразы */
export function findItems(ix: QuickIndex, text: string, unit: string | null = null, limit = 4, context = ''): QuickItem[] {
  const q = [...new Set(tokens(text))];
  if (!q.some((t) => !t.startsWith('~'))) return [];
  const ctx = [...new Set(tokens(context).map((t) => t.replace(/^~/, '')))].filter((t) => !q.includes(t) && !WEAK.has(t));
  const res: { i: QuickItem; s: number }[] = [];
  ix.items.forEach((i, k) => {
    let s = score(q, ix.toks[k], ctx);
    if (s <= 0) return;
    if (unit && i.unit === unit) s += 0.5;
    if (i.own) s += 0.25;
    res.push({ i, s });
  });
  res.sort((a, b) => b.s - a.s);
  const best = res[0]?.s ?? 0;
  const seen = new Set<string>();
  return res.filter((r) => r.s >= best - 1.01 && !seen.has(norm(r.i.name)) && seen.add(norm(r.i.name))).slice(0, limit).map((r) => r.i);
}

function qtyOf(frag: string): { qty: number | null; unit: string | null; rest: string } {
  let last: { qty: number; unit: string | null; m: string } | null = null;
  for (const m of frag.matchAll(UNIT_RE)) {
    const k = m.slice(2).findIndex(Boolean);
    const cand = { qty: parseFloat(m[1].replace(',', '.')), unit: k >= 0 ? UNIT_OF[k] : null, m: m[0] };
    if (!last || cand.unit || !last.unit) last = cand; // число с единицей важнее голого числа
  }
  if (!last) return { qty: null, unit: null, rest: frag };
  return { qty: last.qty, unit: last.unit, rest: frag.replace(last.m, ' ') };
}

/** Разобрать текст на строки сметы */
export function parseQuick(text: string, ix: QuickIndex): QuickLine[] {
  const frags = text.split(/[\n;]+|(?<!\d),|,(?!\d)|\.\s+/).map((s) => s.trim()).filter(Boolean);
  const out: QuickLine[] = [];
  for (const f of frags) {
    // «шпаклёвка и покраска стен 40 м²» → две работы с одним количеством
    const parts = f.split(/\s+(?:и|плюс|\+)\s+/i).map((s) => s.trim()).filter(Boolean);
    const parsed = parts.map(qtyOf);
    const shared = parsed.find((p) => p.qty != null);
    // общие слова-объекты («стен»), если у части нет своих: «шпаклёвка и покраска стен»
    const tail = parts.length > 1 ? parsed[parsed.length - 1].rest.split(/\s+/).slice(1).join(' ') : '';
    parsed.forEach((p, k) => {
      const qty = p.qty ?? shared?.qty ?? 1;
      const unit = p.unit ?? shared?.unit ?? null;
      let phrase = p.rest;
      if (parts.length > 1 && k < parts.length - 1 && phrase.trim().split(/\s+/).length === 1 && tail) phrase = `${phrase} ${tail}`;
      if (!tokens(phrase).some((t) => !t.startsWith('~'))) return;
      // без количества фраза обычно короткая («затирка») — подсказкой служат соседние фразы
      const alts = findItems(ix, phrase, unit, 4, p.qty == null && shared?.qty == null ? text : '');
      out.push({ text: parts[k], qty: Math.max(0, qty), unit, match: alts[0] || null, alts, given: p.qty != null || shared?.qty != null });
    });
  }
  // «плитка 12 м², демонтаж старой плитки» — у демонтажа то же количество, что у соседней фразы про тот же предмет
  for (const l of out) {
    if (l.given || !l.match) continue;
    const mine = tokens(l.text).filter((t) => !t.startsWith('~') && !WEAK.has(t) && !SIDE.includes(t));
    const k = out.indexOf(l);
    const src = out.find((o) => o.given && o.match && o.match.unit === l.match!.unit && tokens(o.text).some((t) => mine.some((m) => same(m, t.replace(/^~/, '')))))
      // одно слово («затирка») — продолжение предыдущей фразы с той же единицей
      ?? (mine.length <= 1 ? out.slice(0, k).reverse().find((o) => o.given && o.match?.unit === l.match!.unit) : undefined);
    if (src) { l.qty = src.qty; l.given = true; }
  }
  return out;
}

export const QUICK_EXAMPLES = [
  'Плитка в ванной 12 м², демонтаж старой плитки, установка унитаза и смесителя',
  'Шпаклёвка и покраска стен 60 м², ламинат 20 м², 8 розеток',
  'Забор из профлиста 50 м, откатные ворота, калитка',
  'Септик, наружная канализация 12 м, дренаж 40 м',
];
