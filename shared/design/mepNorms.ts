/**
 * Нормы и расчёты электрики (квартира / дом), по которым работает проектировщик:
 *  - ПУЭ 7-е изд., гл. 7.1 (жилые здания), 2.1.56 (расстояния до трубопроводов), 1.3 (токи, сечения);
 *  - СП 256.1325800.2016 «Электроустановки жилых и общественных зданий» (число розеток, УЗО, нагрузки);
 *  - ГОСТ Р 50571.7.701-2013 (ванные и душевые: зоны 0/1/2, УЗО 30 мА, уравнивание потенциалов);
 *  - ГОСТ Р 50571.5.52 (потери напряжения в групповых линиях);
 *  - ГОСТ 31565-2012 (кабель нг(А)-LS для жилых помещений).
 * Это типовые решения для эскиза и сметы, а не рабочий проект.
 */

export const STD_AMPS = [6, 10, 16, 20, 25, 32, 40, 50, 63];
/** Сечения меди, мм², и наибольший автомат, который им «по силам» при скрытой прокладке (с запасом к ПУЭ табл. 1.3.4) */
export const CABLE_STEPS: { s: number; maxAmp: number }[] = [
  { s: 1.5, maxAmp: 10 }, { s: 2.5, maxAmp: 16 }, { s: 4, maxAmp: 25 }, { s: 6, maxAmp: 32 }, { s: 10, maxAmp: 50 }, { s: 16, maxAmp: 63 },
];
export const RHO_CU = 0.0175; // Ом·мм²/м
export const U1 = 230, U3 = 400;
export const DU_MAX = 4; // %, рекомендуемый предел потерь в групповой линии
export const sTxt = (s: number) => String(s).replace('.', ',');
export const cableName = (s: number, cores = 3) => `${cores}×${sTxt(s)}`;

/** Автомат: ближайший стандартный ≥ тока нагрузки, не меньше минимального для типа точки */
export const ampFor = (ib: number, minAmp = 10) => STD_AMPS.find((a) => a >= Math.max(ib, minAmp)) ?? 63;
/** Сечение: наименьшее, которое защищает автомат, и не меньше минимального по нормам (плита — 6 мм²) */
export const crossFor = (amp: number, minS = 1.5) => (CABLE_STEPS.find((c) => c.maxAmp >= amp && c.s >= minS) ?? CABLE_STEPS[CABLE_STEPS.length - 1]).s;
/** Потери напряжения, %: 1 фаза ΔU = 2·L·I·ρ/S/230, 3 фазы ΔU = √3·L·I·ρ/S/400 */
export const voltDrop = (lenM: number, ib: number, s: number, three = false) =>
  Math.round((((three ? Math.sqrt(3) : 2) * lenM * ib * RHO_CU) / s / (three ? U3 : U1)) * 1000) / 10;

/** Линия: автомат, сечение, потери; если потери больше 4% — увеличиваем сечение */
export function lineFor(o: { watt: number; lmax: number; minAmp?: number; minS?: number; fixedAmp?: number; three?: boolean }) {
  const ib = o.three ? o.watt / (Math.sqrt(3) * U3) : o.watt / U1;
  const amp = o.fixedAmp ?? ampFor(ib, o.minAmp);
  const minS = o.three ? Math.min(o.minS ?? 1.5, 2.5) : o.minS; // трёхфазную плиту хватает 5×2,5
  let s = crossFor(amp, minS);
  const s0 = s;
  // для потерь берём реальную нагрузку, но не больше тока автомата
  const load = Math.min(ib, amp);
  let du = voltDrop(o.lmax, load, s, o.three);
  while (du > DU_MAX && s < 16) { s = CABLE_STEPS[CABLE_STEPS.findIndex((c) => c.s === s) + 1].s; du = voltDrop(o.lmax, load, s, o.three); }
  return { amp, s, ib: Math.round(ib * 10) / 10, du, upsized: s > s0 };
}

/** Ввод: ток по выделенной мощности и вводной автомат (не больше разрешённого энергосетью) */
export function inputFor(kw: number, phases: 1 | 3) {
  const i = phases === 3 ? (kw * 1000) / (Math.sqrt(3) * U3 * 0.95) : (kw * 1000) / (U1 * 0.95);
  const amp = [...STD_AMPS].reverse().find((a) => a <= i * 1.1) ?? 16;
  return { i: Math.round(i * 10) / 10, amp, s: crossFor(amp, phases === 3 ? 4 : 6), cores: phases === 3 ? 5 : 3 };
}

/**
 * Расчётная мощность (оценка одновременности): свет ×0,8, розеточные группы ×0,25,
 * силовые — самый мощный прибор целиком, остальные ×0,35; плиту считаем с Кс 0,6 (все конфорки на максимуме — редкость).
 */
export function designPower(light: number, sockets: number, power: number[]) {
  const max = power.length ? Math.max(...power) : 0;
  const rest = power.reduce((a, v) => a + v, 0) - max;
  return Math.round((light * 0.8 + sockets * 0.25 + max + rest * 0.35) / 100) / 10; // кВт
}

