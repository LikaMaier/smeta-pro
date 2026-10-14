import { buildCanopy, CANOPY_DEFAULT } from '/home/claude/smeta-pro/shared/design/canopy';
import { PRESETS } from '/home/claude/smeta-pro/shared/design/presets';
import { render3d, view3dToSvg, drawings, sheetToSvg } from '/home/claude/smeta-pro/shared/design/render';
const BLANK: any = { block: 0, blockAt: 'left', blockWall: 'prof_full', ties: 'auto', curb: false, bumpers: false, entry: 'none', containers: 0, contType: '1.1', profGrade: 'C8', layout: 'perimeter', midRows: 0, stripW: 0.4, stripD: 0.7, eps: 0.1, attach: false, frame: 'steel', gate: 'none', door: false, ops: null, lining: undefined, floorOn: undefined, postA: undefined, postB: undefined, postT: undefined, insulate: false, gutter: false, snowGuard: false, lights: 0, snow: 3, waste: 5, profH: 2, slabT: 0.15, sand: 0.2, gravel: 0.2, slabOver: 0, rebar: 'composite' };
const full = (p: any) => ({ ...CANOPY_DEFAULT, ...BLANK, ...p, walls: { ...CANOPY_DEFAULT.walls, ...(p.walls || {}) } });
const cache = new Map<string, any>();
function res(id: string, patch: any = {}) {
  const k = id + JSON.stringify(patch);
  if (!cache.has(k)) { const pr = PRESETS.find((x) => x.id === id)!; cache.set(k, buildCanopy(full({ ...pr.p, ...patch }) as any)); }
  return cache.get(k);
}
(window as any).ENG = {
  title: (id: string) => PRESETS.find((x) => x.id === id)!.title,
  svg: (id: string, yaw: number, pitch: number, w: number, h: number, patch?: any) => view3dToSvg(render3d(res(id, patch), yaw, pitch, w, h)),
  lines: (id: string, patch?: any) => res(id, patch).lines.map((l: any) => ({ name: l.name, qty: l.qty, unit: l.unit, price: l.price || 0, type: l.type })),
  total: (id: string, patch?: any) => Math.round(res(id, patch).lines.reduce((a: number, l: any) => a + l.qty * (l.price || 0), 0)),
  info: (id: string, patch?: any) => res(id, patch).info,
  sheets: (id: string) => drawings(res(id)).map((s: any) => ({ title: s.title, svg: sheetToSvg(s, 460) })),
};
(window as any).ENG_READY = true;
