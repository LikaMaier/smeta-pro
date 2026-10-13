/**
 * Отрисовка модели без внешних библиотек:
 *  - 3D: ортогональная проекция с поворотом (yaw/pitch), затенение граней, сортировка по глубине;
 *  - 2D: чертёжные листы (план, фасады, разрез основания) из примитивов с размерами.
 * Один и тот же результат рисуется в приложении (SVG) и в PDF (reportlab).
 */
import type { CanopyResult, V3, Side, Member } from './canopy';
import type { FenceResult } from './fence3d';
import type { SiteResult } from './site';
import { fenceDrawings } from './fenceDraw';
import { siteDrawings } from './siteDraw';
import type { MepResult } from './mep';
import { mepDrawings } from './mepDraw';

export const RAL: Record<string, string> = {
  'RAL 7024': '#474A51', 'RAL 8017': '#45322E', 'RAL 6005': '#114232', 'RAL 3005': '#5E2129', 'RAL 5005': '#1E4E8C',
  'RAL 9003': '#ECECE7', 'RAL 1014': '#DFCEA1', 'RAL 7004': '#9C9C9C', 'RAL 9005': '#16171A', 'RAL 3011': '#781F19',
};
/** 'none' — без покраски: оцинковка / естественный металл */
export const NO_PAINT_COLOR = '#A9AFB6';
const colorOf = (ral: string) => (ral === 'none' ? NO_PAINT_COLOR : RAL[ral] || '#474A51');
const sizeOf = (profile: string) => { const [a, b] = profile.split('×').map(Number); return [a / 1000, b / 1000]; };

// ---------------------------------------------------------------- 3D
export interface Poly { pts: [number, number][]; fill: string; stroke: string; opacity: number; sw: number }
export interface Line2 { a: [number, number]; b: [number, number]; stroke: string; sw: number; opacity: number }
export type Item3 = ({ k: 'p' } & Poly) | ({ k: 'l' } & Line2);
export interface View3D { items: Item3[]; w: number; h: number }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Всё, что умеет рисовать 3D: навес, забор, план участка */
export type RenderRes = Pick<CanopyResult, 'members' | 'panels'> & { params: any; info: any };

export function render3d(res: RenderRes, yawDeg = -35, pitchDeg = 28, width = 800, height = 560): View3D {
  const { L, W } = res.params;
  const center: V3 = [L / 2, W / 2, (res.info.hHigh) / 2];
  const yaw = (yawDeg * Math.PI) / 180, pitch = (pitchDeg * Math.PI) / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cam = (p: V3) => {
    const x = p[0] - center[0], y = p[1] - center[1], z = p[2] - center[2];
    const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
    return { sx: x1, sy: z * cp + y1 * sp, d: y1 * cp - z * sp };
  };
  const camN = (n: V3) => { const y1 = n[0] * sy + n[1] * cy; return y1 * cp - n[2] * sp; };
  const light = norm([-0.45, -0.7, 0.85]);
  const frame = res.params.frame === 'wood' ? '#9C6B40' : shade(colorOf(res.params.color), 1.25);
  const faces: { pts: V3[]; fill: string; stroke: string; opacity: number; d: number; sw: number; ground?: boolean; bias?: number; bg?: boolean; shadow?: boolean }[] = [];
  const lines3: { a: V3; b: V3; stroke: string; sw: number; opacity: number; ground?: boolean }[] = [];

  // плита и земля
  for (const p of res.panels) {
    if (p.kind === 'curb') {
      const top = p.pts, bot = p.pts.map((q) => [q[0], q[1], -0.05] as V3);
      faces.push({ pts: top, fill: '#B9B6AF', stroke: '#8d8a83', opacity: 1, d: 0, sw: 0.5, ground: true });
      for (let i = 0; i < 4; i++) faces.push({ pts: [top[i], top[(i + 1) % 4], bot[(i + 1) % 4], bot[i]], fill: '#9F9C95', stroke: '#85827b', opacity: 1, d: 0, sw: 0.4 });
    }
    if (p.kind === 'strip') {
      // лента фундамента: над землёй 0,2 м
      const top = p.pts.map((q) => [q[0], q[1], 0.0] as V3), bot = p.pts.map((q) => [q[0], q[1], -0.2] as V3);
      faces.push({ pts: top, fill: '#C9C6BF', stroke: '#9d9a93', opacity: 1, d: 0, sw: 0.6, ground: true });
      for (let i = 0; i < 4; i++) faces.push({ pts: [top[i], top[(i + 1) % 4], bot[(i + 1) % 4], bot[i]], fill: '#A8A59E', stroke: '#8a877f', opacity: 1, d: 0, sw: 0.5, ground: true });
    }
    if (p.kind === 'slab') {
      const top = p.pts, bot = p.pts.map((q) => [q[0], q[1], q[2] - (res.params.base === 'ushp' ? res.params.slabT + res.params.eps : res.params.slabT)] as V3);
      faces.push({ pts: top, fill: '#C9C6BF', stroke: '#9d9a93', opacity: 1, d: 0, sw: 0.6, ground: true });
      for (let i = 0; i < 4; i++) faces.push({ pts: [top[i], top[(i + 1) % 4], bot[(i + 1) % 4], bot[i]], fill: '#A8A59E', stroke: '#8a877f', opacity: 1, d: 0, sw: 0.5, ground: true });
    }
    if (p.kind === 'deck') {
      // настил на сваях: доски вдоль X
      const top = p.pts.map((q) => [q[0], q[1], q[2] + 0.02] as V3), bot = p.pts.map((q) => [q[0], q[1], q[2] - 0.2] as V3);
      faces.push({ pts: top, fill: '#B07D4F', stroke: '#7a5232', opacity: 1, d: 0, sw: 0.6, ground: true });
      for (let i = 0; i < 4; i++) faces.push({ pts: [top[i], top[(i + 1) % 4], bot[(i + 1) % 4], bot[i]], fill: '#8A5E3A', stroke: '#6a4428', opacity: 1, d: 0, sw: 0.5, ground: true });
      const [a, b2, , d2] = top; const n = Math.round(Math.hypot(...sub(d2, a)) / 0.145);
      for (let i = 1; i < n; i++) { const t = i / n; lines3.push({ a: addv(a, mul(sub(d2, a), t)), b: addv(b2, mul(sub(d2, a), t)), stroke: '#7a5232', sw: 0.4, opacity: 0.7, ground: true }); }
    }
    if (p.kind === 'grass' || p.kind === 'gravel' || p.kind === 'floor' || p.kind === 'tile') {
      faces.push({ pts: p.pts, fill: ({ grass: '#A9C98A', gravel: '#CFC8B8', floor: '#E4D3B6', tile: '#D7E3E8' } as any)[p.kind], stroke: ({ grass: '#97b878', gravel: '#b3ab99', floor: '#c9b48f', tile: '#b7c8cf' } as any)[p.kind], opacity: 1, d: 0, sw: 0.6, ground: true });
    }
    if (p.kind === 'paving') {
      const top = p.pts, bot = p.pts.map((q) => [q[0], q[1], q[2] - 0.08] as V3);
      faces.push({ pts: top, fill: '#BDB8AE', stroke: '#8f8a80', opacity: 1, d: 0, sw: 0.6, ground: true });
      for (let i = 0; i < 4; i++) faces.push({ pts: [top[i], top[(i + 1) % 4], bot[(i + 1) % 4], bot[i]], fill: '#8f8a80', stroke: '#77726a', opacity: 1, d: 0, sw: 0.5, ground: true });
      const [a, b2, , d2] = top;
      const nx = Math.round(Math.hypot(...sub(b2, a)) / 0.4), ny = Math.round(Math.hypot(...sub(d2, a)) / 0.4);
      for (let i = 1; i < nx; i++) { const t = i / nx; lines3.push({ a: addv(a, mul(sub(b2, a), t)), b: addv(d2, mul(sub(b2, a), t)), stroke: '#a39e94', sw: 0.35, opacity: 0.8, ground: true }); }
      for (let i = 1; i < ny; i++) { const t = i / ny; lines3.push({ a: addv(a, mul(sub(d2, a), t)), b: addv(b2, mul(sub(d2, a), t)), stroke: '#a39e94', sw: 0.35, opacity: 0.8, ground: true }); }
    }
    if (p.kind === 'house') {
      // стена дома позади объекта — рисуем первой (как фон), иначе — полупрозрачной поверх
      const c = p.pts.reduce((a, q) => addv(a, mul(q, 0.25)), [0, 0, 0] as V3);
      const behind = cam(c).d > cam(center).d;
      faces.push({ pts: p.pts, fill: '#D8CBB6', stroke: '#a89b86', opacity: behind ? 1 : 0.5, d: 0, sw: 0.8, ground: behind, bg: true });
    }
  }
  // элементы каркаса — бруски
  const segs: (Member & { c0: boolean; c1: boolean })[] = [];
  for (const m of res.members) {
    const len = Math.hypot(...sub(m.b, m.a)), n = Math.max(1, Math.ceil(len / 1.0));
    for (let i = 0; i < n; i++) segs.push({ ...m, a: addv(m.a, mul(sub(m.b, m.a), i / n)), b: addv(m.a, mul(sub(m.b, m.a), (i + 1) / n)), c0: i === 0, c1: i === n - 1 });
  }
  for (const m of segs) {
    const [w0, h0] = sizeOf(m.profile);
    const w = Math.max(w0, 0.03), h = Math.max(h0, 0.03);
    const d = norm(sub(m.b, m.a));
    const up: V3 = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const e1 = norm(cross(d, up)), e2 = norm(cross(e1, d));
    const c = (base: V3, s1: number, s2: number) => addv(addv(base, mul(e1, (s1 * w) / 2)), mul(e2, (s2 * h) / 2));
    const A = [c(m.a, -1, -1), c(m.a, 1, -1), c(m.a, 1, 1), c(m.a, -1, 1)], B = [c(m.b, -1, -1), c(m.b, 1, -1), c(m.b, 1, 1), c(m.b, -1, 1)];
    const quads: [V3[], V3][] = [
      [[A[0], A[1], B[1], B[0]], mul(e2, -1)], [[A[1], A[2], B[2], B[1]], e1], [[A[2], A[3], B[3], B[2]], e2], [[A[3], A[0], B[0], B[3]], mul(e1, -1)],
      ...(m.c0 ? [[[A[0], A[3], A[2], A[1]], mul(d, -1)] as [V3[], V3]] : []), ...(m.c1 ? [[[B[0], B[1], B[2], B[3]], d] as [V3[], V3]] : []),
    ];
    const pillarCol = res.params.type === 'blocks' ? '#B5AB9B' : res.params.type === 'gabion' ? '#8E8A80' : '#9C4A32';
    const WIRE: Record<string, string> = { wireL: '#E6B800', wireS: '#E8772E', wireP: '#D32F2F', wireN: '#2E9C8F', pipeC: '#2F6FD6', pipeH: '#E04040', pipeS: '#7A7F87' };
    const base = WIRE[m.kind] ? WIRE[m.kind] : m.kind === 'trunk' ? '#6B4A2B' : m.kind === 'pillar' ? pillarCol : m.kind === 'cpillar' ? '#ABA79F' : m.kind === 'bollard' || m.kind === 'bumper' ? (m.kind === 'bollard' && Math.floor(((m.a[2] + m.b[2]) / 2) / 0.2) % 2 ? '#2b2b2b' : '#E3B505')
      : m.kind === 'tie' ? shade(frame, 0.85) : m.kind === 'rail' || m.kind === 'web' || m.kind === 'purlin' || m.kind === 'baluster' ? shade(frame, 1.1) : frame;
    for (const [q, n] of quads) {
      if (camN(n) > 0.02) continue; // невидимая грань
      const k = 0.52 + 0.5 * Math.max(0, dot(n, light)) + 0.06 * Math.max(0, n[2]);
      faces.push({ pts: q, fill: shade(base, k), stroke: shade(base, k * 0.78), opacity: 1, d: 0, sw: 0.35 });
    }
  }
  // панели: кровля, профлист, сетка
  const col = colorOf(res.params.color);
  const roofCol = res.params.roofColor ? colorOf(res.params.roofColor) : col;
  // насколько выступает каркас из плоскости стены: полстолба + запас
  const cladOff = Math.max(0.03, ...res.members.filter((m) => m.kind === 'post' || m.kind === 'frame' || m.kind === 'rail').map((m) => Math.max(...sizeOf(m.profile)) / 2)) + 0.012;
  for (let p of res.panels) {
    if (p.kind === 'slab' || p.kind === 'deck' || p.kind === 'house' || p.kind === 'paving' || p.kind === 'strip' || p.kind === 'curb' || p.kind === 'grass' || p.kind === 'gravel' || p.kind === 'floor' || p.kind === 'tile') continue;
    if (p.kind === 'container') {
      // евроконтейнер: корпус и крышка
      const top = p.pts, bot = p.pts.map((q) => [q[0], q[1], 0.12] as V3);
      const sides: [V3[], V3][] = [0, 1, 2, 3].map((i) => {
        const a = top[i], b2 = top[(i + 1) % 4];
        const n = norm(cross(sub(b2, a), [0, 0, -1]));
        return [[a, b2, bot[(i + 1) % 4], bot[i]], n];
      });
      for (const [q, nrm] of sides) { const k = 0.6 + 0.45 * Math.abs(dot(nrm, light)); faces.push({ pts: q, fill: shade('#2E7D32', k), stroke: '#1b4d1e', opacity: 1, d: 0, sw: 0.5 }); }
      faces.push({ pts: top, fill: '#256B29', stroke: '#1b4d1e', opacity: 1, d: 0, sw: 0.6 });
      continue;
    }
    if (p.kind === 'mesh') {
      // сетка — прозрачная, с линиями
      const [a, b, c2, d2] = p.pts;
      const lenH = Math.hypot(...sub(b, a)), steps = Math.max(2, Math.round(lenH / 0.25));
      for (let i = 0; i <= steps; i++) { const t = i / steps; lines3.push({ a: addv(a, mul(sub(b, a), t)), b: addv(d2, mul(sub(c2, d2), t)), stroke: shade(col, 1.3), sw: 0.6, opacity: 0.9 }); }
      const hH = Math.max(Math.hypot(...sub(d2, a)), Math.hypot(...sub(c2, b))), vs = Math.max(2, Math.round(hH / 0.25));
      for (let i = 0; i <= vs; i++) { const t = i / vs; lines3.push({ a: addv(a, mul(sub(d2, a), t)), b: addv(b, mul(sub(c2, b), t)), stroke: shade(col, 1.3), sw: 0.6, opacity: 0.9 }); }
      continue;
    }
    // обшивку и проёмы стен построек сдвигаем наружу на полстолба — каркас остаётся внутри и не «просвечивает»;
    // кровлю — чуть вверх, чтобы прогоны не проступали пятнами
    if (!(res as any).fence && !(res as any).site && !(res as any).mep) {
      const vert = p.pts.every((q) => Math.abs(q[0] - p.pts[0][0]) < 1e-6) || p.pts.every((q) => Math.abs(q[1] - p.pts[0][1]) < 1e-6);
      if (vert && ['prof', 'wood', 'sandwich', 'poly', 'mesh', 'door', 'window', 'gate'].includes(p.kind)) {
        const cx = p.pts.reduce((a, q) => a + q[0], 0) / p.pts.length, cy = p.pts.reduce((a, q) => a + q[1], 0) / p.pts.length;
        const alongXwall = p.pts.every((q) => Math.abs(q[1] - p.pts[0][1]) < 1e-6);
        const off = cladOff + (['door', 'window', 'gate'].includes(p.kind) ? 0.01 : 0);
        const o: V3 = alongXwall ? [0, cy < W / 2 ? -off : off, 0] : [cx < L / 2 ? -off : off, 0, 0];
        p = { ...p, pts: p.pts.map((q) => addv(q, o)) };
      } else if (p.kind === 'roof') p = { ...p, pts: p.pts.map((q) => [q[0], q[1], q[2] + 0.035] as V3) };
    }
    const n = norm(cross(sub(p.pts[1], p.pts[0]), sub(p.pts[3], p.pts[0])));
    const k = 0.6 + 0.45 * Math.abs(dot(n, light));
    const cov = res.params.cover;
    const fill = p.kind === 'roof' ? (cov === 'poly' ? '#9fc4d9' : cov === 'soft' ? shade(roofCol, k * 0.85) : shade(roofCol, k * 0.95)) : p.kind === 'door' ? shade('#3a3d42', k) : p.kind === 'window' ? shade('#7FAFC9', k) : p.kind === 'gate' ? shade(col, k * 0.82)
      : p.kind === 'poly' ? '#a9cde0' : p.kind === 'wood' || p.kind === 'plank' ? shade('#B07D4F', k) : p.kind === 'concrete' ? shade('#B3AFA6', k)
      : p.kind === 'block' ? shade('#B5AB9B', k) : p.kind === 'stone' ? shade('#8E8A80', k) : p.kind === 'wall' ? shade('#E6D8C2', k)
      : p.kind === 'fixture' ? shade('#F4F4F1', k) : p.kind === 'pointE' ? shade('#FFFFFF', k) : p.kind === 'pointL' ? shade('#FFD54A', k) : p.kind === 'pipeBox' ? shade('#7FA7D9', k) : p.kind === 'cut' ? '#4A4A4A'
      : p.kind === 'lid' ? shade('#3F5E3B', k) : p.kind === 'soil' ? shade('#7A5A3A', k) : p.kind === 'tree' ? shade('#4E8B3A', k) : shade(col, k);
    const opacity = (p.kind === 'roof' && cov === 'poly') ? 0.55 : p.kind === 'poly' ? 0.42 : p.kind === 'window' ? 0.82 : 1;
    // большие плоскости дробим на ячейки ~0,7 м — так сортировка по глубине не путает их с каркасом
    {
      const [a, b2, c2, d2] = p.pts;
      const nu = Math.max(1, Math.round(Math.max(Math.hypot(...sub(b2, a)), Math.hypot(...sub(c2, d2))) / 0.7));
      const nv = Math.max(1, Math.round(Math.max(Math.hypot(...sub(d2, a)), Math.hypot(...sub(c2, b2))) / 0.7));
      const at = (u: number, v: number): V3 => { const p0 = addv(a, mul(sub(b2, a), u)), p1 = addv(d2, mul(sub(c2, d2), u)); return addv(p0, mul(sub(p1, p0), v)); };
      const flat = p.pts.every((q) => q[2] <= 0.05); // лежит на земле — рисуем вместе с землёй
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++)
        faces.push({ pts: [at(i / nu, j / nv), at((i + 1) / nu, j / nv), at((i + 1) / nu, (j + 1) / nv), at(i / nu, (j + 1) / nv)], fill, stroke: fill, opacity, d: 0, sw: opacity < 1 ? 0 : 0.8, bias: p.kind === 'roof' ? 0.45 : 0.15, ground: flat || undefined });
      const edge = shade(col, 0.6);
      [[a, b2], [b2, c2], [c2, d2], [d2, a]].forEach(([q0, q1]) => { if (Math.hypot(...sub(q1, q0)) > 0.01) lines3.push({ a: q0, b: q1, stroke: edge, sw: 0.8, opacity: 1 }); });
    }
    // рисунок поверхности: рёбра профлиста, ряды черепицы, стыки панелей, доски
    {
      const [a, b, c2, d2] = p.pts;
      // ab: линии, разбивающие сторону a→b (у стен — вертикальные; у кровли — вдоль карниза)
      const ab = (step: number, stroke: string, op: number) => { const r = Math.round(Math.hypot(...sub(b, a)) / step); for (let i = 1; i < r; i++) { const t = i / r; lines3.push({ a: addv(a, mul(sub(b, a), t)), b: addv(d2, mul(sub(c2, d2), t)), stroke, sw: 0.4, opacity: op }); } };
      // ad: линии, разбивающие сторону a→d (у стен — горизонтальные; у кровли — вниз по скату)
      const ad = (step: number, stroke: string, op: number) => { const r = Math.round(Math.hypot(...sub(d2, a)) / step); for (let i = 1; i < r; i++) { const t = i / r; lines3.push({ a: addv(a, mul(sub(d2, a), t)), b: addv(b, mul(sub(c2, b), t)), stroke, sw: 0.4, opacity: op }); } };
      if (p.kind === 'prof' || p.kind === 'gate') ab(0.115, shade(col, 0.75), 0.8);
      if (p.kind === 'sandwich') ad(1.0, shade(col, 0.7), 0.9);
      if (p.kind === 'wood') ad(0.16, shade('#B07D4F', 0.7), 0.8);
      if (p.kind === 'poly') ab(1.05, '#7fa6bb', 0.7);
      if (p.kind === 'window') {
        // переплёт и блик на стекле
        ab(Math.max(0.3, Math.hypot(...sub(b, a)) / 2), '#F2F2F0', 1);
        const hl = (t0: number, t1: number) => lines3.push({ a: addv(addv(a, mul(sub(b, a), t0)), mul(sub(d2, a), 0.15)), b: addv(addv(a, mul(sub(b, a), t1)), mul(sub(d2, a), 0.85)), stroke: '#FFFFFF', sw: 1.2, opacity: 0.45 });
        hl(0.12, 0.32); hl(0.6, 0.8);
        [[a, b], [b, c2], [c2, d2], [d2, a]].forEach(([q0, q1]) => lines3.push({ a: q0, b: q1, stroke: '#F2F2F0', sw: 2.2, opacity: 1 }));
      }
      if (p.kind === 'concrete') ad(0.5, '#8f8b83', 0.8);
      if (p.kind === 'block') { ad(0.19, '#8f8678', 0.7); ab(0.39, '#8f8678', 0.5); }
      if (p.kind === 'stone') { ad(0.12, '#6f6b63', 0.6); ab(0.17, '#6f6b63', 0.45); }
      if (p.kind === 'roof') {
        if (cov === 'prof' || cov === 'tile') ad(0.2, shade(roofCol, 0.75), 0.6);
        if (cov === 'tile') ab(0.35, shade(roofCol, 0.7), 0.5);
        if (cov === 'soft') ab(0.22, shade(col, 0.65), 0.55);
        if (cov === 'sandwich') ad(1.0, shade(col, 0.7), 0.7);
      }
    }
  }

  // мягкая тень на земле от кровли и стен (только для построек) — проекция по направлению света
  if (!(res as any).fence && !(res as any).site && !(res as any).mep) {
    const pts2: [number, number][] = [];
    for (const p of res.panels) {
      if (!['roof', 'prof', 'wood', 'sandwich', 'poly', 'gate', 'door', 'window', 'mesh'].includes(p.kind)) continue;
      for (const q of p.pts) if (q[2] > 0.05) pts2.push([q[0] - (light[0] / light[2]) * q[2], q[1] - (light[1] / light[2]) * q[2]]);
    }
    for (const m of res.members) if (m.kind === 'post') for (const q of [m.a, m.b]) pts2.push([q[0] - (light[0] / light[2]) * q[2], q[1] - (light[1] / light[2]) * q[2]]);
    if (pts2.length >= 3) {
      // выпуклая оболочка (монотонная цепочка)
      const P2 = [...pts2].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
      const cr = (o: number[], u: number[], v: number[]) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
      const lo: [number, number][] = [], up: [number, number][] = [];
      for (const q of P2) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
      for (const q of [...P2].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
      const hull = [...lo.slice(0, -1), ...up.slice(0, -1)];
      if (hull.length >= 3) faces.push({ pts: hull.map(([x, y]) => [x, y, 0.005] as V3), fill: '#1B2430', stroke: '#1B2430', opacity: 0.13, d: 0, sw: 0, ground: true, shadow: true });
    }
  }

  // проекция, сортировка
  const all = faces.map((f) => { const cs = f.pts.map(cam); return { ...f, cs, d: f.ground ? (f.bg ? 2e9 : f.shadow ? 1e9 - 0.3 : 1e9 - (f.pts[0][2] > -0.01 ? 0 : 1)) : cs.reduce((a, c) => a + c.d, 0) / cs.length - (f.bias || 0) }; });
  const ls = lines3.map((l) => { const a = cam(l.a), b = cam(l.b); return { ...l, ca: a, cb: b, d: l.ground ? 1e9 - 0.5 : (a.d + b.d) / 2 }; });
  const xs = [...all.flatMap((f) => f.cs.map((c) => c.sx)), ...ls.flatMap((l) => [l.ca.sx, l.cb.sx])];
  const ys = [...all.flatMap((f) => f.cs.map((c) => c.sy)), ...ls.flatMap((l) => [l.ca.sy, l.cb.sy])];
  // без Math.min(...arr): у длинных заборов десятки тысяч точек — переполнение стека
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of xs) { if (v < minX) minX = v; if (v > maxX) maxX = v; }
  for (const v of ys) { if (v < minY) minY = v; if (v > maxY) maxY = v; }
  const scale = Math.min((width * 0.92) / (maxX - minX || 1), (height * 0.92) / (maxY - minY || 1));
  const ox = (width - (maxX - minX) * scale) / 2, oy = (height - (maxY - minY) * scale) / 2;
  const S = (c: { sx: number; sy: number }): [number, number] => [Math.round((ox + (c.sx - minX) * scale) * 10) / 10, Math.round((height - oy - (c.sy - minY) * scale) * 10) / 10];
  // линии сетки рисуем вместе с гранями по глубине
  type Item = { d: number; poly?: Poly; line?: Line2 };
  const items: Item[] = [
    ...all.map((f) => ({ d: f.d, poly: { pts: f.cs.map(S), fill: f.fill, stroke: f.stroke, opacity: f.opacity, sw: f.sw } })),
    ...ls.map((l) => ({ d: l.d - 0.02, line: { a: S(l.ca), b: S(l.cb), stroke: l.stroke, sw: l.sw, opacity: l.opacity } })),
  ].sort((a, b) => b.d - a.d);
  return { items: items.map((i) => (i.poly ? { k: 'p' as const, ...i.poly } : { k: 'l' as const, ...i.line! })), w: width, h: height };
}

