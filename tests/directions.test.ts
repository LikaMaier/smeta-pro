import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONS, parseSet } from '../shared/directions';
import { getCalculator, runCalc } from '../shared/calculators';
import { getTemplate } from '../shared/templates';
import { PRESETS } from '../shared/design/presets';
import { materialVariants, pickVariant, currentTier } from '../shared/materialTiers';

test('каждый вид работы ведёт в существующий мастер / шаблон / пресет, и мастер считает', () => {
  for (const d of DIRECTIONS) {
    assert.ok(d.kinds.length > 0, d.id);
    for (const k of d.kinds) {
      if (k.template) { assert.ok(getTemplate(k.template), k.id); continue; }
      assert.ok(k.to, k.id);
      const u = new URL(k.to!, 'http://x');
      if (u.pathname.startsWith('/calculators/')) {
        const c = getCalculator(u.pathname.split('/')[2]);
        assert.ok(c, k.to);
        const set = parseSet(u.searchParams.get('set'));
        const vals: Record<string, any> = {};
        c!.fields.forEach((f) => (vals[f.key] = f.default ?? ''));
        for (const [key, v] of Object.entries(set)) {
          const f = c!.fields.find((x) => x.key === key);
          assert.ok(f, `${k.to}: нет поля ${key}`);
          assert.ok(f!.options!.some((o) => String(o.value) === v), `${k.to}: нет варианта ${v}`);
          vals[key] = v;
        }
        const r = runCalc(c!, vals);
        assert.ok(r.output && r.output.suggestions.length > 0, `${k.to}: пустой результат`);
      }
      const pid = u.searchParams.get('preset');
      if (pid) assert.ok(PRESETS.some((p) => p.id === pid), pid);
    }
  }
});

test('варианты материала: эконом дешевле, премиум дороже, переключение обратимо', () => {
  for (const [name, price] of [['Плиточный клей (25 кг)', 480], ['Гофра / кабель-канал', 100], ['Доска пола шпунтованная 36×136×6000', 1150], ['Плитка / керамогранит (+10% на подрезку)', 1300]] as [string, number][]) {
    const v = materialVariants(name, price);
    assert.equal(v.length, 3);
    assert.ok(v[0].price < price && v[2].price > price);
    assert.equal(v[1].name, name); assert.equal(v[1].price, price);
    for (const t of ['eco', 'prem'] as const) {
      const x = pickVariant(name, price, t);
      assert.equal(currentTier(x.name), t);
      const back = pickVariant(x.name, x.price, 'std');
      assert.equal(back.name, name);
      assert.ok(Math.abs(back.price - price) < 0.02);
      const other = pickVariant(x.name, x.price, t === 'eco' ? 'prem' : 'eco');
      assert.equal(currentTier(other.name), t === 'eco' ? 'prem' : 'eco');
    }
  }
  assert.deepEqual(materialVariants('', 100), []);
  assert.deepEqual(materialVariants('Клей', 0), []);
});