/** Расстояние от точки до прямоугольника в плане, м (0 — внутри) */
export const distRect = (x: number, y: number, r: { x0: number; y0: number; x1: number; y1: number }) => {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dy = Math.max(r.y0 - y, 0, y - r.y1);
  return Math.hypot(dx, dy);
};
/** Зона ванной по ГОСТ Р 50571.7.701: 0/1 — над ванной/поддоном до 2,25 м, 2 — ещё 0,6 м вокруг, 3 — за пределами */
export const bathZone = (x: number, y: number, z: number, rects: { x0: number; y0: number; x1: number; y1: number }[]) => {
  if (z > 2.25) return 3;
  let best = 3;
  for (const r of rects) { const d = distRect(x, y, r); if (d <= 0.001) best = Math.min(best, 1); else if (d < 0.6) best = Math.min(best, 2); }
  return best;
};

export interface Device { code: string; name: string; mod: number; price: number; group?: number }
/**
 * Состав щита на DIN-рейке: вводной автомат, УЗИП, реле напряжения, противопожарное УЗО (дом),
 * группы — дифавтоматами (по 2 модуля) или УЗО на 2–3 группы + автоматы. Резерв 20% модулей.
 */
export function panelLayout(o: {
  phases: 1 | 3; inAmp: number; spd: boolean; house: boolean; protect: 'diff' | 'rcd';
  groups: { amp: number; rcd: boolean; name: string; three?: boolean }[];
}) {
  const ph3 = o.phases === 3;
  const dev: Device[] = [];
  dev.push({ code: 'QF0', name: `Вводной автомат ${ph3 ? '4P' : '2P'} C${o.inAmp}`, mod: ph3 ? 4 : 2, price: ph3 ? 3500 : 1400 });
  if (o.spd) dev.push({ code: 'FV1', name: `УЗИП ${o.house ? 'тип 1+2' : 'тип 2'}`, mod: ph3 ? 4 : 2, price: (o.house ? 2 : 1) * (ph3 ? 4500 : 2800) });
  dev.push({ code: 'KV1', name: ph3 ? 'Реле контроля напряжения 3ф' : 'Реле напряжения', mod: ph3 ? 3 : 2, price: ph3 ? 6000 : 2500 });
  if (o.house) dev.push({ code: 'QD0', name: `УЗО противопожарное 100 мА ${ph3 ? '4P' : '2P'} ${Math.max(40, o.inAmp)} А`, mod: ph3 ? 4 : 2, price: ph3 ? 6500 : 3200 });
  const live = o.groups.map((g, i) => ({ ...g, n: i + 1 })).filter((g) => g.amp > 0);
  if (o.protect === 'diff') {
    for (const g of live) dev.push(g.three ? { code: `QD${g.n}`, name: `Дифавтомат 4P C${g.amp} 30 мА тип A`, mod: 4, price: 7500, group: g.n }
      : g.rcd ? { code: `QD${g.n}`, name: `Дифавтомат C${g.amp} 30 мА тип A`, mod: 2, price: 2600, group: g.n } : { code: `QF${g.n}`, name: `Автомат 1P C${g.amp}`, mod: 1, price: 450, group: g.n });
  } else {
    for (const g of live.filter((x) => x.three)) dev.push({ code: `QD${g.n}`, name: `Дифавтомат 4P C${g.amp} 30 мА тип A`, mod: 4, price: 7500, group: g.n });
    const prot = live.filter((g) => g.rcd && !g.three), plain = live.filter((g) => !g.rcd && !g.three);
    for (let i = 0; i < prot.length; i += 3) {
      dev.push({ code: `Q${i / 3 + 1}`, name: 'УЗО 2P 40 А 30 мА тип A', mod: 2, price: 2500 });
      for (const g of prot.slice(i, i + 3)) dev.push({ code: `QF${g.n}`, name: `Автомат 1P C${g.amp}`, mod: 1, price: 450, group: g.n });
    }
    for (const g of plain) dev.push({ code: `QF${g.n}`, name: `Автомат 1P C${g.amp}`, mod: 1, price: 450, group: g.n });
  }
  const used = dev.reduce((a, d) => a + d.mod, 0);
  const need = Math.ceil(used * 1.2);
  const size = [12, 18, 24, 36, 48, 54, 72].find((s) => s >= need) ?? 72;
  const row = size % 18 === 0 && size !== 36 ? 18 : 12;
  return { devices: dev, used, size, row, rows: size / row };
}

/** Короткие ссылки на нормы для подсказок */
export const NORMS = {
  zones: 'ГОСТ Р 50571.7.701-2013, ПУЭ 7.1.48',
  rcd: 'СП 256.1325800.2016, ПУЭ 7.1.79',
  sockets: 'СП 256.1325800.2016',
  gas: 'ПУЭ 7.1.50',
  pipes: 'ПУЭ 2.1.56',
  switch: 'ПУЭ 7.1.51',
  cable: 'ГОСТ 31565-2012, ПУЭ 7.1.34',
  du: 'ГОСТ Р 50571.5.52',
  sup: 'ПУЭ 7.1.88, ГОСТ Р 50571.7.701',
  ground: 'ПУЭ 1.7.103',
  wood: 'ПУЭ гл. 2.1, СП 256.1325800.2016',
};