// ---------------------------------------------------------------- 2D
export type Prim =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w?: number; dash?: boolean; c?: string }
  | { t: 'poly'; pts: [number, number][]; fill?: string; c?: string; w?: number; hatch?: 'prof' | 'mesh' | 'concrete' | 'sand' | 'gravel' | 'soil' }
  | { t: 'text'; x: number; y: number; s: string; size?: number; anchor?: 'start' | 'middle' | 'end'; rot?: number; bold?: boolean; c?: string }
  | { t: 'dim'; x1: number; y1: number; x2: number; y2: number; off: number; s: string };
export interface Sheet { title: string; x0: number; y0: number; x1: number; y1: number; prims: Prim[] }
const f2 = (v: number) => (Math.round(v * 100) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function drawings(res0: CanopyResult | FenceResult | SiteResult | MepResult): Sheet[] {
  if ((res0 as any).mep) return mepDrawings(res0 as MepResult);
  if ((res0 as any).fence) return fenceDrawings(res0 as FenceResult);
  if ((res0 as any).site) return siteDrawings(res0 as SiteResult);
  const res = res0 as CanopyResult;
  const { L, W, overhang: ov, walls } = res.params;
  const col = colorOf(res.params.color);
  const sheets: Sheet[] = [];
  const posts = res.members.filter((m) => m.kind === 'post');

  // ---------- план ----------
  {
    const pr: Prim[] = [];
    for (const q of res.panels.filter((x) => x.kind === 'curb')) pr.push({ t: 'poly', pts: q.pts.map((v) => [v[0], v[1]] as [number, number]), fill: '#B9B6AF', c: '#666', w: 0.5 });
    for (const m of res.members.filter((x) => x.kind === 'bollard')) pr.push({ t: 'poly', pts: [[m.a[0] - 0.07, m.a[1] - 0.07], [m.a[0] + 0.07, m.a[1] - 0.07], [m.a[0] + 0.07, m.a[1] + 0.07], [m.a[0] - 0.07, m.a[1] + 0.07]], fill: '#E3B505', c: '#333', w: 0.5 });
    for (const m of res.members.filter((x) => x.kind === 'bumper' && Math.abs(x.a[2] - x.b[2]) < 0.01)) pr.push({ t: 'line', x1: m.a[0], y1: m.a[1], x2: m.b[0], y2: m.b[1], w: 2, c: '#C99A00' });
    for (const q of res.panels.filter((x) => x.kind === 'strip')) pr.push({ t: 'poly', pts: q.pts.map((v) => [v[0], v[1]] as [number, number]), fill: '#E2DFD8', c: '#777', w: 0.6, hatch: 'concrete' });
    if (res.params.base === 'paving') { const o = res.params.slabOver; pr.push({ t: 'poly', pts: [[-o, -o], [L + o, -o], [L + o, W + o], [-o, W + o]], fill: '#E4E0D8', c: '#888', w: 0.8, hatch: 'gravel' }); }
    if (res.params.base === 'slab' || res.params.base === 'ushp') { const o = res.params.slabOver; pr.push({ t: 'poly', pts: [[-o, -o], [L + o, -o], [L + o, W + o], [-o, W + o]], fill: '#ECEAE4', c: '#888', w: 0.8, hatch: 'concrete' }); }
    const roof = res.panels.filter((p) => p.kind === 'roof');
    for (const r of roof) pr.push({ t: 'poly', pts: r.pts.map((q) => [q[0], q[1]] as [number, number]), c: '#555', w: 0.6 });
    for (const m of res.members) {
      if (m.kind === 'chord' || m.kind === 'rafter' || m.kind === 'hip') pr.push({ t: 'line', x1: m.a[0], y1: m.a[1], x2: m.b[0], y2: m.b[1], w: 0.6, dash: true, c: '#777' });
      if (m.kind === 'beam') pr.push({ t: 'line', x1: m.a[0], y1: m.a[1], x2: m.b[0], y2: m.b[1], w: 1.2, c: '#333' });
    }
    const wallLine: Record<Side, [number, number, number, number]> = { front: [0, 0, L, 0], back: [0, W, L, W], left: [0, 0, 0, W], right: [L, 0, L, W] };
    for (const s of ['front', 'back', 'left', 'right'] as Side[]) {
      const [x1, y1, x2, y2] = wallLine[s];
      if (walls[s] !== 'open') pr.push({ t: 'line', x1, y1, x2, y2, w: walls[s] === 'rail' ? 1.6 : 3, c: col, dash: walls[s] === 'mesh' || walls[s] === 'rail' });
    }
    // проёмы
    for (const o of res.openings) {
      const [x1, y1, x2, y2] = wallLine[o.side];
      const ux = (x2 - x1) / (Math.hypot(x2 - x1, y2 - y1) || 1), uy = (y2 - y1) / (Math.hypot(x2 - x1, y2 - y1) || 1);
      const a: [number, number] = [x1 + ux * o.a0, y1 + uy * o.a0], b: [number, number] = [x1 + ux * o.a1, y1 + uy * o.a1];
      pr.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: 3.4, c: '#ffffff' });
      if (o.kind === 'window') pr.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: 1.6, c: '#5B9BD5' });
      else pr.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: 0.8, c: '#333', dash: true });
      const nx = o.side === 'front' ? 0 : o.side === 'back' ? 0 : o.side === 'left' ? 0.35 : -0.35, ny = o.side === 'front' ? 0.35 : o.side === 'back' ? -0.45 : 0;
      pr.push({ t: 'text', x: (a[0] + b[0]) / 2 + nx, y: (a[1] + b[1]) / 2 + ny, s: o.kind === 'gate' ? `ворота ${f2(o.a1 - o.a0)} м` : o.kind === 'window' ? 'окно' : 'дверь', size: 0.24, anchor: 'middle', rot: o.side === 'left' || o.side === 'right' ? 90 : 0, c: '#333' });
    }
    // стена дома
    const house = res.panels.find((q) => q.kind === 'house');
    if (house) {
      const [x1, y1, x2, y2] = wallLine[res.params.highSide];
      const t = 0.35, out = res.params.highSide === 'front' || res.params.highSide === 'left' ? -1 : 1;
      const pts: [number, number][] = x1 === x2
        ? [[x1 + out * 0.06, y1 - 1.2], [x1 + out * (0.06 + t), y1 - 1.2], [x1 + out * (0.06 + t), y2 + 1.2], [x1 + out * 0.06, y2 + 1.2]]
        : [[x1 - 1.2, y1 + out * 0.06], [x2 + 1.2, y1 + out * 0.06], [x2 + 1.2, y1 + out * (0.06 + t)], [x1 - 1.2, y1 + out * (0.06 + t)]];
      pr.push({ t: 'poly', pts, fill: '#E3D7C3', c: '#555', w: 0.8, hatch: 'concrete' });
      const cx = (pts[0][0] + pts[2][0]) / 2, cy = (pts[0][1] + pts[2][1]) / 2;
      pr.push({ t: 'text', x: cx + (x1 === x2 ? out * 0.4 : 0), y: cy + (x1 === x2 ? 0 : out * 0.4), s: 'стена дома', size: 0.26, anchor: 'middle', rot: x1 === x2 ? 90 : 0, c: '#555' });
    }
    for (const q of res.panels.filter((x) => x.kind === 'container')) {
      pr.push({ t: 'poly', pts: q.pts.map((v) => [v[0], v[1]] as [number, number]), fill: '#9CCC65', c: '#33691E', w: 0.8 });
      const cx = q.pts.reduce((a, v) => a + v[0], 0) / 4, cy = q.pts.reduce((a, v) => a + v[1], 0) / 4;
      pr.push({ t: 'text', x: cx, y: cy - 0.08, s: `${res.params.contType.replace('.', ',')} м³`, size: 0.2, anchor: 'middle', c: '#1B5E20' });
    }
    for (const p of posts) { const [w] = sizeOf(p.profile); pr.push({ t: 'poly', pts: [[p.a[0] - w / 2, p.a[1] - w / 2], [p.a[0] + w / 2, p.a[1] - w / 2], [p.a[0] + w / 2, p.a[1] + w / 2], [p.a[0] - w / 2, p.a[1] + w / 2]], fill: '#222', c: '#222', w: 0.5 }); }
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: L, y2: 0, off: -1.0 - ov, s: `${f2(L)} м` });
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: 0, y2: W, off: -1.0 - ov, s: `${f2(W)} м` });
    // въезд и уклон
    const gateSide = res.openings.find((o) => o.kind === 'gate')?.side;
    const open = gateSide || (['front', 'back', 'left', 'right'] as Side[]).find((s) => walls[s] === 'open' && !(res.params.attach && s === res.params.highSide));
    const entry = gateSide ? '▲ ворота' : res.params.kind === 'gazebo' || res.params.kind === 'lean' ? '▲ вход' : '▲ въезд';
    if (open && !gateSide) { const [x1, y1, x2, y2] = wallLine[open]; const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; pr.push({ t: 'text', x: mx, y: my + (open === 'front' ? -0.5 : open === 'back' ? 0.35 : 0), s: entry, size: 0.35, anchor: 'middle', bold: true, rot: open === 'left' || open === 'right' ? 90 : 0 }); }
    const sl = res.params.roof === 'single' ? `уклон кровли → ${res.params.highSide === 'left' ? 'вправо' : res.params.highSide === 'right' ? 'влево' : res.params.highSide === 'front' ? 'назад' : 'вперёд'}, ${Math.round(((res.info.hHigh - res.info.hLow) / res.info.span) * 100)}%` : res.params.roof === 'gable' ? 'двускатная кровля' : res.params.roof === 'arch' ? 'арочная кровля' : 'четырёхскатная кровля';
    pr.push({ t: 'text', x: L / 2, y: W / 2, s: sl, size: 0.3, anchor: 'middle', c: '#555' });
    pr.push({ t: 'text', x: L / 2, y: W / 2 - 0.45, s: `${res.info.posts ? `столбов ${res.info.posts}` : 'на консолях'}, ${res.info.truss ? 'ферм' : res.params.roof === 'arch' ? 'арок' : 'стропил'} ${res.info.rafters}${res.info.wood ? ', каркас из бруса' : ''}${res.params.base === 'deck' ? ', настил на винтовых сваях' : ''}`, size: 0.26, anchor: 'middle', c: '#777' });
    const room = roomSheets(res);
    sheets.push(...room);
    sheets.push({ title: room.length ? 'Схема кровли и каркаса' : 'План (вид сверху)', x0: -ov - 2, y0: -ov - 2, x1: L + ov + 1, y1: W + ov + 1, prims: pr });
  }

  // ---------- фасады ----------
  const views: { side: Side; title: string }[] = [
    { side: 'front', title: 'Вид спереди' }, { side: 'right', title: 'Вид справа' }, { side: 'back', title: 'Вид сзади' }, { side: 'left', title: 'Вид слева' },
  ];
  for (const { side, title } of views) {
    const H = (p: V3) => (side === 'front' ? p[0] : side === 'back' ? L - p[0] : side === 'left' ? W - p[1] : p[1]);
    const depth = (p: V3) => (side === 'front' ? p[1] : side === 'back' ? W - p[1] : side === 'left' ? p[0] : L - p[0]);
    const near = (p: V3) => depth(p) < 0.25;
    const width = side === 'front' || side === 'back' ? L : W;
    const pr: Prim[] = [];
    pr.push({ t: 'line', x1: -1, y1: 0, x2: width + 1, y2: 0, w: 1.2, c: '#555' });
    if (res.params.base === 'slab' || res.params.base === 'ushp') pr.push({ t: 'poly', pts: [[-res.params.slabOver, 0], [width + res.params.slabOver, 0], [width + res.params.slabOver, -res.params.slabT], [-res.params.slabOver, -res.params.slabT]], fill: '#D8D5CE', c: '#888', w: 0.6, hatch: 'concrete' });
    if (res.params.base === 'strip') { const w2 = res.params.stripW / 2; pr.push({ t: 'poly', pts: [[-w2, 0], [width + w2, 0], [width + w2, -0.2], [-w2, -0.2]], fill: '#D8D5CE', c: '#888', w: 0.6, hatch: 'concrete' }); }
    if (res.params.base === 'deck') pr.push({ t: 'poly', pts: [[0, 0.02], [width, 0.02], [width, -0.2], [0, -0.2]], fill: '#C49A6C', c: '#7a5232', w: 0.6 });
    if (res.params.base === 'paving') pr.push({ t: 'poly', pts: [[-res.params.slabOver, 0], [width + res.params.slabOver, 0], [width + res.params.slabOver, -0.08], [-res.params.slabOver, -0.08]], fill: '#C9C4BA', c: '#888', w: 0.6 });
    // стена дома, если видна сбоку
    for (const hq of res.panels.filter((q) => q.kind === 'house')) {
      const ds = hq.pts.map(depth);
      if (ds.every((v) => v < 0.25)) continue;
      const hs = hq.pts.map(H); const h0 = Math.min(...hs), h1 = Math.max(...hs);
      if (h1 - h0 > 0.6) continue;
      const hx = (h0 + h1) / 2, out = hx < width / 2 ? -1 : 1;
      pr.push({ t: 'poly', pts: [[hx, -0.1], [hx + out * 0.35, -0.1], [hx + out * 0.35, hq.pts[2][2]], [hx, hq.pts[2][2]]], fill: '#E3D7C3', c: '#555', w: 0.8, hatch: 'concrete' });
      pr.push({ t: 'text', x: hx + out * 0.17, y: hq.pts[2][2] + 0.15, s: 'стена дома', size: 0.26, anchor: 'middle', c: '#555' });
    }
    // кровля — силуэт
    for (const r of res.panels.filter((p) => p.kind === 'roof')) {
      const pts = r.pts.map((q) => [H(q), q[2]] as [number, number]);
      const hs = pts.map((p) => p[0]); const zMax = Math.max(...pts.map((p) => p[1]));
      // огибающая: если кровля видна торцом — тонкая полоса, иначе — плоскость
      pr.push({ t: 'poly', pts: [...pts], fill: '#D9DCE0', c: '#333', w: 0.7 });
      void hs; void zMax;
    }
    // обшивка этой стороны
    const sidePanels = res.panels.filter((q) => ['prof', 'mesh', 'gate', 'door', 'window', 'poly', 'sandwich', 'wood'].includes(q.kind) && q.pts.every(near));
    const cladded = sidePanels.some((q) => q.kind === 'wood' || q.kind === 'sandwich' || q.kind === 'prof');
    for (const p of sidePanels) {
      const fill = p.kind === 'prof' || p.kind === 'sandwich' ? col : p.kind === 'gate' ? shade(col, 0.8) : p.kind === 'door' ? '#3a3d42' : p.kind === 'window' ? '#BFDCEB' : p.kind === 'poly' ? '#CFE3EE' : p.kind === 'wood' ? '#C49A6C' : undefined;
      pr.push({ t: 'poly', pts: p.pts.map((q) => [H(q), q[2]] as [number, number]), fill, c: '#333', w: p.kind === 'gate' || p.kind === 'door' || p.kind === 'window' ? 1.1 : 0.6, hatch: p.kind === 'prof' || p.kind === 'gate' ? 'prof' : p.kind === 'mesh' ? 'mesh' : undefined });
      const xs0 = p.pts.map((q) => H(q)), x0 = Math.min(...xs0), x1 = Math.max(...xs0), z0 = Math.min(...p.pts.map((q) => q[2])), z1 = Math.max(...p.pts.map((q) => q[2]));
      // имитация бруса / доска: горизонтальные доски 146 мм до нижней точки верха панели
      if (p.kind === 'wood') { const zTopMin = Math.min(...p.pts.filter((q) => q[2] > z0 + 0.01).map((q) => q[2])); for (let z = z0 + 0.146; z < zTopMin - 0.02; z += 0.146) pr.push({ t: 'line', x1: x0, y1: z, x2: x1, y2: z, w: 0.35, c: '#8a6440' }); }
      if (p.kind === 'window') {
        const m = (x0 + x1) / 2, f = 0.06;
        pr.push({ t: 'poly', pts: [[x0 - 0.07, z0 - 0.07], [x1 + 0.07, z0 - 0.07], [x1 + 0.07, z1 + 0.07], [x0 - 0.07, z1 + 0.07]], c: '#5a4128', w: 0.7 }); // наличник
        pr.push({ t: 'poly', pts: [[x0 + f, z0 + f], [m - 0.025, z0 + f], [m - 0.025, z1 - f], [x0 + f, z1 - f]], c: '#333', w: 0.6 });
        pr.push({ t: 'poly', pts: [[m + 0.025, z0 + f], [x1 - f, z0 + f], [x1 - f, z1 - f], [m + 0.025, z1 - f]], c: '#333', w: 0.6 });
        pr.push({ t: 'line', x1: m + 0.025, y1: z1 - f, x2: x1 - f, y2: (z0 + z1) / 2, w: 0.4, c: '#777', dash: true }); // открывание
        pr.push({ t: 'line', x1: x1 - f, y1: (z0 + z1) / 2, x2: m + 0.025, y2: z0 + f, w: 0.4, c: '#777', dash: true });
        pr.push({ t: 'poly', pts: [[x0 - 0.1, z0 - 0.07], [x1 + 0.1, z0 - 0.07], [x1 + 0.1, z0 - 0.11], [x0 - 0.1, z0 - 0.11]], fill: '#9aa0a6', c: '#555', w: 0.5 }); // отлив
      }
      if (p.kind === 'door') {
        pr.push({ t: 'poly', pts: [[x0 - 0.07, z0], [x1 + 0.07, z0], [x1 + 0.07, z1 + 0.07], [x0 - 0.07, z1 + 0.07]], c: '#5a4128', w: 0.7 }); // наличник
        pr.push({ t: 'poly', pts: [[x0 + 0.1, z0 + 0.15], [x1 - 0.1, z0 + 0.15], [x1 - 0.1, (z0 + z1) / 2 - 0.05], [x0 + 0.1, (z0 + z1) / 2 - 0.05]], c: '#888', w: 0.5 });
        pr.push({ t: 'poly', pts: [[x0 + 0.1, (z0 + z1) / 2 + 0.05], [x1 - 0.1, (z0 + z1) / 2 + 0.05], [x1 - 0.1, z1 - 0.12], [x0 + 0.1, z1 - 0.12]], c: '#888', w: 0.5 });
        pr.push({ t: 'poly', pts: [[x1 - 0.13, 0.98], [x1 - 0.08, 0.98], [x1 - 0.08, 1.06], [x1 - 0.13, 1.06]], fill: '#ddd', c: '#ddd', w: 0.5 }); // ручка
      }
      if (p.kind === 'gate' && res.params.gate === 'swing') { const xs = p.pts.map((q) => H(q)); const m = (Math.min(...xs) + Math.max(...xs)) / 2; pr.push({ t: 'line', x1: m, y1: 0.05, x2: m, y2: p.pts[2][2], w: 1, c: '#222' }); }
    }
    // каркас этой стороны (за сплошной обшивкой не показываем)
    for (const m of res.members.filter((q) => near(q.a) && near(q.b) && !(cladded && ['post', 'rail', 'frame', 'tie', 'beam'].includes(q.kind)))) {
      const [w] = sizeOf(m.profile);
      if (m.kind === 'post') pr.push({ t: 'poly', pts: [[H(m.a) - w / 2, 0], [H(m.a) + w / 2, 0], [H(m.b) + w / 2, m.b[2]], [H(m.b) - w / 2, m.b[2]]], fill: res.info.wood ? '#9C6B40' : shade(col, 1.3), c: '#222', w: 0.6 });
      else pr.push({ t: 'line', x1: H(m.a), y1: m.a[2], x2: H(m.b), y2: m.b[2], w: m.kind === 'web' || m.kind === 'rail' ? 0.8 : 1.4, c: '#222' });
    }
    // проёмы: марки и цепочка размеров от угла
    {
      const ops = res.openings.filter((o) => o.side === side).map((o) => { const a = (side === 'back' || side === 'left') ? width - o.a1 : o.a0; return { ...o, x0: a, x1: a + (o.a1 - o.a0) }; }).sort((a, b) => a.x0 - b.x0);
      let wn = 0, dn = 0;
      for (const o of ops) {
        const mark = o.kind === 'window' ? `ОК-${++wn}` : o.kind === 'door' ? `Д-${++dn}` : 'В-1';
        const zt = o.h, zb = o.z0 ?? 0;
        pr.push({ t: 'text', x: (o.x0 + o.x1) / 2, y: zt + 0.16, s: `${mark}  ${Math.round((o.x1 - o.x0) * 1000)}×${Math.round((zt - zb) * 1000)}`, size: 0.17, anchor: 'middle', c: '#1f5fae', bold: true });
        if (o.kind === 'window') pr.push({ t: 'dim', x1: o.x1 + 0.25, y1: 0, x2: o.x1 + 0.25, y2: zb, off: 0, s: `${Math.round(zb * 1000)}` });
      }
      if (ops.length) {
        const cuts = [0, ...ops.flatMap((o) => [o.x0, o.x1]), width];
        for (let i = 0; i < cuts.length - 1; i++) if (cuts[i + 1] - cuts[i] > 0.05) pr.push({ t: 'dim', x1: cuts[i], y1: 0, x2: cuts[i + 1], y2: 0, off: -0.5, s: `${Math.round((cuts[i + 1] - cuts[i]) * 1000)}` });
      }
    }
    // размеры: ширина и высоты по краям
    void posts;
    const corner = (h: number): [number, number] => (side === 'front' ? [h, 0] : side === 'back' ? [L - h, W] : side === 'left' ? [0, W - h] : [L, h]);
    const hL = Math.round(res.topAt(...corner(0)) * 100) / 100, hR = Math.round(res.topAt(...corner(width)) * 100) / 100;
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: width, y2: 0, off: -0.9, s: `${f2(width)} м` });
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: 0, y2: hL, off: -0.8, s: `${f2(hL)} м` });
    pr.push({ t: 'dim', x1: width, y1: 0, x2: width, y2: hR, off: 0.8, s: `${f2(hR)} м` });
    const wt = res.params.walls[side];
    const isHouse = res.params.attach && side === res.params.highSide;
    const ops = res.openings.filter((o) => o.side === side).map((o: any) => o.kind === 'gate' ? `ворота ${res.params.gate === 'sectional' ? 'секционные' : 'распашные'} ${f2(o.a1 - o.a0)}×${f2(o.h)} м` : o.kind === 'window' ? `окно ${f2(o.a1 - o.a0)}×${f2(o.h - (o.z0 || 0))} м` : `дверь ${f2(o.a1 - o.a0)}×${f2(o.h)} м`);
    const wtLabel = (isHouse ? 'со стороны дома (стена дома не показана)' : { open: 'открытая сторона', prof: `профлист ${res.params.profH} м`, prof_full: 'профлист на всю высоту', mesh: 'сетка на всю высоту', prof_mesh: `профлист ${res.params.profH} м + сетка до кровли`, rail: 'перила 1,0 м', poly: 'поликарбонат', sandwich: 'сэндвич-панели 100 мм', wood: 'обшивка доской', wood_low: 'доска до 1,0 м' }[wt]) + (ops.length ? `; ${ops.join(', ')}` : '');
    const [l1, l2] = wtLabel.split('; ');
    pr.push({ t: 'text', x: width / 2, y: -1.55, s: l1, size: 0.3, anchor: 'middle', c: '#555' });
    if (l2) pr.push({ t: 'text', x: width / 2, y: -1.95, s: l2, size: 0.3, anchor: 'middle', c: '#555' });
    const zTop = Math.max(res.info.hHigh, ...res.panels.filter((p) => p.kind === 'roof' || p.kind === 'house').flatMap((p) => p.pts.map((q) => q[2])));
    sheets.push({ title, x0: -2, y0: l2 ? -2.4 : -2.1, x1: width + 2, y1: zTop + 0.8, prims: pr });
  }

  // ---------- разрез ленточного фундамента (масштаб ×4, подписи — в реальных мм) ----------
  if (res.params.base === 'strip') {
    const K = 4;
    const w = res.params.stripW * K, h = res.params.stripD * K;
    const pr: Prim[] = [];
    const above = 0.2 * K, below = h - above, cush = 0.15 * K, side = 0.5 * K;
    pr.push({ t: 'poly', pts: [[-side, 0], [w + side, 0], [w + side, -below - cush - 0.25 * K], [-side, -below - cush - 0.25 * K]], fill: '#A88F6C', c: '#776', w: 0.4, hatch: 'soil' });
    pr.push({ t: 'poly', pts: [[-0.1 * K, -below], [w + 0.1 * K, -below], [w + 0.1 * K, -below - cush], [-0.1 * K, -below - cush]], fill: '#E7D9A8', c: '#444', w: 0.6, hatch: 'sand' });
    pr.push({ t: 'poly', pts: [[0, above], [w, above], [w, -below], [0, -below]], fill: '#D3D0C9', c: '#333', w: 1, hatch: 'concrete' });
    const c = 0.05 * K, r = 0.07;
    for (const [x, y] of [[c, above - c], [w - c, above - c], [c, -below + c], [w - c, -below + c]]) pr.push({ t: 'poly', pts: [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]], fill: '#222', c: '#222', w: 0.3 });
    pr.push({ t: 'poly', pts: [[c, -below + c], [w - c, -below + c], [w - c, above - c], [c, above - c]], c: '#555', w: 0.6 });
    pr.push({ t: 'line', x1: -side, y1: 0, x2: w + side, y2: 0, w: 1.4, c: '#333' });
    pr.push({ t: 'line', x1: -0.05, y1: -below, x2: -0.05, y2: above, w: 2, c: '#3a7bd5' });
    pr.push({ t: 'text', x: -side + 0.1, y: 0.12, s: 'уровень земли', size: 0.2, anchor: 'start', c: '#333' });
    pr.push({ t: 'dim', x1: 0, y1: -below - cush, x2: w, y2: -below - cush, off: -0.55, s: `${Math.round(res.params.stripW * 1000)} мм` });
    pr.push({ t: 'dim', x1: w, y1: -below, x2: w, y2: above, off: side + 0.4, s: `${Math.round(res.params.stripD * 1000)} мм` });
    const tx = w + side + 1.0;
    pr.push({ t: 'text', x: tx, y: above - 0.2, s: 'Бетон М300', size: 0.2, anchor: 'start', bold: true });
    pr.push({ t: 'text', x: tx, y: above - 0.5, s: '4 стержня Ø12 А500, хомуты Ø8 шаг 400', size: 0.18, anchor: 'start' });
    pr.push({ t: 'text', x: tx, y: above - 0.8, s: 'гидроизоляция обмазочная', size: 0.18, anchor: 'start', c: '#3a7bd5' });
    pr.push({ t: 'text', x: tx, y: -below - cush / 2 - 0.05, s: `песчаная подушка ${Math.round(150)} мм`, size: 0.18, anchor: 'start' });
    pr.push({ t: 'text', x: tx, y: -below - cush - 0.6, s: 'обратная засыпка грунтом', size: 0.18, anchor: 'start', c: '#555' });
    sheets.push({ title: 'Разрез ленточного фундамента', x0: -side - 0.3, y0: -below - cush - 0.25 * K - 0.9, x1: tx + 4.3, y1: above + 0.4, prims: pr });
  }
  // ---------- разрез основания ----------
  if (res.params.base === 'slab' || res.params.base === 'ushp') {
    const { slabT, sand, gravel } = res.params;
    const pr: Prim[] = [];
    const w = 4, vf = 4; // толщины слоёв показаны крупнее (×4), подписи — в реальных мм
    let z = 0;
    const layer = (h: number, name: string, hatch: any, fill: string) => {
      pr.push({ t: 'poly', pts: [[0, z], [w, z], [w, z - h * vf], [0, z - h * vf]], fill, c: '#444', w: 0.6, hatch });
      pr.push({ t: 'text', x: w + 0.25, y: z - (h * vf) / 2 + (h * vf > 0.7 ? -0.08 : 0.12), s: `${name} — ${Math.round(h * 1000)} мм`, size: 0.2, anchor: 'start' });
      z -= h * vf;
    };
    const ushp = res.params.base === 'ushp';
    layer(slabT, ushp ? 'Плита УШП, бетон М300, 2 сетки А500 Ø12' : `Бетон М300, арм. ${res.params.rebar === 'composite' ? 'композит Ø8' : 'А500 Ø12'} 200×200`, 'concrete', '#D3D0C9');
    if (ushp) layer(res.params.eps, 'Утеплитель ЭППС', undefined, '#F4CF8A');
    else {
      pr.push({ t: 'line', x1: 0, y1: z, x2: w, y2: z, w: 2, c: '#3a7bd5' });
      pr.push({ t: 'text', x: w + 0.25, y: z - 0.2, s: 'плёнка полиэтиленовая 200 мкм', size: 0.17, anchor: 'start', c: '#3a7bd5' });
      layer(gravel, 'Щебень фр. 20–40, уплотнение', 'gravel', '#BDB6A8');
    }
    layer(sand, 'Песок крупный/средний, уплотнение', 'sand', '#E7D9A8');
    pr.push({ t: 'line', x1: 0, y1: z, x2: w, y2: z, w: 2, c: '#2a6' });
    pr.push({ t: 'text', x: w + 0.25, y: z - 0.12, s: 'Геотекстиль 200 г/м²', size: 0.18, anchor: 'start', c: '#2a6' });
    pr.push({ t: 'poly', pts: [[0, z], [w, z], [w, z - 0.6], [0, z - 0.6]], fill: '#A88F6C', c: '#776', w: 0.4, hatch: 'soil' });
    pr.push({ t: 'text', x: w + 0.25, y: z - 0.45, s: 'Уплотнённый грунт', size: 0.18, anchor: 'start', c: '#555' });
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: 0, y2: z, off: -0.45, s: `${Math.round((slabT + sand + (ushp ? res.params.eps : gravel)) * 1000)} мм` });
    z -= 0.6;
    sheets.push({ title: ushp ? 'Разрез УШП (толщины условно ×4)' : 'Разрез основания (толщины условно ×4)', x0: -1.1, y0: z - 0.2, x1: w + 6.2, y1: 0.4, prims: pr });
  }
  const pq: any = res.params;
  sheets.push(...(pq.base === 'floor' && sheets.some((x) => x.title === 'Разрез 1-1') ? wallNodes(res) : nodeSheets(res)));
  // ---------- состав стены, пола и кровли (утеплённая постройка) ----------
  const pp: any = res.params;
  if ((pp.insulate && Object.values(walls).some((w) => w === 'wood' || w === 'prof_full')) || pp.base === 'floor') sheets.push(compositionSheet(res));
  return sheets;
}

