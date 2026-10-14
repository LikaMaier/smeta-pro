/**
 * Поиск по базе материалов поставщика (прайс-лист «Петрович», СПб): нормализация названий и запроса,
 * все слова запроса должны найтись в названии (окончания слов не важны, размеры 12х1250 = 12x1250 = 12×1250).
 */
export interface MatItem { name: string; unit: string; price: number; cat: string; code: string }

export function normText(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е')
    .replace(/(\d)\s*[×хx*]\s*(?=\d)/g, '$1x')   // 12 х 1250 → 12x1250
    .replace(/(\d),(\d)/g, '$1.$2')               // 12,5 → 12.5
    .replace(/[«»"'()\[\]{}:;!?/\\|+]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// синонимы: как говорят на стройке → как пишут в прайсе
const SYN: Record<string, string[]> = {
  осб: ['osb'], 'osb': ['osb'], гипсокартон: ['гкл'], гкл: ['гкл'], гвл: ['гвл'],
  минвата: ['минерал', 'технолайт', 'rockwool', 'роквул', 'изовер', 'isover', 'роклайт', 'тисма', 'nord', 'каменн', 'стекловолок'],
  пенопласт: ['пенопласт', 'пенополистир'], эппс: ['экструз', 'xps', 'пеноплэкс', 'техноплекс', 'эппс'],
  профлист: ['профнастил'], металлочерепица: ['металлочерепиц'], ппр: ['полипропилен', 'ppr'],
  саморез: ['саморез'], плиточный: ['плит'], ламинат: ['ламинат'], кварцвинил: ['spc', 'кварцвинил', 'lvt'],
};
const stem = (t: string) => (t.length > 5 ? t.slice(0, t.length - 2) : t.length > 4 ? t.slice(0, t.length - 1) : t);

const STOP = new Set(['по', 'для', 'и', 'на', 'с', 'из', 'в', 'под', 'мм', 'шт']);
/** Размеры в сантиметрах тоже находят миллиметры: «60х60» → и «600x600» */
const dims = (t: string) => {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?$/.exec(t);
  if (!m) return [t];
  const nums = m.slice(1).filter(Boolean).map(Number);
  return nums.every((n) => n <= 300) ? [t, nums.map((n) => n * 10).join('x')] : [t];
};
export function queryTerms(q: string): string[][] {
  return normText(q).split(' ').filter((t) => t.length > 0 && !STOP.has(t)).slice(0, 8)
    .map((t) => SYN[t] || (/\d/.test(t) ? dims(t) : [stem(t)]));
}

/** Лучшие совпадения: все слова найдены; выше — где слова раньше в названии и название короче */
export function searchMaterials<T extends { n: string }>(items: T[], q: string, limit = 30): T[] {
  const terms = queryTerms(q);
  if (!terms.length) return [];
  const out: { it: T; score: number }[] = [];
  for (const it of items) {
    let score = 0, ok = true;
    for (const alts of terms) {
      let best = -1;
      for (const a of alts) {
        let i = it.n.indexOf(a);
        // число ищем как отдельное: «50» в «50х600» лучше, чем в «150х600»
        while (i >= 0) {
          const edge = !/\d/.test(a[0]) || i === 0 || !/[\d.]/.test(it.n[i - 1]);
          const sc = edge ? i : i + 60;
          if (best < 0 || sc < best) best = sc;
          if (edge) break;
          i = it.n.indexOf(a, i + 1);
        }
      }
      if (best < 0) { ok = false; break; }
      score += best;
    }
    if (ok) out.push({ it, score: score + it.n.length * 0.15 });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, limit).map((x) => x.it);
}

/** Площадь упаковки из названия («2,74 кв.м», «(4 шт.=1,44 кв.м)») — чтобы показать цену за м² */
export function packArea(name: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*кв\.?\s*м/i.exec(name);
  const v = m ? Number(m[1].replace(',', '.')) : NaN;
  return v > 0 && v < 200 ? v : null;
}
