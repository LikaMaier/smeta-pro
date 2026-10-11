import { roundTo } from './money';

/**
 * Реестр строительных калькуляторов.
 * Чтобы добавить калькулятор — допишите объект в CALCULATORS: поля описываются декларативно,
 * расчёт — чистая функция compute(). Интерфейс и «Добавить в смету» работают автоматически.
 */
export type FieldType = 'number' | 'select' | 'text';

export interface CalcField {
  key: string;
  label: string;
  unit?: string;
  hint?: string;
  type?: FieldType;
  min?: number;
  max?: number;
  default?: number | string;
  integer?: boolean;
  options?: { value: string; label: string }[];
  optional?: boolean;
}

export interface CalcResultRow {
  label: string;
  value: number;
  unit: string;
  primary?: boolean;
}

export interface EstimateSuggestion {
  name: string;
  qty: number;
  unit: string;
  type: 'work' | 'material' | 'equipment' | 'service' | 'other';
}

export interface CalcOutput {
  rows: CalcResultRow[];
  formula: string[];
  warnings: string[];
  suggestions: EstimateSuggestion[];
}

export interface Calculator {
  id: string;
  group: string;
  title: string;
  description: string;
  fields: CalcField[];
  compute: (v: Record<string, any>) => CalcOutput;
  /** Короткое название для шапки и плитки */
  short?: string;
  /** К какой строке результата относится «Цена за …» (индекс в rows). По умолчанию — основная строка */
  priceRow?: number;
}

export const CALC_GROUPS = ['Геометрия', 'Бетон и растворы', 'Кирпич и кладка', 'Кровля и утепление', 'Гипсокартон', 'Отделка', 'Полы и стены', 'Электрика', 'Наружные сети', 'Благоустройство', 'Древесина'];

const RESERVE: CalcField = { key: 'reserve', label: 'Запас', unit: '%', default: 0, min: 0, max: 100, hint: 'Запас на подрезку, бой и потери' };
const withReserve = (v: number, pct: number) => v * (1 + (Number(pct) || 0) / 100);
const r = roundTo;
const ceil = Math.ceil;

/** Валидация значений по описанию полей. Возвращает ошибки по ключам. */
export function validateCalc(calc: Calculator, values: Record<string, any>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of calc.fields) {
    const raw = values[f.key];
    if (f.type === 'select') continue;
    if (f.type === 'text') {
      if (!f.optional && (!raw || !String(raw).trim())) errors[f.key] = 'Заполните поле';
      continue;
    }
    if (raw === '' || raw == null) {
      if (!f.optional) errors[f.key] = 'Заполните поле';
      continue;
    }
    const n = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n)) { errors[f.key] = 'Введите число'; continue; }
    if (f.min != null && n < f.min) errors[f.key] = `Не меньше ${f.min}`;
    else if (f.max != null && n > f.max) errors[f.key] = `Не больше ${f.max}`;
    else if (f.integer && !Number.isInteger(n)) errors[f.key] = 'Целое число';
  }
  if (calc.id === 'area-multi' && !errors.areas) {
    try { parseRects(values.areas); } catch (e: any) { errors.areas = e.message; }
  }
  return errors;
}

export function normalizeValues(calc: Calculator, values: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of calc.fields) {
    const raw = values[f.key] ?? f.default;
    if (f.type === 'select' || f.type === 'text') out[f.key] = raw;
    else out[f.key] = raw === '' || raw == null ? 0 : Number(String(raw).replace(',', '.'));
  }
  return out;
}

export function runCalc(calc: Calculator, values: Record<string, any>) {
  const errors = validateCalc(calc, values);
  if (Object.keys(errors).length) return { errors, output: null as CalcOutput | null };
  return { errors, output: calc.compute(normalizeValues(calc, values)) };
}

/** "6x4; 3x2,5" -> [[6,4],[3,2.5]] */
export function parseRects(s: string): [number, number][] {
  const parts = String(s || '').split(/[;\n]+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) throw new Error('Введите хотя бы один участок');
  return parts.map((p) => {
    const m = p.replace(/,/g, '.').match(/^(\d+(?:\.\d+)?)\s*[xх×*]\s*(\d+(?:\.\d+)?)$/i);
    if (!m) throw new Error(`Не понял «${p}». Формат: 6x4; 3x2.5`);
    return [Number(m[1]), Number(m[2])];
  });
}

const BRICKS: Record<string, { l: number; w: number; h: number; label: string }> = {
  single: { l: 0.25, w: 0.12, h: 0.065, label: 'Одинарный 250×120×65' },
  oneandhalf: { l: 0.25, w: 0.12, h: 0.088, label: 'Полуторный 250×120×88' },
  double: { l: 0.25, w: 0.12, h: 0.138, label: 'Двойной 250×120×138' },
};
const WALL_THICK: Record<string, number> = { '0.5': 0.12, '1': 0.25, '1.5': 0.38, '2': 0.51 };

