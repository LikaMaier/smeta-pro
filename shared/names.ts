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
