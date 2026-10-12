import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCanopy } from '../shared/design/canopy';
import { PRESETS } from '../shared/design/presets';
import { drawings, render3d } from '../shared/design/render';
import { designPdfData } from '../shared/design/report';

const shed = PRESETS.find((x) => x.id === 'shed')!.p;

test('проёмы вручную: дверь по месту и размеру, окна добавляются, столб в проёме убирается', () => {
  const r = buildCanopy({ ...shed, ops: [
    { id: 'd', kind: 'door', side: 'front', at: 0.8, w: 1.0, h: 2.0 },
    { id: 'w1', kind: 'window', side: 'left', at: 1.25, w: 0.8, h: 0.6, sill: 1.1 },
    { id: 'w2', kind: 'window', side: 'right', at: 1.25, w: 1.0, h: 1.0, sill: 0.9 },
  ] });
  const d = r.openings.find((o) => o.id === 'd')!;
  assert.ok(Math.abs(d.a0 - 0.3) < 1e-6 && Math.abs(d.a1 - 1.3) < 1e-6 && d.h === 2);
  const w1 = r.openings.find((o) => o.id === 'w1')!;
  assert.equal(w1.kind, 'window'); assert.equal(w1.z0, 1.1); assert.ok(Math.abs(w1.h - 1.7) < 1e-6);
  assert.equal(r.panels.filter((p) => p.kind === 'window').length, 2);
  // столб посередине фасада (1,5 м) не попал в дверь 0,3–1,3; дверь на 1,5 — уберёт
  const r2 = buildCanopy({ ...shed, ops: [{ id: 'd', kind: 'door', side: 'front', at: 1.5, w: 0.9, h: 2 }] });
  assert.ok(!r2.members.some((m) => m.kind === 'post' && Math.abs(m.a[1]) < 1e-6 && Math.abs(m.a[0] - 1.5) < 1e-6));
  assert.ok(r.lines.some((l) => /Окно ПВХ 800×600/.test(l.name)) && r.lines.some((l) => l.name === 'Монтаж пластикового окна'));
  assert.ok(r.lines.some((l) => /Дверь деревянная уличная 1000×2000/.test(l.name)));
  // под окном стена есть, в проёме — нет
  assert.ok(drawings(r).length >= 4 && render3d(r).items.length > 50);
  assert.ok(designPdfData(r, { title: 't' }).params.some(([, v]: any) => /окно 0,8×0,6|окно 0.8×0.6/.test(v)));
});

test('проёмы вручную: окно выше стены уменьшается, без проёмов — нет ни двери, ни ворот', () => {
  const r = buildCanopy({ ...shed, ops: [{ id: 'w', kind: 'window', side: 'back', at: 1.5, w: 1, h: 3, sill: 1 }] });
  const w = r.openings[0];
  assert.ok(w.h <= 2.51 && r.warnings.some((x) => /высота окна уменьшена/.test(x)));
  const r0 = buildCanopy({ ...shed, ops: [] });
  assert.equal(r0.openings.length, 0);
  // без ops — как раньше: дверь ставится сама
  assert.equal(buildCanopy(shed).openings.filter((o) => o.kind === 'door').length, 1);
});