// ---------------------------------------------------------------- SVG
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function view3dToSvg(v: View3D, bg = 'transparent') {
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v.w} ${v.h}" width="100%" style="display:block;background:${bg}">`];
  for (const it of v.items) {
    if (it.k === 'p') out.push(`<polygon points="${it.pts.map((p) => p.join(',')).join(' ')}" fill="${it.fill}" fill-opacity="${it.opacity}" stroke="${it.stroke}" stroke-width="${it.sw}" stroke-linejoin="round"/>`);
    else out.push(`<line x1="${it.a[0]}" y1="${it.a[1]}" x2="${it.b[0]}" y2="${it.b[1]}" stroke="${it.stroke}" stroke-width="${it.sw}" stroke-opacity="${it.opacity}"/>`);
  }
  out.push('</svg>');
  return out.join('');
}

/** Чертёжный лист → SVG. Масштаб: px на метр подбирается под ширину. */
export function sheetToSvg(sh: Sheet, pxWidth = 800, dark = false) {
  const ink = dark ? '#E8E4DC' : '#222';
  const k = pxWidth / (sh.x1 - sh.x0);
  const H = (sh.y1 - sh.y0) * k;
  const X = (x: number) => Math.round((x - sh.x0) * k * 10) / 10;
  const Y = (y: number) => Math.round((sh.y1 - y) * k * 10) / 10;
  const fs = (m: number) => Math.max(9, Math.round(m * k));
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pxWidth} ${Math.round(H)}" width="100%" style="display:block" font-family="Arial, sans-serif">`,
    `<defs>
      <pattern id="h-prof" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="none"/><line x1="3" y1="0" x2="3" y2="6" stroke="#000" stroke-opacity=".25" stroke-width="1"/></pattern>
      <pattern id="h-mesh" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 0H8V8" fill="none" stroke="${ink}" stroke-opacity=".45" stroke-width=".7"/></pattern>
      <pattern id="h-concrete" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".9" fill="#000" fill-opacity=".25"/><circle cx="7" cy="7" r=".7" fill="#000" fill-opacity=".2"/></pattern>
      <pattern id="h-sand" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".6" fill="#000" fill-opacity=".3"/><circle cx="4.5" cy="4" r=".5" fill="#000" fill-opacity=".25"/></pattern>
      <pattern id="h-gravel" width="12" height="10" patternUnits="userSpaceOnUse"><ellipse cx="4" cy="4" rx="3" ry="2" fill="none" stroke="#000" stroke-opacity=".35"/><ellipse cx="10" cy="8" rx="2" ry="1.5" fill="none" stroke="#000" stroke-opacity=".3"/></pattern>
      <pattern id="h-soil" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 10L10 0" stroke="#000" stroke-opacity=".3"/></pattern>
    </defs>`];
  for (const p of sh.prims) {
    if (p.t === 'line') out.push(`<line x1="${X(p.x1)}" y1="${Y(p.y1)}" x2="${X(p.x2)}" y2="${Y(p.y2)}" stroke="${p.c && p.c !== '#222' ? p.c : ink}" stroke-width="${p.w ?? 1}"${p.dash ? ' stroke-dasharray="6 4"' : ''}/>`);
    if (p.t === 'poly') {
      const pts = p.pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
      out.push(`<polygon points="${pts}" fill="${p.fill || 'none'}" stroke="${p.c && p.c !== '#222' && p.c !== '#333' ? p.c : ink}" stroke-width="${p.w ?? 1}"/>`);
      if (p.hatch) out.push(`<polygon points="${pts}" fill="url(#h-${p.hatch})" stroke="none"/>`);
    }
    if (p.t === 'text') out.push(`<text x="${X(p.x)}" y="${Y(p.y)}" font-size="${fs(p.size ?? 0.3)}" text-anchor="${p.anchor || 'start'}" fill="${p.c && !dark ? p.c : ink}"${p.bold ? ' font-weight="bold"' : ''}${p.rot ? ` transform="rotate(${-p.rot} ${X(p.x)} ${Y(p.y)})"` : ''}>${esc(p.s)}</text>`);
    if (p.t === 'dim') {
      const vert = Math.abs(p.x1 - p.x2) < 1e-6;
      const [ax, ay, bx, by] = vert ? [p.x1 + p.off, p.y1, p.x2 + p.off, p.y2] : [p.x1, p.y1 + p.off, p.x2, p.y2 + p.off];
      const c = dark ? '#7fb4ff' : '#1f5fae';
      out.push(`<line x1="${X(p.x1)}" y1="${Y(p.y1)}" x2="${X(ax)}" y2="${Y(ay)}" stroke="${c}" stroke-width=".6"/><line x1="${X(p.x2)}" y1="${Y(p.y2)}" x2="${X(bx)}" y2="${Y(by)}" stroke="${c}" stroke-width=".6"/>`);
      out.push(`<line x1="${X(ax)}" y1="${Y(ay)}" x2="${X(bx)}" y2="${Y(by)}" stroke="${c}" stroke-width="1"/>`);
      for (const [x, y] of [[ax, ay], [bx, by]]) out.push(`<line x1="${X(x) - 4}" y1="${Y(y) + 4}" x2="${X(x) + 4}" y2="${Y(y) - 4}" stroke="${c}" stroke-width="1.4"/>`);
      const mx = (X(ax) + X(bx)) / 2, my = (Y(ay) + Y(by)) / 2;
      out.push(vert
        ? `<text x="${mx - 4}" y="${my}" font-size="${fs(0.28)}" fill="${c}" text-anchor="middle" transform="rotate(-90 ${mx - 4} ${my})">${esc(p.s)}</text>`
        : `<text x="${mx}" y="${my - 4}" font-size="${fs(0.28)}" fill="${c}" text-anchor="middle">${esc(p.s)}</text>`);
    }
  }
  out.push('</svg>');
  return out.join('');
}

