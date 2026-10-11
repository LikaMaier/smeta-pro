/**
 * Мастер забора: все основные виды заборов и способы монтажа столбов.
 * По длине, высоте, виду, способу монтажа и воротам считает материалы и работы
 * и выдаёт готовые строки сметы (цены — ориентировочные, помечаются «проверьте»).
 */
const ceil = Math.ceil;
const r = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export const FENCE_TYPES = {
  profnastil: { label: 'Профнастил', step: 2.5, work: 'Забор из профлиста под ключ (работа)' },
  euro1: { label: 'Евроштакетник односторонний', step: 2.5, work: 'Забор из евроштакетника односторонний (работа)' },
  euro2: { label: 'Евроштакетник двусторонний (шахматка)', step: 2.5, work: 'Забор из евроштакетника двусторонний (работа)' },
  mesh3d: { label: '3D-сетка (панели)', step: 2.5, work: 'Забор из 3D-сетки (работа)' },
  gitter: { label: 'Сетка Гиттер', step: 2.5, work: 'Забор из сетки Гиттер (работа)' },
  rabica: { label: 'Сетка-рабица', step: 2.5, work: 'Забор из сетки-рабицы под ключ (работа)' },
  welded: { label: 'Сварная сетка в рулоне', step: 2.5, work: 'Забор из сварной сетки в рулоне (работа)' },
  jalousie: { label: 'Жалюзи', step: 2, work: 'Забор-жалюзи (работа)' },
  rancho: { label: 'Ранчо (горизонтальный)', step: 2, work: 'Забор ранчо (работа)' },
  wood: { label: 'Деревянный штакетник', step: 2.5, work: 'Забор из штакетника (работа)' },
  dpk: { label: 'ДПК (древесно-полимерный)', step: 2, work: 'Забор из ДПК (работа)' },
  polycarbonate: { label: 'Поликарбонат', step: 2, work: 'Забор из поликарбоната (работа)' },
  sections: { label: 'Сварные / кованые секции', step: 2.5, work: 'Забор из сварных/кованых секций (работа)' },
  concrete: { label: 'Бетонный секционный (еврозабор)', step: 2, work: 'Еврозабор бетонный секционный (работа)' },
  brick: { label: 'Кирпичные столбы + заполнение профлистом', step: 3, work: 'Заполнение пролётов между кирпичными столбами (работа)' },
  blocks: { label: 'Из блоков (сплошной)', step: 3, work: 'Кладка забора из блоков (работа)' },
  gabion: { label: 'Габионы', step: 2, work: 'Габионный забор (работа)' },
} as const;
export type FenceType = keyof typeof FENCE_TYPES;

export const MOUNTS = {
  concrete: { label: 'Бетонирование столбов', work: 'Установка столба с бетонированием' },
  buta: { label: 'Бутование (щебень)', work: 'Установка столба с бутованием' },
  drive: { label: 'Забивка столбов', work: 'Забивка столба (без бетона)' },
  screw: { label: 'Винтовые сваи', work: 'Установка столба на винтовую сваю' },
  tise: { label: 'Буронабивные сваи (ТИСЭ)', work: 'Устройство буронабивной сваи (ТИСЭ) под столб' },
  strip: { label: 'Ленточный фундамент', work: 'Ленточный фундамент под забор' },
} as const;
export type Mount = keyof typeof MOUNTS;

export interface FenceInput {
  type: FenceType; mount: Mount; len: number; h: number; step?: number; depth?: number;
  slideGates?: number; swingGates?: number; wickets?: number; slideW?: number; swingW?: number;
  demolish?: number; slope?: boolean; caps?: boolean; automation?: boolean; paint?: boolean;
}

export interface FenceLine {
  name: string; qty: number; unit: string; type: 'work' | 'material' | 'equipment' | 'service';
  price: number; category: string; composition?: string; note?: string;
}

