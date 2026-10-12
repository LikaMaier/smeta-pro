/**
 * План участка (благоустройство): дом и постройки, септик, газгольдер, колодец/скважина, парковка, дорожки,
 * деревья и грядки на участке L×W. Проверяет расстояния по нормам (ориентировочно), строит 3D и смету
 * на инженерку и благоустройство: септик с трубой до дома, газгольдер с газопроводом, скважину с водопроводом,
 * парковку, дорожки, газон, посадку деревьев.
 */
import type { Member, Panel, V3 } from './canopy';
import { Builder } from '../masters';

export type SiteObjType = 'house' | 'bath' | 'garage' | 'shed' | 'greenhouse' | 'septic' | 'gasholder' | 'well' | 'borehole' | 'parking' | 'path' | 'terrace' | 'beds' | 'tree' | 'compost' | 'wc';
export interface SiteObj { id: string; type: SiteObjType; x: number; y: number; w: number; d: number; opt?: Record<string, any> }

export interface SiteParams {
  kind: 'site';
  L: number; W: number;       // ширина по улице (X) и глубина (Y), м; улица — сторона y = 0
  objs: SiteObj[];
  fence: boolean;             // показать забор по границе
  gateX: number;              // въезд с улицы: от левого угла, м
  lawn: 'none' | 'seed' | 'roll';
  color: string;
}

export const SITE_TYPES: Record<SiteObjType, { label: string; icon: string; w: number; d: number; group: 'build' | 'eng' | 'yard' }> = {
  house: { label: 'Дом', icon: '🏠', w: 9, d: 9, group: 'build' },
  bath: { label: 'Баня', icon: '♨️', w: 4, d: 4, group: 'build' },
  garage: { label: 'Гараж / навес', icon: '🚗', w: 6, d: 6, group: 'build' },
  shed: { label: 'Хозблок', icon: '🛖', w: 3, d: 4, group: 'build' },
  greenhouse: { label: 'Теплица', icon: '🌱', w: 3, d: 6, group: 'build' },
  septic: { label: 'Септик', icon: '♻️', w: 1.8, d: 1.8, group: 'eng' },
  gasholder: { label: 'Газгольдер', icon: '🔥', w: 3.2, d: 1.2, group: 'eng' },
  well: { label: 'Колодец', icon: '🪣', w: 1.2, d: 1.2, group: 'eng' },
  borehole: { label: 'Скважина', icon: '💧', w: 1.2, d: 1.2, group: 'eng' },
  parking: { label: 'Парковка', icon: '🅿️', w: 6, d: 5, group: 'yard' },
  path: { label: 'Дорожка', icon: '🛤', w: 1.2, d: 6, group: 'yard' },
  terrace: { label: 'Терраса', icon: '🪵', w: 4, d: 3, group: 'yard' },
  beds: { label: 'Грядка', icon: '🥕', w: 1, d: 4, group: 'yard' },
  tree: { label: 'Дерево', icon: '🌳', w: 2.5, d: 2.5, group: 'yard' },
  compost: { label: 'Компост', icon: '🍂', w: 1, d: 2, group: 'yard' },
  wc: { label: 'Уличный туалет', icon: '🚻', w: 1.2, d: 1.2, group: 'yard' },
};

/** Опции объектов по умолчанию */
export const SITE_OPT_DEFAULT: Partial<Record<SiteObjType, Record<string, any>>> = {
  septic: { sys: 'station', users: 5 },       // station — станция биоочистки, plastic — пластиковый септик, rings — кольца
  gasholder: { vol: 4850 },
  borehole: { depth: 40, rock: 'lime' },       // lime — на известняк, sand — на песок
  well: { rings: 10 },
  parking: { surf: 'paving' },                 // paving — плитка, gravel — щебень
  path: { surf: 'paving' },
  tree: { size: 'mid' },                       // tall — высокорослое, mid — среднерослое, shrub — кустарник
  house: { floors: 2 },
};
export const GAS_VOLS = [2700, 4850, 6400, 9100];
const GAS_PRICE: Record<number, number> = { 2700: 260000, 4850: 380000, 6400: 470000, 9100: 620000 };
const GAS_SIZE: Record<number, [number, number]> = { 2700: [2.9, 1.0], 4850: [3.2, 1.25], 6400: [3.9, 1.3], 9100: [4.3, 1.6] };
export const gasSize = (vol: number) => GAS_SIZE[vol] || GAS_SIZE[4850];

