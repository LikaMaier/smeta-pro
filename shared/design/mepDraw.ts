/** Чертежи инженерии: план электрики с трассами групп, однолинейная схема щита, план сантехники */
import type { Prim, Sheet } from './render';
import { POINT_TYPES, ROOM_TYPES, zoneRects, type MepResult } from './mep';

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
    // зоны ванной: 0,6 м вокруг ванны / душа — розетки и выключатели туда не ставят
    for (const { z1: z, z2 } of zoneRects(p.points, p.rooms)) {
      pr.push({ t: 'poly', pts: [[z2.x0, z2.y0], [z2.x1, z2.y0], [z2.x1, z2.y1], [z2.x0, z2.y1]], fill: '#E8F0FB', c: '#7FA7D9', w: 0.6 });
      pr.push({ t: 'poly', pts: [[z.x0, z.y0], [z.x1, z.y0], [z.x1, z.y1], [z.x0, z.y1]], fill: '#CFE0F6', c: '#2F6FD6', w: 0.6 });
      pr.push({ t: 'text', x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2, s: 'зона 1', size: 0.13 * k, anchor: 'middle', c: '#1f4f9a' });
      pr.push({ t: 'text', x: z2.x0 + 0.05, y: z2.y0 + 0.08, s: 'зона 2', size: 0.11 * k, c: '#1f4f9a' });
    }
    routes(pr, ['wireL', 'wireS', 'wireP', 'wireN']);
    for (const pt of p.points) {
      const T = POINT_TYPES[pt.type];
      if (!T || T.sys !== 'el') continue;
      const s = 0.09 * k;
      if (pt.type === 'gasPipe') { pr.push({ t: 'poly', pts: ngon(pt.x, pt.y, s * 0.8, 4), fill: '#FFE0B2', c: '#E65100', w: 1 }); pr.push({ t: 'text', x: pt.x + s, y: pt.y + s, s: 'газ', size: 0.14 * k, c: '#E65100' }); continue; }
      if (pt.type === 'panel') pr.push({ t: 'poly', pts: [[pt.x - 0.25, pt.y - 0.08], [pt.x + 0.25, pt.y - 0.08], [pt.x + 0.25, pt.y + 0.08], [pt.x - 0.25, pt.y + 0.08]], fill: '#333', c: '#000', w: 0.8 });
      else if (T.cat === 'Свет' && pt.type !== 'switch') { pr.push({ t: 'poly', pts: ngon(pt.x, pt.y, pt.type === 'spot' ? s * 0.7 : s * 1.3), fill: '#FFE27A', c: '#8a6d00', w: 0.8 }); if (pt.type === 'light') { pr.push({ t: 'line', x1: pt.x - s, y1: pt.y - s, x2: pt.x + s, y2: pt.y + s, w: 0.7, c: '#8a6d00' }); pr.push({ t: 'line', x1: pt.x - s, y1: pt.y + s, x2: pt.x + s, y2: pt.y - s, w: 0.7, c: '#8a6d00' }); } }
      else if (pt.type === 'switch') { pr.push({ t: 'poly', pts: ngon(pt.x, pt.y, s * 0.7), fill: '#fff', c: '#333', w: 0.8 }); pr.push({ t: 'line', x1: pt.x, y1: pt.y, x2: pt.x + s * 1.6, y2: pt.y + s * 1.6, w: 0.8 }); }
      else {
        const own = T.own ? '#D32F2F' : T.cat === 'Слаботочка' ? '#2E9C8F' : pt.type === 'socketWet' ? '#2F6FD6' : '#E8772E';
        pr.push({ t: 'poly', pts: ngon(pt.x, pt.y, s * 0.8, 8), fill: '#fff', c: own, w: 1.2 });
        if (T.own || pt.type === 'socketK' || pt.type === 'socketWet' || pt.type === 'hood') pr.push({ t: 'text', x: pt.x + s, y: pt.y + s, s: ({ stove: 'П', oven: 'Д', washer: 'СМ', dish: 'ПММ', boilerEl: 'ВН', ac: 'К', floorHeat: 'ТП', heatBoiler: 'КО', socketOut: 'ул.', hood: 'В', socketK: '1100', socketWet: 'IP44' } as any)[pt.type] || '', size: 0.14 * k, c: own });
      }
    }
    // нарушения норм — красным кольцом
    const bad = new Set(r.checks.filter((c) => c.lvl === 'err').flatMap((c) => c.ids || []));
    for (const pt of p.points) if (bad.has(pt.id)) pr.push({ t: 'poly', pts: ngon(pt.x, pt.y, 0.2 * k, 16), c: '#D32F2F', w: 1.6 });
    // легенда групп
    const ly = Y0 - 0.7 * k;
    [['wireL', 'освещение 3×1,5'], ['wireS', 'розетки 3×2,5'], ['wireP', 'силовые линии'], ['wireN', 'интернет / ТВ']].forEach(([kd, t], i) => {
      const lx = X0 + i * (X1 - X0) / 4;
      pr.push({ t: 'line', x1: lx, y1: ly, x2: lx + 0.6 * k, y2: ly, w: 2, c: COL[kd], dash: kd === 'wireN' });
      pr.push({ t: 'text', x: lx + 0.7 * k, y: ly - 0.06 * k, s: t, size: 0.17 * k });
    });
    pr.push({ t: 'text', x: X0, y: Y0 - 1.4 * k, s: `Групп: ${r.groups.filter((g) => g.amp > 0).length} · ${r.power.calc} кВт расч. · кабель ${Object.entries(r.cableBy).map(([c, l]) => `${c} — ${Math.round(l as number)} м`).join(', ')}. Трассы — схематично: по стене в 150 мм от потолка, к точке — вертикально.`, size: 0.16 * k });
    sheets.push({ title: 'План электрики', ...bounds, prims: pr });
  }

  // ---------- 2. однолинейная схема щита с расчётом линий ----------
  if (r.groups.length) {
    const pr: Prim[] = [];
    const n = r.groups.length, step = 0.5;
    const busY = 0, W = 15.6;
    const w = r.power, dev = r.shield.devices;
    const head = dev.filter((d) => !d.group && !/^Q\d/.test(d.code)).map((d) => `${d.code} ${d.name}`).join(' — ');
    pr.push({ t: 'text', x: 0, y: 1.75, s: `Ввод: ${w.phases === 3 ? '3 фазы 400 В' : '1 фаза 230 В'}, TN-C-S, выделено ${w.allow} кВт · кабель ввода ${w.inCable}`, size: 0.2, bold: true });
    pr.push({ t: 'text', x: 0, y: 1.4, s: head, size: 0.15 });
    pr.push({ t: 'text', x: 0, y: 1.1, s: `Установленная мощность ${w.inst} кВт, расчётная ${w.calc} кВт, расчётный ток ${w.iCalc} А${w.phaseKw.length ? ` · L1 ${w.phaseKw[0]} / L2 ${w.phaseKw[1]} / L3 ${w.phaseKw[2]} кВт` : ''}`, size: 0.15, c: '#333' });
    const cols: [number, string][] = [[3.0, 'Группа'], [9.0, 'Кабель'], [10.3, 'L, м'], [11.3, 'P, кВт'], [12.5, 'Iр, А'], [13.6, 'ΔU, %'], [14.7, 'Фаза']];
    for (const [x, t] of cols) pr.push({ t: 'text', x, y: 0.45, s: t, size: 0.14, bold: true, c: '#555' });
    pr.push({ t: 'line', x1: 0.3, y1: 0.75, x2: 0.3, y2: busY - step * (n - 1), w: 2.2 });
    let rcdCode = '';
    const codeOf = new Map<number, { code: string; under: string }>();
    for (const d of dev) { if (/^Q\d/.test(d.code)) rcdCode = d.code; if (d.group) codeOf.set(d.group, { code: d.code, under: /^QF/.test(d.code) && rcdCode ? rcdCode : '' }); }
    r.groups.forEach((g, i) => {
      const y = busY - step * i;
      const c = codeOf.get(i + 1);
      const prot = g.rcd && g.amp > 0;
      pr.push({ t: 'line', x1: 0.3, y1: y, x2: 1.3, y2: y, w: 1.2 });
      pr.push({ t: 'poly', pts: [[1.3, y - 0.14], [2.55, y - 0.14], [2.55, y + 0.14], [1.3, y + 0.14]], fill: prot ? '#E3F0FF' : '#F4F4F4', c: '#333', w: 0.8 });
      pr.push({ t: 'text', x: 1.92, y: y - 0.06, s: g.amp ? `${c?.code || `QF${i + 1}`} C${g.amp}` : 'слабот.', size: 0.13, anchor: 'middle', bold: true });
      pr.push({ t: 'line', x1: 2.55, y1: y, x2: 2.9, y2: y, w: 1.2, c: COL[g.kind] });
      const name = `${i + 1}. ${g.name}${prot ? (c?.under ? ` (${c.under})` : ' · 30 мА') : ''}`;
      pr.push({ t: 'text', x: 3.0, y: y - 0.06, s: name.length > 52 ? name.slice(0, 51) + '…' : name, size: 0.14 });
      const vals = [g.cable, String(g.len), g.amp ? String(Math.round(g.watt / 100) / 10) : '—', g.amp ? String(g.ib) : '—', g.amp ? String(g.du) : '—', g.phase ? `L${g.phase}` : w.phases === 1 ? 'L' : '—'];
      vals.forEach((v, k) => pr.push({ t: 'text', x: cols[k + 1][0], y: y - 0.06, s: v, size: 0.14, c: k === 4 && g.du > 4 ? '#D32F2F' : '#222' }));
    });
    const yb = busY - step * n;
    pr.push({ t: 'text', x: 0, y: yb - 0.1, s: 'QF — автомат, QD — дифавтомат 30 мА тип A, Q — УЗО 30 мА, FV — УЗИП, KV — реле напряжения. Розетки и мокрые зоны — через УЗО 30 мА (СП 256, ПУЭ 7.1.79).', size: 0.13, c: '#555' });
    pr.push({ t: 'text', x: 0, y: yb - 0.38, s: 'Сечение по автомату: 1,5 мм² — до 10 А, 2,5 — 16 А, 4 — 25 А, 6 — 32 А; потери напряжения в линии — не больше 4% (ГОСТ Р 50571.5.52). Кабель ВВГнг(А)-LS, медь.', size: 0.13, c: '#555' });
    sheets.push({ title: 'Однолинейная схема щита и расчёт линий', x0: -0.3, y0: yb - 0.7, x1: W, y1: 2.1, prims: pr });

    // ---------- 2б. щит на DIN-рейке ----------
    const sh = r.shield, M = 0.62, H = 1.9, gap = 1.1;
    const dp: Prim[] = [];
    const fillOf = (d: { code: string; name: string }) => d.code === 'QF0' ? '#CFD3D8' : /^FV/.test(d.code) ? '#FFD9B0' : /^KV/.test(d.code) ? '#CFE3FF' : /^Q(D|\d)/.test(d.code) ? '#DDF0E4' : '#FFFFFF';
    let slot = 0;
    const at = (k: number) => ({ row: Math.floor(k / sh.row), col: k % sh.row });
    const cells: { d: any; s: number }[] = [];
    for (const d of sh.devices) {
      const { col } = at(slot);
      if (col + d.mod > sh.row) slot += sh.row - col; // аппарат не разрываем между рейками
      cells.push({ d, s: slot }); slot += d.mod;
    }
    const rows = Math.max(sh.rows, Math.ceil(slot / sh.row));
    for (let rI = 0; rI < rows; rI++) {
      const y = -rI * (H + gap);
      dp.push({ t: 'poly', pts: [[-0.15, y - 0.1], [sh.row * M + 0.15, y - 0.1], [sh.row * M + 0.15, y + 0.1], [-0.15, y + 0.1]], fill: '#9AA0A6', c: '#666', w: 0.6 });
      for (let c = 0; c < sh.row; c++) dp.push({ t: 'poly', pts: [[c * M, y - H / 2], [(c + 1) * M, y - H / 2], [(c + 1) * M, y + H / 2], [c * M, y + H / 2]], fill: '#F7F7F7', c: '#D0D0D0', w: 0.4 });
    }
    for (const { d, s: k } of cells) {
      const { row, col } = at(k), y = -row * (H + gap);
      const x0 = col * M, x1 = x0 + d.mod * M;
      dp.push({ t: 'poly', pts: [[x0 + 0.03, y - H / 2], [x1 - 0.03, y - H / 2], [x1 - 0.03, y + H / 2], [x0 + 0.03, y + H / 2]], fill: fillOf(d), c: '#333', w: 0.9 });
      dp.push({ t: 'text', x: (x0 + x1) / 2, y: y + H / 2 - 0.32, s: d.code, size: 0.17, anchor: 'middle', bold: true });
      const rate = (d.name.match(/C\d+|\d+ мА|тип 1\+2|тип 2/) || [''])[0];
      dp.push({ t: 'text', x: (x0 + x1) / 2, y: y - 0.05, s: rate, size: 0.15, anchor: 'middle' });
      if (d.group) dp.push({ t: 'text', x: (x0 + x1) / 2, y: y - H / 2 + 0.2, s: `гр.${d.group}`, size: 0.13, anchor: 'middle', c: '#555' });
    }
    // легенда
    const ly0 = -(rows - 1) * (H + gap) - H / 2 - 0.6;
    const uniq = sh.devices.map((d) => `${d.code} — ${d.name}${d.group ? ` (гр. ${d.group})` : ''}`);
    const half = Math.ceil(uniq.length / 2), colW = Math.max(sh.row * M / 2, 5.4);
    uniq.forEach((t, i) => dp.push({ t: 'text', x: i < half ? 0 : colW, y: ly0 - (i % half) * 0.32, s: t, size: 0.15 }));
    const lyEnd = ly0 - half * 0.32;
    dp.push({ t: 'text', x: 0, y: lyEnd - 0.2, s: `Щит ${sh.size} модулей: занято ${sh.used}, резерв ${sh.size - sh.used} (не меньше 20% на будущее). Шины N и PE — отдельно, N и PE не объединять после разделения PEN.`, size: 0.14, c: '#555' });
    sheets.push({ title: 'Электрощит: компоновка на DIN-рейке', x0: -0.5, y0: lyEnd - 0.55, x1: Math.max(sh.row * M, colW * 2) + 0.5, y1: H / 2 + 0.4, prims: dp });
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
