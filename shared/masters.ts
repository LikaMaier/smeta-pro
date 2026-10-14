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
    return this.push({
      name, qty: r2(qty), unit: s.unit, type, price: Math.round(s.price * k), category: this.section,
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
const finishM: Master = {
  id: 'm-finish', icon: '🎨', trade: 'Маляр-штукатур', title: 'Отделка стен и потолков: штукатурка, покраска, обои, потолки',
  description: 'По размерам комнат: выравнивание по маякам, шпаклёвка, покраска, обои, декоративная штукатурка, натяжной и ГКЛ потолок',
  fields: [
    num('L', 'Длина помещения', 'м', 5), num('W', 'Ширина', 'м', 4), num('H', 'Высота', 'м', 2.7), num('rooms', 'Таких помещений', 'шт', 1, { integer: true, min: 1 }),
    num('doors', 'Двери', 'шт', 1, { integer: true }), num('windows', 'Окна', 'шт', 1, { integer: true }),
    sel('walls', 'Стены — финиш', [['paint', 'покраска'], ['wallpaper', 'обои'], ['glass', 'стеклообои под покраску'], ['decor', 'декоративная штукатурка'], ['tile', 'только выравнивание под плитку']], 'paint'),
    sel('level', 'Выравнивание стен', [['plaster', 'штукатурка по маякам'], ['putty', 'только шпаклёвка'], ['none', 'не нужно']], 'plaster'),
    sel('ceil', 'Потолок', [['paint', 'шпаклёвка и покраска'], ['stretch', 'натяжной'], ['gkl', 'ГКЛ в 1 уровень + покраска'], ['gkl2', 'ГКЛ в 2 уровня + покраска'], ['none', 'не делаем']], 'stretch'),
    yes('cornice', 'Потолочный плинтус (галтель)', 'no'), yes('slopes', 'Откосы окон штукатуркой', 'yes'),
    sel('demo', 'Демонтаж', [['none', 'нет'], ['wallpaper', 'старые обои'], ['plaster', 'старая штукатурка']], 'none'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Подготовка'); common(b, v);
    const n = v.rooms || 1;
    const per = 2 * (v.L + v.W);
    const walls = Math.max(0, (per * v.H - v.doors * 1.6 - v.windows * 1.8)) * n;
    const ceilA = v.L * v.W * n;
    if (v.demo === 'wallpaper') b.work('Демонтаж обоев', walls);
    if (v.demo === 'plaster') b.work('Демонтаж штукатурки', walls);
    b.work('Грунтовка стен', walls + (v.ceil === 'paint' ? ceilA : 0)); b.mat('Грунтовка глубокого проникновения (10 л)', ceil((walls + ceilA) * 0.3 / 10), 'кан', 1240);
    b.sec('Стены');
    if (v.level === 'plaster') { b.work('Штукатурка стен по маякам', walls); b.mat('Штукатурка гипсовая (30 кг)', ceil(walls * 13 / 30), 'меш', 495); b.mat('Маяки 6 мм (3 м)', ceil(walls / 1.5 / 3 * 1.2), 'шт', 45); }
    if (v.walls !== 'tile' && v.level !== 'none') {
      b.work('Шпаклёвка стен под покраску', walls); b.mat('Шпаклёвка финишная полимерная (20 кг)', ceil(walls * 1 / 20), 'меш', 1530);
      if (v.walls === 'paint') { b.work('Армирование стен стеклохолстом', walls); b.mat('Стеклохолст (50 м²)', ceil(walls * 1.1 / 50), 'рулон', 1600); }
      b.work('Монтаж малярного уголка', 4 * v.H * n); b.mat('Уголок перфорированный (3 м)', ceil(4 * v.H * n / 3), 'шт', 60);
    }
    if (v.walls === 'paint') { b.work('Покраска стен в 2 слоя', walls); b.mat('Краска интерьерная моющаяся (9 л)', ceil(walls * 0.3 / 9), 'ведро', 6000); }
    if (v.walls === 'wallpaper') { b.work('Поклейка обоев', walls); b.mat('Обои флизелиновые 1,06×10 м', ceil(walls * 1.15 / 10.6), 'рулон', 2000); b.mat('Клей обойный', ceil(walls / 30), 'уп', 550); }
    if (v.walls === 'glass') { b.work('Поклейка стеклообоев', walls); b.work('Покраска стен в 2 слоя', walls); b.mat('Стеклообои (25 м²)', ceil(walls * 1.1 / 25), 'рулон', 3790); b.mat('Краска интерьерная (9 л)', ceil(walls * 0.4 / 9), 'ведро', 4190); }
    if (v.walls === 'decor') { b.work('Декоративная штукатурка стен', walls); b.mat('Декоративная штукатурка', walls * 1.2, 'кг', 450); }
    if (v.slopes === 'yes' && v.windows) b.work('Штукатурка откосов', v.windows * 5 * n);
    b.sec('Потолок');
    if (v.ceil === 'paint') { b.work('Шпаклёвка потолка под покраску', ceilA); b.work('Покраска потолка', ceilA); b.mat('Краска для потолков (9 л)', ceil(ceilA * 0.3 / 9), 'ведро', 3250); b.mat('Шпаклёвка финишная (20 кг)', ceil(ceilA / 20), 'меш', 900); }
    if (v.ceil === 'stretch') { b.work('Монтаж натяжного потолка', ceilA); b.mat('Полотно ПВХ матовое с багетом', ceilA, 'м²', 450); }
    if (v.ceil === 'gkl' || v.ceil === 'gkl2') {
      b.work(v.ceil === 'gkl' ? 'Потолок из ГКЛ в 1 уровень' : 'Потолок из ГКЛ в 2 уровня', ceilA); b.work('Шпаклёвка стыков ГКЛ', ceilA); b.work('Шпаклёвка потолка под покраску', ceilA); b.work('Покраска потолка', ceilA);
      b.mat('ГКЛ 12,5 мм (3 м²)', ceil(ceilA * (v.ceil === 'gkl2' ? 1.5 : 1.1) / 3), 'лист', 530); b.mat('Профиль ПП 60×27 и ППН (3 м)', ceil(ceilA * 3.3 / 3), 'шт', 210);
      b.mat('Подвесы, крабы, саморезы', ceil(ceilA / 10), 'компл', 900); b.mat('Краска для потолков (9 л)', ceil(ceilA * 0.3 / 9), 'ведро', 3250);
    }
    if (v.cornice === 'yes') { b.work('Монтаж потолочного плинтуса (галтели)', per * n); b.mat('Галтель полиуретановая (2 м)', ceil(per * n * 1.1 / 2), 'шт', 450); }
    b.sum('Площадь стен', walls, 'м²').sum('Площадь потолка', ceilA, 'м²');
    return finish(b, v);
  },
};

// =====================================================================
// Полы
// =====================================================================
const floors: Master = {
  id: 'm-floor', icon: '🪵', trade: 'Мастер по полам', title: 'Полы: стяжка, наливной, лаги, тёплый пол, покрытие',
  description: 'ЦПС, полусухая, наливной, по лагам с фанерой. Ламинат, кварцвинил, паркетная доска, линолеум, ковролин, полимерный пол',
  fields: [
    num('area', 'Площадь пола', 'м²', 40), num('per', 'Периметр (для плинтуса)', 'м', 30), num('rooms', 'Помещений (пороги)', 'шт', 3, { integer: true }),
    sel('base', 'Основание', [['cps', 'стяжка ЦПС'], ['semi', 'полусухая стяжка'], ['self', 'наливной пол (выравнивание)'], ['joists', 'лаги + фанера'], ['none', 'основание готово']], 'semi'),
    num('thick', 'Толщина стяжки', 'мм', 50),
    sel('heat', 'Тёплый пол', [['no', 'нет'], ['water', 'водяной'], ['electric', 'электрический']], 'no'),
    sel('cover', 'Покрытие', [['laminate', 'ламинат'], ['spc', 'кварцвинил (SPC)'], ['parquet', 'паркетная доска'], ['lino', 'линолеум'], ['carpet', 'ковролин'], ['polymer', 'наливной полимерный (декор)'], ['none', 'под плитку — без покрытия']], 'laminate'),
    yes('insul', 'Утепление керамзитом', 'no'),
    sel('demo', 'Демонтаж', [['none', 'нет'], ['soft', 'линолеум / ламинат'], ['wood', 'деревянный пол'], ['screed', 'старая стяжка']], 'none'), COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Демонтаж и подготовка'); common(b, v);
    const A = v.area;
    if (v.demo === 'soft') b.work('Демонтаж линолеума/ламината', A);
    if (v.demo === 'wood') b.work('Демонтаж деревянного пола', A);
    if (v.demo === 'screed') b.work('Демонтаж стяжки', A);
    if (v.insul === 'yes') { b.work('Утепление пола керамзитом', A); b.mat('Керамзит фр. 10–20', A * 0.08, 'м³', 2800); }
    b.sec('Тёплый пол');
    if (v.heat === 'water') {
      b.work('Монтаж тёплого водяного пола', A); b.work('Монтаж коллекторной группы тёплого пола', 1);
      b.mat('Труба PE-Xa 16 мм', A * 6.7, 'м', 164); b.mat('Утеплитель ЭППС 30 мм', A * 1.05, 'м²', 230); b.mat('Коллекторная группа со смесительным узлом', 1, 'компл', 22000);
    }
    if (v.heat === 'electric') { b.work('Монтаж электрического тёплого пола', A * 0.7); b.mat('Нагревательный мат 150 Вт/м²', A * 0.7, 'м²', 2140); b.mat('Терморегулятор', Math.max(1, v.rooms), 'шт', 2740); }
    b.sec('Основание');
    const t = Math.max(v.thick || 50, 30);
    if (v.base === 'cps' || v.base === 'semi') {
      b.work(v.base === 'cps' ? 'Стяжка пола ЦПС до 50 мм' : 'Стяжка пола полусухая', A);
      if (t > 50) b.work('Стяжка пола свыше 50 мм (каждые 10 мм)', A * ceil((t - 50) / 10));
      b.mat('Пескобетон / ЦПС (40 кг)', ceil(A * t / 1000 * 2000 / 40), 'меш', 155); b.mat('Фиброволокно, демпферная лента, плёнка', ceil(A / 20), 'компл', 900);
    }
    if (v.base === 'self' || v.cover === 'polymer') { b.work('Наливной пол', A); b.mat('Наливной пол (20 кг)', ceil(A * 1.6 * 5 / 20), 'меш', 576); }
    if (v.base === 'joists') {
      b.work('Монтаж лаг под пол', A); b.work('Укладка фанеры на лаги', A);
      b.mat('Брус лаги 50×100', A * 0.02, 'м³', 29900); b.mat('Фанера ФК 18 мм (1,52×1,52)', ceil(A * 1.08 / 2.31), 'лист', 2099);
    }
    b.sec('Покрытие');
    const cov: Record<string, [string, string, number]> = {
      laminate: ['Укладка ламината', 'Ламинат 33 класс', 1070], spc: ['Укладка кварцвинила (SPC)', 'Кварцвинил SPC', 1430],
      parquet: ['Укладка паркетной доски', 'Паркетная доска', 4200], lino: ['Укладка линолеума', 'Линолеум полукоммерческий', 700],
      carpet: ['Укладка ковролина', 'Ковролин', 650], polymer: ['Наливной пол декоративный (3D/полимер)', 'Полимерный состав', 1800],
    };
    if (cov[v.cover]) {
      const [w, m, p] = cov[v.cover];
      b.work(w, A); b.mat(`${m} (+7%)`, A * 1.07, 'м²', p);
      if (['laminate', 'spc', 'parquet'].includes(v.cover)) { b.work('Монтаж подложки', A); b.mat('Подложка', A * 1.05, 'м²', 78); }
      if (v.cover !== 'polymer') { b.work('Монтаж плинтуса', v.per); b.mat('Плинтус с заглушками и углами', ceil(v.per * 1.1 / 2.5), 'шт (2,5 м)', 380); }
      b.work('Монтаж порогов', v.rooms); b.mat('Порог-стык', v.rooms, 'шт', 450);
    }
    b.sum('Площадь', A, 'м²');
    if (v.cover === 'none' && v.heat === 'electric') b.warn('Электрический тёплый пол под плитку — мат укладывается в слой клея');
    return finish(b, v);
  },
};

// =====================================================================
// Электрик
// =====================================================================
const electric: Master = {
  id: 'm-electric', icon: '⚡', trade: 'Электрик', title: 'Электромонтаж: проводка, щит, розетки, свет, ввод, заземление',
  description: 'Квартира или дом. Штробление по типу стен, кабели, щит с автоматами и УЗО, точки, свет, улица, ввод и контур заземления',
  fields: [
    sel('obj', 'Объект', [['flat', 'квартира'], ['house', 'частный дом']], 'flat'),
    num('area', 'Площадь', 'м²', 60), num('rooms', 'Помещений', 'шт', 4, { integer: true, min: 1 }),
    sel('wall', 'Стены', [['concrete', 'бетон / монолит'], ['brick', 'кирпич / блоки'], ['gkl', 'ГКЛ (без штроб)'], ['wood', 'дерево (открытая проводка)']], 'brick'),
    num('sockets', 'Розетки', 'шт', 0, { integer: true, hint: '0 — посчитать по площади' }),
    num('switches', 'Выключатели', 'шт', 0, { integer: true, hint: '0 — по числу помещений' }),
    num('spots', 'Точечные светильники', 'шт', 0, { integer: true }), num('lamps', 'Люстры / светильники', 'шт', 0, { integer: true, hint: '0 — по помещению' }),
    num('led', 'Светодиодная лента', 'м', 0), num('street', 'Уличные фонари', 'шт', 0, { integer: true }),
    yes('stove', 'Электроплита (отдельная линия)', 'yes'), yes('input', 'Ввод в дом и счётчик', 'no'), yes('ground', 'Контур заземления', 'no'),
    COMPLEXITY, DEBRIS,
  ],
  build: (v) => {
    const b = new Builder('Электромонтаж'); common(b, v);
    const sockets = v.sockets || Math.max(6, Math.round(v.area * 0.5));
    const switches = v.switches || v.rooms + 1;
    const lamps = v.lamps || v.rooms;
    const cable25 = sockets * 6 + (v.stove === 'yes' ? 12 : 0);
    const cable15 = (switches + lamps + v.spots) * 5;
    const groups = Math.ceil(sockets / 6) + Math.ceil((lamps + v.spots) / 10) + (v.stove === 'yes' ? 1 : 0) + 2;
    const open = v.wall === 'wood';
    if (!open && v.wall !== 'gkl') b.work('Штробление стен под кабель', (cable25 + cable15) * 0.55, { k: v.wall === 'concrete' ? 1.3 : 1, note: v.wall === 'concrete' ? 'бетон ×1,3' : undefined });
    b.work(open ? 'Прокладка кабеля в гофре по стене' : 'Прокладка кабеля', cable25 + cable15);
    const boxes = sockets + switches;
    if (v.wall === 'gkl') b.work('Монтаж подрозетника в ГКЛ', boxes); else if (!open) b.work('Монтаж подрозетника в бетон', boxes, { k: v.wall === 'concrete' ? 1 : 0.8 });
    b.work('Монтаж распределительной коробки', v.rooms * 1.5);
    b.work('Монтаж розетки/выключателя', sockets + switches);
    b.work('Монтаж люстры', lamps); b.work('Монтаж точечного светильника', v.spots); b.work('Монтаж светодиодной ленты', v.led);
    if (v.stove === 'yes') b.work('Подключение электроплиты', 1);
    b.sec('Щит');
    b.work('Сборка электрощита (до 12 модулей)', groups > 12 ? 2 : 1); b.work('Монтаж автомата в щит', groups); b.work('Монтаж УЗО/дифавтомата', Math.max(2, Math.ceil(sockets / 10)));
    if (v.obj === 'house' || v.input === 'yes') b.sec('Ввод и улица');
    if (v.input === 'yes') { b.work('Ввод электричества в дом', 1); b.work('Монтаж счётчика электроэнергии', 1); b.mat('Счётчик + вводной автомат + СИП-кабель', 1, 'компл', 14000); }
    if (v.ground === 'yes') { b.work('Монтаж контура заземления', 1); b.mat('Комплект заземления (электроды, полоса)', 1, 'компл', 9000); }
    if (v.street) { b.work('Монтаж уличного освещения (столб)', v.street); b.work('Прокладка кабеля в земле (с траншеей)', v.street * 10); b.mat('Кабель бронированный ВБбШв 3×1,5', v.street * 11, 'м', 160); }
    b.sec('Электромонтаж');
    b.mat('Кабель ВВГнг-LS 3×2,5', cable25 * 1.1, 'м', 160); b.mat('Кабель ВВГнг-LS 3×1,5', cable15 * 1.1, 'м', 104);
    if (v.stove === 'yes') b.mat('Кабель ВВГнг-LS 3×6 (плита)', 13, 'м', 337);
    if (open) b.mat('Гофра / кабель-канал', (cable25 + cable15) * 1.1, 'м', 35);
    b.mat('Подрозетники, коробки', boxes + Math.ceil(v.rooms * 1.5), 'шт', 33);
    b.mat('Розетки и выключатели (механизм + рамка)', sockets + switches, 'шт', 450);
    b.mat('Щит, автоматы, УЗО, шины', 1, 'компл', 6000 + groups * 450);
    b.sum('Розеток', sockets, 'шт').sum('Групп в щите', groups, 'шт').sum('Кабеля', cable25 + cable15, 'м');
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

export const MASTERS: Master[] = [tile, roof, finishM, floors, electric, plumbing, gkl, foundation, mason, facade, septic, well, heating, paving];