export const CALCULATORS: Calculator[] = [
  // ---------- ГЕОМЕТРИЯ ----------
  {
    id: 'area-rect', group: 'Геометрия', title: 'Площадь и периметр прямоугольника',
    description: 'Площадка, комната, участок',
    fields: [
      { key: 'a', label: 'Длина', unit: 'м', min: 0, default: 6 },
      { key: 'b', label: 'Ширина', unit: 'м', min: 0, default: 4 },
    ],
    compute: ({ a, b }) => ({
      rows: [
        { label: 'Площадь', value: r(a * b, 3), unit: 'м²', primary: true },
        { label: 'Периметр', value: r(2 * (a + b), 3), unit: 'м' },
      ],
      formula: [`S = ${a} × ${b} = ${r(a * b, 3)} м²`, `P = 2 × (${a} + ${b}) = ${r(2 * (a + b), 3)} м`],
      warnings: [],
      suggestions: [{ name: 'Площадь', qty: r(a * b, 2), unit: 'м²', type: 'work' }],
    }),
  },
  {
    id: 'area-multi', group: 'Геометрия', title: 'Площадь из нескольких участков',
    description: 'Сумма прямоугольников: «6x4; 3x2.5»',
    fields: [{ key: 'areas', label: 'Участки (длина x ширина)', type: 'text', default: '6x4; 3x2.5', hint: 'Разделяйте участки точкой с запятой' }],
    compute: ({ areas }) => {
      const rects = parseRects(areas);
      const parts = rects.map(([a, b]) => a * b);
      const s = parts.reduce((x, y) => x + y, 0);
      return {
        rows: [{ label: 'Общая площадь', value: r(s, 3), unit: 'м²', primary: true }, { label: 'Участков', value: rects.length, unit: 'шт' }],
        formula: [rects.map(([a, b]) => `${a}×${b}`).join(' + ') + ` = ${r(s, 3)} м²`],
        warnings: [],
        suggestions: [{ name: 'Площадь', qty: r(s, 2), unit: 'м²', type: 'work' }],
      };
    },
  },
  {
    id: 'room', group: 'Геометрия', title: 'Стены, пол и потолок комнаты',
    description: 'Площадь стен за вычетом проёмов',
    fields: [
      { key: 'a', label: 'Длина комнаты', unit: 'м', min: 0, default: 5 },
      { key: 'b', label: 'Ширина комнаты', unit: 'м', min: 0, default: 4 },
      { key: 'h', label: 'Высота потолка', unit: 'м', min: 0, default: 2.7 },
      { key: 'open', label: 'Площадь проёмов (окна, двери)', unit: 'м²', min: 0, default: 0, hint: 'Сумма площадей всех окон и дверей' },
    ],
    compute: ({ a, b, h, open }) => {
      const floor = a * b, per = 2 * (a + b), wallsGross = per * h, walls = Math.max(wallsGross - open, 0);
      const w: string[] = [];
      if (open > wallsGross) w.push('Площадь проёмов больше площади стен — проверьте данные');
      return {
        rows: [
          { label: 'Площадь стен (чистая)', value: r(walls, 2), unit: 'м²', primary: true },
          { label: 'Площадь пола', value: r(floor, 2), unit: 'м²' },
          { label: 'Площадь потолка', value: r(floor, 2), unit: 'м²' },
          { label: 'Периметр', value: r(per, 2), unit: 'м' },
        ],
        formula: [`P = 2 × (${a} + ${b}) = ${r(per, 2)} м`, `Sстен = ${r(per, 2)} × ${h} − ${open} = ${r(walls, 2)} м²`, `Sпола = ${a} × ${b} = ${r(floor, 2)} м²`],
        warnings: w,
        suggestions: [
          { name: 'Площадь стен', qty: r(walls, 2), unit: 'м²', type: 'work' },
          { name: 'Площадь пола', qty: r(floor, 2), unit: 'м²', type: 'work' },
        ],
      };
    },
  },
  {
    id: 'volume-box', group: 'Геометрия', title: 'Объём прямоугольной ёмкости',
    description: 'Ящик, бак, резервуар',
    fields: [
      { key: 'a', label: 'Длина', unit: 'м', min: 0, default: 2 },
      { key: 'b', label: 'Ширина', unit: 'м', min: 0, default: 1 },
      { key: 'h', label: 'Высота', unit: 'м', min: 0, default: 1 },
    ],
    compute: ({ a, b, h }) => {
      const v = a * b * h;
      return {
        rows: [{ label: 'Объём', value: r(v, 3), unit: 'м³', primary: true }, { label: 'Объём', value: r(v * 1000, 1), unit: 'л' }],
        formula: [`V = ${a} × ${b} × ${h} = ${r(v, 3)} м³`],
        warnings: [], suggestions: [],
      };
    },
  },
  {
    id: 'volume-cyl', group: 'Геометрия', title: 'Объём цилиндрической ёмкости',
    description: 'Колодец, кольцо, бочка, септик',
    fields: [
      { key: 'd', label: 'Внутренний диаметр', unit: 'м', min: 0, default: 1 },
      { key: 'h', label: 'Высота', unit: 'м', min: 0, default: 2 },
    ],
    compute: ({ d, h }) => {
      const v = Math.PI * (d / 2) ** 2 * h;
      return {
        rows: [{ label: 'Объём', value: r(v, 3), unit: 'м³', primary: true }, { label: 'Объём', value: r(v * 1000, 0), unit: 'л' }],
        formula: [`V = π × (${d}/2)² × ${h} = ${r(v, 3)} м³`],
        warnings: [], suggestions: [],
      };
    },
  },
  {
    id: 'trench', group: 'Геометрия', title: 'Котлован или траншея',
    description: 'Объём выемки грунта и вывоза',
    fields: [
      { key: 'a', label: 'Длина', unit: 'м', min: 0, default: 10 },
      { key: 'b', label: 'Ширина', unit: 'м', min: 0, default: 0.6 },
      { key: 'h', label: 'Глубина', unit: 'м', min: 0, default: 1 },
      { key: 'k', label: 'Коэффициент разрыхления', min: 1, max: 2, default: 1, hint: 'Для объёма вывоза. Зависит от грунта, уточните по своему грунту (часто 1,1–1,3). 1 — без разрыхления' },
    ],
    compute: ({ a, b, h, k }) => {
      const v = a * b * h, vk = v * k;
      return {
        rows: [{ label: 'Объём выемки', value: r(v, 2), unit: 'м³', primary: true }, { label: 'Объём для вывоза', value: r(vk, 2), unit: 'м³' }],
        formula: [`V = ${a} × ${b} × ${h} = ${r(v, 2)} м³`, `Vвывоза = ${r(v, 2)} × ${k} = ${r(vk, 2)} м³`],
        warnings: ['Расчёт для вертикальных стенок без откосов'],
        suggestions: [
          { name: 'Разработка грунта', qty: r(v, 2), unit: 'м³', type: 'work' },
          { name: 'Вывоз грунта', qty: r(vk, 2), unit: 'м³', type: 'service' },
        ],
      };
    },
  },
  // ---------- БЕТОН ----------
  {
    id: 'concrete-slab', group: 'Бетон и растворы', title: 'Бетонная плита / площадка',
    description: 'Объём бетона для плиты',
    fields: [
      { key: 'a', label: 'Длина', unit: 'м', min: 0, default: 6 },
      { key: 'b', label: 'Ширина', unit: 'м', min: 0, default: 4 },
      { key: 't', label: 'Толщина', unit: 'см', min: 0, max: 200, default: 15 },
      RESERVE,
    ],
    compute: ({ a, b, t, reserve }) => {
      const v = a * b * (t / 100), vr = withReserve(v, reserve);
      return {
        rows: [
          { label: 'Бетон с запасом', value: r(vr, 2), unit: 'м³', primary: true },
          { label: 'Бетон без запаса', value: r(v, 3), unit: 'м³' },
          { label: 'Площадь', value: r(a * b, 2), unit: 'м²' },
        ],
        formula: [`V = ${a} × ${b} × ${t / 100} = ${r(v, 3)} м³`, `С запасом ${reserve}%: ${r(vr, 2)} м³`],
        warnings: [],
        suggestions: [
          { name: 'Бетон', qty: r(vr, 2), unit: 'м³', type: 'material' },
          { name: 'Бетонирование плиты', qty: r(v, 2), unit: 'м³', type: 'work' },
        ],
      };
    },
  },
  {
    id: 'strip-foundation', group: 'Бетон и растворы', title: 'Ленточный фундамент',
    description: 'Объём бетона для ленты',
    fields: [
      { key: 'len', label: 'Общая длина ленты', unit: 'м', min: 0, default: 40, hint: 'Периметр + внутренние стены' },
      { key: 'w', label: 'Ширина ленты', unit: 'см', min: 0, default: 40 },
      { key: 'h', label: 'Высота ленты', unit: 'см', min: 0, default: 100 },
      RESERVE,
    ],
    compute: ({ len, w, h, reserve }) => {
      const v = len * (w / 100) * (h / 100), vr = withReserve(v, reserve);
      return {
        rows: [{ label: 'Бетон с запасом', value: r(vr, 2), unit: 'м³', primary: true }, { label: 'Без запаса', value: r(v, 3), unit: 'м³' }],
        formula: [`V = ${len} × ${w / 100} × ${h / 100} = ${r(v, 3)} м³`, `С запасом ${reserve}%: ${r(vr, 2)} м³`],
        warnings: ['Армирование и опалубка считаются отдельно. Конструкцию фундамента должен определять специалист.'],
        suggestions: [{ name: 'Бетон', qty: r(vr, 2), unit: 'м³', type: 'material' }],
      };
    },
  },
  {
    id: 'mix-recipe', group: 'Бетон и растворы', title: 'Компоненты смеси по своему рецепту',
    description: 'Цемент, песок, щебень, вода на нужный объём',
    fields: [
      { key: 'v', label: 'Объём смеси', unit: 'м³', min: 0, default: 1 },
      { key: 'cement', label: 'Цемент на 1 м³', unit: 'кг', min: 0, default: '', hint: 'Из вашего рецепта или паспорта смеси для нужной марки' },
      { key: 'sand', label: 'Песок на 1 м³', unit: 'м³', min: 0, default: '', hint: 'Из вашего рецепта' },
      { key: 'gravel', label: 'Щебень на 1 м³', unit: 'м³', min: 0, default: 0, hint: '0 — для раствора без щебня' },
      { key: 'water', label: 'Вода на 1 м³', unit: 'л', min: 0, default: 0 },
      { key: 'bag', label: 'Вес мешка цемента', unit: 'кг', min: 1, default: 50 },
      RESERVE,
    ],
    compute: ({ v, cement, sand, gravel, water, bag, reserve }) => {
      const vv = withReserve(v, reserve);
      const c = cement * vv;
      return {
        rows: [
          { label: 'Цемент', value: r(c, 1), unit: 'кг', primary: true },
          { label: 'Цемент в мешках', value: ceil(c / bag - 1e-9), unit: 'шт' },
          { label: 'Песок', value: r(sand * vv, 3), unit: 'м³' },
          { label: 'Щебень', value: r(gravel * vv, 3), unit: 'м³' },
          { label: 'Вода', value: r(water * vv, 0), unit: 'л' },
        ],
        formula: [`Объём с запасом = ${v} × (1 + ${reserve}/100) = ${r(vv, 3)} м³`, `Компонент = расход на 1 м³ × ${r(vv, 3)}`],
        warnings: ['Расчёт по введённому вами рецепту. Рецептуру для нужной марки уточняйте у поставщика или по нормативам.'],
        suggestions: [
          { name: `Цемент (мешок ${bag} кг)`, qty: ceil(c / bag - 1e-9), unit: 'шт', type: 'material' },
          { name: 'Песок', qty: r(sand * vv, 2), unit: 'м³', type: 'material' },
          ...(gravel > 0 ? [{ name: 'Щебень', qty: r(gravel * vv, 2), unit: 'м³', type: 'material' as const }] : []),
        ],
      };
    },
  },
  // ---------- КИРПИЧ ----------
  {
    id: 'brick', group: 'Кирпич и кладка', title: 'Кирпич и раствор для стены',
    description: 'Количество кирпича с учётом шва и проёмов',
    fields: [
      { key: 'len', label: 'Длина стены', unit: 'м', min: 0, default: 10 },
      { key: 'h', label: 'Высота стены', unit: 'м', min: 0, default: 3 },
      { key: 'open', label: 'Площадь проёмов', unit: 'м²', min: 0, default: 0 },
      { key: 'thick', label: 'Толщина кладки', type: 'select', default: '1', options: [
        { value: '0.5', label: 'В полкирпича (120 мм)' }, { value: '1', label: 'В 1 кирпич (250 мм)' },
        { value: '1.5', label: 'В 1,5 кирпича (380 мм)' }, { value: '2', label: 'В 2 кирпича (510 мм)' }] },
      { key: 'brick', label: 'Формат кирпича', type: 'select', default: 'single', options: Object.entries(BRICKS).map(([value, b]) => ({ value, label: b.label })) },
      { key: 'joint', label: 'Толщина шва', unit: 'мм', min: 0, max: 30, default: 10 },
      RESERVE,
    ],
    compute: ({ len, h, open, thick, brick, joint, reserve }) => {
      const b = BRICKS[brick] || BRICKS.single;
      const j = joint / 1000;
      const area = Math.max(len * h - open, 0);
      const t = WALL_THICK[thick] ?? 0.25;
      const vol = area * t;
      const perM3 = 1 / ((b.l + j) * (b.w + j) * (b.h + j));
      const count = vol * perM3;
      const countR = ceil(withReserve(count, reserve) - 1e-9);
      const mortar = Math.max(vol - count * b.l * b.w * b.h, 0);
      return {
        rows: [
          { label: 'Кирпич с запасом', value: countR, unit: 'шт', primary: true },
          { label: 'Кирпич без запаса', value: ceil(count - 1e-9), unit: 'шт' },
          { label: 'Раствор', value: r(mortar, 3), unit: 'м³' },
          { label: 'Площадь кладки', value: r(area, 2), unit: 'м²' },
          { label: 'Объём кладки', value: r(vol, 3), unit: 'м³' },
        ],
        formula: [
          `S = ${len} × ${h} − ${open} = ${r(area, 2)} м²`,
          `V = ${r(area, 2)} × ${t} = ${r(vol, 3)} м³`,
          `Кирпичей в 1 м³ = 1 / ((${b.l}+${j}) × (${b.w}+${j}) × (${b.h}+${j})) = ${r(perM3, 1)}`,
          `Раствор = V − N × объём кирпича = ${r(mortar, 3)} м³`,
        ],
        warnings: ['Расчёт по геометрии кладки; фактический расход раствора зависит от технологии и может быть больше.'],
        suggestions: [
          { name: `Кирпич ${b.label}`, qty: countR, unit: 'шт', type: 'material' },
          { name: 'Раствор кладочный', qty: r(mortar, 2), unit: 'м³', type: 'material' },
          { name: 'Кирпичная кладка', qty: r(vol, 2), unit: 'м³', type: 'work' },
        ],
      };
    },
  },
  // ---------- ГИПСОКАРТОН ----------
  {
    id: 'gkl-wall', group: 'Гипсокартон', title: 'Обшивка стены / перегородка из ГКЛ',
    description: 'Листы, профили, саморезы, утеплитель',
    fields: [
      { key: 'len', label: 'Длина стены', unit: 'м', min: 0, default: 5 },
      { key: 'h', label: 'Высота', unit: 'м', min: 0, default: 2.7 },
      { key: 'open', label: 'Площадь проёмов', unit: 'м²', min: 0, default: 0 },
      { key: 'sides', label: 'Сторон обшивки', type: 'select', default: '1', options: [{ value: '1', label: '1 — обшивка стены' }, { value: '2', label: '2 — перегородка' }] },
      { key: 'layers', label: 'Слоёв ГКЛ', type: 'select', default: '1', options: [{ value: '1', label: '1 слой' }, { value: '2', label: '2 слоя' }] },
      { key: 'sheetW', label: 'Ширина листа', unit: 'м', min: 0.1, default: 1.2 },
      { key: 'sheetL', label: 'Длина листа', unit: 'м', min: 0.1, default: 2.5 },
      { key: 'step', label: 'Шаг стоек', unit: 'м', min: 0.1, default: 0.6 },
      { key: 'profL', label: 'Длина профиля', unit: 'м', min: 0.5, default: 3 },
      { key: 'screws', label: 'Саморезов на 1 м² листа', unit: 'шт', min: 0, default: 30, hint: 'Ваш расход или по техкарте производителя' },
      RESERVE,
    ],
    compute: ({ len, h, open, sides, layers, sheetW, sheetL, step, profL, screws, reserve }) => {
      const area = Math.max(len * h - open, 0);
      const sheetArea = area * Number(sides) * Number(layers);
      const sheets = ceil(withReserve(sheetArea / (sheetW * sheetL), reserve) - 1e-9);
      const guideM = 2 * len;
      const studs = ceil(len / step - 1e-9) + 1;
      const studM = studs * h;
      const guidePcs = ceil(withReserve(guideM, reserve) / profL - 1e-9);
      const studPcs = h <= profL ? ceil(withReserve(studs, reserve) - 1e-9) : ceil(withReserve(studM, reserve) / profL - 1e-9);
      const screwsN = ceil(sheetArea * screws - 1e-9);
      const insul = Number(sides) === 2 ? r(area, 2) : 0;
      return {
        rows: [
          { label: 'Листы ГКЛ', value: sheets, unit: 'шт', primary: true },
          { label: 'Направляющий профиль (ПН)', value: guidePcs, unit: `шт по ${profL} м` },
          { label: 'Стоечный профиль (ПС)', value: studPcs, unit: `шт по ${profL} м` },
          { label: 'Саморезы по ГКЛ', value: screwsN, unit: 'шт' },
          ...(insul ? [{ label: 'Утеплитель / звукоизоляция', value: insul, unit: 'м²' }] : []),
          { label: 'Площадь обшивки', value: r(sheetArea, 2), unit: 'м²' },
        ],
        formula: [
          `Sобшивки = (${len} × ${h} − ${open}) × ${sides} стор. × ${layers} сл. = ${r(sheetArea, 2)} м²`,
          `Листы = ${r(sheetArea, 2)} / (${sheetW} × ${sheetL}) + ${reserve}% → ${sheets} шт`,
          `ПН = 2 × ${len} = ${r(guideM, 2)} м; ПС = ${len}/${step} + 1 = ${studs} стоек по ${h} м`,
        ],
        warnings: ['Подвесы, дюбели, лента и шпаклёвка не включены — добавьте их отдельно при необходимости.'],
        suggestions: [
          { name: `Лист ГКЛ ${sheetW}×${sheetL}`, qty: sheets, unit: 'шт', type: 'material' },
          { name: `Профиль ПН ${profL} м`, qty: guidePcs, unit: 'шт', type: 'material' },
          { name: `Профиль ПС ${profL} м`, qty: studPcs, unit: 'шт', type: 'material' },
          { name: 'Саморезы по ГКЛ', qty: screwsN, unit: 'шт', type: 'material' },
          { name: Number(sides) === 2 ? 'Монтаж перегородки из ГКЛ' : 'Обшивка стен ГКЛ', qty: r(area, 2), unit: 'м²', type: 'work' },
        ],
      };
    },
  },
  {
    id: 'gkl-ceiling', group: 'Гипсокартон', title: 'Потолок из ГКЛ',
    description: 'Листы, профили, подвесы',
    fields: [
      { key: 'a', label: 'Длина помещения', unit: 'м', min: 0, default: 5 },
      { key: 'b', label: 'Ширина помещения', unit: 'м', min: 0, default: 4 },
      { key: 'sheetW', label: 'Ширина листа', unit: 'м', min: 0.1, default: 1.2 },
      { key: 'sheetL', label: 'Длина листа', unit: 'м', min: 0.1, default: 2.5 },
      { key: 'step', label: 'Шаг несущих профилей ПП', unit: 'м', min: 0.1, default: 0.6 },
      { key: 'hangStep', label: 'Шаг подвесов вдоль профиля', unit: 'м', min: 0.1, default: 0.8 },
      { key: 'profL', label: 'Длина профиля', unit: 'м', min: 0.5, default: 3 },
      { key: 'screws', label: 'Саморезов на 1 м²', unit: 'шт', min: 0, default: 30 },
      RESERVE,
    ],
    compute: ({ a, b, sheetW, sheetL, step, hangStep, profL, screws, reserve }) => {
      const area = a * b, per = 2 * (a + b);
      const sheets = ceil(withReserve(area / (sheetW * sheetL), reserve) - 1e-9);
      const rows = ceil(b / step - 1e-9) + 1;
      const ppM = rows * a;
      const hangers = rows * (ceil(a / hangStep - 1e-9) + 1);
      return {
        rows: [
          { label: 'Листы ГКЛ', value: sheets, unit: 'шт', primary: true },
          { label: 'Профиль ПП (несущий)', value: ceil(withReserve(ppM, reserve) / profL - 1e-9), unit: `шт по ${profL} м` },
          { label: 'Профиль ППН (по периметру)', value: ceil(withReserve(per, reserve) / profL - 1e-9), unit: `шт по ${profL} м` },
          { label: 'Подвесы', value: hangers, unit: 'шт' },
          { label: 'Саморезы по ГКЛ', value: ceil(area * screws - 1e-9), unit: 'шт' },
          { label: 'Площадь потолка', value: r(area, 2), unit: 'м²' },
        ],
        formula: [`S = ${a} × ${b} = ${r(area, 2)} м²`, `Рядов ПП = ${b}/${step} + 1 = ${rows}`, `Подвесы = ${rows} × (${a}/${hangStep} + 1) = ${hangers}`],
        warnings: ['Односоставной каркас. Соединители и дюбели добавьте отдельно.'],
        suggestions: [
          { name: `Лист ГКЛ ${sheetW}×${sheetL}`, qty: sheets, unit: 'шт', type: 'material' },
          { name: 'Подвес прямой', qty: hangers, unit: 'шт', type: 'material' },
          { name: 'Монтаж потолка из ГКЛ', qty: r(area, 2), unit: 'м²', type: 'work' },
        ],
      };
    },
  },
  // ---------- ОТДЕЛКА ----------
  {
    id: 'tile', group: 'Отделка', title: 'Плитка и клей',
    description: 'Количество плитки и мешков клея',
    fields: [
      { key: 'area', label: 'Площадь укладки', unit: 'м²', min: 0, default: 10 },
      { key: 'tw', label: 'Ширина плитки', unit: 'см', min: 1, default: 30 },
      { key: 'th', label: 'Длина плитки', unit: 'см', min: 1, default: 60 },
      { key: 'glue', label: 'Расход клея', unit: 'кг/м²', min: 0, default: '', optional: true, hint: 'По упаковке клея для вашего зуба шпателя. Пусто — клей не считаю' },
      { key: 'bag', label: 'Мешок клея', unit: 'кг', min: 1, default: 25 },
      { ...RESERVE, default: 10 },
    ],
    compute: ({ area, tw, th, glue, bag, reserve }) => {
      const one = (tw / 100) * (th / 100);
      const n = ceil(withReserve(area / one, reserve) - 1e-9);
      const g = area * glue;
      return {
        rows: [
          { label: 'Плитка', value: n, unit: 'шт', primary: true },
          { label: 'Плитка', value: r(n * one, 2), unit: 'м²' },
          ...(glue > 0 ? [{ label: 'Клей', value: r(g, 1), unit: 'кг' }, { label: 'Клей', value: ceil(g / bag - 1e-9), unit: 'мешков' }] : []),
        ],
        formula: [`Плитка = ${area} / (${tw / 100} × ${th / 100}) + ${reserve}% → ${n} шт`, ...(glue > 0 ? [`Клей = ${area} × ${glue} = ${r(g, 1)} кг`] : [])],
        warnings: [],
        suggestions: [
          { name: `Плитка ${tw}×${th}`, qty: r(n * one, 2), unit: 'м²', type: 'material' },
          ...(glue > 0 ? [{ name: `Плиточный клей (${bag} кг)`, qty: ceil(g / bag - 1e-9), unit: 'шт', type: 'material' as const }] : []),
          { name: 'Укладка плитки', qty: area, unit: 'м²', type: 'work' },
        ],
      };
    },
  },
  {
    id: 'wallpaper', group: 'Отделка', title: 'Обои',
    description: 'Количество рулонов с учётом раппорта',
    fields: [
      { key: 'per', label: 'Периметр стен под обои', unit: 'м', min: 0, default: 18, hint: 'Можно вычесть ширину дверей и окон' },
      { key: 'h', label: 'Высота оклейки', unit: 'м', min: 0, default: 2.7 },
      { key: 'rw', label: 'Ширина рулона', unit: 'м', min: 0.1, default: 1.06 },
      { key: 'rl', label: 'Длина рулона', unit: 'м', min: 1, default: 10.05 },
      { key: 'rap', label: 'Раппорт', unit: 'см', min: 0, default: 0 },
    ],
    compute: ({ per, h, rw, rl, rap }) => {
      const strip = h + rap / 100;
      const perRoll = Math.floor(rl / strip);
      const strips = ceil(per / rw - 1e-9);
      const w = perRoll < 1 ? ['Рулон короче одной полосы — проверьте длину рулона и высоту'] : [];
      const rolls = perRoll >= 1 ? ceil(strips / perRoll - 1e-9) : 0;
      return {
        rows: [{ label: 'Рулонов', value: rolls, unit: 'шт', primary: true }, { label: 'Полос', value: strips, unit: 'шт' }, { label: 'Полос из рулона', value: perRoll, unit: 'шт' }],
        formula: [`Полос = ${per} / ${rw} → ${strips}`, `Из рулона = ⌊${rl} / ${r(strip, 2)}⌋ = ${perRoll}`, `Рулонов = ${strips} / ${perRoll} → ${rolls}`],
        warnings: w,
        suggestions: [{ name: 'Обои', qty: rolls, unit: 'рулон', type: 'material' }, { name: 'Поклейка обоев', qty: r(per * h, 2), unit: 'м²', type: 'work' }],
      };
    },
  },
  {
    id: 'floor-packs', group: 'Отделка', title: 'Ламинат / панели МДФ и ПВХ (по упаковкам)',
    description: 'Количество упаковок или панелей по площади',
    fields: [
      { key: 'area', label: 'Площадь', unit: 'м²', min: 0, default: 20 },
      { key: 'pack', label: 'Площадь в упаковке (или одной панели)', unit: 'м²', min: 0.01, default: 2.131 },
      { ...RESERVE, default: 7 },
    ],
    compute: ({ area, pack, reserve }) => {
      const n = ceil(withReserve(area, reserve) / pack - 1e-9);
      return {
        rows: [{ label: 'Упаковок / панелей', value: n, unit: 'шт', primary: true }, { label: 'Покрытия', value: r(n * pack, 2), unit: 'м²' }],
        formula: [`N = ${area} × (1 + ${reserve}/100) / ${pack} → ${n}`],
        warnings: [],
        suggestions: [{ name: 'Покрытие (упаковка)', qty: n, unit: 'уп', type: 'material' }, { name: 'Укладка покрытия', qty: area, unit: 'м²', type: 'work' }],
      };
    },
  },
  {
    id: 'linoleum', group: 'Отделка', title: 'Линолеум',
    description: 'Погонные метры с рулона',
    fields: [
      { key: 'a', label: 'Длина комнаты', unit: 'м', min: 0, default: 5 },
      { key: 'b', label: 'Ширина комнаты', unit: 'м', min: 0, default: 3.5 },
      { key: 'rw', label: 'Ширина рулона', unit: 'м', min: 0.5, default: 4 },
      { key: 'allow', label: 'Припуск на подрезку', unit: 'см', min: 0, default: 10 },
    ],
    compute: ({ a, b, rw, allow }) => {
      const strips = ceil(b / rw - 1e-9);
      const len = strips * (a + allow / 100);
      return {
        rows: [{ label: 'Длина отреза', value: r(len, 2), unit: 'пог. м', primary: true }, { label: 'Площадь покупки', value: r(len * rw, 2), unit: 'м²' }, { label: 'Полос', value: strips, unit: 'шт' }],
        formula: [`Полос = ${b} / ${rw} → ${strips}`, `L = ${strips} × (${a} + ${allow / 100}) = ${r(len, 2)} м`],
        warnings: strips > 1 ? ['Потребуется стыковка полос'] : [],
        suggestions: [{ name: `Линолеум (рулон ${rw} м)`, qty: r(len * rw, 2), unit: 'м²', type: 'material' }, { name: 'Укладка линолеума', qty: r(a * b, 2), unit: 'м²', type: 'work' }],
      };
    },
  },
  {
    id: 'plinth', group: 'Отделка', title: 'Плинтусы, галтели, молдинги',
    description: 'Количество планок по периметру',
    fields: [
      { key: 'per', label: 'Периметр', unit: 'м', min: 0, default: 18 },
      { key: 'doors', label: 'Ширина дверных проёмов (сумма)', unit: 'м', min: 0, default: 0.8 },
      { key: 'piece', label: 'Длина планки', unit: 'м', min: 0.1, default: 2.5 },
      { ...RESERVE, default: 5 },
    ],
    compute: ({ per, doors, piece, reserve }) => {
      const len = Math.max(per - doors, 0);
      const n = ceil(withReserve(len, reserve) / piece - 1e-9);
      return {
        rows: [{ label: 'Планок', value: n, unit: 'шт', primary: true }, { label: 'Длина', value: r(len, 2), unit: 'м' }],
        formula: [`L = ${per} − ${doors} = ${r(len, 2)} м`, `N = ${r(len, 2)} × (1 + ${reserve}/100) / ${piece} → ${n}`],
        warnings: ['Углы и заглушки считаются отдельно'],
        suggestions: [{ name: `Плинтус/молдинг ${piece} м`, qty: n, unit: 'шт', type: 'material' }, { name: 'Монтаж плинтуса', qty: r(len, 2), unit: 'пог. м', type: 'work' }],
      };
    },
  },
  {
    id: 'self-level', group: 'Отделка', title: 'Наливной пол',
    description: 'Количество смеси по толщине слоя',
    fields: [
      { key: 'area', label: 'Площадь', unit: 'м²', min: 0, default: 20 },
      { key: 't', label: 'Толщина слоя', unit: 'мм', min: 0, default: 10 },
      { key: 'rate', label: 'Расход на 1 мм слоя', unit: 'кг/м²', min: 0, default: '', hint: 'Указан на мешке смеси' },
      { key: 'bag', label: 'Мешок', unit: 'кг', min: 1, default: 25 },
      RESERVE,
    ],
    compute: ({ area, t, rate, bag, reserve }) => {
      const kg = withReserve(area * t * rate, reserve);
      return {
        rows: [{ label: 'Мешков', value: ceil(kg / bag - 1e-9), unit: 'шт', primary: true }, { label: 'Смесь', value: r(kg, 1), unit: 'кг' }],
        formula: [`M = ${area} × ${t} × ${rate} × (1 + ${reserve}/100) = ${r(kg, 1)} кг`],
        warnings: [],
        suggestions: [{ name: `Смесь для наливного пола (${bag} кг)`, qty: ceil(kg / bag - 1e-9), unit: 'шт', type: 'material' }, { name: 'Устройство наливного пола', qty: area, unit: 'м²', type: 'work' }],
      };
    },
  },
  // ---------- ДРЕВЕСИНА ----------
  {
    id: 'lumber', group: 'Древесина', title: 'Доски и брус',
    description: 'Объём партии, количество и стоимость',
    fields: [
      { key: 't', label: 'Толщина', unit: 'мм', min: 1, default: 50 },
      { key: 'w', label: 'Ширина', unit: 'мм', min: 1, default: 150 },
      { key: 'l', label: 'Длина', unit: 'м', min: 0.1, default: 6 },
      { key: 'n', label: 'Количество', unit: 'шт', min: 0, default: 20, integer: true },
      { key: 'pm3', label: 'Цена за 1 м³', unit: '₽', min: 0, default: 0, optional: true },
    ],
    compute: ({ t, w, l, n, pm3 }) => {
      const one = (t / 1000) * (w / 1000) * l;
      const v = one * n;
      const inM3 = one > 0 ? 1 / one : 0;
      return {
        rows: [
          { label: 'Объём партии', value: r(v, 3), unit: 'м³', primary: true },
          { label: 'Объём одной штуки', value: r(one, 4), unit: 'м³' },
          { label: 'Штук в 1 м³', value: r(inM3, 1), unit: 'шт' },
          ...(pm3 ? [{ label: 'Стоимость партии', value: r(v * pm3, 2), unit: '₽' }] : []),
        ],
        formula: [`V₁ = ${t / 1000} × ${w / 1000} × ${l} = ${r(one, 4)} м³`, `V = ${r(one, 4)} × ${n} = ${r(v, 3)} м³`],
        warnings: [],
        suggestions: [{ name: `Пиломатериал ${t}×${w}×${l * 1000}`, qty: r(v, 3), unit: 'м³', type: 'material' }],
      };
    },
  },
  {
    id: 'logs', group: 'Древесина', title: 'Брёвна',
    description: 'Объём по формуле цилиндра',
    fields: [
      { key: 'd', label: 'Диаметр', unit: 'см', min: 1, default: 24 },
      { key: 'l', label: 'Длина', unit: 'м', min: 0.1, default: 6 },
      { key: 'n', label: 'Количество', unit: 'шт', min: 0, default: 10, integer: true },
      { key: 'pm3', label: 'Цена за 1 м³', unit: '₽', min: 0, default: 0, optional: true },
    ],
    compute: ({ d, l, n, pm3 }) => {
      const one = Math.PI * (d / 200) ** 2 * l;
      const v = one * n;
      return {
        rows: [
          { label: 'Объём', value: r(v, 3), unit: 'м³', primary: true },
          { label: 'Одно бревно', value: r(one, 4), unit: 'м³' },
          ...(pm3 ? [{ label: 'Стоимость', value: r(v * pm3, 2), unit: '₽' }] : []),
        ],
        formula: [`V₁ = π × (${d / 100}/2)² × ${l} = ${r(one, 4)} м³`, `V = ${r(one, 4)} × ${n} = ${r(v, 3)} м³`],
        warnings: ['Расчёт по цилиндру. Торговый объём кругляка по таблицам ГОСТ может отличаться.'],
        suggestions: [{ name: `Бревно Ø${d} см, ${l} м`, qty: r(v, 3), unit: 'м³', type: 'material' }],
      };
    },
  },

  // ---------- НОВЫЕ ----------
  {
    id: 'corners', group: 'Геометрия', title: 'Проверка прямого угла', short: 'Углы',
    description: 'Диагональ для разметки и проверки угла 90°',
    fields: [
      { key: 'a', label: 'Сторона A', unit: 'м', min: 0, default: 3 },
      { key: 'b', label: 'Сторона B', unit: 'м', min: 0, default: 4 },
      { key: 'c', label: 'Замер диагонали', unit: 'м', min: 0, default: '', optional: true, hint: 'Если уже замерили — покажу отклонение угла' },
    ],
    compute: ({ a, b, c }) => {
      const d = Math.sqrt(a * a + b * b);
      const rows: CalcResultRow[] = [{ label: 'Диагональ для прямого угла', value: r(d, 3), unit: 'м', primary: true }];
      const w: string[] = [];
      if (c > 0 && a > 0 && b > 0) {
        const cos = (a * a + b * b - c * c) / (2 * a * b);
        const ang = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
        rows.push({ label: 'Отклонение диагонали', value: r((c - d) * 1000, 0), unit: 'мм' });
        rows.push({ label: 'Фактический угол', value: r(ang, 2), unit: '°' });
        if (Math.abs(c - d) > 0.005) w.push(c > d ? 'Угол больше 90° — сведите стороны' : 'Угол меньше 90° — разведите стороны');
      }
      return { rows, formula: [`D = √(${a}² + ${b}²) = ${r(d, 3)} м`], warnings: w, suggestions: [] };
    },
  },
  {
    id: 'grout', group: 'Отделка', title: 'Затирка для швов плитки', short: 'Затирка',
    description: 'Расход затирки по размеру плитки и шва',
    fields: [
      { key: 'area', label: 'Площадь', unit: 'м²', min: 0, default: 10 },
      { key: 'l', label: 'Длина плитки', unit: 'см', min: 1, default: 60 },
      { key: 'w', label: 'Ширина плитки', unit: 'см', min: 1, default: 30 },
      { key: 't', label: 'Толщина плитки', unit: 'мм', min: 1, default: 8 },
      { key: 'j', label: 'Ширина шва', unit: 'мм', min: 0.5, default: 2 },
      { key: 'rho', label: 'Плотность затирки', unit: 'кг/дм³', min: 0.5, max: 3, default: 1.8, hint: 'Указана на упаковке, обычно 1,5–1,9' },
      { key: 'pack', label: 'Фасовка', unit: 'кг', min: 0.1, default: 2 },
      { ...RESERVE, default: 10 },
    ],
    compute: ({ area, l, w, t, j, rho, pack, reserve }) => {
      const L = l * 10, W = w * 10;
      const perM2 = ((L + W) / (L * W)) * t * j * rho;
      const kg = withReserve(perM2 * area, reserve);
      return {
        rows: [
          { label: 'Затирка', value: r(kg, 2), unit: 'кг', primary: true },
          { label: 'Упаковок', value: ceil(kg / pack - 1e-9), unit: 'шт' },
          { label: 'Расход на 1 м²', value: r(perM2, 3), unit: 'кг' },
        ],
        formula: [`Расход = (${L} + ${W}) / (${L} × ${W}) × ${t} × ${j} × ${rho} = ${r(perM2, 3)} кг/м²`, `Всего = ${r(perM2, 3)} × ${area} + ${reserve}% = ${r(kg, 2)} кг`],
        warnings: [],
        suggestions: [{ name: `Затирка (${pack} кг)`, qty: ceil(kg / pack - 1e-9), unit: 'шт', type: 'material' }, { name: 'Затирка швов', qty: area, unit: 'м²', type: 'work' }],
      };
    },
    priceRow: 1,
  },
  {
    id: 'slat-ceiling', group: 'Отделка', title: 'Реечный потолок', short: 'Реечный потолок',
    description: 'Рейки, траверсы, угол, подвесы',
    fields: [
      { key: 'a', label: 'Длина помещения', unit: 'м', min: 0, default: 3, hint: 'Вдоль реек' },
      { key: 'b', label: 'Ширина помещения', unit: 'м', min: 0, default: 2 },
      { key: 'sw', label: 'Ширина рейки', unit: 'см', min: 1, default: 10 },
      { key: 'sl', label: 'Длина рейки', unit: 'м', min: 0.5, default: 3 },
      { key: 'step', label: 'Шаг траверс', unit: 'м', min: 0.3, default: 1 },
      { key: 'tl', label: 'Длина траверсы', unit: 'м', min: 0.5, default: 4 },
      { ...RESERVE, default: 5 },
    ],
    compute: ({ a, b, sw, sl, step, tl, reserve }) => {
      const rows = ceil(b / (sw / 100) - 1e-9);
      const slatM = rows * a;
      const slats = ceil(withReserve(slatM, reserve) / sl - 1e-9);
      const trav = ceil(a / step - 1e-9) + 1;
      const travPcs = ceil((trav * b) / tl - 1e-9);
      const angle = ceil(withReserve(2 * (a + b), reserve) / 3 - 1e-9);
      const hangers = trav * (ceil(b / 1.2 - 1e-9) + 1);
      return {
        rows: [
          { label: 'Рейки', value: slats, unit: `шт по ${sl} м`, primary: true },
          { label: 'Траверсы (стрингеры)', value: travPcs, unit: `шт по ${tl} м` },
          { label: 'Пристенный угол', value: angle, unit: 'шт по 3 м' },
          { label: 'Подвесы', value: hangers, unit: 'шт' },
          { label: 'Площадь', value: r(a * b, 2), unit: 'м²' },
        ],
        formula: [`Рядов реек = ${b} / ${sw / 100} → ${rows}`, `Длина реек = ${rows} × ${a} = ${r(slatM, 2)} м`, `Траверс = ${a}/${step} + 1 = ${trav} рядов по ${b} м`],
        warnings: ['Подвесы — шаг вдоль траверсы до 1,2 м. Уточните по инструкции производителя.'],
        suggestions: [
          { name: `Рейка ${sw} см × ${sl} м`, qty: slats, unit: 'шт', type: 'material' },
          { name: `Траверса ${tl} м`, qty: travPcs, unit: 'шт', type: 'material' },
          { name: 'Монтаж реечного потолка', qty: r(a * b, 2), unit: 'м²', type: 'work' },
        ],
      };
    },
  },
  {
    id: 'paint', group: 'Отделка', title: 'Краска', short: 'Краска',
    description: 'Литры и банки по площади и слоям',
    fields: [
      { key: 'area', label: 'Площадь', unit: 'м²', min: 0, default: 40 },
      { key: 'layers', label: 'Слоёв', unit: 'шт', min: 1, max: 5, default: 2, integer: true },
      { key: 'rate', label: 'Расход на 1 слой', unit: 'л/м²', min: 0.01, default: '', hint: 'На банке: например «1 л на 8–10 м²» = 0,1–0,125' },
      { key: 'can', label: 'Объём банки', unit: 'л', min: 0.1, default: 2.5 },
      { ...RESERVE, default: 5 },
    ],
    compute: ({ area, layers, rate, can, reserve }) => {
      const l = withReserve(area * layers * rate, reserve);
      return {
        rows: [{ label: 'Краска', value: r(l, 2), unit: 'л', primary: true }, { label: 'Банок', value: ceil(l / can - 1e-9), unit: `шт по ${can} л` }],
        formula: [`V = ${area} × ${layers} × ${rate} + ${reserve}% = ${r(l, 2)} л`],
        warnings: [],
        suggestions: [{ name: `Краска (банка ${can} л)`, qty: ceil(l / can - 1e-9), unit: 'шт', type: 'material' }, { name: 'Окраска', qty: area, unit: 'м²', type: 'work' }],
      };
    },
    priceRow: 1,
  },

  // ---------- КРОВЛЯ И УТЕПЛЕНИЕ ----------
  {
    id: 'roof-gable', group: 'Кровля и утепление', title: 'Двускатная кровля', short: 'Кровля',
    description: 'Площадь скатов, листы, конёк',
    fields: [
      { key: 'L', label: 'Длина дома', unit: 'м', min: 0, default: 10 },
      { key: 'W', label: 'Ширина дома', unit: 'м', min: 0, default: 8 },
      { key: 'ang', label: 'Угол ската', unit: '°', min: 5, max: 60, default: 30 },
      { key: 'o', label: 'Свес', unit: 'м', min: 0, max: 1.5, default: 0.5, hint: 'Вынос кровли за стену с каждой стороны' },
      { key: 'sw', label: 'Полезная ширина листа', unit: 'м', min: 0.3, default: 1.1, hint: 'Металлочерепица ≈ 1,1 м, профнастил С-21 ≈ 1,0 м' },
      { key: 'screws', label: 'Саморезов на 1 м²', unit: 'шт', min: 0, default: 8 },
      { ...RESERVE, default: 5 },
    ],
    compute: ({ L, W, ang, o, sw, screws, reserve }) => {
      const rad = (ang * Math.PI) / 180;
      const slope = (W / 2 + o) / Math.cos(rad);
      const len = L + 2 * o;
      const area = 2 * len * slope;
      const perSlope = ceil(len / sw - 1e-9);
      const sheets = ceil(withReserve(perSlope * 2, reserve) - 1e-9);
      return {
        rows: [
          { label: 'Площадь кровли', value: r(area, 2), unit: 'м²', primary: true },
          { label: 'Листов', value: sheets, unit: 'шт' },
          { label: 'Длина листа (по скату)', value: r(slope + 0.05, 2), unit: 'м' },
          { label: 'Конёк', value: r(len, 2), unit: 'пог. м' },
          { label: 'Саморезы', value: ceil(area * screws - 1e-9), unit: 'шт' },
          { label: 'Высота конька над стеной', value: r((W / 2) * Math.tan(rad), 2), unit: 'м' },
        ],
        formula: [`Длина ската = (${W}/2 + ${o}) / cos ${ang}° = ${r(slope, 2)} м`, `S = 2 × ${r(len, 2)} × ${r(slope, 2)} = ${r(area, 2)} м²`, `Листов на скат = ${r(len, 2)} / ${sw} → ${perSlope}`],
        warnings: ['Длину листа заказывайте у поставщика по замеру скатов: при длинном скате листы делают составными.'],
        suggestions: [
          { name: 'Кровельный лист', qty: r(area, 2), unit: 'м²', type: 'material' },
          { name: 'Монтаж металлочерепицы', qty: r(area, 2), unit: 'м²', type: 'work' },
          { name: 'Коньковая планка', qty: ceil(len / 2 - 1e-9), unit: 'шт', type: 'material' },
        ],
      };
    },
  },
  {
    id: 'insulation', group: 'Кровля и утепление', title: 'Утеплитель', short: 'Утеплитель',
    description: 'Упаковки по площади и толщине',
    fields: [
      { key: 'area', label: 'Площадь утепления', unit: 'м²', min: 0, default: 50 },
      { key: 'need', label: 'Нужная толщина', unit: 'мм', min: 10, default: 150 },
      { key: 'sheet', label: 'Толщина плиты', unit: 'мм', min: 10, default: 50 },
      { key: 'pack', label: 'Площадь в упаковке', unit: 'м²', min: 0.1, default: 6, hint: 'Указана на упаковке для этой толщины' },
      { ...RESERVE, default: 5 },
    ],
    compute: ({ area, need, sheet, pack, reserve }) => {
      const layers = ceil(need / sheet - 1e-9);
      const m2 = withReserve(area * layers, reserve);
      const packs = ceil(m2 / pack - 1e-9);
      return {
        rows: [{ label: 'Упаковок', value: packs, unit: 'шт', primary: true }, { label: 'Слоёв', value: layers, unit: 'шт' }, { label: 'Объём', value: r((area * need) / 1000, 2), unit: 'м³' }],
        formula: [`Слоёв = ${need} / ${sheet} → ${layers}`, `Упаковок = ${area} × ${layers} + ${reserve}% / ${pack} → ${packs}`],
        warnings: [],
        suggestions: [{ name: `Утеплитель ${sheet} мм (упаковка)`, qty: packs, unit: 'уп', type: 'material' }, { name: 'Утепление', qty: area, unit: 'м²', type: 'work' }],
      };
    },
  },
  // ---------- ПОЛЫ И СТЕНЫ ----------
  {
    id: 'plaster', group: 'Полы и стены', title: 'Штукатурка стен', short: 'Штукатурка',
    description: 'Мешки смеси по толщине слоя',
    fields: [
      { key: 'area', label: 'Площадь стен', unit: 'м²', min: 0, default: 40 },
      { key: 't', label: 'Средняя толщина слоя', unit: 'мм', min: 1, default: 15 },
      { key: 'rate', label: 'Расход на 1 м² при слое 10 мм', unit: 'кг', min: 1, default: '', hint: 'С мешка: гипсовая ≈ 8–9 кг, цементная ≈ 15–17 кг' },
      { key: 'bag', label: 'Мешок', unit: 'кг', min: 1, default: 30 },
      { ...RESERVE, default: 5 },
    ],
    compute: ({ area, t, rate, bag, reserve }) => {
      const kg = withReserve(area * rate * (t / 10), reserve);
      return {
        rows: [{ label: 'Мешков', value: ceil(kg / bag - 1e-9), unit: 'шт', primary: true }, { label: 'Смесь', value: r(kg, 1), unit: 'кг' }],
        formula: [`M = ${area} × ${rate} × ${t}/10 + ${reserve}% = ${r(kg, 1)} кг`],
        warnings: [],
        suggestions: [{ name: `Штукатурка (мешок ${bag} кг)`, qty: ceil(kg / bag - 1e-9), unit: 'шт', type: 'material' }, { name: 'Штукатурка стен по маякам', qty: area, unit: 'м²', type: 'work' }],
      };
    },
  },
  {
    id: 'screed', group: 'Полы и стены', title: 'Стяжка пола', short: 'Стяжка',
    description: 'Объём раствора и мешки ЦПС',
    fields: [
      { key: 'area', label: 'Площадь пола', unit: 'м²', min: 0, default: 30 },
      { key: 't', label: 'Толщина стяжки', unit: 'мм', min: 10, default: 50 },
      { key: 'rate', label: 'Расход ЦПС на 1 м² при 10 мм', unit: 'кг', min: 1, default: 20, hint: 'С мешка, обычно 18–22 кг' },
      { key: 'bag', label: 'Мешок', unit: 'кг', min: 1, default: 40 },
      { ...RESERVE, default: 5 },
    ],
    compute: ({ area, t, rate, bag, reserve }) => {
      const kg = withReserve(area * rate * (t / 10), reserve);
      const v = (area * t) / 1000;
      return {
        rows: [{ label: 'Мешков ЦПС', value: ceil(kg / bag - 1e-9), unit: 'шт', primary: true }, { label: 'Смесь', value: r(kg, 0), unit: 'кг' }, { label: 'Объём стяжки', value: r(v, 2), unit: 'м³' }],
        formula: [`V = ${area} × ${t / 1000} = ${r(v, 2)} м³`, `M = ${area} × ${rate} × ${t}/10 + ${reserve}% = ${r(kg, 0)} кг`],
        warnings: t > 80 ? ['При толщине больше 80 мм выгоднее бетон или подсыпка керамзитом'] : [],
        suggestions: [{ name: `ЦПС (мешок ${bag} кг)`, qty: ceil(kg / bag - 1e-9), unit: 'шт', type: 'material' }, { name: 'Стяжка пола ЦПС', qty: area, unit: 'м²', type: 'work' }],
      };
    },
  },
  // ---------- ЭЛЕКТРИКА ----------
  {
    id: 'electric', group: 'Электрика', title: 'Электропроводка: кабель и коробки', short: 'Электрика',
    description: 'Длина кабеля по количеству точек',
    fields: [
      { key: 'sockets', label: 'Розеток', unit: 'шт', min: 0, default: 20, integer: true },
      { key: 'lights', label: 'Светильников', unit: 'шт', min: 0, default: 8, integer: true },
      { key: 'switches', label: 'Выключателей', unit: 'шт', min: 0, default: 6, integer: true },
      { key: 'dist', label: 'Средняя длина до точки', unit: 'м', min: 0.5, default: 6, hint: 'От щита или распаечной коробки, с подъёмами по стене' },
      { ...RESERVE, default: 10 },
    ],
    compute: ({ sockets, lights, switches, dist, reserve }) => {
      const pw = withReserve(sockets * dist, reserve);
      const lt = withReserve((lights + switches) * dist, reserve);
      return {
        rows: [
          { label: 'Кабель на розетки', value: ceil(pw - 1e-9), unit: 'м', primary: true },
          { label: 'Кабель на свет', value: ceil(lt - 1e-9), unit: 'м' },
          { label: 'Подрозетников', value: sockets + switches, unit: 'шт' },
          { label: 'Штробы (примерно)', value: ceil((pw + lt) * 0.7 - 1e-9), unit: 'м' },
        ],
        formula: [`Розетки: ${sockets} × ${dist} + ${reserve}% = ${r(pw, 1)} м`, `Свет: (${lights} + ${switches}) × ${dist} + ${reserve}% = ${r(lt, 1)} м`],
        warnings: ['Сечение кабеля и автоматы подбираются по нагрузке и ПУЭ. Обычно розетки — 2,5 мм², свет — 1,5 мм², но проверьте у электрика.'],
        suggestions: [
          { name: 'Кабель ВВГнг-LS 3×2,5', qty: ceil(pw - 1e-9), unit: 'м', type: 'material' },
          { name: 'Кабель ВВГнг-LS 3×1,5', qty: ceil(lt - 1e-9), unit: 'м', type: 'material' },
          { name: 'Монтаж розетки/выключателя', qty: sockets + switches, unit: 'шт', type: 'work' },
          { name: 'Монтаж светильника', qty: lights, unit: 'шт', type: 'work' },
          { name: 'Прокладка кабеля', qty: ceil(pw + lt - 1e-9), unit: 'пог. м', type: 'work' },
        ],
      };
    },
  },
  // ---------- НАРУЖНЫЕ СЕТИ ----------
  {
    id: 'septic', group: 'Наружные сети', title: 'Септик из бетонных колец', short: 'Септик',
    description: 'Объём и количество колец по числу жильцов',
    fields: [
      { key: 'people', label: 'Проживает человек', unit: 'чел', min: 1, default: 4, integer: true },
      { key: 'norm', label: 'Расход на человека', unit: 'л/сут', min: 50, default: 200 },
      { key: 'days', label: 'Запас суток', unit: 'сут', min: 1, default: 3, hint: 'Обычно объём септика берут на 3 суточных стока' },
      { key: 'd', label: 'Диаметр кольца', type: 'select', default: '1.5', options: [{ value: '1', label: 'КС-10 (1,0 м)' }, { value: '1.5', label: 'КС-15 (1,5 м)' }, { value: '2', label: 'КС-20 (2,0 м)' }] },
      { key: 'ch', label: 'Камер', type: 'select', default: '2', options: [{ value: '1', label: '1 камера' }, { value: '2', label: '2 камеры' }, { value: '3', label: '3 камеры' }] },
    ],
    compute: ({ people, norm, days, d, ch }) => {
      const V = (people * norm * days) / 1000;
      const dd = Number(d), cc = Number(ch);
      const ringV = Math.PI * (dd / 2) ** 2 * 0.9;
      const perCh = Math.max(ceil(V / cc / ringV - 1e-9), 2);
      return {
        rows: [
          { label: 'Колец всего', value: perCh * cc, unit: 'шт', primary: true },
          { label: 'Колец в камере', value: perCh, unit: 'шт' },
          { label: 'Нужный объём', value: r(V, 2), unit: 'м³' },
          { label: 'Объём одного кольца', value: r(ringV, 2), unit: 'м³' },
        ],
        formula: [`V = ${people} × ${norm} л × ${days} сут = ${r(V, 2)} м³`, `Кольцо = π × (${dd}/2)² × 0,9 = ${r(ringV, 2)} м³`, `В камеру: ${r(V / cc, 2)} / ${r(ringV, 2)} → ${perCh} (не меньше 2)`],
        warnings: ['Расчёт ориентировочный. Объём, тип очистки и расстояния до дома и колодца определяются по СП 32.13330 и проекту.'],
        suggestions: [
          { name: `Кольцо КС-${dd * 10}-9`, qty: perCh * cc, unit: 'шт', type: 'material' },
          { name: 'Монтаж колодезного кольца', qty: perCh * cc, unit: 'шт', type: 'work' },
          { name: 'Монтаж септика из бетонных колец', qty: 1, unit: 'компл', type: 'work' },
        ],
      };
    },
  },
  {
    id: 'well', group: 'Наружные сети', title: 'Колодец из колец', short: 'Колодец',
    description: 'Кольца по глубине и донный фильтр',
    fields: [
      { key: 'depth', label: 'Глубина колодца', unit: 'м', min: 1, default: 9 },
      { key: 'h', label: 'Высота кольца', unit: 'м', min: 0.3, default: 0.9 },
      { key: 'd', label: 'Диаметр кольца', unit: 'м', min: 0.7, default: 1 },
      { key: 'filter', label: 'Донный фильтр (щебень)', unit: 'см', min: 0, default: 20 },
    ],
    compute: ({ depth, h, d, filter }) => {
      const rings = ceil(depth / h - 1e-9);
      const fv = Math.PI * (d / 2) ** 2 * (filter / 100);
      return {
        rows: [{ label: 'Колец', value: rings, unit: 'шт', primary: true }, { label: 'Щебень на донный фильтр', value: r(fv, 2), unit: 'м³' }, { label: 'Объём выемки', value: r(Math.PI * ((d + 0.16) / 2) ** 2 * depth, 2), unit: 'м³' }],
        formula: [`Колец = ${depth} / ${h} → ${rings}`, `Фильтр = π × (${d}/2)² × ${filter / 100} = ${r(fv, 2)} м³`],
        warnings: ['Глубину определяет водоносный слой. Добавьте крышку и при необходимости домик.'],
        suggestions: [{ name: `Кольцо КС-${d * 10}-9`, qty: rings, unit: 'шт', type: 'material' }, { name: 'Копка колодца (одно кольцо)', qty: rings, unit: 'шт', type: 'work' }],
      };
    },
  },
  {
    id: 'drainage', group: 'Наружные сети', title: 'Дренаж участка', short: 'Дренаж',
    description: 'Труба, щебень, геотекстиль, колодцы',
    fields: [
      { key: 'len', label: 'Длина дренажа', unit: 'м', min: 0, default: 40 },
      { key: 'w', label: 'Ширина траншеи', unit: 'м', min: 0.2, default: 0.4 },
      { key: 'h', label: 'Глубина траншеи', unit: 'м', min: 0.3, default: 0.8 },
      { key: 'gh', label: 'Высота засыпки щебнем', unit: 'м', min: 0.1, default: 0.3 },
      { key: 'wells', label: 'Колодцев (повороты, перепады)', unit: 'шт', min: 0, default: 2, integer: true, hint: 'Обычно на каждом повороте и не реже чем через 30–50 м' },
      { ...RESERVE, default: 5 },
    ],
    compute: ({ len, w, h, gh, wells, reserve }) => {
      const dig = len * w * h;
      const gravel = withReserve(len * w * gh, reserve);
      const geo = withReserve(len * (2 * gh + 2 * w + 0.3), reserve);
      return {
        rows: [
          { label: 'Дренажная труба', value: ceil(withReserve(len, reserve) - 1e-9), unit: 'м', primary: true },
          { label: 'Щебень', value: r(gravel, 2), unit: 'м³' },
          { label: 'Геотекстиль', value: ceil(geo - 1e-9), unit: 'м²' },
          { label: 'Выемка грунта', value: r(dig, 2), unit: 'м³' },
          { label: 'Колодцы', value: wells, unit: 'шт' },
        ],
        formula: [`Грунт = ${len} × ${w} × ${h} = ${r(dig, 2)} м³`, `Щебень = ${len} × ${w} × ${gh} + ${reserve}% = ${r(gravel, 2)} м³`, `Геотекстиль = ${len} × (2×${gh} + 2×${w} + 0,3 нахлёст)`],
        warnings: ['Уклон трубы — не меньше 2–3 мм на метр в сторону сброса.'],
        suggestions: [
          { name: 'Труба дренажная в геотекстиле', qty: ceil(withReserve(len, reserve) - 1e-9), unit: 'м', type: 'material' },
          { name: 'Щебень', qty: r(gravel, 2), unit: 'м³', type: 'material' },
          { name: 'Устройство дренажа под ключ', qty: len, unit: 'пог. м', type: 'work' },
          ...(wells ? [{ name: 'Монтаж дренажного колодца', qty: wells, unit: 'шт', type: 'work' as const }] : []),
        ],
      };
    },
  },
  // ---------- БЛАГОУСТРОЙСТВО ----------
  {
    id: 'fence', group: 'Благоустройство', title: 'Забор из профлиста', short: 'Забор',
    description: 'Столбы, лаги, листы, бетон',
    fields: [
      { key: 'len', label: 'Длина забора', unit: 'м', min: 0, default: 50 },
      { key: 'gates', label: 'Ворота и калитки (ширина)', unit: 'м', min: 0, default: 5 },
      { key: 'h', label: 'Высота', unit: 'м', min: 1, max: 3.5, default: 2 },
      { key: 'step', label: 'Шаг столбов', unit: 'м', min: 1, max: 3.5, default: 2.5 },
      { key: 'rows', label: 'Рядов лаг', unit: 'шт', min: 2, max: 4, default: 2, integer: true, hint: 'При высоте больше 2 м — 3 ряда' },
      { key: 'sw', label: 'Полезная ширина листа', unit: 'м', min: 0.5, default: 1.15 },
      { key: 'depth', label: 'Заглубление столба', unit: 'м', min: 0.5, default: 1.2 },
    ],
    compute: ({ len, gates, h, step, rows, sw, depth }) => {
      const L = Math.max(len - gates, 0);
      const posts = ceil(L / step - 1e-9) + 1;
      const sheets = ceil(L / sw - 1e-9);
      const lag = rows * L;
      const holeV = Math.PI * 0.1 ** 2 * depth; // яма Ø200 мм
      return {
        rows: [
          { label: 'Листов профнастила', value: sheets, unit: `шт по ${h} м`, primary: true },
          { label: 'Столбов', value: posts, unit: `шт по ${r(h + depth + 0.1, 1)} м` },
          { label: 'Лаги', value: r(lag, 1), unit: 'м' },
          { label: 'Кровельные саморезы', value: sheets * rows * 4, unit: 'шт' },
          { label: 'Бетон на столбы (яма Ø200)', value: r(posts * holeV, 2), unit: 'м³' },
        ],
        formula: [`Длина без ворот = ${len} − ${gates} = ${r(L, 1)} м`, `Столбов = ${r(L, 1)} / ${step} + 1 = ${posts}`, `Листов = ${r(L, 1)} / ${sw} → ${sheets}`],
        warnings: [],
        suggestions: [
          { name: `Профнастил С-8 ${h} м`, qty: sheets, unit: 'шт', type: 'material' },
          { name: 'Труба профильная 60×60 (столб)', qty: posts, unit: 'шт', type: 'material' },
          { name: 'Труба профильная 40×20 (лага)', qty: r(lag, 1), unit: 'м', type: 'material' },
          { name: 'Забор из профлиста под ключ (работа)', qty: r(L, 1), unit: 'пог. м', type: 'work' },
        ],
      };
    },
  },
  {
    id: 'paving', group: 'Благоустройство', title: 'Тротуарная плитка', short: 'Тротуарная плитка',
    description: 'Плитка, песок, щебень, бордюр',
    fields: [
      { key: 'area', label: 'Площадь', unit: 'м²', min: 0, default: 30 },
      { key: 'sand', label: 'Слой песка', unit: 'см', min: 0, default: 5 },
      { key: 'gravel', label: 'Слой щебня', unit: 'см', min: 0, default: 15, hint: 'Для парковки авто — 20–30 см' },
      { key: 'curb', label: 'Длина бордюра', unit: 'м', min: 0, default: 22, hint: 'Периметр площадки без примыканий к дому' },
      { ...RESERVE, default: 5 },
    ],
    compute: ({ area, sand, gravel, curb, reserve }) => {
      const tiles = withReserve(area, reserve);
      const sv = withReserve(area * sand / 100, reserve);
      const gv = withReserve(area * gravel / 100, reserve);
      return {
        rows: [
          { label: 'Плитка', value: r(tiles, 2), unit: 'м²', primary: true },
          { label: 'Песок', value: r(sv, 2), unit: 'м³' },
          { label: 'Щебень', value: r(gv, 2), unit: 'м³' },
          { label: 'Бордюр (по 1 м)', value: ceil(curb - 1e-9), unit: 'шт' },
          { label: 'Выемка грунта', value: r(area * (sand + gravel + 6) / 100, 2), unit: 'м³' },
        ],
        formula: [`Песок = ${area} × ${sand / 100} + ${reserve}% = ${r(sv, 2)} м³`, `Щебень = ${area} × ${gravel / 100} + ${reserve}% = ${r(gv, 2)} м³`, 'Выемка = площадь × (песок + щебень + 6 см плитка)'],
        warnings: [],
        suggestions: [
          { name: 'Тротуарная плитка', qty: r(tiles, 2), unit: 'м²', type: 'material' },
          { name: 'Песок', qty: r(sv, 2), unit: 'м³', type: 'material' },
          { name: 'Щебень', qty: r(gv, 2), unit: 'м³', type: 'material' },
          { name: 'Укладка тротуарной плитки (с основанием)', qty: area, unit: 'м²', type: 'work' },
          ...(curb > 0 ? [{ name: 'Монтаж бордюра', qty: curb, unit: 'пог. м', type: 'work' as const }] : []),
        ],
      };
    },
  },
];


const SHORT: Record<string, string> = {
  'area-rect': 'Площадь', 'area-multi': 'Площадь участков', room: 'Комната', 'volume-box': 'Объём', 'volume-cyl': 'Объём цилиндра',
  trench: 'Котлован', 'concrete-slab': 'Бетонная плита', 'strip-foundation': 'Фундамент', 'mix-recipe': 'Раствор и бетон', brick: 'Кирпич',
  'gkl-wall': 'Гипсокартон', 'gkl-ceiling': 'Потолок ГКЛ', tile: 'Плитка', wallpaper: 'Обои', 'floor-packs': 'Ламинат и панели',
  linoleum: 'Линолеум', plinth: 'Плинтус', 'self-level': 'Наливной пол', lumber: 'Доски и брус', logs: 'Брёвна',
};
const PRICE_ROW: Record<string, number> = { tile: 1, 'floor-packs': 0, wallpaper: 0 };
CALCULATORS.forEach((c) => { c.short ||= SHORT[c.id]; if (c.priceRow == null && PRICE_ROW[c.id] != null) c.priceRow = PRICE_ROW[c.id]; });


export const getCalculator = (id: string) => CALCULATORS.find((c) => c.id === id);
