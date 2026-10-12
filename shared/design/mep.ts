/**
 * Электрика и сантехника (инженерия квартиры или дома): комнаты, точки (розетки, свет, выключатели, силовые линии,
 * сантехприборы), автоматическая расстановка по типовым правилам, трассы кабелей и труб (дерево от щита / стояка),
 * группы щита с автоматами, длины кабеля и труб, 3D в разрезе, чертежи и смета.
 * Это эскиз и расчёт материалов, а не рабочий проект: сечения и автоматы — по типовым решениям.
 */
import type { Member, Panel, V3 } from './canopy';
import { Builder } from '../masters';

export type RoomType = 'living' | 'bedroom' | 'kids' | 'office' | 'kitchen' | 'bath' | 'wc' | 'hall' | 'boiler' | 'garage';
export interface Room { id: string; type: RoomType; name: string; x: number; y: number; w: number; d: number }
export interface MepPoint { id: string; type: string; x: number; y: number; z?: number; pw?: number; pd?: number }
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
}

export const ROOM_TYPES: Record<RoomType, { label: string; color: string; wet?: boolean }> = {
  living: { label: 'Гостиная', color: '#EFE6D6' }, bedroom: { label: 'Спальня', color: '#EAE3F2' }, kids: { label: 'Детская', color: '#E3F0E1' },
  office: { label: 'Кабинет', color: '#E6ECF2' }, kitchen: { label: 'Кухня', color: '#F6E7D2' }, bath: { label: 'Ванная', color: '#DCEBF2', wet: true },
  wc: { label: 'Туалет', color: '#DCEBF2', wet: true }, hall: { label: 'Прихожая', color: '#ECE8E1' }, boiler: { label: 'Котельная', color: '#E8E4DC', wet: true },
  garage: { label: 'Гараж', color: '#E2E3E5' },
};

/** Типы точек: система, высота установки, размер в плане (для 3D), группа щита */
export interface PointType { label: string; icon: string; sys: 'el' | 'pl'; z: number | 'ceil'; w: number; d: number; h: number; cat: string;
  amp?: number; cable?: string; rcd?: boolean; own?: boolean; cold?: boolean; hot?: boolean; sewer?: 50 | 110 }
