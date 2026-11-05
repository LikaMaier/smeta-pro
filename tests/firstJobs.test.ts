import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_JOBS, TRADE_JOBS, DEFAULT_JOBS, JOB_GROUPS, getJob, jobsFor, jobDefaults, jobLines, jobTotals, jobSections, clampSize } from '../shared/firstJobs';
import { TRADES } from '../shared/trades';
import { COUNT_UNIT } from '../shared/masters';

test('первая смета: каждая работа считается с размерами по умолчанию — позиции с ценами, разумный итог', () => {
  for (const j of FIRST_JOBS) {
    const d = jobDefaults(j);
    const ls = jobLines(j, d.sizes, d.opts);
    assert.ok(ls.length >= 3, `${j.id}: мало позиций`);
    for (const l of ls) {
      assert.ok(l.price > 0, `${j.id}: нет цены у «${l.name}»`);
      assert.ok(l.qty > 0, `${j.id}: количество 0 у «${l.name}»`);
      if (COUNT_UNIT.test(l.unit)) assert.ok(Number.isInteger(l.qty), `${j.id}: дробное ${l.qty} ${l.unit} у «${l.name}»`);
    }
    const t = jobTotals(ls);
    assert.ok(t.total > 3000 && t.total < 5e6, `${j.id}: итог ${t.total}`);
    assert.equal(t.total, t.works + t.mats + (t.total - t.works - t.mats));
    assert.ok(jobSections(ls).reduce((a, s) => a + s.lines.length, 0) === ls.length, `${j.id}: разделы потеряли строки`);
    assert.ok(j.name(d.sizes).length > 3 && !/undefined|NaN/.test(j.name(d.sizes)), `${j.id}: название «${j.name(d.sizes)}»`);
  }
});

test('первая смета: крайние размеры и все галочки не ломают расчёт', () => {
  for (const j of FIRST_JOBS) {
    const d = jobDefaults(j);
    for (const edge of ['min', 'max'] as const) {
      const sizes = Object.fromEntries(j.size.map((f) => [f.key, f[edge]]));
      if (j.id === 'handy' && edge === 'min') sizes.hang = 1; // хотя бы одно дело
      for (const flip of [false, true]) {
        const opts = Object.fromEntries(Object.entries(d.opts).map(([k, v]) => [k, flip ? !v : v]));
        const ls = jobLines(j, sizes, opts);
        assert.ok(ls.length >= 1, `${j.id} ${edge} ${flip}: пусто`);
        const t = jobTotals(ls).total;
        assert.ok(Number.isFinite(t) && t > 0, `${j.id} ${edge} ${flip}: итог ${t}`);
      }
    }
  }
});

test('первая смета: размер больше — смета дороже; эконом дешевле стандарта, премиум дороже', () => {
  for (const j of FIRST_JOBS) {
    const d = jobDefaults(j);
    const std = jobTotals(jobLines(j, d.sizes, d.opts)).total;
    const eco = jobTotals(jobLines(j, d.sizes, d.opts, 'eco')).total;
    const prem = jobTotals(jobLines(j, d.sizes, d.opts, 'prem')).total;
    assert.ok(eco < std && std < prem, `${j.id}: ${eco} / ${std} / ${prem}`);
    const f = j.size[0];
    const bigger = { ...d.sizes, [f.key]: Math.min(f.max, f.def * 2) };
    assert.ok(jobTotals(jobLines(j, bigger, d.opts)).total > std, `${j.id}: при ${f.label} ×2 не дороже`);
  }
});

test('первая смета: галочки работают — без демонтажа и сантехники ванная дешевле', () => {
  const bath = getJob('bath')!;
  const d = jobDefaults(bath);
  const full = jobTotals(jobLines(bath, d.sizes, d.opts)).total;
  const bare = jobLines(bath, d.sizes, { demo: false, plumb: false, ceil: false });
  assert.ok(jobTotals(bare).total < full * 0.7);
  assert.ok(!bare.some((l) => /^Демонтаж/.test(l.name)), 'демонтаж остался');
  assert.ok(bare.some((l) => /плитк/i.test(l.name)), 'плитка пропала');
});

test('первая смета: список работ под каждую специальность из бота, без дублей и несуществующих', () => {
  const ids = FIRST_JOBS.map((j) => j.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of TRADES) {
    const js = jobsFor(t.id);
    assert.ok(js.length >= 2 && js.length <= 6, `${t.id}: ${js.length}`);
    assert.equal(new Set(js.map((j) => j.id)).size, js.length, `${t.id}: дубли`);
  }
  for (const list of [...Object.values(TRADE_JOBS), DEFAULT_JOBS, ...JOB_GROUPS.map((g) => g[1])]) for (const id of list) assert.ok(getJob(id), `нет работы ${id}`);
  // каждая работа есть в «Другая работа»
  const grouped = new Set(JOB_GROUPS.flatMap((g) => g[1]));
  for (const id of ids) assert.ok(grouped.has(id), `${id} не попал в группы`);
  assert.equal(jobsFor('нет-такой').length, DEFAULT_JOBS.length);
});

test('первая смета: размер — в пределах, мусор — значение по умолчанию', () => {
  const f = getJob('bath')!.size[0];
  assert.equal(clampSize(f, '2,4'), 2.4);
  assert.equal(clampSize(f, 'abc'), f.def);
  assert.equal(clampSize(f, 999), f.max);
  assert.equal(clampSize(f, -5), f.min);
  const n = getJob('windows')!.size[0];
  assert.equal(clampSize(n, '2.6'), 3);
});

test('шаги мастера (/api/ev) записываются и без подписки — иначе воронка ослепнет после пробного дня', async () => {
  const { freeWriteAllowed } = await import('../shared/access');
  assert.ok(freeWriteAllowed('POST', '/api/ev', { estimateCount: 99, freeEstimateIds: [] }));
});
