/**
 * Готовые сметы под ключ по типовым объектам: собираются теми же мастерами, что и «Новая смета»,
 * поэтому у работ — цены из справочника, у материалов — ориентировочные цены.
 * Комплексные (квартира, санузел) — несколько мастеров подряд, одинаковые строки складываются.
 */
import { MASTERS } from './masters';

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

/** Несколько мастеров подряд: одинаковые позиции складываются, доставка — не больше 3 рейсов */
function combo(parts: [string, Record<string, any>][]): ReadyLine[] {
  const out: ReadyLine[] = [];
  for (const [id, v] of parts) {
    for (const l of masterLines(id, v)) {
      const same = out.find((x) => x.name === l.name && x.unit === l.unit && x.type === l.type && x.price === l.price && x.category === l.category);
      if (same) same.qty = Math.round((same.qty + l.qty) * 100) / 100;
      else out.push({ ...l });
    }
  }
  for (const l of out) if (/^Доставка материалов/.test(l.name)) l.qty = Math.min(l.qty, 3);
  return out;
}

const one = (id: string, group: string, title: string, description: string, master: string, v: Record<string, any> = {}): ReadyTemplate =>
  ({ id, group, title, description, get lines() { return masterLines(master, v); } } as ReadyTemplate);
const many = (id: string, group: string, title: string, description: string, parts: [string, Record<string, any>][]): ReadyTemplate =>
  ({ id, group, title, description, get lines() { return combo(parts); } } as ReadyTemplate);

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
];

export const READY_GROUPS = [...new Set(READY_TEMPLATES.map((t) => t.group))];