/** Ориентировочные цены материалов (₽, 2026, средний уровень по РФ). Всегда помечаются «проверьте у поставщика». */
const MAT = {
  sheet: 1100, pipe6060: 340, pipe6040: 300, pipe4020: 150, pipe8080: 520, euro: 150, panel3d: 2600, panelGitter: 2900, postPanel: 1300,
  rabica: 1900, welded: 3200, wire: 8, jalLamel: 330, jalPost: 2400, plankWood: 120, rancho: 160, dpk: 520, poly: 6800,
  section: 4500, concretePlate: 900, concretePost: 1700, brick: 28, block: 95, gabionMesh: 650, stone: 3200,
  concrete: 6200, rubble: 2300, screwPile: 2400, rebar: 85, screw: 3, cap: 150, slideKit: 26000, swingKit: 3500, wicketKit: 2500,
  automationSlide: 32000, primer: 900,
};
const NOTE = 'Примерная цена материала — проверьте у поставщика';
const C = 'Заборы';

export function fenceEstimate(i: FenceInput): { lines: FenceLine[]; summary: { label: string; value: number; unit: string }[]; warnings: string[] } {
  const t = FENCE_TYPES[i.type] ? i.type : 'profnastil';
  const m = MOUNTS[i.mount] ? i.mount : 'concrete';
  const h = Math.max(0.5, i.h || 2);
  const slideW = i.slideW || 4, swingW = i.swingW || 3.5;
  const gatesW = (i.slideGates || 0) * slideW + (i.swingGates || 0) * swingW + (i.wickets || 0) * 1;
  const L = Math.max(0, (i.len || 0) - gatesW);
  const step = i.step && i.step > 0.8 ? i.step : FENCE_TYPES[t].step;
  const depth = i.depth || (m === 'screw' ? 0 : 1.2);
  const spans = L > 0 ? ceil(L / step - 1e-9) : 0;
  const linePosts = L > 0 ? spans + 1 : 0;
  const gatePosts = ((i.slideGates || 0) + (i.swingGates || 0) + (i.wickets || 0)) * 2;
  const posts = linePosts + gatePosts;
  const lagRows = h > 2.2 ? 3 : 2;
  const lines: FenceLine[] = [];
  const warnings: string[] = [];
  const mat = (name: string, qty: number, unit: string, price: number, composition?: string) => {
    if (qty > 0) lines.push({ name, qty: r(qty), unit, type: 'material', price, category: C, note: NOTE, composition });
  };
  const work = (name: string, qty: number, unit: string, price: number, composition?: string) => {
    if (qty > 0) lines.push({ name, qty: r(qty), unit, type: 'work', price, category: C, composition });
  };
  const postLen = r(h + depth + 0.1, 1);
  const metalPosts = !['brick', 'blocks', 'concrete', 'gabion'].includes(t);

  // ---------- полотно и материалы ----------
  if (t === 'profnastil' || t === 'brick') {
    mat(`Профнастил С-8/С-20 ${h} м`, ceil(L / 1.15 - 1e-9), 'лист', MAT.sheet);
    mat('Труба профильная 40×20 (лаги)', lagRows * L * 1.05, 'м', MAT.pipe4020);
    mat('Саморезы кровельные', ceil(L / 1.15) * lagRows * 4, 'шт', MAT.screw);
  }
  if (t === 'euro1' || t === 'euro2') {
    const perM = t === 'euro1' ? 1 / (0.118 + 0.035) : 2 / (0.118 + 0.118);
    mat(`Евроштакетник ${h} м`, ceil(L * perM), 'шт', MAT.euro);
    mat('Труба профильная 40×20 (лаги)', lagRows * L * 1.05, 'м', MAT.pipe4020);
    mat('Саморезы кровельные', ceil(L * perM) * lagRows * 2, 'шт', MAT.screw);
  }
  if (t === 'mesh3d' || t === 'gitter') {
    const panels = ceil(L / 2.5 - 1e-9);
    mat(t === 'gitter' ? `Панель сетки Гиттер ${h} × 2,5 м` : `3D-панель ${h} × 2,5 м`, panels, 'шт', t === 'gitter' ? MAT.panelGitter : MAT.panel3d);
    mat('Крепления панелей (скобы)', linePosts * (h > 1.8 ? 4 : 3), 'шт', 35);
    if (step !== 2.5) warnings.push('Для 3D-панелей шаг столбов равен ширине панели — 2,5 м');
  }
  if (t === 'rabica') {
    mat(`Сетка-рабица ${h} м (рулон 10 м)`, ceil(L / 10 - 1e-9), 'рулон', MAT.rabica);
    mat('Проволока натяжная', 3 * L * 1.1, 'м', MAT.wire);
  }
  if (t === 'welded') {
    mat(`Сварная сетка ${h} м (рулон 25 м)`, ceil(L / 25 - 1e-9), 'рулон', MAT.welded);
    mat('Проволока натяжная', 3 * L * 1.1, 'м', MAT.wire);
  }
  if (t === 'jalousie') {
    const lam = ceil(h / 0.09) * spans;
    mat('Ламели жалюзи', lam, 'шт', MAT.jalLamel);
    mat('Стойки П-профиль для ламелей', spans * 2, 'шт', MAT.jalPost / 2);
  }
  if (t === 'rancho') {
    const rows = ceil(h / (0.1 + 0.03));
    mat('Доска ранчо металлическая', rows * L * 1.05, 'м', MAT.rancho);
    mat('Саморезы кровельные', rows * linePosts * 2, 'шт', MAT.screw);
  }
  if (t === 'wood') {
    mat(`Штакетник деревянный ${h} м`, ceil(L / (0.1 + 0.05)), 'шт', MAT.plankWood);
    mat('Брус 40×80 (лаги)', lagRows * L * 1.05, 'м', 90);
    mat('Антисептик', L * h * 0.25, 'л', 220);
  }
  if (t === 'dpk') {
    const rows = ceil(h / 0.15);
    mat('Доска заборная ДПК', rows * L * 1.05, 'м', MAT.dpk);
    mat('Направляющие и заглушки ДПК', spans, 'компл', 900);
  }
  if (t === 'polycarbonate') {
    mat('Поликарбонат сотовый 8 мм (2,1×6 м)', ceil((L * h) / 12.6 * 1.1), 'лист', MAT.poly);
    mat('Рамка из профтрубы 20×20', (2 * L + spans * 2 * h) * 1.05, 'м', 110);
    mat('Термошайбы', ceil((L * h) / 12.6 * 1.1) * 25, 'шт', 12);
  }
  if (t === 'sections') {
    mat(`Секция сварная/кованая ${h} × 2,5 м`, ceil(L / 2.5 - 1e-9), 'шт', MAT.section);
  }
  if (t === 'concrete') {
    const secs = ceil(L / 2 - 1e-9);
    mat('Плита еврозабора', secs * ceil(h / 0.5), 'шт', MAT.concretePlate);
    mat('Столб еврозабора', secs + 1 + gatePosts, 'шт', MAT.concretePost);
  }
  if (t === 'brick') {
    const bricks = (linePosts) * 52 * (h + 0.3);
    mat('Кирпич облицовочный для столбов', bricks * 1.05, 'шт', MAT.brick);
    mat('Кладочная смесь', bricks / 20, 'меш', 450);
    mat('Труба профильная 60×60 (сердечник столба)', linePosts * postLen, 'м', MAT.pipe6060);
    work('Кирпичные столбы забора', linePosts, 'шт', 6000, 'кладка столба 380×380\nсердечник из профтрубы\nрасшивка швов');
    work('Монтаж колпаков на столбы', linePosts, 'шт', 300);
    mat('Колпак на кирпичный столб', linePosts, 'шт', 900);
  }
  if (t === 'blocks') {
    const blocks = L * h * 12.5;
    mat('Блок облицовочный 390×190×188', blocks * 1.05, 'шт', MAT.block);
    mat('Кладочная смесь', blocks / 40, 'меш', 450);
    mat('Арматура А500 Ø10 (армирование)', L * 4, 'м', MAT.rebar);
  }
  if (t === 'gabion') {
    mat('Габионная сетка (сварная, оцинк.)', L * h * 2.4, 'м²', MAT.gabionMesh);
    mat('Камень для габионов', L * h * 0.3 * 1.05, 'м³', MAT.stone);
  }

  // ---------- столбы и монтаж ----------
  if (metalPosts && posts > 0) {
    const pipe = ['mesh3d', 'gitter'].includes(t) ? 'Столб для 3D-панелей 60×40' : ['sections', 'jalousie'].includes(t) ? 'Труба профильная 80×80 (столб)' : 'Труба профильная 60×60 (столб)';
    const price = ['mesh3d', 'gitter'].includes(t) ? MAT.pipe6040 : ['sections', 'jalousie'].includes(t) ? MAT.pipe8080 : MAT.pipe6060;
    mat(`${pipe}, ${postLen} м`, linePosts, 'шт', Math.round(price * postLen));
    if (gatePosts) mat(`Труба профильная 80×80 (столбы ворот), ${r(h + 1.3, 1)} м`, gatePosts, 'шт', Math.round(MAT.pipe8080 * (h + 1.3)));
    mat('Заглушки/колпаки на столбы', posts, 'шт', MAT.cap);
    if (!['mesh3d', 'gitter'].includes(t)) mat('Грунт-эмаль по металлу (столбы, лаги, сварка)', ceil(posts / 25 + L / 60), 'банка', MAT.primer);
  }
  const holeV = Math.PI * 0.1 ** 2 * depth;
  if (m === 'concrete' && metalPosts) mat('Бетон М200 на столбы', posts * holeV * 1.1, 'м³', MAT.concrete);
  if (m === 'buta' && metalPosts) mat('Щебень фр. 20–40 для бутования', posts * Math.PI * 0.125 ** 2 * depth * 1.2, 'м³', MAT.rubble);
  if (m === 'screw') mat('Свая винтовая 76 мм с оголовком', posts, 'шт', MAT.screwPile);
  if (m === 'tise') {
    mat('Бетон М250 на сваи', posts * Math.PI * 0.15 ** 2 * 1.5 * 1.1, 'м³', MAT.concrete);
    mat('Арматура А500 Ø12 для свай', posts * 4 * 1.8, 'м', MAT.rebar);
  }
  if (m === 'strip') {
    const v = L * 0.3 * 0.7;
    mat('Бетон М250 на ленту', v * 1.05, 'м³', MAT.concrete);
    mat('Арматура А500 Ø12 для ленты', L * 4 * 1.1, 'м', MAT.rebar);
    mat('Доска для опалубки', L * 2 * 0.7 * 0.025 * 1.2, 'м³', 18000);
    work('Ленточный фундамент под забор', L, 'пог. м', 3500, 'траншея\nпесчаная подушка\nопалубка\nармирование\nбетонирование');
  }
  if (m !== 'strip' && metalPosts) work(MOUNTS[m].work, posts, 'шт', { concrete: 1200, buta: 900, drive: 600, screw: 1800, tise: 2500, strip: 0 }[m]);
  if (m === 'strip' && metalPosts) work('Установка столба в ленточный фундамент', posts, 'шт', 700);
  if (m === 'drive' && h > 1.8) warnings.push('Забивные столбы для высокого сплошного забора — проверьте ветровую нагрузку; надёжнее бутование или бетон');
  if (m === 'screw' && ['brick', 'blocks', 'concrete', 'gabion'].includes(t)) warnings.push('Для тяжёлого забора нужен ленточный фундамент или сваи ТИСЭ, винтовые сваи не подходят');

  // ---------- работа по полотну ----------
  const workPrice: Record<FenceType, number> = {
    profnastil: 1500, euro1: 1600, euro2: 2100, mesh3d: 900, gitter: 1100, rabica: 600, welded: 700, jalousie: 2500, rancho: 2300,
    wood: 1300, dpk: 2500, polycarbonate: 1400, sections: 1500, concrete: 1300, brick: 900, blocks: 2200, gabion: 4500,
  };
  if (t === 'blocks') work(FENCE_TYPES[t].work, L * h, 'м²', workPrice[t], 'кладка блоков на смесь\nармирование каждого 3-го ряда\nрасшивка швов');
  else work(FENCE_TYPES[t].work, L, 'пог. м', workPrice[t]);

  // ---------- ворота и калитки ----------
  if (i.slideGates) {
    mat(`Комплект фурнитуры откатных ворот (балка, ролики, улавливатели) до ${slideW} м`, i.slideGates, 'компл', MAT.slideKit);
    work('Изготовление откатных ворот (работа)', i.slideGates, 'шт', 25000, 'каркас из профтрубы\nзашивка в цвет забора\nгрунтовка и покраска');
    work('Бетонирование закладной откатных ворот', i.slideGates, 'шт', 8000, 'котлован\nзакладная из швеллера\nармирование и бетонирование');
    work('Установка откатных ворот', i.slideGates, 'шт', 35000, 'монтаж балки и роликов\nнавеска полотна\nулавливатели\nрегулировка');
    if (i.automation) { mat('Автоматика откатных ворот (привод, рейка, пульты)', i.slideGates, 'компл', MAT.automationSlide); work('Монтаж автоматики ворот', i.slideGates, 'компл', 15000); }
  }
  if (i.swingGates) {
    mat('Фурнитура распашных ворот (петли, засов, стопор)', i.swingGates, 'компл', MAT.swingKit);
    work('Изготовление ворот распашных (работа)', i.swingGates, 'шт', 12000, 'каркас из профтрубы\nзашивка в цвет забора\nгрунтовка и покраска');
    work('Установка распашных ворот', i.swingGates, 'шт', 15000);
  }
  if (i.wickets) {
    mat('Фурнитура калитки (петли, замок, ручка)', i.wickets, 'компл', MAT.wicketKit);
    work('Изготовление калитки (работа)', i.wickets, 'шт', 6000);
    work('Монтаж калитки', i.wickets, 'шт', 6000);
  }

  // ---------- прочее ----------
  if (i.demolish) work('Демонтаж забора', i.demolish, 'пог. м', 300, 'демонтаж полотна и лаг\nвыемка столбов\nскладирование на участке');
  if (i.caps && metalPosts) work('Монтаж колпаков на столбы', posts, 'шт', 300);
  if (i.paint) work('Покраска забора', L * h, 'м²', 300);
  if (['concrete', 'buta', 'tise'].includes(m) && posts > 25) lines.push({ name: 'Ямобур', qty: ceil(posts / 60), unit: 'смена', type: 'equipment', price: 15000, category: C });
  if (m === 'strip' && L > 30) lines.push({ name: 'Мини-экскаватор', qty: ceil(L / 80), unit: 'смена', type: 'equipment', price: 20000, category: C });
  lines.push({ name: 'Доставка материалов за город', qty: 1, unit: 'рейс', type: 'service', price: 6000, category: C });
  if (i.slope) {
    for (const l of lines) if (l.type === 'work') l.note = 'Монтаж на склоне ступенями (+15%)';
    lines.forEach((l) => { if (l.type === 'work') l.price = Math.round(l.price * 1.15); });
  }

  const summary = [
    { label: 'Длина полотна без ворот', value: r(L, 1), unit: 'м' },
    { label: 'Столбов всего', value: posts, unit: 'шт' },
    { label: 'Пролётов', value: spans, unit: 'шт' },
    { label: 'Площадь забора', value: r(L * h, 1), unit: 'м²' },
  ];
  if (gatesW >= (i.len || 0) && (i.len || 0) > 0) warnings.push('Ширина ворот и калиток больше длины забора — проверьте размеры');
  return { lines, summary, warnings };
}
