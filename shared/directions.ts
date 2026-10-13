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
