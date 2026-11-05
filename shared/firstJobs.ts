/**
 * «Первая смета за 3 шага» — для того, кто открыл приложение впервые: что делаем → размер → готовая смета.
 * Каждая работа — один вопрос про размер (значения уже подставлены — можно сразу жать «Дальше»)
 * и пара галочек «что входит». Строки считают те же мастера, что и в «Новой смете», поэтому
 * у работ — цены справочника, у материалов — ориентир по рознице; класс материалов — эконом / стандарт / премиум.
 */
import { getCalculator, runCalc } from './calculators';
import { mergeLines, type ReadyLine } from './readyTemplates';
import { pickVariant, type Tier } from './materialTiers';

export interface SizeField { key: string; label: string; unit: string; def: number; min: number; max: number; step: number; presets?: number[]; hint?: string }
export interface JobOpt { key: string; label: string; on: boolean }
export type Sizes = Record<string, number>;
export type Opts = Record<string, boolean>;
type Part = [string, Record<string, any>];
export interface FirstJob {
  id: string; icon: string; title: string; text: string;
  /** вопрос на шаге «Размер» */
  q: string;
  size: SizeField[];
  opts?: JobOpt[];
  parts: (s: Sizes, o: Opts) => Part[];
  /** название сметы */
  name: (s: Sizes) => string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
/** 2,5 — по-русски */
export const fmtNum = (v: number) => String(r2(v)).replace('.', ',');
const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
/** помещений с полом / потолком на такую площадь (для порогов, плинтуса, светильников) */
const roomsBy = (A: number) => Math.max(1, Math.round(A / 20));
/** периметр N одинаковых квадратных комнат общей площадью A */
const perBy = (A: number, n: number) => r2(n * 4 * Math.sqrt(A / n));
/** жилых комнат в квартире такой площади */
const livingRooms = (A: number) => (A < 38 ? 1 : A < 60 ? 2 : A < 85 ? 3 : 4);
const when = (on: boolean | undefined, p: Part): Part[] => (on ? [p] : []);

const len = (key: string, label: string, def: number, min: number, max: number, step: number, presets?: number[]): SizeField => ({ key, label, unit: 'м', def, min, max, step, presets });
const area = (label: string, def: number, min: number, max: number, presets?: number[], hint?: string): SizeField => ({ key: 'A', label, unit: 'м²', def, min, max, step: 1, presets, hint });
const count = (key: string, label: string, def: number, max: number, presets?: number[], min = 1): SizeField => ({ key, label, unit: 'шт', def, min, max, step: 1, presets });
const HOUSE = [len('L', 'Длина дома', 10, 3, 40, 0.5), len('W', 'Ширина дома', 8, 3, 30, 0.5)];

export const FIRST_JOBS: FirstJob[] = [
  // ---------- квартира и отделка ----------
  {
    id: 'bath', icon: '🛁', title: 'Ванная под ключ', text: 'плитка, сантехника, потолок', q: 'Какой размер ванной?',
    size: [len('L', 'Длина', 2, 0.8, 8, 0.1), len('W', 'Ширина', 1.7, 0.8, 6, 0.1), len('H', 'Высота стен', 2.5, 2, 3.5, 0.1)],
    opts: [{ key: 'demo', label: 'Снять старую плитку и сантехнику', on: true }, { key: 'plumb', label: 'Сантехника: ванна, унитаз, раковина', on: true }, { key: 'ceil', label: 'Натяжной потолок', on: true }],
    parts: ({ L, W, H }, o) => {
      const F = r2(L * W), per = r2(2 * (L + W)), walls = Math.max(1, r2(per * H - 1.6));
      return [
        ...when(o.demo, ['m-demo', { obj: 'bath', floor: F, wallsTile: walls, floorTile: F, doors: 0, wallpaper: 'no', plumb: o.plumb ? 'yes' : 'no' }]),
        ...when(o.plumb, ['m-plumb', { toilets: 0, install: 1, sinks: 1, baths: 1, kitchen: 0, washer: 'yes', rail: 'yes' }]),
        ['m-tile', { obj: 'bath', floor: F, walls, hydro: 'yes', hatch: 1, corners: 4 }],
        ...when(o.ceil, ['m-stretch', { area: F, per, rooms: 1, spots: Math.max(2, Math.round(F)), chand: 0, pipes: 1, bath: 'yes' }]),
      ];
    },
    name: ({ L, W }) => `Ванная ${fmtNum(L)}×${fmtNum(W)} м под ключ`,
  },
  {
    id: 'flat', icon: '🏠', title: 'Квартира под ключ', text: 'всё: от электрики до ламината', q: 'Какая площадь квартиры?',
    size: [area('Площадь квартиры', 45, 15, 400, [35, 45, 60, 80])],
    opts: [{ key: 'old', label: 'Вторичка: снять старое (демонтаж)', on: true }],
    parts: ({ A }, o) => [['m-interior', { stage: 'full', obj: o.old ? 'old' : 'new', area: A, rooms: livingRooms(A), baths: A > 90 ? 2 : 1, wall: o.old ? 'brick' : 'concrete', part: 0 }]],
    name: ({ A }) => `Квартира ${fmtNum(A)} м² под ключ`,
  },
  {
    id: 'room-paint', icon: '🎨', title: 'Комната под покраску', text: 'штукатурка, шпаклёвка, покраска', q: 'Какой размер комнаты?',
    size: [len('L', 'Длина', 5, 1, 30, 0.5), len('W', 'Ширина', 4, 1, 30, 0.5), len('H', 'Высота потолка', 2.7, 2, 6, 0.1)],
    opts: [{ key: 'ceil', label: 'Натяжной потолок', on: true }, { key: 'floor', label: 'Ламинат на пол', on: false }],
    parts: ({ L, W, H }, o) => [
      ['m-finish', { L, W, H, rooms: 1, walls: 'paint', level: 'plaster', ceil: o.ceil ? 'stretch' : 'none' }],
      ...when(o.floor, ['m-floor', { area: r2(L * W), per: r2(2 * (L + W)), rooms: 1, base: 'none', cover: 'laminate' }]),
    ],
    name: ({ L, W }) => `Комната ${fmtNum(L)}×${fmtNum(W)} м под покраску`,
  },
  {
    id: 'plaster', icon: '🧱', title: 'Штукатурка стен', text: 'по маякам, гипсовая или машинная', q: 'Какой размер комнаты?',
    size: [len('L', 'Длина', 5, 1, 30, 0.5), len('W', 'Ширина', 4, 1, 30, 0.5), len('H', 'Высота потолка', 2.7, 2, 6, 0.1), count('rooms', 'Таких комнат', 1, 20, [1, 2, 3])],
    opts: [{ key: 'slopes', label: 'Откосы окон', on: true }, { key: 'machine', label: 'Машинная штукатурка (быстрее)', on: false }, { key: 'paint', label: 'Дальше шпаклёвка и покраска', on: false }],
    parts: ({ L, W, H, rooms }, o) => [['m-finish', { L, W, H, rooms, walls: o.paint ? 'paint' : 'tile', level: 'plaster', pmat: o.machine ? 'machine' : 'gypsum', ceil: 'none', slopes: o.slopes ? 'yes' : 'no' }]],
    name: ({ L, W, rooms }) => `Штукатурка стен: ${rooms > 1 ? `${rooms} комнаты ` : 'комната '}${fmtNum(L)}×${fmtNum(W)} м`,
  },
  {
    id: 'room-wallpaper', icon: '🧻', title: 'Комната: обои', text: 'снять старые, шпаклёвка, поклейка', q: 'Какой размер комнаты?',
    size: [len('L', 'Длина', 5, 1, 30, 0.5), len('W', 'Ширина', 3.6, 1, 30, 0.5), len('H', 'Высота потолка', 2.7, 2, 6, 0.1)],
    opts: [{ key: 'demo', label: 'Снять старые обои', on: true }, { key: 'ceil', label: 'Покрасить потолок', on: true }, { key: 'floor', label: 'Ламинат на пол', on: false }],
    parts: ({ L, W, H }, o) => [
      ['m-finish', { L, W, H, rooms: 1, walls: 'wallpaper', level: 'putty', ceil: o.ceil ? 'paint' : 'none', demo: o.demo ? 'wallpaper' : 'none' }],
      ...when(o.floor, ['m-floor', { area: r2(L * W), per: r2(2 * (L + W)), rooms: 1, base: 'none', cover: 'laminate', demo: 'soft' }]),
    ],
    name: ({ L, W }) => `Комната ${fmtNum(L)}×${fmtNum(W)} м: обои`,
  },
  {
    id: 'tile-floor', icon: '🔲', title: 'Плитка на пол', text: 'кухня, коридор, санузел', q: 'Какая площадь пола?',
    size: [area('Площадь пола', 10, 1, 500, [5, 10, 20, 40])],
    opts: [{ key: 'demo', label: 'Снять старую плитку', on: false }],
    parts: ({ A }, o) => [['m-tile', { obj: 'floor', floor: A, walls: 0, hydro: 'no', demo: o.demo ? 'yes' : 'no' }]],
    name: ({ A }) => `Плитка на пол ${fmtNum(A)} м²`,
  },
  {
    id: 'apron', icon: '🍳', title: 'Фартук на кухне', text: 'плитка «кабанчик» или керамогранит', q: 'Какая площадь фартука?',
    size: [area('Площадь фартука', 3, 0.5, 30, [2, 3, 4, 6], 'Длина столешницы × 0,6 м. Обычно 2–4 м²')],
    parts: ({ A }) => [['m-tile', { obj: 'apron', apron: A, floor: 0, walls: 0, hydro: 'no' }]],
    name: ({ A }) => `Кухонный фартук ${fmtNum(A)} м²`,
  },
  {
    id: 'laminate', icon: '🪵', title: 'Ламинат', text: 'подложка, плинтус, пороги', q: 'Какая площадь пола?',
    size: [area('Площадь пола', 20, 2, 1000, [15, 20, 40, 60])],
    opts: [{ key: 'level', label: 'Выровнять пол (наливной)', on: false }, { key: 'demo', label: 'Снять старое покрытие', on: false }],
    parts: ({ A }, o) => { const n = roomsBy(A); return [['m-floor', { area: A, per: perBy(A, n), rooms: n, base: o.level ? 'self' : 'none', cover: 'laminate', demo: o.demo ? 'soft' : 'none' }]]; },
    name: ({ A }) => `Ламинат ${fmtNum(A)} м²`,
  },
  {
    id: 'screed', icon: '🪣', title: 'Стяжка пола', text: 'полусухая, с фиброй', q: 'Какая площадь пола?',
    size: [area('Площадь пола', 50, 5, 3000, [20, 50, 100, 200])],
    parts: ({ A }) => { const n = roomsBy(A); return [['m-floor', { area: A, per: perBy(A, n), rooms: n, base: 'semi', cover: 'none' }]]; },
    name: ({ A }) => `Полусухая стяжка ${fmtNum(A)} м²`,
  },
  {
    id: 'stretch', icon: '💡', title: 'Натяжной потолок', text: 'полотно, профиль, светильники', q: 'Какая площадь потолка?',
    size: [area('Площадь потолка', 18, 2, 1000, [12, 18, 40, 60])],
    parts: ({ A }) => { const n = roomsBy(A); return [['m-stretch', { area: A, per: perBy(A, n), rooms: n, spots: Math.max(4, Math.round(A * 0.3)), chand: n, pipes: n }]]; },
    name: ({ A }) => `Натяжной потолок ${fmtNum(A)} м²`,
  },
  {
    id: 'gkl', icon: '📐', title: 'Перегородка из гипсокартона', text: 'каркас, шумоизоляция, шпаклёвка', q: 'Какой размер перегородки?',
    size: [len('len', 'Длина', 4, 0.5, 100, 0.5), len('H', 'Высота', 2.7, 2, 6, 0.1)],
    opts: [{ key: 'door', label: 'Дверной проём', on: true }],
    parts: ({ len: l, H }, o) => [['m-gkl', { kind: 'part', len: l, h: H, doors: o.door ? 1 : 0 }]],
    name: ({ len: l }) => `Перегородка из ГКЛ ${fmtNum(l)} м`,
  },
  {
    id: 'doors', icon: '🚪', title: 'Межкомнатные двери', text: 'двери с коробкой и наличниками', q: 'Сколько дверей?',
    size: [count('n', 'Дверей', 3, 30, [1, 2, 3, 5])],
    parts: ({ n }) => [['m-windows', { kind: 'interior', wn: 0, di: n, demo: 'no' }]],
    name: ({ n }) => `Межкомнатные двери: ${n} шт`,
  },
  {
    id: 'handy', icon: '🧰', title: 'Мастер на час', text: 'повесить, собрать, заменить', q: 'Что нужно сделать?',
    size: [count('hang', 'Повесить: полки, карнизы, картины', 3, 50, undefined, 0), count('furn', 'Собрать мебель', 1, 30, undefined, 0), count('lamps', 'Повесить люстру или светильник', 0, 30, undefined, 0)],
    parts: ({ hang, furn, lamps }) => [['m-handy', { hang, furn, lamps }]],
    name: () => 'Мастер на час',
  },
  // ---------- инженерия ----------
  {
    id: 'el-flat', icon: '⚡', title: 'Электрика в квартире', text: 'щит, кабель, розетки, свет', q: 'Какая площадь квартиры?',
    size: [area('Площадь квартиры', 50, 15, 500, [35, 50, 70, 100])],
    parts: ({ A }) => [['m-electric', { obj: 'flat', area: A, rooms: Math.max(2, Math.round(A / 11)) }]],
    name: ({ A }) => `Электрика в квартире ${fmtNum(A)} м²`,
  },
  {
    id: 'el-house', icon: '🔌', title: 'Электрика в доме', text: 'ввод, счётчик, щит, проводка', q: 'Какая площадь дома?',
    size: [area('Площадь дома', 120, 30, 2000, [80, 120, 150, 200])],
    parts: ({ A }) => [['m-electric', { obj: 'house', area: A, rooms: Math.max(3, Math.round(A / 15)), input: 'yes', ground: 'yes', street: 2 }]],
    name: ({ A }) => `Электрика в доме ${fmtNum(A)} м²`,
  },
  {
    id: 'plumb', icon: '🚿', title: 'Сантехника в квартире', text: 'разводка, канализация, приборы', q: 'Сколько санузлов?',
    size: [count('n', 'Санузлов', 1, 5, [1, 2, 3])],
    opts: [{ key: 'bath', label: 'Ванна (если нет — душевая кабина)', on: true }, { key: 'install', label: 'Унитаз на инсталляции', on: true }],
    parts: ({ n }, o) => [['m-plumb', { toilets: o.install ? 0 : n, install: o.install ? n : 0, sinks: n, baths: o.bath ? n : 0, cabins: o.bath ? 0 : n, kitchen: 1 }]],
    name: ({ n }) => `Сантехника: ${n} ${plural(n, 'санузел', 'санузла', 'санузлов')}`,
  },
  {
    id: 'heat', icon: '🔥', title: 'Отопление дома', text: 'котёл, радиаторы, разводка', q: 'Какая площадь дома?',
    size: [area('Площадь дома', 120, 30, 2000, [80, 120, 150, 200])],
    opts: [{ key: 'gas', label: 'Газовый котёл (иначе — электрический)', on: true }],
    parts: ({ A }, o) => [['m-heat', { area: A, rooms: Math.max(3, Math.round(A / 15)), src: o.gas ? 'gaswall' : 'electric', boiler: o.gas ? 'yes' : 'no' }]],
    name: ({ A }) => `Отопление дома ${fmtNum(A)} м²`,
  },
  {
    id: 'ac', icon: '❄️', title: 'Кондиционер', text: 'сплит-система с монтажом', q: 'Сколько кондиционеров?',
    size: [count('n', 'Кондиционеров', 1, 20, [1, 2, 3])],
    parts: ({ n }) => [['m-ac', { s35: n }]],
    name: ({ n }) => `Кондиционеры: ${n} шт`,
  },
  {
    id: 'windows', icon: '🪟', title: 'Пластиковые окна', text: 'монтаж, откосы, подоконники', q: 'Сколько окон?',
    size: [count('n', 'Окон', 3, 50, [1, 2, 3, 5])],
    opts: [{ key: 'demo', label: 'Снять старые окна', on: true }],
    parts: ({ n }, o) => [['m-windows', { kind: 'windows', wn: n, demo: o.demo ? 'yes' : 'no' }]],
    name: ({ n }) => `Пластиковые окна: ${n} шт`,
  },
  // ---------- дом и участок ----------
  {
    id: 'found-strip', icon: '🧱', title: 'Ленточный фундамент', text: 'земляные работы, арматура, бетон', q: 'Какой размер дома?',
    size: HOUSE,
    parts: ({ L, W }) => [['m-found', { type: 'strip', L, W, inner: W }]],
    name: ({ L, W }) => `Ленточный фундамент ${fmtNum(L)}×${fmtNum(W)} м`,
  },
  {
    id: 'found-slab', icon: '⬛', title: 'Фундамент-плита', text: 'подушка, утепление, арматура, бетон', q: 'Какой размер дома?',
    size: HOUSE,
    parts: ({ L, W }) => [['m-found', { type: 'slab', L, W, inner: W }]],
    name: ({ L, W }) => `Монолитная плита ${fmtNum(L)}×${fmtNum(W)} м`,
  },
  {
    id: 'found-screw', icon: '🔩', title: 'Винтовые сваи', text: 'под баню, дом, веранду', q: 'Какой размер постройки?',
    size: [len('L', 'Длина', 6, 2, 30, 0.5), len('W', 'Ширина', 4, 2, 20, 0.5)],
    parts: ({ L, W }) => [['m-found', { type: 'screw', L, W, inner: W }]],
    name: ({ L, W }) => `Винтовые сваи ${fmtNum(L)}×${fmtNum(W)} м`,
  },
  {
    id: 'walls-gas', icon: '🏗', title: 'Стены из газобетона', text: 'кладка, перемычки, армопояс', q: 'Какой размер дома?',
    size: [...HOUSE, count('fl', 'Этажей', 1, 3, [1, 2])],
    parts: ({ L, W, fl }) => { const P = r2(2 * (L + W)); return [['m-mason', { mat: 'gas', P, H: 3, floors: fl, open: Math.round(P * 0.55 * fl), lintels: Math.round((P / 3) * fl) }]]; },
    name: ({ L, W }) => `Стены из газобетона ${fmtNum(L)}×${fmtNum(W)} м`,
  },
  {
    id: 'roof', icon: '🛖', title: 'Крыша под ключ', text: 'стропила, металлочерепица, водосток', q: 'Какой размер дома?',
    size: HOUSE,
    opts: [{ key: 'ins', label: 'Утеплить (мансарда)', on: false }, { key: 'soft', label: 'Мягкая кровля вместо металлочерепицы', on: false }],
    parts: ({ L, W }, o) => [['m-roof', { shape: 'gable', L, W, ins: o.ins ? '200' : 'no', cover: o.soft ? 'soft' : 'metal' }]],
    name: ({ L, W }) => `Крыша ${fmtNum(L)}×${fmtNum(W)} м под ключ`,
  },
  {
    id: 'roof-new', icon: '🔁', title: 'Замена кровли', text: 'снять старую, профнастил, водосток', q: 'Какой размер дома?',
    size: HOUSE,
    parts: ({ L, W }) => [['m-roof', { shape: 'gable', L, W, cover: 'prof', rafters: 'exist', demo: 'yes', debris: 'yes' }]],
    name: ({ L, W }) => `Замена кровли ${fmtNum(L)}×${fmtNum(W)} м`,
  },
  {
    id: 'house', icon: '🏡', title: 'Каркасный дом', text: 'от свай до кровли', q: 'Какой размер дома?',
    size: [len('L', 'Длина дома', 8, 4, 20, 0.5), len('W', 'Ширина дома', 6, 3, 15, 0.5)],
    opts: [{ key: 'two', label: 'Два этажа', on: false }],
    parts: ({ L, W }, o) => [['m-house', { type: 'house', L, W, fl: o.two ? '2' : '1', wins: Math.max(3, Math.round((L * W) / 8)) * (o.two ? 2 : 1) }]],
    name: ({ L, W }) => `Каркасный дом ${fmtNum(L)}×${fmtNum(W)} м`,
  },
  {
    id: 'sauna', icon: '🧖', title: 'Баня', text: 'каркасная или из бруса, с печью', q: 'Какой размер бани?',
    size: [len('L', 'Длина', 6, 3, 12, 0.5), len('W', 'Ширина', 4, 2, 10, 0.5)],
    opts: [{ key: 'timber', label: 'Из бруса (иначе — каркасная)', on: false }],
    parts: ({ L, W }, o) => [['m-house', { type: o.timber ? 'bathb' : 'bathf', L, W, wins: 2 }]],
    name: ({ L, W }) => `Баня ${fmtNum(L)}×${fmtNum(W)} м`,
  },
  {
    id: 'fence', icon: '🚧', title: 'Забор из профлиста', text: 'столбы, лаги, профлист', q: 'Какая длина забора?',
    size: [len('len', 'Длина забора', 50, 5, 3000, 5, [30, 50, 100, 150])],
    opts: [{ key: 'gate', label: 'Откатные ворота и калитка', on: true }],
    parts: ({ len: l }, o) => [['fence-pro', { type: 'profnastil', len: l, slideGates: o.gate ? 1 : 0, wickets: o.gate ? 1 : 0 }]],
    name: ({ len: l }) => `Забор из профлиста ${fmtNum(l)} м`,
  },
  {
    id: 'paving', icon: '🛣', title: 'Тротуарная плитка', text: 'основание, плитка, бордюр', q: 'Какая площадь?',
    size: [area('Площадь', 30, 3, 5000, [20, 30, 60, 100])],
    opts: [{ key: 'car', label: 'Под машину (усиленное основание)', on: false }],
    parts: ({ A }, o) => [['m-paving', { area: A, use: o.car ? 'car' : 'walk', cover: 'tile', curb: Math.round(perBy(A, 1)) }]],
    name: ({ A }) => `Тротуарная плитка ${fmtNum(A)} м²`,
  },
  {
    id: 'septic', icon: '♻️', title: 'Септик', text: 'станция очистки, трубы до дома', q: 'Сколько человек живёт в доме?',
    size: [count('n', 'Человек', 4, 30, [2, 4, 6])],
    parts: ({ n }) => [['m-septic', { type: 'bio', people: n }]],
    name: ({ n }) => `Септик на ${n} ${plural(n, 'человека', 'человека', 'человек')}`,
  },
];

export const getJob = (id?: string | null) => FIRST_JOBS.find((j) => j.id === id) || null;

/** Что показать первым — по специальности из бота («Чем занимаетесь?») */
export const TRADE_JOBS: Record<string, string[]> = {
  finish: ['plaster', 'room-paint', 'room-wallpaper', 'flat', 'stretch', 'gkl'],
  tile: ['bath', 'tile-floor', 'apron', 'flat'],
  floor: ['laminate', 'screed', 'tile-floor', 'flat'],
  roof: ['roof', 'roof-new', 'house', 'walls-gas'],
  yard: ['fence', 'paving', 'septic', 'found-screw'],
  found: ['found-strip', 'found-slab', 'found-screw', 'walls-gas'],
  house: ['house', 'sauna', 'found-strip', 'roof'],
  windows: ['windows', 'doors', 'flat', 'bath'],
  electric: ['el-flat', 'el-house', 'flat', 'bath'],
  plumb: ['plumb', 'bath', 'heat', 'septic'],
  climate: ['ac', 'heat', 'el-flat', 'flat'],
  other: ['bath', 'room-paint', 'flat', 'laminate', 'el-flat', 'handy'],
};
export const DEFAULT_JOBS = ['bath', 'room-paint', 'flat', 'laminate', 'roof', 'fence'];
export const jobsFor = (trade?: string | null) => (TRADE_JOBS[trade || ''] || DEFAULT_JOBS).map((id) => getJob(id)!).filter(Boolean);
/** Все работы — по группам, для «Другая работа» */
export const JOB_GROUPS: [string, string[]][] = [
  ['Квартира и отделка', ['bath', 'flat', 'plaster', 'room-paint', 'room-wallpaper', 'tile-floor', 'apron', 'laminate', 'screed', 'stretch', 'gkl', 'doors', 'handy']],
  ['Инженерия', ['el-flat', 'el-house', 'plumb', 'heat', 'ac', 'windows']],
  ['Дом и участок', ['found-strip', 'found-slab', 'found-screw', 'walls-gas', 'roof', 'roof-new', 'house', 'sauna', 'fence', 'paving', 'septic']],
];

export const jobDefaults = (job: FirstJob): { sizes: Sizes; opts: Opts } => ({
  sizes: Object.fromEntries(job.size.map((f) => [f.key, f.def])),
  opts: Object.fromEntries((job.opts || []).map((o) => [o.key, o.on])),
});

/** Размер в допустимых пределах (пустое и мусор — значение по умолчанию) */
export function clampSize(f: SizeField, v: any): number {
  if (v == null || String(v).trim() === '') return f.def;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return f.def;
  return Math.min(f.max, Math.max(f.min, f.step >= 1 ? Math.round(n) : r2(n)));
}

/** Строки одного расчёта (мастер или калькулятор) с параметрами по умолчанию + свои значения */
function partLines([id, values]: Part): ReadyLine[] {
  const calc = getCalculator(id);
  if (!calc) throw new Error(`Нет расчёта ${id}`);
  const v: Record<string, any> = {};
  for (const f of calc.fields) v[f.key] = f.default ?? '';
  Object.assign(v, values);
  const r = runCalc(calc, v);
  if (!r.output) throw new Error(Object.values(r.errors)[0] || 'Не получилось посчитать');
  return r.output.suggestions.map((s) => ({ name: s.name, qty: s.qty, unit: s.unit, type: s.type as ReadyLine['type'], category: s.category || '', price: s.price, composition: s.composition, note: s.note }));
}

export interface JobLine { name: string; qty: number; unit: string; type: ReadyLine['type']; category: string; price: number; composition?: string; note?: string }

/** Готовые строки сметы: размеры и галочки → мастера → эконом / стандарт / премиум для материалов */
export function jobLines(job: FirstJob, sizes: Sizes, opts: Opts, tier: Tier = 'std'): JobLine[] {
  const s: Sizes = {};
  for (const f of job.size) s[f.key] = clampSize(f, sizes[f.key]);
  return mergeLines(job.parts(s, opts).map(partLines))
    .filter((l) => l.qty > 0)
    .map((l) => {
      const price = Number(l.price) || 0;
      if (l.type !== 'material' || tier === 'std' || !(price > 0)) return { ...l, price };
      const v = pickVariant(l.name, price, tier);
      return { ...l, name: v.name, price: v.price };
    });
}

export function jobTotals(lines: JobLine[]) {
  let works = 0, mats = 0;
  for (const l of lines) { const a = l.qty * l.price; if (l.type === 'material') mats += a; else works += a; }
  return { total: Math.round(works + mats), works: Math.round(works), mats: Math.round(mats) };
}

/** Разделы для экрана «Готово»: материалы — вместе со своими работами («Плиточные работы» + «… : материалы») */
export function jobSections(lines: JobLine[]) {
  const m = new Map<string, JobLine[]>();
  for (const l of lines) {
    const g = (l.category || (l.type === 'material' ? 'Материалы' : 'Работы')).replace(/: материалы$/i, '');
    m.set(g, [...(m.get(g) || []), l]);
  }
  return [...m.entries()].map(([title, ls]) => ({ title, lines: ls, sum: Math.round(ls.reduce((a, l) => a + l.qty * l.price, 0)) }));
}