// ---------------------------------------------------------------- Узлы
/** Типовые узлы в масштабе (×5): опора столба, столб — обвязка, стропило — обвязка, связь. Подписи — реальные сечения. */
// ---------------------------------------------------------------- узлы каркасной утеплённой постройки (единица = 100 мм, М 1:5 условно)
function wallNodes(res: CanopyResult): Sheet[] {
  const p: any = res.params, i: any = res.info;
  const ins = !!p.insulate;
  const WOOD = '#DDBE8E', WOOD2 = '#C49A6C', INS = '#F3E39A', MEMB = '#2f6db5', VAP = '#C0392B', CONC = '#D2CFC8';
  const lining = p.lining === 'osb' ? 'OSB-3 12 мм' : 'Вагонка 12,5 мм';
  const rB = Number(String(i.rafterProf || '50×200').split('×')[1]) / 100 || 2;
  const out: Sheet[] = [];
  const mk = () => {
    const pr: Prim[] = [];
    const R = (x0: number, z0: number, x1: number, z1: number, fill: string, hatch?: any, c = '#333', w = 0.7) => pr.push({ t: 'poly', pts: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], fill, c, w, hatch });
    const Lq = (x1: number, y1: number, x2: number, y2: number, c = '#333', w = 0.7, dash = false) => pr.push({ t: 'line', x1, y1, x2, y2, c, w, dash });
    const cross = (x0: number, z0: number, x1: number, z1: number) => { Lq(x0, z0, x1, z1, '#7a5232', 0.35); Lq(x0, z1, x1, z0, '#7a5232', 0.35); }; // брус в сечении
    const grain = (x0: number, z0: number, x1: number, z1: number) => { for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.9) Lq(x, (z0 + z1) / 2 + 0.03, x + 0.45, (z0 + z1) / 2 - 0.03, '#9b7a4c', 0.3); };
    const notes: { x: number; z: number; s: string }[] = [];
    const tag = (x: number, z: number, s: string) => notes.push({ x, z, s });
    const finish = (title: string, tx: number, ztop: number, zbot: number, x0: number, extra?: string) => {
      notes.sort((a, b) => b.z - a.z);
      const n = notes.length, step = Math.min(0.95, (ztop - zbot) / Math.max(1, n - 1));
      notes.forEach((nt, k) => {
        const ty = ztop - k * step;
        pr.push({ t: 'poly', pts: circle(nt.x, nt.z, 0.06, 10), fill: '#222', c: '#222', w: 0.3 });
        pr.push({ t: 'line', x1: nt.x, y1: nt.z, x2: tx - 0.3, y2: ty, w: 0.35, c: '#333' });
        pr.push({ t: 'line', x1: tx - 0.3, y1: ty, x2: tx, y2: ty, w: 0.35, c: '#333' });
        pr.push({ t: 'text', x: tx + 0.1, y: ty - 0.1, s: `${k + 1}. ${nt.s}`, size: 0.28 });
      });
      if (extra) pr.push({ t: 'text', x: x0, y: zbot - 1.2, s: extra, size: 0.27, c: '#555' });
      return { title, prims: pr };
    };
    return { pr, R, Lq, cross, grain, tag, finish };
  };

  // ---------- Узел 1: стена — ростверк — пол ----------
  {
    const { pr, R, Lq, cross, grain, tag, finish } = mk();
    const blocks = p.floorOn === 'blocks';
    // грунт, подсыпка, опора
    R(-4, -6.2, 9, -5.5, '#E7D9A8', 'sand', '#776', 0.4);
    R(-4, -7.2, 9, -6.2, '#A88F6C', 'soil', '#776', 0.4);
    Lq(-4, -5.5, 9, -5.5, '#333', 1.2);
    if (blocks) R(-0.75, -5.5, 2.25, -1.5, CONC, 'concrete'); else R(0.3, -7.2, 1.2, -1.5, '#9aa0a6');
    R(-0.75, -1.56, 2.25, -1.5, '#222', undefined, '#222', 0.4); // рубероид
    // ростверк 150×150
    R(-0.25, -1.5, 1.25, 0, WOOD2, undefined, '#5a3d22', 0.9); cross(-0.25, -1.5, 1.25, 0);
    R(-0.25, 0, 1.25, 0.06, '#222', undefined, '#222', 0.4); // отсечка
    // нижняя обвязка 50×100 плашмя и стойка
    R(0, 0.06, 1, 0.56, WOOD2, undefined, '#5a3d22', 0.9); cross(0, 0.06, 1, 0.56);
    R(0, 0.56, 0.5, 6.5, WOOD, undefined, '#5a3d22', 0.8); grain(0, 0.56, 0.5, 6.5);
    if (ins) R(0.5, 0.56, 1, 6.5, INS, 'sand', '#999', 0.4);
    // снаружи: мембрана, контррейка, обшивка
    Lq(-0.02, 0.06, -0.02, 6.5, MEMB, 1.2);
    R(-0.27, 0.06, -0.02, 6.5, '#ffffff', undefined, '#999', 0.4);
    R(-0.45, -0.6, -0.27, 6.5, WOOD, undefined, '#5a3d22', 0.8);
    for (let z = -0.6 + 1.46; z < 6.4; z += 1.46) Lq(-0.45, z, -0.27, z, '#5a3d22', 0.4);
    Lq(-0.27, -0.6, -0.02, -0.6, '#555', 0.6, true); // сетка от грызунов
    // внутри: пароизоляция, вагонка, плинтус
    Lq(1.02, 0.24, 1.02, 6.5, VAP, 1.2);
    R(1.03, 0.24, 1.155, 6.5, WOOD, undefined, '#5a3d22', 0.6);

    // пол: лага 50×150, черновой пол на черепном бруске, утеплитель, мембрана, пароизоляция, OSB
    R(1.25, -1.5, 1.75, 0, WOOD2, undefined, '#5a3d22', 0.8); cross(1.25, -1.5, 1.75, 0);
    R(1.75, -1.5, 2.25, -1.0, WOOD2, undefined, '#5a3d22', 0.5); cross(1.75, -1.5, 2.25, -1.0);
    R(1.75, -1.0, 8.5, -0.75, WOOD, undefined, '#5a3d22', 0.6); grain(2.25, -1.0, 8.5, -0.75);
    Lq(1.75, -0.73, 8.5, -0.73, MEMB, 1.2);
    if (ins) R(1.75, -0.72, 8.5, 0, INS, 'sand', '#999', 0.4);
    Lq(1.0, 0.03, 8.5, 0.03, VAP, 1.2);
    R(1.0, 0.06, 8.5, p.floorTop === 'board' ? 0.42 : 0.24, '#E2C48F', undefined, '#5a3d22', 0.7);
    { const ft = p.floorTop === 'board' ? 0.42 : 0.24; R(1.155, ft, 1.35, ft + 0.5, WOOD2, undefined, '#5a3d22', 0.5); }
    if (p.floorTop === 'board') for (let x = 2.36; x < 8.5; x += 1.36) Lq(x, 0.06, x, 0.42, '#5a3d22', 0.5);
    Lq(8.5, -1.0, 8.5, 0.24, '#333', 0.5, true);
    // продух
    pr.push({ t: 'text', x: 4.5, y: -3.6, s: 'проветриваемое подполье (продухи)', size: 0.27, anchor: 'middle', c: '#555' });
    // отметка пола
    pr.push({ t: 'poly', pts: [[7.5, 0.24], [7.35, 0.5], [7.65, 0.5]], fill: '#fff', c: '#222', w: 0.5 });
    pr.push({ t: 'line', x1: 7.35, y1: 0.5, x2: 8.9, y2: 0.5, w: 0.4 });
    pr.push({ t: 'text', x: 7.6, y: 0.6, s: '±0,000', size: 0.27 });
    pr.push({ t: 'dim', x1: -0.45, y1: 6.5, x2: 1.155, y2: 6.5, off: 0.5, s: '≈160' });
    tag(-0.36, 4.5, 'Имитация бруса 18–20 мм, нижний край с напуском 50 мм на ростверк');
    tag(-0.15, 3.6, 'Контррейка 25×50 — вентзазор 25 мм');
    tag(-0.02, 2.7, 'Ветро-влагозащитная мембрана, нахлёст 100 мм');
    tag(0.25, 4.0, `Стойка 50×100 шаг ${String(p.postStep).replace('.', ',')} м${ins ? ' + минвата 100 мм' : ''}`);
    tag(1.02, 5.2, 'Пароизоляция, стыки на скотч');
    tag(1.09, 5.8, lining);
    tag(0.5, 0.3, 'Нижняя обвязка 50×100, антисептик');
    tag(0.6, 0.03, 'Отсечная гидроизоляция (рубероид 2 слоя)');
    tag(5, 0.15, p.floorTop === 'board' ? 'Доска пола шпунтованная 36×136 по пароизоляции' : 'OSB-3 18 мм — чистовой пол по пароизоляции');
    tag(1.5, -0.5, 'Лага 50×150 шаг 0,5 м');
    tag(5, -0.36, ins ? 'Утеплитель 150 мм между лагами' : 'Пространство между лагами');
    tag(5, -0.73, 'Ветро-влагозащитная мембрана');
    tag(5, -0.88, 'Черновой пол 25 мм на черепном бруске 50×50');
    tag(0.5, -0.9, 'Ростверк — брус 150×150, антисептик');
    tag(-0.14, -0.6, 'Сетка от грызунов в нижнем продухе');
    tag(0.75, -3, blocks ? 'Блок 200×200×400 на подушке ПГС 100 мм' : 'Винтовая свая Ø89 с оголовком');
    const { title, prims } = finish('Узел 1. Стена — ростверк — пол', 10, 6.3, -6.3, -4, 'Все деревянные элементы — антисептик. Мембрана снаружи утеплителя, пароизоляция — с тёплой стороны.');
    out.push({ title, x0: -4.3, y0: -8.2, x1: 24, y1: 7.4, prims });
  }

  // ---------- Узел 2: карниз — стена, стропило, кровля ----------
  {
    const { pr, R, Lq, grain, tag, finish } = mk();
    const s = Math.max(0.03, Math.min(0.25, (i.hHigh - i.hLow) / (i.span || 2.4)));
    const ovr = (p.overhang ?? 0.3) * 10;
    const zr = (x: number) => 0.6 + (x - 0.0) * s; // низ стропила
    // стена (снизу обрыв)
    R(0, -4, 0.5, 0.1, WOOD, undefined, '#5a3d22', 0.8); grain(0, -4, 0.5, 0.1);
    if (ins) R(0.5, -4, 1, 0.1, INS, 'sand', '#999', 0.4);
    R(0, 0.1, 1, 0.6, WOOD2, undefined, '#5a3d22', 0.9); // верхняя обвязка
    Lq(0, 0.1, 1, 0.6, '#7a5232', 0.35); Lq(0, 0.6, 1, 0.1, '#7a5232', 0.35);
    Lq(-0.02, -4, -0.02, 0.6, MEMB, 1.2);
    R(-0.27, -4, -0.02, -0.5, '#ffffff', undefined, '#999', 0.4);
    R(-0.45, -4, -0.27, -0.5, WOOD, undefined, '#5a3d22', 0.8);
    for (let z = -4 + 1.46; z < -0.5; z += 1.46) Lq(-0.45, z, -0.27, z, '#5a3d22', 0.4);
    Lq(1.02, -4, 1.02, zr(1.02), VAP, 1.2);
    R(1.03, -4, 1.155, zr(1.03) - 0.02, WOOD, undefined, '#5a3d22', 0.6);
    // стропило 50×rB, вынос ovr
    const x0 = -ovr, x1 = 9;
    pr.push({ t: 'poly', pts: [[x0, zr(x0)], [x1, zr(x1)], [x1, zr(x1) + rB], [x0, zr(x0) + rB]], fill: WOOD2, c: '#5a3d22', w: 0.9 });
    grain(x0, zr(x0) + 0.4, 1.1, zr(x0) + rB * 0.7);
    // потолок: утеплитель, пароизоляция, вагонка
    if (ins) { // в пролёте между стропилами: утеплитель 100 мм снизу, стропило — пунктиром за плоскостью разреза
      pr.push({ t: 'poly', pts: [[1.155, zr(1.155)], [x1, zr(x1)], [x1, zr(x1) + 1], [1.155, zr(1.155) + 1]], fill: INS, c: '#999', w: 0.4, hatch: 'sand' });
      pr.push({ t: 'poly', pts: [[1.155, zr(1.155) + 1], [x1, zr(x1) + 1], [x1, zr(x1) + rB], [1.155, zr(1.155) + rB]], fill: '#ffffff', c: '#bbb', w: 0.3 });
      Lq(1.155, zr(1.155) + rB * 0.98, x1, zr(x1) + rB * 0.98, '#5a3d22', 0.4, true); Lq(1.155, zr(1.155) + 0.02, x1, zr(x1) + 0.02, '#5a3d22', 0.4, true);
    }
    Lq(1.155, zr(1.155) - 0.03, x1, zr(x1) - 0.03, VAP, 1.2);
    pr.push({ t: 'poly', pts: [[1.155, zr(1.155) - 0.05], [x1, zr(x1) - 0.05], [x1, zr(x1) - 0.175], [1.155, zr(1.155) - 0.175]], fill: WOOD, c: '#5a3d22', w: 0.6 });
    // мембрана, контробрешётка, обрешётка, профнастил
    const zt = (x: number) => zr(x) + rB;
    Lq(x0, zt(x0) + 0.02, x1, zt(x1) + 0.02, MEMB, 1.2);
    pr.push({ t: 'poly', pts: [[x0, zt(x0) + 0.03], [x1, zt(x1) + 0.03], [x1, zt(x1) + 0.33], [x0, zt(x0) + 0.33]], fill: '#ffffff', c: '#999', w: 0.4 });
    for (let x = x0 + 0.3; x < x1 - 0.5; x += 3.5) pr.push({ t: 'poly', pts: [[x, zt(x) + 0.33], [x + 1, zt(x + 1) + 0.33], [x + 1, zt(x + 1) + 0.58], [x, zt(x) + 0.58]], fill: WOOD, c: '#5a3d22', w: 0.6 });
    // профнастил С-20: трапеция
    const pf: [number, number][] = [];
    for (let x = x0 - 0.5; x <= x1; x += 0.6875) { const b = zt(x) + 0.6; pf.push([x, b], [x + 0.17, b + 0.2], [x + 0.52, b + 0.2], [x + 0.6875, b]); }
    for (let k = 0; k < pf.length - 1; k++) pr.push({ t: 'line', x1: pf[k][0], y1: pf[k][1], x2: pf[k + 1][0], y2: pf[k + 1][1], w: 1.0, c: '#5a3a30' });
    // лобовая доска, софит, капельник
    const zf0 = zr(x0) - 0.2, zf1 = zt(x0) + 0.3;
    R(x0 - 0.25, zf0, x0, zf1, WOOD, undefined, '#5a3d22', 0.8);
    R(x0, zf0, -0.45, zf0 + 0.2, WOOD, undefined, '#5a3d22', 0.6); // подшивка карниза
    for (let x = x0 + 0.4; x < -0.6; x += 0.6) Lq(x, zf0 + 0.04, x + 0.15, zf0 + 0.16, '#555', 0.4); // перфорация
    pr.push({ t: 'line', x1: x0 - 0.5, y1: zt(x0 - 0.5) + 0.6, x2: x0 - 0.5, y2: zt(x0 - 0.5) + 0.25, w: 1.0, c: '#5a3a30' }); // капельник
    // стрелки вентиляции
    for (const [ax, az, bx, bz] of [[-0.15, -1.5, -0.15, 0.5], [-1.5, zf0 - 0.5, -1.5, zf0 + 0.6]] as number[][]) { Lq(ax, az, bx, bz, '#2a8a4a', 0.8); Lq(bx, bz, bx - 0.12, bz - 0.25, '#2a8a4a', 0.8); Lq(bx, bz, bx + 0.12, bz - 0.25, '#2a8a4a', 0.8); }
    pr.push({ t: 'dim', x1: x0 - 0.25, y1: zf0, x2: -0.45, y2: zf0, off: -1.0, s: `${Math.round(ovr * 100)}` });
    tag(x1 - 2, zt(x1 - 2) + 0.75, `${p.cover === 'tile' ? 'Металлочерепица' : 'Профнастил С-20'}, саморезы 4,8×35 через волну`);
    tag(x1 - 4.3, zt(x1 - 4.3) + 0.45, 'Обрешётка 25×100 шаг 350 мм');
    tag(x1 - 1, zt(x1 - 1) + 0.2, 'Контробрешётка 30×50 — вентзазор');
    tag(x1 - 3, zt(x1 - 3) + 0.02, 'Гидро-ветрозащитная мембрана');
    tag(5, zr(5) + rB * 0.5, `Стропило ${i.rafterProf || '50×200'} шаг 0,6 м${ins ? ' + минвата 100 мм' : ''}`);
    tag(6, zr(6) - 0.03, 'Пароизоляция, стыки на скотч');
    tag(7, zr(7) - 0.11, `Потолок: ${lining.toLowerCase()}`);
    tag(0.5, 0.35, 'Верхняя обвязка 50×100, крепление стропила уголком / скобой');
    tag(x0 - 0.12, zf1 - 0.3, 'Лобовая доска 25×150');
    tag(x0 - 0.5, zt(x0 - 0.5) + 0.4, 'Капельник / карнизная планка');
    tag(-1.2, zf0 + 0.1, 'Подшивка карниза (софит) с перфорацией');
    tag(-0.15, -1.5, 'Выход вентзазора стены под карниз');
    tag(-0.36, -3, 'Обшивка стены — имитация бруса');
    tag(0.75, -2.5, ins ? 'Стойка + минвата 100 мм' : 'Стойка каркаса');
    const { title, prims } = finish('Узел 2. Карниз: стена — стропило — кровля', 11.5, 5.0, -4.2, x0 - 0.8, 'Уклон и вынос — по проекту. Вентзазоры стены и кровли сообщаются с наружным воздухом.');
    out.push({ title, x0: x0 - 1.0, y0: -5.8, x1: 27, y1: 5.6, prims });
  }
  return out;
}

