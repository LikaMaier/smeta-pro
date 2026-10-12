/**
 * Забор и ворота в 3D: участок L×W, стороны с забором, вид полотна, столбы и способ монтажа,
 * откатные или распашные ворота и калитка на передней стороне.
 * Геометрия — для 3D и чертежей (тот же формат, что у навесов: элементы каркаса и панели),
 * материалы и работы — из мастера забора (shared/fence.ts).
 */
import type { Member, Panel, V3 } from './canopy';
import { cutStock, tubeKgPerM, tubeM2PerM } from './cut';
import { fenceEstimate, FENCE_TYPES, MOUNTS, type FenceType, type Mount } from '../fence';

export type FSide = 'front' | 'back' | 'left' | 'right';
export interface FenceParams {
  kind: 'fence';
  L: number;              // ширина участка по фасаду (ось X), м
  W: number;              // глубина участка (ось Y), м
  sides: Record<FSide, boolean>;
  type: FenceType;
  mount: Mount;
  h: number;              // высота полотна, м
  step: number;           // шаг столбов, м
  color: string;          // RAL полотна и каркаса
  gate: 'none' | 'slide' | 'swing';
  gateW: number;          // ширина проёма ворот, м
  gateAt: number;         // от левого угла до ворот, м
  slideDir: 'left' | 'right'; // куда откатываются ворота
  wicket: boolean;
  wicketAt: number;       // от левого угла до калитки, м
  automation: boolean;
  caps: boolean;
  demolish: number;       // демонтаж старого забора, м
  slope: boolean;         // участок на склоне — ступенями
}

export const FENCE_DEFAULT: FenceParams = {
  kind: 'fence', L: 20, W: 30, sides: { front: true, back: true, left: true, right: true }, type: 'profnastil', mount: 'concrete',
  h: 2, step: 2.5, color: 'RAL 8017', gate: 'slide', gateW: 4, gateAt: 3, slideDir: 'right', wicket: true, wicketAt: 1,
  automation: false, caps: true, demolish: 0, slope: false,
};

/** Виды, которые умеем показать в 3D (у остальных — похожая картинка) */
export const FENCE_3D_TYPES: FenceType[] = ['profnastil', 'euro1', 'euro2', 'mesh3d', 'gitter', 'rabica', 'jalousie', 'rancho', 'wood', 'dpk', 'polycarbonate', 'sections', 'brick', 'concrete', 'blocks', 'gabion'];
const MESHY = ['mesh3d', 'gitter', 'rabica', 'welded'];
const r2 = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const P = (s: string) => { const [a, b, t] = s.split('×').map(Number); return { a, b, t: t || 0 }; };
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface FenceOpening { kind: 'gate' | 'wicket'; a0: number; a1: number }

