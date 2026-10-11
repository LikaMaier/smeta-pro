/**
 * Отрисовка модели без внешних библиотек:
 *  - 3D: ортогональная проекция с поворотом (yaw/pitch), затенение граней, сортировка по глубине;
 *  - 2D: чертёжные листы (план, фасады, разрез основания) из примитивов с размерами.
 * Один и тот же результат рисуется в приложении (SVG) и в PDF (reportlab).
 */
import type { CanopyResult, V3, Side } from './canopy';

export const RAL: Record<string, string> = {
  'RAL 7024': '#474A51', 'RAL 8017': '#45322E', 'RAL 6005': '#114232', 'RAL 3005': '#5E2129', 'RAL 5005': '#1E4E8C',
  'RAL 9003': '#ECECE7', 'RAL 1014': '#DFCEA1', 'RAL 7004': '#9C9C9C', 'RAL 9005': '#16171A', 'RAL 3011': '#781F19',
};
const colorOf = (ral: string) => RAL[ral] || '#474A51';
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

export function render3d(res: CanopyResult, yawDeg = -35, pitchDeg = 28, width = 800, height = 560): View3D {
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
  const frame = shade(colorOf(res.params.color), 1.25);
  const faces: { pts: V3[]; fill: string; stroke: string; opacity: number; d: number; sw: number }[] = [];
  const lines3: { a: V3; b: V3; stroke: string; sw: number; opacity: number }[] = [];

  // плита и земля
  for (const p of res.panels) {
    if (p.kind === 'slab') {
      const top = p.pts, bot = p.pts.map((q) => [q[0], q[1], q[2] - res.params.slabT] as V3);
      faces.push({ pts: top, fill: '#C9C6BF', stroke: '#9d9a93', opacity: 1, d: 0, sw: 0.6 });
      for (let i = 0; i < 4; i++) faces.push({ pts: [top[i], top[(i + 1) % 4], bot[(i + 1) % 4], bot[i]], fill: '#A8A59E', stroke: '#8a877f', opacity: 1, d: 0, sw: 0.5 });
    }
  }
  // элементы каркаса — бруски
  for (const m of res.members) {
    const [w0, h0] = sizeOf(m.profile);
    const w = Math.max(w0, 0.03), h = Math.max(h0, 0.03);
    const d = norm(sub(m.b, m.a));
    const up: V3 = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const e1 = norm(cross(d, up)), e2 = norm(cross(e1, d));
    const c = (base: V3, s1: number, s2: number) => addv(addv(base, mul(e1, (s1 * w) / 2)), mul(e2, (s2 * h) / 2));
    const A = [c(m.a, -1, -1), c(m.a, 1, -1), c(m.a, 1, 1), c(m.a, -1, 1)], B = [c(m.b, -1, -1), c(m.b, 1, -1), c(m.b, 1, 1), c(m.b, -1, 1)];
    const quads: [V3[], V3][] = [
      [[A[0], A[1], B[1], B[0]], mul(e2, -1)], [[A[1], A[2], B[2], B[1]], e1], [[A[2], A[3], B[3], B[2]], e2], [[A[3], A[0], B[0], B[3]], mul(e1, -1)],
      [[A[0], A[3], A[2], A[1]], mul(d, -1)], [[B[0], B[1], B[2], B[3]], d],
    ];
    const base = m.kind === 'rail' || m.kind === 'web' || m.kind === 'purlin' ? shade(frame, 1.1) : frame;
    for (const [q, n] of quads) {
      if (camN(n) > 0.02) continue; // невидимая грань
      const k = 0.55 + 0.5 * Math.max(0, dot(n, light));
      faces.push({ pts: q, fill: shade(base, k), stroke: shade(base, k * 0.8), opacity: 1, d: 0, sw: 0.3 });
    }
  }
  // панели: кровля, профлист, сетка
  const col = colorOf(res.params.color);
  for (const p of res.panels) {
    if (p.kind === 'slab') continue;
    if (p.kind === 'mesh') {
      // сетка — прозрачная, с линиями
      const [a, b, c2, d2] = p.pts;
      const lenH = Math.hypot(...sub(b, a)), steps = Math.max(2, Math.round(lenH / 0.25));
      for (let i = 0; i <= steps; i++) { const t = i / steps; lines3.push({ a: addv(a, mul(sub(b, a), t)), b: addv(d2, mul(sub(c2, d2), t)), stroke: shade(col, 1.3), sw: 0.6, opacity: 0.9 }); }
      const hH = Math.max(Math.hypot(...sub(d2, a)), Math.hypot(...sub(c2, b))), vs = Math.max(2, Math.round(hH / 0.25));
      for (let i = 0; i <= vs; i++) { const t = i / vs; lines3.push({ a: addv(a, mul(sub(d2, a), t)), b: addv(b, mul(sub(c2, b), t)), stroke: shade(col, 1.3), sw: 0.6, opacity: 0.9 }); }
      continue;
    }
    const n = norm(cross(sub(p.pts[1], p.pts[0]), sub(p.pts[3], p.pts[0])));
    const k = 0.6 + 0.45 * Math.abs(dot(n, light));
    const fill = p.kind === 'roof' ? (res.params.cover === 'poly' ? '#9fc4d9' : shade(col, k * 0.95)) : shade(col, k);
    faces.push({ pts: p.pts, fill, stroke: shade(col, 0.7), opacity: p.kind === 'roof' ? (res.params.cover === 'poly' ? 0.55 : 0.93) : 1, d: 0, sw: 0.6 });
    // рёбра профлиста
    if (p.kind === 'prof' || (p.kind === 'roof' && res.params.cover === 'prof')) {
      const [a, b, c2, d2] = p.pts;
      const len = Math.hypot(...sub(b, a)), ribs = Math.round(len / (p.kind === 'roof' ? 0.2 : 0.115));
      const ribDirAlongAB = p.kind === 'prof';
      if (ribDirAlongAB) for (let i = 1; i < ribs; i++) { const t = i / ribs; lines3.push({ a: addv(a, mul(sub(b, a), t)), b: addv(d2, mul(sub(c2, d2), t)), stroke: shade(col, 0.75), sw: 0.4, opacity: 0.8 }); }
      else { const l2 = Math.hypot(...sub(d2, a)), r2n = Math.round(l2 / 0.2); for (let i = 1; i < r2n; i++) { const t = i / r2n; lines3.push({ a: addv(a, mul(sub(d2, a), t)), b: addv(b, mul(sub(c2, b), t)), stroke: shade(col, 0.75), sw: 0.4, opacity: 0.6 }); } }
    }
  }

  // проекция, сортировка
  const all = faces.map((f) => { const cs = f.pts.map(cam); return { ...f, cs, d: cs.reduce((a, c) => a + c.d, 0) / cs.length }; });
  const ls = lines3.map((l) => { const a = cam(l.a), b = cam(l.b); return { ...l, ca: a, cb: b, d: (a.d + b.d) / 2 }; });
  const xs = [...all.flatMap((f) => f.cs.map((c) => c.sx)), ...ls.flatMap((l) => [l.ca.sx, l.cb.sx])];
  const ys = [...all.flatMap((f) => f.cs.map((c) => c.sy)), ...ls.flatMap((l) => [l.ca.sy, l.cb.sy])];
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
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

export function drawings(res: CanopyResult): Sheet[] {
  const { L, W, overhang: ov, walls } = res.params;
  const col = colorOf(res.params.color);
  const sheets: Sheet[] = [];
  const posts = res.members.filter((m) => m.kind === 'post');

  // ---------- план ----------
  {
    const pr: Prim[] = [];
    if (res.params.base === 'slab') { const o = res.params.slabOver; pr.push({ t: 'poly', pts: [[-o, -o], [L + o, -o], [L + o, W + o], [-o, W + o]], fill: '#ECEAE4', c: '#888', w: 0.8, hatch: 'concrete' }); }
    const roof = res.panels.filter((p) => p.kind === 'roof');
    for (const r of roof) pr.push({ t: 'poly', pts: r.pts.map((q) => [q[0], q[1]] as [number, number]), c: '#555', w: 0.6 });
    for (const m of res.members) {
      if (m.kind === 'chord' || m.kind === 'rafter') pr.push({ t: 'line', x1: m.a[0], y1: m.a[1], x2: m.b[0], y2: m.b[1], w: 0.6, dash: true, c: '#777' });
      if (m.kind === 'beam') pr.push({ t: 'line', x1: m.a[0], y1: m.a[1], x2: m.b[0], y2: m.b[1], w: 1.2, c: '#333' });
    }
    const wallLine: Record<Side, [number, number, number, number]> = { front: [0, 0, L, 0], back: [0, W, L, W], left: [0, 0, 0, W], right: [L, 0, L, W] };
    for (const s of ['front', 'back', 'left', 'right'] as Side[]) {
      const [x1, y1, x2, y2] = wallLine[s];
      if (walls[s] !== 'open') pr.push({ t: 'line', x1, y1, x2, y2, w: 3, c: col, dash: walls[s] === 'mesh' });
    }
    for (const p of posts) { const [w] = sizeOf(p.profile); pr.push({ t: 'poly', pts: [[p.a[0] - w / 2, p.a[1] - w / 2], [p.a[0] + w / 2, p.a[1] - w / 2], [p.a[0] + w / 2, p.a[1] + w / 2], [p.a[0] - w / 2, p.a[1] + w / 2]], fill: '#222', c: '#222', w: 0.5 }); }
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: L, y2: 0, off: -1.0 - ov, s: `${f2(L)} м` });
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: 0, y2: W, off: -1.0 - ov, s: `${f2(W)} м` });
    // въезд и уклон
    const open = (['front', 'back', 'left', 'right'] as Side[]).find((s) => walls[s] === 'open');
    if (open) { const [x1, y1, x2, y2] = wallLine[open]; const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; pr.push({ t: 'text', x: mx, y: my + (open === 'front' ? -0.5 : open === 'back' ? 0.35 : 0), s: '▲ въезд', size: 0.35, anchor: 'middle', bold: true, rot: open === 'left' || open === 'right' ? 90 : 0 }); }
    const sl = res.params.roof === 'single' ? `уклон кровли → ${res.params.highSide === 'left' ? 'вправо' : res.params.highSide === 'right' ? 'влево' : res.params.highSide === 'front' ? 'назад' : 'вперёд'}, ${Math.round(((res.info.hHigh - res.info.hLow) / res.info.span) * 100)}%` : 'двускатная кровля';
    pr.push({ t: 'text', x: L / 2, y: W / 2, s: sl, size: 0.3, anchor: 'middle', c: '#555' });
    pr.push({ t: 'text', x: L / 2, y: W / 2 - 0.45, s: `столбов ${res.info.posts}, ${res.info.truss ? 'ферм' : 'стропил'} ${res.info.rafters}`, size: 0.26, anchor: 'middle', c: '#777' });
    sheets.push({ title: 'План (вид сверху)', x0: -ov - 2, y0: -ov - 2, x1: L + ov + 1, y1: W + ov + 1, prims: pr });
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
    if (res.params.base === 'slab') pr.push({ t: 'poly', pts: [[-res.params.slabOver, 0], [width + res.params.slabOver, 0], [width + res.params.slabOver, -res.params.slabT], [-res.params.slabOver, -res.params.slabT]], fill: '#D8D5CE', c: '#888', w: 0.6, hatch: 'concrete' });
    // кровля — силуэт
    for (const r of res.panels.filter((p) => p.kind === 'roof')) {
      const pts = r.pts.map((q) => [H(q), q[2]] as [number, number]);
      const hs = pts.map((p) => p[0]); const zMax = Math.max(...pts.map((p) => p[1]));
      // огибающая: если кровля видна торцом — тонкая полоса, иначе — плоскость
      pr.push({ t: 'poly', pts: [...pts], fill: '#D9DCE0', c: '#333', w: 0.7 });
      void hs; void zMax;
    }
    // обшивка этой стороны
    for (const p of res.panels.filter((q) => (q.kind === 'prof' || q.kind === 'mesh') && q.pts.every(near))) {
      pr.push({ t: 'poly', pts: p.pts.map((q) => [H(q), q[2]] as [number, number]), fill: p.kind === 'prof' ? col : undefined, c: '#333', w: 0.6, hatch: p.kind === 'prof' ? 'prof' : 'mesh' });
    }
    // каркас этой стороны
    for (const m of res.members.filter((q) => near(q.a) && near(q.b))) {
      const [w] = sizeOf(m.profile);
      if (m.kind === 'post') pr.push({ t: 'poly', pts: [[H(m.a) - w / 2, 0], [H(m.a) + w / 2, 0], [H(m.b) + w / 2, m.b[2]], [H(m.b) - w / 2, m.b[2]]], fill: shade(col, 1.3), c: '#222', w: 0.6 });
      else pr.push({ t: 'line', x1: H(m.a), y1: m.a[2], x2: H(m.b), y2: m.b[2], w: m.kind === 'web' || m.kind === 'rail' ? 0.8 : 1.4, c: '#222' });
    }
    // размеры: ширина и высоты по краям
    const sidePosts = posts.filter((p) => near(p.a));
    const hL = sidePosts.reduce((a, p) => (H(p.a) < 0.05 ? p.b[2] : a), 0) || Math.min(...sidePosts.map((p) => p.b[2]));
    const hR = sidePosts.reduce((a, p) => (H(p.a) > width - 0.05 ? p.b[2] : a), 0) || Math.max(...sidePosts.map((p) => p.b[2]));
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: width, y2: 0, off: -0.9, s: `${f2(width)} м` });
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: 0, y2: hL, off: -0.8, s: `${f2(hL)} м` });
    pr.push({ t: 'dim', x1: width, y1: 0, x2: width, y2: hR, off: 0.8, s: `${f2(hR)} м` });
    const wt = res.params.walls[side];
    const wtLabel = { open: 'открытая сторона', prof: `профлист ${res.params.profH} м`, prof_full: 'профлист на всю высоту', mesh: 'сетка на всю высоту', prof_mesh: `профлист ${res.params.profH} м + сетка до кровли` }[wt];
    pr.push({ t: 'text', x: width / 2, y: -1.55, s: wtLabel, size: 0.3, anchor: 'middle', c: '#555' });
    const zTop = Math.max(res.info.hHigh, ...res.panels.filter((p) => p.kind === 'roof').flatMap((p) => p.pts.map((q) => q[2])));
    sheets.push({ title, x0: -2, y0: -2.1, x1: width + 2, y1: zTop + 0.8, prims: pr });
  }

  // ---------- разрез основания ----------
  if (res.params.base === 'slab') {
    const { slabT, sand, gravel } = res.params;
    const pr: Prim[] = [];
    const w = 4, vf = 4; // толщины слоёв показаны крупнее (×4), подписи — в реальных мм
    let z = 0;
    const layer = (h: number, name: string, hatch: any, fill: string) => {
      pr.push({ t: 'poly', pts: [[0, z], [w, z], [w, z - h * vf], [0, z - h * vf]], fill, c: '#444', w: 0.6, hatch });
      pr.push({ t: 'text', x: w + 0.25, y: z - (h * vf) / 2 + (h * vf > 0.7 ? -0.08 : 0.12), s: `${name} — ${Math.round(h * 1000)} мм`, size: 0.2, anchor: 'start' });
      z -= h * vf;
    };
    layer(slabT, `Бетон М300, арм. ${res.params.rebar === 'composite' ? 'композит Ø8' : 'А500 Ø12'} 200×200`, 'concrete', '#D3D0C9');
    pr.push({ t: 'line', x1: 0, y1: z, x2: w, y2: z, w: 2, c: '#3a7bd5' });
    pr.push({ t: 'text', x: w + 0.25, y: z - 0.2, s: 'плёнка полиэтиленовая 200 мкм', size: 0.17, anchor: 'start', c: '#3a7bd5' });
    layer(gravel, 'Щебень фр. 20–40, уплотнение', 'gravel', '#BDB6A8');
    layer(sand, 'Песок крупный/средний, уплотнение', 'sand', '#E7D9A8');
    pr.push({ t: 'line', x1: 0, y1: z, x2: w, y2: z, w: 2, c: '#2a6' });
    pr.push({ t: 'text', x: w + 0.25, y: z - 0.12, s: 'Геотекстиль 200 г/м²', size: 0.18, anchor: 'start', c: '#2a6' });
    pr.push({ t: 'poly', pts: [[0, z], [w, z], [w, z - 0.6], [0, z - 0.6]], fill: '#A88F6C', c: '#776', w: 0.4, hatch: 'soil' });
    pr.push({ t: 'text', x: w + 0.25, y: z - 0.45, s: 'Уплотнённый грунт', size: 0.18, anchor: 'start', c: '#555' });
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: 0, y2: z, off: -0.45, s: `${Math.round((slabT + sand + gravel) * 1000)} мм` });
    z -= 0.6;
    sheets.push({ title: 'Разрез основания (толщины условно ×4)', x0: -1.1, y0: z - 0.2, x1: w + 6.2, y1: 0.4, prims: pr });
  }
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
