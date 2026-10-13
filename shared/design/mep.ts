/**
 * Электрика и сантехника (инженерия квартиры или дома): комнаты, точки (розетки, свет, выключатели, силовые линии,
 * сантехприборы), автоматическая расстановка по типовым правилам, трассы кабелей и труб (дерево от щита / стояка),
 * группы щита с автоматами, длины кабеля и труб, 3D в разрезе, чертежи и смета.
 * Это эскиз и расчёт материалов, а не рабочий проект: сечения и автоматы — по типовым решениям.
 */
import type { Member, Panel, V3 } from './canopy';
import { Builder } from '../masters';
import { bathZone, lineFor, inputFor, designPower, panelLayout, distRect, cableName, sTxt, NORMS, DU_MAX } from './mepNorms';

export type RoomType = 'living' | 'bedroom' | 'kids' | 'office' | 'kitchen' | 'bath' | 'wc' | 'hall' | 'boiler' | 'garage';
export interface Room { id: string; type: RoomType; name: string; x: number; y: number; w: number; d: number }
export interface MepPoint { id: string; type: string; x: number; y: number; z?: number; pw?: number; pd?: number; watt?: number }
export interface MepParams {
  kind: 'mep';
  h: number;                       // высота потолка, м
  rooms: Room[];
  points: MepPoint[];
  walls: 'concrete' | 'brick' | 'gkl' | 'wood'; // в чём штробить / как крепить
  wiring: 'hidden' | 'open';       // скрытая (в штробе) или открытая (в гофре / кабель-канале)
  pipes: 'ppr' | 'pex';            // полипропилен или сшитый полиэтилен
  scheme: 'collector' | 'tee';     // разводка воды: лучевая от коллектора или тройниковая
  object: 'flat' | 'house';
  phases?: 1 | 3;                  // ввод: 1 фаза 230 В или 3 фазы 400 В
  power?: number;                  // выделенная мощность по договору, кВт
  protect?: 'diff' | 'rcd';        // защита групп: дифавтомат на каждую или УЗО на 2–3 группы
  spd?: boolean;                   // УЗИП (защита от перенапряжений)
  gas?: boolean;                   // газовая плита (вместо электрической)
}
export const elDefaults = (object: 'flat' | 'house', gas = false) => ({ phases: (object === 'house' ? 3 : 1) as 1 | 3, protect: 'diff' as const, spd: true, gas });
/** Типовая выделенная мощность: квартира с электроплитой 10 кВт, с газом 7 кВт, дом 15 кВт */
export const defaultPower = (object: 'flat' | 'house', gas = false) => (object === 'house' ? 15 : gas ? 7 : 10);

export const ROOM_TYPES: Record<RoomType, { label: string; color: string; wet?: boolean }> = {
  living: { label: 'Гостиная', color: '#EFE6D6' }, bedroom: { label: 'Спальня', color: '#EAE3F2' }, kids: { label: 'Детская', color: '#E3F0E1' },
  office: { label: 'Кабинет', color: '#E6ECF2' }, kitchen: { label: 'Кухня', color: '#F6E7D2' }, bath: { label: 'Ванная', color: '#DCEBF2', wet: true },
  wc: { label: 'Туалет', color: '#DCEBF2', wet: true }, hall: { label: 'Прихожая', color: '#ECE8E1' }, boiler: { label: 'Котельная', color: '#E8E4DC', wet: true },
  garage: { label: 'Гараж', color: '#E2E3E5' },
};

/** Типы точек: система, высота установки, размер в плане (для 3D), мощность, группа щита */
export interface PointType { label: string; icon: string; sys: 'el' | 'pl'; z: number | 'ceil'; w: number; d: number; h: number; cat: string;
  watt?: number; amp?: number; minS?: number; rcd?: boolean; own?: boolean; posts?: number; ip44?: boolean; noWire?: boolean;
  cold?: boolean; hot?: boolean; sewer?: 50 | 110 }
export const POINT_TYPES: Record<string, PointType> = {
  // ---- электрика (мощность — типовая, для силовых меняется в карточке точки)
  panel: { label: 'Электрощит', icon: '🔌', sys: 'el', z: 1.6, w: 0.4, d: 0.12, h: 0.5, cat: 'Щит' },
  socket: { label: 'Розетка', icon: '⚡', sys: 'el', z: 0.3, w: 0.08, d: 0.05, h: 0.08, cat: 'Розетки', watt: 200, posts: 1 },
  socket2: { label: 'Двойная розетка', icon: '⚡', sys: 'el', z: 0.3, w: 0.15, d: 0.05, h: 0.08, cat: 'Розетки', watt: 300, posts: 2 },
  socketK: { label: 'Розетка над столешницей (2 гнезда)', icon: '⚡', sys: 'el', z: 1.1, w: 0.15, d: 0.05, h: 0.08, cat: 'Розетки', watt: 1000, posts: 2 },
  hood: { label: 'Розетка вытяжки', icon: '🌬', sys: 'el', z: 2.0, w: 0.08, d: 0.05, h: 0.08, cat: 'Розетки', watt: 200, posts: 1 },
  socketWet: { label: 'Влагозащищённая розетка IP44', icon: '💧', sys: 'el', z: 1.0, w: 0.08, d: 0.06, h: 0.08, cat: 'Розетки', watt: 1200, posts: 1, rcd: true, ip44: true },
  socketOut: { label: 'Уличная розетка IP44', icon: '🏡', sys: 'el', z: 0.5, w: 0.08, d: 0.06, h: 0.08, cat: 'Силовые', watt: 2000, amp: 16, minS: 2.5, own: true, rcd: true, ip44: true },
  stove: { label: 'Варочная панель / плита', icon: '🍳', sys: 'el', z: 0.3, w: 0.1, d: 0.05, h: 0.1, cat: 'Силовые', watt: 7000, amp: 16, minS: 6, own: true, rcd: true },
  oven: { label: 'Духовой шкаф', icon: '🔥', sys: 'el', z: 0.3, w: 0.08, d: 0.05, h: 0.08, cat: 'Силовые', watt: 3500, amp: 16, minS: 2.5, own: true, rcd: true },
  washer: { label: 'Стиральная машина (розетка)', icon: '🌀', sys: 'el', z: 1.0, w: 0.08, d: 0.06, h: 0.08, cat: 'Силовые', watt: 2200, amp: 16, minS: 2.5, own: true, rcd: true, ip44: true },
  dish: { label: 'Посудомойка (розетка)', icon: '🍽', sys: 'el', z: 0.3, w: 0.08, d: 0.05, h: 0.08, cat: 'Силовые', watt: 2000, amp: 16, minS: 2.5, own: true, rcd: true },
  boilerEl: { label: 'Водонагреватель (розетка)', icon: '♨️', sys: 'el', z: 1.9, w: 0.08, d: 0.06, h: 0.08, cat: 'Силовые', watt: 2000, amp: 16, minS: 2.5, own: true, rcd: true, ip44: true },
  ac: { label: 'Кондиционер', icon: '❄️', sys: 'el', z: 2.3, w: 0.08, d: 0.05, h: 0.08, cat: 'Силовые', watt: 1200, amp: 16, minS: 2.5, own: true },
  floorHeat: { label: 'Тёплый пол (терморегулятор)', icon: '🌡', sys: 'el', z: 0.9, w: 0.08, d: 0.05, h: 0.08, cat: 'Силовые', watt: 1000, amp: 16, minS: 2.5, own: true, rcd: true },
  heatBoiler: { label: 'Котёл отопления', icon: '🔥', sys: 'el', z: 1.2, w: 0.08, d: 0.05, h: 0.08, cat: 'Силовые', watt: 300, amp: 10, minS: 1.5, own: true },
  switch: { label: 'Выключатель', icon: '🔘', sys: 'el', z: 0.9, w: 0.08, d: 0.05, h: 0.08, cat: 'Свет' },
  light: { label: 'Люстра / светильник', icon: '💡', sys: 'el', z: 'ceil', w: 0.35, d: 0.35, h: 0.12, cat: 'Свет', watt: 100 },
  spot: { label: 'Точечный светильник', icon: '🔆', sys: 'el', z: 'ceil', w: 0.09, d: 0.09, h: 0.03, cat: 'Свет', watt: 10 },
  net: { label: 'Интернет / ТВ', icon: '📶', sys: 'el', z: 0.3, w: 0.08, d: 0.05, h: 0.08, cat: 'Слаботочка' },
  gasPipe: { label: 'Газовая труба / плита', icon: '🔥', sys: 'el', z: 0.8, w: 0.06, d: 0.06, h: 0.6, cat: 'Газ', noWire: true },
  // ---- сантехника
  riser: { label: 'Стояк / ввод воды', icon: '🟦', sys: 'pl', z: 0, w: 0.18, d: 0.18, h: 2.7, cat: 'Стояк' },
  collector: { label: 'Коллектор', icon: '🧰', sys: 'pl', z: 0.4, w: 0.45, d: 0.1, h: 0.3, cat: 'Стояк' },
  toilet: { label: 'Унитаз', icon: '🚽', sys: 'pl', z: 0, w: 0.38, d: 0.65, h: 0.4, cat: 'Приборы', cold: true, sewer: 110 },
  install: { label: 'Унитаз с инсталляцией', icon: '🚽', sys: 'pl', z: 0, w: 0.4, d: 0.55, h: 0.42, cat: 'Приборы', cold: true, sewer: 110 },
  sink: { label: 'Раковина', icon: '🚰', sys: 'pl', z: 0.8, w: 0.55, d: 0.45, h: 0.15, cat: 'Приборы', cold: true, hot: true, sewer: 50 },
  kitchenSink: { label: 'Мойка на кухне', icon: '🚰', sys: 'pl', z: 0.85, w: 0.6, d: 0.55, h: 0.2, cat: 'Приборы', cold: true, hot: true, sewer: 50 },
  bath: { label: 'Ванна', icon: '🛁', sys: 'pl', z: 0, w: 1.7, d: 0.75, h: 0.58, cat: 'Приборы', cold: true, hot: true, sewer: 50 },
  shower: { label: 'Душевая кабина', icon: '🚿', sys: 'pl', z: 0, w: 0.9, d: 0.9, h: 2.1, cat: 'Приборы', cold: true, hot: true, sewer: 50 },
  washerW: { label: 'Стиральная машина (вода)', icon: '🌀', sys: 'pl', z: 0, w: 0.6, d: 0.6, h: 0.85, cat: 'Приборы', cold: true, sewer: 50 },
  dishW: { label: 'Посудомойка (вода)', icon: '🍽', sys: 'pl', z: 0, w: 0.6, d: 0.6, h: 0.82, cat: 'Приборы', cold: true, sewer: 50 },
  boiler: { label: 'Водонагреватель', icon: '♨️', sys: 'pl', z: 1.1, w: 0.45, d: 0.45, h: 0.8, cat: 'Приборы', cold: true },
  towel: { label: 'Полотенцесушитель', icon: '♒', sys: 'pl', z: 0.9, w: 0.5, d: 0.08, h: 0.8, cat: 'Приборы', hot: true },
};
/** Помещения с повышенной опасностью по электрике: ванная и туалет (зоны, IP44, УЗО) */
export const EL_WET: RoomType[] = ['bath', 'wc'];
export const pointWatt = (pt: MepPoint) => pt.watt ?? POINT_TYPES[pt.type]?.watt ?? 0;
export const EL_TYPES = Object.keys(POINT_TYPES).filter((k) => POINT_TYPES[k].sys === 'el');
export const PL_TYPES = Object.keys(POINT_TYPES).filter((k) => POINT_TYPES[k].sys === 'pl');