let seq = 0;
export const newObjId = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`;
const o = (type: SiteObjType, x: number, y: number, extra: Partial<SiteObj> = {}): SiteObj => ({ id: `${type}${x}${y}`.replace(/\./g, ''), type, x, y, w: SITE_TYPES[type].w, d: SITE_TYPES[type].d, opt: { ...(SITE_OPT_DEFAULT[type] || {}) }, ...extra });

/** Типовые участки: расставлено с учётом расстояний */
export const SITE_PRESETS: { id: string; label: string; title: string; p: SiteParams }[] = [
  {
    id: 's6', label: '6 соток 20×30', title: 'Участок 6 соток: дом, септик, газгольдер, скважина',
    p: { kind: 'site', L: 20, W: 30, fence: true, gateX: 1.5, lawn: 'seed', color: 'RAL 8017', objs: [
      o('house', 9.5, 12), o('parking', 4.5, 3.5), o('path', 9.5, 3.75, { w: 1.2, d: 7.5 }), o('septic', 18, 1.9),
      o('gasholder', 16.4, 27.3), o('bath', 3.5, 27), o('borehole', 1.5, 18), o('tree', 17, 13), o('tree', 17, 19),
      o('beds', 13.5, 21), o('beds', 15.5, 21), o('greenhouse', 7.5, 22, { w: 6, d: 3 }),
    ] },
  },
  {
    id: 's10', label: '10 соток 25×40', title: 'Участок 10 соток: дом, баня, гараж, септик, газгольдер',
    p: { kind: 'site', L: 25, W: 40, fence: true, gateX: 2, lawn: 'seed', color: 'RAL 6005', objs: [
      o('house', 12.5, 13, { w: 10, d: 10 }), o('garage', 5, 5, { w: 6, d: 6 }), o('parking', 5, 12, { w: 6, d: 4 }), o('path', 12.5, 4, { w: 1.2, d: 8 }),
      o('septic', 21.5, 2.5), o('gasholder', 20.5, 34.5), o('bath', 4, 35), o('borehole', 3, 22), o('terrace', 12.5, 20, { w: 6, d: 2.5 }),
      o('tree', 21, 15), o('tree', 21, 22), o('tree', 12, 31, { opt: { size: 'tall' } }), o('beds', 10, 37, { w: 1, d: 3 }), o('beds', 12, 37, { w: 1, d: 3 }),
    ] },
  },
  {
    id: 's15', label: '15 соток 30×50', title: 'Участок 15 соток: дом, баня, гараж, колодец, станция биоочистки',
    p: { kind: 'site', L: 30, W: 50, fence: true, gateX: 3, lawn: 'roll', color: 'RAL 7024', objs: [
      o('house', 15, 15, { w: 12, d: 10 }), o('garage', 5, 6, { w: 7, d: 6 }), o('parking', 5, 13.5, { w: 7, d: 4 }), o('path', 15, 5, { w: 1.5, d: 10 }),
      o('septic', 26, 2.5), o('gasholder', 25, 44), o('bath', 5, 44, { w: 5, d: 5 }), o('well', 6, 30), o('terrace', 15, 22.5, { w: 8, d: 3 }),
      o('tree', 26, 18, { opt: { size: 'tall' } }), o('tree', 26, 27), o('tree', 15, 37), o('greenhouse', 14, 45, { w: 6, d: 3 }), o('compost', 28, 47),
    ] },
  },
];
export const SITE_DEFAULT = SITE_PRESETS[0].p;

// ---------- расстояния ----------
const rect = (b: SiteObj) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, y0: b.y - b.d / 2, y1: b.y + b.d / 2 });
/** кратчайшее расстояние между прямоугольниками (0 — касаются/пересекаются) и точки на них */
export function gap(a: SiteObj, b: SiteObj) {
  const A = a.type === 'tree' ? { x0: a.x, x1: a.x, y0: a.y, y1: a.y } : rect(a);
  const B = b.type === 'tree' ? { x0: b.x, x1: b.x, y0: b.y, y1: b.y } : rect(b);
  const dx = Math.max(0, B.x0 - A.x1, A.x0 - B.x1), dy = Math.max(0, B.y0 - A.y1, A.y0 - B.y1);
  const px = (lo1: number, hi1: number, lo2: number, hi2: number) => (hi1 < lo2 ? [hi1, lo2] : hi2 < lo1 ? [lo1, hi2] : [(Math.max(lo1, lo2) + Math.min(hi1, hi2)) / 2, (Math.max(lo1, lo2) + Math.min(hi1, hi2)) / 2]);
  const [ax, bx] = px(A.x0, A.x1, B.x0, B.x1), [ay, by] = px(A.y0, A.y1, B.y0, B.y1);
  return { d: Math.hypot(dx, dy), a: [ax, ay] as [number, number], b: [bx, by] as [number, number] };
}
const toBorder = (a: SiteObj, L: number, W: number) => {
  const R = a.type === 'tree' ? { x0: a.x, x1: a.x, y0: a.y, y1: a.y } : rect(a);
  const c = [{ d: R.x0, a: [R.x0, a.y], b: [0, a.y] }, { d: L - R.x1, a: [R.x1, a.y], b: [L, a.y] }, { d: R.y0, a: [a.x, R.y0], b: [a.x, 0] }, { d: W - R.y1, a: [a.x, R.y1], b: [a.x, W] }];
  return c.reduce((m, x) => (x.d < m.d ? x : m)) as { d: number; a: [number, number]; b: [number, number] };
};

const BUILDINGS: SiteObjType[] = ['house', 'bath', 'garage', 'shed', 'greenhouse'];
const WATER: SiteObjType[] = ['well', 'borehole'];
const BORDER_MIN: Partial<Record<SiteObjType, number>> = { house: 3, bath: 1, garage: 1, shed: 1, greenhouse: 1, septic: 1, gasholder: 2, wc: 1, compost: 1 };
const TREE_BORDER: Record<string, number> = { tall: 4, mid: 2, shrub: 1 };

interface Rule { a: SiteObjType[]; b: SiteObjType[]; min: (A: SiteObj, B: SiteObj) => number; why: string; soft?: boolean }
const RULES: Rule[] = [
  { a: ['house'], b: ['bath', 'wc', 'compost'], min: () => 8, why: 'СП 53.13330.2019, п. 6.8' },
  { a: WATER, b: ['wc', 'compost'], min: () => 8, why: 'СП 53.13330.2019, п. 6.8' },
  { a: ['septic'], b: ['house'], min: () => 5, why: 'СП 32.13330: от очистных до фундамента' },
  { a: ['septic'], b: WATER, min: (A) => (A.opt?.sys === 'station' ? 20 : 50), why: 'санитарная зона источника воды: станция без фильтрации в грунт — от 20 м, септик с фильтрацией — от 50 м' },
  { a: ['septic'], b: ['tree'], min: () => 3, why: 'корни деревьев', soft: true },
  { a: ['gasholder'], b: ['house'], min: (A) => ((A.opt?.vol || 0) > 10000 ? 15 : 10), why: 'СП 62.13330: подземный резервуар СУГ до 10 м³ — от 10 м до жилого дома' },
  { a: ['gasholder'], b: ['bath', 'garage', 'shed', 'greenhouse'], min: () => 5, why: 'газгольдер — хозпостройки', soft: true },
  { a: ['gasholder'], b: WATER, min: () => 15, why: 'газгольдер — колодцы и скважины' },
  { a: ['gasholder'], b: ['septic'], min: () => 5, why: 'газгольдер — подземные сооружения' },
  { a: ['gasholder'], b: ['tree'], min: () => 5, why: 'корни деревьев у резервуара', soft: true },
];

export interface SiteCheck { label: string; d: number; min: number; ok: boolean; soft?: boolean; why: string; a: [number, number]; b: [number, number] }

export function siteChecks(p: SiteParams): SiteCheck[] {
  const out: SiteCheck[] = [];
  const name = (x: SiteObj) => SITE_TYPES[x.type].label;
  for (const r of RULES) {
    for (const A of p.objs.filter((x) => r.a.includes(x.type))) {
      // для каждого вида «B» — ближайший объект
      for (const tb of r.b) {
        const Bs = p.objs.filter((x) => x.type === tb && x.id !== A.id);
        if (!Bs.length) continue;
        const near = Bs.map((B) => ({ B, g: gap(A, B) })).reduce((m, x) => (x.g.d < m.g.d ? x : m));
        const min = r.min(A, near.B);
        out.push({ label: `${name(A)} — ${name(near.B).toLowerCase()}`, d: Math.round(near.g.d * 10) / 10, min, ok: near.g.d + 1e-6 >= min, soft: r.soft, why: r.why, a: near.g.a, b: near.g.b });
      }
    }
  }
  for (const A of p.objs) {
    const min = A.type === 'tree' ? TREE_BORDER[A.opt?.size || 'mid'] : BORDER_MIN[A.type];
    if (!min) continue;
    const g = toBorder(A, p.L, p.W);
    out.push({ label: `${SITE_TYPES[A.type].label} — граница участка`, d: Math.round(g.d * 10) / 10, min, ok: g.d + 1e-6 >= min, soft: A.type !== 'house' && A.type !== 'gasholder', why: A.type === 'gasholder' ? 'газгольдер — соседний участок' : A.type === 'tree' ? 'СП 53.13330.2019, п. 6.7: деревья' : 'СП 53.13330.2019, п. 6.7', a: g.a, b: g.b });
  }
  // пересечения
  for (let i = 0; i < p.objs.length; i++) for (let j = i + 1; j < p.objs.length; j++) {
    const A = p.objs[i], B = p.objs[j];
    if (A.type === 'tree' || B.type === 'tree' || ['path', 'parking', 'terrace'].includes(A.type) || ['path', 'parking', 'terrace'].includes(B.type)) continue;
    const ra = rect(A), rb = rect(B);
    if (ra.x0 < rb.x1 - 0.01 && rb.x0 < ra.x1 - 0.01 && ra.y0 < rb.y1 - 0.01 && rb.y0 < ra.y1 - 0.01) out.push({ label: `${SITE_TYPES[A.type].label} и ${SITE_TYPES[B.type].label.toLowerCase()} пересекаются`, d: 0, min: 0.01, ok: false, why: 'объекты накладываются друг на друга', a: [A.x, A.y], b: [B.x, B.y] });
  }
  for (const A of p.objs) {
    const R = rect(A);
    if (R.x0 < -0.01 || R.y0 < -0.01 || R.x1 > p.L + 0.01 || R.y1 > p.W + 0.01) out.push({ label: `${SITE_TYPES[A.type].label} за границей участка`, d: 0, min: 0.01, ok: false, why: 'объект выходит за участок', a: [A.x, A.y], b: [A.x, A.y] });
  }
  return out;
}

// ---------- 3D, смета ----------
export function buildSite(p0: Partial<SiteParams>) {
  const p: SiteParams = { ...SITE_DEFAULT, ...p0, objs: (p0.objs || SITE_DEFAULT.objs).map((x) => ({ ...x, opt: { ...(SITE_OPT_DEFAULT[x.type] || {}), ...(x.opt || {}) } })) };
  const L = Math.max(5, Math.min(300, p.L)), W = Math.max(5, Math.min(300, p.W));
  p.L = L; p.W = W;
  const members: Member[] = [];
  const panels: Panel[] = [];
  const box = (kind: Panel['kind'], x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, top: Panel['kind'] = kind) => {
    panels.push({ kind, pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] });
    panels.push({ kind, pts: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] });
    panels.push({ kind, pts: [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]] });
    panels.push({ kind, pts: [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]] });
    panels.push({ kind: top, pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] });
  };
  /** коробка с двускатной крышей (конёк вдоль длинной стороны) */
  const building = (b: SiteObj, hw: number, rise: number, wall: Panel['kind'], roof: Panel['kind']) => {
    const { x0, x1, y0, y1 } = rect(b);
    for (const q of [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]] as [number, number][][])
      panels.push({ kind: wall, pts: [[q[0][0], q[0][1], 0], [q[1][0], q[1][1], 0], [q[1][0], q[1][1], hw], [q[0][0], q[0][1], hw]] });
    const ov = 0.4, alongX = b.w >= b.d;
    if (alongX) {
      const yc = (y0 + y1) / 2;
      panels.push({ kind: roof, pts: [[x0 - ov, y0 - ov, hw - 0.1], [x1 + ov, y0 - ov, hw - 0.1], [x1 + ov, yc, hw + rise], [x0 - ov, yc, hw + rise]] });
      panels.push({ kind: roof, pts: [[x1 + ov, y1 + ov, hw - 0.1], [x0 - ov, y1 + ov, hw - 0.1], [x0 - ov, yc, hw + rise], [x1 + ov, yc, hw + rise]] });
      panels.push({ kind: wall, pts: [[x0, y0, hw], [x0, y1, hw], [x0, yc, hw + rise - 0.05], [x0, yc, hw + rise - 0.05]] });
      panels.push({ kind: wall, pts: [[x1, y1, hw], [x1, y0, hw], [x1, yc, hw + rise - 0.05], [x1, yc, hw + rise - 0.05]] });
    } else {
      const xc = (x0 + x1) / 2;
      panels.push({ kind: roof, pts: [[x0 - ov, y1 + ov, hw - 0.1], [x0 - ov, y0 - ov, hw - 0.1], [xc, y0 - ov, hw + rise], [xc, y1 + ov, hw + rise]] });
      panels.push({ kind: roof, pts: [[x1 + ov, y0 - ov, hw - 0.1], [x1 + ov, y1 + ov, hw - 0.1], [xc, y1 + ov, hw + rise], [xc, y0 - ov, hw + rise]] });
      panels.push({ kind: wall, pts: [[x1, y0, hw], [x0, y0, hw], [xc, y0, hw + rise - 0.05], [xc, y0, hw + rise - 0.05]] });
      panels.push({ kind: wall, pts: [[x0, y1, hw], [x1, y1, hw], [xc, y1, hw + rise - 0.05], [xc, y1, hw + rise - 0.05]] });
    }
  };

  panels.push({ kind: 'grass', pts: [[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]] });
  // мощёное — первым (лежит на земле)
  for (const b of p.objs) {
    const { x0, x1, y0, y1 } = rect(b);
    if (b.type === 'parking' || b.type === 'path') panels.push({ kind: b.opt?.surf === 'gravel' ? 'gravel' : 'paving', pts: [[x0, y0, 0.02], [x1, y0, 0.02], [x1, y1, 0.02], [x0, y1, 0.02]] });
  }
  for (const b of p.objs) {
    const { x0, x1, y0, y1 } = rect(b);
    const span = Math.min(b.w, b.d);
    switch (b.type) {
      case 'house': building(b, (b.opt?.floors || 2) >= 2 ? 5.6 : 3, span * 0.32, 'wall', 'roof'); break;
      case 'bath': building(b, 2.6, span * 0.3, 'plank', 'roof'); break;
      case 'garage': building(b, 2.8, span * 0.22, 'prof', 'roof'); break;
      case 'shed': building(b, 2.4, span * 0.2, 'plank', 'roof'); break;
      case 'greenhouse': building(b, 1.8, span * 0.35, 'poly', 'poly'); break;
      case 'wc': building(b, 2.1, 0.4, 'plank', 'roof'); break;
      case 'terrace': panels.push({ kind: 'deck', pts: [[x0, y0, 0.3], [x1, y0, 0.3], [x1, y1, 0.3], [x0, y1, 0.3]] }); break;
      case 'beds': box('soil', x0, y0, x1, y1, 0, 0.22); break;
      case 'compost': box('plank', x0, y0, x1, y1, 0, 0.8, 'soil'); break;
      case 'septic': {
        // люки над корпусом
        const c = Math.min(0.5, span / 3);
        box('lid', b.x - c, b.y - c, b.x + c, b.y + c, 0, 0.25);
        panels.push({ kind: 'soil', pts: [[x0, y0, 0.01], [x1, y0, 0.01], [x1, y1, 0.01], [x0, y1, 0.01]] });
        break;
      }
      case 'gasholder': {
        panels.push({ kind: 'soil', pts: [[x0, y0, 0.01], [x1, y0, 0.01], [x1, y1, 0.01], [x0, y1, 0.01]] });
        box('lid', b.x - 0.35, b.y - 0.35, b.x + 0.35, b.y + 0.35, 0, 0.6); // горловина с крышкой
        break;
      }
      case 'well': {
        box('concrete', x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, 0, 0.8);
        members.push({ kind: 'post', profile: '80×80×3', a: [x0 + 0.05, b.y, 0.8], b: [x0 + 0.05, b.y, 1.9] }, { kind: 'post', profile: '80×80×3', a: [x1 - 0.05, b.y, 0.8], b: [x1 - 0.05, b.y, 1.9] });
        const ov = 0.2;
        panels.push({ kind: 'roof', pts: [[x0 - ov, y0 - ov, 1.6], [x1 + ov, y0 - ov, 1.6], [x1 + ov, b.y, 2.1], [x0 - ov, b.y, 2.1]] }, { kind: 'roof', pts: [[x1 + ov, y1 + ov, 1.6], [x0 - ov, y1 + ov, 1.6], [x0 - ov, b.y, 2.1], [x1 + ov, b.y, 2.1]] });
        break;
      }
      case 'borehole': box('lid', x0 + 0.2, y0 + 0.2, x1 - 0.2, y1 - 0.2, 0, 0.15); break;
      case 'tree': {
        const H = b.opt?.size === 'tall' ? 7 : b.opt?.size === 'shrub' ? 1.5 : 4.5, R = Math.max(0.5, b.w / 2);
        if (b.opt?.size !== 'shrub') members.push({ kind: 'trunk', profile: '200×200×0', a: [b.x, b.y, 0], b: [b.x, b.y, H * 0.45] });
        box('tree', b.x - R, b.y - R, b.x + R, b.y + R, b.opt?.size === 'shrub' ? 0 : H * 0.4, H);
        break;
      }
    }
  }
  // забор по границе (лёгкая сетка, чтобы не закрывать участок) и ворота
  if (p.fence) {
    const g0 = Math.max(0.3, Math.min(L - 4.3, p.gateX)), g1 = g0 + 4;
    const sideRun = (pts: [number, number][]) => { for (let i = 0; i < pts.length - 1; i++) panels.push({ kind: 'mesh', pts: [[pts[i][0], pts[i][1], 0], [pts[i + 1][0], pts[i + 1][1], 0], [pts[i + 1][0], pts[i + 1][1], 1.8], [pts[i][0], pts[i][1], 1.8]] }); };
    sideRun([[0, 0], [g0, 0]]); sideRun([[g1, 0], [L, 0]]); sideRun([[L, 0], [L, W]]); sideRun([[L, W], [0, W]]); sideRun([[0, W], [0, 0]]);
    for (const [x, y] of [[0, 0], [L, 0], [L, W], [0, W], [g0, 0], [g1, 0]]) members.push({ kind: 'post', profile: '80×80×3', a: [x, y, 0], b: [x, y, 1.9] });
  }

  // ---------- смета ----------
  const by = (t: SiteObjType) => p.objs.filter((x) => x.type === t);
  const house = by('house')[0];
  const toHouse = (x: SiteObj) => (house ? Math.max(1, gap(x, house).d + 1) : 10); // + ввод в дом
  const b = new Builder('Канализация');
  for (const s of by('septic')) {
    const users = s.opt?.users || 5;
    if (s.opt?.sys === 'rings') {
      b.work('Монтаж септика из бетонных колец', 1);
      b.mat('Кольцо ж/б КС 15-9 (септик, 2 камеры по 3 кольца)', 6, 'шт', 6500);
      b.mat('Крышка и днище колодца КС 15', 4, 'шт', 5500);
    } else if (s.opt?.sys === 'plastic') {
      b.work('Монтаж пластикового септика', 1);
      b.mat(`Септик пластиковый на ${users} чел.`, 1, 'шт', 55000 + users * 6000);
      b.work('Монтаж дренажного (фильтрационного) поля', 12);
    } else {
      b.work('Монтаж станции биоочистки (Топас и аналоги)', 1);
      b.mat(`Станция биоочистки на ${users} чел.`, 1, 'шт', 85000 + users * 7000);
      b.work('Прокладка кабеля в земле (с траншеей)', toHouse(s));
      b.mat('Кабель ВВГнг 3×1,5 в гофре', toHouse(s) * 1.1, 'пог. м', 140);
    }
    const len = toHouse(s);
    b.work('Прокладка наружной канализации (с траншеей)', len);
    b.mat('Труба канализационная наружная 110 мм', Math.ceil(len * 1.05), 'пог. м', 450);
    if (len > 15) b.work('Установка ревизионного колодца', Math.floor(len / 15));
    b.sum('Труба канализации до дома', len, 'м');
  }
  b.sec('Газоснабжение');
  for (const g of by('gasholder')) {
    const vol = g.opt?.vol || 4850;
    b.mat(`Газгольдер подземный ${vol} л`, 1, 'шт', GAS_PRICE[vol] || 380000);
    b.work('Монтаж газгольдера под ключ', 1);
    const len = toHouse(g);
    b.work('Прокладка газопровода от газгольдера', len);
    b.sum('Газопровод до дома', len, 'м');
  }
  b.sec('Водоснабжение');
  for (const w of by('borehole')) {
    const depth = w.opt?.depth || 40;
    b.work(w.opt?.rock === 'sand' ? 'Бурение скважины на песок' : 'Бурение скважины на известняк', depth);
    b.work('Обсадная труба (монтаж)', depth);
    b.mat('Труба обсадная НПВХ 125 мм', depth, 'пог. м', 1100);
    b.work('Обустройство скважины кессоном', 1);
    b.mat('Кессон пластиковый', 1, 'шт', 45000);
    b.work('Монтаж скважинного насоса', 1);
    b.mat('Насос скважинный', 1, 'шт', 28000);
    const len = toHouse(w);
    b.work('Прокладка водопровода от скважины (с траншеей)', len);
    b.mat('Труба ПНД 32 мм питьевая', Math.ceil(len * 1.1), 'пог. м', 90);
    b.sum('Водопровод до дома', len, 'м');
  }
  for (const w of by('well')) {
    const n = w.opt?.rings || 10;
    b.work('Копка колодца (одно кольцо)', n);
    b.work('Монтаж колодезного кольца', n);
    b.mat('Кольцо колодезное КС 10-9', n, 'шт', 3500);
    b.work('Глиняный замок колодца', 1);
    b.work('Монтаж домика на колодец', 1);
    b.mat('Домик для колодца', 1, 'шт', 16000);
  }
  b.sec('Благоустройство');
  const paved = (t: SiteObjType) => by(t).filter((x) => x.opt?.surf !== 'gravel');
  const gravel = (t: SiteObjType) => by(t).filter((x) => x.opt?.surf === 'gravel');
  const area = (xs: SiteObj[]) => xs.reduce((a, x) => a + x.w * x.d, 0);
  const perim = (xs: SiteObj[]) => xs.reduce((a, x) => a + 2 * (x.w + x.d), 0);
  const tileA = area([...paved('parking'), ...paved('path')]);
  if (tileA) {
    b.work('Укладка тротуарной плитки (с основанием)', tileA);
    b.mat('Плитка тротуарная 60 мм', tileA * 1.05, 'м²', 850);
    b.mat('Щебень фр. 20–40 (основание 150 мм)', tileA * 0.15 * 1.1, 'м³', 2300);
    b.mat('Песок (подушка 100 мм)', tileA * 0.1 * 1.1, 'м³', 1500);
    b.work('Монтаж бордюра', perim([...paved('parking'), ...paved('path')]));
    b.mat('Бордюр садовый 1000×200×80', Math.ceil(perim([...paved('parking'), ...paved('path')])), 'шт', 450);
  }
  const grP = area(gravel('parking')), grPath = area(gravel('path'));
  if (grP) { b.work('Устройство парковки из щебня', grP); b.mat('Щебень фр. 20–40', grP * 0.25 * 1.1, 'м³', 2300); b.mat('Геотекстиль', grP * 1.1, 'м²', 45); }
  if (grPath) { b.work('Устройство дорожки из щебня', grPath); b.mat('Щебень фр. 5–20', grPath * 0.1 * 1.1, 'м³', 2500); }
  const trees = by('tree').length;
  if (trees) { b.work('Посадка деревьев', trees); b.mat('Саженец', trees, 'шт', 2500); }
  const foot = p.objs.filter((x) => x.type !== 'tree').reduce((a, x) => a + x.w * x.d, 0);
  const lawnA = Math.max(0, L * W - foot) * 0.6; // газон — на свободной части, примерно 60%
  if (p.lawn === 'seed' && lawnA > 1) { b.work('Посев газона', lawnA); b.mat('Семена газона', lawnA * 0.04, 'кг', 450); }
  if (p.lawn === 'roll' && lawnA > 1) { b.work('Укладка рулонного газона', lawnA); b.mat('Газон рулонный', lawnA * 1.05, 'м²', 320); }

  const checks = siteChecks(p);
  const bad = checks.filter((c) => !c.ok && !c.soft);
  const warnings = [
    ...bad.map((c) => c.d === 0 && c.min <= 0.01 ? `${c.label}` : `${c.label}: ${c.d} м, нужно не меньше ${c.min} м (${c.why})`),
    ...checks.filter((c) => !c.ok && c.soft).map((c) => `Желательно: ${c.label.toLowerCase()} — не меньше ${c.min} м, сейчас ${c.d} м`),
    'Расстояния — ориентировочно по СП 53.13330, СП 32.13330, СП 62.13330 и СанПиН. Перед работами сверьте с ГПЗУ, требованиями газовой службы и производителя оборудования.',
  ];
  const summary = [
    { label: 'Участок', value: Math.round(L * W) / 100, unit: 'сот.' },
    { label: 'Объектов', value: p.objs.length, unit: 'шт' },
    { label: 'Нарушений норм', value: bad.length, unit: 'шт' },
    ...b.summary,
    ...(tileA ? [{ label: 'Плитка', value: Math.round(tileA * 10) / 10, unit: 'м²' }] : []),
    ...(p.fence ? [{ label: 'Забор по границе', value: 2 * (L + W), unit: 'м' }] : []),
  ];
  return {
    site: true as const,
    params: { ...p, frame: 'steel' as const, base: 'none' as const, cover: 'tile' as const, roofColor: 'RAL 3011', slabT: 0, eps: 0, walls: {} as any, overhang: 0 },
    members, panels, steel: [] as any[], lines: b.lines, summary, warnings, checks, openings: [] as any[],
    info: { hHigh: 6, hLow: 3, wood: false, woodVol: 0, steelKg: 0 },
  };
}
export type SiteResult = ReturnType<typeof buildSite>;

export function siteParamRows(r: SiteResult): [string, string][] {
  const p = r.params;
  const rows: [string, string][] = [['Объект', 'План участка и благоустройство'], ['Участок', `${p.L} × ${p.W} м (${Math.round(p.L * p.W) / 100} сот.)`]];
  const cnt = new Map<string, number>();
  for (const x of p.objs) cnt.set(SITE_TYPES[x.type].label, (cnt.get(SITE_TYPES[x.type].label) || 0) + 1);
  rows.push(['На участке', [...cnt.entries()].map(([k, v]) => (v > 1 ? `${k.toLowerCase()} ×${v}` : k.toLowerCase())).join(', ')]);
  const sep = p.objs.find((x) => x.type === 'septic');
  if (sep) rows.push(['Канализация', sep.opt?.sys === 'rings' ? 'септик из ж/б колец' : sep.opt?.sys === 'plastic' ? `пластиковый септик на ${sep.opt?.users} чел. + фильтрационное поле` : `станция биоочистки на ${sep.opt?.users} чел.`]);
  const gas = p.objs.find((x) => x.type === 'gasholder');
  if (gas) rows.push(['Газ', `газгольдер подземный ${gas.opt?.vol} л`]);
  const bh = p.objs.find((x) => x.type === 'borehole');
  if (bh) rows.push(['Вода', `скважина ${bh.opt?.depth} м ${bh.opt?.rock === 'sand' ? 'на песок' : 'на известняк'}`]);
  const wl = p.objs.find((x) => x.type === 'well');
  if (wl && !bh) rows.push(['Вода', `колодец, ${wl.opt?.rings} колец`]);
  for (const c of r.checks.filter((c) => c.min > 0.01).slice(0, 12)) rows.push([c.label, `${c.d} м (норма ≥ ${c.min}) ${c.ok ? '✓' : c.soft ? '— желательно больше' : '✗ нарушение'}`]);
  return rows;
}