function nodeSheets(res: CanopyResult): Sheet[] {
  const K = 5;
  const P = res.params, I = res.info;
  const wood = !!I.wood;
  const mm = (v: number) => (v / 1000) * K;
  const sz = (prof: string) => { const [a, b] = String(prof || '100×100').split('×').map(Number); return [a || 100, b || a || 100]; };
  const out: Sheet[] = [];
  const steelC = '#C9CED6', woodC = '#D9B48A', concC = '#D3D0C9';
  const rect = (pr: Prim[], x: number, y: number, w: number, h: number, fill: string, hatch?: any, c = '#222', wd = 0.9) => pr.push({ t: 'poly', pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, c, w: wd, hatch });
  const label = (pr: Prim[], x: number, y: number, tx: number, ty: number, text: string) => {
    pr.push({ t: 'line', x1: x, y1: y, x2: tx - 0.1, y2: ty, w: 0.6, c: '#555' });
    pr.push({ t: 'text', x: tx, y: ty - 0.07, s: text, size: 0.2, anchor: 'start' });
  };

  // ---- Узел 1. Опора столба
  {
    const pr: Prim[] = [];
    const [pa] = sz(I.postProf);
    const pw = mm(pa);
    const base = P.base;
    const x0 = -pw / 2;
    // основание
    const concrete = ['slab', 'ushp', 'strip', 'none', 'paving', 'piles'].includes(base);
    if (base === 'piles' || base === 'paving') {
      rect(pr, -mm(150), -mm(1500) , mm(300), mm(1500), concC, 'concrete', '#555', 0.8);
      pr.push({ t: 'poly', pts: [[-2.2, 0], [2.2, 0], [2.2, -mm(1600)], [-2.2, -mm(1600)]], c: '#A88F6C', w: 0.3, hatch: 'soil' });
      rect(pr, -mm(150), -mm(1500), mm(300), mm(1500), concC, 'concrete', '#555', 0.8);
      rect(pr, x0, -mm(1200), pw, mm(1200) + 2.6, wood ? woodC : steelC);
      label(pr, 0, -mm(700), 1.6, -1.5, `Бетонирование: свая Ø300, глубина 1500 мм, бетон М300`);
      label(pr, pw / 2, 1.6, 1.6, 1.6, `Столб ${I.postProf}${wood ? ' (брус)' : ''}, заглубление 1200 мм`);
      pr.push({ t: 'line', x1: -2.2, y1: 0, x2: 2.2, y2: 0, w: 1.4, c: '#333' });
      out.push({ title: 'Узел 1. Опора столба (бетонирование)', x0: -2.6, y0: -mm(1600) - 0.4, x1: 7.4, y1: 3, prims: pr });
    } else if (base === 'screw' || base === 'deck') {
      pr.push({ t: 'poly', pts: [[-2, 0], [2, 0], [2, -2.2], [-2, -2.2]], c: '#A88F6C', w: 0.3, hatch: 'soil' });
      rect(pr, -mm(54), -2.2, mm(108), 2.2 + mm(100), '#AEB4BC');
      rect(pr, -mm(100), mm(100), mm(200), mm(8), steelC);
      rect(pr, x0, mm(108), pw, 2.4, wood ? woodC : steelC);
      label(pr, 0, -1.1, 1.4, -1.1, 'Свая винтовая Ø108×4, L 2500 мм');
      label(pr, mm(100), mm(104), 1.4, 0.3, 'Оголовок 200×200×8, сварка / болты М12');
      label(pr, pw / 2, 1.5, 1.4, 1.5, `Столб ${I.postProf}`);
      pr.push({ t: 'line', x1: -2, y1: 0, x2: 2, y2: 0, w: 1.4, c: '#333' });
      out.push({ title: 'Узел 1. Опора столба на винтовой свае', x0: -2.3, y0: -2.5, x1: 7.2, y1: 2.9, prims: pr });
    } else if (concrete) {
      const plate = mm(Math.max(300, pa + 160)), pt = mm(10);
      rect(pr, -2.2, -1.4, 4.4, 1.4, concC, 'concrete', '#777', 0.6);
      rect(pr, -plate / 2, 0, plate, pt, '#9AA3AD');
      if (wood) {
        rect(pr, -pw / 2 - mm(4), pt, mm(4), mm(150), '#9AA3AD');
        rect(pr, pw / 2, pt, mm(4), mm(150), '#9AA3AD');
        rect(pr, x0, pt + mm(60), pw, 2.2, woodC);
        pr.push({ t: 'line', x1: -pw / 2 - 0.2, y1: pt + mm(110), x2: pw / 2 + 0.2, y2: pt + mm(110), w: 1.4, c: '#333' });
        label(pr, pw / 2, pt + mm(110), 1.6, 0.9, 'Опора П-образная, болт М12 насквозь');
        label(pr, pw / 2, 1.8, 1.6, 1.8, `Столб — брус ${I.postProf}, зазор 60 мм от бетона`);
      } else {
        rect(pr, x0, pt, pw, 2.4, steelC);
        for (const sg of [-1, 1]) pr.push({ t: 'poly', pts: [[sg * pw / 2, pt], [sg * (pw / 2 + mm(80)), pt], [sg * pw / 2, pt + mm(150)]], fill: '#9AA3AD', c: '#222', w: 0.8 });
        label(pr, pw / 2, 1.9, 1.6, 1.9, `Столб ${I.postProf}, сварка по контуру`);
        label(pr, pw / 2 + mm(40), pt + mm(60), 1.6, 1.1, 'Рёбра жёсткости 80×150×6 — 4 шт');
      }
      for (const sg of [-1, 1]) pr.push({ t: 'line', x1: sg * (plate / 2 - mm(40)), y1: pt + mm(30), x2: sg * (plate / 2 - mm(40)), y2: -mm(250), w: 1.6, c: '#333', dash: true });
      label(pr, plate / 2, pt / 2, 1.6, 0.35, `Пластина ${Math.round(Math.max(300, pa + 160))}×${Math.round(Math.max(300, pa + 160))}×10`);
      label(pr, plate / 2 - mm(40), -mm(150), 1.6, -0.45, 'Анкер М16×250 — 4 шт (химический или закладной)');
      label(pr, 0, -1.0, 1.6, -1.1, base === 'strip' ? 'Лента фундамента, бетон М300' : base === 'none' ? 'Существующее основание' : 'Плита, бетон М300');
      pr.push({ t: 'dim', x1: -plate / 2, y1: 0, x2: plate / 2, y2: 0, off: -1.65, s: `${Math.round(Math.max(300, pa + 160))} мм` });
      out.push({ title: 'Узел 1. Опора столба', x0: -2.5, y0: -2.1, x1: 8.2, y1: 2.9, prims: pr });
    }
  }

  // ---- Узел 2. Столб — обвязка
  if (I.posts > 0) {
    const pr: Prim[] = [];
    const [pa] = sz(I.postProf), [bh, bw] = sz(I.beamProf);
    const pw = mm(pa), H = mm(bh), Bw = mm(bw);
    rect(pr, -pw / 2, -2.2, pw, 2.2, wood ? woodC : steelC);
    if (!wood) rect(pr, -pw / 2 - mm(20), 0, pw + mm(40), mm(8), '#9AA3AD');
    const z = wood ? 0 : mm(8);
    rect(pr, -2.4, z, 4.8, H, wood ? woodC : steelC, undefined, '#222', 1);
    pr.push({ t: 'line', x1: -2.4, y1: z + mm(wood ? 0 : 3), x2: 2.4, y2: z + mm(wood ? 0 : 3), w: 0.4, c: '#666' });
    if (wood) { rect(pr, pw / 2, -mm(90), mm(5), mm(90) + H * 0.6, '#9AA3AD'); rect(pr, -pw / 2 - mm(5), -mm(90), mm(5), mm(90) + H * 0.6, '#9AA3AD'); }
    label(pr, 1.6, z + H / 2, 3.0, z + H / 2, `Обвязка ${I.beamProf}${wood ? ' (брус)' : ''}`);
    label(pr, pw / 2, -1.2, 3.0, -1.2, `Столб ${I.postProf}`);
    label(pr, pw / 2 + mm(20), z / 2, 3.0, -0.4, wood ? 'Уголки крепёжные 90×90×65 — 2 шт, саморезы 5×50' : 'Оголовок: пластина 6 мм, сварка по контуру');
    pr.push({ t: 'dim', x1: -2.4, y1: z, x2: -2.4, y2: z + H, off: -0.35, s: `${bh} мм` });
    out.push({ title: 'Узел 2. Столб — обвязка', x0: -3.2, y0: -2.5, x1: 9.5, y1: z + H + 0.5, prims: pr });
  }

  // ---- Узел 3. Стропило (ферма) — обвязка и кровля
  if (P.roof !== 'hip' || true) {
    const pr: Prim[] = [];
    const [bh, bw] = sz(I.beamProf), [rh] = sz(I.rafterProf), [ph] = sz(I.purProf);
    const H = mm(bh), Bw = mm(bw), R = mm(rh), Pp = mm(ph);
    const ang = Math.max(3, Math.min(30, (Math.atan((I.hHigh - I.hLow) / Math.max(1, P.roof === 'single' ? I.span : I.span / 2)) * 180) / Math.PI)) * Math.PI / 180;
    rect(pr, -Bw / 2, -H, Bw, H, wood ? woodC : steelC);
    const L0 = -2.6, L1 = 2.6, ca = Math.cos(ang), sa = Math.sin(ang);
    const rp = (t: number, h: number): [number, number] => [t * ca - h * sa, t * sa + h * ca];
    pr.push({ t: 'poly', pts: [rp(L0, 0), rp(L1, 0), rp(L1, R), rp(L0, R)], fill: wood ? woodC : steelC, c: '#222', w: 0.9 });
    for (const t of [-1.8, 0.2, 2.2]) { const [x, y] = rp(t, R); pr.push({ t: 'poly', pts: [rp(t - Pp / 2, R), rp(t + Pp / 2, R), rp(t + Pp / 2, R + Pp), rp(t - Pp / 2, R + Pp)], fill: wood ? woodC : '#B9C0C8', c: '#222', w: 0.7 }); void x; void y; }
    const roofLabel = P.cover === 'prof' ? `Профнастил ${({ C8: 'С-8', C20: 'С-20', HC35: 'НС-35' } as any)[P.profGrade] || 'С-8'}, саморезы 4,8×35 через волну` : P.cover === 'poly' ? 'Поликарбонат, термошайбы' : P.cover === 'tile' ? 'Металлочерепица' : P.cover === 'soft' ? 'Гибкая черепица по OSB' : P.cover === 'sandwich' ? 'Сэндвич-панель' : 'Покрытие';
    if (P.cover !== 'none' && P.cover !== 'slats') pr.push({ t: 'poly', pts: [rp(L0, R + Pp), rp(L1, R + Pp), rp(L1, R + Pp + 0.06), rp(L0, R + Pp + 0.06)], fill: '#5A6470', c: '#222', w: 0.5 });
    if (!wood) pr.push({ t: 'poly', pts: [[Bw / 2, 0], [Bw / 2 + mm(60), 0], [Bw / 2, mm(60)]], fill: '#9AA3AD', c: '#222', w: 0.7 });
    label(pr, ...rp(1.2, R / 2), 3.2, 0.9, `${I.truss ? 'Пояс фермы' : P.roof === 'arch' ? 'Арка' : 'Стропило'} ${I.rafterProf}`);
    label(pr, ...rp(2.2, R + Pp / 2), 3.2, 1.5, `${wood ? 'Обрешётка' : 'Прогон'} ${I.purProf}`);
    if (P.cover !== 'none' && P.cover !== 'slats') label(pr, ...rp(1.6, R + Pp + 0.04), 3.2, 2.1, roofLabel);
    label(pr, Bw / 2, -H / 2, 3.2, -0.5, `Обвязка ${I.beamProf}${wood ? ', врубка + скоба / уголок' : ', сварка + косынка 6 мм'}`);
    out.push({ title: `Узел 3. ${I.truss ? 'Ферма' : 'Стропило'} — обвязка, кровля`, x0: -3.0, y0: -H - 0.6, x1: 10.5, y1: 2.6, prims: pr });
  }

  // ---- Узел 4. Связь жёсткости
  if (res.members.some((m) => m.kind === 'tie')) {
    const pr: Prim[] = [];
    const [pa] = sz(I.postProf);
    const pw = mm(pa);
    rect(pr, -pw / 2, -2, pw, 4, wood ? woodC : steelC);
    rect(pr, pw / 2, -0.75, mm(200), mm(300), '#9AA3AD');
    { const ang = (40 * Math.PI) / 180, w = mm(40), x0 = pw / 2 + mm(60), y0 = -0.35, l = 2.6;
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy * w / 2, ny = dx * w / 2;
      pr.push({ t: 'poly', pts: [[x0 + nx, y0 + ny], [x0 + dx * l + nx, y0 + dy * l + ny], [x0 + dx * l - nx, y0 + dy * l - ny], [x0 - nx, y0 - ny]], fill: wood ? woodC : '#B9C0C8', c: '#222', w: 0.8 }); }
    label(pr, pw / 2 + mm(150), -0.6, 2.8, -0.9, 'Косынка 200×300×8, сварка');
    label(pr, pw / 2 + 1.4, 0.75, 2.8, 0.75, `Связь ${wood ? 'брус 50×100' : 'труба 40×40×3'}, крестом в крайних пролётах`);
    label(pr, pw / 2, -1.6, 2.8, -1.6, `Столб ${I.postProf}`);
    out.push({ title: 'Узел 4. Крепление связи жёсткости', x0: -1.5, y0: -2.3, x1: 10, y1: 2.3, prims: pr });
  }
  return out;
}


