/**
 * Направления работ для мастера «Новая смета»: шаг 1 — направление, шаг 2 — вид работы.
 * Вид работы ведёт в мастер под ключ (с предвыбранным параметром), в готовый шаблон или в 3D-проектировщик.
 */
import { MASTERS } from './masters';
import { TEMPLATES } from './templates';

export interface WorkKind { id: string; icon?: string; title: string; text?: string; to?: string; template?: string }
export interface Direction { id: string; icon: string; title: string; text: string; kinds: WorkKind[] }

const M = new Map(MASTERS.map((m) => [m.id, m]));
const T = new Map(TEMPLATES.map((t) => [t.id, t]));

/** Виды работ мастера: варианты его первого выбора («Что облицовываем», «Тип фундамента»…) */
function fromMaster(id: string, key?: string, pick?: string[], titles: Record<string, string> = {}): WorkKind[] {
  const m = M.get(id);
  if (!m) return [];
  const f = m.fields.find((x) => x.type === 'select' && (!key || x.key === key));
  if (!f?.options) return [{ id, title: m.trade, text: m.description, to: `/calculators/${id}` }];
  return f.options.filter((o) => !pick || pick.includes(String(o.value))).map((o) => ({
    id: `${id}:${o.value}`,
    title: titles[String(o.value)] || cap(o.label),
    to: `/calculators/${id}?set=${f.key}:${encodeURIComponent(String(o.value))}`,
  }));
}
const master = (id: string, title?: string, text?: string): WorkKind => {
  const m = M.get(id)!;
  return { id, title: title || m.trade, text: text || m.description, to: `/calculators/${id}` };
};
const tpl = (id: string): WorkKind[] => { const t = T.get(id); if (!t) throw new Error(`Нет шаблона ${id}`); return [{ id: `t:${id}`, icon: '📋', title: t.title, text: `Готовая смета · ${t.description}`, template: id }]; };
const tpls = (...ids: string[]) => ids.flatMap(tpl);
const d3 = (preset: string, icon: string, title: string, text: string): WorkKind => ({ id: `d-${preset}`, icon, title, text: `3D · ${text}`, to: `/designer?preset=${preset}` });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const DIRECTIONS: Direction[] = [
  { id: 'turnkey', icon: '🔑', title: 'Ремонт под ключ', text: 'Квартира, санузел, комната — готовые сметы', kinds: [
    ...tpls('flat1-turnkey', 'flat2-turnkey', 'newbuild-45', 'bath-turnkey', 'shower-room', 'toilet-room', 'room-cosmetic', 'room-paint', 'kitchen-apron', 'demo-flat', 'handy-move'),
  ] },
  { id: 'commerce', icon: '🏢', title: 'Коммерция', text: 'Офис, магазин, кафе, салон', kinds: [...tpls('office-60', 'shop-40', 'cafe-80', 'salon-50')] },
  { id: 'finish', icon: '🎨', title: 'Отделка', text: 'Штукатурка, покраска, обои, потолки', kinds: [
    master('m-finish', 'Комната под ключ', 'Стены, потолок, откосы — по размерам комнаты'),
    master('m-stretch', 'Натяжные потолки', 'Полотно, профиль, светильники, обходы труб'),
    ...fromMaster('m-gkl', 'kind'),
    ...tpls('room-cosmetic', 'room-paint', 'stretch-flat', 'gkl-partition', 'gkl-ceil2'),
  ] },
  { id: 'tile', icon: '🧱', title: 'Плитка', text: 'Санузел, пол, стены, фартук', kinds: [...fromMaster('m-tile', 'obj'), ...tpls('bath-turnkey', 'shower-room', 'toilet-room', 'kitchen-apron')] },
  { id: 'floor', icon: '🪵', title: 'Полы', text: 'Ламинат, кварцвинил, паркет, стяжка', kinds: [
    ...([['laminate', 'Ламинат'], ['spc', 'Кварцвинил (SPC)'], ['parquet', 'Паркетная доска'], ['lino', 'Линолеум'], ['carpet', 'Ковролин']] as const).map(([c, t]) => ({
      id: `m-floor:cover-${c}`, title: t, text: 'Укладка на готовое основание: подложка, плинтус, пороги', to: `/calculators/m-floor?set=base:none,cover:${c}`,
    })),
    ...fromMaster('m-floor', 'base', ['cps', 'semi', 'self', 'joists'], { cps: 'Стяжка ЦПС', semi: 'Полусухая стяжка', self: 'Наливной пол', joists: 'Лаги + фанера' }),
    ...tpls('laminate-50', 'spc-40', 'screed-100', 'warm-floor-80'),
  ] },
  { id: 'windows', icon: '🪟', title: 'Окна и двери', text: 'Окна, откосы, подоконники, двери', kinds: [...fromMaster('m-windows', 'kind', undefined, { windows: 'Пластиковые окна', interior: 'Межкомнатные двери', entrance: 'Входная дверь', all: 'Окна и двери вместе' }), ...tpls('windows-flat', 'doors-4', 'door-entrance')] },
  { id: 'balcony', icon: '🌇', title: 'Балкон и лоджия', text: 'Остекление, утепление, отделка', kinds: [...fromMaster('m-balcony', 'glaze', undefined, { warm: 'Тёплый балкон под ключ', cold: 'Холодное остекление', none: 'Утепление и отделка' }), ...tpls('balcony-warm', 'balcony-cold')] },
  { id: 'demo', icon: '🔨', title: 'Демонтаж', text: 'Плитка, стяжка, перегородки, вывоз', kinds: [...fromMaster('m-demo', 'obj', undefined, { flat: 'Квартира под ремонт', bath: 'Санузел', room: 'Комната', custom: 'Выберу сам' }), ...tpls('demo-flat', 'demo-bath')] },
  { id: 'climate', icon: '❄️', title: 'Кондиционеры', text: 'Сплит-системы, трассы, вытяжки', kinds: [master('m-ac', 'Кондиционеры и вентиляция', 'Монтаж сплит-систем, трассы, помпы, вытяжки'), ...tpls('ac-2')] },
  { id: 'electric', icon: '⚡', title: 'Электрика', text: 'Проводка, щит, розетки, свет', kinds: [
    ...fromMaster('m-electric', 'obj', undefined, { flat: 'Электрика в квартире', house: 'Электрика в частном доме' }),
    { id: 'mep-e', icon: '📐', title: 'По плану комнат (3D)', text: 'Точки по ПУЭ, трассы, щит, чертёж и смета', to: '/mep' },
    ...tpls('electric-flat', 'electric-house'),
  ] },
  { id: 'plumb', icon: '🚿', title: 'Сантехника', text: 'Разводка, канализация, приборы', kinds: [
    master('m-plumb', 'Сантехника под ключ', 'Разводка, канализация, установка приборов'),
    { id: 'mep-p', icon: '📐', title: 'По плану комнат (3D)', text: 'Трубы, канализация, чертёж и смета', to: '/mep' },
    ...tpls('plumb-flat'),
  ] },
  { id: 'roof', icon: '🏠', title: 'Кровля', text: 'Стропила, покрытие, водосток', kinds: [...fromMaster('m-roof', 'shape', undefined, { gable: 'Двускатная крыша', shed: 'Односкатная крыша', hip: 'Вальмовая крыша', mansard: 'Мансардная крыша' }), ...tpls('roof-gable', 'roof-soft-hip', 'roof-replace')] },
  { id: 'found', icon: '🏗', title: 'Фундамент', text: 'Лента, плита, сваи, отмостка', kinds: [
    ...fromMaster('m-found', 'type', undefined, { strip: 'Ленточный фундамент', slab: 'Монолитная плита', pile: 'Свайно-ростверковый', screw: 'Винтовые сваи' }),
    ...tpls('blind-area', 'strip-foundation', 'found-slab', 'found-screw', 'found-pile'),
  ] },
  { id: 'walls', icon: '🧱', title: 'Стены и кладка', text: 'Газобетон, кирпич, блоки', kinds: [...fromMaster('m-mason', 'mat', undefined, { gas: 'Стены из газобетона', brick1: 'Кирпич в 1 кирпич', brick15: 'Кирпич в 1,5 кирпича', keramzit: 'Керамзитобетонный блок', ceramic: 'Керамический блок' }), ...tpls('walls-gas', 'walls-brick2')] },
  { id: 'facade', icon: '🏘', title: 'Фасад', text: 'Утепление, штукатурка, сайдинг', kinds: [...fromMaster('m-facade', 'sys'), ...tpls('facade-wet', 'facade-siding')] },
  { id: 'heat', icon: '🔥', title: 'Отопление и газ', text: 'Котёл, радиаторы, газгольдер', kinds: [
    ...fromMaster('m-heat', 'src', undefined, { gaswall: 'Газовый настенный котёл', gasfloor: 'Газовый напольный котёл', electric: 'Электрокотёл', solid: 'Твердотопливный котёл', hp: 'Тепловой насос' }),
    ...tpls('gasholder', 'boiler', 'heat-gas-150', 'heat-el-80'),
  ] },
  { id: 'water', icon: '💧', title: 'Вода и канализация', text: 'Скважина, септик, дренаж', kinds: [
    ...fromMaster('m-septic', 'type', undefined, { bio: 'Станция биоочистки', plastic: 'Пластиковый септик', rings: 'Септик из колец' }),
    ...fromMaster('m-well', 'src', undefined, { sand: 'Скважина на песок', lime: 'Скважина на известняк', ring: 'Колодец из колец' }),
    ...tpls('drainage', 'septic-bio5', 'septic-rings', 'well-sand', 'well-lime', 'well-caisson'),
  ] },
  { id: 'yard', icon: '🚧', title: 'Заборы и участок', text: 'Заборы, мощение, площадки', kinds: [
    { id: 'fence', icon: '🚧', title: 'Забор и ворота', text: '17 видов заборов, ворота, калитки', to: '/calculators/fence-pro' },
    { id: 'fence3d', icon: '📐', title: 'Забор в 3D', text: 'Модель, чертёж, PDF и смета', to: '/fence' },
    ...fromMaster('m-paving', 'cover', ['tile', 'paver', 'granite', 'asphalt', 'rubble'], { tile: 'Тротуарная плитка', paver: 'Брусчатка', granite: 'Гранитная плитка', asphalt: 'Асфальт', rubble: 'Площадка из щебня' }),
    ...fromMaster('m-gates', 'gate', ['sliding', 'swing'], { sliding: 'Откатные ворота', swing: 'Распашные ворота' }),
    master('m-gates', 'Козырьки, лестницы, перила', 'Металлоконструкции, сварка, покраска'),
    master('m-yard', 'Ливнёвка, газон, освещение', 'Лотки, ливнеприёмники, газон, фонари, посадки, полив'),
    { id: 'site3d', icon: '🗺', title: 'План участка в 3D', text: 'Дом, септик, скважина, парковка — с проверкой норм и сметой', to: '/site' },
    ...tpls('tko', 'paving-yard', 'paving-paths', 'parking-rubble', 'parking', 'paving', 'gates-sliding', 'gates-swing', 'yard-lawn', 'yard-drain', 'yard-lights', 'fence', 'fence-euro', 'fence-3d', 'fence-rabica', 'fence-jalousie', 'fence-brick'),
  ] },
  { id: 'house', icon: '🏠', title: 'Дома и бани', text: 'Каркасный дом, баня из каркаса или бруса', kinds: [...fromMaster('m-house', 'type', undefined, { house: 'Каркасный дом', bathf: 'Баня каркасная', bathb: 'Баня из бруса' }), ...tpls('house-frame', 'house-frame-2', 'bath-frame', 'bath-timber')] },
  { id: 'build', icon: '🏡', title: 'Постройки', text: 'Навесы, бытовки, гаражи, беседки — 3D', kinds: [
    { id: 'd-canopy', icon: '🚗', title: 'Навес', text: 'Для машины, террасы, двора', to: '/designer?preset=car' },
    { id: 'd-bytovka', icon: '🏠', title: 'Бытовка / хозблок', text: 'Каркасная, утеплённая, с окнами', to: '/designer?preset=bytovka' },
    { id: 'd-gazebo', icon: '⛺', title: 'Беседка', text: 'Деревянная или металлическая', to: '/designer?preset=gazebo-wood' },
    { id: 'd-garage', icon: '🚙', title: 'Гараж', text: 'Каркасный из профиля', to: '/designer?preset=garage' },
    d3('car2', '🚗', 'Навес на 2 машины 6×6', 'профлист, водосток'),
    d3('lean', '🏠', 'Навес к дому 6×4', 'поликарбонат, пристенный'),
    d3('terrace', '🌿', 'Терраса к дому 6×3', 'настил, перила, крыша'),
    d3('pergola', '🌸', 'Пергола из бруса 4×3', 'для отдыха и винограда'),
    d3('kitchen', '🍖', 'Летняя кухня 5×4', 'с мангальной зоной'),
    d3('bbq', '🔥', 'Навес для мангала 4×3', 'из бруса, мягкая кровля'),
    d3('gazebo-glass', '🪟', 'Закрытая беседка 4×3', 'поликарбонат'),
    d3('gh-36', '🌱', 'Теплица 3×6', 'арочная, поликарбонат'),
    d3('gh-gable', '🌿', 'Теплица двускатная 3,5×6', 'под рассаду и томаты'),
    d3('woodshed', '🪵', 'Дровник 3×1,5', 'деревянный'),
    d3('shed', '🛖', 'Хозблок 3×2,5', 'для инвентаря'),
    d3('shed-m', '🧱', 'Сарай из профлиста 4×3', 'металлокаркас'),
    d3('porch', '🚪', 'Навес над крыльцом 3×2', 'пристенный'),
    d3('visor', '☂️', 'Козырёк над входом', '1,6×1,0'),
    d3('workshop', '🔧', 'Тёплая мастерская 9×6', 'каркас, утепление'),
    d3('garage2', '🚙', 'Гараж на 2 машины 7×6', 'каркасный'),
    d3('hangar', '🏭', 'Ангар 12×18', 'склад, техника'),
    d3('park-10', '🅿️', 'Стоянка на 10 машин', 'навес в 2 ряда'),
    d3('pool', '🏊', 'Навес над бассейном', 'арка 5×10'),
    d3('kiosk', '🏪', 'Торговый павильон 6×3', 'каркас, витрина'),
    d3('tko-s', '🗑', 'Площадка ТКО на 2 контейнера', 'ограждение, навес'),
    d3('combo-car-shed', '🚗', 'Навес для авто + хозблок 9×4', 'два в одном'),
    { id: 'd-all', icon: '📐', title: 'Все 3D-постройки (60+)', text: 'Теплицы, дровники, ангары, стоянки, площадки ТКО', to: '/designer' },
  ] },
  { id: 'handy', icon: '🧰', title: 'Мелкий ремонт', text: 'Повесить, собрать, заменить', kinds: [master('m-handy', 'Мастер на час', 'Полки, карнизы, мебель, смесители, розетки, люстры'), ...tpls('handy-move')] },
];

