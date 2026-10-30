/**
 * Готовые сметы под ключ по типовым объектам: собираются теми же мастерами, что и «Новая смета»,
 * поэтому у работ — цены из справочника, у материалов — ориентировочные цены.
 * Комплексные (квартира, санузел) — несколько мастеров подряд, одинаковые строки складываются.
 */
import { MASTERS } from './masters';
import { STARTER_PRICES } from './starterPrices';
const SP = new Map(STARTER_PRICES.map((p) => [p.name, p]));
/** Работа из справочника: цена и единица оттуда (ошибка, если названия нет) */
const W = (category: string, name: string, qty: number): ReadyLine => {
  const s = SP.get(name);
  if (!s) throw new Error(`Нет в справочнике: ${name}`);
  return { name, qty, unit: s.unit, type: s.category === 'Аренда техники' ? 'equipment' : 'work', category, price: s.price };
};
const MAT = (category: string, name: string, qty: number, unit: string, price: number): ReadyLine =>
  ({ name, qty, unit, type: 'material', category: `${category}: материалы`, price, note: 'Ориентировочная цена — проверьте у поставщика' });

type T = 'work' | 'material' | 'equipment' | 'service' | 'other';
export interface ReadyLine { name: string; qty: number; unit: string; type: T; category: string; price?: number; composition?: string; note?: string }
export interface ReadyTemplate { id: string; group: string; title: string; description: string; lines: ReadyLine[] }

const M = new Map(MASTERS.map((m) => [m.id, m]));

/** Строки мастера с параметрами по умолчанию + свои значения */
export function masterLines(id: string, values: Record<string, any> = {}): ReadyLine[] {
  const m = M.get(id);
  if (!m) throw new Error(`Нет мастера ${id}`);
  const v: Record<string, any> = {};
  for (const f of m.fields) v[f.key] = f.default;
  Object.assign(v, values);
  return m.build(v).lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, type: l.type as T, category: l.category, price: l.price, composition: l.composition, note: l.note }));
}

/** Работы, которые разные мастера считают каждый у себя (люстры есть и в электрике, и в натяжных потолках) — оставляем одну строку */
const ONCE = ['Монтаж люстры', 'Опрессовка системы'];
/** Несколько мастеров подряд: одинаковые позиции складываются, доставка — не больше 3 рейсов */
function combo(parts: [string, Record<string, any>][], extra: ReadyLine[] = []): ReadyLine[] {
  const out: ReadyLine[] = [];
  for (const [id, v] of parts) {
    for (const l of masterLines(id, v)) {
      const same = out.find((x) => x.name === l.name && x.unit === l.unit && x.type === l.type && x.price === l.price && x.category === l.category);
      if (same) same.qty = Math.round((same.qty + l.qty) * 100) / 100;
      else out.push({ ...l });
    }
  }
  for (const l of extra) out.push({ ...l });
  for (const l of out) if (/^Доставка материалов/.test(l.name)) l.qty = Math.min(l.qty, 3);
  // дубли между разделами: оставляем строку с большим количеством
  for (const name of ONCE) {
    const same = out.filter((l) => l.name === name && l.type === 'work');
    if (same.length > 1) {
      const keep = same.reduce((a, b) => (b.qty > a.qty ? b : a));
      for (const l of same) if (l !== keep) out.splice(out.indexOf(l), 1);
    }
  }
  return out;
}

const one = (id: string, group: string, title: string, description: string, master: string, v: Record<string, any> = {}): ReadyTemplate =>
  ({ id, group, title, description, get lines() { return masterLines(master, v); } } as ReadyTemplate);
const many = (id: string, group: string, title: string, description: string, parts: [string, Record<string, any>][], extra: () => ReadyLine[] = () => []): ReadyTemplate =>
  ({ id, group, title, description, get lines() { return combo(parts, extra()); } } as ReadyTemplate);