/** Лист «Состав стены, пола и кровли»: слои с толщинами и выносками (толщины условно ×6) */
// ---------------------------------------------------------------- план помещения и разрез 1-1 (замкнутая утеплённая постройка)
const circle = (cx: number, cy: number, r: number, n = 28): [number, number][] => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)] as [number, number]);
const mmS = (v: number) => String(Math.round(v * 1000));
function roomSheets(res: CanopyResult): Sheet[] {
  const p: any = res.params, i: any = res.info;
  const { L, W, walls } = p;
  const solid = (['front', 'back', 'left', 'right'] as Side[]).every((s) => ['wood', 'sandwich', 'prof_full'].includes(walls[s]));
  if (!solid || p.attach) return [];
  const [stA, stB] = String(i.postProf || '50×100').split('×').map((v) => Number(v) / 1000);
  const ins = !!p.insulate;
  const tIn = (stB || 0.1) / 2 + (ins ? 0.0125 : 0), tOut = (stB || 0.1) / 2 + (walls.front === 'wood' ? 0.043 : 0.02);
  const WALL = ins ? '#F3E39A' : '#E8D9BC';
  const out: Sheet[] = [];

  // ---------- план помещения ----------
  {
    const pr: Prim[] = [];
    const sideLen: Record<Side, number> = { front: L, back: L, left: W, right: W };
    // точка на стороне s: a — вдоль стены (как в openings), n — по нормали наружу
    const P = (s: Side, a: number, n: number): [number, number] => s === 'front' ? [a, -n] : s === 'back' ? [a, W + n] : s === 'left' ? [-n, a] : [L + n, a];
    for (const s of ['front', 'back', 'left', 'right'] as Side[]) {
      const ext = s === 'front' || s === 'back';
      const a0 = ext ? -tOut : tIn, a1 = ext ? sideLen[s] + tOut : sideLen[s] - tIn;
      const ops = res.openings.filter((o) => o.side === s).sort((x, y) => x.a0 - y.a0);
      const cuts: [number, number][] = [];
      let cur = a0;
      for (const o of ops) { if (o.a0 > cur) cuts.push([cur, o.a0]); cur = Math.max(cur, o.a1); }
      if (a1 > cur) cuts.push([cur, a1]);
      for (const [u0, u1] of cuts) pr.push({ t: 'poly', pts: [P(s, u0, tOut), P(s, u1, tOut), P(s, u1, -tIn), P(s, u0, -tIn)], fill: WALL, c: '#222', w: 1.1, hatch: ins ? 'sand' : undefined });
      // обшивка снаружи — тонкая линия
      for (const [u0, u1] of cuts) { const [x1, y1] = P(s, u0, tOut - 0.02), [x2, y2] = P(s, u1, tOut - 0.02); pr.push({ t: 'line', x1, y1, x2, y2, w: 0.35, c: '#8a6440' }); }
      for (const o of ops) {
        const w = o.a1 - o.a0;
        if (o.kind === 'window') {
          for (const n of [tOut, -tIn]) { const [x1, y1] = P(s, o.a0, n), [x2, y2] = P(s, o.a1, n); pr.push({ t: 'line', x1, y1, x2, y2, w: 0.5, c: '#333' }); }
          for (const n of [0.012, -0.012]) { const [x1, y1] = P(s, o.a0, n), [x2, y2] = P(s, o.a1, n); pr.push({ t: 'line', x1, y1, x2, y2, w: 0.7, c: '#2f6db5' }); }
          const [x1, y1] = P(s, o.a0 - 0.05, -tIn - 0.06), [x2, y2] = P(s, o.a1 + 0.05, -tIn - 0.06); // подоконник
          pr.push({ t: 'poly', pts: [P(s, o.a0 - 0.05, -tIn), P(s, o.a1 + 0.05, -tIn), [x2, y2], [x1, y1]], fill: '#ffffff', c: '#333', w: 0.5 });
        } else if (o.kind === 'gate') {
          for (const n of [tOut, -tIn]) { const [x1, y1] = P(s, o.a0, n), [x2, y2] = P(s, o.a1, n); pr.push({ t: 'line', x1, y1, x2, y2, w: 0.6, c: '#333', dash: true }); }
        } else {
          // полотно и дуга открывания внутрь, петли у a0
          const h0 = P(s, o.a0, -tIn), e = P(s, o.a0, -tIn - w);
          pr.push({ t: 'line', x1: h0[0], y1: h0[1], x2: e[0], y2: e[1], w: 1.4, c: '#222' });
          const arc: [number, number][] = [];
          for (let k = 0; k <= 16; k++) { const t = (Math.PI / 2) * (k / 16); arc.push(P(s, o.a0 + w * Math.sin(t), -tIn - w * Math.cos(t))); }
          for (let k = 0; k < arc.length - 1; k++) pr.push({ t: 'line', x1: arc[k][0], y1: arc[k][1], x2: arc[k + 1][0], y2: arc[k + 1][1], w: 0.4, c: '#555' });
          const [x1, y1] = P(s, o.a0, -tIn), [x2, y2] = P(s, o.a1, -tIn);
          pr.push({ t: 'line', x1, y1, x2, y2, w: 0.4, c: '#555', dash: true }); // порог
        }
      }
    }
    // марки по всему плану: нумерация как на фасадах (ОК-1…, Д-1…)
    {
      let wn = 0, dn = 0;
      for (const s of ['front', 'right', 'back', 'left'] as Side[]) for (const o of res.openings.filter((x) => x.side === s).sort((x, y) => x.a0 - y.a0)) {
        const mark = o.kind === 'window' ? `ОК-${++wn}` : o.kind === 'door' ? `Д-${++dn}` : 'В-1';
        const [x, y] = P(s, (o.a0 + o.a1) / 2, tOut + (s === 'back' || s === 'right' ? 0.85 : 0.28));
        const rot = s === 'left' || s === 'right' ? 90 : 0;
        pr.push({ t: 'text', x: x + (rot ? (s === 'left' ? 0.04 : 0.12) : 0), y: y - (rot ? 0 : 0.06), s: `${mark}  ${mmS(o.a1 - o.a0)}×${mmS(o.h - (o.z0 || 0))}`, size: 0.13, anchor: 'middle', rot, bold: true, c: '#1f5fae' });
      }
    }
    // стойки каркаса в стене
    for (const m of res.members.filter((x) => x.kind === 'post')) {
      const [a, b] = sizeOf(m.profile); const onX = Math.abs(m.a[1]) < 0.01 || Math.abs(m.a[1] - W) < 0.01;
      const hx = (onX ? a : b) / 2, hy = (onX ? b : a) / 2;
      pr.push({ t: 'poly', pts: [[m.a[0] - hx, m.a[1] - hy], [m.a[0] + hx, m.a[1] - hy], [m.a[0] + hx, m.a[1] + hy], [m.a[0] - hx, m.a[1] + hy]], fill: '#B07A45', c: '#5a3d22', w: 0.4 });
    }
    // оси
    const ax = (x1: number, y1: number, x2: number, y2: number, lab: string, cx: number, cy: number) => {
      pr.push({ t: 'line', x1, y1, x2, y2, w: 0.35, c: '#888', dash: true });
      pr.push({ t: 'poly', pts: circle(cx, cy, 0.17), fill: '#ffffff', c: '#444', w: 0.5 });
      pr.push({ t: 'text', x: cx, y: cy - 0.055, s: lab, size: 0.16, anchor: 'middle', bold: true });
    };
    const D = 1.75;
    ax(0, -D + 0.17, 0, W + 0.35, '1', 0, -D); ax(L, -D + 0.17, L, W + 0.35, '2', L, -D);
    ax(-D + 0.17, 0, L + 0.35, 0, 'А', -D, 0); ax(-D + 0.17, W, L + 0.35, W, 'Б', -D, W);
    // размерные цепочки: проёмы (1-я), между осями (2-я), габарит по обшивке (3-я)
    for (const s of ['front', 'left'] as Side[]) {
      const len = sideLen[s];
      const ops = res.openings.filter((o) => o.side === s).sort((x, y) => x.a0 - y.a0);
      const horiz = s === 'front';
      const dim = (u0: number, u1: number, off: number, txt: string) => pr.push(horiz ? { t: 'dim', x1: u0, y1: -tOut, x2: u1, y2: -tOut, off, s: txt } : { t: 'dim', x1: -tOut, y1: u0, x2: -tOut, y2: u1, off, s: txt });
      if (ops.length) { const c = [0, ...ops.flatMap((o) => [o.a0, o.a1]), len]; for (let k = 0; k < c.length - 1; k++) if (c[k + 1] - c[k] > 0.04) dim(c[k], c[k + 1], -0.45, mmS(c[k + 1] - c[k])); }
      dim(0, len, -0.85, mmS(len));
      dim(-tOut, len + tOut, -1.25, mmS(len + 2 * tOut));
    }
    for (const s of ['back', 'right'] as Side[]) {
      const ops = res.openings.filter((o) => o.side === s).sort((x, y) => x.a0 - y.a0);
      if (!ops.length) continue;
      const len = sideLen[s], horiz = s === 'back';
      const c = [0, ...ops.flatMap((o) => [o.a0, o.a1]), len];
      for (let k = 0; k < c.length - 1; k++) if (c[k + 1] - c[k] > 0.04) pr.push(horiz ? { t: 'dim', x1: c[k], y1: W + tOut, x2: c[k + 1], y2: W + tOut, off: 0.45, s: mmS(c[k + 1] - c[k]) } : { t: 'dim', x1: L + tOut, y1: c[k], x2: L + tOut, y2: c[k + 1], off: 0.45, s: mmS(c[k + 1] - c[k]) });
    }
    // помещение: внутренние размеры и площадь
    const iL = L - 2 * tIn, iW = W - 2 * tIn, area = Math.round(iL * iW * 10) / 10;
    pr.push({ t: 'dim', x1: tIn, y1: W * 0.2, x2: L - tIn, y2: W * 0.2, off: 0, s: `${mmS(iL)} (в чистоте)` });
    pr.push({ t: 'dim', x1: L * 0.86, y1: tIn, x2: L * 0.86, y2: W - tIn, off: 0, s: mmS(iW) });
    pr.push({ t: 'poly', pts: circle(L * 0.45, W * 0.38, 0.36), fill: '#ffffff', c: '#333', w: 0.6 });
    pr.push({ t: 'text', x: L * 0.45, y: W * 0.38 + 0.03, s: '1', size: 0.2, anchor: 'middle', bold: true });
    pr.push({ t: 'text', x: L * 0.45, y: W * 0.38 - 0.2, s: `${String(area).replace('.', ',')} м²`, size: 0.13, anchor: 'middle' });
    pr.push({ t: 'text', x: L * 0.45, y: W * 0.38 + 0.48, s: 'Помещение', size: 0.17, anchor: 'middle', c: '#444' });
    // линия разреза 1-1 поперёк ската
    const alongY = p.highSide === 'front' || p.highSide === 'back';
    const cx = alongY ? L * 0.25 : L / 2, cy = alongY ? W / 2 : W * 0.25;
    if (p.roof !== 'single') { /* разрез только для односкатной */ } else if (alongY) for (const [y, dy] of [[-tOut - 0.35, -0.3], [W + tOut + 0.35, 0.3]] as [number, number][]) {
      pr.push({ t: 'line', x1: cx, y1: y, x2: cx, y2: y + dy, w: 2, c: '#222' });
      pr.push({ t: 'line', x1: cx, y1: y + dy, x2: cx + 0.3, y2: y + dy, w: 2, c: '#222' });
      pr.push({ t: 'text', x: cx + 0.42, y: y + dy - 0.07, s: '1', size: 0.2, bold: true });
    } else for (const [x, dx] of [[-tOut - 0.35, -0.3], [L + tOut + 0.35, 0.3]] as [number, number][]) {
      pr.push({ t: 'line', x1: x, y1: cy, x2: x + dx, y2: cy, w: 2, c: '#222' });
      pr.push({ t: 'line', x1: x + dx, y1: cy, x2: x + dx, y2: cy + 0.3, w: 2, c: '#222' });
      pr.push({ t: 'text', x: x + dx - 0.05, y: cy + 0.42, s: '1', size: 0.2, bold: true });
    }
    pr.push({ t: 'text', x: -D - 0.2, y: -D - 0.75, s: `Стены: каркас ${i.postProf || ''} шаг ${String(p.postStep).replace('.', ',')} м${ins ? ', утеплитель 100 мм' : ''}; толщина стены ≈ ${mmS(tIn + tOut)} мм. Размеры — в мм.`, size: 0.15, c: '#555' });
    out.push({ title: 'План помещения', x0: -D - 0.4, y0: -D - 1.0, x1: L + 1.2, y1: W + tOut + 0.95, prims: pr });
  }

  // ---------- разрез 1-1 (односкатная кровля) ----------
  if (p.roof === 'single') {
    const pr: Prim[] = [];
    const alongY = p.highSide === 'front' || p.highSide === 'back';
    const S = alongY ? W : L, ovr = p.overhang ?? 0.3;
    const xc = alongY ? L * 0.25 : L / 2, yc = alongY ? W / 2 : W * 0.25;
    const hz = (u: number) => (alongY ? res.topAt(xc, u) : res.topAt(u, yc));
    const hS = (u: number) => hz(0) + ((hz(S) - hz(0)) * u) / S; // линейно по пролёту (односкатная)
    const rB = Number(String(i.rafterProf || '50×150').split('×')[1]) / 1000 || 0.15;
    const zG = p.base === 'floor' ? (p.floorOn === 'blocks' ? -0.35 : -0.45) : 0;
    // грунт
    pr.push({ t: 'poly', pts: [[-ovr - 0.6, zG], [S + ovr + 0.6, zG], [S + ovr + 0.6, zG - 0.25], [-ovr - 0.6, zG - 0.25]], fill: '#A88F6C', c: '#776', w: 0.4, hatch: 'soil' });
    pr.push({ t: 'line', x1: -ovr - 0.6, y1: zG, x2: S + ovr + 0.6, y2: zG, w: 1.2, c: '#333' });
    if (p.base === 'floor') {
      const sup = W > 3.2 && alongY ? [0, S / 2, S] : [0, S];
      for (const u of sup) {
        if (p.floorOn === 'blocks') pr.push({ t: 'poly', pts: [[u - 0.1, zG], [u + 0.1, zG], [u + 0.1, -0.15], [u - 0.1, -0.15]], fill: '#D2CFC8', c: '#444', w: 0.6, hatch: 'concrete' });
        else { pr.push({ t: 'poly', pts: [[u - 0.045, zG - 0.22], [u + 0.045, zG - 0.22], [u + 0.045, -0.15], [u - 0.045, -0.15]], fill: '#9aa0a6', c: '#333', w: 0.6 }); }
        pr.push({ t: 'poly', pts: [[u - 0.075, -0.15], [u + 0.075, -0.15], [u + 0.075, 0], [u - 0.075, 0]], fill: '#C49A6C', c: '#5a3d22', w: 0.7 });
        pr.push({ t: 'line', x1: u - 0.075, y1: -0.15, x2: u + 0.075, y2: 0, w: 0.3, c: '#5a3d22' }); pr.push({ t: 'line', x1: u - 0.075, y1: 0, x2: u + 0.075, y2: -0.15, w: 0.3, c: '#5a3d22' });
      }
      // пол: утеплитель между лагами + OSB
      pr.push({ t: 'poly', pts: [[0.075, -0.15], [S - 0.075, -0.15], [S - 0.075, 0], [0.075, 0]], fill: ins ? '#F3E39A' : '#ffffff', c: '#444', w: 0.5, hatch: ins ? 'sand' : undefined });
      pr.push({ t: 'poly', pts: [[-tOut, 0], [S + tOut, 0], [S + tOut, 0.02], [-tOut, 0.02]], fill: '#E2C48F', c: '#5a3d22', w: 0.6 });
    } else pr.push({ t: 'poly', pts: [[-tOut - 0.3, 0], [S + tOut + 0.3, 0], [S + tOut + 0.3, -0.15], [-tOut - 0.3, -0.15]], fill: '#D2CFC8', c: '#444', w: 0.6, hatch: 'concrete' });
    // стены в разрезе
    for (const [u, sgn] of [[0, -1], [S, 1]] as [number, number][]) {
      const top = hS(u);
      const xo = u + sgn * tOut, xi = u - sgn * tIn;
      pr.push({ t: 'poly', pts: [[xo, 0.02], [xi, 0.02], [xi, top], [xo, top]], fill: WALL, c: '#222', w: 1.1, hatch: ins ? 'sand' : undefined });
      pr.push({ t: 'line', x1: u + sgn * (tOut - 0.02), y1: 0.02, x2: u + sgn * (tOut - 0.02), y2: top, w: 0.35, c: '#8a6440' });
      pr.push({ t: 'poly', pts: [[u - 0.05, top - 0.1], [u + 0.05, top - 0.1], [u + 0.05, top], [u - 0.05, top]], fill: '#C49A6C', c: '#5a3d22', w: 0.5 }); // верхняя обвязка
    }
    // стропило, утеплитель, потолок, обрешётка и кровля
    const ru0 = -ovr, ru1 = S + ovr;
    const rp = (u: number, dz: number): [number, number] => [u, hS(u) + dz];
    pr.push({ t: 'poly', pts: [rp(ru0, 0), rp(ru1, 0), rp(ru1, rB), rp(ru0, rB)], fill: '#DDBE8E', c: '#5a3d22', w: 0.8 });
    if (ins) pr.push({ t: 'poly', pts: [rp(0, 0.0), rp(S, 0.0), rp(S, 0.1), rp(0, 0.1)], fill: '#F3E39A', c: '#888', w: 0.4, hatch: 'sand' });
    pr.push({ t: 'poly', pts: [rp(-tIn + 0.0, -0.0125), rp(S + tIn, -0.0125), rp(S + tIn, 0), rp(-tIn, 0)], fill: '#E2C48F', c: '#5a3d22', w: 0.4 });
    pr.push({ t: 'line', x1: ru0, y1: hS(ru0) + rB + 0.05, x2: ru1, y2: hS(ru1) + rB + 0.05, w: 0.5, c: '#5B8FD6' }); // мембрана
    pr.push({ t: 'poly', pts: [rp(ru0 - 0.05, rB + 0.08), rp(ru1 + 0.05, rB + 0.08), rp(ru1 + 0.05, rB + 0.1), rp(ru0 - 0.05, rB + 0.1)], fill: '#8a5a4a', c: '#5a3a30', w: 0.9 });
    // ветровые/лобовые доски
    for (const u of [ru0, ru1]) pr.push({ t: 'poly', pts: [[u - 0.012, hS(u) - 0.01], [u + 0.012, hS(u) - 0.01], [u + 0.012, hS(u) + rB + 0.08], [u - 0.012, hS(u) + rB + 0.08]], fill: '#C49A6C', c: '#5a3d22', w: 0.5 });
    // отметки уровней
    const lvl = (u: number, z: number, txt: string, right = true) => {
      const d = right ? 1 : -1;
      pr.push({ t: 'poly', pts: [[u, z], [u - 0.07, z + 0.1], [u + 0.07, z + 0.1]], fill: '#ffffff', c: '#222', w: 0.5 });
      pr.push({ t: 'line', x1: u - 0.07, y1: z + 0.1, x2: u + d * 0.75, y2: z + 0.1, w: 0.4, c: '#222' });
      pr.push({ t: 'text', x: u + d * 0.08, y: z + 0.14, s: txt, size: 0.13, anchor: right ? 'start' : 'end' });
    };
    const lv = (z: number) => (z >= 0 ? '+' : '−') + (Math.abs(z)).toFixed(3).replace('.', ',');
    lvl(S + tOut + 0.5, 0.02, '±0,000 пол');
    lvl(S + tOut + 0.5, zG, `${lv(zG - 0.02)} земля`);
    lvl(-tOut - 0.5, hS(0), lv(hS(0) - 0.02), false);
    lvl(S + tOut + 0.5, hS(S), lv(hS(S) - 0.02));
    // размеры
    pr.push({ t: 'dim', x1: 0, y1: zG, x2: S, y2: zG, off: -0.45, s: mmS(S) });
    pr.push({ t: 'dim', x1: ru0, y1: zG, x2: ru1, y2: zG, off: -0.8, s: `${mmS(ru1 - ru0)} по кровле` });
    pr.push({ t: 'dim', x1: tIn + 0.25, y1: 0.02, x2: tIn + 0.25, y2: hS(tIn) - 0.0125, off: 0, s: `${mmS(hS(tIn) - 0.0125 - 0.02)} в чистоте` });
    pr.push({ t: 'dim', x1: S - tIn - 0.25, y1: 0.02, x2: S - tIn - 0.25, y2: hS(S - tIn) - 0.0125, off: 0, s: mmS(hS(S - tIn) - 0.0125 - 0.02) });
    // уклон
    const sl = Math.abs(hz(S) - hz(0)) / S;
    pr.push({ t: 'text', x: S / 2, y: hS(S / 2) + rB + 0.24, s: `i = ${Math.round(sl * 100)}% (${(Math.atan(sl) * 180 / Math.PI).toFixed(1).replace('.', ',')}°)`, size: 0.15, anchor: 'middle', bold: true });
    // выноски
    const tag = (u: number, z: number, tx: number, tz: number, txt: string) => {
      pr.push({ t: 'line', x1: u, y1: z, x2: tx, y2: tz, w: 0.35, c: '#333' });
      pr.push({ t: 'line', x1: tx, y1: tz, x2: tx + 0.1, y2: tz, w: 0.35, c: '#333' });
      pr.push({ t: 'text', x: tx + 0.14, y: tz - 0.045, s: txt, size: 0.125 });
    };
    const TX = S + ovr + 1.7;
    tag(S * 0.75, hS(S * 0.75) + rB + 0.09, TX, hS(S) + 0.75, `${p.cover === 'tile' ? 'Металлочерепица' : 'Профнастил С-20'} по обрешётке, мембрана`);
    tag(S * 0.6, hS(S * 0.6) + rB * 0.5, TX, hS(S) + 0.45, `Стропила ${i.rafterProf || ''} шаг 0,6 м${ins ? ' + утеплитель 100' : ''}`);
    tag(S * 0.5, hS(S * 0.5) - 0.006, TX, hS(S) + 0.15, `Потолок: пароизоляция, ${p.lining === 'osb' ? 'OSB 12' : 'вагонка 12,5'}`);
    tag(S + tOut * 0.5, 1.2, TX, 1.2, `Стена ≈ ${mmS(tIn + tOut)} мм (состав — отд. лист)`);
    if (p.base === 'floor') {
      tag(S * 0.5, -0.07, TX, 0.55, `Пол: ${p.floorTop === 'board' ? 'доска 36' : 'OSB 18'}, лаги 50×150${ins ? ' + утеплитель 150' : ''}`);
      tag(S, -0.075, TX, -0.12, 'Ростверк — брус 150×150');
      tag(S + 0.08, (zG - 0.15) / 2, TX, zG + 0.05, p.floorOn === 'blocks' ? 'Блоки 200×200×400 на ПГС' : 'Винтовые сваи Ø89');
    }
    out.push({ title: 'Разрез 1-1', x0: -ovr - 1.45, y0: zG - 1.05, x1: TX + 3.1, y1: Math.max(hS(0), hS(S)) + rB + 0.45, prims: pr });
  }
  return out;
}

