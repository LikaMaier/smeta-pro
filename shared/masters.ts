/**
 * «Мастера» — пошаговые расчёты под ключ по специальностям (как мастер забора).
 * Каждый мастер по параметрам объекта выдаёт полный список работ (цены и единицы — из стартового справочника)
 * и материалов (ориентировочные цены, помечены «проверьте у поставщика»).
 */
import { STARTER_PRICES } from './starterPrices';
import { COMPOSITIONS } from './compositions';
import type { CalcField } from './calculators';

const S = new Map(STARTER_PRICES.map((p) => [p.name, p]));
const ceil = Math.ceil;
const r2 = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
/** Штучные единицы: количество всегда целое */
export const COUNT_UNIT = /^(шт|лист|меш|банка|рулон|компл|баллон|ведро|упак|пачка|рейс|катушка)/;
// клей для плитки 25 кг по прайсу «Петрович» СПб: C1 — обычная плитка, C2 — крупный формат
const C1_GLUE = 585, C2_GLUE = 1210;
export const MAT_NOTE = 'Цена материала — по прайсу «Петрович», СПб, 13.10.2026 (или ориентир); проверьте у своего поставщика';

export interface MLine {
  name: string; qty: number; unit: string; type: 'work' | 'material' | 'equipment' | 'service';
  price: number; category: string; composition?: string; note?: string;
}

/** Сборщик строк сметы: работы берутся из справочника по названию (цена, единица, состав) */
export class Builder {
  lines: MLine[] = [];
  warnings: string[] = [];
  summary: { label: string; value: number; unit: string }[] = [];
  section: string;
  k = 1; // коэффициент сложности на работы
  kNote = '';
  constructor(section: string) { this.section = section; }
  sec(name: string) { this.section = name; return this; }
  work(name: string, qty: number, opts: { unit?: string; k?: number; note?: string } = {}) {
    const s = S.get(name);
    if (!s) throw new Error(`Работы нет в справочнике: ${name}`);
    if (opts.unit && opts.unit !== s.unit) throw new Error(`Единица «${name}»: ожидали ${opts.unit}, в справочнике ${s.unit}`);
    if (!(qty > 0)) return this;
    const type = s.category === 'Аренда техники' ? 'equipment' : s.category === 'Доставка' || name.startsWith('Вывоз') ? 'service' : 'work';
    const k = (opts.k || 1) * (type === 'work' ? this.k : 1);
    // штучные работы (шт, компл, рейс…) — целым числом: «4,5 распредкоробки» не бывает
    const q = COUNT_UNIT.test(s.unit) ? Math.ceil(r2(qty) - 1e-9) : r2(qty);
    return this.push({
      name, qty: q, unit: s.unit, type, price: Math.round(s.price * k), category: this.section,
      composition: COMPOSITIONS[name]?.join('\n'), note: [opts.note, type === 'work' && this.k !== 1 ? this.kNote : ''].filter(Boolean).join('; ') || undefined,
    });
  }
  mat(name: string, qty: number, unit: string, price: number, composition?: string) {
    // штучное (шт, лист, мешок, рулон…) — только целыми, с округлением вверх
    const q = COUNT_UNIT.test(unit) ? Math.ceil(r2(qty) - 1e-9) : r2(qty);
    if (q > 0) this.push({ name, qty: q, unit, type: 'material', price, category: `${this.section}: материалы`, note: MAT_NOTE, composition });
    return this;
  }
  /** Одинаковые позиции (название, единица, цена, раздел) складываются в одну строку */
  private push(l: MLine) {
    const same = this.lines.find((x) => x.name === l.name && x.unit === l.unit && x.type === l.type && x.price === l.price && x.category === l.category);
    if (same) { same.qty = r2(same.qty + l.qty); if (l.note && !String(same.note || '').includes(l.note)) same.note = [same.note, l.note].filter(Boolean).join('; '); }
    else this.lines.push(l);
    return this;
  }
  sum(label: string, value: number, unit: string) { this.summary.push({ label, value: r2(value, 1), unit }); return this; }
  warn(t: string) { this.warnings.push(t); return this; }
}

export interface Master {
  id: string; icon: string; trade: string; title: string; description: string;
  fields: CalcField[];
  build: (v: Record<string, any>) => Builder;
}

const sel = (key: string, label: string, options: [string, string][], def?: string, hint?: string): CalcField =>
  ({ key, label, type: 'select', default: def ?? options[0][0], options: options.map(([value, l]) => ({ value, label: l })), hint });
const num = (key: string, label: string, unit: string, def: number, extra: Partial<CalcField> = {}): CalcField => ({ key, label, unit, default: def, min: 0, ...extra });
const yes = (key: string, label: string, def = 'no', hint?: string) => sel(key, label, [['no', 'нет'], ['yes', 'да']], def, hint);
const COMPLEXITY = sel('cx', 'Сложность объекта', [['1', 'обычная'], ['1.15', 'повышенная (+15%)'], ['1.3', 'высокая (+30%)']], '1', 'Высота, стеснённость, срочность, зимой');
const DEBRIS = yes('debris', 'Вывоз мусора', 'no');
function common(b: Builder, v: Record<string, any>) {
  b.k = Number(v.cx) || 1;
  b.kNote = b.k > 1 ? `сложность ×${String(b.k).replace('.', ',')}` : '';
}
function finish(b: Builder, v: Record<string, any>, deliveryCity = true) {
  b.sec('Прочее');
  if (v.debris === 'yes') b.work('Вывоз строительного мусора (контейнер 8 м³)', 1);
  if (deliveryCity) b.work('Доставка материалов по городу', 1);
  return b;
}