let seq = 0;
export const newMepId = (p = 'p') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
const R = (type: RoomType, x: number, y: number, w: number, d: number, name?: string): Room => ({ id: `r${type}${x}${y}`.replace(/\./g, ''), type, name: name || ROOM_TYPES[type].label, x, y, w, d });

/** Типовые планировки: точки расставляются автоматически кнопкой «Расставить по нормам» */
export const MEP_PRESETS: { id: string; label: string; title: string; object: 'flat' | 'house'; rooms: Room[] }[] = [
  { id: 'studio', label: 'Студия 30 м²', title: 'Студия 30 м²: электрика и сантехника', object: 'flat', rooms: [R('living', 0, 2, 3.8, 4.2, 'Комната'), R('kitchen', 3.8, 2, 2.4, 4.2, 'Кухня-ниша'), R('hall', 0, 0, 3.4, 2), R('bath', 3.4, 0, 2.8, 2, 'Санузел')] },
  { id: 'flat1', label: '1-комн. 40 м²', title: 'Однокомнатная квартира 40 м²', object: 'flat', rooms: [R('living', 0, 2.2, 5, 4.5), R('kitchen', 5, 2.2, 3.4, 4.5), R('hall', 0, 0, 5.2, 2.2), R('bath', 5.2, 0, 2.2, 2.2, 'Санузел совмещённый'), R('wc', 7.4, 0, 1, 2.2)] },
  { id: 'flat2', label: '2-комн. 60 м²', title: 'Двухкомнатная квартира 60 м²', object: 'flat', rooms: [R('living', 0, 2.4, 5.2, 4.6), R('bedroom', 5.2, 2.4, 4, 4.6), R('kitchen', 9.2, 2.4, 3.2, 4.6), R('hall', 0, 0, 7.2, 2.4), R('bath', 7.2, 0, 2.6, 2.4), R('wc', 9.8, 0, 1.2, 2.4), R('office', 11, 0, 1.4, 2.4, 'Кладовая')] },
  { id: 'house', label: 'Дом 8×10', title: 'Дом 8×10: электрика и сантехника', object: 'house', rooms: [R('living', 0, 4, 5, 6), R('kitchen', 5, 6, 3, 4), R('bedroom', 5, 2.4, 3, 3.6), R('hall', 0, 0, 3, 4), R('bath', 3, 0, 2.4, 2.4), R('boiler', 5.4, 0, 2.6, 2.4), R('bedroom', 3, 2.4, 2, 1.6, 'Гардероб')] },
  { id: 'bathroom', label: 'Санузел', title: 'Санузел совмещённый 2,5×2,2', object: 'flat', rooms: [R('bath', 0, 0, 2.5, 2.2, 'Санузел')] },
  { id: 'kitchen', label: 'Кухня', title: 'Кухня 3,4×4', object: 'flat', rooms: [R('kitchen', 0, 0, 3.4, 4)] },
];

const rr = (v: number) => Math.round(v * 100) / 100;
const rectOf = (r: Room) => ({ x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.d });
export const roomAt = (rooms: Room[], x: number, y: number) => rooms.find((r) => x >= r.x - 0.05 && x <= r.x + r.w + 0.05 && y >= r.y - 0.05 && y <= r.y + r.d + 0.05);

/** Прямоугольники ванн и душевых в комнате — от них считаются зоны 0/1/2 */
export const wetRects = (points: MepPoint[], r?: Room) => points.filter((x) => (x.type === 'bath' || x.type === 'shower') && (!r || roomAt([r], x.x, x.y))).map((x) => {
  const T = POINT_TYPES[x.type]; const w = x.pw ?? T.w, d = x.pd ?? T.d;
  return { x0: x.x - w / 2, y0: x.y - d / 2, x1: x.x + w / 2, y1: x.y + d / 2 };
});