function compositionSheet(res: CanopyResult): Sheet {
  const p: any = res.params, i: any = res.info;
  const K = 10, BW = 2.4;
  const WOOD = '#DDBE8E', INS = '#F3E39A', AIR = '#FFFFFF', MEMB = '#5B8FD6', VAPOR = '#C0392B', CONC = '#D2CFC8';
  type Ly = { t: number; name: string; fill: string; hatch?: any; line?: string; min?: number };
  const ins = p.insulate;
  const lining = p.lining === 'osb' ? 'OSB-3 12 мм' : p.lining === 'vagonka' ? 'вагонка 12,5 мм' : 'внутренняя обшивка — по выбору';
  const clad = Object.values(p.walls).includes('wood') ? 'Имитация бруса / доска 18–20 мм' : 'Профлист С-8 на всю высоту';
  const [stA, stB] = String(i.postProf || '50×100').split('×');
  const [rA, rB] = String(i.rafterProf || '50×150').split('×');
  const blocks: { title: string; sub: string; layers: Ly[] }[] = [
    { title: 'Кровля', sub: 'сверху вниз', layers: [
      { t: 3, name: `${p.cover === 'tile' ? 'Металлочерепица' : 'Профнастил'} ${p.color === 'none' ? 'оцинкованный' : p.color}`, fill: '#8a5a4a', min: 0.05 },
      { t: 25, name: 'Обрешётка 25×100 (разреженная)', fill: WOOD },
      { t: 50, name: 'Контробрешётка 30×50 — вентзазор', fill: AIR, line: '#999' },
      { t: 1, name: 'Гидро-ветрозащитная мембрана', fill: MEMB, min: 0.035 },
      { t: Number(rB) || 150, name: `Стропила ${rA}×${rB} через 0,6 м${ins ? ' + минвата 100 мм' : ''}`, fill: ins ? INS : AIR, hatch: ins ? 'sand' : undefined },
      ...(ins ? [{ t: 1, name: 'Пароизоляция (стыки на скотч)', fill: VAPOR, min: 0.035 } as Ly, { t: 12.5, name: lining, fill: WOOD } as Ly] : []),
    ] },
    { title: 'Стена', sub: 'снаружи → внутрь', layers: [
      { t: 18, name: clad, fill: WOOD },
      { t: 25, name: 'Контррейка 25×50 — вентзазор', fill: AIR, line: '#999' },
      { t: 1, name: 'Ветро-влагозащитная мембрана', fill: MEMB, min: 0.035 },
      { t: Number(stB) || 100, name: `Стойки ${stA}×${stB} через ${String(p.postStep).replace('.', ',')} м${ins ? ' + минвата 100 мм' : ''}`, fill: ins ? INS : AIR, hatch: ins ? 'sand' : undefined },
      ...(ins ? [{ t: 1, name: 'Пароизоляция (стыки на скотч)', fill: VAPOR, min: 0.035 } as Ly, { t: 12.5, name: lining, fill: WOOD } as Ly] : []),
    ] },
  ];
  if (p.base === 'floor') blocks.push({ title: 'Пол', sub: 'сверху вниз', layers: [
    p.floorTop === 'board' ? { t: 36, name: 'Доска пола шпунтованная 36×136', fill: '#E2C48F' } : { t: 18, name: 'OSB-3 18 мм — чистовой пол', fill: '#E2C48F' },
    { t: 1, name: 'Пароизоляция', fill: VAPOR, min: 0.035 },
    { t: 150, name: `Лаги 50×150 через 0,5 м${ins ? ' + минвата 150 мм' : ''}`, fill: ins ? INS : AIR, hatch: ins ? 'sand' : undefined },
    { t: 1, name: 'Ветро-влагозащитная мембрана', fill: MEMB, min: 0.035 },
    { t: 25, name: 'Черновой пол 25 мм на черепных брусках 50×50', fill: WOOD },
    { t: 150, name: 'Подполье с продухами (≥150 мм)', fill: AIR, line: '#bbb' },
    { t: 150, name: 'Ростверк — брус 150×150, рубероид 2 слоя', fill: '#C49A6C' },
    { t: 200, name: p.floorOn === 'blocks' ? 'Опора: блоки 200×200×400 на подушке ПГС' : 'Опора: винтовая свая Ø89', fill: CONC, hatch: 'concrete' },
  ] });
  const pr: Prim[] = [];
  const colW = 7.9;
  let maxH = 0;
  blocks.forEach((b, bi) => {
    const x0 = bi * colW;
    let y = 0;
    const hs = b.layers.map((l) => Math.max(l.t / 1000 * K, l.min ?? 0.08));
    const total = hs.reduce((a, v) => a + v, 0);
    maxH = Math.max(maxH, total);
    pr.push({ t: 'text', x: x0, y: 0.75, s: b.title, size: 0.34, bold: true });
    pr.push({ t: 'text', x: x0 + 1.6, y: 0.75, s: b.sub, size: 0.2, c: '#666' });
    const n = b.layers.length;
    b.layers.forEach((l, li) => {
      const h = hs[li];
      const yt = -y, yb = -y - h;
      pr.push({ t: 'poly', pts: [[x0, yb], [x0 + BW, yb], [x0 + BW, yt], [x0, yt]], fill: l.fill, c: l.line || '#444', w: 0.6, hatch: l.hatch });
      if (l.fill === WOOD || l.fill === '#C49A6C' || l.fill === '#E2C48F') for (let k = 0.25; k < BW; k += 0.45) pr.push({ t: 'line', x1: x0 + k, y1: (yt + yb) / 2 + Math.min(0.02, h / 4), x2: x0 + k + 0.3, y2: (yt + yb) / 2 - Math.min(0.02, h / 4), w: 0.3, c: '#9b7a4c' });
      // выноска: ступенькой к подписи, подписи — равномерно по высоте блока
      const ly = -((li + 0.5) / n) * Math.max(total, n * 0.42);
      const my = (yt + yb) / 2;
      pr.push({ t: 'line', x1: x0 + BW * 0.6, y1: my, x2: x0 + BW + 0.25, y2: my, w: 0.4, c: '#333' });
      pr.push({ t: 'line', x1: x0 + BW + 0.25, y1: my, x2: x0 + BW + 0.5, y2: ly, w: 0.4, c: '#333' });
      pr.push({ t: 'text', x: x0 + BW + 0.58, y: ly - 0.06, s: `${li + 1}. ${l.name}${l.t >= 3 ? ` — ${String(l.t).replace('.', ',')} мм` : ''}`, size: 0.19 });
      y += h;
    });
    const tt = b.layers.reduce((a, l) => a + l.t, 0);
    pr.push({ t: 'text', x: x0, y: -Math.max(total, n * 0.42) - 0.45, s: `Итого ≈ ${Math.round(tt)} мм`, size: 0.2, bold: true, c: '#1f5fae' });
  });
  const H = Math.max(maxH, 8 * 0.42) + 0.8;
  pr.push({ t: 'text', x: 0, y: -H - 0.3, s: 'Толщины показаны условно (×10). Мембрана снаружи утеплителя, пароизоляция — с тёплой стороны; вентзазор обязателен под обшивкой и кровлей.', size: 0.17, c: '#555' });
  return { title: 'Состав стены, пола и кровли', x0: -0.3, y0: -H - 0.6, x1: blocks.length * colW + 0.2, y1: 1.1, prims: pr };
}
