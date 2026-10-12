/** Чертежи плана участка: генплан с объектами и расстояниями по нормам, схема сетей */
import type { Prim, Sheet } from './render';
import { SITE_TYPES, type SiteResult, type SiteObj } from './site';

const FILL: Record<string, { fill: string; hatch?: 'concrete' | 'gravel' | 'mesh' | 'sand' }> = {
  house: { fill: '#F1E6D3' }, bath: { fill: '#E8D3B6' }, garage: { fill: '#E2E4E7' }, shed: { fill: '#E8D3B6' }, greenhouse: { fill: '#DDEFF6' },
  septic: { fill: '#CFE0C8' }, gasholder: { fill: '#F6E3C0' }, well: { fill: '#D6E8F5' }, borehole: { fill: '#D6E8F5' },
  parking: { fill: '#E4E0D8', hatch: 'gravel' }, path: { fill: '#E4E0D8', hatch: 'gravel' }, terrace: { fill: '#E7D2B4' },
  beds: { fill: '#D9C4A8', hatch: 'sand' }, tree: { fill: '#CFE6C2' }, compost: { fill: '#D9C4A8' }, wc: { fill: '#E8D3B6' },
};

export function siteDrawings(r: SiteResult): Sheet[] {
  const p = r.params, L = p.L, W = p.W;
  const k = Math.max(L, W) / 30; // крупность подписей
  const objRect = (o: SiteObj): [number, number][] => [[o.x - o.w / 2, o.y - o.d / 2], [o.x + o.w / 2, o.y - o.d / 2], [o.x + o.w / 2, o.y + o.d / 2], [o.x - o.w / 2, o.y + o.d / 2]];
  const base = (title: string): Prim[] => {
    const pr: Prim[] = [{ t: 'poly', pts: [[0, 0], [L, 0], [L, W], [0, W]], fill: '#F4F8EF', c: '#333', w: 1.8 }];
    pr.push({ t: 'text', x: L / 2, y: -1.6 * k, s: 'улица', size: 0.45 * k, anchor: 'middle', c: '#777' });
    if (p.fence) { const g0 = Math.max(0.3, Math.min(L - 4.3, p.gateX)); pr.push({ t: 'line', x1: g0, y1: 0, x2: g0 + 4, y2: 0, w: 4, c: '#ffffff' }); pr.push({ t: 'text', x: g0 + 2, y: 0.35 * k, s: 'въезд', size: 0.32 * k, anchor: 'middle', c: '#555' }); }
    for (const o of p.objs) {
      const f = FILL[o.type];
      if (o.type === 'tree') {
        const R = o.w / 2, n = 14;
        pr.push({ t: 'poly', pts: Array.from({ length: n }, (_, i) => [o.x + R * Math.cos((i / n) * 2 * Math.PI), o.y + R * Math.sin((i / n) * 2 * Math.PI)] as [number, number]), fill: f.fill, c: '#5f8f4a', w: 0.6 });
        continue;
      }
      pr.push({ t: 'poly', pts: objRect(o), fill: f.fill, c: '#444', w: ['house', 'bath', 'garage'].includes(o.type) ? 1.2 : 0.7, hatch: f.hatch });
      if (!['beds', 'path'].includes(o.type) || o.w * o.d > 6) pr.push({ t: 'text', x: o.x, y: o.y - 0.12 * k, s: SITE_TYPES[o.type].label, size: (o.w * o.d > 10 ? 0.38 : 0.26) * k, anchor: 'middle', bold: ['house'].includes(o.type) });
    }
    pr.push({ t: 'dim', x1: 0, y1: 0, x2: L, y2: 0, off: -0.9 * k, s: String(Math.round(L * 1000)) });
    pr.push({ t: 'dim', x1: L, y1: 0, x2: L, y2: W, off: 0.9 * k, s: String(Math.round(W * 1000)) });
    void title;
    return pr;
  };

  // ---------- 1. генплан с расстояниями ----------
  const pr1 = base('Генплан');
  for (const c of r.checks) {
    if (c.min <= 0.01) continue;
    const color = c.ok ? '#2e7d32' : c.soft ? '#C77700' : '#c62828';
    pr1.push({ t: 'line', x1: c.a[0], y1: c.a[1], x2: c.b[0], y2: c.b[1], w: c.ok ? 0.7 : 1.4, dash: true, c: color });
    const mx = (c.a[0] + c.b[0]) / 2, my = (c.a[1] + c.b[1]) / 2;
    if (c.d > 0.5 || !c.ok) pr1.push({ t: 'text', x: mx + 0.15 * k, y: my + 0.1 * k, s: `${String(c.d).replace('.', ',')}${c.ok ? '' : ` < ${c.min}`}`, size: 0.26 * k, c: color, bold: !c.ok });
  }
  const sheets: Sheet[] = [{ title: 'Генплан участка с расстояниями по нормам', x0: -1.8 * k, y0: -2.4 * k, x1: L + 2.2 * k, y1: W + 0.8 * k, prims: pr1 }];

  // ---------- 2. схема сетей ----------
  const pr2 = base('Сети');
  const house = p.objs.find((o) => o.type === 'house');
  if (house) {
    const net = (o: SiteObj, color: string, label: string) => {
      // трасса: от объекта до ближайшей стены дома, ломаная по осям
      const hx = Math.max(house.x - house.w / 2, Math.min(house.x + house.w / 2, o.x)), hy = Math.max(house.y - house.d / 2, Math.min(house.y + house.d / 2, o.y));
      pr2.push({ t: 'line', x1: o.x, y1: o.y, x2: hx, y2: o.y, w: 1.8, c: color });
      pr2.push({ t: 'line', x1: hx, y1: o.y, x2: hx, y2: hy, w: 1.8, c: color });
      pr2.push({ t: 'text', x: (o.x + hx) / 2, y: o.y + 0.25 * k, s: label, size: 0.26 * k, anchor: 'middle', c: color, bold: true });
    };
    for (const o of p.objs) {
      if (o.type === 'septic') net(o, '#6D4C2F', 'К1 канализация Ø110');
      if (o.type === 'gasholder') net(o, '#D18A00', 'Г газопровод ПЭ');
      if (o.type === 'borehole' || o.type === 'well') net(o, '#1F5FAE', 'В1 водопровод ПНД 32');
    }
  }
  pr2.push({ t: 'text', x: 0, y: W + 0.35 * k, s: 'К1 — канализация, Г — газ, В1 — водопровод. Трассы показаны схематично, глубина — ниже промерзания.', size: 0.24 * k });
  sheets.push({ title: 'Схема наружных сетей', x0: -1.8 * k, y0: -2.4 * k, x1: L + 2.2 * k, y1: W + 1.0 * k, prims: pr2 });
  return sheets;
}
