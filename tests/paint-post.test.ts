import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCanopy } from '../shared/design/canopy';
import { buildFence } from '../shared/design/fence3d';
import { PRESETS } from '../shared/design/presets';
import { designPdfData } from '../shared/design/report';
import { render3d } from '../shared/design/render';

const garage = PRESETS.find((x) => x.id === 'garage')!.p;
const shed = PRESETS.find((x) => x.id === 'shed')!.p;

test('без покраски: нет грунт-эмали и покраски, листы оцинкованные', () => {
  const a = buildCanopy(garage), n = buildCanopy({ ...garage, color: 'none' });
  assert.ok(a.lines.some((l) => /Грунт-эмаль/.test(l.name)) && a.lines.some((l) => l.name === 'Покраска металлоконструкций'));
  assert.ok(!n.lines.some((l) => /Грунт-эмаль/.test(l.name) || l.name === 'Покраска металлоконструкций'));
  assert.ok(n.lines.some((l) => /оцинкованный/.test(l.name)));
  const w = buildCanopy({ ...shed, color: 'none' });
  assert.ok(!w.lines.some((l) => /Масло-лазурь|Покраска древесины/.test(l.name)) && w.lines.some((l) => /Антисептик/.test(l.name)));
  assert.ok(render3d(n).items.length > 50);
  assert.ok(designPdfData(n, { title: 't' }).params.some(([, v]: any) => /без покраски/.test(v)));
  const f = buildFence({ color: 'none' } as any);
  assert.ok(!f.lines.some((l: any) => /Грунт-эмаль/.test(l.name)));
});

test('свой столб: размер в модели, металле и смете; предупреждение, если тоньше', () => {
  const r = buildCanopy({ ...garage, postA: 100, postB: 80, postT: 4 });
  assert.ok(r.members.filter((m) => m.kind === 'post').every((m) => m.profile === '100×80×4'));
  assert.ok(r.lines.some((l) => /Труба профильная 100×80×4/.test(l.name)));
  const thin = buildCanopy({ ...garage, postA: 40, postT: 2 });
  assert.ok(thin.warnings.some((w) => /слабее подобранного/.test(w)));
  const wood = buildCanopy({ ...shed, postA: 120, postB: 120 });
  assert.ok(wood.members.filter((m) => m.kind === 'post').every((m) => m.profile === '120×120'));
  const f = buildFence({ postA: 80, postB: 80, postT: 3 } as any);
  assert.ok(f.members.filter((m) => m.kind === 'post').some((m) => m.profile === '80×80×3'));
  assert.ok(f.lines.some((l: any) => /Труба профильная 80×80×3 \(столб\)/.test(l.name)));
});