/** Зоны для чертежа: зона 1 — сама ванна/душ, зона 2 — +0,6 м, но не за стены своей комнаты */
export const zoneRects = (points: MepPoint[], rooms: Room[]) => wetRects(points).map((z) => {
  const r = roomAt(rooms, (z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2);
  const c = r ? rectOf(r) : { x0: -1e9, x1: 1e9, y0: -1e9, y1: 1e9 };
  return { z1: z, z2: { x0: Math.max(z.x0 - 0.6, c.x0), y0: Math.max(z.y0 - 0.6, c.y0), x1: Math.min(z.x1 + 0.6, c.x1), y1: Math.min(z.y1 + 0.6, c.y1) } };
});

/**
 * «Расставить по нормам» (дверь считаем у левого нижнего угла комнаты):
 *  - жилые комнаты — не меньше одной розетки на каждые полные и неполные 4 м периметра, кухня — не меньше 4 розеток,
 *    коридор — одна на каждые полные и неполные 10 м² (СП 256.1325800.2016);
 *  - выключатель у двери со стороны ручки на 0,9 м (ПУЭ 7.1.51), для санузлов — снаружи у двери;
 *  - в ванной розетки только IP44 и вне зон 0–2: не ближе 0,6 м к ванне и душу (ГОСТ Р 50571.7.701, ПУЭ 7.1.48);
 *  - розетки не ближе 0,5 м к газовой трубе (ПУЭ 7.1.50) и не над мойкой;
 *  - под мощную технику — отдельные линии.
 */
export function autoPlace(p: MepParams, sys: 'el' | 'pl' | 'both' = 'both'): MepPoint[] {
  const out: MepPoint[] = [];
  const add = (type: string, x: number, y: number, extra: Partial<MepPoint> = {}) => out.push({ id: newMepId(), type, x: rr(x), y: rr(y), ...extra });
  const el = sys !== 'pl', pl = sys !== 'el';
  const gas = p.gas ?? false;
  // сначала сантехника: от неё зависят места розеток в ванной
  if (pl) {
    for (const r of p.rooms) {
      const { x0, x1, y0, y1 } = rectOf(r);
      const cx = (x0 + x1) / 2;
      if (r.type === 'bath') {
        add('riser', x1 - 0.12, y1 - 0.12);
        add(p.object === 'house' ? 'install' : 'toilet', x1 - 0.25, y1 - 0.75, { pw: 0.65, pd: 0.38 });
        add('sink', x0 + Math.min(1.2, r.w * 0.5), y1 - 0.25);
        if (r.w >= 2.2 && r.d >= 1.6) add('bath', x0 + 0.38, y0 + Math.min(r.d, 1.7) / 2 + (r.d > 1.8 ? 0.15 : 0), { pw: 0.75, pd: Math.min(1.7, r.d - 0.1) });
        else add('shower', x0 + 0.45, y0 + 0.45);
        add('washerW', x1 - 0.32, y0 + 0.35);
        add('towel', cx, y0 + 0.06);
      }
      if (r.type === 'wc') add('toilet', cx, y1 - 0.4);
      if (r.type === 'kitchen') { add('kitchenSink', x0 + 0.35, y1 - 0.3); add('dishW', x0 + 1.0, y1 - 0.3); }
      if (r.type === 'boiler') { add('collector', x0 + 0.3, y1 - 0.06); add('boiler', x0 + 1.0, y1 - 0.25); }
    }
    // нет санузла со стояком, но есть вода — ставим стояк в угол кухни / мокрой комнаты
    if (!out.some((x) => x.type === 'riser') && out.some((x) => POINT_TYPES[x.type].sys === 'pl')) {
      const r = p.rooms.find((q) => q.type === 'kitchen' || ROOM_TYPES[q.type].wet) || p.rooms[0];
      if (r) add('riser', r.x + 0.12, r.y + r.d - 0.12);
    }
  }
  if (!el) return out;
  const plumb = pl ? out : p.points.filter((x) => POINT_TYPES[x.type]?.sys === 'pl');
  const hall = p.rooms.find((r) => r.type === 'hall') || p.rooms.find((r) => !EL_WET.includes(r.type));
  if (hall) add('panel', hall.x + 0.3, hall.y + 0.06);
  else if (p.rooms[0]) add('panel', p.rooms[0].x + 0.3, p.rooms[0].y - 0.4); // только санузел — щит снаружи, в коридоре
  let boilerDone = false;
  for (const r of p.rooms) {
    const { x0, x1, y0, y1 } = rectOf(r);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, wet = EL_WET.includes(r.type);
    const zones = wetRects(plumb, r);
    const sinks = plumb.filter((x) => (x.type === 'sink' || x.type === 'kitchenSink') && roomAt([r], x.x, x.y));
    /** Свободное место у стены: вне зон 0–2 ванной, не над раковиной, не ближе 0,3 м к другим точкам; ближе к цели */
    const spot = (tx: number, ty: number, z = 1.0) => {
      const c: [number, number][] = [];
      for (let t = 0.3; t <= r.w - 0.3 + 1e-6; t += 0.1) { c.push([x0 + t, y1 - 0.06]); if (x0 + t > x0 + 1.1) c.push([x0 + t, y0 + 0.06]); }
      for (let t = 0.3; t <= r.d - 0.3 + 1e-6; t += 0.1) { c.push([x0 + 0.06, y0 + t]); c.push([x1 - 0.06, y0 + t]); }
      const ok = c.filter(([x, y]) => bathZone(x, y, z, zones) === 3
        && !sinks.some((s) => { const T = POINT_TYPES[s.type]; return Math.abs(s.x - x) < (s.pw ?? T.w) / 2 + 0.15 && Math.abs(s.y - y) < (s.pd ?? T.d) / 2 + 0.15; })
        && !out.some((q) => POINT_TYPES[q.type].sys === 'el' && Math.hypot(q.x - x, q.y - y) < 0.3));
      ok.sort((a, b) => Math.hypot(a[0] - tx, a[1] - ty) - Math.hypot(b[0] - tx, b[1] - ty));
      return ok[0];
    };
    const put = (type: string, tx: number, ty: number, extra: Partial<MepPoint> = {}) => {
      const z = extra.z ?? (POINT_TYPES[type].z as number);
      const s = zones.length ? spot(tx, ty, z) : [tx, ty];
      if (s) add(type, s[0], s[1], extra);
    };
    const along = (n: number) => {
      // розетки по периметру: левая, верхняя, правая стены (нижняя — с дверью); чередуем двойные и одинарные
      const per = 2 * r.d + r.w;
      for (let i = 0; i < n; i++) {
        const type = i % 2 === 0 ? 'socket2' : 'socket';
        let t = ((i + 0.5) / n) * per;
        if (t < r.d) add(type, x0 + 0.06, y0 + 0.9 + t * ((r.d - 1.1) / r.d));
        else if ((t -= r.d) < r.w) add(type, x0 + 0.3 + t * ((r.w - 0.6) / r.w), y1 - 0.06);
        else { t -= r.w; add(type, x1 - 0.06, y1 - 0.3 - t * ((r.d - 0.6) / r.d)); }
      }
    };
    // выключатель: у двери со стороны ручки; у санузла — снаружи
    add('switch', Math.min(x0 + 0.95, x1 - 0.1), wet ? y0 - 0.08 : y0 + 0.06);
    if (wet) { add('spot', cx - Math.min(0.5, r.w / 4), cy); add('spot', cx + Math.min(0.5, r.w / 4), cy); }
    else add('light', cx, cy);
    if (['living', 'bedroom', 'kids', 'office'].includes(r.type)) {
      // СП 256: не меньше одной розетки на каждые полные и неполные 4 м периметра (двойная = 2)
      const need = Math.ceil((2 * (r.w + r.d)) / 4 - 1e-9);
      along(Math.max(2, Math.ceil(need / 1.5)));
      if (r.type !== 'office' || r.w * r.d > 4) add('net', x0 + 0.06, cy);
      if (['living', 'bedroom'].includes(r.type) && r.w * r.d > 9) add('ac', cx, y1 - 0.06);
    }
    if (r.type === 'kitchen') {
      // столешница вдоль верхней стены: мойка слева, плита — по центру (газ — у правого угла)
      if (gas) add('gasPipe', x1 - 0.25, y1 - 0.06);
      const xs = gas ? [x0 + 0.85, (x0 + 0.85 + x1 - 0.9) / 2, x1 - 0.9] : [x0 + 0.85, cx, x1 - 0.5];
      for (const x of xs) add('socketK', x, y1 - 0.06);
      if (!gas) { add('stove', cx, y1 - 0.06); add('oven', cx + 0.4, y1 - 0.06); }
      else add('oven', x1 - 0.06, y1 - 1.25);
      add('dish', x1 - 0.06, y1 - 0.9);
      add('socket', x1 - 0.06, y0 + 0.6); add('hood', gas ? x1 - 0.8 : cx - 0.3, y1 - 0.06); // холодильник, вытяжка
    }
    if (r.type === 'bath') {
      const sink = sinks[0];
      put('socketWet', sink ? sink.x + 0.55 : x0 + 0.06, sink ? y1 - 0.06 : cy);
      const ww = plumb.find((x) => x.type === 'washerW' && roomAt([r], x.x, x.y));
      put('washer', ww ? ww.x : x1 - 0.06, ww ? ww.y : y0 + 0.6);
      if (p.object === 'flat' && !boilerDone) { put('boilerEl', x0 + 0.06, y1 - 0.5); boilerDone = true; }
      if (r.w * r.d >= 4) put('floorHeat', x0 + 1.3, y0 + 0.06);
    }
    if (r.type === 'hall') along(Math.max(1, Math.ceil((r.w * r.d) / 10 - 1e-9)));
    if (r.type === 'boiler') { along(2); if (p.object === 'house') add('heatBoiler', x0 + 1.6, y1 - 0.06); }
    if (r.type === 'garage') along(3);
  }
  return out;
}

export const MEP_DEFAULT: MepParams = (() => {
  const pr = MEP_PRESETS[2];
  const p: MepParams = { kind: 'mep', h: 2.7, rooms: pr.rooms, points: [], walls: 'concrete', wiring: 'hidden', pipes: 'ppr', scheme: 'tee', object: pr.object, ...elDefaults(pr.object) };
  return { ...p, points: autoPlace(p).map((x, i) => ({ ...x, id: `d${i}` })) };
})();

// ---------- трассы ----------
export interface Group { three?: boolean; name: string; amp: number; cable: string; s: number; rcd: boolean; pts: MepPoint[]; len: number; lmax: number; kind: Member['kind']; watt: number; ib: number; du: number; upsized: boolean; minAmp: number; minS: number; phase?: 1 | 2 | 3 }
export interface Check { lvl: 'err' | 'warn' | 'info' | 'ok'; text: string; norm?: string; ids?: string[] }
interface Node { id: string; x: number; y: number; z: number; t?: string }
const manh = (a: Node, b: Node) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
/** Дерево от источника: каждый следующий узел подключается к ближайшему уже подключённому (алгоритм Прима) */
function tree(src: Node, nodes: Node[], star = false) {
  const inTree: Node[] = [src];
  const edges: { a: Node; b: Node }[] = [];
  const left = [...nodes];
  while (left.length) {
    let best = { i: 0, j: 0, d: Infinity };
    left.forEach((n, i) => (star ? [src] : inTree).forEach((m, j) => { const d = manh(n, m); if (d < best.d) best = { i, j, d }; }));
    const n = left.splice(best.i, 1)[0];
    edges.push({ a: (star ? [src] : inTree)[best.j], b: n });
    inTree.push(n);
  }
  return edges;
}

export function buildMep(p0: Partial<MepParams>) {
  const p: MepParams = { ...MEP_DEFAULT, ...p0, rooms: p0.rooms || MEP_DEFAULT.rooms, points: p0.points || MEP_DEFAULT.points };
  const h = Math.max(2.2, Math.min(4.5, p.h));
  const warnings: string[] = [];
  const members: (Member & { grp?: string })[] = [];
  const panels: Panel[] = [];
  const zOf = (pt: MepPoint) => pt.z ?? (POINT_TYPES[pt.type]?.z === 'ceil' ? h : (POINT_TYPES[pt.type]?.z as number) ?? 0.3);
  const pts = p.points.filter((x) => POINT_TYPES[x.type]);
  const ceilZ = h - 0.12;

  // ---------- 3D: полы, стены в разрезе 1 м, приборы ----------
  const box = (kind: Panel['kind'], x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, top: Panel['kind'] = kind) => {
    panels.push({ kind, pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] }, { kind, pts: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
      { kind, pts: [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]] }, { kind, pts: [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]] },
      { kind: top, pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] });
  };
  const CUT = 1.0;
  for (const r of p.rooms) {
    const { x0, x1, y0, y1 } = rectOf(r);
    panels.push({ kind: ROOM_TYPES[r.type]?.wet || r.type === 'kitchen' ? 'tile' : 'floor', pts: [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]] });
  }
  // наружный контур и перегородки: каждая сторона комнаты — стена 1 м (общие стены совпадают)
  const seen = new Set<string>();
  for (const r of p.rooms) {
    const { x0, x1, y0, y1 } = rectOf(r);
    for (const [a, b] of [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]] as [number, number][][]) {
      const k = [a, b].map((q) => q.map((v) => Math.round(v * 10)).join(',')).sort().join('|');
      if (seen.has(k)) continue; seen.add(k);
      const t = 0.06, horiz = a[1] === b[1];
      const xa = Math.min(a[0], b[0]) - (horiz ? 0 : t), xb = Math.max(a[0], b[0]) + (horiz ? 0 : t), ya = Math.min(a[1], b[1]) - (horiz ? t : 0), yb = Math.max(a[1], b[1]) + (horiz ? t : 0);
      box('wall', xa, ya, xb, yb, 0, CUT, 'cut');
    }
  }
  for (const pt of pts) {
    const T = POINT_TYPES[pt.type];
    const w = pt.pw ?? T.w, d = pt.pd ?? T.d, z = zOf(pt);
    const z0 = T.z === 'ceil' ? h - T.h : z, z1 = T.z === 'ceil' ? h : z + T.h;
    const kind: Panel['kind'] = T.sys === 'pl' ? (pt.type === 'riser' ? 'pipeBox' : 'fixture') : pt.type === 'panel' ? 'block' : T.cat === 'Свет' && pt.type !== 'switch' ? 'pointL' : 'pointE';
    box(kind, pt.x - w / 2, pt.y - d / 2, pt.x + w / 2, pt.y + d / 2, z0, Math.min(z1, h));
  }

  // ---------- электрика: группы, трассы, расчёт линий ----------
  const el = elDefaults(p.object, p.gas);
  const phases: 1 | 3 = p.phases === 3 ? 3 : p.phases === 1 ? 1 : el.phases;
  const protect = p.protect || el.protect;
  const spd = p.spd ?? el.spd;
  const panelPt = pts.find((x) => x.type === 'panel');
  const elPts = pts.filter((x) => POINT_TYPES[x.type].sys === 'el' && x.type !== 'panel' && !POINT_TYPES[x.type].noWire);
  const checks: Check[] = [];
  const chk = (lvl: Check['lvl'], text: string, norm?: string, ids?: string[]) => checks.push({ lvl, text, norm, ids });
  const groups: Group[] = [];
  if (elPts.length && !panelPt) warnings.push('Поставьте электрощит — от него считаются трассы кабеля');
  const room = (pt: MepPoint) => roomAt(p.rooms, pt.x, pt.y);
  const isWet = (pt: MepPoint) => { const r = room(pt); return !!r && EL_WET.includes(r.type); };
  const posts = (list: MepPoint[]) => list.reduce((a, x) => a + (POINT_TYPES[x.type].posts || 1), 0);
  const wattOf = (list: MepPoint[]) => list.reduce((a, x) => a + pointWatt(x), 0);
  if (panelPt) {
    const G = (name: string, kind: Member['kind'], list: MepPoint[], o: Partial<Group> = {}): Group =>
      ({ name, kind, pts: list, amp: 10, cable: '3×1,5', s: 1.5, rcd: false, len: 0, lmax: 0, watt: wattOf(list), ib: 0, du: 0, upsized: false, minAmp: 10, minS: 1.5, ...o });
    // свет: санузлы — отдельно через УЗО (ГОСТ Р 50571.7.701), остальное — по 14 точек на группу
    const lights = elPts.filter((x) => POINT_TYPES[x.type].cat === 'Свет');
    const wetL = lights.filter(isWet), dryL = lights.filter((x) => !isWet(x));
    for (let i = 0; i < dryL.length; i += 14) groups.push(G(`Освещение${dryL.length > 14 ? ` ${i / 14 + 1}` : ''}`, 'wireL', dryL.slice(i, i + 14)));
    if (wetL.length) groups.push(G('Освещение санузлов', 'wireL', wetL, { rcd: true }));
    // розетки: кухня и мокрые помещения — свои группы; комнаты объединяем, пока ≤ 8 гнёзд и ≤ 3,5 кВт
    const sockets = elPts.filter((x) => POINT_TYPES[x.type].cat === 'Розетки');
    const byRoom = new Map<string, MepPoint[]>();
    for (const s0 of sockets) { const r = room(s0); const key = r ? r.id : '—'; byRoom.set(key, [...(byRoom.get(key) || []), s0]); }
    const chunks = (list: MepPoint[], max: number) => { const out: MepPoint[][] = []; let cur: MepPoint[] = []; for (const x of list) { if (cur.length && posts([...cur, x]) > max) { out.push(cur); cur = []; } cur.push(x); } if (cur.length) out.push(cur); return out; };
    let acc: MepPoint[] = [];
    const flush = () => { if (!acc.length) return; const names = [...new Set(acc.map((s0) => room(s0)?.name).filter(Boolean))].join(', '); groups.push(G(`Розетки: ${names || 'комнаты'}`, 'wireS', acc, { rcd: true, minAmp: 16, minS: 2.5 })); acc = []; };
    for (const [rid, list] of byRoom) {
      const r = p.rooms.find((x) => x.id === rid);
      if (r && (r.type === 'kitchen' || EL_WET.includes(r.type))) {
        const parts = chunks(list, 6);
        parts.forEach((c, i) => groups.push(G(`Розетки: ${r.name}${parts.length > 1 ? ` ${i + 1}` : ''}`, 'wireS', c, { rcd: true, minAmp: 16, minS: 2.5 })));
        continue;
      }
      for (const c of chunks(list, 8)) {
        if (acc.length && (posts([...acc, ...c]) > 8 || wattOf([...acc, ...c]) > 3500)) flush();
        acc.push(...c);
      }
    }
    flush();
    for (const s0 of elPts.filter((x) => POINT_TYPES[x.type].own)) {
      const T = POINT_TYPES[s0.type];
      const three = phases === 3 && s0.type === 'stove' && pointWatt(s0) > 4000; // в доме с 3 фазами плиту — на три фазы
      groups.push(G(T.label.replace(' (розетка)', '').replace(' (терморегулятор)', '') + (three ? ' (3 фазы)' : ''), 'wireP', [s0], { three, rcd: !!T.rcd || isWet(s0), minAmp: three ? 16 : T.amp || 16, minS: T.minS || 2.5 }));
    }
    const nets = elPts.filter((x) => POINT_TYPES[x.type].cat === 'Слаботочка');
    if (nets.length) groups.push(G('Интернет и ТВ', 'wireN', nets, { amp: 0, cable: 'UTP 5e', s: 0, minAmp: 0 }));

    // трассы: от щита вверх, по стене в 150 мм от потолка, к точке — вертикально вниз
    const src: Node = { id: panelPt.id, x: panelPt.x, y: panelPt.y, z: zOf(panelPt) };
    groups.forEach((g, gi) => {
      const nodes: Node[] = g.pts.map((x) => ({ id: x.id, x: x.x, y: x.y, z: zOf(x), t: x.type }));
      const zc = h - 0.15 - (gi % 6) * 0.02; // разносим трассы групп, чтобы не сливались
      const dist = new Map<string, number>([[src.id, 0]]);
      for (const e of tree(src, nodes, g.kind === 'wireN')) {
        const A: V3 = [e.a.x, e.a.y, e.a.z], B: V3 = [e.b.x, e.b.y, e.b.z];
        const a1: V3 = [e.a.x, e.a.y, zc], m: V3 = [e.b.x, e.a.y, zc], b1: V3 = [e.b.x, e.b.y, zc];
        let el2 = 0;
        for (const [u, v] of [[A, a1], [a1, m], [m, b1], [b1, B]] as [V3, V3][]) {
          const L = Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) + Math.abs(u[2] - v[2]);
          if (L < 0.01) continue;
          members.push({ kind: g.kind, profile: g.kind === 'wireP' ? '40×40×0' : '30×30×0', a: u, b: v, grp: g.name });
          g.len += L; el2 += L;
        }
        dist.set(e.b.id, (dist.get(e.a.id) || 0) + el2);
      }
      g.len = Math.round(g.len * 1.15 + 1); // +15% запас и подключение
      g.lmax = Math.round((Math.max(0, ...dist.values()) * 1.15 + 1) * 10) / 10;
      if (g.amp > 0 || g.minAmp > 0) {
        const L = lineFor({ watt: g.watt, lmax: g.lmax, minAmp: g.minAmp, minS: g.minS, three: g.three, fixedAmp: g.kind === 'wireS' ? 16 : g.kind === 'wireL' ? 10 : undefined });
        Object.assign(g, { amp: L.amp, s: L.s, cable: cableName(L.s, g.three ? 5 : 3), ib: L.ib, du: L.du, upsized: L.upsized });
      }
    });

    // фазы: раскладываем группы по L1/L2/L3 «от тяжёлых к лёгким»
    if (phases === 3) {
      const load = [0, 0, 0];
      for (const g of groups.filter((x) => x.three)) for (let i = 0; i < 3; i++) load[i] += g.watt / 3;
      [...groups].filter((g) => g.amp > 0 && !g.three).sort((a, b) => b.watt - a.watt).forEach((g) => { const i = load.indexOf(Math.min(...load)); g.phase = (i + 1) as 1 | 2 | 3; load[i] += g.watt; });
    }
  }
  const cableBy = new Map<string, number>();
  for (const g of groups) cableBy.set(g.cable, (cableBy.get(g.cable) || 0) + g.len);

  // ---------- мощность, ввод, щит ----------
  const wLight = wattOf(elPts.filter((x) => POINT_TYPES[x.type].cat === 'Свет'));
  const wSock = wattOf(elPts.filter((x) => POINT_TYPES[x.type].cat === 'Розетки'));
  const wPow = elPts.filter((x) => POINT_TYPES[x.type].own).map((x) => pointWatt(x) * (x.type === 'stove' ? 0.6 : 1));
  const pInst = Math.round(wattOf(elPts) / 100) / 10;
  const pCalc = designPower(wLight, wSock, wPow);
  const allowSet = !!(p.power && p.power > 0);
  // не задана — берём типовую, но не меньше расчётной (с округлением вверх)
  const allowKw = allowSet ? p.power! : Math.max(defaultPower(p.object, p.gas), Math.ceil(pCalc));
  const input = inputFor(allowKw, phases);
  const live = groups.filter((g) => g.amp > 0);
  const shield = panelLayout({ phases, inAmp: input.amp, spd, house: p.object === 'house', protect, groups });
  const phaseKw = phases === 3 ? [1, 2, 3].map((f) => Math.round(live.reduce((a, g) => a + (g.three ? g.watt / 3 : g.phase === f ? g.watt : 0), 0) / 100) / 10) : [];
  const power = { allowSet, inst: pInst, calc: pCalc, allow: allowKw, phases, inAmp: input.amp, inI: input.i, inCable: cableName(input.s, input.cores), iCalc: Math.round(((pCalc * 1000) / (phases === 3 ? Math.sqrt(3) * 400 * 0.95 : 230 * 0.95)) * 10) / 10, phaseKw };

  // ---------- проверка по нормам ----------
  if (panelPt) {
    const shieldRoom = room(panelPt);
    if (shieldRoom && EL_WET.includes(shieldRoom.type)) chk('err', 'Щит в санузле ставить нельзя — перенесите в прихожую или коридор', NORMS.zones, [panelPt.id]);
    if (pCalc > allowKw) chk('err', `Расчётная мощность ${pCalc} кВт больше выделенной ${allowKw} кВт — вводной автомат будет срабатывать. Нужна большая мощность${phases === 1 ? ' или 3 фазы' : ''}, либо уберите часть нагрузки`, 'СП 256.1325800.2016');
    else if (!allowSet) chk('info', `Выделенная мощность не указана — заложено ${allowKw} кВт (расчётная ${pCalc} кВт). Сверьте с договором энергоснабжения и впишите в параметрах`, 'СП 256.1325800.2016');
    else chk('ok', `Мощность: расчётная ${pCalc} кВт из выделенных ${allowKw} кВт, вводной автомат ${input.amp} А`, 'СП 256.1325800.2016');
    if (phases === 1 && allowKw > 15) chk('warn', 'Больше 15 кВт на одну фазу обычно не дают — выбирайте ввод 3 фазы', 'ПП РФ № 861');
    const maxG = Math.max(0, ...live.map((g) => g.amp));
    if (maxG >= input.amp) chk('err', `Самый мощный автомат группы (${maxG} А) не меньше вводного (${input.amp} А) — нет селективности, при перегрузке выбьет ввод`, 'ПУЭ 3.1.4');
    if (phases === 3 && phaseKw.length) {
      const mx = Math.max(...phaseKw), mn = Math.min(...phaseKw);
      if (mx > 0 && (mx - mn) / mx > 0.25) chk('warn', `Перекос фаз: L1 ${phaseKw[0]}, L2 ${phaseKw[1]}, L3 ${phaseKw[2]} кВт — раскидайте мощные линии по разным фазам`, 'СП 256.1325800.2016');
      else chk('ok', `Фазы нагружены равномерно: L1 ${phaseKw[0]} · L2 ${phaseKw[1]} · L3 ${phaseKw[2]} кВт`);
    }
    for (const g of live) {
      if (g.upsized) chk('info', `«${g.name}»: линия ${g.lmax} м — сечение увеличено до ${sTxt(g.s)} мм², чтобы потери напряжения были не больше ${DU_MAX}% (сейчас ${g.du}%)`, NORMS.du, [g.pts[0].id]);
      else if (g.du > DU_MAX) chk('warn', `«${g.name}»: потери напряжения ${g.du}% — щит слишком далеко, поставьте дополнительный щиток ближе`, NORMS.du, [g.pts[0].id]);
      if (g.kind === 'wireS' && g.watt > g.amp * 230) chk('warn', `«${g.name}»: подключено ${Math.round(g.watt / 100) / 10} кВт на автомат ${g.amp} А — разделите группу или вынесите мощный прибор на свою линию`, 'ПУЭ 3.1.4', [g.pts[0].id]);
    }
  }
  // зоны ванной, IP44, выключатели в санузле
  for (const r of p.rooms) {
    const zones = wetRects(pts, r);
    const inRoom = elPts.filter((x) => roomAt([r], x.x, x.y));
    if (EL_WET.includes(r.type)) {
      for (const x of inRoom) {
        const T = POINT_TYPES[x.type];
        if (T.cat === 'Свет' && x.type !== 'switch') continue;
        const z = bathZone(x.x, x.y, zOf(x), zones);
        if (z < 3) chk('err', `${T.label} в зоне ${z} ванны/душа — розетки и выключатели только дальше 0,6 м от края`, NORMS.zones, [x.id]);
        else if (T.cat === 'Розетки' && !T.ip44) chk('warn', `${T.label} в «${r.name}» — нужна влагозащищённая IP44 через УЗО 30 мА`, NORMS.zones, [x.id]);
      }
    }
    // розеток по норме
    const nPosts = posts(inRoom.filter((x) => POINT_TYPES[x.type].cat === 'Розетки'));
    const per = 2 * (r.w + r.d);
    const need = ['living', 'bedroom', 'kids', 'office'].includes(r.type) ? Math.ceil(per / 4 - 1e-9) : r.type === 'kitchen' ? 4 : r.type === 'hall' ? Math.ceil((r.w * r.d) / 10 - 1e-9) : 0;
    if (need && nPosts < need) chk('warn', `«${r.name}»: розеток ${nPosts}, по норме не меньше ${need}${r.type === 'kitchen' ? ' (без плиты)' : r.type === 'hall' ? ' (одна на 10 м²)' : ' (одна на каждые 4 м периметра)'}`, NORMS.sockets);
    if (r.type === 'kids' && inRoom.some((x) => POINT_TYPES[x.type].cat === 'Розетки')) chk('info', `«${r.name}»: розетки с защитными шторками — заложены в смету`, NORMS.sockets);
  }
  // газ, мойки, высоты
  const gasPts = pts.filter((x) => x.type === 'gasPipe');
  for (const x of elPts) {
    const T = POINT_TYPES[x.type];
    for (const g of gasPts) if (Math.hypot(g.x - x.x, g.y - x.y) < 0.5 && T.cat !== 'Свет') chk('err', `${T.label} ближе 0,5 м к газовой трубе`, NORMS.gas, [x.id]);
    if (T.cat === 'Розетки' || T.own) for (const s0 of pts.filter((q) => q.type === 'sink' || q.type === 'kitchenSink')) {
      const S = POINT_TYPES[s0.type];
      if (distRect(x.x, x.y, { x0: s0.x - (s0.pw ?? S.w) / 2, y0: s0.y - (s0.pd ?? S.d) / 2, x1: s0.x + (s0.pw ?? S.w) / 2, y1: s0.y + (s0.pd ?? S.d) / 2 }) < 0.15 && zOf(x) < 1.6) chk('warn', `${T.label} над мойкой / раковиной — сдвиньте в сторону`, undefined, [x.id]);
    }
    if (x.type === 'switch' && (zOf(x) > 1.0 || zOf(x) < 0.75)) chk('info', `Выключатель на ${zOf(x)} м — по ПУЭ ставят со стороны ручки двери на высоте до 1 м`, NORMS.switch, [x.id]);
  }
  if (panelPt) {
    if (pts.some((x) => x.type === 'bath' || x.type === 'shower')) chk('info', 'В ванной — дополнительное уравнивание потенциалов (КУП): трубы, ванна, поддон проводом 4 мм² на PE. Заложено в смету', NORMS.sup);
    if (p.walls === 'wood' && p.wiring === 'hidden') chk('warn', 'Деревянные стены: скрытая проводка — только в металлической трубе или металлорукаве. Заложено в смету', NORMS.wood);
    if (p.object === 'house') chk('info', 'Дом: система TN-C-S, повторное заземление PEN на вводе (контур, до 30 Ом) и противопожарное УЗО 100 мА', NORMS.ground);
    chk('info', `Кабель ВВГнг(А)-LS, медь; трассы горизонтально в 150 мм от потолка, вертикально — не ближе 100 мм к углам и проёмам; от труб — 100 мм, от газа — 400 мм`, `${NORMS.cable}; ${NORMS.pipes}`);
  }

  // ---------- сантехника: вода и канализация ----------
  const riser = pts.find((x) => x.type === 'riser');
  const coll = pts.find((x) => x.type === 'collector');
  const boiler = pts.find((x) => x.type === 'boiler');
  const fixtures = pts.filter((x) => POINT_TYPES[x.type].sys === 'pl' && !['riser', 'collector'].includes(x.type));
  const pipeLen = { cold: 0, hot: 0, s50: 0, s110: 0 };
  if (fixtures.length && !riser) warnings.push('Поставьте стояк или ввод воды — от него считаются трубы и канализация');
  if (riser) {
    const rz: Node = { id: riser.id, x: riser.x, y: riser.y, z: 0.15 };
    const water: Node = coll ? { id: coll.id, x: coll.x, y: coll.y, z: zOf(coll) } : rz;
    const conn = (x: MepPoint) => ({ id: x.id, x: x.x, y: x.y, z: x.type === 'bath' || x.type === 'shower' ? 0.8 : x.type === 'boiler' ? 1.1 : x.type === 'towel' ? 1.0 : x.type.includes('ink') ? 0.55 : 0.25, t: x.type });
    const pipe = (kind: Member['kind'], prof: string, from: Node, to: Node, zr: number, add: (l: number) => void) => {
      const A: V3 = [from.x, from.y, from.z], a1: V3 = [from.x, from.y, zr], m: V3 = [to.x, from.y, zr], b1: V3 = [to.x, to.y, zr], B: V3 = [to.x, to.y, to.z];
      for (const [u, v] of [[A, a1], [a1, m], [m, b1], [b1, B]] as [V3, V3][]) {
        const L = Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) + Math.abs(u[2] - v[2]);
        if (L < 0.01) continue;
        members.push({ kind, profile: prof, a: u, b: v }); add(L);
      }
    };
    const star = p.scheme === 'collector';
    if (coll) pipe('pipeC', '32×32×0', rz, water, 0.12, (l) => (pipeLen.cold += l));
    const colds = fixtures.filter((x) => POINT_TYPES[x.type].cold).map(conn);
    for (const e of tree(water, colds, star)) pipe('pipeC', '25×25×0', e.a, e.b, 0.12, (l) => (pipeLen.cold += l));
    // горячая: от водонагревателя, иначе от стояка ГВС (квартира) — рядом с холодным
    const hotSrc: Node = boiler ? conn(boiler) : { ...water, x: water.x - 0.08 };
    const hots = fixtures.filter((x) => POINT_TYPES[x.type].hot).map((x) => ({ ...conn(x), x: x.x - 0.08 }));
    if (hots.length && !boiler && p.object === 'house') warnings.push('В доме нет стояка горячей воды — добавьте водонагреватель или котёл с бойлером');
    for (const e of tree(hotSrc, hots, star)) pipe('pipeH', '25×25×0', e.a, e.b, 0.18, (l) => (pipeLen.hot += l));
    // канализация: дерево к стояку, 110 — на участке, по которому идёт унитаз
    const sew = fixtures.filter((x) => POINT_TYPES[x.type].sewer).map((x) => ({ ...conn(x), z: 0.05 }));
    const edges = tree({ ...rz, z: 0.05 }, sew);
    const big = new Set<string>(); // узлы, от которых вниз по течению идёт унитаз
    const parent = new Map(edges.map((e) => [e.b.id, e.a]));
    for (const f of fixtures.filter((x) => POINT_TYPES[x.type].sewer === 110)) { let cur: any = { id: f.id }; while (cur) { big.add(cur.id); cur = parent.get(cur.id); } }
    for (const e of edges) {
      const is110 = big.has(e.b.id);
      pipe('pipeS', is110 ? '110×110×0' : '50×50×0', e.a, e.b, 0.05, (l) => (is110 ? (pipeLen.s110 += l) : (pipeLen.s50 += l)));
    }
    for (const f of fixtures.filter((x) => POINT_TYPES[x.type].sewer === 110)) {
      const d = Math.abs(f.x - riser.x) + Math.abs(f.y - riser.y);
      if (d > 3) warnings.push(`${POINT_TYPES[f.type].label} в ${Math.round(d * 10) / 10} м от стояка — для трубы 110 нужен уклон 2 см/м и подиум, лучше ближе к стояку`);
    }
    const far = sew.filter((s) => Math.abs(s.x - riser.x) + Math.abs(s.y - riser.y) > 8);
    if (far.length) warnings.push('Есть приборы дальше 8 м от стояка — проверьте уклон канализации или понадобится насос (КНС)');
  }
  for (const k of Object.keys(pipeLen) as (keyof typeof pipeLen)[]) pipeLen[k] = Math.round(pipeLen[k] * 1.15 * 10) / 10;

  // ---------- смета ----------
  const cnt = (...types: string[]) => pts.filter((x) => types.includes(x.type)).length;
  const b = new Builder('Электрика');
  const SOCK = ['socket', 'socket2', 'socketK', 'hood', 'socketWet', 'socketOut', 'stove', 'oven', 'washer', 'dish', 'boilerEl', 'ac', 'floorHeat', 'heatBoiler'];
  const boxes = cnt(...SOCK, 'switch', 'net');
  const totalCable = [...cableBy.values()].reduce((a, v) => a + v, 0);
  if (panelPt && groups.length) {
    const hidden = p.wiring === 'hidden';
    const wood = p.walls === 'wood';
    if (hidden && p.walls !== 'gkl' && !wood) b.work('Штробление стен под кабель', Math.round(totalCable * 0.45));
    if (hidden) b.work(p.walls === 'gkl' || wood ? 'Монтаж подрозетника в ГКЛ' : 'Монтаж подрозетника в бетон', boxes);
    b.work(hidden ? 'Прокладка кабеля' : 'Прокладка кабеля в гофре по стене', Math.round(totalCable));
    b.work('Монтаж розетки/выключателя', boxes);
    b.work('Монтаж распределительной коробки', p.rooms.filter((r) => pts.some((x) => POINT_TYPES[x.type].sys === 'el' && roomAt([r], x.x, x.y))).length);
    b.work('Монтаж люстры', cnt('light'));
    b.work('Монтаж точечного светильника', cnt('spot'));
    if (cnt('stove')) b.work('Подключение электроплиты', cnt('stove'));
    const dev = shield.devices;
    const isRcd = (d: { name: string }) => /УЗО|Дифавтомат|УЗИП|Реле/.test(d.name);
    b.work('Сборка электрощита (до 12 модулей)', Math.max(1, Math.ceil(shield.size / 12)));
    b.work('Монтаж автомата в щит', dev.filter((d) => !isRcd(d)).length);
    b.work('Монтаж УЗО/дифавтомата', dev.filter(isRcd).length);
    const sup = pts.some((x) => x.type === 'bath' || x.type === 'shower');
    if (sup) b.work('Монтаж распределительной коробки', 1, { note: 'коробка уравнивания потенциалов (КУП) в ванной' });
    if (p.object === 'house') b.work('Монтаж контура заземления', 1);
    // материалы
    const CABLE: Record<string, number> = { '3×1,5': 75, '3×2,5': 115, '3×4': 180, '3×6': 290, '3×10': 480, '3×16': 750 };
    for (const [c, len] of cableBy) {
      if (c === 'UTP 5e') b.mat('Кабель UTP 5e', Math.ceil(len), 'м', 35);
      else if (CABLE[c]) b.mat(`Кабель ВВГнг(А)-LS ${c}`, Math.ceil(len), 'м', CABLE[c]);
    }
    if (!hidden) b.mat('Гофра / кабель-канал', Math.ceil(totalCable), 'м', 40);
    if (hidden && wood) b.mat('Металлорукав / стальная труба для скрытой проводки', Math.ceil(totalCable), 'м', 95);
    if (hidden) b.mat('Подрозетник', boxes, 'шт', 25);
    b.mat('Розетка с защитными шторками (механизм + рамка)', cnt('socket', 'socket2', 'socketK', 'hood', 'stove', 'oven', 'dish', 'ac', 'heatBoiler'), 'шт', 420);
    b.mat('Розетка влагозащищённая IP44 со шторками', cnt('socketWet', 'washer', 'boilerEl', 'socketOut'), 'шт', 650);
    b.mat('Терморегулятор тёплого пола', cnt('floorHeat'), 'шт', 2500);
    b.mat('Выключатель (механизм + рамка)', cnt('switch'), 'шт', 380);
    b.mat('Розетка интернет / ТВ', cnt('net'), 'шт', 450);
    b.mat('Распаечная коробка с клеммами', p.rooms.length, 'шт', 180);
    b.mat(`Щит на ${shield.size} модулей (с шинами N и PE)`, 1, 'шт', 1800 + Math.ceil(shield.size / 12) * 1200);
    const byName = new Map<string, { n: number; price: number }>();
    for (const d of dev) { const c = byName.get(d.name) || { n: 0, price: d.price }; c.n++; byName.set(d.name, c); }
    for (const [name, c] of byName) b.mat(name, c.n, 'шт', c.price);
    if (sup) { b.mat('Коробка уравнивания потенциалов (КУП)', 1, 'шт', 600); b.mat('Провод ПуГВ 1×4 (уравнивание потенциалов)', 10, 'м', 45); }
    if (p.object === 'house') b.mat('Комплект заземления (электроды, полоса)', 1, 'компл', 9000);
    b.sum('Кабель всего', Math.round(totalCable), 'м').sum('Групп в щите', live.length, 'шт').sum('Расчётная мощность', pCalc, 'кВт');
  }
  if (riser && fixtures.length) {
    b.sec('Водоснабжение');
    const pex = p.pipes === 'pex';
    b.work('Прокладка трубы водоснабжения', Math.round(pipeLen.cold + pipeLen.hot));
    b.mat(pex ? 'Труба PEX 16 мм' : 'Труба PPR 20 мм', Math.ceil(pipeLen.cold + pipeLen.hot), 'м', pex ? 120 : 90);
    b.mat(pex ? 'Фитинги PEX (комплект на точку)' : 'Фитинги PPR (комплект на точку)', fixtures.length, 'компл', pex ? 900 : 450);
    b.mat('Кран шаровой 1/2"', fixtures.length + 2, 'шт', 450);
    b.mat('Теплоизоляция для труб', Math.ceil(pipeLen.hot), 'м', 35);
    if (coll) { b.work('Установка коллектора', 1); b.mat('Коллектор на 4 выхода (ХВС + ГВС)', 2, 'шт', 3500); }
    if (p.object === 'flat') { b.work('Установка счётчика воды', 2); b.mat('Счётчик воды', 2, 'шт', 1200); }
    b.work('Установка фильтра грубой очистки', 1); b.mat('Фильтр грубой очистки', 1, 'шт', 800);
    const W: Record<string, string> = { toilet: 'Установка унитаза', install: 'Установка инсталляции', sink: 'Установка раковины', kitchenSink: 'Установка раковины', bath: 'Установка ванны', shower: 'Установка душевой кабины', washerW: 'Установка стиральной машины', dishW: 'Установка посудомоечной машины', boiler: 'Монтаж бойлера', towel: 'Установка полотенцесушителя' };
    for (const [t, w] of Object.entries(W)) if (cnt(t)) b.work(w, cnt(t));
    if (cnt('install')) b.work('Установка унитаза', cnt('install'));
    b.work('Установка смесителя', cnt('sink', 'kitchenSink', 'bath', 'shower'));
    b.work('Опрессовка системы', 1);
    b.sec('Канализация');
    b.work('Прокладка канализационной трубы внутри', Math.round(pipeLen.s50 + pipeLen.s110));
    b.mat('Труба канализационная 50 мм', Math.ceil(pipeLen.s50), 'м', 150);
    b.mat('Труба канализационная 110 мм', Math.ceil(pipeLen.s110), 'м', 350);
    b.mat('Фасонные части канализации (отводы, тройники)', fixtures.filter((x) => POINT_TYPES[x.type].sewer).length, 'компл', 400);
    b.work('Подключение сантехприбора к канализации', fixtures.filter((x) => POINT_TYPES[x.type].sewer).length);
    b.sum('Вода ХВС', pipeLen.cold, 'м').sum('Вода ГВС', pipeLen.hot, 'м').sum('Канализация', Math.round((pipeLen.s50 + pipeLen.s110) * 10) / 10, 'м');
  }

  const area = p.rooms.reduce((a, r) => a + r.w * r.d, 0);
  const xs = p.rooms.flatMap((r) => [r.x, r.x + r.w]), ys = p.rooms.flatMap((r) => [r.y, r.y + r.d]);
  const L = Math.max(1, xs.reduce((a: number, v: number) => Math.max(a, v), 1) - xs.reduce((a: number, v: number) => Math.min(a, v), 0)), Wd = Math.max(1, ys.reduce((a: number, v: number) => Math.max(a, v), 1) - ys.reduce((a: number, v: number) => Math.min(a, v), 0));
  const summary = [
    { label: 'Площадь', value: Math.round(area * 10) / 10, unit: 'м²' },
    { label: 'Электроточек', value: elPts.length, unit: 'шт' },
    { label: 'Групп в щите', value: live.length, unit: 'шт' },
    { label: 'Мощность расч.', value: pCalc, unit: 'кВт' },
    { label: 'Кабель', value: Math.round(totalCable), unit: 'м' },
    { label: 'Сантехприборов', value: fixtures.length, unit: 'шт' },
    { label: 'Трубы вода + канализация', value: Math.round(pipeLen.cold + pipeLen.hot + pipeLen.s50 + pipeLen.s110), unit: 'м' },
  ];
  return {
    mep: true as const,
    params: { ...p, h, L, W: Wd, frame: 'steel' as const, base: 'none' as const, cover: 'none' as const, color: 'RAL 9003', slabT: 0, eps: 0, overhang: 0 },
    members, panels, steel: [] as any[], lines: b.lines, summary, warnings, openings: [] as any[], groups, cableBy: Object.fromEntries(cableBy), pipeLen, checks, power, shield,
    info: { hHigh: CUT + 0.4, hLow: 0, wood: false, woodVol: 0, steelKg: 0 },
  };
}
export type MepResult = ReturnType<typeof buildMep>;

