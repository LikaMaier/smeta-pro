/** Чертежи забора: фасад со стороны улицы, план участка, узлы (столб в грунте, откатные ворота) */
import type { Prim, Sheet } from './render';
import { RAL } from './render';
import type { FenceResult } from './fence3d';
import { MOUNTS } from '../fence';

const mm = (v: number) => String(Math.round(v * 1000));
const PANEL_FILL: Record<string, { fill?: string; hatch?: 'prof' | 'mesh' | 'concrete' | 'gravel' }> = {
  prof: { hatch: 'prof' }, gate: { hatch: 'prof' }, mesh: { hatch: 'mesh' }, plank: { fill: '#D9B48A' }, wood: { fill: '#D9B48A' },
  poly: { fill: '#CFE3EE' }, concrete: { fill: '#D6D3CC', hatch: 'concrete' }, block: { fill: '#E2DAD0' }, stone: { fill: '#CFCBC3', hatch: 'gravel' },
};

export function fenceDrawings(r: FenceResult): Sheet[] {
  const p = r.params, L = p.L, W = p.W, h = p.h;
  const col = p.color === 'none' ? '#A9AFB6' : RAL[p.color] || '#474A51';
  const sheets: Sheet[] = [];
  const gate = r.openings.find((o) => o.kind === 'gate');
  const wicket = r.openings.find((o) => o.kind === 'wicket');
  const dir = p.slideDir === 'right' ? 1 : -1;

  // ---------- 1. фасад со стороны улицы ----------
  if (p.sides.front) {
    const pr: Prim[] = [];
    const xMin = -1.2 + Math.min(0, gate && p.gate === 'slide' && dir < 0 ? gate.a0 - r.tail - 0.5 : 0);
    const xMax = L + 1.2 + (gate && p.gate === 'slide' && dir > 0 ? Math.max(0, gate.a1 + r.tail + 0.5 - L) : 0);
    pr.push({ t: 'poly', pts: [[xMin + 0.4, -0.3], [xMax - 0.4, -0.3], [xMax - 0.4, 0], [xMin + 0.4, 0]], fill: '#EFE9DF', c: '#888', w: 0.4, hatch: 'soil' });
    // полотно и створки (всё, что в линии фасада)
    for (const q of r.panels) {
      if (q.kind === 'strip' || !q.pts.every((v) => Math.abs(v[1]) < 0.3)) continue;
      const f = PANEL_FILL[q.kind] || { hatch: 'prof' };
      const isGate = q.pts.some((v) => v[1] > 0.05); // створка откатных ворот — внутри участка
      pr.push({ t: 'poly', pts: q.pts.map((v) => [v[0], v[2]] as [number, number]), fill: f.fill || (isGate ? '#F2F2F0' : '#F7F7F5'), c: isGate ? '#333' : '#555', w: isGate ? 0.9 : 0.5, hatch: f.hatch });
    }
    // столбы, кладка, рамы
    for (const m of r.members) {
      if (Math.abs(m.a[1]) > 0.3 && Math.abs(m.b[1]) > 0.3) continue;
      const [a] = m.profile.split('×').map(Number);
      const w = Math.max(0.04, a / 1000);
      if (m.kind === 'post' || m.kind === 'pillar' || m.kind === 'cpillar') {
        const x = m.a[0];
        if (Math.abs(m.a[1]) > 0.3) continue;
        pr.push({ t: 'poly', pts: [[x - w / 2, 0], [x + w / 2, 0], [x + w / 2, m.b[2]], [x - w / 2, m.b[2]]], fill: m.kind === 'pillar' ? '#C98B73' : m.kind === 'cpillar' ? '#D0CCC4' : col, c: '#222', w: 0.6 });
      } else if (m.kind === 'frame' || m.kind === 'beam') pr.push({ t: 'line', x1: m.a[0], y1: m.a[2], x2: m.b[0], y2: m.b[2], w: m.kind === 'beam' ? 2.2 : 1.2, c: '#333' });
    }
    pr.push({ t: 'line', x1: xMin + 0.4, y1: 0, x2: xMax - 0.4, y2: 0, w: 1.4 });
    // размеры
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: L, y2: 0, off: -0.75, s: mm(L) });
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: 0, y2: h, off: -0.6, s: mm(h) });
    const posts = r.members.filter((m) => (m.kind === 'post' || m.kind === 'pillar') && Math.abs(m.a[1]) < 0.01).map((m) => m.a[0]).sort((a, b) => a - b);
    const span = posts.findIndex((x, i) => i > 0 && x - posts[i - 1] > 0.8 && !(gate && x > gate.a0 && x <= gate.a1 + 0.01) && !(wicket && x > wicket.a0 && x <= wicket.a1 + 0.01));
    if (span > 0) pr.push({ t: 'dim', x1: posts[span - 1], y1: h, x2: posts[span], y2: h, off: 0.45, s: mm(posts[span] - posts[span - 1]) });
    if (gate) {
      pr.push({ t: 'dim', x1: gate.a0, y1: h, x2: gate.a1, y2: h, off: 0.45, s: mm(gate.a1 - gate.a0) });
      pr.push({ t: 'text', x: (gate.a0 + gate.a1) / 2, y: h / 2, s: p.gate === 'slide' ? 'Ворота откатные' : 'Ворота распашные', size: 0.28, anchor: 'middle', bold: true });
      if (p.gate === 'slide') {
        const e = dir > 0 ? gate.a1 - 0.05 : gate.a0 + 0.05;
        pr.push({ t: 'dim', x1: Math.min(e, e + dir * r.tail), y1: 0.12, x2: Math.max(e, e + dir * r.tail), y2: 0.12, off: -0.45, s: `противовес ${mm(r.tail)}` });
      }
    }
    if (wicket) {
      pr.push({ t: 'dim', x1: wicket.a0, y1: h, x2: wicket.a1, y2: h, off: 0.45, s: mm(wicket.a1 - wicket.a0) });
      pr.push({ t: 'text', x: (wicket.a0 + wicket.a1) / 2, y: Math.min(h, 2.05) + 0.12, s: 'Калитка', size: 0.24, anchor: 'middle' });
    }
    sheets.push({ title: 'Фасад со стороны улицы', x0: xMin, y0: -1.3, x1: xMax, y1: h + 1.1, prims: pr });
  }

  // ---------- 2. план участка ----------
  {
    const pr: Prim[] = [];
    const lines: Record<string, [number, number, number, number]> = { front: [0, 0, L, 0], back: [0, W, L, W], left: [0, 0, 0, W], right: [L, 0, L, W] };
    pr.push({ t: 'poly', pts: [[0, 0], [L, 0], [L, W], [0, W]], fill: '#F3F6EE', c: '#bbb', w: 0.3 });
    for (const [s, [x1, y1, x2, y2]] of Object.entries(lines)) {
      const on = (p.sides as any)[s];
      pr.push({ t: 'line', x1, y1, x2, y2, w: on ? 2.6 : 0.6, c: on ? col : '#999', dash: !on || ['mesh3d', 'gitter', 'rabica', 'welded'].includes(p.type) });
    }
    for (const o of r.openings) pr.push({ t: 'line', x1: o.a0, y1: 0, x2: o.a1, y2: 0, w: 3.6, c: '#ffffff' });
    const ps = Math.max(0.12, Math.min(L, W) / 120);
    for (const m of r.members) {
      if (m.kind !== 'post' && m.kind !== 'pillar' && m.kind !== 'cpillar') continue;
      const [a] = m.profile.split('×').map(Number);
      const s2 = Math.max(ps, a / 1000) / 2;
      pr.push({ t: 'poly', pts: [[m.a[0] - s2, m.a[1] - s2], [m.a[0] + s2, m.a[1] - s2], [m.a[0] + s2, m.a[1] + s2], [m.a[0] - s2, m.a[1] + s2]], fill: m.kind === 'pillar' ? '#C98B73' : '#333', c: '#222', w: 0.4 });
    }
    const arc = (cx: number, cy: number, rad: number, a0: number, a1: number) => {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
        pr.push({ t: 'line', x1: cx + rad * Math.cos(t0), y1: cy + rad * Math.sin(t0), x2: cx + rad * Math.cos(t1), y2: cy + rad * Math.sin(t1), w: 0.6, dash: true, c: '#555' });
      }
    };
    if (gate && p.gate === 'swing') {
      const half = (gate.a1 - gate.a0) / 2;
      arc(gate.a0, 0, half, 0, Math.PI / 2); arc(gate.a1, 0, half, Math.PI / 2, Math.PI);
      pr.push({ t: 'line', x1: gate.a0, y1: 0, x2: gate.a0, y2: half, w: 1.2, c: col }); pr.push({ t: 'line', x1: gate.a1, y1: 0, x2: gate.a1, y2: half, w: 1.2, c: col });
    }
    if (gate && p.gate === 'slide') {
      const gw = gate.a1 - gate.a0, e = dir > 0 ? gate.a1 : gate.a0;
      const z1 = e + dir * (gw + r.tail);
      pr.push({ t: 'poly', pts: [[Math.min(e, z1), 0.05], [Math.max(e, z1), 0.05], [Math.max(e, z1), 0.35], [Math.min(e, z1), 0.35]], fill: '#FFF4D6', c: '#B8860B', w: 0.6 });
      pr.push({ t: 'text', x: (e + z1) / 2, y: 0.6, s: `зона отката ${mm(gw + r.tail)}`, size: 0.3, anchor: 'middle' });
      pr.push({ t: 'line', x1: gate.a0, y1: 0.18, x2: gate.a1, y2: 0.18, w: 2, c: col });
    }
    if (wicket) { arc(wicket.a0, 0, 1, 0, Math.PI / 2); pr.push({ t: 'line', x1: wicket.a0, y1: 0, x2: wicket.a0, y2: 1, w: 1, c: col }); }
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: L, y2: 0, off: -1.2, s: mm(L) });
    pr.push({ t: 'dim', x1: L, y1: 0, x2: L, y2: W, off: 1.0, s: mm(W) });
    pr.push({ t: 'text', x: L / 2, y: -2.2, s: 'улица', size: 0.4, anchor: 'middle', c: '#777' });
    pr.push({ t: 'text', x: L / 2, y: W / 2, s: `Участок ${L} × ${W} м · забор ${r.info.perimeter} м`, size: Math.max(0.35, Math.min(L, W) / 25), anchor: 'middle', c: '#556' });
    if (gate) pr.push({ t: 'dim', x1: 0, y1: 0, x2: gate.a0, y2: 0, off: 0.9 + Math.min(L, W) / 30, s: mm(gate.a0) });
    sheets.push({ title: 'План участка', x0: -2, y0: -3, x1: L + 2.4, y1: W + 1.2, prims: pr });
  }

  // ---------- 3. узлы ----------
  {
    const pr: Prim[] = [];
    // Узел 1: столб в грунте (масштаб условный, размеры — реальные)
    const k = 1.6; // условный масштаб
    const pw = (Number((r.info.postProf || '60').split('×')[0]) / 1000) * k * 3;
    const dep = (p.mount === 'screw' ? 2.0 : p.mount === 'strip' ? 0.7 : 1.2), D = dep * k;
    const x0 = 0;
    pr.push({ t: 'text', x: x0 - 1.4, y: 2.15, s: 'Узел 1. Столб забора', size: 0.2, bold: true });
    pr.push({ t: 'poly', pts: [[x0 - 1.4, -D - 0.3], [x0 + 1.4, -D - 0.3], [x0 + 1.4, 0], [x0 - 1.4, 0]], fill: '#EFE9DF', c: '#999', w: 0.4, hatch: 'soil' });
    if (p.mount === 'concrete' || p.mount === 'tise') {
      const hw = (p.mount === 'tise' ? 0.15 : 0.1) * k * 2;
      pr.push({ t: 'poly', pts: [[x0 - hw, -D], [x0 + hw, -D], [x0 + hw, 0], [x0 - hw, 0]], fill: '#E4E1DA', c: '#555', w: 0.6, hatch: 'concrete' });
      pr.push({ t: 'text', x: x0 + hw + 0.12, y: -D / 2, s: p.mount === 'tise' ? 'свая ТИСЭ Ø300, бетон М250, арматура' : 'бетон М200, яма Ø200', size: 0.13 });
    }
    if (p.mount === 'buta') {
      const hw = 0.125 * k * 2;
      pr.push({ t: 'poly', pts: [[x0 - hw, -D], [x0 + hw, -D], [x0 + hw, 0], [x0 - hw, 0]], fill: '#EEE9DE', c: '#555', w: 0.6, hatch: 'gravel' });
      pr.push({ t: 'text', x: x0 + hw + 0.12, y: -D / 2, s: 'щебень 20–40 с трамбовкой', size: 0.13 });
    }
    if (p.mount === 'strip') {
      pr.push({ t: 'poly', pts: [[x0 - 0.5, -D], [x0 + 0.5, -D], [x0 + 0.5, 0.25], [x0 - 0.5, 0.25]], fill: '#E4E1DA', c: '#555', w: 0.6, hatch: 'concrete' });
      pr.push({ t: 'text', x: x0 + 0.62, y: -D / 2, s: 'лента 300×700, бетон М250', size: 0.13 });
    }
    if (p.mount === 'screw') {
      pr.push({ t: 'poly', pts: [[x0 - 0.1, -D], [x0 + 0.1, -D], [x0 + 0.1, 0.1], [x0 - 0.1, 0.1]], fill: '#9AA3AD', c: '#333', w: 0.6 });
      for (const y of [-D + 0.25, -D + 0.45]) pr.push({ t: 'line', x1: x0 - 0.35, y1: y, x2: x0 + 0.35, y2: y - 0.1, w: 1.2 });
      pr.push({ t: 'text', x: x0 + 0.42, y: -D / 2, s: 'свая винтовая 76×2000 с оголовком', size: 0.13 });
    }
    const top = p.mount === 'strip' ? 0.25 : p.mount === 'screw' ? 0.1 : 0;
    const postBottom = p.mount === 'screw' || p.mount === 'strip' ? top : -D + 0.1;
    pr.push({ t: 'poly', pts: [[x0 - pw / 2, postBottom], [x0 + pw / 2, postBottom], [x0 + pw / 2, 1.8], [x0 - pw / 2, 1.8]], fill: col, c: '#222', w: 0.8 });
    pr.push({ t: 'line', x1: x0 - pw, y1: 1.75, x2: x0 + pw, y2: 1.85, w: 0.8 }); // обрыв
    pr.push({ t: 'text', x: x0 + pw / 2 + 0.12, y: 1.3, s: `столб ${r.info.postProf}`, size: 0.13 });
    if (!r.info.masonry) { pr.push({ t: 'poly', pts: [[x0 + pw / 2, 0.55], [x0 + pw / 2 + 0.1, 0.55], [x0 + pw / 2 + 0.1, 0.63], [x0 + pw / 2, 0.63]], fill: '#888', c: '#222', w: 0.4 }); pr.push({ t: 'text', x: x0 + pw / 2 + 0.16, y: 0.55, s: `лага ${r.info.lagProf}`, size: 0.12 }); }
    pr.push({ t: 'line', x1: x0 - 1.4, y1: 0, x2: x0 + 1.4, y2: 0, w: 1.2 });
    pr.push({ t: 'dim', x1: x0 - 0.6, y1: -D, x2: x0 - 0.6, y2: 0, off: -0.2, s: mm(dep) });
    pr.push({ t: 'text', x: x0 - 1.4, y: -D - 0.55, s: MOUNTS[p.mount].label, size: 0.14 });

    // Узел 2: откатные ворота
    if (gate && p.gate === 'slide') {
      const ox = 3.2, s = Math.min(0.55, 4.2 / ((gate.a1 - gate.a0) + r.tail)); // уменьшаем, чтобы влезло
      const gw = (gate.a1 - gate.a0) * s, tl = r.tail * s, hh = Math.min(1.6, p.h * s * 1.4);
      pr.push({ t: 'text', x: ox, y: 2.15, s: 'Узел 2. Откатные ворота (вид изнутри)', size: 0.2, bold: true });
      pr.push({ t: 'poly', pts: [[ox, -0.9], [ox + gw + tl + 0.6, -0.9], [ox + gw + tl + 0.6, 0], [ox, 0]], fill: '#EFE9DF', c: '#999', w: 0.4, hatch: 'soil' });
      // столбы проёма
      pr.push({ t: 'poly', pts: [[ox + 0.1, 0], [ox + 0.2, 0], [ox + 0.2, hh + 0.1], [ox + 0.1, hh + 0.1]], fill: col, c: '#222', w: 0.6 });
      pr.push({ t: 'poly', pts: [[ox + 0.2 + gw, 0], [ox + 0.3 + gw, 0], [ox + 0.3 + gw, hh + 0.1], [ox + 0.2 + gw, hh + 0.1]], fill: col, c: '#222', w: 0.6 });
      // полотно с противовесом
      const L0 = ox + 0.2, L1 = L0 + gw, T1 = L1 + tl;
      pr.push({ t: 'poly', pts: [[L0, 0.15], [L1, 0.15], [L1, hh], [L0, hh]], fill: '#F2F2F0', c: '#333', w: 0.9, hatch: 'prof' });
      pr.push({ t: 'line', x1: L1, y1: hh, x2: T1, y2: 0.18, w: 1.2 });
      pr.push({ t: 'line', x1: L0, y1: 0.12, x2: T1, y2: 0.12, w: 2.4 });
      // ролики и закладная
      for (const x of [L1 + 0.15, T1 - 0.15]) pr.push({ t: 'poly', pts: [[x - 0.1, 0], [x + 0.1, 0], [x + 0.1, 0.1], [x - 0.1, 0.1]], fill: '#555', c: '#222', w: 0.5 });
      pr.push({ t: 'poly', pts: [[L1 + 0.02, -0.75], [T1 + 0.05, -0.75], [T1 + 0.05, 0], [L1 + 0.02, 0]], fill: '#E4E1DA', c: '#555', w: 0.6, hatch: 'concrete' });
      pr.push({ t: 'line', x1: L1 + 0.02, y1: -0.02, x2: T1 + 0.05, y2: -0.02, w: 2 });
      pr.push({ t: 'text', x: L1 + 0.05, y: -1.15, s: 'закладная: швеллер 16П, бетон М250, глубина 1000–1500', size: 0.12 });
      pr.push({ t: 'text', x: L0 + 0.05, y: hh + 0.2, s: 'балка 70×60 и 2 роликовые опоры, улавливатели верхний и нижний', size: 0.12 });
      pr.push({ t: 'dim', x1: L0, y1: 0, x2: L1, y2: 0, off: -0.35, s: `проём ${mm(gate.a1 - gate.a0)}` });
      pr.push({ t: 'dim', x1: L1, y1: 0.12, x2: T1, y2: 0.12, off: hh + 0.0, s: `противовес ${mm(r.tail)}` });
    }
    // узлы рисуем крупнее: координаты ×2, ширина листа не меньше 10 единиц
    const S = 2;
    const sc = pr.map((q): Prim => q.t === 'line' ? { ...q, x1: q.x1 * S, y1: q.y1 * S, x2: q.x2 * S, y2: q.y2 * S }
      : q.t === 'poly' ? { ...q, pts: q.pts.map(([x, y]) => [x * S, y * S] as [number, number]) }
      : q.t === 'text' ? { ...q, x: q.x * S, y: q.y * S, size: (q.size ?? 0.3) * S }
      : { ...q, x1: q.x1 * S, y1: q.y1 * S, x2: q.x2 * S, y2: q.y2 * S, off: q.off * S });
    const x1 = (gate && p.gate === 'slide' ? 8.4 : 3.4) * S;
    sheets.push({ title: 'Узлы', x0: -1.6 * S, y0: -2.7 * S, x1: Math.max(x1, 10), y1: 2.4 * S, prims: sc });
  }
  return sheets;
}
