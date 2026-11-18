/** Нормализация названия для сопоставления позиций: регистр, ё, кавычки, «×/х/x» между цифрами, лишние пробелы и знаки */
export function normName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/(\d)\s*[×хx*]\s*(?=\d)/g, '$1x')
    .replace(/[«»"'„“”`]/g, '')
    .replace(/[.,;:()\[\]]/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Слова поиска без окончаний: «плитка пол» → ['плит', 'пол'], «розеток» → ['розет'].
 * Так «плитка на пол» находит «Укладка плитки на пол», а порядок слов и падеж не важны.
 */
export function searchStems(q: string): string[] {
  return String(q || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/i).filter((w) => w.length >= 2 && !['на', 'из', 'по', 'под', 'для', 'до', 'от', 'за', 'со', 'во'].includes(w))
    .map((w) => (/^\d/.test(w) ? w : w.length >= 6 ? w.slice(0, -2) : w.length >= 4 ? w.slice(0, -1) : w)).slice(0, 6);
}
/** Название подходит под запрос: все слова запроса (без окончаний) встречаются в названии */
export function matchesSearch(name: string, q: string): boolean {
  const n = String(name || '').toLowerCase().replace(/ё/g, 'е');
  const stems = searchStems(q);
  return stems.length ? stems.every((s) => n.includes(s)) : true;
}
/** Насколько название подходит под запрос: слова с начала слова важнее, чем в середине («тёплый пол» ≠ «уТЕПЛение… пеноПОЛистиролом») */
const CASE_END = /^(а|я|у|ю|ы|и|е|о|ой|ей|ом|ем|ам|ям|ов|ев|ах|ях|ами|ями)?$/;
export function searchRank(name: string, q: string): number {
  const n = String(name || '').toLowerCase().replace(/ё/g, 'е');
  const words = n.split(/[^a-zа-я0-9]+/i).filter(Boolean);
  const stems = searchStems(q);
  let r = 0;
  stems.forEach((s, i) => {
    const at = words.findIndex((w) => w.startsWith(s));
    if (at < 0) return;
    r += 2 + (at === i ? 1 : 0);
    // то же слово в другом падеже («пол» → «пола»), а не другое слово с тем же началом («полки»)
    if (words.some((w) => w.startsWith(s) && CASE_END.test(w.slice(s.length)))) r += 1;
  });
  return r - n.length / 400;
}