export function buildFence(p0: Partial<FenceParams>) {
  const p: FenceParams = { ...FENCE_DEFAULT, ...p0, sides: { ...FENCE_DEFAULT.sides, ...(p0.sides || {}) } };
  const warnings: string[] = [];
  const L = clamp(p.L, 2, 300), W = clamp(p.W, 2, 300), h = clamp(p.h, 0.5, 4);
  const t = FENCE_TYPES[p.type] ? p.type : 'profnastil';
  const step = clamp(p.step || FENCE_TYPES[t].step, 1, 4);
  const sides = p.sides;
  if (!Object.values(sides).some(Boolean)) sides.front = true;

  // ---------- проёмы на передней стороне ----------
  const openings: FenceOpening[] = [];
  const gw = p.gate === 'none' ? 0 : clamp(p.gateW, 1, 10);
  if (p.gate !== 'none' && sides.front) {
    const a0 = clamp(p.gateAt, 0.2, Math.max(0.2, L - gw - 0.2));
    openings.push({ kind: 'gate', a0, a1: a0 + gw });
  }
  if (p.wicket && sides.front) {
    let a0 = clamp(p.wicketAt, 0.2, L - 1.2);
    const g = openings[0];
    if (g && a0 < g.a1 + 0.15 && a0 + 1 > g.a0 - 0.15) { // калитка налезает на ворота — ставим рядом
      a0 = g.a0 - 1.3 >= 0.2 ? g.a0 - 1.3 : g.a1 + 0.3;
      warnings.push('Калитка пересекалась с воротами — перенесли рядом');
    }
    openings.push({ kind: 'wicket', a0, a1: a0 + 1 });
  }
  openings.sort((a, b) => a.a0 - b.a0);
  const gate = openings.find((o) => o.kind === 'gate');
  const tail = p.gate === 'slide' ? r2(gw * 0.5, 2) : 0; // противовес откатных ворот ≈ 50% проёма
  if (gate && p.gate === 'slide') {
    const free = p.slideDir === 'right' ? L - gate.a1 : gate.a0;
    if (free < gw + tail - 0.05) warnings.push(`Откатным воротам нужно ${r2(gw + tail, 1)} м свободного забора ${p.slideDir === 'right' ? 'справа' : 'слева'} от проёма, есть ${r2(free, 1)} м — поменяйте сторону отката или сдвиньте ворота`);
    const w = openings.find((o) => o.kind === 'wicket');
    if (w && (p.slideDir === 'right' ? w.a0 < gate.a1 + gw + tail && w.a1 > gate.a1 : w.a1 > gate.a0 - gw - tail && w.a0 < gate.a0)) warnings.push('Калитка в зоне отката ворот — полотно в неё упрётся. Перенесите калитку на другую сторону от ворот');
  }

  // ---------- сечения ----------
  const tall = h > 2.2;
  const postProf = MESHY.includes(t) && t !== 'rabica' && t !== 'welded' ? '60×40×2' : ['sections', 'jalousie'].includes(t) || tall ? '80×80×3' : '60×60×2';
  const gatePost = p.gate === 'swing' ? '100×100×3' : '80×80×3';
  const lagProf = '40×20×2';
  const frameProf = '60×40×2';
  const half = P(postProf).a / 2000;
  const masonry = t === 'brick' || t === 'blocks' || t === 'concrete' || t === 'gabion';
  const pillarW = t === 'brick' ? 0.38 : t === 'blocks' ? 0.39 : t === 'concrete' ? 0.14 : t === 'gabion' ? 0.5 : 0;

  // стороны: начало, направление, наружная нормаль, длина
  const SIDE: Record<FSide, { o: [number, number]; d: [number, number]; n: [number, number]; len: number }> = {
    front: { o: [0, 0], d: [1, 0], n: [0, -1], len: L },
    right: { o: [L, 0], d: [0, 1], n: [1, 0], len: W },
    back: { o: [L, W], d: [-1, 0], n: [0, 1], len: L },
    left: { o: [0, W], d: [0, -1], n: [-1, 0], len: W },
  };
  const at = (s: FSide, u: number, off: number, z: number): V3 => {
    const S = SIDE[s];
    return [r2(S.o[0] + S.d[0] * u + S.n[0] * off, 4), r2(S.o[1] + S.d[1] * u + S.n[1] * off, 4), r2(z, 4)];
  };

  const members: (Member & { spec?: boolean })[] = [];
  const panels: Panel[] = [{ kind: 'grass', pts: [[-1.5, -1.5, 0], [L + 1.5, -1.5, 0], [L + 1.5, W + 1.5, 0], [-1.5, W + 1.5, 0]] }];
  const postKeys = new Set<string>();
  const addPost = (s: FSide, u: number, prof: string, top: number, kind: Member['kind'] = 'post') => {
    const a = at(s, u, 0, 0);
    const key = `${Math.round(a[0] * 100)}:${Math.round(a[1] * 100)}`;
    if (postKeys.has(key)) return false;
    postKeys.add(key);
    members.push({ kind, profile: prof, a, b: [a[0], a[1], top] });
    return true;
  };
  const pillarKeys = new Set<string>();
  const addPillar = (s: FSide, u: number) => {
    const a = at(s, u, 0, 0);
    const key = `${Math.round(a[0] * 100)}:${Math.round(a[1] * 100)}`;
    if (pillarKeys.has(key)) return;
    pillarKeys.add(key);
    members.push({ kind: t === 'concrete' ? 'cpillar' : 'pillar', profile: `${Math.round(pillarW * 1000)}×${Math.round(pillarW * 1000)}×0`, a, b: [a[0], a[1], h + (t === 'concrete' ? 0.05 : 0.15)] });
  };
  const quad = (kind: Panel['kind'], s: FSide, u0: number, u1: number, z0: number, z1: number, off: number) => panels.push({ kind, pts: [at(s, u0, off, z0), at(s, u1, off, z0), at(s, u1, off, z1), at(s, u0, off, z1)] });
  const bar = (kind: Member['kind'], prof: string, s: FSide, u0: number, z0: number, u1: number, z1: number, off: number, spec = true) => members.push({ kind, profile: prof, a: at(s, u0, off, z0), b: at(s, u1, off, z1), spec });

  /** Полотно одного пролёта */
  const fill = (s: FSide, u0: number, u1: number) => {
    const off = half + 0.02;
    const lagZ = tall ? [0.25, h / 2, h - 0.25] : [0.25, h - 0.25];
    const lags = () => lagZ.forEach((z) => bar('rail', lagProf, s, u0, z, u1, z, half + 0.01));
    const strips = (w: number, gap: number, kind: Panel['kind'], o = off, phase = 0) => { for (let u = u0 + phase; u + w <= u1 + 1e-6; u += w + gap) quad(kind, s, u, u + w, 0.05, h, o); };
    const rows = (hh: number, gap: number, kind: Panel['kind']) => { for (let z = 0.08; z + hh <= h + 1e-6; z += hh + gap) quad(kind, s, u0, u1, z, z + hh, off); };
    switch (t) {
      case 'profnastil': case 'brick': lags(); quad('prof', s, u0, u1, 0.05, h, off); break;
      case 'euro1': lags(); strips(0.118, 0.035, 'prof'); break;
      case 'euro2': lags(); strips(0.118, 0.118, 'prof', off); strips(0.118, 0.118, 'prof', half - 0.005, 0.118); break;
      case 'mesh3d': case 'gitter': quad('mesh', s, u0, u1, 0.1, h, half); break;
      case 'rabica': case 'welded': bar('rail', '20×20×1.5', s, u0, h - 0.05, u1, h - 0.05, half); quad('mesh', s, u0, u1, 0.05, h, half); break;
      case 'jalousie': rows(0.09, 0.012, 'prof'); break;
      case 'rancho': rows(0.1, 0.03, 'prof'); break;
      case 'dpk': rows(0.15, 0.005, 'plank'); break;
      case 'wood': lags(); strips(0.1, 0.05, 'plank'); break;
      case 'polycarbonate': bar('rail', '20×20×1.5', s, u0, 0.1, u1, 0.1, half); bar('rail', '20×20×1.5', s, u0, h, u1, h, half); quad('poly', s, u0, u1, 0.1, h, half); break;
      case 'sections': {
        bar('rail', '40×20×2', s, u0, 0.15, u1, 0.15, half); bar('rail', '40×20×2', s, u0, h - 0.05, u1, h - 0.05, half);
        for (let u = u0 + 0.12; u < u1 - 0.05; u += 0.12) bar('baluster', '15×15×1.5', s, u, 0.15, u, h - 0.05, half);
        break;
      }
      case 'concrete': quad('concrete', s, u0, u1, 0, h, 0); break;
      case 'blocks': quad('block', s, u0, u1, 0, h, 0.095); quad('block', s, u0, u1, 0, h, -0.095); break;
      case 'gabion': quad('stone', s, u0, u1, 0, h, 0.15); quad('mesh', s, u0, u1, 0, h, 0.16); quad('stone', s, u0, u1, 0, h, -0.15); break;
      default: lags(); quad('prof', s, u0, u1, 0.05, h, off);
    }
  };

  /** Столбы и полотно на участке стороны [s0, s1] */
  const run = (s: FSide, s0: number, s1: number, endPosts: [boolean, boolean]) => {
    const len = s1 - s0;
    if (len < 0.05) return;
    const n = Math.max(1, Math.ceil(len / step - 1e-9));
    const us = Array.from({ length: n + 1 }, (_, i) => s0 + (len * i) / n);
    us.forEach((u, i) => {
      if ((i === 0 && !endPosts[0]) || (i === n && !endPosts[1])) return;
      if (masonry) addPillar(s, u);
      if (t === 'brick' || !masonry) addPost(s, u, postProf, h + 0.05);
      else postKeys.add(`${Math.round(at(s, u, 0, 0)[0] * 100)}:${Math.round(at(s, u, 0, 0)[1] * 100)}`);
    });
    for (let i = 0; i < n; i++) {
      const a = us[i] + (masonry && t !== 'concrete' ? pillarW / 2 : 0), b = us[i + 1] - (masonry && t !== 'concrete' ? pillarW / 2 : 0);
      if (b > a) fill(s, a, b);
    }
  };

  for (const s of ['front', 'right', 'back', 'left'] as FSide[]) {
    if (!sides[s]) continue;
    const len = SIDE[s].len;
    if (s !== 'front' || !openings.length) { run(s, 0, len, [true, true]); continue; }
    let cur = 0;
    for (const o of openings) { run(s, cur, o.a0, [true, false]); cur = o.a1; }
    run(s, cur, len, [false, true]);
  }

  // ---------- ворота и калитка ----------
  const leafKind: Panel['kind'] = MESHY.includes(t) ? 'mesh' : t === 'wood' || t === 'dpk' ? 'plank' : t === 'polycarbonate' ? 'poly' : 'gate';
  const leaf = (u0: number, u1: number, z0: number, z1: number, off: number, framed = true) => {
    quad(leafKind, 'front', u0, u1, z0, z1, off);
    if (framed) {
      bar('frame', frameProf, 'front', u0, z0, u1, z0, off - 0.01); bar('frame', frameProf, 'front', u0, z1, u1, z1, off - 0.01);
      bar('frame', frameProf, 'front', u0, z0, u0, z1, off - 0.01); bar('frame', frameProf, 'front', u1, z0, u1, z1, off - 0.01);
    }
  };
  for (const o of openings) {
    const prof = o.kind === 'gate' ? gatePost : '80×80×3';
    const pt = o.kind === 'gate' ? h + 0.1 : h + 0.05;
    addPost('front', o.a0, prof, pt, 'post'); addPost('front', o.a1, prof, pt, 'post');
    if (masonry && t !== 'concrete') { addPillar('front', o.a0 - pillarW / 2); addPillar('front', o.a1 + pillarW / 2); }
    const ph = P(prof).a / 2000;
    if (o.kind === 'wicket') { leaf(o.a0 + ph + 0.02, o.a1 - ph - 0.02, 0.1, Math.min(h, 2.05), -0.0); continue; }
    if (p.gate === 'swing') {
      const mid = (o.a0 + o.a1) / 2;
      leaf(o.a0 + ph + 0.03, mid - 0.01, 0.1, h, 0); leaf(mid + 0.01, o.a1 - ph - 0.03, 0.1, h, 0);
    } else {
      // откатные: полотно в проёме + противовес (хвост) в сторону отката, на нём балка; под хвостом — закладная
      const dir = p.slideDir === 'right' ? 1 : -1;
      const g0 = o.a0 + 0.05, g1 = o.a1 - 0.05;
      const e = dir > 0 ? g1 : g0; // край полотна со стороны отката
      const off = -0.12; // полотно внутри участка, рядом с линией забора
      leaf(g0, g1, 0.15, h, off);
      const tailEnd = e + dir * tail;
      bar('beam', '70×60×4', 'front', g0 - (dir < 0 ? tail : 0), 0.12, g1 + (dir > 0 ? tail : 0), 0.12, off - 0.02, false);
      bar('frame', frameProf, 'front', e, h, tailEnd, 0.15, off - 0.01); // раскос противовеса
      const fz0 = dir > 0 ? e + 0.2 : tailEnd, fz1 = dir > 0 ? tailEnd : e - 0.2;
      panels.push({ kind: 'strip', pts: [at('front', Math.min(fz0, fz1), -0.0, 0), at('front', Math.max(fz0, fz1), -0.0, 0), at('front', Math.max(fz0, fz1), -0.45, 0), at('front', Math.min(fz0, fz1), -0.45, 0)].map((q) => [q[0], q[1], 0] as V3) });
      if (p.automation) members.push({ kind: 'bollard', profile: '300×200×0', a: at('front', tailEnd + dir * 0.25, -0.5, 0), b: at('front', tailEnd + dir * 0.25, -0.5, 0.35), spec: false });
    }
  }

  // ---------- металл: длины и раскрой ----------
  const KIND: Record<string, string> = { post: 'столбы', rail: 'лаги и прожилины', frame: 'рамы ворот и калитки', baluster: 'вертикали секций', beam: 'балка ворот' };
  const byProf = new Map<string, { pieces: number[]; kinds: Set<string> }>();
  for (const m of members) {
    if (m.spec === false || m.kind === 'pillar' || m.kind === 'cpillar' || m.kind === 'bollard') continue;
    const len = m.kind === 'post' ? dist(m.a, m.b) + (p.mount === 'screw' ? 0.1 : p.mount === 'strip' ? 0.6 : 1.2) : dist(m.a, m.b);
    const g = byProf.get(m.profile) || { pieces: [], kinds: new Set<string>() };
    g.pieces.push(len); g.kinds.add(m.kind); byProf.set(m.profile, g);
  }
  const steel = [...byProf.entries()].map(([profile, g]) => {
    const pr = P(profile);
    const len = g.pieces.reduce((a, b) => a + b, 0);
    const stock = pr.a >= 80 ? 12 : 6;
    const cut = cutStock(g.pieces, stock);
    const kgm = tubeKgPerM(pr.a, pr.b, pr.t || 2);
    return { profile, use: [...g.kinds].map((k) => KIND[k] || k).join(', '), pieces: g.pieces.length, length: r2(len, 1), bars: cut.bars, stock, wastePct: cut.wastePct, kg: r2(cut.bars * stock * kgm, 0), kgNet: r2(len * kgm, 0), m2: r2(len * tubeM2PerM(pr.a, pr.b), 1), pricePerM: 0, vol: 0, volNet: 0, mat: 'steel' as const, isBoard: false };
  }).sort((a, b) => P(b.profile).a * P(b.profile).b - P(a.profile).a * P(a.profile).b);
  const steelKg = steel.reduce((a, s) => a + s.kgNet, 0);

  // ---------- смета: мастер забора ----------
  const perimeter = (sides.front ? L : 0) + (sides.back ? L : 0) + (sides.left ? W : 0) + (sides.right ? W : 0);
  const est = fenceEstimate({
    type: t, mount: p.mount, len: perimeter, h, step, slideGates: gate && p.gate === 'slide' ? 1 : 0, swingGates: gate && p.gate === 'swing' ? 1 : 0,
    wickets: openings.some((o) => o.kind === 'wicket') ? 1 : 0, slideW: gw, swingW: gw, automation: p.automation, caps: p.caps, demolish: p.demolish, slope: p.slope,
  });
  warnings.push(...est.warnings);
  if (p.gate === 'slide' && gw > 6) warnings.push('Откатные ворота шире 6 м — нужна усиленная балка и консоль, уточните у поставщика фурнитуры');
  if (h > 2.5 && !masonry) warnings.push('Сплошной забор выше 2,5 м — большая парусность: шаг столбов не больше 2,5 м, столбы 80×80 с бетонированием');

  const posts = members.filter((m) => m.kind === 'post').length;
  const summary = [
    { label: 'Длина забора', value: r2(perimeter, 1), unit: 'м' },
    { label: 'Высота', value: h, unit: 'м' },
    { label: 'Столбов', value: masonry && t !== 'brick' ? members.filter((m) => m.kind === 'pillar' || m.kind === 'cpillar').length : posts, unit: 'шт' },
    ...(gate ? [{ label: p.gate === 'slide' ? 'Откатные ворота' : 'Распашные ворота', value: gw, unit: 'м' }] : []),
    { label: 'Площадь полотна', value: r2((perimeter - openings.reduce((a, o) => a + o.a1 - o.a0, 0)) * h, 1), unit: 'м²' },
    ...(steelKg ? [{ label: 'Металл', value: Math.round(steelKg), unit: 'кг' }] : []),
  ];

  return {
    fence: true as const,
    // поля, которые ждут общий 3D-рендер и PDF (как у навеса)
    params: { ...p, L, W, h, step, type: t, frame: 'steel' as const, base: 'none' as const, cover: 'none' as const, slabT: 0, eps: 0, walls: {} as any, overhang: 0 },
    members, panels, steel, lines: est.lines, summary, warnings, openings, tail,
    info: { hHigh: h + 0.15, hLow: h, wood: false, woodVol: 0, steelKg: Math.round(steelKg), posts, perimeter: r2(perimeter, 1), postProf, gatePost, lagProf, masonry, pillarW },
  };
}
export type FenceResult = ReturnType<typeof buildFence>;

