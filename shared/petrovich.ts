/**
 * Ссылки на материалы в магазине «Петрович» (petrovich.ru): поиск по названию позиции.
 * Цены и наличие — на сайте магазина (зависят от города), в приложение не подтягиваются.
 */
export const PETROVICH_CITIES = { spb: { label: 'Санкт-Петербург', host: 'petrovich.ru' }, msk: { label: 'Москва', host: 'moscow.petrovich.ru' } } as const;
export type PetrovichCity = keyof typeof PETROVICH_CITIES;

/** Короткий поисковый запрос из названия строки сметы: без пояснений, размеры — через «x» */
export function petrovichQuery(name: string) {
  let s = String(name || '')
    .replace(/^Материалы:\s*/i, '')
    .replace(/\s\([^)]*\)/g, ' ')            // «(комплект)», «(хвоя)» — пояснения
    .split(/\s[—–-]\s|:|;/)[0]                // «… — для чего», «…: состав»
    .split(/,(?!\d)/)[0]                     // «…, хлыст 12 м», «…, с подоконником» — уточнения после запятой (но не «2,5»)
    .replace(/(\d)\s*[×хХ]\s*(?=\d)/g, '$1x')  // 3 × 2,5 → 3x2,5 (буква Х в «ПВХ» не трогаем)
    .replace(/\s+/g, ' ').trim();
  const words = s.split(' ');
  if (words.length > 7) s = words.slice(0, 7).join(' ');
  return s;
}
export const petrovichUrl = (name: string, city: PetrovichCity = 'spb') => `https://${PETROVICH_CITIES[city]?.host || 'petrovich.ru'}/search/?q=${encodeURIComponent(petrovichQuery(name))}`;