export const POINT_TYPES: Record<string, PointType> = {
  // ---- электрика
  panel: { label: 'Электрощит', icon: '🔌', sys: 'el', z: 1.6, w: 0.4, d: 0.12, h: 0.5, cat: 'Щит' },
  socket: { label: 'Розетка', icon: '⚡', sys: 'el', z: 0.3, w: 0.08, d: 0.05, h: 0.08, cat: 'Розетки' },
  socket2: { label: 'Двойная розетка', icon: '⚡', sys: 'el', z: 0.3, w: 0.15, d: 0.05, h: 0.08, cat: 'Розетки' },
  socketK: { label: 'Розетка над столешницей', icon: '⚡', sys: 'el', z: 1.1, w: 0.15, d: 0.05, h: 0.08, cat: 'Розетки' },
  socketWet: { label: 'Влагозащищённая розетка', icon: '💧', sys: 'el', z: 1.0, w: 0.08, d: 0.06, h: 0.08, cat: 'Розетки', rcd: true },
  stove: { label: 'Варочная панель / плита', icon: '🍳', sys: 'el', z: 0.3, w: 0.1, d: 0.05, h: 0.1, cat: 'Силовые', amp: 32, cable: '3×6', own: true },
  oven: { label: 'Духовой шкаф', icon: '🔥', sys: 'el', z: 0.3, w: 0.08, d: 0.05, h: 0.08, cat: 'Силовые', amp: 16, cable: '3×2,5', own: true },
  washer: { label: 'Стиральная машина (розетка)', icon: '🌀', sys: 'el', z: 1.0, w: 0.08, d: 0.06, h: 0.08, cat: 'Силовые', amp: 16, cable: '3×2,5', own: true, rcd: true },
  dish: { label: 'Посудомойка (розетка)', icon: '🍽', sys: 'el', z: 0.3, w: 0.08, d: 0.05, h: 0.08, cat: 'Силовые', amp: 16, cable: '3×2,5', own: true, rcd: true },
  boilerEl: { label: 'Водонагреватель (розетка)', icon: '♨️', sys: 'el', z: 1.9, w: 0.08, d: 0.06, h: 0.08, cat: 'Силовые', amp: 16, cable: '3×2,5', own: true, rcd: true },
  ac: { label: 'Кондиционер', icon: '❄️', sys: 'el', z: 2.3, w: 0.08, d: 0.05, h: 0.08, cat: 'Силовые', amp: 16, cable: '3×2,5', own: true },
  floorHeat: { label: 'Тёплый пол (терморегулятор)', icon: '🌡', sys: 'el', z: 0.9, w: 0.08, d: 0.05, h: 0.08, cat: 'Силовые', amp: 16, cable: '3×2,5', own: true, rcd: true },
  switch: { label: 'Выключатель', icon: '🔘', sys: 'el', z: 0.9, w: 0.08, d: 0.05, h: 0.08, cat: 'Свет' },
  light: { label: 'Люстра / светильник', icon: '💡', sys: 'el', z: 'ceil', w: 0.35, d: 0.35, h: 0.12, cat: 'Свет' },
  spot: { label: 'Точечный светильник', icon: '🔆', sys: 'el', z: 'ceil', w: 0.09, d: 0.09, h: 0.03, cat: 'Свет' },
  net: { label: 'Интернет / ТВ', icon: '📶', sys: 'el', z: 0.3, w: 0.08, d: 0.05, h: 0.08, cat: 'Слаботочка' },
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

/**
 * «Расставить по нормам»: типовые точки для каждой комнаты (дверь считаем у левого нижнего угла).
 * Розетки — по одной на 3–4 м периметра, над столешницей — 3, силовые линии под технику, свет и выключатель у двери,
 * в мокрых зонах — влагозащищённые розетки и линии через дифавтомат; стояк, приборы, мойка, стиральная машина.
 */
export function autoPlace(p: MepParams, sys: 'el' | 'pl' | 'both' = 'both'): MepPoint[] {
  const out: MepPoint[] = [];
  const add = (type: string, x: number, y: number, extra: Partial<MepPoint> = {}) => out.push({ id: newMepId(), type, x: rr(x), y: rr(y), ...extra });
  const el = sys !== 'pl', pl = sys !== 'el';
  const hall = p.rooms.find((r) => r.type === 'hall') || p.rooms[0];
  if (el && hall) add('panel', hall.x + 0.3, hall.y + 0.06);
  let boilerDone = false;
  for (const r of p.rooms) {
    const { x0, x1, y0, y1 } = rectOf(r);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, wet = ROOM_TYPES[r.type].wet;
    const along = (n: number, z?: number) => {
      // розетки по периметру: левая, верхняя, правая стены (нижняя — с дверью)
      const per = 2 * r.d + r.w;
      for (let i = 0; i < n; i++) {
        let t = ((i + 0.5) / n) * per;
        if (t < r.d) add('socket', x0 + 0.06, y0 + 0.9 + t * ((r.d - 1.1) / r.d), z ? { z } : {});
        else if ((t -= r.d) < r.w) add('socket', x0 + 0.3 + t * ((r.w - 0.6) / r.w), y1 - 0.06, z ? { z } : {});
        else { t -= r.w; add('socket', x1 - 0.06, y1 - 0.3 - t * ((r.d - 0.6) / r.d), z ? { z } : {}); }
      }
    };
    if (el) {
      add('switch', Math.min(x0 + 0.95, x1 - 0.1), y0 + 0.06);
      if (wet) { add('spot', cx - Math.min(0.5, r.w / 4), cy); add('spot', cx + Math.min(0.5, r.w / 4), cy); }
      else add('light', cx, cy);
      if (['living', 'bedroom', 'kids', 'office'].includes(r.type)) {
        along(Math.max(2, Math.round((2 * (r.w + r.d)) / 3.5)));
        if (r.type !== 'office' || r.w * r.d > 4) add('net', x0 + 0.06, cy);
        if (['living', 'bedroom'].includes(r.type) && r.w * r.d > 9) add('ac', cx, y1 - 0.06);
      }
      if (r.type === 'kitchen') {
        for (let i = 0; i < 3; i++) add('socketK', x0 + 0.5 + (i * (r.w - 1)) / 2, y1 - 0.06);
        add('stove', cx, y1 - 0.06); add('oven', cx + 0.4, y1 - 0.06); add('dish', x1 - 0.06, y1 - 0.9);
        add('socket', x1 - 0.06, y0 + 0.6, {}); add('socket', x0 + 0.06, cy, { z: 2.0 }); // холодильник, вытяжка
      }
      if (r.type === 'bath') {
        add('socketWet', x0 + 0.06, cy); add('washer', x1 - 0.06, y0 + 0.6);
        if (p.object === 'flat' && !boilerDone) { add('boilerEl', x0 + 0.06, y1 - 0.5); boilerDone = true; }
        if (r.w * r.d >= 4) add('floorHeat', x0 + 0.06, y0 + 0.5);
      }
      if (r.type === 'hall') along(1);
      if (r.type === 'boiler') { along(2); }
      if (r.type === 'garage') { along(3); }
    }
    if (pl) {
      if (r.type === 'bath') {
        add('riser', x1 - 0.12, y1 - 0.12);
        add(p.object === 'house' ? 'install' : 'toilet', x1 - 0.25, y1 - 0.75, { pw: 0.65, pd: 0.38 });
        add('sink', x0 + Math.min(1.2, r.w * 0.5), y1 - 0.25);
        if (r.w >= 2.2 && r.d >= 1.6) add('bath', x0 + 0.38, y0 + Math.min(r.d, 1.7) / 2 + (r.d > 1.8 ? 0.15 : 0), { pw: 0.75, pd: Math.min(1.7, r.d - 0.1) });
        else add('shower', x0 + 0.45, y0 + 0.45);
        add('washerW', x1 - 0.32, y0 + 0.35);
        add('towel', cx, y0 + 0.06);
      }
      if (r.type === 'wc') { add(r.d > 1.2 ? 'toilet' : 'toilet', cx, y1 - 0.4); }
      if (r.type === 'kitchen') { add('kitchenSink', x0 + 0.35, y1 - 0.3); add('dishW', x0 + 1.0, y1 - 0.3); }
      if (r.type === 'boiler') { add('collector', x0 + 0.3, y1 - 0.06); add('boiler', x0 + 1.0, y1 - 0.25); }
    }
  }
  // нет санузла со стояком, но есть вода — ставим стояк в угол кухни / мокрой комнаты
  if (pl && !out.some((x) => x.type === 'riser') && out.some((x) => POINT_TYPES[x.type].sys === 'pl')) {
    const r = p.rooms.find((q) => q.type === 'kitchen' || ROOM_TYPES[q.type].wet) || p.rooms[0];
    if (r) add('riser', r.x + 0.12, r.y + r.d - 0.12);
  }
  return out;
}

export const MEP_DEFAULT: MepParams = (() => {
  const pr = MEP_PRESETS[2];
  const p: MepParams = { kind: 'mep', h: 2.7, rooms: pr.rooms, points: [], walls: 'concrete', wiring: 'hidden', pipes: 'ppr', scheme: 'tee', object: pr.object };
  return { ...p, points: autoPlace(p).map((x, i) => ({ ...x, id: `d${i}` })) };
})();

// ---------- трассы ----------
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

  // ---------- электрика: группы и трассы ----------
  const panelPt = pts.find((x) => x.type === 'panel');
  const elPts = pts.filter((x) => POINT_TYPES[x.type].sys === 'el' && x.type !== 'panel');
  type Group = { name: string; amp: number; cable: string; rcd: boolean; pts: MepPoint[]; len: number; kind: Member['kind'] };
  const groups: Group[] = [];
  if (elPts.length && !panelPt) warnings.push('Поставьте электрощит — от него считаются трассы кабеля');
  if (panelPt) {
    const room = (pt: MepPoint) => roomAt(p.rooms, pt.x, pt.y);
    const lights = elPts.filter((x) => POINT_TYPES[x.type].cat === 'Свет');
    for (let i = 0; i < lights.length; i += 14) groups.push({ name: `Освещение${lights.length > 14 ? ` ${i / 14 + 1}` : ''}`, amp: 10, cable: '3×1,5', rcd: false, pts: lights.slice(i, i + 14), len: 0, kind: 'wireL' });
    const sockets = elPts.filter((x) => POINT_TYPES[x.type].cat === 'Розетки');
    const byRoom = new Map<string, MepPoint[]>();
    for (const s of sockets) { const r = room(s); const key = r ? r.id : '—'; byRoom.set(key, [...(byRoom.get(key) || []), s]); }
    // кухня, мокрые зоны — отдельно; остальные комнаты по 2 в группу
    const plain: MepPoint[][] = [];
    for (const [rid, list] of byRoom) {
      const r = p.rooms.find((x) => x.id === rid);
      if (r && (r.type === 'kitchen' || ROOM_TYPES[r.type].wet)) groups.push({ name: `Розетки: ${r.name}`, amp: 16, cable: '3×2,5', rcd: true, pts: list, len: 0, kind: 'wireS' });
      else plain.push(list);
    }
    for (let i = 0; i < plain.length; i += 2) {
      const list = plain.slice(i, i + 2).flat();
      const names = [...new Set(list.map((s) => room(s)?.name).filter(Boolean))].join(', ');
      groups.push({ name: `Розетки: ${names || 'комнаты'}`, amp: 16, cable: '3×2,5', rcd: true, pts: list, len: 0, kind: 'wireS' });
    }
    for (const s of elPts.filter((x) => POINT_TYPES[x.type].own)) {
      const T = POINT_TYPES[s.type];
      groups.push({ name: T.label.replace(' (розетка)', ''), amp: T.amp || 16, cable: T.cable || '3×2,5', rcd: !!T.rcd, pts: [s], len: 0, kind: 'wireP' });
    }
    const nets = elPts.filter((x) => POINT_TYPES[x.type].cat === 'Слаботочка');
    if (nets.length) groups.push({ name: 'Интернет и ТВ', amp: 0, cable: 'UTP 5e', rcd: false, pts: nets, len: 0, kind: 'wireN' });

    const src: Node = { id: panelPt.id, x: panelPt.x, y: panelPt.y, z: zOf(panelPt) };
    groups.forEach((g, gi) => {
      const nodes: Node[] = g.pts.map((x) => ({ id: x.id, x: x.x, y: x.y, z: zOf(x), t: x.type }));
      const star = g.kind === 'wireN';
      const off = 0.05 + (gi % 6) * 0.03; // разносим трассы групп, чтобы не сливались
      for (const e of tree(src, nodes, star)) {
        const zc = ceilZ - off;
        const A: V3 = [e.a.x, e.a.y, e.a.z], B: V3 = [e.b.x, e.b.y, e.b.z];
        const a1: V3 = [e.a.x, e.a.y, zc], m: V3 = [e.b.x, e.a.y, zc], b1: V3 = [e.b.x, e.b.y, zc];
        const segs: [V3, V3][] = [[A, a1], [a1, m], [m, b1], [b1, B]];
        for (const [u, v] of segs) {
          const L = Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) + Math.abs(u[2] - v[2]);
          if (L < 0.01) continue;
          members.push({ kind: g.kind, profile: g.kind === 'wireP' ? '40×40×0' : '30×30×0', a: u, b: v, grp: g.name });
          g.len += L;
        }
      }
      g.len = Math.round(g.len * 1.15 + 1); // +15% запас и подключение
    });
  }
  const cableBy = new Map<string, number>();
  for (const g of groups) cableBy.set(g.cable, (cableBy.get(g.cable) || 0) + g.len);

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
  const boxes = cnt('socket', 'socket2', 'socketK', 'socketWet', 'switch', 'net', 'stove', 'oven', 'washer', 'dish', 'boilerEl', 'ac', 'floorHeat');
  const totalCable = [...cableBy.values()].reduce((a, v) => a + v, 0);
  if (panelPt && groups.length) {
    const hidden = p.wiring === 'hidden';
    if (hidden && p.walls !== 'gkl' && p.walls !== 'wood') b.work('Штробление стен под кабель', Math.round(totalCable * 0.45));
    if (hidden) b.work(p.walls === 'gkl' ? 'Монтаж подрозетника в ГКЛ' : 'Монтаж подрозетника в бетон', boxes);
    b.work(hidden ? 'Прокладка кабеля' : 'Прокладка кабеля в гофре по стене', Math.round(totalCable));
    b.work('Монтаж розетки/выключателя', boxes);
    b.work('Монтаж распределительной коробки', p.rooms.filter((r) => pts.some((x) => POINT_TYPES[x.type].sys === 'el' && roomAt([r], x.x, x.y))).length);
    b.work('Монтаж люстры', cnt('light'));
    b.work('Монтаж точечного светильника', cnt('spot'));
    if (cnt('stove')) b.work('Подключение электроплиты', cnt('stove'));
    const breakers = groups.filter((g) => g.amp > 0);
    const rcd = breakers.filter((g) => g.rcd).length, plain = breakers.length - rcd;
    const modules = plain + rcd * 2 + 4; // + вводной автомат, реле напряжения
    b.work('Сборка электрощита (до 12 модулей)', Math.max(1, Math.ceil(modules / 12)));
    b.work('Монтаж автомата в щит', plain + 1);
    b.work('Монтаж УЗО/дифавтомата', rcd);
    // материалы
    const CABLE: Record<string, [string, number]> = { '3×1,5': ['Кабель ВВГнг-LS 3×1,5', 75], '3×2,5': ['Кабель ВВГнг-LS 3×2,5', 115], '3×6': ['Кабель ВВГнг-LS 3×6', 290], 'UTP 5e': ['Кабель UTP 5e', 35] };
    for (const [c, len] of cableBy) if (CABLE[c]) b.mat(CABLE[c][0], Math.ceil(len), 'м', CABLE[c][1]);
    if (!hidden) b.mat('Гофра / кабель-канал', Math.ceil(totalCable), 'м', 40);
    if (hidden) b.mat('Подрозетник', boxes, 'шт', 25);
    b.mat('Розетка (механизм + рамка)', cnt('socket', 'socket2', 'socketK', 'stove', 'oven', 'washer', 'dish', 'boilerEl', 'ac'), 'шт', 380);
    b.mat('Розетка влагозащищённая IP44', cnt('socketWet'), 'шт', 650);
    b.mat('Выключатель (механизм + рамка)', cnt('switch'), 'шт', 380);
    b.mat('Розетка интернет / ТВ', cnt('net'), 'шт', 450);
    b.mat('Распаечная коробка с клеммами', p.rooms.length, 'шт', 180);
    b.mat(`Щит на ${Math.ceil(modules / 12) * 12} модулей`, 1, 'шт', 1800 + Math.ceil(modules / 12) * 1200);
    b.mat('Автоматический выключатель', plain + 1, 'шт', 450);
    b.mat('Дифавтомат 30 мА', rcd, 'шт', 2600);
    b.mat('Реле напряжения', 1, 'шт', 2500);
    b.sum('Кабель всего', Math.round(totalCable), 'м').sum('Групп в щите', breakers.length, 'шт');
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
  const L = Math.max(1, Math.max(...xs, 1) - Math.min(...xs, 0)), Wd = Math.max(1, Math.max(...ys, 1) - Math.min(...ys, 0));
  const summary = [
    { label: 'Площадь', value: Math.round(area * 10) / 10, unit: 'м²' },
    { label: 'Электроточек', value: elPts.length, unit: 'шт' },
    { label: 'Групп в щите', value: groups.filter((g) => g.amp > 0).length, unit: 'шт' },
    { label: 'Кабель', value: Math.round(totalCable), unit: 'м' },
    { label: 'Сантехприборов', value: fixtures.length, unit: 'шт' },
    { label: 'Трубы вода + канализация', value: Math.round(pipeLen.cold + pipeLen.hot + pipeLen.s50 + pipeLen.s110), unit: 'м' },
  ];
  return {
    mep: true as const,
    params: { ...p, h, L, W: Wd, frame: 'steel' as const, base: 'none' as const, cover: 'none' as const, color: 'RAL 9003', slabT: 0, eps: 0, overhang: 0 },
    members, panels, steel: [] as any[], lines: b.lines, summary, warnings, openings: [] as any[], groups, cableBy: Object.fromEntries(cableBy), pipeLen,
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
  for (const g of r.groups) rows.push([`Гр. ${r.groups.indexOf(g) + 1}: ${g.name}`, `${g.amp ? `${g.rcd ? 'дифавтомат' : 'автомат'} ${g.amp} А, ` : ''}кабель ${g.cable}, ${g.len} м, точек ${g.pts.length}`]);
  if (r.pipeLen.cold || r.pipeLen.s50) {
    rows.push(['Водопровод', `${p.pipes === 'pex' ? 'PEX 16' : 'PPR 20'}, ${p.scheme === 'collector' ? 'коллекторная разводка' : 'тройниковая разводка'}: ХВС ${r.pipeLen.cold} м, ГВС ${r.pipeLen.hot} м`]);
    rows.push(['Канализация', `Ø50 — ${r.pipeLen.s50} м, Ø110 — ${r.pipeLen.s110} м`]);
  }
  return rows;
}
