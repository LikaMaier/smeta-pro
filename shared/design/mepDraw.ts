/** Чертежи инженерии: план электрики с трассами групп, однолинейная схема щита, план сантехники */
import type { Prim, Sheet } from './render';
import { POINT_TYPES, ROOM_TYPES, type MepResult } from './mep';

const COL: Record<string, string> = { wireL: '#C79A00', wireS: '#E8772E', wireP: '#D32F2F', wireN: '#2E9C8F', pipeC: '#2F6FD6', pipeH: '#E04040', pipeS: '#6B7079' };
const ngon = (x: number, y: number, r: number, n = 10): [number, number][] => Array.from({ length: n }, (_, i) => [x + r * Math.cos((i / n) * 2 * Math.PI), y + r * Math.sin((i / n) * 2 * Math.PI)] as [number, number]);

export function mepDrawings(r: MepResult): Sheet[] {
  const p = r.params;
  const xs = p.rooms.flatMap((q) => [q.x, q.x + q.w]), ys = p.rooms.flatMap((q) => [q.y, q.y + q.d]);
  const X0 = Math.min(...xs, 0), X1 = Math.max(...xs, 1), Y0 = Math.min(...ys, 0), Y1 = Math.max(...ys, 1);
  const k = Math.max(X1 - X0, Y1 - Y0) / 14; // крупность подписей
  const base = (): Prim[] => {
    const pr: Prim[] = [];
    for (const q of p.rooms) {
      pr.push({ t: 'poly', pts: [[q.x, q.y], [q.x + q.w, q.y], [q.x + q.w, q.y + q.d], [q.x, q.y + q.d]], fill: ROOM_TYPES[q.type]?.color || '#eee', c: '#333', w: 1.6 });
      pr.push({ t: 'text', x: q.x + 0.12, y: q.y + q.d - 0.3 * k, s: `${q.name} · ${Math.round(q.w * q.d * 10) / 10} м²`, size: 0.2 * k, c: '#555' });
    }
    return pr;
  };
  const routes = (pr: Prim[], kinds: string[]) => {
    for (const m of r.members) {
      if (!kinds.includes(m.kind)) continue;
      if (Math.abs(m.a[0] - m.b[0]) + Math.abs(m.a[1] - m.b[1]) < 0.01) continue; // вертикальные спуски на плане — точкой
      pr.push({ t: 'line', x1: m.a[0], y1: m.a[1], x2: m.b[0], y2: m.b[1], w: m.kind === 'pipeS' ? 2.2 : 1.3, c: COL[m.kind], dash: m.kind === 'pipeS' || m.kind === 'wireN' });
    }
  };
  const sheets: Sheet[] = [];
  const bounds = { x0: X0 - 0.8 * k, y0: Y0 - 2.2 * k, x1: X1 + 0.8 * k, y1: Y1 + 0.6 * k };

  // ---------- 1. план электрики ----------
  {
    const pr = base();
    routes(pr, ['wireL', 'wireS', 'wireP', 'wireN']);
    for (const pt of p.points) {
      const T = POINT_TYPES[pt.type];
      if (!T || T.sys !== 'el') continue;
      const s = 0.09 * k;
      if (pt.type === 'panel') pr.push({ t: 'poly', pts: [[pt.x - 0.25, pt.y - 0.08], [pt.x + 0.25, pt.y - 0.08], [pt.x + 0.25, pt.y + 0.08], [pt.x - 0.25, pt.y + 0.08]], fill: '#333', c: '#000', w: 0.8 });
      else if (T.cat === 'Свет' && pt.type !== 'switch') { pr.push({ t: 'poly', pts: ngon(pt.x, pt.y, pt.type === 'spot' ? s * 0.7 : s * 1.3), fill: '#FFE27A', c: '#8a6d00', w: 0.8 }); if (pt.type === 'light') { pr.push({ t: 'line', x1: pt.x - s, y1: pt.y - s, x2: pt.x + s, y2: pt.y + s, w: 0.7, c: '#8a6d00' }); pr.push({ t: 'line', x1: pt.x - s, y1: pt.y + s, x2: pt.x + s, y2: pt.y - s, w: 0.7, c: '#8a6d00' }); } }
      else if (pt.type === 'switch') { pr.push({ t: 'poly', pts: ngon(pt.x, pt.y, s * 0.7), fill: '#fff', c: '#333', w: 0.8 }); pr.push({ t: 'line', x1: pt.x, y1: pt.y, x2: pt.x + s * 1.6, y2: pt.y + s * 1.6, w: 0.8 }); }
      else {
        const own = T.own ? '#D32F2F' : T.cat === 'Слаботочка' ? '#2E9C8F' : pt.type === 'socketWet' ? '#2F6FD6' : '#E8772E';
        pr.push({ t: 'poly', pts: ngon(pt.x, pt.y, s * 0.8, 8), fill: '#fff', c: own, w: 1.2 });
        if (T.own || pt.type === 'socketK' || pt.type === 'socketWet') pr.push({ t: 'text', x: pt.x + s, y: pt.y + s, s: ({ stove: 'П', oven: 'Д', washer: 'СМ', dish: 'ПММ', boilerEl: 'ВН', ac: 'К', floorHeat: 'ТП', socketK: '1100', socketWet: 'IP44' } as any)[pt.type] || '', size: 0.14 * k, c: own });
      }
    }
    // легенда групп
    const ly = Y0 - 0.7 * k;
    [['wireL', 'освещение 3×1,5'], ['wireS', 'розетки 3×2,5'], ['wireP', 'силовые линии'], ['wireN', 'интернет / ТВ']].forEach(([kd, t], i) => {
      const lx = X0 + i * (X1 - X0) / 4;
      pr.push({ t: 'line', x1: lx, y1: ly, x2: lx + 0.6 * k, y2: ly, w: 2, c: COL[kd], dash: kd === 'wireN' });
      pr.push({ t: 'text', x: lx + 0.7 * k, y: ly - 0.06 * k, s: t, size: 0.17 * k });
    });
    pr.push({ t: 'text', x: X0, y: Y0 - 1.4 * k, s: `Групп: ${r.groups.filter((g) => g.amp > 0).length} · кабель ${Object.entries(r.cableBy).map(([c, l]) => `${c} — ${Math.round(l as number)} м`).join(', ')}. Трассы — схематично, по потолку с опуском к точке.`, size: 0.16 * k });
    sheets.push({ title: 'План электрики', ...bounds, prims: pr });
  }

  // ---------- 2. схема щита ----------
  if (r.groups.length) {
    const pr: Prim[] = [];
    const n = r.groups.length, step = 0.55;
    const busY = 0, W = 13;
    pr.push({ t: 'text', x: 0, y: 1.25, s: 'Ввод 220 В → вводной автомат 40 А → реле напряжения', size: 0.19, bold: true });
    pr.push({ t: 'line', x1: 0.3, y1: 0.9, x2: 0.3, y2: busY - step * (n - 1), w: 2.2 });
    r.groups.forEach((g, i) => {
      const y = busY - step * i;
      pr.push({ t: 'line', x1: 0.3, y1: y, x2: 1.4, y2: y, w: 1.2 });
      pr.push({ t: 'poly', pts: [[1.4, y - 0.14], [2.3, y - 0.14], [2.3, y + 0.14], [1.4, y + 0.14]], fill: g.rcd ? '#E3F0FF' : '#F4F4F4', c: '#333', w: 0.8 });
      pr.push({ t: 'text', x: 1.85, y: y - 0.06, s: g.amp ? `${g.rcd ? 'ДА' : 'QF'}${i + 1} ${g.amp}А` : 'слабот.', size: 0.13, anchor: 'middle', bold: true });
      pr.push({ t: 'line', x1: 2.3, y1: y, x2: 3.0, y2: y, w: 1.2, c: COL[g.kind] });
      pr.push({ t: 'text', x: 3.1, y: y - 0.06, s: `Гр. ${i + 1} · ${g.name} · ${g.cable} · ${g.len} м · точек ${g.pts.length}${g.rcd ? ' · УЗО 30 мА' : ''}`, size: 0.15 });
    });
    pr.push({ t: 'text', x: 0, y: busY - step * n - 0.25, s: 'QF — автоматический выключатель, ДА — дифавтомат 30 мА (мокрые зоны, кухня, розеточные группы).', size: 0.13, c: '#555' });
    sheets.push({ title: 'Однолинейная схема щита', x0: -0.3, y0: busY - step * n - 0.6, x1: W, y1: 1.6, prims: pr });
  }

  // ---------- 3. план сантехники ----------
  if (p.points.some((x) => POINT_TYPES[x.type]?.sys === 'pl')) {
    const pr = base();
    routes(pr, ['pipeS', 'pipeC', 'pipeH']);
    for (const pt of p.points) {
      const T = POINT_TYPES[pt.type];
      if (!T || T.sys !== 'pl') continue;
      const w = pt.pw ?? T.w, d = pt.pd ?? T.d;
      if (pt.type === 'riser') { pr.push({ t: 'poly', pts: ngon(pt.x, pt.y, 0.1), fill: '#7FA7D9', c: '#1f4f9a', w: 1 }); pr.push({ t: 'text', x: pt.x + 0.15, y: pt.y + 0.1, s: 'Ст. В1/Т3/К1', size: 0.15 * k, c: '#1f4f9a' }); continue; }
      pr.push({ t: 'poly', pts: [[pt.x - w / 2, pt.y - d / 2], [pt.x + w / 2, pt.y - d / 2], [pt.x + w / 2, pt.y + d / 2], [pt.x - w / 2, pt.y + d / 2]], fill: '#FFFFFF', c: '#333', w: 0.9 });
      pr.push({ t: 'text', x: pt.x, y: pt.y - 0.05, s: T.label.split(' ')[0], size: 0.13 * k, anchor: 'middle' });
    }
    const ly = Y0 - 0.7 * k;
    [['pipeC', `ХВС ${r.pipeLen.cold} м`], ['pipeH', `ГВС ${r.pipeLen.hot} м`], ['pipeS', `канализация Ø50 ${r.pipeLen.s50} м · Ø110 ${r.pipeLen.s110} м`]].forEach(([kd, t], i) => {
      const lx = X0 + i * (X1 - X0) / 3.2;
      pr.push({ t: 'line', x1: lx, y1: ly, x2: lx + 0.6 * k, y2: ly, w: 2, c: COL[kd], dash: kd === 'pipeS' });
      pr.push({ t: 'text', x: lx + 0.7 * k, y: ly - 0.06 * k, s: t, size: 0.17 * k });
    });
    pr.push({ t: 'text', x: X0, y: Y0 - 1.4 * k, s: 'Канализация — с уклоном 2–3 см/м к стояку; Ø110 — от унитаза. Трассы показаны схематично.', size: 0.16 * k });
    sheets.push({ title: 'План сантехники', ...bounds, prims: pr });
  }
  return sheets;
}