export const FENCE_SIDE_LABEL: Record<FSide, string> = { front: 'Спереди (улица)', back: 'Сзади', left: 'Слева', right: 'Справа' };

/** Строки «Параметры» для PDF и страницы заказчика */
export function fenceParamRows(r: FenceResult): [string, string][] {
  const p = r.params, i = r.info;
  const g = r.openings.find((o) => o.kind === 'gate'), w = r.openings.find((o) => o.kind === 'wicket');
  return [
    ['Объект', 'Забор с воротами'],
    ['Участок', `${p.L} × ${p.W} м`],
    ['Забор', (Object.keys(FENCE_SIDE_LABEL) as FSide[]).filter((s) => p.sides[s]).map((s) => FENCE_SIDE_LABEL[s].toLowerCase()).join(', ') + `, всего ${i.perimeter} м`],
    ['Вид забора', FENCE_TYPES[p.type].label],
    ['Высота', `${p.h} м`],
    ['Столбы', i.masonry && p.type !== 'brick' ? `${p.type === 'concrete' ? 'бетонные' : 'кладка'}, шаг до ${p.step} м` : `труба ${i.postProf}, шаг до ${p.step} м, ${MOUNTS[p.mount].label.toLowerCase()}`],
    ...(!i.masonry || p.type === 'brick' ? [['Лаги', `труба ${i.lagProf}`] as [string, string]] : []),
    ['Ворота', g ? `${p.gate === 'slide' ? `откатные, проём ${g.a1 - g.a0} м, противовес ${r.tail} м, откат ${p.slideDir === 'right' ? 'вправо' : 'влево'}` : `распашные, проём ${r2(g.a1 - g.a0, 2)} м`}${p.automation ? ', с автоматикой' : ''}` : 'нет'],
    ['Калитка', w ? `1,0 × ${Math.min(p.h, 2.05)} м, в ${r2(w.a0, 1)} м от левого угла` : 'нет'],
    ['Цвет', p.color],
  ];
}
