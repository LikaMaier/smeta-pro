import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fenceEstimate, FENCE_TYPES, MOUNTS } from '../shared/fence';
import { STARTER_PRICES } from '../shared/starterPrices';

const starter = new Set(STARTER_PRICES.map((p) => p.name));

test('все виды заборов × все способы монтажа: строки без ошибок, работы есть в справочнике', () => {
  for (const type of Object.keys(FENCE_TYPES)) {
    for (const mount of Object.keys(MOUNTS)) {
      const r = fenceEstimate({ type: type as any, mount: mount as any, len: 105, h: 1.8, slideGates: 1, wickets: 1, demolish: 20, caps: true, paint: true, automation: true });
      assert.ok(r.lines.length > 3, `${type}/${mount}`);
      for (const l of r.lines) {
        assert.ok(Number.isFinite(l.qty) && l.qty > 0, `${type}/${mount}: ${l.name} qty=${l.qty}`);
        assert.ok(l.price >= 0);
        if (l.type !== 'material') assert.ok(starter.has(l.name), `нет в справочнике: ${l.name}`);
      }
    }
  }
});

test('профнастил 105 м, ворота 4 м и калитка 1 м: 100 м полотна, 41 столб на линии + 4 у ворот', () => {
  const r = fenceEstimate({ type: 'profnastil', mount: 'concrete', len: 105, h: 2, slideGates: 1, wickets: 1 });
  const get = (s: string) => r.lines.find((l) => l.name.startsWith(s))!;
  assert.equal(r.summary[0].value, 100);
  assert.equal(get('Профнастил').qty, 87); // 100 / 1,15
  assert.equal(get('Установка столба с бетонированием').qty, 45);
  assert.equal(get('Забор из профлиста').qty, 100);
  assert.ok(get('Бетон М200'));
});

test('склон: работы дороже на 15%, предупреждение для тяжёлого забора на винтовых сваях', () => {
  const a = fenceEstimate({ type: 'euro2', mount: 'buta', len: 50, h: 2 });
  const b = fenceEstimate({ type: 'euro2', mount: 'buta', len: 50, h: 2, slope: true });
  const w = (x: any) => x.lines.find((l: any) => l.name.startsWith('Забор из евроштакетника')).price;
  assert.equal(w(b), Math.round(w(a) * 1.15));
  assert.ok(fenceEstimate({ type: 'brick', mount: 'screw', len: 30, h: 2 }).warnings.length > 0);
});