export const READY_TEMPLATES: ReadyTemplate[] = [
  // ---------- Квартира под ключ ----------
  many('flat1-turnkey', 'Квартира', 'Однокомнатная квартира 35 м² под ключ', 'Демонтаж, электрика, сантехника, санузел в плитке, стены под покраску, ламинат, натяжные потолки, двери', [
    ['m-demo', { obj: 'flat', floor: 35, wallsTile: 18, floorTile: 4, doors: 2 }],
    ['m-electric', { obj: 'flat', area: 35, rooms: 3 }],
    ['m-plumb', { kitchen: 1, baths: 1, install: 1, sinks: 1 }],
    ['m-tile', { obj: 'bath', floor: 3.5, walls: 20 }],
    ['m-finish', { L: 4.5, W: 3.6, H: 2.7, rooms: 2, walls: 'paint', level: 'plaster', ceil: 'none' }],
    ['m-floor', { area: 31, per: 40, rooms: 3, base: 'self', cover: 'laminate' }],
    ['m-stretch', { area: 32, per: 46, rooms: 3, spots: 10, chand: 2 }],
    ['m-windows', { kind: 'interior', wn: 0, di: 2, demo: 'no' }],
  ]),
  many('flat2-turnkey', 'Квартира', 'Двухкомнатная квартира 55 м² под ключ', 'Полный ремонт: демонтаж, инженерия, санузел, отделка, полы, потолки, двери', [
    ['m-demo', { obj: 'flat', floor: 55, wallsTile: 22, floorTile: 5, doors: 3 }],
    ['m-electric', { obj: 'flat', area: 55, rooms: 5 }],
    ['m-plumb', { kitchen: 1, baths: 1, install: 1, sinks: 1 }],
    ['m-tile', { obj: 'bath', floor: 4, walls: 22 }],
    ['m-finish', { L: 4.5, W: 3.8, H: 2.7, rooms: 3, walls: 'paint', level: 'plaster', ceil: 'none' }],
    ['m-floor', { area: 50, per: 62, rooms: 5, base: 'self', cover: 'laminate' }],
    ['m-stretch', { area: 51, per: 72, rooms: 5, spots: 16, chand: 3 }],
    ['m-windows', { kind: 'interior', wn: 0, di: 3, demo: 'no' }],
  ]),
  many('newbuild-45', 'Квартира', 'Новостройка 45 м²: ремонт под покраску', 'Без демонтажа: электрика, разводка воды, стяжка, штукатурка, санузел, ламинат', [
    ['m-electric', { obj: 'flat', area: 45, rooms: 4, wall: 'concrete' }],
    ['m-plumb', { kitchen: 1, baths: 1, install: 1, sinks: 1 }],
    ['m-tile', { obj: 'bath', floor: 4, walls: 22, prep: 'both' }],
    ['m-finish', { L: 4.5, W: 3.8, H: 2.7, rooms: 2, walls: 'paint', level: 'plaster', ceil: 'stretch' }],
    ['m-floor', { area: 41, per: 50, rooms: 4, base: 'semi', cover: 'laminate' }],
  ]),
  many('bath-turnkey', 'Квартира', 'Санузел под ключ 4 м²', 'Демонтаж, разводка, инсталляция, гидроизоляция, плитка, натяжной потолок', [
    ['m-demo', { obj: 'bath' }],
    ['m-plumb', { toilets: 0, install: 1, sinks: 1, baths: 1, kitchen: 0, washer: 'yes', rail: 'yes' }],
    ['m-tile', { obj: 'bath', floor: 4, walls: 22, hydro: 'yes', hatch: 1, corners: 4 }],
    ['m-stretch', { area: 4, per: 8, rooms: 1, spots: 4, chand: 0, pipes: 1, canvas: 'gloss' }],
  ]),
  many('shower-room', 'Квартира', 'Душевая с трапом вместо ванны', 'Трап, гидроизоляция, плитка, инсталляция и раковина', [
    ['m-plumb', { toilets: 0, install: 1, sinks: 1, baths: 0, cabins: 0, drains: 1, kitchen: 0, washer: 'no' }],
    ['m-tile', { obj: 'bath', floor: 3.5, walls: 20, drain: 'yes', hydro: 'yes', fmt: 'big' }],
  ]),
  one('toilet-room', 'Квартира', 'Туалет 1,5 м² в плитке', 'Плитка пола и стен, гидроизоляция, люк', 'm-tile', { obj: 'bath', floor: 1.5, walls: 10, hatch: 1 }),
  one('kitchen-apron', 'Квартира', 'Кухонный фартук 3 м²', 'Плитка «кабанчик» или керамогранит, подготовка стены', 'm-tile', { obj: 'apron', apron: 3, floor: 0, walls: 0, hydro: 'no' }),
  many('room-cosmetic', 'Квартира', 'Косметический ремонт комнаты 18 м²', 'Снять обои, шпаклёвка, новые обои, покраска потолка, ламинат', [
    ['m-finish', { L: 5, W: 3.6, H: 2.7, walls: 'wallpaper', level: 'putty', ceil: 'paint', demo: 'wallpaper' }],
    ['m-floor', { area: 18, per: 17, rooms: 1, base: 'none', cover: 'laminate', demo: 'soft' }],
  ]),
  one('room-paint', 'Квартира', 'Комната 20 м² под покраску', 'Штукатурка по маякам, шпаклёвка, покраска, натяжной потолок', 'm-finish', { L: 5, W: 4, H: 2.7, walls: 'paint', level: 'plaster', ceil: 'stretch', cornice: 'yes' }),
  one('stretch-flat', 'Квартира', 'Натяжные потолки в двушку 50 м²', '5 помещений, светильники, люстры, обходы труб', 'm-stretch', { area: 50, per: 72, rooms: 5, spots: 16, chand: 3, pipes: 2 }),
  one('demo-flat', 'Квартира', 'Демонтаж квартиры 45 м²', 'Плитка, обои, полы, двери, сантехника, вынос мусора', 'm-demo', { obj: 'flat' }),
  one('demo-bath', 'Квартира', 'Демонтаж санузла', 'Плитка, сантехника, вынос и вывоз мусора', 'm-demo', { obj: 'bath' }),
  one('handy-move', 'Квартира', 'Мастер на час: заезд в новую квартиру', 'Полки, карнизы, телевизор, мебель, люстры', 'm-handy', { hang: 6, cornice: 3, tv: 1, furn: 3, lamps: 3 }),

  // ---------- Коммерция ----------
  many('office-60', 'Коммерция', 'Офис 60 м² под ключ', 'Перегородки ГКЛ, электрика и интернет, Армстронг, коммерческий линолеум, кондиционеры', [
    ['m-gkl', { kind: 'part', len: 12, h: 2.8, doors: 3 }],
    ['m-electric', { obj: 'flat', area: 60, rooms: 4, wall: 'gkl', stove: 'no' }],
    ['m-finish', { L: 7.5, W: 4, H: 2.8, rooms: 2, walls: 'paint', level: 'putty', ceil: 'none' }],
    ['m-ac', { s35: 2 }],
    ['m-windows', { kind: 'interior', wn: 0, di: 3, demo: 'no' }],
  ], () => [
    W('Потолки', 'Монтаж подвесного потолка Армстронг', 60), W('Потолки', 'Монтаж светильника-панели 600×600', 14),
    MAT('Потолки', 'Потолок Армстронг (плита + подвесная система)', 63, 'м²', 520), MAT('Потолки', 'Светильник-панель 600×600 LED', 14, 'шт', 1300),
    W('Полы', 'Укладка коммерческого линолеума со сваркой швов', 60), MAT('Полы', 'Линолеум коммерческий (+7%)', 64, 'м²', 950),
    W('Слаботочка', 'Прокладка слаботочной сети (интернет, СКС)', 120), W('Слаботочка', 'Монтаж розетки RJ45', 10),
    MAT('Слаботочка', 'Кабель UTP cat.5e', 130, 'м', 28), MAT('Слаботочка', 'Розетка RJ45', 10, 'шт', 350),
    W('Безопасность', 'Монтаж аварийного освещения (светильник «Выход»)', 3), MAT('Безопасность', 'Светильник «Выход» с аккумулятором', 3, 'шт', 1500),
  ]),
  many('shop-40', 'Коммерция', 'Магазин 40 м² под ключ', 'Отделка, керамогранит, освещение, витринный вход, вывеска, видеонаблюдение', [
    ['m-electric', { obj: 'flat', area: 40, rooms: 2, wall: 'brick', stove: 'no', spots: 12 }],
    ['m-finish', { L: 8, W: 5, H: 3, rooms: 1, walls: 'paint', level: 'plaster', ceil: 'none' }],
    ['m-windows', { kind: 'entrance', wn: 0, de: 1 }],
  ], () => [
    W('Полы', 'Укладка керамогранита 60×60 на пол', 40), MAT('Полы', 'Керамогранит 60×60 (+8%)', 44, 'м²', 1400), MAT('Полы', 'Клей для керамогранита C2 (25 кг)', 12, 'меш', 1210),
    W('Потолки', 'Монтаж потолка Грильято', 40), MAT('Потолки', 'Потолок Грильято (комплект)', 42, 'м²', 1100),
    W('Фасад и вход', 'Монтаж вывески', 1), W('Безопасность', 'Монтаж видеокамеры', 4), MAT('Безопасность', 'Видеокамера + регистратор (комплект на 4)', 1, 'компл', 18000),
    W('Оборудование', 'Подключение торгового и кухонного оборудования', 4),
    W('Безопасность', 'Монтаж аварийного освещения (светильник «Выход»)', 2), MAT('Безопасность', 'Светильник «Выход» с аккумулятором', 2, 'шт', 1500),
  ]),
  many('cafe-80', 'Коммерция', 'Кафе 80 м²: зал и кухня', 'Кухня в плитке с трапами, вытяжной зонт и вентиляция, жироуловитель, зал, санузел', [
    ['m-tile', { obj: 'bath', floor: 20, walls: 50, drain: 'yes', hydro: 'yes' }],
    ['m-plumb', { toilets: 0, install: 1, sinks: 3, baths: 0, kitchen: 2, washer: 'no', dish: 'yes', rail: 'no' }],
    ['m-electric', { obj: 'flat', area: 80, rooms: 4, stove: 'yes', spots: 20 }],
    ['m-finish', { L: 10, W: 5.5, H: 3, rooms: 1, walls: 'decor', level: 'plaster', ceil: 'none' }],
    ['m-ac', { s35: 0, s7: 2, fans: 2 }],
  ], () => [
    W('Кухня', 'Монтаж кухонного зонта', 1), W('Кухня', 'Монтаж воздуховода', 15), W('Кухня', 'Монтаж вентиляционного выхода на кровлю', 1),
    MAT('Кухня', 'Зонт вытяжной нержавеющий', 1, 'шт', 38000), MAT('Кухня', 'Воздуховод оцинкованный с фасонными частями', 15, 'м', 1800),
    W('Кухня', 'Монтаж приточной установки', 1), MAT('Кухня', 'Приточная установка', 1, 'шт', 95000),
    W('Кухня', 'Монтаж жироуловителя', 1), MAT('Кухня', 'Жироуловитель под мойку', 1, 'шт', 22000),
    W('Кухня', 'Монтаж производственной мойки', 2), W('Кухня', 'Подключение торгового и кухонного оборудования', 6),
    W('Зал', 'Укладка керамогранита 60×60 на пол', 55), MAT('Зал', 'Керамогранит 60×60 (+8%)', 60, 'м²', 1400), MAT('Зал', 'Клей для керамогранита C2 (25 кг)', 16, 'меш', 1210),
    W('Зал', 'Монтаж потолка Грильято', 55), MAT('Зал', 'Потолок Грильято (комплект)', 58, 'м²', 1100),
    W('Безопасность', 'Монтаж противопожарной двери', 1), MAT('Безопасность', 'Дверь противопожарная EI60', 1, 'шт', 24000),
    W('Безопасность', 'Монтаж аварийного освещения (светильник «Выход»)', 4), MAT('Безопасность', 'Светильник «Выход» с аккумулятором', 4, 'шт', 1500),
  ]),
  many('salon-50', 'Коммерция', 'Салон красоты 50 м²', 'Перегородки, мойки для мастеров, электрика под оборудование, отделка, кондиционер', [
    ['m-gkl', { kind: 'part', len: 8, h: 2.8, doors: 2, board: 'moist' }],
    ['m-plumb', { toilets: 0, install: 1, sinks: 3, baths: 0, kitchen: 0, washer: 'yes', rail: 'no' }],
    ['m-electric', { obj: 'flat', area: 50, rooms: 4, wall: 'gkl', stove: 'no', spots: 16 }],
    ['m-finish', { L: 6, W: 4, H: 2.8, rooms: 2, walls: 'paint', level: 'putty', ceil: 'stretch' }],
    ['m-ac', { s35: 1, fans: 1 }],
  ], () => [
    W('Полы', 'Укладка керамогранита 60×60 на пол', 50), MAT('Полы', 'Керамогранит 60×60 (+8%)', 54, 'м²', 1400), MAT('Полы', 'Клей для керамогранита C2 (25 кг)', 14, 'меш', 1210),
    W('Фасад и вход', 'Монтаж вывески', 1),
  ]),

  // ---------- Полы, стены, потолки ----------
  one('laminate-50', 'Полы и стены', 'Ламинат 50 м² с выравниванием', 'Наливной пол, подложка, ламинат, плинтус, пороги', 'm-floor', { area: 50, per: 45, rooms: 4, base: 'self', cover: 'laminate' }),
  one('spc-40', 'Полы и стены', 'Кварцвинил 40 м²', 'Наливной пол и замковый кварцвинил', 'm-floor', { area: 40, per: 36, rooms: 3, base: 'self', cover: 'spc' }),
  one('screed-100', 'Полы и стены', 'Полусухая стяжка 100 м²', 'Машинная стяжка с фиброй и демпферной лентой', 'm-floor', { area: 100, per: 70, rooms: 6, base: 'semi', cover: 'none' }),
  one('warm-floor-80', 'Полы и стены', 'Водяной тёплый пол 80 м²', 'Утеплитель, труба, коллектор, стяжка', 'm-floor', { area: 80, per: 50, rooms: 4, base: 'cps', heat: 'water', cover: 'none' }),
  one('gkl-partition', 'Полы и стены', 'Перегородка из ГКЛ 5 м с дверью', 'Каркас, звукоизоляция, 2 стороны, шпаклёвка стыков', 'm-gkl', { kind: 'part', len: 5, h: 2.7 }),
  one('gkl-ceil2', 'Полы и стены', 'Двухуровневый потолок ГКЛ 18 м²', 'Каркас, короб под подсветку, шпаклёвка', 'm-gkl', { kind: 'ceil2', len: 5, h: 3.6 }),

  // ---------- Инженерия ----------
  one('electric-flat', 'Инженерия', 'Электрика в двушке 55 м²', 'Щит, кабель, штробы, розетки, выключатели, свет', 'm-electric', { obj: 'flat', area: 55, rooms: 5 }),
  one('electric-house', 'Инженерия', 'Электрика дома 120 м²', 'Ввод, счётчик, заземление, щит, проводка, уличный свет', 'm-electric', { obj: 'house', area: 120, rooms: 8, wall: 'wood', input: 'yes', ground: 'yes', street: 4 }),
  one('plumb-flat', 'Инженерия', 'Сантехника квартиры', 'Разводка воды и канализации, инсталляция, ванна, мойка, фильтры', 'm-plumb'),
  one('heat-gas-150', 'Инженерия', 'Отопление дома 150 м² на газе', 'Котёл, бойлер, обвязка, радиаторы', 'm-heat', { area: 150, rooms: 10, src: 'gaswall' }),
  one('heat-el-80', 'Инженерия', 'Отопление электрокотлом 80 м²', 'Электрокотёл, радиаторы, разводка', 'm-heat', { area: 80, rooms: 5, src: 'electric', boiler: 'no' }),
  one('ac-2', 'Инженерия', 'Две сплит-системы под ключ', 'Кондиционеры, трассы, монтаж', 'm-ac', { s35: 2 }),
  one('septic-bio5', 'Инженерия', 'Станция биоочистки на 5 человек', 'Станция, котлован, трубы до дома, утепление', 'm-septic', { type: 'bio', people: 5 }),
  one('septic-rings', 'Инженерия', 'Септик из колец на 4 человека', 'Кольца, котлован, трубы, засыпка', 'm-septic', { type: 'rings', people: 4 }),
  one('well-sand', 'Инженерия', 'Скважина на песок с кессоном', 'Бурение 30 м, кессон, насос, вода в дом', 'm-well', { src: 'sand', depth: 30 }),
  one('well-lime', 'Инженерия', 'Скважина на известняк 60 м', 'Бурение, кессон, насос, водопровод до дома', 'm-well', { src: 'lime', depth: 60, filter: 'yes' }),

  // ---------- Дом ----------
  one('found-slab', 'Дом', 'Монолитная плита 10×10', 'Подушка, утепление, арматура, бетон', 'm-found', { type: 'slab', L: 10, W: 10 }),
  one('found-screw', 'Дом', 'Винтовые сваи под баню 6×4', 'Сваи, оголовки, обвязка', 'm-found', { type: 'screw', L: 6, W: 4 }),
  one('found-pile', 'Дом', 'Буронабивные сваи с ростверком 10×8', 'Бурение, арматура, бетон, ростверк', 'm-found', { type: 'pile', L: 10, W: 8 }),
  one('walls-gas', 'Дом', 'Коробка из газобетона 10×8', 'Кладка, перемычки, армопояс', 'm-mason', { mat: 'gas', P: 36, H: 3, floors: 1 }),
  one('walls-brick2', 'Дом', 'Кирпичный дом в 2 этажа', 'Кладка в 1,5 кирпича, перемычки, армопояс', 'm-mason', { mat: 'brick15', P: 40, H: 3, floors: 2, open: 28 }),
  one('roof-gable', 'Дом', 'Крыша 10×8 под ключ с утеплением', 'Стропила, мембраны, металлочерепица, утепление 200, водосток', 'm-roof', { shape: 'gable', ins: '200' }),
  one('roof-soft-hip', 'Дом', 'Вальмовая мягкая кровля 10×10', 'Стропила, ОСП, гибкая черепица, водосток', 'm-roof', { shape: 'hip', L: 10, W: 10, cover: 'soft' }),
  one('roof-replace', 'Дом', 'Замена кровли 10×8 на профнастил', 'Демонтаж старой, мембрана, профнастил, водосток', 'm-roof', { shape: 'gable', cover: 'prof', rafters: 'exist', demo: 'yes', debris: 'yes' }),
  one('facade-wet', 'Дом', 'Мокрый фасад с утеплением 150 мм', 'Минвата, армирование, декоративная штукатурка, леса', 'm-facade', { sys: 'wetmv', ins: '150' }),
  one('facade-siding', 'Дом', 'Сайдинг с утеплением', 'Подсистема, утеплитель, ветрозащита, сайдинг', 'm-facade', { sys: 'siding', ins: '50' }),
  one('house-frame', 'Дом', 'Каркасный дом 8×6', 'От свай до кровли и фасада', 'm-house', { type: 'house' }),
  one('house-frame-2', 'Дом', 'Каркасный дом 10×8 в 2 этажа', 'Свайный фундамент, каркас, утепление 200, кровля', 'm-house', { type: 'house', L: 10, W: 8, fl: '2', ins: '200' }),
  one('bath-frame', 'Дом', 'Каркасная баня 6×4', 'Фундамент, каркас, утепление, печь', 'm-house', { type: 'bathf', L: 6, W: 4 }),
  one('bath-timber', 'Дом', 'Баня из бруса 6×5', 'Сруб из бруса, кровля, печь', 'm-house', { type: 'bathb', L: 6, W: 5 }),
  one('windows-flat', 'Дом', 'Пластиковые окна в квартиру: 3 шт', 'Демонтаж, монтаж, откосы, подоконники, отливы', 'm-windows', { kind: 'windows' }),
  one('doors-4', 'Дом', 'Межкомнатные двери: 4 шт', 'Двери с коробкой, наличники, доборы', 'm-windows', { kind: 'interior', wn: 0, di: 4, dobor: 'yes' }),
  one('door-entrance', 'Дом', 'Входная дверь с откосами', 'Демонтаж старой, монтаж, откосы', 'm-windows', { kind: 'entrance', wn: 0, de: 1 }),
  one('balcony-warm', 'Дом', 'Тёплая лоджия 3 м под ключ', 'Тёплое остекление, утепление, вагонка, ламинат, свет', 'm-balcony', { glaze: 'warm' }),
  one('balcony-cold', 'Дом', 'Холодное остекление балкона', 'Алюминиевые рамы без утепления', 'm-balcony', { glaze: 'cold', type: 'balcony', warm: 'no', finish: 'none', floorF: 'none', lights: 0 }),

  // ---------- Участок ----------
  one('paving-yard', 'Участок', 'Двор из брусчатки 80 м² под авто', 'Выемка, щебень, песок, брусчатка, бордюр', 'm-paving', { area: 80, use: 'car', cover: 'paver' }),
  one('paving-paths', 'Участок', 'Садовые дорожки 30 м²', 'Основание, плитка, бордюр', 'm-paving', { area: 30, use: 'walk', cover: 'tile', curb: 40 }),
  one('parking-rubble', 'Участок', 'Парковка из щебня 60 м²', 'Выемка, геотекстиль, щебень, бордюр', 'm-paving', { area: 60, use: 'car', cover: 'rubble' }),
  one('gates-sliding', 'Участок', 'Откатные ворота с автоматикой и калитка', 'Изготовление, фундамент, автоматика, зашивка профлистом', 'm-gates'),
  one('gates-swing', 'Участок', 'Распашные ворота и калитка', 'Столбы, рамы, зашивка, покраска', 'm-gates', { gate: 'swing', auto: 'no' }),
  one('yard-lawn', 'Участок', 'Рулонный газон 200 м² с грунтом', 'Завоз грунта, планировка, рулонный газон', 'm-yard', { trays: 0, inlets: 0, sand: 0, lawn: 'roll', lawnA: 200, lamps: 0, cable: 0 }),
  one('yard-drain', 'Участок', 'Ливнёвка двора: лотки и ливнеприёмники', 'Лотки, ливнеприёмники, пескоуловитель', 'm-yard', { trays: 20, inlets: 3, lawn: 'none', lamps: 0, cable: 0, soil: 'no' }),
  one('yard-lights', 'Участок', 'Освещение участка: 8 фонарей', 'Кабель в земле, фонари, подключение', 'm-yard', { trays: 0, inlets: 0, sand: 0, lawn: 'none', soil: 'no', lamps: 8, cable: 60 }),
  // ---------- Внутренняя отделка по этапам ----------
  one('interior-rough-50', 'Квартира', 'Черновая отделка новостройки 50 м²', 'Электрика, сантехника, машинная штукатурка по маякам, полусухая стяжка, гидроизоляция санузла', 'm-interior', { stage: 'rough', obj: 'new', area: 50, rooms: 2, baths: 1, wall: 'concrete', part: 0 }),
  one('interior-white-65', 'Квартира', 'White box 65 м² (предчистовая)', 'Черновая + шпаклёвка под покраску, потолки под покраску, перегородки ПГП', 'm-interior', { stage: 'white', obj: 'new', area: 65, rooms: 3, baths: 1, wall: 'concrete', part: 12, partMat: 'pgp', ceil: 'paint' }),
  one('interior-full-old-55', 'Квартира', 'Вторичка 55 м² под ключ по этапам', 'Демонтаж, электрика, сантехника, штукатурка, стяжка, покраска, плитка, ламинат, двери', 'm-interior', { stage: 'full', obj: 'old', area: 55, rooms: 2, baths: 1, wall: 'brick', part: 0 }),
  one('interior-house-120', 'Дом', 'Внутренняя отделка дома 120 м²', 'Газобетон: электрика, сантехника, штукатурка по сетке, утепление наружных стен, стяжка, финиш', 'm-interior', { stage: 'full', obj: 'house', area: 120, rooms: 4, baths: 2, wall: 'gas', part: 20, ins: 'warm', extWall: 30, cover: 'spc' }),
  one('insul-wall-in-20', 'Полы и стены', 'Утепление холодной стены изнутри 20 м²', 'Антисептик, минвата в каркас, пароизоляция, ГКЛ, утепление откосов и угла', 'm-insul', { sys: 'mw', aHeat: 20, t: 50, snd: 'none', slopes: 5, corners: 2.7 }),
  one('sound-wall-15', 'Полы и стены', 'Шумоизоляция стены от соседей 15 м²', 'Каркас на виброподвесах, акустическая минвата, 2×ГКЛ, лента по примыканиям', 'm-insul', { sys: 'none', snd: 'frame', aSound: 15 }),
  one('plaster-flat-120', 'Полы и стены', 'Машинная штукатурка 120 м² стен', 'Бетоноконтакт, маяки, гипсовая штукатурка машинным способом, откосы', 'm-finish', { L: 10, W: 5, H: 2.7, rooms: 1, doors: 2, windows: 3, walls: 'tile', level: 'plaster', pmat: 'machine', base: 'concrete', ceil: 'none' }),
];

export const READY_GROUPS = [...new Set(READY_TEMPLATES.map((t) => t.group))];
