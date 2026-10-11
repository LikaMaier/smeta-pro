/**
 * Цены материалов проектировщика. По умолчанию — ориентировочные; прораб задаёт свои в настройках
 * (одной строкой «металл ₽/кг», «С-8 ₽/м²» и т. п.) — и все проекты пересчитываются по ним.
 */
export const DESIGN_PRICES = {
  steelKg: 95,        // труба профильная, ₽/кг
  profC8: 480,        // профнастил С-8, ₽/м² листа
  profC20: 560,
  profHC35: 780,
  tile: 720,          // металлочерепица, ₽/м²
  soft: 780,          // гибкая черепица, ₽/м²
  polyRoof: 13500,    // поликарбонат 8 мм 2,1×12, ₽/лист
  polyWall: 5200,     // поликарбонат 6 мм 2,1×6, ₽/лист
  sandRoof: 3400,     // сэндвич кровельный 150, ₽/м²
  sandWall: 2700,     // сэндвич стеновой 100, ₽/м²
  mesh: 550,          // сетка сварная, ₽/м²
  concrete: 7200,     // бетон М300 с доставкой, ₽/м³
  rebar: 72000,       // арматура А500, ₽/т
  timber: 21000,      // брус, ₽/м³
  board: 19000,       // доска, ₽/м³
  deck: 2200,         // террасная доска, ₽/м²
  paving: 850,        // тротуарная плитка, ₽/м²
  curb: 650,          // бордюр, ₽/шт (1 м)
};
export type DesignPrices = typeof DESIGN_PRICES;
export type DesignPriceKey = keyof DesignPrices;

export const DESIGN_PRICE_LABELS: { key: DesignPriceKey; label: string; unit: string; group: string }[] = [
  { key: 'steelKg', label: 'Труба профильная', unit: '₽/кг', group: 'Металл' },
  { key: 'profC8', label: 'Профнастил С-8', unit: '₽/м²', group: 'Кровля и стены' },
  { key: 'profC20', label: 'Профнастил С-20', unit: '₽/м²', group: 'Кровля и стены' },
  { key: 'profHC35', label: 'Профнастил НС-35', unit: '₽/м²', group: 'Кровля и стены' },
  { key: 'tile', label: 'Металлочерепица', unit: '₽/м²', group: 'Кровля и стены' },
  { key: 'soft', label: 'Гибкая черепица', unit: '₽/м²', group: 'Кровля и стены' },
  { key: 'polyRoof', label: 'Поликарбонат 8 мм, лист 2,1×12', unit: '₽/лист', group: 'Кровля и стены' },
  { key: 'polyWall', label: 'Поликарбонат 6 мм, лист 2,1×6', unit: '₽/лист', group: 'Кровля и стены' },
  { key: 'sandRoof', label: 'Сэндвич-панель кровельная 150', unit: '₽/м²', group: 'Кровля и стены' },
  { key: 'sandWall', label: 'Сэндвич-панель стеновая 100', unit: '₽/м²', group: 'Кровля и стены' },
  { key: 'mesh', label: 'Сетка сварная', unit: '₽/м²', group: 'Кровля и стены' },
  { key: 'concrete', label: 'Бетон М300 с доставкой', unit: '₽/м³', group: 'Основание' },
  { key: 'rebar', label: 'Арматура А500', unit: '₽/т', group: 'Основание' },
  { key: 'paving', label: 'Тротуарная плитка', unit: '₽/м²', group: 'Основание' },
  { key: 'curb', label: 'Бордюр (1 м)', unit: '₽/шт', group: 'Основание' },
  { key: 'deck', label: 'Террасная доска', unit: '₽/м²', group: 'Основание' },
  { key: 'timber', label: 'Брус', unit: '₽/м³', group: 'Дерево' },
  { key: 'board', label: 'Доска', unit: '₽/м³', group: 'Дерево' },
];

/** Слить свои цены с ценами по умолчанию (неверные значения отбрасываются) */
export function mergePrices(own?: Partial<Record<string, any>> | null): DesignPrices {
  const out: any = { ...DESIGN_PRICES };
  for (const k of Object.keys(DESIGN_PRICES)) { const v = Number(own?.[k]); if (Number.isFinite(v) && v > 0) out[k] = v; }
  return out;
}