// =====================================================================
// Плиточник
// =====================================================================
const tile: Master = {
  id: 'm-tile', icon: '🧱', trade: 'Плиточник', title: 'Плитка: пол, стены, санузел, фартук, ступени',
  description: 'Любой формат от мозаики до 120×60, раскладка прямо/диагональ/ёлочка, подготовка, гидроизоляция, затирка, запил 45°',
  fields: [
    sel('obj', 'Что облицовываем', [['bath', 'санузел целиком (пол + стены)'], ['floor', 'только пол'], ['walls', 'только стены'], ['apron', 'кухонный фартук'], ['steps', 'ступени / крыльцо']], 'bath'),
    num('floor', 'Площадь пола', 'м²', 4), num('walls', 'Площадь стен (за вычетом двери)', 'м²', 22),
    num('apron', 'Площадь фартука', 'м²', 0), num('steps', 'Ступени (длина всех)', 'пог. м', 0),
    sel('fmt', 'Формат плитки', [['mosaic', 'мозаика'], ['small', 'до 30×30'], ['mid', '30×60 / 40×40'], ['big', '60×60'], ['xl', 'крупный 60×120 и больше']], 'mid'),
    sel('lay', 'Раскладка', [['straight', 'прямая'], ['diag', 'диагональ (+20% к работе)'], ['herring', 'ёлочка / сложная (+30%)']], 'straight'),
    sel('prep', 'Подготовка основания', [['none', 'основание ровное'], ['primer', 'только грунтовка'], ['plaster', 'штукатурка стен по маякам'], ['screed', 'стяжка пола'], ['both', 'штукатурка стен и стяжка пола']], 'primer'),
    yes('hydro', 'Гидроизоляция (санузел)', 'yes'),
    sel('grout', 'Затирка', [['cement', 'цементная'], ['epoxy', 'эпоксидная']], 'cement'),
    num('cut45', 'Запил под 45° (углы)', 'пог. м', 0), num('corners', 'Плиточный уголок', 'пог. м', 0),
    num('hatch', 'Ревизионные люки под плитку', 'шт', 0, { integer: true }), yes('drain', 'Душевой трап', 'no'),
    yes('demo', 'Демонтаж старой плитки', 'no'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Подготовка'); common(b, v);
    const floor = ['bath', 'floor'].includes(v.obj) ? v.floor : 0;
    const walls = ['bath', 'walls'].includes(v.obj) ? v.walls : 0;
    const apron = v.obj === 'apron' ? v.apron || v.walls : v.apron;
    const steps = v.obj === 'steps' ? v.steps || 5 : v.steps;
    const kLay = v.lay === 'diag' ? 1.2 : v.lay === 'herring' ? 1.3 : 1;
    const waste = (v.lay === 'straight' ? 0.1 : 0.15) + (v.fmt === 'xl' ? -0.03 : 0);
    const glue = { mosaic: 3, small: 4, mid: 5, big: 6, xl: 7.5 }[v.fmt as string] || 5;
    if (v.demo === 'yes') { b.work('Демонтаж напольной плитки', floor); b.work('Демонтаж плитки со стен', walls + apron); }
    if (['plaster', 'both'].includes(v.prep)) { b.work('Штукатурка стен по маякам', walls + apron); b.mat('Штукатурка гипсовая (30 кг)', ceil((walls + apron) * 15 / 30), 'меш', 495); }
    if (['screed', 'both'].includes(v.prep)) { b.work('Стяжка пола ЦПС до 50 мм', floor); b.mat('Пескобетон М300 (40 кг)', ceil(floor * 0.05 * 2000 / 40), 'меш', 155); }
    if (v.prep !== 'none') { b.work('Грунтовка стен', floor + walls + apron); b.mat('Грунтовка глубокого проникновения (10 л)', ceil((floor + walls + apron) * 0.2 / 10), 'кан', 1240); }
    if (v.hydro === 'yes' && floor) {
      const hz = floor + Math.min(walls, Math.sqrt(floor) * 4 * 0.3) + (v.drain === 'yes' ? 2 : 0);
      b.work('Гидроизоляция санузла обмазочная', hz); b.mat('Гидроизоляция обмазочная (15 кг)', ceil(hz * 2 / 15), 'ведро', 2600); b.mat('Гидроизоляционная лента', ceil(Math.sqrt(floor) * 4 * 1.1), 'м', 90);
    }
    b.sec('Плиточные работы');
    const xlName = 'Укладка керамогранита крупного формата';
    if (v.fmt === 'mosaic') b.work('Укладка мозаики', floor + walls + apron, { k: kLay });
    else if (v.fmt === 'xl') b.work(xlName, floor + walls + apron, { k: kLay });
    else { b.work('Укладка плитки на пол', floor, { k: kLay, note: kLay > 1 ? `раскладка ×${kLay}` : undefined }); b.work('Укладка плитки на стены', walls, { k: kLay, note: kLay > 1 ? `раскладка ×${kLay}` : undefined }); b.work('Монтаж фартука на кухне', apron); }
    b.work('Укладка плитки на ступени', steps);
    const area = floor + walls + apron + steps * 0.45;
    b.work(v.grout === 'epoxy' ? 'Затирка швов эпоксидной затиркой' : 'Затирка швов плитки', area);
    b.work('Запил плитки под 45°', v.cut45); b.work('Монтаж плиточного уголка', v.corners);
    b.work('Монтаж ревизионного люка', v.hatch); if (v.drain === 'yes') b.work('Установка душевого трапа', 1);
    b.sec('Плиточные работы');
    b.mat(`Плитка / керамогранит (+${Math.round(waste * 100)}% на подрезку)`, area * (1 + waste), 'м²', { mosaic: 2500, small: 845, mid: 1810, big: 2270, xl: 3290 }[v.fmt as string] || 1300);
    b.mat('Плиточный клей (25 кг)', ceil(area * glue / 25), 'меш', v.fmt === 'xl' || v.fmt === 'big' ? C2_GLUE : C1_GLUE);
    b.mat(v.grout === 'epoxy' ? 'Затирка эпоксидная (2,5 кг)' : 'Затирка цементная (2 кг)', ceil(area * (v.grout === 'epoxy' ? 0.5 : 0.4) / (v.grout === 'epoxy' ? 2.5 : 2)), 'уп', v.grout === 'epoxy' ? 3445 : 500);
    if (['big', 'xl', 'mid'].includes(v.fmt)) b.mat('Система выравнивания плитки (СВП), зажимы + клинья', ceil(area * 12 / 100), 'уп по 100', 650);
    if (v.corners) b.mat('Уголок для плитки', ceil(v.corners / 2.5), 'шт', 330);
    if (v.hatch) b.mat('Люк невидимка под плитку', v.hatch, 'шт', 3500);
    if (v.drain === 'yes') b.mat('Трап душевой с гидрозатвором', 1, 'шт', 4500);
    b.sum('Площадь облицовки', area, 'м²');
    if (v.fmt === 'xl' && v.prep === 'none') b.warn('Крупный формат требует идеально ровного основания — проверьте перепады правилом 2 м');
    return finish(b, v);
  },
};

// =====================================================================
// Кровельщик
// =====================================================================
const roof: Master = {
  id: 'm-roof', icon: '🏠', trade: 'Кровельщик', title: 'Кровля под ключ: стропила, покрытие, утепление, водосток',
  description: 'Односкатная, двускатная, вальмовая, мансардная. Металлочерепица, профнастил, мягкая, фальц, ондулин, композит, керамика',
  fields: [
    sel('shape', 'Форма крыши', [['gable', 'двускатная'], ['shed', 'односкатная'], ['hip', 'вальмовая (4 ската)'], ['mansard', 'мансардная ломаная']], 'gable'),
    num('L', 'Длина дома', 'м', 10), num('W', 'Ширина дома', 'м', 8), num('o', 'Свесы', 'м', 0.5), num('angle', 'Уклон', '°', 30, { max: 60 }),
    sel('cover', 'Покрытие', [['metal', 'металлочерепица'], ['prof', 'профнастил'], ['soft', 'мягкая (гибкая черепица)'], ['seam', 'фальцевая'], ['ondulin', 'ондулин'], ['composite', 'композитная черепица'], ['ceramic', 'керамическая черепица']], 'metal'),
    sel('rafters', 'Стропильная система', [['new', 'монтаж новой'], ['exist', 'уже есть']], 'new'),
    sel('ins', 'Утепление', [['no', 'холодная кровля'], ['150', 'минвата 150 мм'], ['200', 'минвата 200 мм']], 'no'),
    yes('gutter', 'Водосточная система', 'yes'), yes('snow', 'Снегозадержатели', 'yes'), yes('soffit', 'Подшивка карнизов софитом', 'yes'),
    num('windows', 'Мансардные окна', 'шт', 0, { integer: true }), num('chimney', 'Проходы трубы', 'шт', 0, { integer: true }),
    num('wallH', 'Высота стен до водостока', 'м', 3), yes('demo', 'Демонтаж старой кровли', 'no'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Кровля'); common(b, v);
    const a = (Math.min(Math.max(v.angle || 30, 5), 60) * Math.PI) / 180;
    const L = v.L + 2 * v.o, W = v.W + 2 * v.o;
    let area = (L * W) / Math.cos(a);
    if (v.shape === 'mansard') area *= 1.25;
    const ridge = v.shape === 'shed' ? 0 : v.shape === 'hip' ? Math.max(v.L - v.W, 0) + 4 * (W / 2) / Math.cos(a) * 1.15 : L;
    const eaves = v.shape === 'shed' ? L : v.shape === 'hip' ? 2 * (L + W) : 2 * L;
    const gables = v.shape === 'hip' ? 0 : v.shape === 'shed' ? 2 * W / Math.cos(a) + 0 : 2 * (W / Math.cos(a));
    const valley = v.shape === 'mansard' ? 2 * L * 0.5 : 0;
    const waste = v.shape === 'hip' ? 1.15 : 1.08;
    if (v.demo === 'yes') b.sec('Демонтаж').work('Демонтаж кровли (шифер, металл)', area);
    b.sec('Стропильная система');
    if (v.rafters === 'new') {
      b.work('Монтаж стропильной системы', area);
      b.mat('Доска/брус стропил и мауэрлата (хвоя, 1 сорт)', area * 0.045, 'м³', 27800);
      b.mat('Крепёж стропил (уголки, скобы, шпильки)', ceil(area / 10), 'компл', 650);
      b.mat('Антисептик-антипирен', ceil(area * 0.4 / 10), 'кан 10 л', 1065);
    }
    b.sec('Кровельный пирог');
    b.work('Монтаж гидро-ветрозащиты', area); b.mat('Гидро-ветрозащитная мембрана', area * 1.15, 'м²', 90);
    if (v.cover === 'soft') {
      b.work('Монтаж контробрешётки', area); b.work('Монтаж сплошного настила OSB', area);
      b.mat('Плита OSB-3 12 мм', ceil(area * 1.08 / 3.1), 'лист', 1199); b.mat('Подкладочный ковёр', ceil(area * 1.1 / 15), 'рулон', 3600);
    } else {
      b.work('Монтаж контробрешётки', area); b.work('Монтаж обрешётки', area);
      b.mat('Доска обрешётки 25×100 и брусок 50×50', area * (v.cover === 'seam' ? 0.03 : 0.022), 'м³', 28800);
    }
    if (v.ins !== 'no') {
      const t = Number(v.ins) / 1000;
      b.work('Утепление кровли', area); b.work('Монтаж пароизоляции', area);
      b.mat(`Утеплитель минвата ${v.ins} мм`, area * t * 1.05, 'м³', 4950); b.mat('Пароизоляционная плёнка', area * 1.15, 'м²', 40);
    }
    b.sec('Покрытие');
    const cov: Record<string, [string, number]> = {
      metal: ['Монтаж металлочерепицы', 815], prof: ['Монтаж профнастила на кровлю', 600], soft: ['Монтаж мягкой кровли', 635],
      seam: ['Монтаж фальцевой кровли', 1100], ondulin: ['Монтаж ондулина', 420], composite: ['Монтаж композитной черепицы', 1450], ceramic: ['Монтаж керамической черепицы', 2400],
    };
    const [cw, cp] = cov[v.cover] || cov.metal;
    b.work(cw, area);
    b.mat(`Покрытие: ${cw.replace('Монтаж ', '')} (+${Math.round((waste - 1) * 100)}%)`, area * waste, 'м²', cp);
    b.mat('Саморезы кровельные / гвозди', ceil(area * 8), 'шт', 4);
    if (ridge) { b.work('Монтаж конька', ridge); b.mat('Конёк + уплотнитель', ridge * 1.1, 'пог. м', 650); }
    if (valley) { b.work('Монтаж ендовы', valley); b.mat('Ендова', valley * 1.1, 'пог. м', 700); }
    if (gables) { b.work('Монтаж ветровой планки', gables); b.mat('Ветровая (торцевая) планка', gables * 1.1, 'пог. м', 380); }
    b.work('Монтаж карнизной планки', eaves); b.mat('Карнизная планка', eaves * 1.1, 'пог. м', 300);
    b.sec('Доборные элементы');
    if (v.gutter === 'yes') {
      const downs = Math.max(2, ceil(eaves / 10));
      b.work('Монтаж водосточной системы', eaves + downs * v.wallH);
      b.mat('Водосточный желоб с крюками', eaves * 1.05, 'пог. м', 300); b.mat('Водосточная труба с коленами и хомутами', downs * v.wallH, 'пог. м', 380);
      b.mat('Воронки, заглушки, соединители', downs, 'компл', 1600);
    }
    if (v.snow === 'yes') { b.work('Монтаж снегозадержателей', eaves); b.mat('Снегозадержатель трубчатый', ceil(eaves / 3), 'шт (3 м)', 3000); }
    if (v.soffit === 'yes') { b.work('Подшивка карниза софитом', eaves + gables); b.mat('Софит с J-профилем', (eaves + gables) * v.o * 1.1, 'м²', 580); }
    if (v.windows) { b.work('Монтаж мансардного окна', v.windows); b.mat('Мансардное окно 78×118 с окладом', v.windows, 'шт', 32000); }
    if (v.chimney) { b.work('Монтаж примыкания к трубе', v.chimney); b.mat('Комплект примыкания (планки, лента)', v.chimney, 'компл', 4500); }
    b.work('Автовышка', area > 150 ? 2 : 1);
    b.sum('Площадь кровли', area, 'м²').sum('Конёк', ridge, 'м').sum('Карнизы', eaves, 'м');
    if (v.cover === 'soft' && v.angle < 12) b.warn('Мягкая кровля — уклон не меньше 12°');
    if (['metal', 'composite', 'ceramic'].includes(v.cover) && v.angle < 14) b.warn('Черепица (металл, композит, керамика) — уклон не меньше 14–22°');
    return finish(b, v);
  },
};

// =====================================================================
// Отделочник: штукатурка, шпаклёвка, покраска, обои, потолки
// =====================================================================
// Финиш стен: работа, материал [название, расход на м², ед., цена, фасовка м² на ед. (если штучно)], подготовка
// prep: Q3 — шпаклёвка под покраску, Q4 — 3 слоя, paper — под обои, rough — только ровная штукатурка, none — по каркасу/обрешётке
type WallFin = { label: string; w: string[]; mat?: [string, number, string, number]; prep: 'Q3' | 'Q4' | 'paper' | 'rough' | 'none'; mesh?: boolean };
const WALL_FIN: Record<string, WallFin> = {
  paint: { label: 'покраска', w: ['Покраска стен в 2 слоя'], mat: ['Краска интерьерная моющаяся (9 л)', 0.3 / 9, 'ведро', 6000], prep: 'Q3', mesh: true },
  paintQ4: { label: 'покраска премиум (Q4, 3 слоя)', w: ['Шлифовка стен под покраску', 'Покраска стен в 3 слоя'], mat: ['Краска интерьерная глубокоматовая (9 л)', 0.4 / 9, 'ведро', 9500], prep: 'Q4', mesh: true },
  paint2c: { label: 'покраска в 2 цвета', w: ['Покраска стен в 2 цвета/с разделением'], mat: ['Краска интерьерная моющаяся (9 л)', 0.32 / 9, 'ведро', 6000], prep: 'Q3', mesh: true },
  wallpaper: { label: 'обои', w: ['Поклейка обоев'], mat: ['Обои флизелиновые 1,06×10 м', 1.15 / 10.6, 'рулон', 2000], prep: 'paper' },
  paintpaper: { label: 'обои под покраску (малярный флизелин)', w: ['Поклейка малярного флизелина', 'Покраска стен по обоям'], mat: ['Флизелин малярный 1×25 м', 1.1 / 25, 'рулон', 2900], prep: 'paper' },
  glass: { label: 'стеклообои под покраску', w: ['Поклейка стеклообоев', 'Покраска стен в 2 слоя'], mat: ['Стеклообои (25 м²)', 1.1 / 25, 'рулон', 3790], prep: 'paper' },
  photo: { label: 'фотообои / фреска', w: ['Поклейка фотообоев'], mat: ['Фотообои флизелиновые', 1.05, 'м²', 1200], prep: 'paper' },
  textile: { label: 'текстильные обои', w: ['Поклейка текстильных обоев'], mat: ['Обои текстильные 0,53×10 м', 1.15 / 5.3, 'рулон', 4500], prep: 'paper' },
  natural: { label: 'бамбуковые / пробковые обои', w: ['Поклейка бамбуковых/пробковых обоев'], mat: ['Обои бамбуковые/пробковые', 1.1, 'м²', 1100], prep: 'paper' },
  liquid: { label: 'жидкие обои', w: ['Нанесение жидких обоев'], mat: ['Жидкие обои (уп. на 4 м²)', 1 / 4, 'уп', 1100], prep: 'paper' },
  texture: { label: 'фактурная покраска', w: ['Фактурная покраска'], mat: ['Фактурная краска (15 кг)', 1 / 15, 'ведро', 3500], prep: 'paper' },
  decor: { label: 'декоративная штукатурка (короед, шагрень)', w: ['Декоративная штукатурка стен'], mat: ['Декоративная штукатурка фактурная (25 кг)', 2.8 / 25, 'меш', 1450], prep: 'paper' },
  silk: { label: 'шёлковая штукатурка', w: ['Шёлковая декоративная штукатурка'], mat: ['Шёлковая декоративная штукатурка (уп. на 4 м²)', 1 / 4, 'уп', 1300], prep: 'paper' },
  venetian: { label: 'венецианская штукатурка', w: ['Венецианская штукатурка'], mat: ['Венецианская штукатурка + воск', 1, 'кг', 650], prep: 'Q4' },
  travertine: { label: 'травертин (декор)', w: ['Травертин декоративный (штукатурка)'], mat: ['Декоративная штукатурка «травертин»', 2.5, 'кг', 420], prep: 'paper' },
  microcement: { label: 'микроцемент', w: ['Декоративный бетон (микроцемент)'], mat: ['Микроцемент (база, финиш, лак)', 1, 'м²', 1800], prep: 'Q3' },
  tadelakt: { label: 'тадеклакт', w: ['Тадеклакт'], mat: ['Тадеклакт (известь + мыло)', 1.6, 'кг', 700], prep: 'rough' },
  gypsum3d: { label: '3D-панели гипсовые', w: ['Поклейка 3D-панелей гипсовых', 'Покраска стен в 2 слоя'], mat: ['Гипсовые 3D-панели + клей', 1.05, 'м²', 1600], prep: 'rough' },
  brick: { label: 'декоративный кирпич (плитка)', w: ['Укладка декоративной плитки (кирпичик)'], mat: ['Декоративный кирпич гипсовый + клей', 1.1, 'м²', 1500], prep: 'rough' },
  flexstone: { label: 'гибкий камень', w: ['Укладка гибкого камня'], mat: ['Гибкий камень + клей', 1.08, 'м²', 2400], prep: 'rough' },
  pvc: { label: 'панели ПВХ', w: ['Монтаж стеновых панелей ПВХ'], mat: ['Панели ПВХ 250 мм + профиль и плинтусы', 1.1, 'м²', 450], prep: 'none' },
  pvcStone: { label: 'панели ПВХ под камень/кирпич', w: ['Монтаж стеновых панелей под камень ПВХ'], mat: ['Панели ПВХ под камень', 1.1, 'м²', 600], prep: 'none' },
  mdf: { label: 'панели МДФ', w: ['Монтаж стеновых панелей МДФ на каркас'], mat: ['Панели МДФ + обрешётка + кляймеры', 1.08, 'м²', 900], prep: 'none' },
  lining: { label: 'вагонка / имитация бруса', w: ['Монтаж вагонки'], mat: ['Вагонка + брусок обрешётки', 1.1, 'м²', 850], prep: 'none' },
  slats: { label: 'декоративные рейки', w: ['Монтаж декоративных реек на стену'], mat: ['Рейки МДФ/шпон на основе', 1.05, 'м²', 3500], prep: 'none' },
  acoustic: { label: 'акустические панели', w: ['Монтаж акустических панелей'], mat: ['Акустические панели', 1.05, 'м²', 3000], prep: 'none' },
  soft: { label: 'мягкие стеновые панели', w: ['Монтаж мягких стеновых панелей'], mat: ['Мягкие стеновые панели', 1, 'м²', 5500], prep: 'none' },
  hpl: { label: 'панели HPL', w: ['Монтаж стеновых панелей HPL'], mat: ['Панели HPL + подсистема', 1.05, 'м²', 4500], prep: 'none' },
  tile: { label: 'только выравнивание под плитку', w: [], prep: 'rough' },
  none: { label: 'стены не делаем', w: [], prep: 'none' },
};
// Потолки: работы и материал на м²
type CeilFin = { label: string; w: string[]; mat?: [string, number, string, number]; putty?: boolean; grunt?: boolean };
const CEIL_FIN: Record<string, CeilFin> = {
  paint: { label: 'шпаклёвка и покраска', w: ['Шпаклёвка потолка под покраску', 'Покраска потолка'], grunt: true, putty: true },
  plaster: { label: 'штукатурка по маякам + покраска', w: ['Штукатурка потолка по маякам', 'Шпаклёвка потолка под покраску', 'Покраска потолка'], grunt: true, putty: true, mat: ['Штукатурка гипсовая (30 кг)', 15 * 0.9 / 30, 'меш', 495] },
  stretch: { label: 'натяжной', w: ['Монтаж натяжного потолка'], mat: ['Полотно ПВХ матовое с багетом', 1, 'м²', 450] },
  gkl: { label: 'ГКЛ в 1 уровень + покраска', w: ['Потолок из ГКЛ в 1 уровень', 'Шпаклёвка стыков ГКЛ', 'Шпаклёвка потолка под покраску', 'Покраска потолка'], grunt: true, putty: true },
  gkl2: { label: 'ГКЛ в 2 уровня + покраска', w: ['Потолок из ГКЛ в 2 уровня', 'Шпаклёвка стыков ГКЛ', 'Шпаклёвка потолка под покраску', 'Покраска потолка'], grunt: true, putty: true },
  shadow: { label: 'ГКЛ с теневым швом + покраска', w: ['Потолок из ГКЛ с теневым швом', 'Шпаклёвка стыков ГКЛ', 'Шпаклёвка потолка под покраску', 'Покраска потолка'], grunt: true, putty: true },
  wallpaper: { label: 'обои на потолок', w: ['Шпаклёвка потолка под покраску', 'Поклейка потолочных обоев'], grunt: true, putty: true, mat: ['Обои потолочные под покраску 1,06×25 м', 1.1 / 26.5, 'рулон', 2600] },
  rack: { label: 'реечный', w: ['Монтаж реечного потолка'], mat: ['Реечный потолок (рейки, стрингеры, подвесы)', 1.05, 'м²', 1400] },
  armstrong: { label: 'Армстронг / кассетный', w: ['Монтаж кассетного потолка'], mat: ['Подвесной потолок Армстронг (плиты, подвесная система)', 1.05, 'м²', 700] },
  grilyato: { label: 'Грильято', w: ['Монтаж потолка Грильято'], mat: ['Грильято (ячейки + подвесы)', 1.05, 'м²', 2200] },
  wood: { label: 'дерево (вагонка, рейки)', w: ['Монтаж деревянного потолка (вагонка/рейки)'], mat: ['Вагонка/рейка + брусок обрешётки', 1.1, 'м²', 1000] },
  coffer: { label: 'кессонный', w: ['Монтаж кессонного потолка'], mat: ['Кессоны (полиуретан/МДФ)', 1, 'м²', 3500] },
  foam: { label: 'потолочная плитка (бюджет)', w: ['Монтаж потолочной плитки пенопластовой'], mat: ['Плитка потолочная пенополистирол + клей', 1.05, 'м²', 120] },
  none: { label: 'не делаем', w: [] },
};
const finishM: Master = {
  id: 'm-finish', icon: '🎨', trade: 'Маляр-штукатур', title: 'Стены и потолки: штукатурка, шпаклёвка, 29 видов отделки стен, 13 видов потолков',
  description: 'По размерам комнат: штукатурка с расходом по толщине; покраска, обои всех видов, жидкие обои, декоративные штукатурки, микроцемент, панели ПВХ/МДФ/HPL, рейки, камень; потолки натяжные, ГКЛ, реечные, Армстронг, Грильято, дерево',
  fields: [
    num('L', 'Длина помещения', 'м', 5), num('W', 'Ширина', 'м', 4), num('H', 'Высота', 'м', 2.7), num('rooms', 'Таких помещений', 'шт', 1, { integer: true, min: 1 }),
    num('doors', 'Двери', 'шт', 1, { integer: true }), num('windows', 'Окна', 'шт', 1, { integer: true }),
    sel('walls', 'Стены — финиш', Object.entries(WALL_FIN).map(([k, f]) => [k, f.label] as [string, string]), 'paint'),
    num('accentA', 'Акцентная стена', 'м²', 0, { hint: 'Часть стен другой отделкой — укажите площадь' }),
    sel('accent', 'Акцентная стена — финиш', Object.entries(WALL_FIN).filter(([k]) => k !== 'tile' && k !== 'none').map(([k, f]) => [k, f.label] as [string, string]), 'photo'),
    sel('level', 'Выравнивание стен', [['plaster', 'штукатурка по маякам'], ['putty', 'только шпаклёвка'], ['none', 'не нужно']], 'plaster'),
    sel('pmat', 'Штукатурка', [['gypsum', 'гипсовая вручную'], ['machine', 'гипсовая машинная'], ['cement', 'цементная (санузел, подвал, неотапливаемое)']], 'gypsum'),
    num('pt', 'Средняя толщина штукатурки', 'мм', 15, { hint: 'Перепады стены по правилу; свыше 30 мм — сетка и доплата за каждый см' }),
    sel('base', 'Стены из', [['brick', 'кирпич / блоки'], ['concrete', 'бетон / монолит (бетоноконтакт)'], ['gas', 'газобетон'], ['old', 'старая штукатурка (укрепить грунтом)']], 'brick'),
    sel('ceil', 'Потолок', Object.entries(CEIL_FIN).map(([k, f]) => [k, f.label] as [string, string]), 'stretch'),
    sel('ceilDemo', 'Потолок: демонтаж', [['none', 'нет'], ['whitewash', 'смыть побелку'], ['stretch', 'старый натяжной'], ['rack', 'реечный / подвесной'], ['gkl', 'ГКЛ'], ['foam', 'потолочная плитка']], 'none'),
    yes('cornice', 'Потолочный плинтус (галтель)', 'no'), yes('slopes', 'Откосы окон штукатуркой', 'yes'),
    sel('demo', 'Стены: демонтаж', [['none', 'нет'], ['wallpaper', 'старые обои'], ['plaster', 'старая штукатурка'], ['paint', 'старая краска'], ['tile', 'плитка'], ['panels', 'панели']], 'none'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Подготовка'); common(b, v);
    const n = v.rooms || 1;
    const per = 2 * (v.L + v.W);
    const walls = Math.max(0, (per * v.H - v.doors * 1.6 - v.windows * 1.8)) * n;
    const ceilA = v.L * v.W * n;
    const accA = Math.min(walls, Math.max(0, Number(v.accentA) || 0));
    const mainF = WALL_FIN[v.walls] || WALL_FIN.paint, accF = accA ? WALL_FIN[v.accent] || WALL_FIN.photo : null;
    const parts: [WallFin, number][] = [[mainF, walls - accA], ...(accF ? [[accF, accA] as [WallFin, number]] : [])];
    const area = (p: (f: WallFin) => boolean) => parts.filter(([f]) => p(f)).reduce((s, [, a]) => s + a, 0);
    const cf = CEIL_FIN[v.ceil] || CEIL_FIN.none;
    // по каркасу/обрешётке стены не штукатурим и не шпаклюем
    const levelA = area((f) => f.prep !== 'none');
    const plaster = v.level === 'plaster' && levelA > 0;
    const pt = Math.max(5, Number(v.pt) || 15);
    if (v.demo === 'wallpaper') b.work('Демонтаж обоев', walls);
    if (v.demo === 'plaster') b.work('Демонтаж штукатурки', walls);
    if (v.demo === 'paint') b.work('Снятие старой краски со стен', walls);
    if (v.demo === 'tile') b.work('Демонтаж плитки со стен', walls);
    if (v.demo === 'panels') b.work('Демонтаж стеновых панелей ПВХ/МДФ', walls);
    if (v.ceilDemo === 'whitewash') b.work('Очистка потолка от побелки', ceilA);
    if (v.ceilDemo === 'stretch') b.work('Демонтаж натяжного потолка', ceilA);
    if (v.ceilDemo === 'rack') b.work('Демонтаж подвесного потолка', ceilA);
    if (v.ceilDemo === 'gkl') b.work('Демонтаж ГКЛ потолка', ceilA);
    if (v.ceilDemo === 'foam') b.work('Демонтаж потолочной плитки', ceilA);
    if (v.base === 'concrete' && plaster) { b.work('Бетоноконтакт', levelA); b.mat('Бетоноконтакт (20 кг)', ceil(levelA * 0.35 / 20), 'ведро', 1600); }
    if (v.base === 'old' && levelA) b.work('Укрепление основания грунтом (сыпучая штукатурка)', levelA);
    const primed = levelA + (cf.grunt ? ceilA : 0);
    b.work('Грунтовка стен', levelA); if (cf.grunt) b.work('Грунтовка потолка', ceilA);
    // грунт ~0,15 л/м² на проход; 2 прохода (под штукатурку и под шпаклёвку/финиш)
    b.mat('Грунтовка глубокого проникновения (10 л)', ceil(primed * 0.3 / 10), 'кан', 1240);
    b.sec('Стены');
    if (plaster) {
      const pw = { gypsum: 'Штукатурка стен по маякам', machine: 'Машинная штукатурка стен', cement: 'Штукатурка стен цементная' }[v.pmat as 'gypsum'] || 'Штукатурка стен по маякам';
      b.work(pw, levelA, { note: `слой ~${pt} мм` });
      if (pt > 30) b.work('Штукатурка стен по маякам свыше 3 см (каждый см)', levelA * ceil((pt - 30) / 10));
      if (pt > 30 || v.base === 'gas' || v.pmat === 'cement') { b.work('Монтаж штукатурной сетки', levelA); b.mat('Сетка штукатурная стеклотканевая 5×5', levelA * 1.1, 'м²', 45); }
      // расход: гипс ≈ 0,9 кг/м² на 1 мм, машинная ≈ 1 кг, цементная ≈ 1,7 кг
      if (v.pmat === 'cement') b.mat('Штукатурка цементная (25 кг)', ceil(levelA * pt * 1.7 / 25), 'меш', 390);
      else if (v.pmat === 'machine') b.mat('Штукатурка гипсовая машинная (30 кг)', ceil(levelA * pt * 1.0 / 30), 'меш', 640);
      else b.mat('Штукатурка гипсовая (30 кг)', ceil(levelA * pt * 0.9 / 30), 'меш', 495);
      b.mat('Маяки 6 мм (3 м)', ceil(levelA / 1.5 / 3 * 1.2), 'шт', 45);
    }
    if (v.level !== 'none') {
      const q4 = area((f) => f.prep === 'Q4'), q3 = area((f) => f.prep === 'Q3'), paper = area((f) => f.prep === 'paper');
      if (q3) b.work('Шпаклёвка стен под покраску', q3);
      if (q4) b.work('Шпаклёвка в 3 слоя под покраску (Q4)', q4);
      if (paper) b.work('Шпаклёвка под обои', paper);
      b.mat('Шпаклёвка финишная полимерная (20 кг)', ceil((q3 * 1 + q4 * 1.5 + paper * 0.6) / 20), 'меш', 1530);
      const meshA = area((f) => !!f.mesh);
      if (meshA) { b.work('Армирование стен стеклохолстом', meshA); b.mat('Стеклохолст (50 м²)', ceil(meshA * 1.1 / 50), 'рулон', 1600); }
      const outer = ((v.slopes === 'yes' && v.walls !== 'none' ? v.windows * 4.5 : 0) + v.H) * n;
      if (q3 + q4 + paper) { b.work('Монтаж малярного уголка', outer); b.mat('Уголок перфорированный (3 м)', ceil(outer / 3), 'шт', 60); }
    }
    for (const [f, a] of parts) {
      if (!(a > 0) || !f.w.length) continue;
      for (const w of f.w) b.work(w, a);
      if (f.mat) b.mat(f.mat[0], f.mat[2] === 'м²' || f.mat[2] === 'кг' ? a * f.mat[1] : ceil(a * f.mat[1]), f.mat[2], f.mat[3]);
      if (f.w.includes('Покраска стен в 2 слоя') && f !== WALL_FIN.paint) b.mat('Краска интерьерная (9 л)', ceil(a * 0.3 / 9), 'ведро', 4190);
      if (f.w.includes('Покраска стен по обоям')) b.mat('Краска интерьерная (9 л)', ceil(a * 0.3 / 9), 'ведро', 4190);
      if (['Поклейка обоев', 'Поклейка малярного флизелина', 'Поклейка фотообоев', 'Поклейка текстильных обоев', 'Поклейка бамбуковых/пробковых обоев'].includes(f.w[0])) b.mat('Клей обойный', ceil(a / 30), 'уп', 550);
      if (f.w[0] === 'Поклейка стеклообоев') b.mat('Клей для стеклообоев (10 кг)', ceil(a * 0.25 / 10), 'ведро', 1900);
    }
    if (v.slopes === 'yes' && v.windows && v.walls !== 'none') {
      const sl = v.windows * 5 * n;
      b.work('Штукатурка откосов', sl);
      if (v.walls !== 'tile' && v.walls !== 'none') { b.work('Шпаклёвка откосов', sl); b.work('Покраска откосов', sl); }
    }
    b.sec('Потолок');
    for (const w of cf.w) b.work(w, ceilA);
    if (cf.mat) b.mat(cf.mat[0], cf.mat[2] === 'м²' ? ceilA * cf.mat[1] : ceil(ceilA * cf.mat[1]), cf.mat[2], cf.mat[3]);
    if (['gkl', 'gkl2', 'shadow'].includes(v.ceil)) {
      b.mat('ГКЛ 12,5 мм (3 м²)', ceil(ceilA * (v.ceil === 'gkl2' ? 1.5 : 1.1) / 3), 'лист', 530); b.mat('Профиль ПП 60×27 и ППН (3 м)', ceil(ceilA * 3.3 / 3), 'шт', 210);
      b.mat('Подвесы, крабы, саморезы', ceil(ceilA / 10), 'компл', 900);
      if (v.ceil === 'shadow') b.mat('Теневой профиль для ГКЛ (3 м)', ceil(per * n / 3), 'шт', 1200);
    }
    if (cf.putty) b.mat('Шпаклёвка финишная (20 кг)', ceil(ceilA / 20), 'меш', 900);
    if (cf.w.includes('Покраска потолка')) b.mat('Краска для потолков (9 л)', ceil(ceilA * 0.3 / 9), 'ведро', 3250);
    if (v.ceil === 'wallpaper') { b.mat('Клей обойный', ceil(ceilA / 25), 'уп', 550); b.work('Покраска потолка', ceilA); b.mat('Краска для потолков (9 л)', ceil(ceilA * 0.3 / 9), 'ведро', 3250); }
    if (v.cornice === 'yes') { b.work('Монтаж потолочного плинтуса (галтели)', per * n); b.work('Покраска потолочного плинтуса', per * n); b.mat('Галтель полиуретановая (2 м)', ceil(per * n * 1.1 / 2), 'шт', 450); }
    b.sum('Площадь стен', walls, 'м²').sum('Площадь потолка', ceilA, 'м²');
    if (plaster) b.sum('Штукатурки', levelA * pt * (v.pmat === 'cement' ? 1.7 : v.pmat === 'machine' ? 1 : 0.9), 'кг');
    if (plaster && v.pmat === 'gypsum' && pt > 50) b.warn('Гипсовая штукатурка толще 50 мм — лучше выровнять ГКЛ на каркасе или цементной в 2 прохода');
    if (v.base === 'gas' && plaster) b.warn('Газобетон: грунт глубокого проникновения обязательно — блок тянет воду из штукатурки');
    if (parts.some(([f]) => f.prep === 'none' && f.w.length) && v.level === 'plaster') b.warn('Панели и рейки монтируются на обрешётку — штукатурка под них не считается');
    return finish(b, v);
  },
};

// =====================================================================
// Полы
// =====================================================================
// покрытие: [работа, материал, цена материала за м², запас, подложка, клей, дерево под шлифовку/лак]
type Cover = { w: string; m: string; p: number; k: number; under?: boolean; glue?: 'pvc' | 'wood' | 'tile' | 'tileXL'; wood?: boolean; level?: 'strict' };
const COVERS: Record<string, Cover & { label: string }> = {
  laminate: { label: 'ламинат', w: 'Укладка ламината', m: 'Ламинат 33 класс', p: 1070, k: 1.07, under: true },
  laminateHB: { label: 'ламинат ёлочкой', w: 'Укладка ламината ёлочкой', m: 'Ламинат «ёлочка» 33 класс', p: 1500, k: 1.1, under: true },
  spc: { label: 'кварцвинил (SPC) замковый', w: 'Укладка кварцвинила (SPC)', m: 'Кварцвинил SPC', p: 1430, k: 1.07, under: true, level: 'strict' },
  spcGlue: { label: 'кварцвинил клеевой', w: 'Укладка кварцвинила на клей', m: 'Кварцвинил клеевой', p: 1100, k: 1.05, glue: 'pvc', level: 'strict' },
  lvt: { label: 'ПВХ-плитка (LVT) на клей', w: 'Укладка ПВХ-плитки на клей', m: 'ПВХ-плитка LVT', p: 1100, k: 1.05, glue: 'pvc', level: 'strict' },
  parquet: { label: 'паркетная доска', w: 'Укладка паркетной доски', m: 'Паркетная доска', p: 4200, k: 1.07, under: true },
  engineered: { label: 'инженерная доска на клей', w: 'Укладка инженерной доски на клей', m: 'Инженерная доска', p: 4500, k: 1.07, glue: 'wood' },
  massive: { label: 'массивная доска', w: 'Укладка массивной доски на клей', m: 'Массивная доска (дуб)', p: 6500, k: 1.08, glue: 'wood', wood: true },
  piece: { label: 'штучный паркет', w: 'Укладка штучного паркета', m: 'Штучный паркет (дуб)', p: 4500, k: 1.08, glue: 'wood', wood: true },
  herring: { label: 'паркет ёлочкой', w: 'Укладка паркета ёлочкой', m: 'Паркет «ёлочка» (дуб)', p: 4800, k: 1.1, glue: 'wood', wood: true },
  chevron: { label: 'французская ёлка', w: 'Укладка паркета французская ёлка', m: 'Паркет «французская ёлка» (дуб)', p: 6500, k: 1.12, glue: 'wood', wood: true },
  cork: { label: 'пробковый пол', w: 'Укладка пробкового пола', m: 'Пробковое покрытие замковое', p: 2200, k: 1.05, level: 'strict' },
  lino: { label: 'линолеум', w: 'Укладка линолеума', m: 'Линолеум полукоммерческий', p: 700, k: 1.1 },
  carpet: { label: 'ковролин', w: 'Укладка ковролина', m: 'Ковролин', p: 650, k: 1.1 },
  carpetTile: { label: 'ковровая плитка', w: 'Укладка ковровой плитки', m: 'Ковровая плитка', p: 1200, k: 1.05 },
  rubber: { label: 'резиновое покрытие', w: 'Укладка резинового покрытия (рулон)', m: 'Резиновое покрытие рулонное', p: 1300, k: 1.05 },
  tile: { label: 'керамогранит 60×60', w: 'Укладка плитки на пол', m: 'Керамогранит 60×60', p: 1300, k: 1.1, glue: 'tile' },
  tileXL: { label: 'керамогранит 120×60', w: 'Укладка керамогранита 120×60', m: 'Керамогранит 120×60', p: 2500, k: 1.1, glue: 'tileXL', level: 'strict' },
  microcement: { label: 'микроцемент', w: 'Микроцемент на пол', m: 'Микроцемент (база, финиш, лак)', p: 1800, k: 1, level: 'strict' },
  polymer: { label: 'наливной полимерный (декор)', w: 'Наливной пол декоративный (3D/полимер)', m: 'Полимерный состав', p: 1800, k: 1 },
};
const PLINTHS: Record<string, [string, string, string, number]> = {
  mdf: ['МДФ', 'Монтаж плинтуса МДФ', 'Плинтус МДФ с крепежом (2,4 м)', 520], plastic: ['пластиковый', 'Монтаж плинтуса', 'Плинтус ПВХ с заглушками и углами (2,5 м)', 380],
  duro: ['дюрополимер высокий', 'Монтаж плинтуса из дюрополимера', 'Плинтус дюрополимер (2 м)', 900], wood: ['деревянный', 'Монтаж плинтуса деревянного', 'Плинтус деревянный (2,2 м)', 650],
  hidden: ['скрытый под покраску', 'Монтаж плинтуса скрытого (под покраску)', 'Профиль скрытого плинтуса (2,5 м)', 1200], shadow: ['теневой алюминиевый', 'Монтаж теневого плинтуса', 'Теневой профиль плинтуса (2,5 м)', 1500],
  alu: ['алюминиевый', 'Монтаж алюминиевого плинтуса', 'Плинтус алюминиевый (2,5 м)', 1100], tile: ['из плитки', 'Плинтус из плитки', 'Подрезка плитки на плинтус', 0],
};
const floors: Master = {
  id: 'm-floor', icon: '🪵', trade: 'Мастер по полам', title: 'Полы: все основания и покрытия — стяжки, наливной, лаги, сухой пол, тёплый пол, 20 видов покрытий',
  description: 'ЦПС, полусухая, по утеплителю, с керамзитом, наливной по толщине, лаги с фанерой/OSB, сухой пол Кнауф, регулируемые полы. Ламинат, кварцвинил, паркет и паркетная доска, инженерная и массивная доска, ёлочка, пробка, LVT, линолеум, ковролин, резина, керамогранит, микроцемент, полимер',
  fields: [
    num('area', 'Площадь пола', 'м²', 40), num('per', 'Периметр (для плинтуса)', 'м', 30), num('rooms', 'Помещений (пороги)', 'шт', 3, { integer: true }),
    sel('base', 'Основание', [['cps', 'стяжка ЦПС'], ['semi', 'полусухая стяжка'], ['float', 'стяжка по утеплителю ЭППС (плавающая)'], ['keramzit', 'стяжка с керамзитом'], ['self', 'наливной пол (выравнивание)'], ['joists', 'лаги + фанера'], ['osb', 'лаги + OSB'], ['dry', 'сухой пол Кнауф (засыпка + ГВЛ)'], ['screws', 'регулируемые полы на винтах'], ['plyglue', 'фанера на клей по старой стяжке'], ['none', 'основание готово']], 'semi'),
    num('thick', 'Толщина стяжки', 'мм', 50), num('selfT', 'Толщина наливного', 'мм', 5, { hint: 'До 5 мм — финишный, до 10 мм — базовый, 10–30 мм — толстослойный' }),
    sel('heat', 'Тёплый пол', [['no', 'нет'], ['water', 'водяной'], ['electric', 'электрический кабель/мат'], ['film', 'инфракрасная плёнка (под ламинат)']], 'no'),
    sel('cover', 'Покрытие', [...Object.entries(COVERS).map(([k, c]) => [k, c.label] as [string, string]), ['none', 'без покрытия (под плитку отдельно)']], 'laminate'),
    sel('plinth', 'Плинтус', Object.entries(PLINTHS).map(([k, p]) => [k, p[0]] as [string, string]), 'mdf'),
    sel('wfin', 'Паркет/массив: финиш', [['lacquer', 'шлифовка + лак в 3 слоя'], ['oil', 'шлифовка + масло с воском']], 'lacquer'),
    sel('insul', 'Утепление', [['no', 'нет'], ['keramzit', 'сухая засыпка керамзитом'], ['xps', 'ЭППС под стяжку'], ['mw', 'минвата между лагами']], 'no'),
    yes('sound', 'Шумоизоляция (плавающий пол)', 'no'), yes('mesh', 'Армирование стяжки сеткой', 'no'),
    sel('demo', 'Демонтаж', [['none', 'нет'], ['soft', 'линолеум / ламинат'], ['parquet', 'паркет'], ['wood', 'деревянный пол'], ['tile', 'плитка / керамогранит'], ['screed', 'старая стяжка']], 'none'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Демонтаж и подготовка'); common(b, v);
    const A = v.area, P = v.per || Math.sqrt(A) * 4;
    const c = COVERS[v.cover];
    const lags = ['joists', 'osb'].includes(v.base);
    if (v.demo === 'soft') b.work('Демонтаж линолеума/ламината', A);
    if (v.demo === 'parquet') b.work('Демонтаж паркета', A);
    if (v.demo === 'wood') b.work('Демонтаж деревянного пола', A);
    if (v.demo === 'tile') b.work('Демонтаж керамогранита с пола', A);
    if (v.demo === 'screed') b.work('Демонтаж стяжки', A);
    if (v.demo !== 'none') b.work('Демонтаж плинтуса', P);
    b.sec('Утепление и шумоизоляция');
    if (v.insul === 'keramzit' && !['keramzit', 'dry'].includes(v.base)) { b.work('Утепление пола керамзитом', A); b.mat('Керамзит фр. 10–20', A * 0.08, 'м³', 2800); }
    if (v.insul === 'xps' || v.base === 'float') { b.work('Укладка ЭППС под стяжку', A); b.mat('ЭППС 50 мм', A * 1.05, 'м²', 350); }
    if (v.insul === 'mw' && lags) { b.work('Утепление пола минватой между лагами', A); b.mat('Минвата плита 100 мм', A * 1.05, 'м²', 340); b.mat('Пароизоляционная плёнка (Изоспан B)', A * 1.15, 'м²', 25); }
    if (v.sound === 'yes') { b.work('Виброизоляция пола (плавающий пол)', A); b.mat('Звукоизоляционная подложка под стяжку', A * 1.1, 'м²', 250); }
    b.sec('Тёплый пол');
    if (v.heat === 'water') {
      b.work('Монтаж тёплого водяного пола', A); b.work('Монтаж коллекторной группы тёплого пола', 1);
      b.mat('Труба PE-Xa 16 мм', A * 6.7, 'м', 164); if (v.insul !== 'xps' && v.base !== 'float') b.mat('Утеплитель ЭППС 30 мм', A * 1.05, 'м²', 230); b.mat('Коллекторная группа со смесительным узлом', 1, 'компл', 22000);
    }
    if (v.heat === 'electric') { b.work('Монтаж электрического тёплого пола', A * 0.7); b.mat('Нагревательный мат 150 Вт/м²', A * 0.7, 'м²', 2140); b.mat('Терморегулятор', Math.max(1, v.rooms), 'шт', 2740); b.work('Монтаж регулятора тёплого пола', Math.max(1, v.rooms)); }
    if (v.heat === 'film') { b.work('Монтаж тёплого пола инфракрасного (плёнка)', A * 0.7); b.mat('Плёнка инфракрасная 220 Вт/м² + теплоотражающая подложка', A * 0.7, 'м²', 1200); b.mat('Терморегулятор', Math.max(1, v.rooms), 'шт', 2740); b.work('Монтаж регулятора тёплого пола', Math.max(1, v.rooms)); }
    b.sec('Основание');
    const t = Math.max(v.thick || 50, 30);
    const screed = ['cps', 'semi', 'float', 'keramzit'].includes(v.base);
    if (screed) {
      b.work('Грунтовка пола', A); b.work('Демпферная лента по периметру', P);
      b.work({ cps: 'Стяжка пола ЦПС до 50 мм', semi: 'Стяжка пола полусухая', float: 'Стяжка по утеплителю (плавающая)', keramzit: 'Стяжка с керамзитом' }[v.base as 'cps'], A);
      if (t > 50 && v.base !== 'keramzit') b.work('Стяжка пола свыше 50 мм (каждые 10 мм)', A * ceil((t - 50) / 10));
      const sandT = v.base === 'keramzit' ? Math.min(t, 40) : t; // с керамзитом песчаный слой ~40 мм, остальное — керамзит
      b.mat('Пескобетон / ЦПС (40 кг)', ceil(A * sandT / 1000 * 2000 / 40), 'меш', 155); b.mat('Фиброволокно, демпферная лента, плёнка', ceil(A / 20), 'компл', 900);
      if (v.base === 'keramzit') b.mat('Керамзит фр. 5–10', A * Math.max(0.03, (t - 40) / 1000), 'м³', 2800);
      if (v.mesh === 'yes' || v.base === 'float') { b.work('Армирование стяжки сеткой', A); b.mat('Сетка кладочная 50×50×3', A * 1.1, 'м²', 120); }
    }
    const selfT = Math.max(2, Number(v.selfT) || 5);
    const needSelf = v.base === 'self' || v.cover === 'polymer' || (c?.level === 'strict' && screed);
    if (needSelf) {
      const st = v.base === 'self' ? selfT : 3;
      b.work('Грунтовка пола', A);
      b.work(st <= 5 ? 'Наливной пол самовыравнивающийся до 5 мм' : st <= 10 ? 'Наливной пол до 1 см' : 'Наливной пол 1–3 см', A);
      b.mat('Наливной пол (20 кг)', ceil(A * 1.6 * st / 20), 'меш', 576);
    }
    if (lags) {
      b.work('Монтаж лаг под пол', A); b.work(v.base === 'osb' ? 'Укладка OSB на лаги' : 'Укладка фанеры на лаги', A);
      b.mat('Брус лаги 50×100', A * 0.02, 'м³', 29900);
      if (v.base === 'osb') b.mat('OSB-3 18 мм (2,5×1,25)', ceil(A * 1.08 / 3.125), 'лист', 1350);
      else b.mat('Фанера ФК 18 мм (1,52×1,52)', ceil(A * 1.08 / 2.31), 'лист', 2099);
    }
    if (v.base === 'dry') { b.work('Сухой пол Кнауф', A); b.mat('Засыпка сухая Кнауф (50 л)', ceil(A * 0.04 * 1000 / 50), 'меш', 590); b.mat('Элемент пола ГВЛ (1,2×0,6) + саморезы, клей', ceil(A * 1.05 / 0.72), 'шт', 520); }
    if (v.base === 'screws') { b.work('Регулируемые полы на винтовых опорах', A); b.mat('Регулируемая фанера/лаги с винтовыми опорами', A * 1.05, 'м²', 1400); }
    if (v.base === 'plyglue') { b.work('Выравнивание пола фанерой на клей/саморезы', A); b.mat('Фанера ФК 12 мм (1,52×1,52)', ceil(A * 1.08 / 2.31), 'лист', 1550); b.mat('Клей двухкомпонентный для паркета (10 кг)', ceil(A * 1.1 / 10), 'ведро', 6500); }
    b.sec('Покрытие');
    if (c) {
      b.work(c.w, A); b.mat(`${c.m} (+${Math.round((c.k - 1) * 100)}%)`, A * c.k, 'м²', c.p);
      if (c.under) { b.work('Монтаж подложки', A); b.mat(v.heat === 'film' ? 'Подложка для тёплого пола' : 'Подложка', A * 1.05, 'м²', v.heat === 'film' ? 110 : 78); }
      if (c.glue === 'pvc') b.mat('Клей дисперсионный для ПВХ-покрытий (10 кг)', ceil(A * 0.35 / 10), 'ведро', 3200);
      if (c.glue === 'wood') { b.mat('Клей двухкомпонентный для паркета (10 кг)', ceil(A * 1.1 / 10), 'ведро', 6500); b.mat('Грунт под паркетный клей (5 л)', ceil(A * 0.15 / 5), 'кан', 2900); }
      if (c.glue === 'tile' || c.glue === 'tileXL') {
        b.work('Затирка швов плитки на пол', A);
        b.mat('Плиточный клей (25 кг)', ceil(A * (c.glue === 'tileXL' ? 7 : 5) / 25), 'меш', c.glue === 'tileXL' ? C2_GLUE : C1_GLUE); b.mat('Затирка (2 кг)', ceil(A / 8), 'шт', 450);
        if (c.glue === 'tileXL') b.mat('СВП (система выравнивания плитки)', ceil(A * 8), 'шт', 12);
      }
      if (c.wood) {
        b.work('Шлифовка паркета', A); b.work('Шпаклёвка паркета', A);
        if (v.wfin === 'oil') { b.work('Покрытие паркета маслом', A); b.mat('Масло с твёрдым воском (2,5 л)', ceil(A * 0.06 / 2.5), 'банка', 7500); }
        else { b.work('Покрытие лаком в 3 слоя', A); b.mat('Лак паркетный + грунт (5 л)', ceil(A * 0.35 / 5), 'кан', 6500); }
        b.mat('Шпаклёвка для паркета на связующем (5 л)', ceil(A * 0.1 / 5), 'кан', 2400);
      }
      if (v.cover !== 'polymer' && v.cover !== 'microcement') {
        const pk = c.glue === 'tile' || c.glue === 'tileXL' ? (v.plinth === 'mdf' ? 'tile' : v.plinth) : v.plinth === 'tile' ? 'mdf' : v.plinth;
        const [, pw, pm, pp] = PLINTHS[pk] || PLINTHS.mdf;
        b.work(pw, P); if (pp) b.mat(pm, ceil(P * 1.1 / 2.4), 'шт', pp);
        if (pk === 'hidden') b.work('Покраска плинтуса', P);
      }
      b.work('Монтаж порогов', v.rooms); b.mat('Порог-стык', v.rooms, 'шт', 450);
    }
    b.sum('Площадь', A, 'м²');
    if (v.cover === 'none' && v.heat === 'electric') b.warn('Электрический тёплый пол под плитку — мат укладывается в слой клея');
    if (v.heat === 'film' && c && !c.under) b.warn('ИК-плёнка — только под ламинат/паркетную доску/SPC с подложкой; под плитку и клеевые покрытия берите кабель или мат');
    if (v.heat === 'water' && lags) b.warn('Водяной тёплый пол по лагам — только в алюминиевых пластинах; надёжнее по стяжке');
    if (c?.wood && ['cps', 'semi', 'keramzit', 'float'].includes(v.base)) b.warn('Под штучный паркет и массив стяжку обычно перекрывают фанерой на клей; влажность стяжки — не больше 2%');
    if (c?.level === 'strict') b.warn(`${c.label}: основание ровнее 2 мм на 2 м — заложен тонкий наливной слой`);
    return finish(b, v);
  },
};

// =====================================================================
// Электрик
// =====================================================================
const electric: Master = {
  id: 'm-electric', icon: '⚡', trade: 'Электрик', title: 'Электромонтаж: проводка, щит, розетки, свет, слаботочка, ввод, заземление',
  description: 'Квартира или дом. Штробление по материалу стен, заделка штроб, кабели, щит под число групп с УЗО и реле напряжения, отдельные линии под технику, интернет/ТВ, свет, ввод и заземление',
  fields: [
    sel('obj', 'Объект', [['flat', 'квартира'], ['house', 'частный дом']], 'flat'),
    num('area', 'Площадь', 'м²', 60), num('rooms', 'Помещений', 'шт', 4, { integer: true, min: 1 }),
    sel('wall', 'Стены', [['concrete', 'бетон / монолит'], ['brick', 'кирпич / блоки'], ['gas', 'газобетон'], ['gkl', 'ГКЛ (без штроб)'], ['wood', 'дерево (открытая проводка)']], 'brick'),
    num('sockets', 'Розетки', 'шт', 0, { integer: true, hint: '0 — посчитать по площади' }),
    num('switches', 'Выключатели', 'шт', 0, { integer: true, hint: '0 — по числу помещений' }),
    num('spots', 'Точечные светильники', 'шт', 0, { integer: true }), num('lamps', 'Люстры / светильники', 'шт', 0, { integer: true, hint: '0 — по помещению' }),
    num('led', 'Светодиодная лента', 'м', 0), num('street', 'Уличные фонари', 'шт', 0, { integer: true }),
    num('lines', 'Отдельные линии под технику', 'шт', 3, { integer: true, hint: 'Стиральная, посудомойка, духовка, бойлер, кондиционер, тёплый пол' }),
    num('lan', 'Розетки интернет / ТВ', 'шт', 2, { integer: true }),
    yes('stove', 'Электроплита (отдельная линия)', 'yes'), yes('bath', 'Уравнивание потенциалов в ванной', 'yes'),
    yes('protect', 'Реле напряжения (и УЗИП для дома)', 'yes'), yes('flush', 'Щит встраиваемый (ниша в стене)', 'yes'),
    yes('demo', 'Демонтаж старой проводки', 'no'), yes('measure', 'Электроизмерения с протоколом', 'no'),
    yes('input', 'Ввод в дом и счётчик', 'no'), yes('ground', 'Контур заземления', 'no'),
    COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Электромонтаж'); common(b, v);
    const sockets = v.sockets || Math.max(6, Math.round(v.area * 0.5));
    const switches = v.switches || v.rooms + 1;
    const lamps = v.lamps || v.rooms;
    const lines = v.lines || 0, lan = v.lan || 0;
    const cable25 = sockets * 6 + lines * 12;
    const cable15 = (switches + lamps + v.spots) * 5;
    const cableLan = lan * 12;
    const groups = Math.ceil(sockets / 6) + Math.ceil((lamps + v.spots) / 10) + lines + (v.stove === 'yes' ? 1 : 0) + 2;
    const open = v.wall === 'wood';
    const chase = !open && v.wall !== 'gkl';
    if (v.demo === 'yes') { b.sec('Демонтаж').work('Демонтаж электропроводки', v.area * 1.5).work('Демонтаж розетки/выключателя', Math.round(v.area * 0.4)).sec('Электромонтаж'); }
    // в монолите часть трасс идёт в стяжке/по потолку — штроб меньше
    const chaseLen = (cable25 + cable15 + cableLan + (v.stove === 'yes' ? 12 : 0)) * (v.wall === 'concrete' ? 0.4 : 0.55);
    if (chase) {
      b.work({ concrete: 'Штробление стен в бетоне', brick: 'Штробление стен в кирпиче', gas: 'Штробление стен в газобетоне' }[v.wall as 'brick'], chaseLen);
      b.work('Заделка штробы', chaseLen);
    }
    b.work(open ? 'Прокладка кабеля в гофре по стене' : v.wall === 'gkl' ? 'Прокладка кабеля в гофре за ГКЛ' : 'Прокладка кабеля', cable25 + cable15 + (v.stove === 'yes' ? 12 : 0));
    const boxes = sockets + switches + lan;
    if (!open) b.work({ concrete: 'Монтаж подрозетника в бетон', brick: 'Монтаж подрозетника в кирпич', gas: 'Монтаж подрозетника в газобетон', gkl: 'Монтаж подрозетника в ГКЛ' }[v.wall as 'brick'], boxes);
    b.work('Монтаж распределительной коробки', v.rooms * 1.5);
    b.work('Монтаж розетки/выключателя', sockets + switches);
    b.work('Монтаж люстры', lamps); b.work('Монтаж точечного светильника', v.spots); b.work('Монтаж светодиодной ленты', v.led);
    if (v.led) { b.work('Монтаж блока питания для LED-ленты', ceil(v.led / 10)); b.mat('Лента LED 24 В + блок питания + профиль', v.led, 'м', 900); }
    if (v.stove === 'yes') b.work('Подключение электроплиты', 1);
    if (v.bath === 'yes') { b.work('Монтаж выравнивания потенциалов (ванная)', 1); b.mat('ШДУП + провод ПуГВ 4 мм²', 1, 'компл', 900); }
    if (lan) { b.sec('Слаботочка').work('Прокладка кабеля интернет/ТВ', cableLan).work('Монтаж розетки интернет/ТВ', lan); b.mat('Кабель витая пара UTP cat.5e', cableLan * 1.1, 'м', 28); b.mat('Розетка RJ45 / TV (механизм + рамка)', lan, 'шт', 650); }
    b.sec('Щит');
    if (v.flush === 'yes' && chase) b.work(v.wall === 'concrete' ? 'Штробление под электрощит в бетоне' : 'Штробление под электрощит в кирпиче', 1);
    if (v.flush === 'yes') b.work('Монтаж электрощита встраиваемого', 1);
    b.work(groups <= 12 ? 'Сборка электрощита (до 12 модулей)' : groups <= 24 ? 'Сборка электрощита (до 24 модулей)' : 'Сборка электрощита (до 36 модулей)', groups > 36 ? 2 : 1);
    b.work('Монтаж автомата в щит', groups); b.work('Монтаж УЗО/дифавтомата', Math.max(2, Math.ceil(sockets / 10)));
    if (v.protect === 'yes') {
      b.work('Монтаж реле напряжения', 1); b.mat('Реле напряжения 63 А', 1, 'шт', 3200);
      if (v.obj === 'house') { b.work('Монтаж УЗИП', 1); b.mat('УЗИП класс I+II', 1, 'шт', 4500); }
    }
    if (v.measure === 'yes') b.work(v.obj === 'house' ? 'Электроизмерения (протокол) для дома' : 'Электроизмерения (протокол) для квартиры', 1);
    if (v.obj === 'house' || v.input === 'yes') b.sec('Ввод и улица');
    if (v.input === 'yes') { b.work('Ввод электричества в дом', 1); b.work('Монтаж счётчика электроэнергии', 1); b.mat('Счётчик + вводной автомат + СИП-кабель', 1, 'компл', 14000); }
    if (v.ground === 'yes') { b.work('Монтаж контура заземления', 1); b.mat('Комплект заземления (электроды, полоса)', 1, 'компл', 9000); }
    if (v.street) { b.work('Монтаж уличного освещения (столб)', v.street); b.work('Прокладка кабеля в земле (с траншеей)', v.street * 10); b.mat('Кабель бронированный ВБбШв 3×1,5', v.street * 11, 'м', 160); }
    b.sec('Электромонтаж');
    b.mat('Кабель ВВГнг-LS 3×2,5', cable25 * 1.1, 'м', 160); b.mat('Кабель ВВГнг-LS 3×1,5', cable15 * 1.1, 'м', 104);
    if (v.stove === 'yes') b.mat('Кабель ВВГнг-LS 3×6 (плита)', 13, 'м', 337);
    if (open || v.wall === 'gkl') b.mat(open ? 'Гофра / кабель-канал' : 'Гофра ПВХ 20 мм', (cable25 + cable15) * 1.1, 'м', open ? 35 : 12);
    if (chase) b.mat('Гипсовая смесь для заделки штроб (30 кг)', ceil(chaseLen * 0.6 / 30), 'меш', 495);
    b.mat('Подрозетники, коробки', boxes + Math.ceil(v.rooms * 1.5), 'шт', 33);
    b.mat('Розетки и выключатели (механизм + рамка)', sockets + switches, 'шт', 450);
    b.mat('Щит, автоматы, УЗО, шины', 1, 'компл', 6000 + groups * 450);
    b.sum('Розеток', sockets, 'шт').sum('Групп в щите', groups, 'шт').sum('Кабеля', cable25 + cable15, 'м');
    if (chase) b.sum('Штроб', chaseLen, 'пог. м');
    if (v.obj === 'flat' && v.wall === 'concrete') b.warn('Горизонтальные штробы в несущих монолитных стенах запрещены — трассы по потолку/полу');
    return finish(b, v);
  },
};

// =====================================================================
// Сантехник
// =====================================================================
const plumbing: Master = {
  id: 'm-plumb', icon: '🚿', trade: 'Сантехник', title: 'Сантехника: разводка, канализация, приборы, бойлер, фильтры',
  description: 'Разводка по точкам, коллектор или тройники, внутренняя канализация, унитаз/инсталляция, ванна/кабина/трап, бытовая техника',
  fields: [
    sel('pipe', 'Трубы водоснабжения', [['ppr', 'полипропилен'], ['pex', 'сшитый полиэтилен (PEX)'], ['mp', 'металлопластик']], 'ppr'),
    yes('collector', 'Коллекторная разводка', 'no'),
    num('toilets', 'Унитазы обычные', 'шт', 0, { integer: true }), num('install', 'Унитазы на инсталляции', 'шт', 1, { integer: true }),
    num('sinks', 'Раковины', 'шт', 1, { integer: true }), num('baths', 'Ванны', 'шт', 1, { integer: true }), num('cabins', 'Душевые кабины', 'шт', 0, { integer: true }),
    num('drains', 'Душевые трапы', 'шт', 0, { integer: true }), num('kitchen', 'Кухонные мойки', 'шт', 1, { integer: true }),
    yes('washer', 'Стиральная машина', 'yes'), yes('dish', 'Посудомоечная машина', 'no'), yes('rail', 'Полотенцесушитель', 'yes'),
    yes('boiler', 'Бойлер', 'no'), yes('filters', 'Фильтры и счётчики', 'yes'),
    yes('demo', 'Демонтаж старой сантехники', 'no'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Разводка'); common(b, v);
    const fixtures = v.toilets + v.install + v.sinks + v.baths + v.cabins + v.kitchen + (v.washer === 'yes' ? 1 : 0) + (v.dish === 'yes' ? 1 : 0);
    const water = v.toilets + v.install + 2 * (v.sinks + v.baths + v.cabins + v.kitchen) + (v.washer === 'yes' ? 1 : 0) + (v.dish === 'yes' ? 1 : 0) + (v.rail === 'yes' ? 2 : 0);
    const sewer = fixtures + v.drains;
    if (v.demo === 'yes') b.sec('Демонтаж').work('Демонтаж унитаза', v.toilets + v.install).work('Демонтаж ванны чугунной', v.baths).sec('Разводка');
    if (v.collector === 'yes') { b.work('Установка коллектора', 2); b.mat('Коллекторы ХВС/ГВС с кранами', 2, 'шт', 4800); }
    b.work('Монтаж точки водоснабжения (вывод)', water);
    b.work('Прокладка трубы водоснабжения', water * (v.collector === 'yes' ? 6 : 3.5));
    b.mat({ ppr: 'Труба PPR армированная 20–25 мм', pex: 'Труба PEX 16–20 мм', mp: 'Труба металлопластиковая 16–20 мм' }[v.pipe as 'ppr'], water * (v.collector === 'yes' ? 6 : 3.5) * 1.1, 'м', { ppr: 120, pex: 160, mp: 140 }[v.pipe as 'ppr']);
    b.mat('Фитинги, водорозетки, краны', water, 'компл', 650);
    b.sec('Канализация');
    b.work('Прокладка канализационной трубы внутри', sewer * 2.5); b.work('Подключение сантехприбора к канализации', sewer);
    b.mat('Трубы и фасонные части канализации 50/110', sewer * 2.7, 'м', 220);
    b.sec('Сантехприборы');
    b.work('Установка унитаза', v.toilets); b.work('Установка инсталляции', v.install); b.work('Установка раковины', v.sinks);
    b.work('Установка ванны', v.baths); b.work('Установка душевой кабины', v.cabins); b.work('Установка душевого трапа', v.drains);
    b.work('Установка кухонной мойки', v.kitchen); b.work('Установка смесителя', v.sinks + v.baths + v.cabins + v.kitchen);
    if (v.washer === 'yes') b.work('Установка стиральной машины', 1);
    if (v.dish === 'yes') b.work('Установка посудомоечной машины', 1);
    if (v.rail === 'yes') b.work('Установка полотенцесушителя', 1);
    if (v.boiler === 'yes') { b.work('Монтаж бойлера', 1); b.mat('Группа безопасности бойлера', 1, 'компл', 1800); }
    if (v.install) b.mat('Инсталляция с кнопкой', v.install, 'компл', 24000);
    if (v.filters === 'yes') { b.work('Установка фильтра грубой очистки', 2); b.work('Установка счётчика воды', 2); b.mat('Фильтры, счётчики, редуктор давления', 1, 'компл', 6500); }
    b.work('Опрессовка системы', 1);
    b.sum('Точек водоснабжения', water, 'шт').sum('Точек канализации', sewer, 'шт');
    return finish(b, v);
  },
};

// =====================================================================
// Гипсокартонщик
// =====================================================================
const gkl: Master = {
  id: 'm-gkl', icon: '📐', trade: 'Монтажник ГКЛ', title: 'Гипсокартон: перегородки, обшивка, потолки, короба, ниши',
  description: 'Обычный, влагостойкий, огнестойкий, ГВЛ. Один или два слоя, звукоизоляция, шпаклёвка стыков',
  fields: [
    sel('kind', 'Что делаем', [['part', 'перегородка'], ['wall', 'обшивка стен на каркасе'], ['glue', 'обшивка стен на клей'], ['ceil1', 'потолок в 1 уровень'], ['ceil2', 'потолок в 2 уровня'], ['box', 'короб (пог. м)']], 'part'),
    num('len', 'Длина (или длина короба)', 'м', 5), num('h', 'Высота (для потолка — ширина)', 'м', 2.7),
    sel('board', 'Лист', [['std', 'ГКЛ обычный'], ['moist', 'ГКЛВ влагостойкий'], ['fire', 'ГКЛО огнестойкий'], ['gvl', 'ГВЛ']], 'std'),
    sel('layers', 'Слоёв с каждой стороны', [['1', '1'], ['2', '2']], '1'),
    yes('sound', 'Звукоизоляция минватой', 'yes'), num('doors', 'Дверные проёмы в перегородке', 'шт', 1, { integer: true }),
    num('niches', 'Ниши', 'шт', 0, { integer: true }), num('hatches', 'Ревизионные люки', 'шт', 0, { integer: true }),
    yes('putty', 'Шпаклёвка стыков', 'yes'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Гипсокартон'); common(b, v);
    const A = v.kind === 'box' ? v.len * 1.2 : v.len * v.h;
    const sides = v.kind === 'part' ? 2 : 1;
    const layers = Number(v.layers) || 1;
    const work = { part: 'Перегородка из ГКЛ', wall: 'Обшивка стен ГКЛ на каркасе', glue: 'Облицовка стен ГКЛ на клей', ceil1: 'Потолок из ГКЛ в 1 уровень', ceil2: 'Потолок из ГКЛ в 2 уровня', box: 'Короб из ГКЛ' }[v.kind as 'part'];
    b.work(work, v.kind === 'box' ? v.len : A, { k: layers === 2 ? 1.35 : 1, note: layers === 2 ? 'в 2 слоя' : undefined });
    const boards = A * sides * layers * (v.kind === 'ceil2' ? 1.5 : 1) * 1.1;
    const bp = { std: 530, moist: 697, fire: 784, gvl: 720 }[v.board as 'std'];
    b.mat(`${{ std: 'ГКЛ', moist: 'ГКЛВ', fire: 'ГКЛО', gvl: 'ГВЛ' }[v.board as 'std']} 12,5 мм (1,2×2,5)`, ceil(boards / 3), 'лист', bp);
    if (v.kind !== 'glue') {
      const prof = v.kind === 'part' ? A * 2.2 : A * 3;
      b.mat(v.kind === 'part' ? 'Профиль ПН/ПС 50–75 (3 м)' : 'Профиль ПП 60×27 и ППН 27×28 (3 м)', ceil(prof / 3), 'шт', 230);
      b.mat('Подвесы, дюбели, саморезы', ceil(A / 8), 'компл', 700);
    } else b.mat('Клей гипсовый монтажный (30 кг)', ceil(A * 4 / 30), 'меш', 586);
    if (v.sound === 'yes' && ['part', 'wall', 'ceil1', 'ceil2'].includes(v.kind)) { b.work('Шумоизоляция стен', A, { k: 0.5, note: 'минвата в каркас' }); b.mat('Минвата акустическая 50 мм', A * 1.05, 'м²', 432); }
    if (v.kind === 'part' && v.doors) { b.work('Монтаж закладных и гильз', v.doors * 2); b.mat('Брус/профиль усиления проёма', v.doors * 6, 'м', 120); }
    b.work('Ниша из ГКЛ', v.niches); b.work('Монтаж ревизионного люка', v.hatches); if (v.hatches) b.mat('Ревизионный люк', v.hatches, 'шт', 1370);
    if (v.putty === 'yes') { b.work('Шпаклёвка стыков ГКЛ', A * sides); b.mat('Шпаклёвка для швов + серпянка', ceil(A * sides / 25), 'компл', 900); }
    b.sum('Площадь', A, 'м²').sum('Листов', ceil(boards / 3), 'шт');
    if (v.board === 'std' && v.kind !== 'box') b.warn('Для санузла и кухни берите влагостойкий ГКЛВ');
    return finish(b, v);
  },
};

// =====================================================================
// Фундаментщик
// =====================================================================
const foundation: Master = {
  id: 'm-found', icon: '🏗', trade: 'Фундаментщик', title: 'Фундамент: лента, плита, сваи, ростверк, отмостка',
  description: 'Земляные работы, подушка, опалубка, арматура, бетон с насосом, гидроизоляция, утепление ЭППС, дренаж и отмостка',
  fields: [
    sel('type', 'Тип фундамента', [['strip', 'ленточный'], ['slab', 'монолитная плита'], ['pile', 'свайно-ростверковый (ТИСЭ)'], ['screw', 'винтовые сваи']], 'strip'),
    num('L', 'Длина дома', 'м', 10), num('W', 'Ширина дома', 'м', 8), num('inner', 'Внутренние несущие стены', 'м', 10),
    num('bw', 'Ширина ленты', 'м', 0.4), num('bh', 'Высота ленты', 'м', 1.2), num('slab', 'Толщина плиты', 'м', 0.25), num('step', 'Шаг свай', 'м', 1.5, { min: 0.5, max: 4 }),
    yes('pump', 'Бетононасос', 'yes'), yes('hydro', 'Гидроизоляция', 'yes'), yes('ins', 'Утепление ЭППС', 'yes'),
    yes('drain', 'Дренаж по периметру', 'no'), yes('blind', 'Отмостка 1 м', 'yes'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Земляные работы'); common(b, v);
    const P = 2 * (v.L + v.W), Lt = P + (v.inner || 0);
    let conc = 0, rebarT = 0;
    if (v.type === 'strip') {
      conc = Lt * v.bw * v.bh;
      b.work('Рытьё котлована экскаватором', Lt * (v.bw + 0.6) * (v.bh - 0.3 + 0.3));
      b.work('Устройство песчаной подушки с уплотнением', Lt * (v.bw + 0.2) * 0.3);
      b.sec('Фундамент').work('Ленточный фундамент под ключ (без материала)', conc);
      rebarT = Lt * 6 * 0.888 / 1000 + Lt * 4 * 0.222 / 1000 * 2;
      b.mat('Доска опалубки 25×150', Lt * 2 * (v.bh + 0.1) * 0.025 * 1.15, 'м³', 28800);
    }
    if (v.type === 'slab') {
      const A = v.L * v.W;
      conc = A * v.slab + P * 0.3 * 0.3;
      b.work('Рытьё котлована экскаватором', (v.L + 1) * (v.W + 1) * 0.5);
      b.work('Устройство песчаной подушки с уплотнением', A * 0.3); b.work('Устройство щебёночной подушки с уплотнением', A * 0.15);
      b.sec('Фундамент').work('Монолитная плита под ключ (без материала)', A);
      rebarT = A * 2 * 2 / 0.2 * 0.888 / 1000 * 1.1;
      b.mat('Щебень фр. 20–40', A * 0.15 * 1.2, 'м³', 2300);
    }
    if (v.type === 'pile') {
      const piles = ceil(Lt / v.step);
      conc = piles * Math.PI * 0.15 ** 2 * 2 + Lt * 0.4 * 0.5;
      b.sec('Фундамент').work('Бурение под сваи ТИСЭ', piles).work('Свайно-ростверковый фундамент (работа)', Lt);
      rebarT = (piles * 4 * 2.2 * 0.888 + Lt * 6 * 0.888) / 1000;
      b.mat('Доска опалубки ростверка', Lt * 2 * 0.6 * 0.025 * 1.15, 'м³', 28800);
      b.sum('Свай', piles, 'шт');
    }
    if (v.type === 'screw') {
      const piles = ceil(Lt / Math.min(v.step, 2.5)) + 4;
      b.sec('Фундамент').work('Монтаж винтовых свай', piles);
      b.mat('Свая винтовая 108 мм, 2,5 м, с оголовком', piles, 'шт', 3600);
      b.mat('Обвязка: швеллер / брус', Lt, 'м', 900);
      b.sum('Свай', piles, 'шт');
    }
    b.sec('Материалы');
    if (conc) {
      b.mat('Бетон М300 с доставкой', conc * 1.03, 'м³', 7200);
      if (v.pump === 'yes') b.work('Подача бетона бетононасосом', Math.max(1, ceil(conc / 60)));
      else b.work('Доставка бетона миксером', ceil(conc / 7));
    }
    if (rebarT) { b.work('Вязка арматуры', rebarT); b.mat('Арматура А500 Ø12 + вязальная проволока', rebarT * 1.08, 'т', 72000); }
    if (v.type !== 'screw') b.mat('Песок для подушки', v.type === 'slab' ? v.L * v.W * 0.3 * 1.25 : Lt * (v.bw + 0.2) * 0.3 * 1.25, 'м³', 1100);
    b.sec('Гидроизоляция и утепление');
    const side = v.type === 'slab' ? P * 0.45 : v.type === 'screw' ? 0 : P * (v.type === 'strip' ? v.bh : 0.5);
    if (v.hydro === 'yes' && side) { b.work('Гидроизоляция фундамента обмазочная', side); b.mat('Мастика битумная (20 кг)', ceil(side * 1.5 / 20), 'ведро', 4257); }
    if (v.ins === 'yes' && v.type !== 'screw') {
      const ins = side + (v.type === 'slab' ? v.L * v.W : 0);
      b.work('Утепление фундамента ЭППС', ins); b.mat('ЭППС 50 мм', ins * 1.05, 'м²', 460);
    }
    if (v.drain === 'yes') { b.work('Устройство дренажа вокруг фундамента', P + 4); b.mat('Дренажная труба в фильтре, геотекстиль, щебень', P + 4, 'м', 900); }
    if (v.blind === 'yes') { b.work('Устройство бетонной отмостки', (P + 4) * 1); }
    if (v.type !== 'screw') b.work('Мини-экскаватор', Math.max(1, ceil(Lt / 60)));
    b.sum('Бетон', conc, 'м³').sum('Арматура', rebarT, 'т');
    return finish(b, v, false);
  },
};

// =====================================================================
// Каменщик
// =====================================================================
const mason: Master = {
  id: 'm-mason', icon: '🧱', trade: 'Каменщик', title: 'Кладка стен: кирпич, газобетон, керамзит, керамоблок, облицовка',
  description: 'Наружные стены и перегородки, проёмы, армирование, армопояс, перемычки, облицовочный кирпич и расшивка',
  fields: [
    sel('mat', 'Материал стен', [['gas', 'газобетон D500'], ['brick1', 'кирпич в 1 кирпич (250)'], ['brick15', 'кирпич в 1,5 кирпича (380)'], ['keramzit', 'керамзитобетонный блок'], ['ceramic', 'керамический блок']], 'gas'),
    num('P', 'Длина стен', 'м', 36), num('H', 'Высота этажа', 'м', 3), num('floors', 'Этажей', 'шт', 1, { integer: true, min: 1 }),
    num('t', 'Толщина (для блоков)', 'м', 0.3), num('open', 'Проёмы (окна + двери)', 'м²', 20),
    num('parts', 'Перегородки в полкирпича / ПГП', 'м²', 0), num('lintels', 'Перемычки', 'пог. м', 12),
    yes('belt', 'Армопояс', 'yes'), sel('facing', 'Облицовочный кирпич', [['no', 'нет'], ['yes', 'да, с расшивкой']], 'no'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Кладка'); common(b, v);
    const wallA = Math.max(0, v.P * v.H * v.floors - v.open);
    const t = v.mat === 'brick1' ? 0.25 : v.mat === 'brick15' ? 0.38 : v.t;
    const vol = wallA * t;
    const w = { gas: 'Кладка газобетонных блоков', brick1: 'Кладка кирпича в 1 кирпич', brick15: 'Кладка кирпича в 1,5 кирпича', keramzit: 'Кладка керамзитобетонных блоков', ceramic: 'Кладка керамических блоков' }[v.mat as 'gas'];
    b.work(w, vol);
    if (v.mat === 'gas') { b.mat(`Газобетон D500 ${Math.round(t * 1000)} мм`, vol * 1.05, 'м³', 7290); b.mat('Клей для газобетона (25 кг)', ceil(vol * 1.1), 'меш', 415); b.work('Армирование кладки', v.P * v.floors * Math.floor(v.H / 1) ); b.mat('Арматура Ø8 для армирования', v.P * v.floors * Math.floor(v.H / 1) * 2, 'м', 45); }
    if (v.mat.startsWith('brick')) { b.mat('Кирпич рядовой М150', vol * 400 * 1.05, 'шт', 26); b.mat('Кладочный раствор М150', vol * 0.24, 'м³', 5200); b.work('Армирование кладки', v.P * v.floors * v.H / 0.6); }
    if (v.mat === 'keramzit') { b.mat('Керамзитобетонный блок 390×190×188', vol * 72 * 1.05, 'шт', 75); b.mat('Кладочный раствор', vol * 0.18, 'м³', 5200); }
    if (v.mat === 'ceramic') { b.mat('Керамический блок', vol * 1.05, 'м³', 9500); b.mat('Тёплый кладочный раствор', vol * 0.12, 'м³', 7500); }
    b.work('Кладка перегородок в полкирпича', v.parts); if (v.parts) b.mat('Кирпич для перегородок', v.parts * 52 * 1.05, 'шт', 26);
    b.work('Устройство перемычек', v.lintels); if (v.lintels) b.mat('Перемычки / уголок, арматура', v.lintels, 'пог. м', 650);
    if (v.belt === 'yes') { b.work('Устройство армопояса', v.P * v.floors); b.mat('Бетон, арматура, U-блоки для армопояса', v.P * v.floors, 'пог. м', 950); }
    if (v.facing === 'yes') { b.sec('Облицовка'); b.work('Кладка облицовочного кирпича', wallA); b.work('Расшивка швов', wallA); b.mat('Кирпич облицовочный', wallA * 52 * 1.05, 'шт', 54); b.mat('Цветная кладочная смесь (25 кг)', ceil(wallA * 1.6), 'меш', 450); b.mat('Гибкие связи', wallA * 5, 'шт', 18); }
    b.work('Строительные леса (монтаж/демонтаж)', v.P * v.H * v.floors * (v.floors > 1 ? 1 : 0.5));
    b.sum('Площадь стен без проёмов', wallA, 'м²').sum('Объём кладки', vol, 'м³');
    return finish(b, v, false);
  },
};

// =====================================================================
// Фасадчик
// =====================================================================
const facade: Master = {
  id: 'm-facade', icon: '🏘', trade: 'Фасадчик', title: 'Фасад: утепление, штукатурка, вентфасад, сайдинг, клинкер',
  description: 'Мокрый фасад (минвата/ППС), вентфасад (сайдинг, панели, керамогранит), клинкер, блок-хаус, покраска; леса, откосы, отливы, цоколь',
  fields: [
    num('P', 'Периметр дома', 'м', 36), num('H', 'Высота фасада', 'м', 6), num('open', 'Окна и двери', 'м²', 25),
    sel('sys', 'Система', [['wetmv', 'мокрый фасад, минвата'], ['wetps', 'мокрый фасад, пенополистирол'], ['siding', 'вентфасад: сайдинг'], ['panels', 'вентфасад: фасадные панели'], ['porcelain', 'вентфасад: керамогранит'], ['clinker', 'клинкерная плитка'], ['blockhouse', 'блок-хаус / имитация бруса'], ['paint', 'только покраска']], 'wetmv'),
    sel('ins', 'Утеплитель', [['0', 'без утепления'], ['50', '50 мм'], ['100', '100 мм'], ['150', '150 мм']], '100'),
    num('slopes', 'Откосы окон', 'пог. м', 0, { hint: '0 — посчитать по окнам' }), num('sills', 'Отливы', 'пог. м', 0, { hint: '0 — по окнам' }),
    num('plinth', 'Облицовка цоколя', 'м²', 0), yes('scaff', 'Строительные леса', 'yes'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Фасад'); common(b, v);
    const A = Math.max(0, v.P * v.H - v.open);
    const windows = Math.max(1, Math.round(v.open / 2));
    const slopes = v.slopes || windows * 5, sills = v.sills || windows * 1.4;
    const ins = Number(v.ins) || 0;
    if (v.scaff === 'yes') b.work('Строительные леса (монтаж/демонтаж)', v.P * v.H);
    if (v.sys === 'wetmv' || v.sys === 'wetps') {
      b.work(v.sys === 'wetmv' ? 'Утепление фасада минватой под штукатурку' : 'Утепление фасада пенополистиролом', A);
      b.mat(v.sys === 'wetmv' ? `Минвата фасадная ${ins || 100} мм` : `Пенополистирол фасадный ${ins || 100} мм`, A * (ins || 100) / 1000 * 1.05, 'м³', v.sys === 'wetmv' ? 7500 : 4200);
      b.mat('Клей для утеплителя и армирования (25 кг)', ceil(A * 9 / 25), 'меш', 863); b.mat('Сетка фасадная 160 г/м²', A * 1.15, 'м²', 83);
      b.mat('Дюбели-зонтики', A * 6, 'шт', 9); b.work('Декоративная штукатурка фасада', A); b.mat('Декоративная штукатурка «короед»', A * 3, 'кг', 53);
      b.work('Покраска фасада', A); b.mat('Фасадная краска (9 л)', ceil(A * 0.3 / 9), 'ведро', 8300);
    } else if (['siding', 'panels', 'porcelain', 'blockhouse'].includes(v.sys)) {
      if (ins) { b.work('Монтаж подсистемы вентфасада', A); b.mat(`Минвата фасадная ${ins} мм`, A * ins / 1000 * 1.05, 'м³', 19000); b.mat('Ветрозащитная мембрана', A * 1.15, 'м²', 90); }
      else b.work('Монтаж подсистемы вентфасада', A, { k: 0.6, note: 'без утеплителя' });
      b.mat(v.sys === 'porcelain' ? 'Подсистема алюминиевая с кронштейнами' : 'Подсистема (профиль / брус)', A, 'м²', v.sys === 'porcelain' ? 1100 : 350);
      const m: Record<string, [string, string, number]> = {
        siding: ['Монтаж сайдинга', 'Сайдинг виниловый с доборами', 650], panels: ['Монтаж фасадных панелей', 'Фасадные панели', 1250],
        porcelain: ['Монтаж керамогранита на вентфасад', 'Керамогранит фасадный 600×600 с кляммерами', 1900], blockhouse: ['Монтаж блок-хауса', 'Блок-хаус хвоя', 1300],
      };
      const [w, mn, p] = m[v.sys];
      b.work(w, A); b.mat(`${mn} (+10%)`, A * 1.1, 'м²', p);
      if (v.sys === 'blockhouse') { b.work('Покраска деревянных поверхностей', A); b.mat('Антисептик/масло для фасада', A * 0.25, 'л', 650); }
    } else if (v.sys === 'clinker') {
      if (ins) { b.work('Утепление фасада пенополистиролом', A); b.mat(`Пенополистирол ${ins} мм`, A * ins / 1000 * 1.05, 'м³', 4790); }
      b.work('Облицовка фасада клинкерной плиткой', A); b.mat('Клинкерная плитка (+8%)', A * 1.08, 'м²', 2390); b.mat('Клей и затирка для клинкера', ceil(A * 8 / 25), 'меш', 900);
    } else { b.work('Покраска фасада', A); b.mat('Фасадная краска (9 л)', ceil(A * 0.3 / 9), 'ведро', 8300); }
    b.sec('Доборные элементы');
    b.work('Монтаж откосов фасадных', slopes); b.mat('Откосы фасадные (сталь / штукатурка)', slopes, 'пог. м', 450);
    b.work('Монтаж отливов', sills); b.mat('Отливы оконные', sills * 1.05, 'пог. м', 350);
    if (v.plinth) { b.work('Облицовка цоколя', v.plinth); b.mat('Цокольные панели / плитка', v.plinth * 1.1, 'м²', 1300); }
    b.sum('Площадь фасада', A, 'м²');
    return finish(b, v, false);
  },
};

// =====================================================================
// Септик и канализация
// =====================================================================
const septic: Master = {
  id: 'm-septic', icon: '♻️', trade: 'Септики', title: 'Канализация под ключ: септик, станция, кольца, дренажное поле',
  description: 'Подбор объёма по числу жильцов, котлован, трасса до дома, утепление, отведение очищенной воды',
  fields: [
    sel('type', 'Тип очистки', [['bio', 'станция биоочистки (Топас и аналоги)'], ['plastic', 'пластиковый септик'], ['rings', 'септик из бетонных колец']], 'bio'),
    num('people', 'Проживает человек', 'чел', 4, { integer: true, min: 1 }), num('dist', 'Расстояние до дома', 'м', 8),
    num('depth', 'Глубина выпуска из дома', 'м', 0.8),
    sel('out', 'Отвод очищенной воды', [['field', 'дренажное (фильтрационное) поле'], ['well', 'фильтрационный колодец'], ['ditch', 'в канаву / ливнёвку'], ['none', 'не нужен (откачка)']], 'well'),
    yes('ins', 'Утепление трубы и септика', 'yes'), num('revisions', 'Ревизионные колодцы', 'шт', 0, { integer: true }), yes('pump', 'Принудительный выброс (насос)', 'no'), COMPLEXITY,
  ],
  build: (v) => {
    const b = new Builder('Септик'); common(b, v);
    const vol = Math.max(2, v.people * 0.2 * 3);
    b.work('Экскаватор-погрузчик', 1);
    if (v.type === 'bio') { b.work('Монтаж станции биоочистки (Топас и аналоги)', 1); b.mat(`Станция биоочистки на ${v.people} чел.`, 1, 'шт', 85000 + v.people * 7000); b.mat('Кабель питания станции', v.dist + 5, 'м', 90); }
    if (v.type === 'plastic') { b.work('Монтаж пластикового септика', 1); b.mat(`Пластиковый септик ${Math.ceil(vol)} м³`, 1, 'шт', 35000 + vol * 9000); b.mat('ЦПС для обсыпки', vol * 0.8, 'м³', 3200); }
    if (v.type === 'rings') {
      const rings = Math.max(4, Math.ceil(vol / 1.1)) + 2;
      b.work('Монтаж септика из бетонных колец', 1); b.mat('Кольцо КС-15-9', rings, 'шт', 4800); b.mat('Днище и крышка с люком', 2, 'компл', 9000);
      b.mat('Герметик швов, переливы', 1, 'компл', 4500); b.work('Автокран 25 т', 1);
    }
    b.sec('Трасса до дома');
    b.work('Прокладка наружной канализации (с траншеей)', v.dist); b.mat('Труба канализационная 110 мм наружная', v.dist * 1.1, 'м', 380);
    b.work('Установка ревизионного колодца', v.revisions || (v.dist > 15 ? 1 : 0));
    if (v.ins === 'yes') { b.work('Утепление септика', 1); b.work('Утепление трубы водопровода', v.dist); b.mat('Утеплитель ЭППС 50 мм', 6 + v.dist * 0.6, 'м²', 460); }
    b.sec('Отвод воды');
    if (v.out === 'field') { b.work('Монтаж дренажного (фильтрационного) поля', v.people * 5); b.mat('Щебень, геотекстиль, дренажные трубы', v.people * 5, 'м²', 1400); }
    if (v.out === 'well') { b.work('Монтаж дренажного колодца', 1); b.mat('Кольца, щебень для фильтрационного колодца', 1, 'компл', 18000); }
    if (v.out === 'ditch') { b.work('Устройство дренажной канавы открытой', 10); }
    if (v.pump === 'yes') { b.work('Монтаж канализационного насоса (КНС)', 1); b.mat('Дренажный насос с поплавком', 1, 'шт', 9000); }
    b.sum('Объём септика (3 суток)', vol, 'м³');
    if (v.depth > 1.2 && v.type !== 'rings') b.warn('Глубокий выпуск — нужна удлинённая горловина у станции или септика');
    if (v.dist < 5) b.warn('Нормы: септик не ближе 5 м от дома');
    return finish(b, v, false);
  },
};

// =====================================================================
// Скважины и колодцы, водоснабжение дома
// =====================================================================
const well: Master = {
  id: 'm-well', icon: '💧', trade: 'Водоснабжение участка', title: 'Скважина или колодец + вода в дом',
  description: 'Бурение на песок или известняк, колодец из колец, кессон или адаптер, насос, автоматика, водопровод до дома, водоочистка',
  fields: [
    sel('src', 'Источник', [['sand', 'скважина на песок'], ['lime', 'скважина на известняк'], ['ring', 'колодец из колец']], 'sand'),
    num('depth', 'Глубина', 'м', 30), sel('arr', 'Обустройство', [['caisson', 'кессон'], ['adapter', 'скважинный адаптер'], ['house', 'домик (для колодца)']], 'caisson'),
    num('dist', 'Расстояние до дома', 'м', 10), yes('heat', 'Греющий кабель в трубу', 'no'),
    yes('filter', 'Система водоочистки', 'no'), yes('pumpst', 'Насосная станция в доме вместо погружного', 'no'), COMPLEXITY,
  ],
  build: (v) => {
    const b = new Builder('Источник'); common(b, v);
    if (v.src === 'ring') {
      const rings = Math.max(4, Math.ceil(v.depth / 0.9));
      b.work('Копка колодца (одно кольцо)', rings); b.work('Монтаж колодезного кольца', rings); b.work('Глиняный замок колодца', 1);
      b.mat('Кольцо КС-10-9', rings, 'шт', 3200); b.mat('Донный фильтр (щебень/шунгит)', 0.5, 'м³', 4000);
      b.work('Монтаж домика на колодец', v.arr === 'house' ? 1 : 0); if (v.arr === 'house') b.mat('Домик для колодца', 1, 'шт', 12000);
    } else {
      b.work(v.src === 'sand' ? 'Бурение скважины на песок' : 'Бурение скважины на известняк', v.depth);
      b.work('Обсадная труба (монтаж)', v.depth); b.mat('Обсадная труба НПВХ 125 мм', v.depth, 'м', 1100);
      if (v.arr === 'caisson') { b.work('Обустройство скважины кессоном', 1); b.mat('Кессон пластиковый', 1, 'шт', 42000); }
      else b.work('Монтаж адаптера скважинного', 1), b.mat('Скважинный адаптер', 1, 'шт', 6500);
    }
    b.sec('Насос и автоматика');
    if (v.pumpst === 'yes' || (v.src === 'ring' && v.depth <= 8)) { b.work('Монтаж насосной станции', 1); b.mat('Насосная станция', 1, 'шт', 12400); }
    else { b.work('Монтаж скважинного насоса', 1); b.mat('Погружной насос + трос + кабель', 1, 'компл', 28000 + v.depth * 250); b.mat('Гидроаккумулятор 100 л + реле давления', 1, 'компл', 11400); }
    b.sec('Водопровод до дома');
    b.work('Прокладка водопровода от скважины (с траншеей)', v.dist); b.mat('Труба ПНД 32 мм', v.dist * 1.1 + v.depth, 'м', 95);
    b.work('Утепление трубы водопровода', v.dist); b.mat('Утеплитель для трубы', v.dist, 'м', 120);
    if (v.heat === 'yes') { b.work('Монтаж тёплого кабеля в трубу/водосток', v.dist); b.mat('Греющий кабель', v.dist, 'м', 900); }
    if (v.filter === 'yes') { b.work('Установка системы водоочистки', 1); b.mat('Система водоочистки (обезжелезивание, умягчение)', 1, 'компл', 65000); }
    b.work('Установка фильтра грубой очистки', 1);
    if (v.src === 'sand' && v.depth > 45) b.warn('На песок обычно бурят до 30–50 м; глубже — проверьте разрез по соседям');
    return finish(b, v, false);
  },
};

// =====================================================================
// Отопление
// =====================================================================
const heating: Master = {
  id: 'm-heat', icon: '🔥', trade: 'Отопление', title: 'Отопление дома: котёл, обвязка, радиаторы, тёплый пол',
  description: 'Газовый настенный/напольный, электрокотёл, твердотопливный, тепловой насос. Радиаторы по площади, разводка, бойлер, дымоход',
  fields: [
    num('area', 'Отапливаемая площадь', 'м²', 120), num('rooms', 'Помещений с радиаторами', 'шт', 8, { integer: true }),
    sel('src', 'Котёл', [['gaswall', 'газовый настенный'], ['gasfloor', 'газовый напольный'], ['electric', 'электрокотёл'], ['solid', 'твердотопливный'], ['hp', 'тепловой насос']], 'gaswall'),
    sel('pipes', 'Разводка', [['ppr', 'полипропилен'], ['pex', 'PEX (коллекторная)'], ['steel', 'нержавеющая гофра']], 'ppr'),
    num('floor', 'Водяной тёплый пол', 'м²', 0), yes('boiler', 'Бойлер косвенного нагрева', 'yes'),
    yes('buffer', 'Буферная ёмкость', 'no'), yes('chimney', 'Дымоход (кроме коаксиального)', 'no'), COMPLEXITY,
  ],
  build: (v) => {
    const b = new Builder('Котельная'); common(b, v);
    const kw = Math.ceil(v.area / 10 * 1.2);
    const rad = Math.max(v.rooms, Math.ceil(v.area / 15));
    const w = { gaswall: 'Монтаж котла настенного', gasfloor: 'Монтаж напольного котла', electric: 'Монтаж электрокотла', solid: 'Монтаж твердотопливного котла', hp: 'Монтаж теплового насоса' }[v.src as 'gaswall'];
    b.work(w, 1);
    b.mat(`Котёл ${kw} кВт (${{ gaswall: 'газовый настенный', gasfloor: 'газовый напольный', electric: 'электрический', solid: 'твердотопливный', hp: 'тепловой насос' }[v.src as 'gaswall']})`, 1, 'шт',
      { gaswall: 55000, gasfloor: 90000, electric: 35000, solid: 80000, hp: 450000 }[v.src as 'gaswall'] + kw * 400);
    b.work('Обвязка котельной', 1); b.mat('Обвязка: насосы, бак, группа безопасности, арматура', 1, 'компл', 45000);
    if (v.src === 'gaswall') b.work('Монтаж коаксиального дымохода', 1);
    if (v.chimney === 'yes' || ['gasfloor', 'solid'].includes(v.src)) { b.work('Монтаж дымохода', 7); b.mat('Сэндвич-дымоход нерж.', 7, 'пог. м', 4200); }
    if (v.boiler === 'yes') { b.work('Монтаж бойлера косвенного нагрева', 1); b.mat('Бойлер косвенного нагрева 150 л', 1, 'шт', 45000); }
    if (v.buffer === 'yes' || v.src === 'solid' || v.src === 'hp') { b.work('Монтаж буферной ёмкости', 1); b.mat('Буферная ёмкость 300 л', 1, 'шт', 55000); }
    if (v.floor) { b.work('Монтаж гидрострелки', 1); }
    b.sec('Радиаторы и разводка');
    b.work('Монтаж радиатора', rad); b.mat('Радиатор стальной панельный с кронштейнами', rad, 'шт', 4970); b.mat('Краны, термоголовки, Маевского', rad, 'компл', 2600);
    const pipeM = rad * 9;
    b.work('Прокладка трубы отопления', pipeM); b.mat({ ppr: 'Труба PPR армированная 25–32', pex: 'Труба PEX 16–20', steel: 'Гофра нержавеющая 15–20' }[v.pipes as 'ppr'], pipeM * 1.1, 'м', { ppr: 160, pex: 170, steel: 380 }[v.pipes as 'ppr']);
    if (v.pipes === 'pex') { b.work('Монтаж коллекторной группы тёплого пола', 1); b.mat('Коллектор радиаторный', 1, 'компл', 14000); }
    if (v.floor) {
      b.sec('Тёплый пол');
      b.work('Монтаж тёплого водяного пола', v.floor); b.work('Монтаж коллекторной группы тёплого пола', 1);
      b.mat('Труба PE-Xa 16 мм', v.floor * 6.7, 'м', 164); b.mat('ЭППС, сетка, демпферная лента', v.floor, 'м²', 420); b.mat('Коллектор тёплого пола со смесительным узлом', 1, 'компл', 22000);
    }
    b.work('Опрессовка системы отопления', 1);
    b.sum('Мощность котла (с запасом)', kw, 'кВт').sum('Радиаторов', rad, 'шт');
    if (v.src === 'electric' && kw > 15) b.warn(`Электрокотёл ${kw} кВт — проверьте выделенную мощность и трёхфазный ввод`);
    return finish(b, v);
  },
};

// =====================================================================
// Благоустройство: мощение, парковка
// =====================================================================
const paving: Master = {
  id: 'm-paving', icon: '🛣', trade: 'Благоустройство', title: 'Мощение и площадки: плитка, брусчатка, гранит, асфальт, щебень',
  description: 'Пешеходная или под автомобиль — нужное основание. Бордюры, ливнёвые лотки, геотекстиль, газон по краям',
  fields: [
    num('area', 'Площадь', 'м²', 60), sel('use', 'Нагрузка', [['walk', 'пешеходная'], ['car', 'под легковой автомобиль'], ['truck', 'под грузовую технику']], 'car'),
    sel('cover', 'Покрытие', [['tile', 'тротуарная плитка 60 мм'], ['paver', 'брусчатка 80 мм'], ['granite', 'гранитная плитка'], ['asphalt', 'асфальт'], ['crumb', 'асфальтовая крошка'], ['rubble', 'щебень (с бордюром)'], ['geo', 'газонная решётка / георешётка']], 'tile'),
    num('curb', 'Бордюр', 'пог. м', 30), num('drain', 'Ливнёвые лотки', 'пог. м', 0), num('lawn', 'Газон по краям', 'м²', 0),
    yes('dig', 'Выемка и вывоз грунта', 'yes'), COMPLEXITY,
  ],
  build: (v) => {
    const b = new Builder('Основание'); common(b, v);
    const A = v.area;
    const base = { walk: [0.1, 0.05], car: [0.2, 0.05], truck: [0.3, 0.05] }[v.use as 'walk'];
    const depth = base[0] + base[1] + (v.cover === 'paver' ? 0.08 : 0.06);
    if (v.dig === 'yes') { b.work('Разработка грунта экскаватором', A * depth); b.work('Вывоз грунта', A * depth * 1.2); b.work('Экскаватор-погрузчик', A > 80 ? 2 : 1); }
    b.work('Укладка геотекстиля', A); b.mat('Геотекстиль 200 г/м²', A * 1.15, 'м²', 63);
    b.work('Устройство щебёночной подушки с уплотнением', A * base[0]); b.mat('Щебень фр. 20–40', A * base[0] * 1.25, 'м³', 2300);
    if (!['asphalt', 'crumb', 'rubble'].includes(v.cover)) b.mat('Песок / ПЦС для выравнивающего слоя', A * base[1] * 1.2, 'м³', 1300);
    b.sec('Покрытие');
    const m: Record<string, [string, string, number]> = {
      tile: ['Укладка тротуарной плитки (с основанием)', 'Тротуарная плитка 60 мм', 900], paver: ['Укладка брусчатки', 'Брусчатка 80 мм', 1300],
      granite: ['Укладка гранитной плитки', 'Гранитная плитка 30 мм', 3500], asphalt: ['Асфальтирование', '', 0], crumb: ['Устройство асфальтовой крошки', 'Асфальтовая крошка', 0],
      rubble: ['Устройство парковки из щебня', 'Щебень декоративный / фр. 5–20 верхний слой', 0], geo: ['Устройство площадки под авто из георешётки', 'Георешётка / газонная решётка', 650],
    };
    const [w, mn, p] = m[v.cover];
    b.work(w, A);
    if (p) b.mat(`${mn} (+5%)`, A * 1.05, 'м²', p);
    if (v.cover === 'crumb') b.mat('Асфальтовая крошка', A * 0.1 * 1.3, 'м³', 1800);
    if (v.cover === 'rubble') b.mat(mn, A * 0.1 * 1.25, 'м³', 2600);
    if (v.cover === 'asphalt') b.work('Каток дорожный', 1);
    if (['tile', 'paver', 'granite'].includes(v.cover)) b.work('Уплотнение грунта виброплитой', A);
    b.sec('Бордюры и водоотвод');
    b.work('Монтаж бордюра', v.curb); if (v.curb) b.mat('Бордюр тротуарный 1000×200×80 + бетон', v.curb, 'пог. м', 500);
    b.work('Устройство ливнёвки (лотки)', v.drain); if (v.drain) b.mat('Лоток водоотводный с решёткой', v.drain, 'пог. м', 830);
    b.work('Укладка рулонного газона', v.lawn); if (v.lawn) b.mat('Рулонный газон', v.lawn * 1.05, 'м²', 280);
    b.sum('Площадь', A, 'м²').sum('Глубина пирога', depth * 100, 'см');
    if (v.use !== 'walk' && v.cover === 'tile') b.warn('Под автомобиль лучше брусчатка 80 мм или плитка 60 мм на усиленном основании');
    b.sec('Прочее'); b.work('Доставка песка/щебня самосвалом', Math.max(1, ceil(A * depth / 10)));
    return b;
  },
};


// =====================================================================
// Окна и двери
// =====================================================================
const windowsM: Master = {
  id: 'm-windows', icon: '🪟', trade: 'Окна и двери', title: 'Окна и двери: монтаж, откосы, подоконники, отливы',
  description: 'Пластиковые окна и балконные блоки, межкомнатные и входные двери, откосы, подоконники, отливы, доборы, демонтаж старых',
  fields: [
    sel('kind', 'Что ставим', [['windows', 'пластиковые окна'], ['interior', 'межкомнатные двери'], ['entrance', 'входная дверь'], ['all', 'окна и двери']], 'windows'),
    num('wn', 'Окон', 'шт', 3, { integer: true }), num('wa', 'Площадь одного окна', 'м²', 2),
    num('bb', 'Балконных блоков', 'шт', 0, { integer: true }),
    sel('slopes', 'Откосы окон', [['sandwich', 'сэндвич-панели'], ['plaster', 'штукатурка'], ['none', 'не нужны']], 'sandwich'),
    yes('sill', 'Подоконники', 'yes'), yes('drip', 'Отливы снаружи', 'yes'), yes('net', 'Москитные сетки', 'no'),
    num('di', 'Межкомнатных дверей', 'шт', 0, { integer: true }), num('de', 'Входных дверей', 'шт', 0, { integer: true }),
    yes('dobor', 'Доборы (толстая стена)', 'no'), yes('demo', 'Демонтаж старых', 'yes'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Окна'); common(b, v);
    const win = ['windows', 'all'].includes(v.kind);
    const din = v.kind === 'interior' || v.kind === 'all' ? Math.max(v.di || 0, v.kind === 'interior' ? Math.max(1, v.di || 0) : 0) : 0;
    const dex = v.kind === 'entrance' || v.kind === 'all' ? Math.max(v.de || 0, v.kind === 'entrance' ? 1 : 0) : 0;
    const wn = win ? Math.max(1, v.wn || 0) : 0, wa = Math.max(0.5, v.wa || 2);
    if (wn) {
      const side = Math.sqrt(wa), per = wn * (side * 2 + side), width = wn * side; // откосы: 2 боковых + верх
      if (v.demo === 'yes') b.sec('Демонтаж').work('Демонтаж окна', wn + (v.bb || 0));
      b.sec('Окна');
      b.work('Монтаж пластикового окна', wn * wa); b.mat('Окно ПВХ 5 камер, двухкамерный стеклопакет', wn * wa, 'м²', 8500);
      b.mat('Монтажная пена, лента ПСУЛ, пароизоляционная лента', wn, 'компл', 1100);
      if (v.bb) { b.work('Монтаж балконного блока', v.bb); b.mat('Балконный блок ПВХ (дверь + окно)', v.bb, 'шт', 32000); }
      if (v.sill === 'yes') { b.work('Монтаж подоконника', wn); b.mat('Подоконник ПВХ 300 мм с заглушками', width * 1.2, 'пог. м', 1100); }
      if (v.slopes === 'sandwich') { b.work('Монтаж откосов из сэндвич-панелей', per); b.mat('Сэндвич-панель откосная + F-профиль', per * 1.1, 'пог. м', 420); }
      if (v.slopes === 'plaster') b.work('Штукатурка откосов', per);
      if (v.drip === 'yes') { b.work('Монтаж отлива оконного', width * 1.1); b.mat('Отлив оцинкованный с полимером 200 мм', width * 1.15, 'пог. м', 380); }
      if (v.net === 'yes') { b.work('Монтаж москитной сетки', wn); b.mat('Москитная сетка в раме', wn, 'шт', 1500); }
      b.sum('Окон', wn, 'шт').sum('Площадь остекления', wn * wa, 'м²');
    }
    if (din || dex) {
      if (v.demo === 'yes') b.sec('Демонтаж').work('Демонтаж двери с коробкой', din + dex);
      b.sec('Двери');
      if (din) {
        b.work('Монтаж межкомнатной двери', din); b.mat('Дверь межкомнатная с коробкой (полотно, коробка)', din, 'компл', 9500);
        b.work('Монтаж наличников', din); b.mat('Наличники (комплект на 2 стороны)', din, 'компл', 1800);
        b.mat('Фурнитура: петли, ручка, защёлка', din, 'компл', 2500);
        if (v.dobor === 'yes') { b.work('Монтаж доборов', din); b.mat('Доборы', din, 'компл', 1600); }
      }
      if (dex) {
        b.work('Монтаж входной металлической двери', dex); b.mat('Дверь входная металлическая с терморазрывом', dex, 'шт', 32000);
        b.work('Штукатурка откосов', dex * 5); b.mat('Монтажная пена и анкеры', dex, 'компл', 900);
      }
      b.sum('Дверей', din + dex, 'шт');
    }
    return finish(b, v);
  },
};

// =====================================================================
// Демонтаж
// =====================================================================
const demolition: Master = {
  id: 'm-demo', icon: '🔨', trade: 'Демонтаж', title: 'Демонтаж: плитка, стяжка, перегородки, сантехника, вывоз мусора',
  description: 'Квартира под ремонт, санузел, кухня: снимаем покрытия, сносим перегородки, выносим и вывозим мусор контейнерами',
  fields: [
    sel('obj', 'Что демонтируем', [['flat', 'квартира под ремонт'], ['bath', 'санузел'], ['room', 'комната'], ['custom', 'выберу сам']], 'flat'),
    num('floor', 'Площадь пола', 'м²', 45), num('wallsTile', 'Плитка со стен', 'м²', 20), num('floorTile', 'Плитка с пола', 'м²', 6),
    yes('wallpaper', 'Обои', 'yes'), yes('plaster', 'Штукатурка стен', 'no'), yes('screed', 'Стяжка пола', 'no'),
    sel('cover', 'Покрытие пола', [['soft', 'линолеум / ламинат'], ['wood', 'деревянный пол'], ['none', 'нет']], 'soft'),
    num('brick', 'Перегородки кирпичные', 'м²', 0), num('gkl', 'Перегородки ГКЛ', 'м²', 0),
    num('doors', 'Двери', 'шт', 3, { integer: true }), num('wins', 'Окна', 'шт', 0, { integer: true }),
    yes('plumb', 'Сантехника (ванна, унитаз, раковина)', 'yes'), num('rads', 'Радиаторы', 'шт', 0, { integer: true }),
    num('floorN', 'Этаж (без лифта — подъём/спуск мусора)', 'эт', 1, { integer: true }), COMPLEXITY,
  ],
  build: (v) => {
    const b = new Builder('Демонтаж'); common(b, v);
    const o = v.obj;
    const A = Math.max(1, v.floor || 1);
    const H = 2.7, wallA = Math.sqrt(A) * 4 * H * (o === 'flat' ? 1.8 : 1);
    let vol = 0; // объём мусора, м³ (с разрыхлением)
    const w = (name: string, q: number, m3perUnit: number) => { if (q > 0) { b.work(name, q); vol += q * m3perUnit; } };
    w('Демонтаж плитки со стен', o === 'room' ? 0 : v.wallsTile, 0.03);
    w('Демонтаж напольной плитки', o === 'room' ? 0 : v.floorTile, 0.04);
    if (v.wallpaper === 'yes' && o !== 'bath') w('Демонтаж обоев', wallA, 0.003);
    if (v.plaster === 'yes') w('Демонтаж штукатурки', o === 'bath' ? v.wallsTile : wallA, 0.04);
    if (v.screed === 'yes') w('Демонтаж стяжки', A, 0.07);
    if (v.cover === 'soft' && o !== 'bath') w('Демонтаж линолеума/ламината', A, 0.015);
    if (v.cover === 'wood' && o !== 'bath') w('Демонтаж деревянного пола', A, 0.05);
    w('Демонтаж перегородок из кирпича', v.brick, 0.18);
    w('Демонтаж ГКЛ перегородки', v.gkl, 0.05);
    w('Демонтаж двери с коробкой', v.doors, 0.3);
    w('Демонтаж окна', v.wins, 0.4);
    if (v.plumb === 'yes') { w('Демонтаж ванны чугунной', 1, 0.6); w('Демонтаж унитаза', 1, 0.15); }
    w('Демонтаж радиатора', v.rads, 0.1);
    vol = Math.max(vol, 1);
    b.sec('Вынос и вывоз мусора');
    b.work('Погрузка мусора в мешках', vol);
    if ((v.floorN || 1) > 1) b.work('Грузчики (погрузка/разгрузка)', ceil(vol * 0.6 * Math.min(v.floorN, 10) / 3));
    b.work('Вывоз строительного мусора (контейнер 8 м³)', Math.max(1, ceil(vol / 8)));
    b.mat('Мешки для строительного мусора', ceil(vol / 0.05), 'шт', 25);
    b.sum('Мусора примерно', vol, 'м³');
    if (v.brick > 0) b.warn('Снос кирпичных перегородок — проверьте, что стена не несущая, и нужно ли согласование перепланировки');
    return b;
  },
};

// =====================================================================
// Балкон и лоджия
// =====================================================================
const balcony: Master = {
  id: 'm-balcony', icon: '🌇', trade: 'Балконы и лоджии', title: 'Балкон и лоджия под ключ: остекление, утепление, отделка',
  description: 'Холодное или тёплое остекление, вынос, крыша, утепление пола/стен/потолка, обшивка вагонкой или панелями, пол, свет',
  fields: [
    sel('glaze', 'Остекление', [['warm', 'тёплое (ПВХ)'], ['cold', 'холодное (алюминий)'], ['none', 'уже есть']], 'warm'),
    sel('type', 'Тип', [['loggia', 'лоджия (боковые стены есть)'], ['balcony', 'балкон (открытый с 3 сторон)']], 'loggia'),
    num('L', 'Длина', 'м', 3), num('D', 'Глубина', 'м', 1.2), num('H', 'Высота', 'м', 2.6),
    yes('out', 'Вынос по подоконнику', 'no'), yes('roof', 'Крыша (последний этаж)', 'no'),
    yes('warm', 'Утепление (пол, стены, потолок)', 'yes'),
    sel('finish', 'Отделка стен и потолка', [['lining', 'вагонка'], ['pvc', 'ПВХ-панели'], ['paint', 'шпаклёвка и покраска'], ['none', 'без отделки']], 'lining'),
    sel('floorF', 'Пол', [['laminate', 'ламинат по фанере'], ['tile', 'плитка'], ['none', 'без покрытия']], 'laminate'),
    yes('outside', 'Отделка снаружи (профлист/сайдинг)', 'no'), num('lights', 'Светильники и розетки', 'шт', 2, { integer: true }),
    yes('heatfloor', 'Тёплый пол', 'no'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Остекление'); common(b, v);
    const L = Math.max(1, v.L || 3), D = Math.max(0.6, v.D || 1.2), H = Math.max(2, v.H || 2.6);
    const front = v.type === 'balcony' ? L + 2 * D : L; // длина остекления
    const glassH = 1.5, glass = front * glassH;
    const floor = L * D, ceilA = floor, walls = (2 * D + L) * H * (v.type === 'loggia' ? 1 : 0.5) + (front * (H - glassH));
    if (v.glaze !== 'none') {
      b.work(v.glaze === 'warm' ? 'Остекление балкона тёплое (ПВХ)' : 'Остекление балкона холодное (алюминий)', glass);
      b.mat(v.glaze === 'warm' ? 'Остекление ПВХ (рамы, стеклопакеты, фурнитура)' : 'Алюминиевые раздвижные рамы со стеклом', glass, 'м²', v.glaze === 'warm' ? 9500 : 5500);
      b.work('Монтаж подоконника', 1); b.mat('Подоконник ПВХ 300 мм', front * 1.05, 'пог. м', 1100);
      b.work('Монтаж отлива оконного', front); b.mat('Отлив оцинкованный 200 мм', front * 1.1, 'пог. м', 380);
      if (v.out === 'yes') { b.work('Вынос балкона по подоконнику', front); b.mat('Металлический каркас выноса', front, 'пог. м', 2200); }
      if (v.roof === 'yes') { b.work('Устройство крыши балкона', front * 1); b.mat('Кровля балкона (каркас, профлист, герметик)', front, 'м²', 2800); }
    }
    if (v.warm === 'yes') {
      const ins = floor + ceilA + walls;
      b.sec('Утепление');
      b.work('Утепление балкона (пол, стены, потолок)', ins); b.work('Монтаж каркаса обшивки балкона', walls + ceilA);
      b.mat('Утеплитель ЭППС 50 мм', ins * 1.05, 'м²', 330); b.mat('Пенофол / пароизоляция с фольгой', ins * 1.1, 'м²', 95);
      b.mat('Брус каркаса 20×40 и крепёж', ceil((walls + ceilA) * 1.5 / 3), 'шт', 120);
    }
    b.sec('Отделка');
    if (v.finish === 'lining') { b.work('Монтаж вагонки', walls + ceilA); b.mat('Вагонка (сосна, класс В)', (walls + ceilA) * 1.1, 'м²', 650); b.work('Покраска деревянных поверхностей', walls + ceilA); b.mat('Масло/лак для дерева (2,5 л)', ceil((walls + ceilA) / 20), 'банка', 1800); }
    if (v.finish === 'pvc') { b.work('Монтаж стеновых панелей ПВХ', walls + ceilA); b.mat('Панели ПВХ с профилями', (walls + ceilA) * 1.1, 'м²', 450); }
    if (v.finish === 'paint') { b.work('Обшивка стен ГКЛ на каркасе', walls + ceilA); b.work('Шпаклёвка стен под покраску', walls + ceilA); b.work('Покраска стен в 2 слоя', walls + ceilA); b.mat('ГКЛ влагостойкий (3 м²)', ceil((walls + ceilA) * 1.1 / 3), 'лист', 650); b.mat('Шпаклёвка и краска', ceil((walls + ceilA) / 10), 'компл', 1500); }
    if (v.floorF === 'laminate') { b.work('Укладка фанеры на лаги', floor); b.work('Укладка ламината', floor); b.mat('Фанера 18 мм', ceil(floor * 1.1 / 2.31), 'лист', 2099); b.mat('Ламинат 33 класс (+7%)', floor * 1.07, 'м²', 1070); }
    if (v.floorF === 'tile') { b.work('Стяжка пола ЦПС до 50 мм', floor); b.work('Укладка плитки на пол', floor); b.mat('Плитка / керамогранит (+10%)', floor * 1.1, 'м²', 1500); b.mat('Плиточный клей (25 кг)', ceil(floor * 5 / 25), 'меш', 585); }
    if (v.heatfloor === 'yes') { b.work('Монтаж электрического тёплого пола', floor); b.mat('Нагревательный мат 150 Вт/м²', floor, 'м²', 2140); b.mat('Терморегулятор', 1, 'шт', 2740); }
    if (v.outside === 'yes') { b.sec('Снаружи').work('Отделка балкона снаружи профлистом/сайдингом', front * 1.1); b.mat('Профлист / сайдинг с крепежом', front * 1.1 * 1.1, 'м²', 700); }
    if (v.lights) { b.sec('Электрика'); b.work('Прокладка кабеля в гофре по стене', v.lights * 4); b.work('Монтаж розетки/выключателя', v.lights); b.mat('Кабель ВВГнг 3×1,5 в гофре', v.lights * 4.5, 'м', 85); b.mat('Розетки, светильники', v.lights, 'шт', 900); }
    b.sum('Площадь пола', floor, 'м²').sum('Длина остекления', front, 'м');
    if (v.type === 'balcony' && v.out === 'yes') b.warn('Вынос и утяжеление открытого балкона — проверьте состояние плиты; может понадобиться усиление');
    return finish(b, v);
  },
};

// =====================================================================
// Натяжные потолки
// =====================================================================
const stretch: Master = {
  id: 'm-stretch', icon: '✨', trade: 'Натяжные потолки', title: 'Натяжные потолки: полотно, профиль, светильники, обходы',
  description: 'Матовое, сатин, глянец, тканевое. Обычный, теневой и парящий профиль, точечные светильники, люстры, карнизы-ниши, треки',
  fields: [
    num('area', 'Площадь потолков', 'м²', 40), num('per', 'Периметр', 'пог. м', 28), num('rooms', 'Помещений', 'шт', 3, { integer: true, min: 1 }),
    sel('canvas', 'Полотно', [['mat', 'ПВХ матовое'], ['satin', 'ПВХ сатин'], ['gloss', 'ПВХ глянец'], ['fabric', 'тканевое'], ['print', 'с фотопечатью'], ['stars', '«звёздное небо»']], 'mat'),
    num('lines', 'Световые линии', 'пог. м', 0), num('level2', 'Второй уровень (переход)', 'пог. м', 0), yes('bath', 'Есть санузел (влагостойкое, с нишей)', 'no'),
    sel('profile', 'Профиль', [['std', 'обычный (со вставкой)'], ['shadow', 'теневой'], ['float', 'парящий с подсветкой']], 'std'),
    num('spots', 'Точечные светильники', 'шт', 12, { integer: true }), num('chand', 'Люстры', 'шт', 2, { integer: true }),
    num('pipes', 'Обходы труб', 'шт', 1, { integer: true }), num('niche', 'Скрытый карниз (ниша)', 'пог. м', 0), num('track', 'Трековая система', 'пог. м', 0),
    yes('demo', 'Демонтаж старого потолка', 'no'), COMPLEXITY,
  ],
  build: (v) => {
    const b = new Builder('Натяжные потолки'); common(b, v);
    const A = Math.max(1, v.area || 1), P = Math.max(4, v.per || Math.sqrt(A) * 4);
    if (v.demo === 'yes') b.work('Демонтаж натяжного потолка', A);
    b.work(({ fabric: 'Монтаж тканевого натяжного потолка', print: 'Монтаж натяжного потолка с фотопечатью', stars: 'Монтаж натяжного потолка «звёздное небо»' } as Record<string, string>)[v.canvas] || 'Монтаж натяжного потолка', A);
    const canvas: Record<string, [string, number]> = { mat: ['Полотно ПВХ матовое', 450], satin: ['Полотно ПВХ сатин', 520], gloss: ['Полотно ПВХ глянцевое', 560], fabric: ['Полотно тканевое', 1300], print: ['Полотно с фотопечатью', 1500], stars: ['Полотно + оптоволоконный проектор «звёздное небо»', 2500] };
    if (v.level2) { b.work('Монтаж двухуровневого натяжного потолка', v.level2); b.mat('Профиль перехода уровней + ГКЛ/фанера короба', v.level2 * 1.05, 'пог. м', 900); }
    if (v.lines) { b.work('Монтаж световых линий в натяжной потолок', v.lines); b.mat('Профиль световой линии + LED-лента + блок питания', v.lines * 1.05, 'пог. м', 1600); }
    if (v.bath === 'yes') b.warn('В санузле — полотно ПВХ (влагостойкое), светильники IP44, у вытяжки — термокольцо');
    const [cn, cp] = canvas[v.canvas] || canvas.mat;
    b.mat(cn, A, 'м²', cp);
    if (v.profile === 'std') b.mat('Багет ПВХ/алюминий + декоративная вставка', P * 1.05, 'пог. м', 160);
    else { b.work('Монтаж теневого/парящего профиля', P); b.mat(v.profile === 'float' ? 'Парящий профиль + светодиодная лента + блок питания' : 'Теневой профиль алюминиевый', P * 1.05, 'пог. м', v.profile === 'float' ? 1300 : 650); }
    b.work('Обработка угла натяжного потолка', Math.max(4 * (v.rooms || 1), ceil(P / 3)));
    if (v.spots) { b.work('Монтаж светильника в натяжной потолок (закладная)', v.spots); b.mat('Светильник точечный GX53 с лампой', v.spots, 'шт', 450); b.mat('Закладная платформа + термокольцо', v.spots, 'шт', 120); }
    if (v.chand) { b.work('Монтаж закладной под люстру', v.chand); b.work('Монтаж люстры', v.chand); }
    if (v.pipes) b.work('Обвод трубы в натяжном потолке', v.pipes);
    if (v.niche) { b.work('Монтаж скрытого карниза (ниши) в натяжном потолке', v.niche); b.mat('Профиль ниши под карниз', v.niche * 1.05, 'пог. м', 700); }
    if (v.track) { b.work('Монтаж трековой системы в натяжной потолок', v.track); b.mat('Магнитный трек + светильники', v.track, 'пог. м', 4500); }
    b.work('Прокладка кабеля', (v.spots + v.chand) * 2.5);
    b.mat('Кабель ВВГнг 3×1,5', (v.spots + v.chand) * 2.7, 'м', 85);
    b.sum('Площадь', A, 'м²').sum('Периметр', P, 'м');
    return b;
  },
};

// =====================================================================
// Кондиционеры и вентиляция
// =====================================================================
const climate: Master = {
  id: 'm-ac', icon: '❄️', trade: 'Кондиционеры', title: 'Кондиционеры и вентиляция: сплит-системы, трассы, вытяжки',
  description: 'Монтаж сплит-систем «под ключ» и со штроблением, длинные трассы, дренажные помпы, работа на высоте, вытяжные вентиляторы',
  fields: [
    num('s35', 'Сплит-систем до 3,5 кВт (до 35 м²)', 'шт', 1, { integer: true }), num('s7', 'Сплит-систем до 7 кВт (до 70 м²)', 'шт', 0, { integer: true }),
    num('route', 'Трасса на один блок', 'м', 5),
    sel('mount', 'Трасса', [['box', 'в коробе по стене'], ['hidden', 'скрытая в штробе']], 'box'),
    yes('pump', 'Дренажная помпа', 'no'), yes('height', 'Наружный блок на высоте (альпинист)', 'no'),
    yes('buy', 'Кондиционер покупаем мы', 'yes'), num('fans', 'Вытяжные вентиляторы', 'шт', 0, { integer: true }),
    yes('demo', 'Демонтаж старого кондиционера', 'no'),
  ],
  build: (v) => {
    const b = new Builder('Кондиционеры'); common(b, v);
    const n = (v.s35 || 0) + (v.s7 || 0);
    if (n) {
      if (v.demo === 'yes') b.work('Демонтаж кондиционера', n);
      b.work('Монтаж сплит-системы до 3,5 кВт', v.s35); b.work('Монтаж сплит-системы до 7 кВт', v.s7);
      const extra = Math.max(0, (v.route || 0) - 3) * n; // 3 м трассы обычно входят в монтаж
      if (extra) b.work('Прокладка трассы кондиционера', extra, { note: 'сверх 3 м, входящих в монтаж' });
      b.work('Бурение отверстия в стене (до 70 мм)', n);
      if (v.mount === 'hidden') b.work('Штробление стен под кабель', (v.route || 3) * n);
      if (v.pump === 'yes') { b.work('Монтаж дренажной помпы кондиционера', n); b.mat('Дренажная помпа', n, 'шт', 4500); }
      if (v.height === 'yes') b.work('Монтаж наружного блока на высоте (альпинист)', n);
      if (v.buy === 'yes') { b.mat('Сплит-система до 3,5 кВт (инвертор)', v.s35, 'шт', 38000); b.mat('Сплит-система до 7 кВт (инвертор)', v.s7, 'шт', 62000); }
      b.mat('Медная трасса в изоляции, кабель, дренаж (на метр)', (v.route || 3) * n, 'м', 1100);
      b.mat('Кронштейны наружного блока + крепёж', n, 'компл', 1500);
      if (v.mount === 'box') b.mat('Кабель-канал 60×60', (v.route || 3) * n * 1.1, 'м', 260);
    }
    if (v.fans) { b.sec('Вентиляция'); b.work('Монтаж вытяжного вентилятора', v.fans); b.mat('Вентилятор вытяжной с обратным клапаном', v.fans, 'шт', 2500); }
    b.sum('Блоков', n, 'шт');
    if (!n && !v.fans) b.warn('Укажите количество кондиционеров или вентиляторов');
    return b;
  },
};

// =====================================================================
// Дома и бани (каркас)
// =====================================================================
const houseM: Master = {
  id: 'm-house', icon: '🏡', trade: 'Дома и бани', title: 'Каркасный дом и баня под ключ: фундамент, каркас, утепление, кровля',
  description: 'Каркасный дом или баня (каркас или брус): сваи, каркас стен и перекрытий, утепление 150–200 мм, обшивка, кровля, окна, печь',
  fields: [
    sel('type', 'Что строим', [['house', 'каркасный дом'], ['bathf', 'баня каркасная'], ['bathb', 'баня из бруса']], 'house'),
    num('L', 'Длина', 'м', 8), num('W', 'Ширина', 'м', 6), num('H', 'Высота стен', 'м', 2.8),
    sel('fl', 'Этажность', [['1', '1 этаж'], ['1.5', 'с мансардой'], ['2', '2 этажа']], '1'),
    sel('ins', 'Утепление стен', [['150', '150 мм'], ['200', '200 мм']], '150'),
    sel('clad', 'Наружная отделка', [['imit', 'имитация бруса'], ['siding', 'сайдинг'], ['blockhouse', 'блок-хаус']], 'imit'),
    sel('cover', 'Кровля', [['metal', 'металлочерепица'], ['soft', 'мягкая'], ['prof', 'профнастил']], 'metal'),
    num('wins', 'Окон', 'шт', 6, { integer: true }), yes('stove', 'Печь и дымоход (баня)', 'yes'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Фундамент'); common(b, v);
    const L = Math.max(2, v.L || 6), W = Math.max(2, v.W || 4), H = Math.max(2.2, v.H || 2.7), fl = Number(v.fl) || 1;
    const bath = v.type !== 'house';
    const per = 2 * (L + W), plan = L * W, floorA = plan * fl;
    const walls = per * H * (fl === 2 ? 2 : fl === 1.5 ? 1.4 : 1) * 0.85; // за вычетом проёмов
    const piles = ceil(per / 2) + ceil((L / 2.5) * Math.max(0, Math.floor(W / 3) - 1));
    b.work('Монтаж винтовых свай', piles); b.mat('Свая винтовая 108 мм, 2,5 м с оголовком', piles, 'шт', 3600);
    b.work('Монтаж лаг под пол', plan); b.mat('Брус обвязки и лаг 150×150 / 50×200', plan * 0.045, 'м³', 27800);
    b.sec('Стены и перекрытия');
    if (v.type === 'bathb') {
      const vol = per * H * 0.15 * 1.1;
      b.work('Сборка сруба бани из бруса', vol); b.mat('Брус профилированный 150×150', vol, 'м³', 27000); b.mat('Межвенцовый утеплитель (джут) и нагели', ceil(per * H / 20), 'компл', 2500);
    } else {
      b.work('Монтаж каркаса стен (каркасный дом)', walls); b.work('Монтаж каркаса перекрытия (каркасный дом)', floorA);
      b.mat('Доска каркаса камерной сушки 50×150/200', walls * 0.035 + floorA * 0.04, 'м³', 32000);
      const t = Number(v.ins) / 1000;
      b.work('Утепление каркасных стен минватой', walls); b.mat(`Утеплитель минвата ${v.ins} мм`, walls * t * 1.05, 'м³', 4950);
      b.work('Утепление перекрытия минватой', plan * (fl > 1 ? 2 : 1)); b.mat('Утеплитель минвата 200 мм (перекрытия)', plan * (fl > 1 ? 2 : 1) * 0.2 * 1.05, 'м³', 4950);
      b.work('Обшивка каркаса OSB', walls); b.mat('Плита OSB-3 9 мм', ceil(walls * 1.08 / 3.1), 'лист', 899);
      b.work('Монтаж ветро-влагозащиты на стены', walls); b.mat('Ветро-влагозащитная мембрана', walls * 1.15, 'м²', 60);
      b.work('Монтаж пароизоляции стен', walls); b.mat('Пароизоляционная плёнка', walls * 1.15, 'м²', 40);
    }
    b.work('Укладка фанеры на лаги', floorA); b.mat('Фанера / шпунтованная доска пола', floorA * 1.05, 'м²', 950);
    b.sec('Кровля');
    const roofA = (L + 1) * (W + 1) / Math.cos(Math.PI / 6);
    b.work('Монтаж стропильной системы', roofA); b.mat('Доска стропил и обрешётки', roofA * 0.05, 'м³', 27800);
    b.work('Монтаж гидро-ветрозащиты', roofA); b.mat('Гидро-ветрозащитная мембрана', roofA * 1.15, 'м²', 90);
    const cov: Record<string, [string, number]> = { metal: ['Монтаж металлочерепицы', 815], soft: ['Монтаж мягкой кровли', 900], prof: ['Монтаж профнастила на кровлю', 600] };
    const [cw, cp] = cov[v.cover] || cov.metal;
    b.work(cw, roofA); b.mat(`Покрытие: ${cw.replace('Монтаж ', '')} с доборами (+10%)`, roofA * 1.1, 'м²', cp);
    if (v.cover === 'soft') { b.work('Монтаж сплошного настила OSB', roofA); b.mat('Плита OSB-3 12 мм', ceil(roofA * 1.08 / 3.1), 'лист', 1199); }
    b.work('Монтаж водосточной системы', 2 * L + 4 * H); b.mat('Водосточная система (желоб, трубы, воронки)', 2 * L + 4 * H, 'пог. м', 650);
    b.sec('Фасад, окна, двери');
    const clad: Record<string, [string, string, number]> = { imit: ['Монтаж имитации бруса', 'Имитация бруса (хвоя, АВ)', 900], siding: ['Монтаж сайдинга', 'Сайдинг виниловый с профилями', 450], blockhouse: ['Монтаж блок-хауса', 'Блок-хаус (хвоя)', 1100] };
    if (v.type !== 'bathb') { const [cw2, cm, cp2] = clad[v.clad] || clad.imit; b.work(cw2, walls); b.mat(cm, walls * 1.1, 'м²', cp2); b.work('Монтаж контробрешётки', walls); }
    else { b.work('Шлифовка сруба', walls * 2); b.work('Покраска деревянных поверхностей', walls); b.mat('Антисептик/масло для фасада (9 л)', ceil(walls / 40), 'ведро', 5500); }
    b.work('Монтаж пластикового окна', (v.wins || 0) * 1.2); b.mat('Окно ПВХ (≈1,2 м²)', (v.wins || 0) * 1.2, 'м²', 8500);
    b.work('Монтаж входной металлической двери', 1); b.mat('Дверь входная утеплённая', 1, 'шт', 28000);
    if (bath) {
      b.sec('Баня');
      const steam = Math.min(plan * 0.35, 12);
      b.work('Теплоизоляция бани (фольга, минвата)', steam * 4); b.work('Обшивка парилки вагонкой', steam * 4); b.mat('Вагонка липа/осина, класс А', steam * 4 * 1.1, 'м²', 1600);
      b.work('Монтаж полков', 4); b.mat('Полок (липа/абаш), комплект', 1, 'компл', 22000);
      b.work('Монтаж полога и отделка моечной', plan * 0.25);
      if (v.stove === 'yes') { b.work('Монтаж банной печи', 1); b.mat('Печь банная с баком', 1, 'шт', 45000); b.work('Монтаж сэндвич-дымохода', H + 1.5); b.mat('Дымоход сэндвич нерж. с проходным узлом', H + 1.5, 'пог. м', 5200); }
    }
    b.sum('Площадь дома', floorA, 'м²').sum('Стены', walls, 'м²').sum('Кровля', roofA, 'м²');
    b.warn('Это укрупнённый расчёт «коробки» с отделкой фасада. Инженерные сети и внутреннюю отделку посчитайте отдельными мастерами');
    return finish(b, v, false);
  },
};

// =====================================================================
// Ворота и металлоконструкции
// =====================================================================
const metal: Master = {
  id: 'm-gates', icon: '🚪', trade: 'Ворота и металл', title: 'Ворота, калитки, автоматика, козырьки, лестницы, перила',
  description: 'Откатные и распашные ворота с изготовлением, автоматика, калитки, козырьки, металлические лестницы и перила, сварка, покраска',
  fields: [
    sel('gate', 'Ворота', [['sliding', 'откатные'], ['swing', 'распашные'], ['none', 'не нужны']], 'sliding'),
    num('gw', 'Ширина проезда', 'м', 4), yes('auto', 'Автоматика', 'yes'), yes('wicket', 'Калитка', 'yes'), yes('lock', 'Замок и видеодомофон на калитку', 'no'),
    sel('fill', 'Зашивка', [['prof', 'профлист'], ['shtak', 'евроштакетник'], ['none', 'без зашивки (каркас)']], 'prof'),
    num('visors', 'Козырьки над входом', 'шт', 0, { integer: true }), num('stairs', 'Металлические лестницы', 'шт', 0, { integer: true }),
    num('rails', 'Перила', 'пог. м', 0), num('weld', 'Прочая сварка', 'час', 0), yes('paint', 'Грунт и покраска металла', 'yes'),
  ],
  build: (v) => {
    const b = new Builder('Ворота и калитка'); common(b, v);
    const gw = Math.max(2, v.gw || 4), gh = 2;
    let metalA = 0;
    if (v.gate === 'sliding') {
      b.work('Изготовление откатных ворот (работа)', 1); b.work('Бетонирование закладной откатных ворот', 1); b.work('Установка откатных ворот', 1);
      b.mat('Комплект фурнитуры откатных ворот (балка, тележки, ролики)', 1, 'компл', 28000);
      b.mat('Профтруба для каркаса ворот', gw * 1.5 * 6, 'пог. м', 280); b.mat('Швеллер закладной и арматура', 1, 'компл', 9000);
      b.mat('Бетон М300 (закладная)', gw * 0.5 * 0.4 * 1.5, 'м³', 7200);
      metalA += gw * gh * 1.5;
    }
    if (v.gate === 'swing') {
      b.work('Изготовление ворот распашных (работа)', 1); b.work('Установка распашных ворот', 1);
      b.mat('Профтруба для каркаса и столбов', gw * 5 + 6, 'пог. м', 280); b.mat('Петли, засов, упоры', 1, 'компл', 4500);
      metalA += gw * gh;
    }
    if (v.gate !== 'none') {
      if (v.fill !== 'none') b.mat(v.fill === 'prof' ? 'Профлист С8 0,45 с полимером' : 'Евроштакетник с саморезами', gw * gh * 1.05 * (v.fill === 'shtak' ? 1.1 : 1), 'м²', v.fill === 'prof' ? 650 : 1100);
      if (v.auto === 'yes') { b.work('Монтаж автоматики ворот', 1); b.mat(v.gate === 'sliding' ? 'Автоматика откатных ворот (привод, пульты, фотоэлементы)' : 'Автоматика распашных ворот (2 привода, пульты)', 1, 'компл', v.gate === 'sliding' ? 38000 : 45000); b.work('Прокладка кабеля в земле (с траншеей)', 10); b.mat('Кабель ВВГнг 3×2,5 в гофре', 11, 'м', 140); }
    }
    if (v.wicket === 'yes') {
      b.work('Изготовление калитки (работа)', 1); b.work('Монтаж калитки', 1); b.mat('Калитка: профтруба, зашивка, петли, ручка', 1, 'компл', 9500); metalA += 2;
      if (v.lock === 'yes') { b.work('Монтаж замка на калитку', 1); b.work('Монтаж видеодомофона на калитку', 1); b.mat('Электромеханический замок', 1, 'шт', 6500); b.mat('Видеодомофон (панель + монитор)', 1, 'компл', 14000); }
    }
    b.sec('Металлоконструкции');
    if (v.visors) { b.work('Монтаж козырька над входом', v.visors); b.mat('Козырёк: каркас из профтрубы + поликарбонат', v.visors, 'компл', 14000); metalA += v.visors * 3; }
    if (v.stairs) { b.work('Монтаж металлической лестницы', v.stairs); b.mat('Металл на лестницу (косоуры, ступени)', v.stairs * 250, 'кг', 120); metalA += v.stairs * 8; }
    if (v.rails) { b.work('Изготовление перил', v.rails); b.mat('Профтруба и поручень на перила', v.rails * 4, 'пог. м', 260); metalA += v.rails * 0.6; }
    if (v.weld) b.work('Сварочные работы', v.weld);
    if (v.paint === 'yes' && metalA) { b.work('Антикоррозийная обработка металла', metalA); b.work('Покраска металлоконструкций', metalA); b.mat('Грунт-эмаль по металлу 3 в 1 (2,7 кг)', ceil(metalA * 0.25 / 2.7), 'банка', 1300); }
    b.sum('Ширина проезда', v.gate === 'none' ? 0 : gw, 'м');
    return finish(b, { ...v, debris: 'no' });
  },
};

// =====================================================================
// Участок: ливнёвка, газон, освещение
// =====================================================================
const yardM: Master = {
  id: 'm-yard', icon: '🌳', trade: 'Благоустройство', title: 'Участок: ливнёвка и лотки, газон, освещение, посадки, полив',
  description: 'Водоотводные лотки с решётками, ливнеприёмники, пескоуловители, посев или рулонный газон, садовые фонари с кабелем, деревья, автополив',
  fields: [
    num('trays', 'Водоотводные лотки', 'пог. м', 15), num('inlets', 'Ливнеприёмники (точечные)', 'шт', 2, { integer: true }), num('sand', 'Пескоуловители', 'шт', 1, { integer: true }),
    sel('trayType', 'Лотки', [['plastic', 'пластиковые с решёткой'], ['concrete', 'бетонные с чугунной решёткой']], 'plastic'),
    sel('lawn', 'Газон', [['seed', 'посевной'], ['roll', 'рулонный'], ['none', 'не нужен']], 'seed'), num('lawnA', 'Площадь газона', 'м²', 100),
    yes('soil', 'Завоз плодородного грунта (10 см)', 'yes'),
    num('lamps', 'Садовые фонари', 'шт', 4, { integer: true }), num('cable', 'Кабель в земле до фонарей', 'м', 30),
    num('trees', 'Посадка деревьев/кустов', 'шт', 0, { integer: true }), num('irrig', 'Автополив', 'м²', 0), num('border', 'Садовый бордюр', 'пог. м', 0),
  ],
  build: (v) => {
    const b = new Builder('Ливнёвка'); common(b, v);
    if (v.trays) {
      b.work('Устройство ливнёвки (лотки)', v.trays);
      b.mat(v.trayType === 'concrete' ? 'Лоток бетонный с чугунной решёткой (1 м)' : 'Лоток пластиковый с решёткой (1 м)', ceil(v.trays), 'шт', v.trayType === 'concrete' ? 3900 : 1500);
      b.mat('Заглушки, соединители, торцевые элементы', ceil(v.trays / 10) + 1, 'компл', 900);
      b.mat('Бетон М200 под лоток', v.trays * 0.06, 'м³', 6500); b.mat('Песок/щебень основания', v.trays * 0.1, 'м³', 1600);
    }
    if (v.inlets) { b.work('Монтаж ливнеприёмника', v.inlets); b.mat('Дождеприёмник 300×300 с решёткой', v.inlets, 'шт', 2600); }
    if (v.sand) { b.work('Монтаж пескоуловителя', v.sand); b.mat('Пескоуловитель пластиковый', v.sand, 'шт', 3100); }
    if (v.trays || v.inlets) { b.work('Прокладка наружной канализации (с траншеей)', Math.max(5, v.trays * 0.5)); b.mat('Труба ПВХ 110 наружная', Math.max(5, v.trays * 0.5) * 1.05, 'пог. м', 550); }
    b.sec('Газон');
    if (v.lawn !== 'none' && v.lawnA) {
      b.work('Планировка участка', v.lawnA);
      if (v.soil === 'yes') { b.work('Завоз плодородного грунта с планировкой', v.lawnA * 0.1); b.mat('Плодородный грунт', v.lawnA * 0.1 * 1.2, 'м³', 1100); }
      if (v.lawn === 'seed') { b.work('Посев газона', v.lawnA); b.mat('Семена газона', ceil(v.lawnA * 0.04), 'кг', 650); b.mat('Удобрение стартовое', ceil(v.lawnA / 100), 'уп', 600); }
      else { b.work('Укладка рулонного газона', v.lawnA); b.mat('Газон рулонный', v.lawnA * 1.03, 'м²', 260); }
    }
    b.sec('Освещение и посадки');
    if (v.lamps) {
      b.work('Монтаж уличного освещения (столб)', v.lamps); b.mat('Светильник садовый на столбике', v.lamps, 'шт', 4500);
      b.work('Прокладка кабеля в земле (с траншеей)', v.cable || v.lamps * 6); b.mat('Кабель ВБбШв 3×2,5', (v.cable || v.lamps * 6) * 1.1, 'м', 190);
      b.mat('Распределительная коробка IP65, автомат с УЗО', 1, 'компл', 3500);
    }
    if (v.trees) { b.work('Посадка деревьев', v.trees); b.mat('Саженцы (средние)', v.trees, 'шт', 2500); }
    if (v.irrig) { b.work('Монтаж автополива', v.irrig); b.mat('Автополив: контроллер, клапаны, трубы, форсунки', v.irrig, 'м²', 250); }
    if (v.border) { b.work('Монтаж садового бордюра (ленты)', v.border); b.mat('Садовый бордюр-лента', v.border * 1.05, 'пог. м', 120); }
    b.sum('Лотков', v.trays || 0, 'м').sum('Газон', v.lawn === 'none' ? 0 : v.lawnA, 'м²');
    return finish(b, { ...v, debris: 'no' });
  },
};

// =====================================================================
// Мелкий ремонт («муж на час»)
// =====================================================================
const handy: Master = {
  id: 'm-handy', icon: '🧰', trade: 'Мелкий ремонт', title: 'Мелкий ремонт: повесить, собрать, заменить, починить',
  description: '«Мастер на час»: полки, карнизы, телевизор, сборка мебели, смесители, розетки, люстры, регулировка дверей и окон',
  fields: [
    num('hang', 'Повесить полки, картины, зеркала', 'шт', 3, { integer: true }), num('cornice', 'Карнизы для штор', 'шт', 0, { integer: true }),
    num('tv', 'Телевизор на кронштейн', 'шт', 0, { integer: true }), num('furn', 'Собрать мебель (шкаф, кровать, комод)', 'шт', 0, { integer: true }),
    num('kitchen', 'Модули кухни', 'шт', 0, { integer: true }), num('mixer', 'Заменить смеситель', 'шт', 0, { integer: true }),
    num('siphon', 'Заменить сифон', 'шт', 0, { integer: true }), num('sockets', 'Заменить розетки/выключатели', 'шт', 0, { integer: true }),
    num('lamps', 'Повесить люстру/светильник', 'шт', 0, { integer: true }), num('doorsAdj', 'Отрегулировать двери', 'шт', 0, { integer: true }),
    num('winAdj', 'Отрегулировать окна', 'шт', 0, { integer: true }), num('seal', 'Обновить герметик ванны', 'пог. м', 0),
    yes('leak', 'Устранить протечку', 'no'),
  ],
  build: (v) => {
    const b = new Builder('Мелкий ремонт'); common(b, v);
    b.work('Минимальный заказ мастера (выезд + 1 час)', 1);
    b.work('Навеска полки/картины/зеркала', v.hang); b.work('Монтаж карниза для штор', v.cornice); b.work('Монтаж телевизора на кронштейн', v.tv);
    b.work('Сборка корпусной мебели', v.furn); b.work('Сборка кухонного модуля', v.kitchen);
    b.work('Замена смесителя', v.mixer); b.work('Замена сифона', v.siphon); b.work('Замена розетки/выключателя', v.sockets);
    b.work('Повесить люстру/светильник', v.lamps); b.work('Регулировка двери', v.doorsAdj); b.work('Регулировка окна (фурнитура)', v.winAdj);
    b.work('Герметизация шва ванны', v.seal); if (v.leak === 'yes') b.work('Устранение протечки', 1);
    if (v.hang || v.cornice || v.tv) b.mat('Крепёж: дюбели, анкеры, саморезы', 1, 'компл', 300);
    if (v.seal) b.mat('Герметик санитарный силиконовый', ceil(v.seal / 6), 'шт', 450);
    if (v.siphon) b.mat('Сифон', v.siphon, 'шт', 700);
    if (b.lines.length < 3) b.mat('Расходники (изолента, герметик, крепёж)', 1, 'компл', 300);
    return b;
  },
};

// =====================================================================
// Утепление и шумоизоляция изнутри
// =====================================================================
const insulIn: Master = {
  id: 'm-insul', icon: '🧶', trade: 'Изолировщик', title: 'Утепление и шумоизоляция стен изнутри: минвата, ЭППС, PIR, тёплая штукатурка, ЗИПС',
  description: 'Холодные наружные стены, промерзающие углы и откосы; шумоизоляция стен от соседей, потолка и пола. Пароизоляция, каркас, ГКЛ, антисептик — по слоям',
  fields: [
    sel('sys', 'Утепление стен изнутри', [['mw', 'минвата в каркас + пароизоляция + ГКЛ'], ['xps', 'ЭППС (пеноплекс) на клей + сетка'], ['pir', 'PIR-плита с фольгой + ГКЛ'], ['warm', 'тёплая штукатурка'], ['ppu', 'напыление ППУ + ГКЛ'], ['none', 'не утепляем']], 'mw'),
    num('aHeat', 'Площадь наружных стен (утепление)', 'м²', 20), num('t', 'Толщина утеплителя', 'мм', 50),
    sel('snd', 'Шумоизоляция стен', [['frame', 'каркас на виброподвесах + акуст. минвата + 2×ГКЛ'], ['panels', 'бескаркасная (панели ЗИПС) + ГКЛ'], ['membrane', 'мембрана + ГКЛ на каркасе'], ['none', 'не нужна']], 'none'),
    num('aSound', 'Площадь стен (шумоизоляция)', 'м²', 12),
    num('ceilS', 'Шумоизоляция потолка', 'м²', 0), num('floorS', 'Шумоизоляция пола (под стяжку)', 'м²', 0),
    num('slopes', 'Утепление откосов', 'пог. м', 0), num('corners', 'Промерзающие углы', 'пог. м', 0),
    yes('anti', 'Антисептик от плесени по стенам', 'yes'), yes('putty', 'Шпаклёвка стыков ГКЛ под отделку', 'yes'),
    COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Подготовка'); common(b, v);
    const A = v.sys === 'none' ? 0 : v.aHeat || 0;
    const S = v.snd === 'none' ? 0 : v.aSound || 0;
    const t = Math.max(20, Number(v.t) || 50);
    let gklA = 0;
    if (A && v.anti === 'yes') { b.work('Обработка антисептиком (антиплесень)', A); b.mat('Антисептик-антиплесень (5 л)', ceil(A * 0.25 / 5), 'кан', 900); }
    if (A) b.work('Герметизация примыканий и щелей (пена, герметик)', Math.sqrt(A) * 4);
    b.sec('Утепление стен');
    if (v.sys === 'mw') {
      b.work('Утепление стен минватой изнутри с каркасом', A, { note: `${t} мм` }); b.work('Монтаж пароизоляции стен', A); b.work('Обшивка ГКЛ по готовому каркасу', A); gklA += A;
      b.mat(`Минвата плита ${t} мм (λ 0,036)`, A * 1.05, 'м²', Math.round(170 * t / 50));
      b.mat('Профиль ПС 50 / ПН 50 (3 м)', ceil(A * 2 / 3), 'шт', 230); b.mat('Пароизоляционная плёнка (Изоспан B)', A * 1.15, 'м²', 25);
      b.mat('Лента для пароизоляции', ceil(A / 20), 'рулон', 450);
    }
    if (v.sys === 'xps') {
      b.work('Утепление стен пеноплексом изнутри', A, { note: `${t} мм` }); b.work('Монтаж штукатурной сетки', A); b.work('Шпаклёвка стартовая', A);
      b.mat(`ЭППС ${t} мм`, A * 1.05, 'м²', Math.round(350 * t / 50)); b.mat('Клей-пена для ЭППС (баллон)', ceil(A / 10), 'баллон', 750);
      b.mat('Дюбель-гриб', ceil(A * 5), 'шт', 8); b.mat('Сетка штукатурная стеклотканевая 5×5', A * 1.1, 'м²', 45); b.mat('Клей армирующий (25 кг)', ceil(A * 5 / 25), 'меш', 590);
    }
    if (v.sys === 'pir') {
      b.work('Утепление стен PIR-плитой изнутри', A, { note: `${t} мм` }); b.work('Каркас из профиля под обшивку стен', A); b.work('Обшивка ГКЛ по готовому каркасу', A); gklA += A;
      b.mat(`PIR-плита фольгированная ${t} мм`, A * 1.05, 'м²', Math.round(650 * t / 40)); b.mat('Лента алюминиевая (50 м)', ceil(A / 25), 'рулон', 400);
      b.mat('Профиль ПП 60×27 и ППН 27×28 (3 м)', ceil(A * 2.2 / 3), 'шт', 230);
    }
    if (v.sys === 'warm') {
      b.work('Тёплая штукатурка стен изнутри', A, { note: `${Math.min(t, 50)} мм` });
      b.mat('Тёплая штукатурка перлитовая (25 кг)', ceil(A * Math.min(t, 50) * 0.4 / 25), 'меш', 780);
      b.warn('Тёплая штукатурка: слой 20–50 мм, по теплу ≈ в 3–4 раза хуже минваты той же толщины');
    }
    if (v.sys === 'ppu') { b.work('Напыление ППУ', A, { note: `${t} мм` }); b.work('Каркас из профиля под обшивку стен', A); b.work('Обшивка ГКЛ по готовому каркасу', A); gklA += A; }
    if (v.slopes) { b.work('Утепление откосов изнутри', v.slopes); b.mat('ЭППС 20 мм для откосов', v.slopes * 0.35, 'м²', 160); }
    if (v.corners) { b.work('Утепление промерзающего угла изнутри', v.corners); b.mat('PIR/ЭППС для угла + клей', v.corners, 'пог. м', 450); }
    b.sec('Шумоизоляция');
    if (v.snd === 'frame') {
      b.work('Шумоизоляция стен', S); b.work('Монтаж виброподвесов', S * 2); b.work('Монтаж звукоизоляционной ленты по примыканиям', Math.sqrt(S) * 4);
      b.work('Обшивка ГКЛ по готовому каркасу', S); b.work('Обшивка ГКЛ вторым слоем', S); gklA += S;
      b.mat('Минвата акустическая 50 мм', S * 1.05, 'м²', 330); b.mat('Виброподвес', ceil(S * 2), 'шт', 120);
      b.mat('Лента звукоизоляционная (30 м)', ceil(Math.sqrt(S) * 4 / 30), 'рулон', 600); b.mat('Профиль ПП 60×27 и ППН 27×28 (3 м)', ceil(S * 2.2 / 3), 'шт', 230);
      b.mat('ГКЛ 12,5 мм (1,2×2,5) — второй слой', ceil(S * 1.1 / 3), 'лист', 530);
    }
    if (v.snd === 'panels') {
      b.work('Звукоизоляционная обшивка стены (ЗИПС/каркас)', S); b.work('Монтаж звукоизоляционной ленты по примыканиям', Math.sqrt(S) * 4); b.work('Обшивка ГКЛ по готовому каркасу', S); gklA += S;
      b.mat('Панели ЗИПС', S * 1.05, 'м²', 2400);
    }
    if (v.snd === 'membrane') {
      b.work('Монтаж мембраны звукоизоляционной', S); b.work('Каркас из профиля под обшивку стен', S); b.work('Обшивка ГКЛ по готовому каркасу', S); gklA += S;
      b.mat('Мембрана звукоизоляционная 3,7 мм', S * 1.1, 'м²', 1100); b.mat('Минвата акустическая 50 мм', S * 1.05, 'м²', 330);
      b.mat('Профиль ПП 60×27 и ППН 27×28 (3 м)', ceil(S * 2.2 / 3), 'шт', 230);
    }
    if (v.ceilS) {
      b.work('Шумоизоляция потолка', v.ceilS); b.work('Монтаж виброподвесов', v.ceilS * 1.5); b.work('Обшивка ГКЛ по готовому каркасу', v.ceilS); gklA += v.ceilS;
      b.mat('Минвата акустическая 50 мм', v.ceilS * 1.05, 'м²', 330); b.mat('Виброподвес', ceil(v.ceilS * 1.5), 'шт', 120);
      b.mat('Профиль ПП 60×27 и ППН 27×28 (3 м)', ceil(v.ceilS * 3.3 / 3), 'шт', 230);
    }
    if (v.floorS) { b.work('Шумоизоляция пола', v.floorS); b.mat('Звукоизоляционная подложка под стяжку', v.floorS * 1.1, 'м²', 250); b.mat('Лента звукоизоляционная (30 м)', ceil(Math.sqrt(v.floorS) * 4 / 30), 'рулон', 600); }
    if (gklA) {
      b.sec('Обшивка');
      b.mat('ГКЛ 12,5 мм (1,2×2,5)', ceil(gklA * 1.1 / 3), 'лист', 530); b.mat('Саморезы, дюбели, подвесы', ceil(gklA / 8), 'компл', 700);
      if (v.putty === 'yes') { b.work('Шпаклёвка стыков ГКЛ', gklA); b.mat('Шпаклёвка для швов + серпянка', ceil(gklA / 25), 'компл', 900); }
    }
    if (!A && !S && !v.ceilS && !v.floorS && !v.slopes && !v.corners) { b.work('Тепловизионное обследование дома', 1); b.work('Консультация мастера на объекте', 1); b.warn('Ничего не выбрано — начните с тепловизора: он покажет, где реально уходит тепло'); }
    if (A) b.sum('Утепляем стен', A, 'м²');
    if (S) b.sum('Шумоизоляция стен', S, 'м²');
    if (A) b.warn('Утепление изнутри сдвигает точку росы в стену: пароизоляция без щелей (стыки на ленту), вентиляция помещения обязательна. Если можно — утепляйте снаружи');
    if (v.sys === 'mw' && t > 100) b.warn('Минвата изнутри толще 100 мм съедает площадь и повышает риск конденсата — проверьте теплотехнический расчёт');
    return finish(b, v);
  },
};

// =====================================================================
// Внутренняя отделка под ключ — по этапам от электрики до финиша
// =====================================================================
const interior: Master = {
  id: 'm-interior', icon: '🏠', trade: 'Отделка под ключ', title: 'Внутренняя отделка по этапам: электрика → сантехника → штукатурка → утепление → стяжка → финиш',
  description: 'Вся «внутрянка» квартиры или дома одной сметой: демонтаж, перегородки, черновая электрика и сантехника, утепление наружных стен изнутри, штукатурка, стяжка, шпаклёвка, покраска/обои, плитка, полы, двери, чистовая электрика и сантехника, уборка',
  fields: [
    sel('stage', 'До какого этапа', [['rough', 'черновая (электрика, сантехника, штукатурка, стяжка)'], ['white', 'предчистовая white box (+ шпаклёвка, утепление)'], ['full', 'под ключ (+ покраска, плитка, полы, двери)']], 'full'),
    sel('obj', 'Объект', [['new', 'новостройка (бетон без отделки)'], ['old', 'вторичка (со старой отделкой)'], ['house', 'частный дом']], 'new'),
    num('area', 'Площадь по полу', 'м²', 50), num('H', 'Высота потолка', 'м', 2.7),
    num('rooms', 'Жилых комнат', 'шт', 2, { integer: true, min: 1 }), num('baths', 'Санузлов', 'шт', 1, { integer: true, min: 1 }),
    sel('wall', 'Стены из', [['concrete', 'бетон / монолит'], ['brick', 'кирпич / блоки'], ['gas', 'газобетон']], 'concrete'),
    num('part', 'Новые перегородки', 'м²', 10),
    sel('partMat', 'Перегородки из', [['gkl', 'ГКЛ с шумоизоляцией'], ['pgp', 'пазогребневые плиты'], ['gas', 'газобетон 100 мм']], 'gkl'),
    sel('ins', 'Утепление наружных стен изнутри', [['none', 'не нужно'], ['mw', 'минвата + пароизоляция + ГКЛ'], ['xps', 'ЭППС + штукатурка'], ['warm', 'тёплая штукатурка']], 'none'),
    num('extWall', 'Площадь наружных стен', 'м²', 20, { hint: 'Только для утепления изнутри' }),
    sel('walls', 'Стены — финиш', [['paint', 'покраска'], ['wallpaper', 'обои']], 'paint'),
    sel('ceil', 'Потолки', [['stretch', 'натяжные'], ['paint', 'шпаклёвка и покраска'], ['gkl', 'ГКЛ + покраска']], 'stretch'),
    sel('cover', 'Пол в комнатах', [['laminate', 'ламинат'], ['spc', 'кварцвинил (SPC)'], ['parquet', 'паркетная доска']], 'laminate'),
    yes('warmFloor', 'Тёплый пол в санузле (электрический)', 'yes'),
    COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('1. Подготовка и демонтаж'); common(b, v);
    const A = v.area, H = v.H || 2.7, nb = v.baths || 1, nr = v.rooms || 1;
    const white = v.stage !== 'rough', full = v.stage === 'full';
    const bathF = nb * 4, bathW = nb * 18, apron = 3;
    const idoors = nr + nb + 1, windows = nr + 1; // межкомнатные: комнаты, санузлы, кухня
    const wallsAll = Math.max(0, A * H * 1.0 - idoors * 1.6 * 2 - 2 - windows * 1.8) + (v.part || 0) * 2;
    const dryWalls = Math.max(0, wallsAll - bathW - apron);
    const dryFloor = Math.max(0, A - bathF);
    const per = Math.sqrt(dryFloor) * 4 * 1.6;
    b.work('Защита окон и полов плёнкой', A * 0.5);
    if (v.obj === 'old') {
      b.work('Демонтаж обоев', dryWalls); b.work('Демонтаж плитки со стен', bathW + apron); b.work('Демонтаж стяжки до 5 см', bathF);
      b.work('Демонтаж электропроводки', A * 1.5); b.work('Демонтаж розетки/выключателя', Math.round(A * 0.4));
    }
    b.work(v.obj === 'house' ? 'Разгрузка материалов вручную' : 'Подъём материалов на лифте', A * 0.12);
    if (v.part) {
      b.sec('2. Перегородки');
      if (v.partMat === 'gkl') { b.work('Перегородка из ГКЛ в 2 слоя с шумоизоляцией', v.part); b.mat('ГКЛ, профиль, минвата для перегородки', v.part, 'м²', 1350); }
      if (v.partMat === 'pgp') { b.work('Кладка перегородок из пазогребневых плит', v.part); b.mat('Пазогребневая плита 80 мм + клей', v.part * 1.05, 'м²', 760); }
      if (v.partMat === 'gas') { b.work('Кладка перегородок из газобетона 100 мм', v.part); b.mat('Газобетон 100 мм + клей + армирование', v.part * 0.1 * 1.05, 'м³', 7600); }
    }
    // --- черновая электрика ---
    b.sec('3. Электрика — черновой этап');
    const sockets = Math.max(6, Math.round(A * 0.5)), switches = nr + nb + 2, lamps = nr + nb + 2, lan = nr + 1;
    const c25 = sockets * 6 + 3 * 12 + 12, c15 = (switches + lamps) * 5;
    const chaseLen = (c25 + c15 + lan * 12) * (v.wall === 'concrete' ? 0.4 : 0.55);
    b.work({ concrete: 'Штробление стен в бетоне', brick: 'Штробление стен в кирпиче', gas: 'Штробление стен в газобетоне' }[v.wall as 'brick'], chaseLen);
    b.work('Прокладка кабеля', c25 + c15); b.work('Прокладка кабеля интернет/ТВ', lan * 12);
    b.work({ concrete: 'Монтаж подрозетника в бетон', brick: 'Монтаж подрозетника в кирпич', gas: 'Монтаж подрозетника в газобетон' }[v.wall as 'brick'], sockets + switches + lan);
    b.work('Монтаж распределительной коробки', nr + nb + 2); b.work('Заделка штробы', chaseLen);
    const groups = Math.ceil(sockets / 6) + 2 + 3 + 1 + 2;
    b.work(groups <= 12 ? 'Сборка электрощита (до 12 модулей)' : 'Сборка электрощита (до 24 модулей)', 1); b.work('Монтаж автомата в щит', groups);
    b.work('Монтаж УЗО/дифавтомата', Math.max(2, ceil(sockets / 10))); b.work('Монтаж реле напряжения', 1); b.work('Монтаж выравнивания потенциалов (ванная)', nb);
    b.mat('Кабель ВВГнг-LS 3×2,5', c25 * 1.1, 'м', 160); b.mat('Кабель ВВГнг-LS 3×1,5', c15 * 1.1, 'м', 104); b.mat('Кабель витая пара UTP cat.5e', lan * 13, 'м', 28);
    b.mat('Подрозетники, коробки', sockets + switches + lan + nr + nb + 2, 'шт', 33); b.mat('Щит, автоматы, УЗО, реле напряжения', 1, 'компл', 9000 + groups * 450);
    // --- черновая сантехника ---
    b.sec('4. Сантехника — черновой этап');
    const water = nb * 6 + 3, sewer = nb * 4 + 2;
    b.work('Установка коллектора', 2); b.work('Монтаж точки водоснабжения (вывод)', water); b.work('Прокладка трубы водоснабжения', water * 5);
    b.work('Прокладка канализационной трубы внутри', sewer * 2.5); b.work('Установка инсталляции', nb); b.work('Опрессовка системы', 1);
    b.mat('Труба PPR армированная 20–25 мм', water * 5.5, 'м', 120); b.mat('Фитинги, водорозетки, краны', water, 'компл', 650); b.mat('Коллекторы ХВС/ГВС с кранами', 2, 'шт', 4800);
    b.mat('Трубы и фасонные части канализации 50/110', sewer * 2.7, 'м', 220); b.mat('Инсталляция с кнопкой', nb, 'компл', 24000); b.mat('Фильтры, счётчики, редуктор давления', 1, 'компл', 6500);
    // --- утепление ---
    if (white && v.ins !== 'none' && v.extWall) {
      b.sec('5. Утепление наружных стен изнутри');
      const E = v.extWall;
      b.work('Обработка антисептиком (антиплесень)', E);
      if (v.ins === 'mw') { b.work('Утепление стен минватой изнутри с каркасом', E); b.work('Монтаж пароизоляции стен', E); b.work('Обшивка ГКЛ по готовому каркасу', E); b.work('Шпаклёвка стыков ГКЛ', E); b.mat('Минвата 50 мм, профиль, плёнка, лента, ГКЛ', E, 'м²', 760); }
      if (v.ins === 'xps') { b.work('Утепление стен пеноплексом изнутри', E); b.work('Монтаж штукатурной сетки', E); b.mat('ЭППС 50 мм, клей-пена, дюбели, сетка', E * 1.05, 'м²', 470); }
      if (v.ins === 'warm') { b.work('Тёплая штукатурка стен изнутри', E); b.mat('Тёплая штукатурка перлитовая (25 кг)', ceil(E * 30 * 0.4 / 25), 'меш', 780); }
      b.warn('Утепление изнутри — с пароизоляцией без щелей и рабочей вентиляцией, иначе конденсат и плесень в стене');
    }
    // --- штукатурка ---
    b.sec('6. Штукатурка');
    const insGkl = white && v.ins === 'mw' ? v.extWall || 0 : 0;
    const plast = Math.max(0, wallsAll - (v.partMat === 'gkl' ? (v.part || 0) * 2 : 0) - insGkl);
    if (v.wall === 'concrete') { b.work('Бетоноконтакт', plast); b.mat('Бетоноконтакт (20 кг)', ceil(plast * 0.35 / 20), 'ведро', 1600); }
    b.work('Грунтовка стен', plast); b.work('Машинная штукатурка стен', plast, { note: 'гипсовая по маякам, слой ~15 мм' });
    b.work('Штукатурка откосов', windows * 5);
    b.mat('Штукатурка гипсовая машинная (30 кг)', ceil(plast * 15 / 30), 'меш', 640); b.mat('Маяки 6 мм (3 м)', ceil(plast / 1.5 / 3 * 1.2), 'шт', 45);
    b.mat('Грунтовка глубокого проникновения (10 л)', ceil((plast + A) * 0.3 / 10), 'кан', 1240);
    if (v.wall === 'gas') { b.work('Монтаж штукатурной сетки', plast); b.mat('Сетка штукатурная стеклотканевая 5×5', plast * 1.1, 'м²', 45); }
    // --- стяжка ---
    b.sec('7. Стяжка и гидроизоляция');
    b.work('Стяжка пола полусухая', A); b.mat('Пескобетон / ЦПС (40 кг)', ceil(A * 0.05 * 2000 / 40), 'меш', 155); b.mat('Фиброволокно, демпферная лента, плёнка', ceil(A / 20), 'компл', 900);
    b.work('Гидроизоляция санузла обмазочная', bathF + nb * 3); b.mat('Гидроизоляция обмазочная (15 кг) + лента', ceil((bathF + nb * 3) / 8), 'компл', 2900);
    if (white) {
      b.sec('8. Шпаклёвка');
      b.work(v.walls === 'wallpaper' ? 'Шпаклёвка под обои' : 'Шпаклёвка стен под покраску', dryWalls); b.work('Шпаклёвка откосов', windows * 5);
      b.work('Монтаж малярного уголка', windows * 4.5 + nr * H);
      if (v.walls === 'paint') { b.work('Армирование стен стеклохолстом', dryWalls); b.mat('Стеклохолст (50 м²)', ceil(dryWalls * 1.1 / 50), 'рулон', 1600); }
      b.mat('Шпаклёвка финишная полимерная (20 кг)', ceil(dryWalls * (v.walls === 'wallpaper' ? 0.6 : 1) / 20), 'меш', 1530);
      if (v.ceil === 'paint') { b.work('Грунтовка потолка', A); b.work('Шпаклёвка потолка под покраску', A); b.mat('Шпаклёвка финишная (20 кг)', ceil(A / 20), 'меш', 900); }
      if (v.ceil === 'gkl') { b.work('Потолок из ГКЛ в 1 уровень', A); b.work('Шпаклёвка стыков ГКЛ', A); b.work('Шпаклёвка потолка под покраску', A); b.mat('ГКЛ, профиль, подвесы для потолка', A, 'м²', 520); }
    }
    if (full) {
      b.sec('9. Чистовая отделка стен и потолков');
      if (v.walls === 'paint') { b.work('Покраска стен в 2 слоя', dryWalls); b.mat('Краска интерьерная моющаяся (9 л)', ceil(dryWalls * 0.3 / 9), 'ведро', 6000); }
      else { b.work('Поклейка обоев', dryWalls); b.mat('Обои флизелиновые 1,06×10 м', ceil(dryWalls * 1.15 / 10.6), 'рулон', 2000); b.mat('Клей обойный', ceil(dryWalls / 30), 'уп', 550); }
      b.work('Покраска откосов', windows * 5);
      if (v.ceil === 'stretch') { b.work('Монтаж натяжного потолка', A); b.mat('Полотно ПВХ матовое с багетом', A, 'м²', 450); }
      else { b.work('Покраска потолка', A); b.mat('Краска для потолков (9 л)', ceil(A * 0.3 / 9), 'ведро', 3250); }
      b.sec('10. Плитка');
      if (v.warmFloor === 'yes') { b.work('Монтаж тёплого пола (мат) под плитку', bathF * 0.7); b.work('Монтаж регулятора тёплого пола', nb); b.mat('Нагревательный мат 150 Вт/м²', bathF * 0.7, 'м²', 2140); b.mat('Терморегулятор', nb, 'шт', 2740); }
      b.work('Укладка плитки на пол', bathF); b.work('Укладка плитки на стены', bathW); b.work('Укладка плитки на фартук', apron);
      b.work('Затирка швов плитки', bathF + bathW + apron); b.work('Обшивка инсталляции ГКЛ', nb); b.work('Короб из ГКЛ под трубы', nb * 2.6);
      b.mat('Плитка / керамогранит (+10% на подрезку)', (bathF + bathW + apron) * 1.1, 'м²', 1300);
      b.mat('Плиточный клей (25 кг)', ceil((bathF + bathW + apron) * 5 / 25), 'меш', C1_GLUE); b.mat('Затирка (2 кг)', ceil((bathF + bathW + apron) / 8), 'шт', 450);
      b.sec('11. Полы');
      const cov = ({ laminate: ['Укладка ламината', 'Ламинат 33 класс', 1070], spc: ['Укладка кварцвинила (SPC)', 'Кварцвинил SPC', 1430], parquet: ['Укладка паркетной доски', 'Паркетная доска', 4200] } as Record<string, [string, string, number]>)[v.cover] || ['Укладка ламината', 'Ламинат 33 класс', 1070];
      b.work(cov[0], dryFloor); b.work('Монтаж подложки', dryFloor); b.work('Монтаж плинтуса', per); b.work('Монтаж порогов', idoors);
      b.mat(`${cov[1]} (+7%)`, dryFloor * 1.07, 'м²', cov[2]); b.mat('Подложка', dryFloor * 1.05, 'м²', 78); b.mat('Плинтус с заглушками и углами', ceil(per * 1.1 / 2.5), 'шт (2,5 м)', 380); b.mat('Порог-стык', idoors, 'шт', 450);
      b.sec('12. Двери');
      b.work('Монтаж межкомнатной двери', idoors); b.work('Монтаж доборов', idoors); b.work('Монтаж наличников', idoors);
      b.mat('Межкомнатная дверь с коробкой, наличниками и фурнитурой', idoors, 'компл', 14000);
      b.sec('13. Чистовая электрика и сантехника');
      b.work('Монтаж розетки/выключателя', sockets + switches); b.work('Монтаж розетки интернет/ТВ', lan); b.work('Монтаж люстры', lamps);
      b.mat('Розетки и выключатели (механизм + рамка)', sockets + switches, 'шт', 450); b.mat('Розетка RJ45 / TV (механизм + рамка)', lan, 'шт', 650);
      b.work('Установка унитаза', nb); b.work('Установка раковины', nb); b.work('Установка ванны', nb); b.work('Установка смесителя', nb * 2 + 1);
      b.work('Установка кухонной мойки', 1); b.work('Установка стиральной машины', 1); b.work('Установка полотенцесушителя', nb);
      b.sec('14. Уборка');
      b.work('Уборка после ремонта квартиры', A);
    }
    b.sum('Площадь стен', wallsAll, 'м²').sum('Штукатурка', plast, 'м²').sum('Пол', A, 'м²');
    if (full) b.sum('Плитка', bathF + bathW + apron, 'м²');
    if (v.obj === 'new') b.warn('Новостройка: дом даёт усадку 1–2 года — армируйте стены стеклохолстом и оставляйте демпферные зазоры');
    return finish(b, v);
  },
};

export const MASTERS: Master[] = [tile, roof, finishM, floors, electric, plumbing, gkl, foundation, mason, facade, septic, well, heating, paving, windowsM, demolition, balcony, stretch, climate, houseM, metal, yardM, handy, insulIn, interior];