export function mepParamRows(r: MepResult): [string, string][] {
  const p = r.params;
  const rows: [string, string][] = [
    ['Объект', `${p.object === 'house' ? 'Частный дом' : 'Квартира'}: электрика и сантехника`],
    ['Помещения', p.rooms.map((x) => `${x.name} ${Math.round(x.w * x.d * 10) / 10} м²`).join(', ')],
    ['Высота потолка', `${p.h} м`],
    ['Проводка', `${p.wiring === 'hidden' ? 'скрытая' : 'открытая в гофре'}, стены: ${({ concrete: 'бетон', brick: 'кирпич', gkl: 'гипсокартон', wood: 'дерево' } as any)[p.walls]}`],
  ];
  if (r.groups.length) {
    const w = r.power;
    rows.push(['Ввод', `${w.phases === 3 ? '3 фазы 400 В' : '1 фаза 230 В'}, TN-C-S, выделено ${w.allow} кВт, вводной автомат ${w.inAmp} А, кабель ${w.inCable}`]);
    rows.push(['Мощность', `установленная ${w.inst} кВт, расчётная ${w.calc} кВт (ток ${w.iCalc} А)${w.phaseKw.length ? `; по фазам L1 ${w.phaseKw[0]} · L2 ${w.phaseKw[1]} · L3 ${w.phaseKw[2]} кВт` : ''}`]);
    rows.push(['Щит', `${r.shield.size} модулей, занято ${r.shield.used}: ${[...new Set(r.shield.devices.filter((d) => !d.group).map((d) => d.name))].join(', ')}`]);
  }
  for (const g of r.groups) rows.push([`Гр. ${r.groups.indexOf(g) + 1}: ${g.name}`, `${g.amp ? `${g.rcd ? 'с УЗО 30 мА, ' : ''}автомат C${g.amp}, ` : ''}кабель ${g.cable}, ${g.len} м, точек ${g.pts.length}${g.amp ? `, ${Math.round(g.watt / 100) / 10} кВт, потери ${g.du}%` : ''}${g.phase ? `, L${g.phase}` : ''}`]);
  for (const c of r.checks.filter((x) => x.lvl === 'err' || x.lvl === 'warn')) rows.push([c.lvl === 'err' ? 'Нарушение нормы' : 'Замечание', `${c.text}${c.norm ? ` (${c.norm})` : ''}`]);
  if (r.pipeLen.cold || r.pipeLen.s50) {
    rows.push(['Водопровод', `${p.pipes === 'pex' ? 'PEX 16' : 'PPR 20'}, ${p.scheme === 'collector' ? 'коллекторная разводка' : 'тройниковая разводка'}: ХВС ${r.pipeLen.cold} м, ГВС ${r.pipeLen.hot} м`]);
    rows.push(['Канализация', `Ø50 — ${r.pipeLen.s50} м, Ø110 — ${r.pipeLen.s110} м`]);
  }
  return rows;
}
