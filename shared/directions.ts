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
const tpl = (id: string): WorkKind[] => { const t = T.get(id); return t ? [{ id: `t:${id}`, title: t.title, text: `Шаблон · ${t.description}`, template: id }] : []; };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const DIRECTIONS: Direction[] = [
  { id: 'finish', icon: '🎨', title: 'Отделка', text: 'Штукатурка, покраска, обои, потолки', kinds: [
    master('m-finish', 'Комната под ключ', 'Стены, потолок, откосы — по размерам комнаты'),
    ...fromMaster('m-gkl', 'kind'),
  ] },
  { id: 'tile', icon: '🧱', title: 'Плитка', text: 'Санузел, пол, стены, фартук', kinds: fromMaster('m-tile', 'obj') },
  { id: 'floor', icon: '🪵', title: 'Полы', text: 'Стяжка, наливной, лаги, покрытие', kinds: fromMaster('m-floor', 'base') },
  { id: 'electric', icon: '⚡', title: 'Электрика', text: 'Проводка, щит, розетки, свет', kinds: [
    ...fromMaster('m-electric', 'obj', undefined, { flat: 'Электрика в квартире', house: 'Электрика в частном доме' }),
    { id: 'mep-e', icon: '📐', title: 'По плану комнат (3D)', text: 'Точки по ПУЭ, трассы, щит, чертёж и смета', to: '/mep' },
  ] },
  { id: 'plumb', icon: '🚿', title: 'Сантехника', text: 'Разводка, канализация, приборы', kinds: [
    master('m-plumb', 'Сантехника под ключ', 'Разводка, канализация, установка приборов'),
    { id: 'mep-p', icon: '📐', title: 'По плану комнат (3D)', text: 'Трубы, канализация, чертёж и смета', to: '/mep' },
  ] },
  { id: 'roof', icon: '🏠', title: 'Кровля', text: 'Стропила, покрытие, водосток', kinds: fromMaster('m-roof', 'shape', undefined, { gable: 'Двускатная крыша', shed: 'Односкатная крыша', hip: 'Вальмовая крыша', mansard: 'Мансардная крыша' }) },
  { id: 'found', icon: '🏗', title: 'Фундамент', text: 'Лента, плита, сваи, отмостка', kinds: [
    ...fromMaster('m-found', 'type', undefined, { strip: 'Ленточный фундамент', slab: 'Монолитная плита', pile: 'Свайно-ростверковый', screw: 'Винтовые сваи' }),
    ...tpl('blind-area'),
  ] },
  { id: 'walls', icon: '🧱', title: 'Стены и кладка', text: 'Газобетон, кирпич, блоки', kinds: fromMaster('m-mason', 'mat', undefined, { gas: 'Стены из газобетона', brick1: 'Кирпич в 1 кирпич', brick15: 'Кирпич в 1,5 кирпича', keramzit: 'Керамзитобетонный блок', ceramic: 'Керамический блок' }) },
  { id: 'facade', icon: '🏘', title: 'Фасад', text: 'Утепление, штукатурка, сайдинг', kinds: fromMaster('m-facade', 'sys') },
  { id: 'heat', icon: '🔥', title: 'Отопление и газ', text: 'Котёл, радиаторы, газгольдер', kinds: [
    ...fromMaster('m-heat', 'src', undefined, { gaswall: 'Газовый настенный котёл', gasfloor: 'Газовый напольный котёл', electric: 'Электрокотёл', solid: 'Твердотопливный котёл', hp: 'Тепловой насос' }),
    ...tpl('gasholder'), ...tpl('boiler'),
  ] },
  { id: 'water', icon: '💧', title: 'Вода и канализация', text: 'Скважина, септик, дренаж', kinds: [
    ...fromMaster('m-septic', 'type', undefined, { bio: 'Станция биоочистки', plastic: 'Пластиковый септик', rings: 'Септик из колец' }),
    ...fromMaster('m-well', 'src', undefined, { sand: 'Скважина на песок', lime: 'Скважина на известняк', ring: 'Колодец из колец' }),
    ...tpl('drainage'),
  ] },
  { id: 'yard', icon: '🚧', title: 'Заборы и участок', text: 'Заборы, мощение, площадки', kinds: [
    { id: 'fence', icon: '🚧', title: 'Забор и ворота', text: '17 видов заборов, ворота, калитки', to: '/calculators/fence-pro' },
    { id: 'fence3d', icon: '📐', title: 'Забор в 3D', text: 'Модель, чертёж, PDF и смета', to: '/fence' },
    ...fromMaster('m-paving', 'cover', ['tile', 'paver', 'granite', 'asphalt', 'rubble'], { tile: 'Тротуарная плитка', paver: 'Брусчатка', granite: 'Гранитная плитка', asphalt: 'Асфальт', rubble: 'Площадка из щебня' }),
    ...tpl('tko'),
  ] },
  { id: 'build', icon: '🏡', title: 'Постройки', text: 'Навесы, бытовки, гаражи, беседки — 3D', kinds: [
    { id: 'd-canopy', icon: '🚗', title: 'Навес', text: 'Для машины, террасы, двора', to: '/designer?preset=car' },
    { id: 'd-bytovka', icon: '🏠', title: 'Бытовка / хозблок', text: 'Каркасная, утеплённая, с окнами', to: '/designer?preset=bytovka' },
    { id: 'd-gazebo', icon: '⛺', title: 'Беседка', text: 'Деревянная или металлическая', to: '/designer?preset=gazebo-wood' },
    { id: 'd-garage', icon: '🚙', title: 'Гараж', text: 'Каркасный из профиля', to: '/designer?preset=garage' },
    { id: 'd-all', icon: '📐', title: 'Все постройки', text: 'Теплицы, дровники, пергола, ангары', to: '/designer' },
  ] },
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