export const getDirection = (id: string | null | undefined) => DIRECTIONS.find((d) => d.id === id) || null;

/** Пресет «?set=k:v,k2:v2» → значения полей мастера */
export function parseSet(q: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(q || '').split(',')) {
    const i = part.indexOf(':');
    if (i > 0) out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}

// ---------------- поиск по видам работ: синонимы и разговорные названия ----------------
const KEYWORDS: Record<string, string> = {
  't:flat1-turnkey': 'однушка однокомнатная квартира ремонт под ключ комплексный',
  't:flat2-turnkey': 'двушка двухкомнатная квартира ремонт под ключ комплексный',
  't:newbuild-45': 'новостройка white box вайтбокс предчистовая черновая отделка квартира',
  't:bath-turnkey': 'ванная санузел туалет под ключ ремонт ванной',
  't:shower-room': 'душевая трап душ без поддона',
  't:toilet-room': 'туалет уборная',
  't:room-cosmetic': 'косметический ремонт комнаты обои',
  't:handy-move': 'муж на час переезд мелкий ремонт',
  't:house-frame': 'каркасник каркасный дом',
  't:walls-gas': 'коробка дома газоблок',
  'd-gh-36': 'теплица парник поликарбонат', 'd-gh-gable': 'теплица парник',
  'd-kitchen': 'летняя кухня мангал барбекю', 'd-bbq': 'мангал барбекю',
  'd-pool': 'бассейн', 'd-hangar': 'ангар склад', 'd-park-10': 'парковка стоянка автостоянка',
  'd-terrace': 'терраса веранда', 'd-pergola': 'пергола', 'd-shed': 'сарай хозблок', 'd-woodshed': 'дровник дрова',
  'd-kiosk': 'павильон киоск ларёк магазин', 'd-tko-s': 'мусорка контейнерная площадка тко',
  site3d: 'план участка генплан септик скважина нормы',
  't:office-60': 'офис коммерческое помещение армстронг', 't:shop-40': 'магазин торговое помещение витрина', 't:cafe-80': 'кафе ресторан общепит кухня столовая', 't:salon-50': 'салон красоты парикмахерская барбершоп маникюр',
  'm-finish': 'ремонт комнаты квартиры отделка под ключ штукатурка шпаклевка покраска обои стены потолок малярка косметический',
  'm-gkl:part': 'гипсокартон гкл перегородка стенка каркас профиль кнауф',
  'm-gkl:wall': 'гипсокартон гкл обшивка стен выравнивание каркас профиль',
  'm-gkl:glue': 'гипсокартон гкл обшивка стен на клей перлфикс без каркаса',
  'm-gkl:ceil1': 'гипсокартон гкл потолок подвесной ровный',
  'm-gkl:ceil2': 'гипсокартон гкл потолок двухуровневый многоуровневый подсветка',
  'm-gkl:box': 'гипсокартон гкл короб трубы стояк ниша',
  'm-tile:bath': 'ванная ванна туалет санузел плитка кафель керамогранит под ключ гидроизоляция',
  'm-tile:floor': 'плитка на пол кафель керамогранит напольная',
  'm-tile:walls': 'плитка на стены кафель настенная',
  'm-tile:apron': 'фартук кухня кухонный плитка кабанчик',
  'm-tile:steps': 'ступени крыльцо лестница плитка клинкер',
  'm-floor:cps': 'стяжка пол цпс пескобетон выравнивание пола',
  'm-floor:semi': 'полусухая стяжка пол фибра машинная',
  'm-floor:self': 'наливной пол самовыравнивающийся выравнивание',
  'm-floor:joists': 'лаги фанера деревянный пол черновой',
  'm-floor:none': 'ламинат линолеум паркет кварцвинил ковролин покрытие пола укладка',
  'm-electric:flat': 'электрика проводка электромонтаж розетки выключатели свет щиток автоматы квартира',
  'm-electric:house': 'электрика проводка дом коттедж ввод заземление щит счетчик',
  'mep-e': 'электрика план схема пуэ розетки свет чертеж',
  'm-plumb': 'сантехника водопровод канализация трубы разводка унитаз инсталляция ванна душ бойлер смеситель',
  'mep-p': 'сантехника план схема трубы разводка чертеж',
  'm-roof:gable': 'крыша кровля двускатная металлочерепица профнастил мягкая кровля стропила',
  'm-roof:shed': 'крыша кровля односкатная навес профнастил',
  'm-roof:hip': 'крыша кровля вальмовая четырехскатная шатровая',
  'm-roof:mansard': 'крыша кровля мансарда мансардная ломаная',
  'm-found:strip': 'фундамент лента ленточный бетон опалубка арматура',
  'm-found:slab': 'фундамент плита монолитная ушп бетон',
  'm-found:pile': 'фундамент сваи тисэ ростверк буронабивные',
  'm-found:screw': 'фундамент винтовые сваи свайный',
  't:blind-area': 'отмостка вокруг дома бетон',
  'm-mason:gas': 'газобетон газоблок газосиликат кладка стены коробка дома',
  'm-mason:brick1': 'кирпич кладка стены кирпичный дом',
  'm-mason:brick15': 'кирпич кладка стены полтора кирпича',
  'm-mason:keramzit': 'керамзитоблок керамзитобетон блоки кладка',
  'm-mason:ceramic': 'керамический блок поризованный теплая керамика кладка',
  'm-facade:wetmv': 'фасад мокрый утепление минвата штукатурка короед',
  'm-facade:wetps': 'фасад мокрый утепление пенопласт пенополистирол штукатурка',
  'm-facade:siding': 'фасад сайдинг вентфасад обшивка дома',
  'm-facade:panels': 'фасад панели фасадные вентфасад',
  'm-facade:porcelain': 'фасад керамогранит вентфасад',
  'm-facade:clinker': 'фасад клинкер клинкерная плитка облицовка',
  'm-facade:blockhouse': 'фасад блок-хаус блокхаус имитация бруса дерево обшивка',
  'm-facade:paint': 'фасад покраска окраска',
  'm-heat:gaswall': 'отопление котел газовый настенный двухконтурный радиаторы батареи',
  'm-heat:gasfloor': 'отопление котел газовый напольный',
  'm-heat:electric': 'отопление электрокотел электрический',
  'm-heat:solid': 'отопление котел твердотопливный дрова уголь пеллеты',
  'm-heat:hp': 'отопление тепловой насос',
  't:gasholder': 'газгольдер газ автономная газификация',
  't:boiler': 'котельная обвязка котла',
  'm-septic:bio': 'септик станция биоочистки топас юнилос аэрация канализация автономная локальная',
  'm-septic:plastic': 'септик пластиковый танк канализация',
  'm-septic:rings': 'септик кольца бетонные жб канализация выгребная яма',
  'm-well:sand': 'скважина на песок вода водоснабжение бурение',
  'm-well:lime': 'скважина артезианская известняк вода водоснабжение бурение',
  'm-well:ring': 'колодец кольца вода',
  't:drainage': 'дренаж водоотвод участок вода ливневка',
  'fence': 'забор ограждение ворота калитка профнастил профлист евроштакетник сетка рабица 3d',
  'fence3d': 'забор ограждение 3d проект чертеж',
  'm-paving:tile': 'тротуарная плитка дорожки мощение благоустройство',
  'm-paving:paver': 'брусчатка мощение дорожки',
  'm-paving:granite': 'гранит гранитная плитка мощение',
  'm-paving:asphalt': 'асфальт асфальтирование дорога площадка',
  'm-paving:rubble': 'щебень площадка парковка отсыпка стоянка',
  't:tko': 'площадка тко мусорные контейнеры',
  'd-canopy': 'навес для машины автомобиля карпорт двор',
  'd-bytovka': 'бытовка хозблок сарай вагончик каркасный домик',
  'd-gazebo': 'беседка барбекю мангал',
  'd-garage': 'гараж мастерская бокс',
  'd-all': 'постройки теплица дровник пергола ангар склад терраса козырек',
  'm-stretch': 'натяжной потолок натяжные потолки полотно глянец матовый теневой парящий светильники',
  'm-floor:cover-laminate': 'ламинат укладка пол покрытие', 'm-floor:cover-spc': 'кварцвинил spc виниловый ламинат', 'm-floor:cover-parquet': 'паркет паркетная доска',
  'm-floor:cover-lino': 'линолеум', 'm-floor:cover-carpet': 'ковролин ковер',
  'm-windows:windows': 'окна пластиковые пвх стеклопакет откосы подоконник отлив замена окон', 'm-windows:interior': 'двери межкомнатные установка наличники доборы',
  'm-windows:entrance': 'дверь входная металлическая железная', 'm-windows:all': 'окна двери',
  'm-balcony:warm': 'балкон лоджия теплый утепление остекление пвх обшивка вагонка', 'm-balcony:cold': 'балкон лоджия остекление холодное алюминий раздвижное',
  'm-balcony:none': 'балкон лоджия отделка утепление',
  'm-demo:flat': 'демонтаж снос разборка вывоз мусора квартира черновой', 'm-demo:bath': 'демонтаж санузел ванная плитка', 'm-demo:room': 'демонтаж комната обои', 'm-demo:custom': 'демонтаж перегородки стяжка',
  'm-ac': 'кондиционер сплит система климат вентиляция вытяжка трасса',
  'm-house:house': 'каркасный дом строительство дома под ключ коробка', 'm-house:bathf': 'баня каркасная парилка', 'm-house:bathb': 'баня из бруса сруб парилка печь',
  'm-gates:sliding': 'ворота откатные автоматика', 'm-gates:swing': 'ворота распашные', 'm-gates': 'козырек лестница перила сварка металлоконструкции',
  'm-yard': 'ливневка лотки водоотвод газон освещение фонари полив посадка деревья благоустройство',
  'm-handy': 'мастер на час муж на час мелкий ремонт повесить полку карниз собрать мебель смеситель розетка люстра',
};
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s-]/g, ' ');
/** Поиск вида работ по словам: название, направление и синонимы; совпадение по началу слова */
export function searchKinds(q: string, limit = 12): { d: Direction; k: WorkKind }[] {
  const toks = norm(q).split(/\s+/).filter((t) => t.length >= 2);
  if (!toks.length) return [];
  const out: { d: Direction; k: WorkKind; score: number }[] = [];
  for (const d of DIRECTIONS) for (const k of d.kinds) {
    const title = norm(k.title), all = ` ${title} ${norm(k.text || '')} ${norm(d.title)} ${norm(d.text)} ${KEYWORDS[k.id] || ''} `;
    const words = all.split(/\s+/);
    let score = 0, ok = true;
    for (const t of toks) {
      const stem = t.length > 4 ? t.slice(0, t.length - 1) : t; // «септика» → «септик»
      if (words.some((w) => w.startsWith(stem))) score += title.split(/\s+/).some((w) => w.startsWith(stem)) ? 3 : 1;
      else { ok = false; break; }
    }
    if (ok) out.push({ d, k, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
