/**
 * Параметрическая модель навеса (в т.ч. площадки ТКО под навесом).
 * Из размеров строит каркас (столбы, обвязка, стропила или фермы, прогоны, ригели обшивки),
 * панели (кровля, профлист, сетка, плита) для 2D/3D, спецификацию с раскроем и строки сметы.
 * Это эскиз и расчёт материалов, а не расчёт прочности: сечения — по типовым таблицам.
 */
import { cutStock, tubeKgPerM, tubeM2PerM } from './cut';
import { Builder } from '../masters';

export type V3 = [number, number, number];
export interface Member { kind: 'post' | 'beam' | 'rafter' | 'chord' | 'web' | 'purlin' | 'rail'; profile: string; a: V3; b: V3 }
export interface Panel { kind: 'roof' | 'prof' | 'mesh' | 'slab'; pts: V3[] }
export type Wall = 'open' | 'prof' | 'prof_full' | 'mesh' | 'prof_mesh';
export type Side = 'front' | 'back' | 'left' | 'right';

export interface CanopyParams {
  L: number;            // длина (вдоль въезда, ось X), м
  W: number;            // глубина (ось Y), м
  roof: 'single' | 'gable';
  hHigh: number;        // односкатная: высокая сторона; двускатная: конёк
  hLow: number;         // односкатная: низкая сторона; двускатная: карнизы
  highSide: Side;       // односкатная: где высокая сторона (двускатная: конёк вдоль X при front/back, вдоль Y при left/right)
  postStep: number;     // шаг столбов, м
  overhang: number;     // свесы кровли, м
  cover: 'prof' | 'poly' | 'none';
  walls: Record<Side, Wall>;
  profH: number;        // высота профлиста при «профлист + сетка» / «профлист»
  base: 'slab' | 'piles' | 'none';
  slabT: number; sand: number; gravel: number; slabOver: number;
  rebar: 'steel' | 'composite';
  snow: number;         // снеговой район 1–8
  color: string;        // RAL
  waste: number;        // запас на материалы, %
}

export const CANOPY_DEFAULT: CanopyParams = {
  L: 10.2, W: 9.2, roof: 'single', hHigh: 6, hLow: 5, highSide: 'left', postStep: 3, overhang: 0.3, cover: 'prof',
  walls: { front: 'open', back: 'prof_mesh', left: 'prof_mesh', right: 'prof_mesh' }, profH: 2,
  base: 'slab', slabT: 0.15, sand: 0.2, gravel: 0.2, slabOver: 0, rebar: 'composite', snow: 3, color: 'RAL 7024', waste: 5,
};

// ---------- сечения ----------
interface Prof { a: number; b: number; t: number }
const P = (s: string): Prof => { const [a, b, t] = s.split('×').map(Number); return { a, b, t }; };
const postProfile = (h: number) => (h <= 3 ? '80×80×3' : h <= 4.5 ? '100×100×3' : h <= 6.2 ? '120×120×4' : '140×140×5');
const beamProfile = (step: number) => (step <= 3 ? '100×50×3' : '120×80×4');
const rafterProfile = (span: number) => (span <= 3 ? '60×40×2' : span <= 4.5 ? '80×40×3' : '100×50×3');
const purlinProfile = (spacing: number) => (spacing <= 1.0 ? '40×20×2' : spacing <= 1.6 ? '60×40×2' : spacing <= 3.2 ? '80×40×3' : '100×50×3');
const rafterMax = (snow: number) => (snow <= 2 ? 1.5 : snow <= 4 ? 1.2 : 0.9);
const KG_PRICE = 95; // ₽ за кг трубы, ориентир
const r2 = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const steps = (len: number, maxStep: number) => { const n = Math.max(1, Math.ceil(len / maxStep - 1e-9)); return Array.from({ length: n + 1 }, (_, i) => (len * i) / n); };

export function buildCanopy(p0: Partial<CanopyParams>) {
  const p: CanopyParams = { ...CANOPY_DEFAULT, ...p0, walls: { ...CANOPY_DEFAULT.walls, ...(p0.walls || {}) } };
  const warnings: string[] = [];
  const L = Math.max(1, p.L), W = Math.max(1, p.W);
  const hHigh = Math.max(p.hHigh, p.hLow), hLow = Math.min(p.hHigh, p.hLow);

  // локальные координаты: u — вдоль стропил (уклона), v — поперёк
  const alongX = p.highSide === 'left' || p.highSide === 'right';
  const span = alongX ? L : W, lenV = alongX ? W : L;
  const highAtStart = p.highSide === 'left' || p.highSide === 'front';
  const toW = (u: number, v: number, z: number): V3 => (alongX ? [u, v, z] : [v, u, z]);
  const hAt = (u: number) => {
    if (p.roof === 'gable') return hLow + (hHigh - hLow) * (1 - Math.abs(u - span / 2) / (span / 2));
    const t = u / span;
    return highAtStart ? hHigh - (hHigh - hLow) * t : hLow + (hHigh - hLow) * t;
  };

  const members: Member[] = [];
  const panels: Panel[] = [];
  const add = (kind: Member['kind'], profile: string, a: V3, b: V3) => members.push({ kind, profile, a, b });

  // ---------- столбы по периметру ----------
  const postProf = postProfile(hHigh);
  const vPos = steps(lenV, p.postStep);              // вдоль сторон u=0 и u=span (под обвязкой)
  const uPos = steps(span, p.postStep);              // вдоль торцов v=0 и v=lenV
  const postSet = new Map<string, V3>();
  const addPost = (u: number, v: number) => { const k = `${u.toFixed(3)}|${v.toFixed(3)}`; if (!postSet.has(k)) postSet.set(k, toW(u, v, 0)); };
  vPos.forEach((v) => { addPost(0, v); addPost(span, v); });
  uPos.forEach((u) => { addPost(u, 0); addPost(u, lenV); });
  if (p.roof === 'gable') vPos.forEach((v) => (v === 0 || v === lenV) && addPost(span / 2, v));
  for (const [, base] of postSet) {
    const u = alongX ? base[0] : base[1];
    add('post', postProf, base, [base[0], base[1], hAt(u)]);
  }
  if (hHigh > 6.2) warnings.push('Высота больше 6 м — сечение столбов и связи нужно проверить расчётом');

  // ---------- обвязка (балки по верху столбов) ----------
  const beamProf = beamProfile(p.postStep);
  add('beam', beamProf, toW(0, 0, hAt(0)), toW(0, lenV, hAt(0)));
  add('beam', beamProf, toW(span, 0, hAt(span)), toW(span, lenV, hAt(span)));
  // по торцам — наклонные балки (повторяют уклон)
  for (const v of [0, lenV]) {
    const us = p.roof === 'gable' ? [0, span / 2, span] : [0, span];
    for (let i = 0; i < us.length - 1; i++) add('beam', beamProf, toW(us[i], v, hAt(us[i])), toW(us[i + 1], v, hAt(us[i + 1])));
  }

  // ---------- стропила или фермы ----------
  const halfSpan0 = p.roof === 'gable' ? span / 2 : span;
  const isTruss = Math.hypot(halfSpan0, hHigh - hLow) > 6;
  const rStepMax = rafterMax(p.snow);
  // фермы ставим по линиям столбов, обычные стропила — с шагом по снеговой нагрузке
  const perBay = isTruss ? 1 : Math.max(1, Math.ceil((lenV / (vPos.length - 1)) / rStepMax - 1e-9));
  const rafV: number[] = [];
  for (let i = 0; i < vPos.length - 1; i++) for (let k = 0; k < perBay; k++) rafV.push(vPos[i] + ((vPos[i + 1] - vPos[i]) * k) / perBay);
  rafV.push(lenV);
  const rafterSpacing = lenV / (rafV.length - 1);
  const halfSpan = p.roof === 'gable' ? span / 2 : span;
  const slopeLen = Math.hypot(halfSpan, hHigh - hLow);
  const truss = isTruss;
  let rafterProf = rafterProfile(slopeLen), chordProf = '', webProf = '';
  if (truss) {
    chordProf = slopeLen <= 9 ? '60×40×3' : '80×60×3'; webProf = '40×40×2'; rafterProf = chordProf;
    const ht = Math.min(1.0, Math.max(0.4, span / 12));
    if (slopeLen > 12) warnings.push('Пролёт больше 12 м — ферма требует расчёта конструктора');
    for (const v of rafV) {
      const segs: [number, number][] = p.roof === 'gable' ? [[0, span / 2], [span / 2, span]] : [[0, span]];
      for (const [u0, u1] of segs) {
        add('chord', chordProf, toW(u0, v, hAt(u0)), toW(u1, v, hAt(u1)));
        add('chord', chordProf, toW(u0, v, hAt(u0) - ht), toW(u1, v, hAt(u1) - ht));
        const n = Math.max(2, Math.ceil((u1 - u0) / (ht * 1.4)));
        for (let k = 0; k <= n; k++) {
          const u = u0 + ((u1 - u0) * k) / n;
          add('web', webProf, toW(u, v, hAt(u) - ht), toW(u, v, hAt(u)));
          if (k < n) {
            const un = u0 + ((u1 - u0) * (k + 1)) / n;
            if (k % 2 === 0) add('web', webProf, toW(u, v, hAt(u) - ht), toW(un, v, hAt(un)));
            else add('web', webProf, toW(u, v, hAt(u)), toW(un, v, hAt(un) - ht));
          }
        }
      }
    }
  } else {
    for (const v of rafV) {
      if (p.roof === 'gable') { add('rafter', rafterProf, toW(-p.overhang, v, hAt(-p.overhang)), toW(span / 2, v, hAt(span / 2))); add('rafter', rafterProf, toW(span / 2, v, hAt(span / 2)), toW(span + p.overhang, v, hAt(span + p.overhang))); }
      else add('rafter', rafterProf, toW(-p.overhang, v, hAt(-p.overhang)), toW(span + p.overhang, v, hAt(span + p.overhang)));
    }
  }

  // ---------- прогоны ----------
  const purStep = p.cover === 'poly' ? 0.7 : p.snow <= 3 ? 1.0 : 0.6;
  const purProf = purlinProfile(rafterSpacing);
  const roofTop = (u: number) => hAt(u) + 0.03;
  const purU: number[] = [];
  if (p.roof === 'gable') { steps(span / 2, purStep).forEach((u) => purU.push(u)); steps(span / 2, purStep).forEach((u) => purU.push(span / 2 + u)); }
  else steps(span, purStep).forEach((u) => purU.push(u));
  [...new Set(purU.map((u) => r2(u, 3)))].forEach((u) => add('purlin', purProf, toW(u, -p.overhang, roofTop(u)), toW(u, lenV + p.overhang, roofTop(u))));

  // ---------- кровля ----------
  const roofSegs: [number, number][] = p.roof === 'gable' ? [[-p.overhang, span / 2], [span / 2, span + p.overhang]] : [[-p.overhang, span + p.overhang]];
  const zAt = (u: number) => roofTop(u); // hAt линейно продолжается за пределы пролёта — свесы по уклону
  if (p.cover !== 'none') for (const [u0, u1] of roofSegs) panels.push({ kind: 'roof', pts: [toW(u0, -p.overhang, zAt(u0)), toW(u1, -p.overhang, zAt(u1)), toW(u1, lenV + p.overhang, zAt(u1)), toW(u0, lenV + p.overhang, zAt(u0))] });
  const roofSlopeLen = roofSegs.reduce((a, [u0, u1]) => a + Math.hypot(u1 - u0, zAt(u1) - zAt(u0)), 0);
  const roofArea = roofSlopeLen * (lenV + 2 * p.overhang);

  // ---------- стены: обшивка ----------
  const sideDefs: Record<Side, { pts: (t: number) => [number, number]; len: number }> = {
    front: { pts: (t) => [t * L, 0], len: L }, back: { pts: (t) => [t * L, W], len: L },
    left: { pts: (t) => [0, t * W], len: W }, right: { pts: (t) => [L, t * W], len: W },
  };
  const hWorld = (x: number, y: number) => hAt(alongX ? x : y);
  let profArea = 0, meshArea = 0, railLen = 0, wallSheets = 0;
  const railPieces: number[] = [];
  for (const side of ['front', 'back', 'left', 'right'] as Side[]) {
    const w = p.walls[side];
    if (w === 'open') continue;
    const d = sideDefs[side];
    const N = 12;
    const samples = Array.from({ length: N + 1 }, (_, i) => { const [x, y] = d.pts(i / N); return { x, y, h: hWorld(x, y) - 0.05 }; });
    const avgH = samples.reduce((a, s) => a + s.h, 0) / samples.length;
    const minH = Math.min(...samples.map((s) => s.h));
    const pH = w === 'prof_full' ? null : Math.min(p.profH, minH);
    const quad = (z0: number, top: (s: typeof samples[0]) => number, kind: Panel['kind']) => {
      const a = samples[0], b = samples[N];
      panels.push({ kind, pts: [[a.x, a.y, z0], [b.x, b.y, z0], [b.x, b.y, top(b)], [a.x, a.y, top(a)]] });
    };
    if (w === 'prof' || w === 'prof_mesh') { quad(0.05, () => pH!, 'prof'); profArea += d.len * pH!; wallSheets += Math.ceil(d.len / 1.15 - 1e-9); railPieces.push(d.len, d.len); }
    if (w === 'prof_full') { quad(0.05, (s) => s.h, 'prof'); profArea += d.len * avgH; wallSheets += Math.ceil(d.len / 1.15 - 1e-9); const rows = Math.max(2, Math.ceil(avgH / 1.5) + 1); for (let i = 0; i < rows; i++) railPieces.push(d.len); }
    if (w === 'mesh') { quad(0.05, (s) => s.h, 'mesh'); meshArea += d.len * avgH; railPieces.push(d.len, d.len); }
    if (w === 'prof_mesh') { quad(pH!, (s) => s.h, 'mesh'); meshArea += d.len * Math.max(0, avgH - pH!); railPieces.push(d.len); }
  }
  railLen = railPieces.reduce((a, b) => a + b, 0);
  // ригели обшивки (для отрисовки — по уровням)
  for (const side of ['front', 'back', 'left', 'right'] as Side[]) {
    const w = p.walls[side];
    if (w === 'open') continue;
    const d = sideDefs[side];
    const [x0, y0] = d.pts(0), [x1, y1] = d.pts(1);
    const levels = w === 'prof' ? [0.2, p.profH - 0.1] : w === 'prof_mesh' ? [0.2, p.profH - 0.1, p.profH] : w === 'mesh' ? [0.2, 1.5] : [0.2, 1.5, 2.8];
    for (const z of levels) if (z < Math.min(hWorld(x0, y0), hWorld(x1, y1))) add('rail', '40×20×2', [x0, y0, z], [x1, y1, z]);
  }

  // ---------- основание ----------
  const sx = L + 2 * p.slabOver, sy = W + 2 * p.slabOver;
  const slabArea = sx * sy;
  if (p.base === 'slab') panels.push({ kind: 'slab', pts: [[-p.slabOver, -p.slabOver, 0], [L + p.slabOver, -p.slabOver, 0], [L + p.slabOver, W + p.slabOver, 0], [-p.slabOver, W + p.slabOver, 0]] });

  // =====================================================================
  // Металл: длины по профилям и раскрой
  // =====================================================================
  const byProf = new Map<string, { pieces: number[]; kinds: Set<string> }>();
  for (const m of members) {
    if (m.kind === 'rail') continue; // ригели считаем по фактическим сторонам ниже
    const g = byProf.get(m.profile) || { pieces: [], kinds: new Set() };
    g.pieces.push(dist(m.a, m.b)); g.kinds.add(m.kind); byProf.set(m.profile, g);
  }
  if (railPieces.length) { const g = byProf.get('40×20×2') || { pieces: [], kinds: new Set() }; g.pieces.push(...railPieces); g.kinds.add('rail'); byProf.set('40×20×2', g); }
  const KIND: Record<string, string> = { post: 'столбы', beam: 'обвязка', rafter: 'стропила', chord: 'пояса ферм', web: 'решётка ферм', purlin: 'прогоны', rail: 'ригели обшивки' };
  const steel = [...byProf.entries()].map(([profile, g]) => {
    const pr = P(profile);
    const stock = pr.a >= 80 ? 12 : 6;
    const cut = cutStock(g.pieces, stock);
    const len = g.pieces.reduce((a, b) => a + b, 0);
    const kgm = tubeKgPerM(pr.a, pr.b, pr.t);
    return { profile, use: [...g.kinds].map((k) => KIND[k]).join(', '), pieces: g.pieces.length, length: r2(len, 1), bars: cut.bars, stock, wastePct: cut.wastePct, kg: r2(cut.bars * stock * kgm, 0), kgNet: r2(len * kgm, 0), m2: r2(len * tubeM2PerM(pr.a, pr.b), 1), pricePerM: Math.round(kgm * KG_PRICE) };
  }).sort((a, b) => P(b.profile).a - P(a.profile).a);
  const steelKg = steel.reduce((a, s) => a + s.kgNet, 0);
  const paintM2 = steel.reduce((a, s) => a + s.m2, 0);

  // =====================================================================
  // Смета: работы (из справочника) и материалы (ориентировочные цены)
  // =====================================================================
  const k = 1 + p.waste / 100;
  const b = new Builder('Металлокаркас');
  for (const s of steel) b.mat(`Труба профильная ${s.profile} (${s.use}), хлыст ${s.stock} м`, s.bars, 'шт', s.pricePerM * s.stock);
  b.mat('Закладные пластины 300×300×10 с анкерами', postSet.size, 'шт', 1400);
  b.mat(`Грунт-эмаль по металлу 3 в 1, ${p.color}`, Math.ceil(paintM2 * 2 * 0.12 * k / 0.9), 'банка 0,9 кг', 950);
  b.work('Изготовление металлоконструкций', steelKg);
  b.work('Монтаж металлоконструкций', steelKg);
  b.work('Покраска металлоконструкций', paintM2);
  if (hHigh > 3.5) b.work('Автовышка', Math.max(1, Math.ceil(steelKg / 1500)));
  if (steelKg > 1500) b.work('Автокран 25 т', 1);

  b.sec('Кровля');
  if (p.cover === 'prof') {
    const wUse = 1.0;
    const sheetsAcross = Math.ceil((lenV + 2 * p.overhang) / wUse - 1e-9);
    const segs = roofSegs.map(([u0, u1]) => Math.hypot(u1 - u0, zAt(u1) - zAt(u0)));
    segs.forEach((sl) => b.mat(`Профнастил кровельный НС-35 ${p.color}, лист 1,06 × ${r2(sl, 2)} м`, sheetsAcross, 'лист', Math.round(1.06 * sl * 780)));
    b.mat('Саморезы кровельные 4,8×35 в цвет', Math.ceil(roofArea * 7 * k), 'шт', 3);
    if (p.roof === 'gable') b.mat('Конёк + уплотнитель', (lenV + 2 * p.overhang) * k, 'пог. м', 650);
    b.mat('Ветровая и карнизная планки', (2 * roofSlopeLen + 2 * (lenV + 2 * p.overhang)) * k, 'пог. м', 380);
    b.work('Монтаж профнастила на кровлю', roofArea);
  }
  if (p.cover === 'poly') {
    b.mat('Поликарбонат сотовый 8 мм (2,1×12 м)', Math.ceil(roofArea * k / 25.2), 'лист', 13500);
    b.mat('Профили и термошайбы для поликарбоната', Math.ceil(roofArea / 10), 'компл', 1500);
    b.work('Монтаж поликарбоната на кровлю', roofArea);
  }

  b.sec('Ограждение');
  if (profArea > 0) {
    b.mat(`Профнастил стеновой С-8 ${p.color}, лист 1,2 × ${p.profH} м`, Math.ceil(wallSheets * k), 'лист', Math.round(1.2 * p.profH * 480));
    b.mat('Саморезы кровельные 4,8×19 в цвет', Math.ceil(profArea * 8 * k), 'шт', 3);
    b.work('Обшивка каркаса профлистом', profArea);
  }
  if (meshArea > 0) {
    b.mat('Сетка сварная 50×50×4 мм (панели), окраска в цвет', meshArea * k, 'м²', 550);
    b.mat('Крепёж сетки (болты, пластины)', Math.ceil(meshArea / 4), 'компл', 120);
    b.work('Монтаж сетки на каркас', meshArea);
  }

  if (p.base === 'slab') {
    b.sec('Основание (плита)');
    const depth = p.slabT + p.sand + p.gravel;
    const digArea = (sx + 0.6) * (sy + 0.6);
    b.work('Разработка грунта экскаватором', digArea * depth); b.work('Вывоз грунта', digArea * depth * 1.2); b.work('Экскаватор-погрузчик', 1);
    b.work('Укладка геотекстиля', digArea); b.mat('Геотекстиль 200 г/м²', digArea * 1.15, 'м²', 45);
    b.work('Устройство песчаной подушки с уплотнением', slabArea * p.sand); b.mat('Песок крупный/средний', slabArea * p.sand * 1.2, 'м³', 1100);
    b.work('Устройство щебёночной подушки с уплотнением', slabArea * p.gravel); b.mat('Щебень фр. 20–40', slabArea * p.gravel * 1.25, 'м³', 2300);
    b.mat('Плёнка полиэтиленовая 200 мкм', slabArea * 1.15, 'м²', 25);
    b.work('Устройство опалубки', 2 * (sx + sy) * (p.slabT + 0.05)); b.mat('Доска опалубки 25×150', 2 * (sx + sy) * 0.2 * 0.025 * 1.2, 'м³', 17000);
    const bars = (Math.ceil(sy / 0.2) + 1) * sx + (Math.ceil(sx / 0.2) + 1) * sy; // одна сетка 200×200
    const layers = p.slabT >= 0.18 ? 2 : 1;
    if (p.rebar === 'composite') b.mat('Арматура композитная Ø8 (равнопрочная стальной Ø12), бухта 50 м', Math.ceil(bars * layers * 1.05 / 50), 'бухта', 2300);
    else b.mat('Арматура А500 Ø12', bars * layers * 1.05 * 0.888 / 1000, 'т', 72000);
    b.mat('Вязальная проволока / хомуты, фиксаторы', Math.ceil(slabArea / 20), 'компл', 900);
    b.work('Армирование сеткой', slabArea * layers);
    b.mat('Бетон М300 с доставкой', slabArea * p.slabT * 1.03, 'м³', 7200);
    b.work('Бетонирование плиты/площадки', slabArea * p.slabT);
    b.work('Монтаж закладных и гильз', postSet.size);
    b.sum('Плита', slabArea, 'м²').sum('Бетон', slabArea * p.slabT, 'м³').sum('Выемка грунта', digArea * depth, 'м³');
  }
  if (p.base === 'piles') {
    b.sec('Основание (сваи)');
    const n = postSet.size;
    b.work('Бурение под сваи ТИСЭ', n); b.work('Бетонирование столбов', n);
    b.mat('Бетон М300 на сваи Ø300×1,5 м', n * Math.PI * 0.15 ** 2 * 1.5 * 1.05, 'м³', 7200);
    b.mat('Арматура А500 Ø12 для свай', n * 4 * 1.8 * 0.888 / 1000 * 1.05, 'т', 72000);
  }
  b.sec('Прочее'); b.work('Доставка материалов по городу', Math.max(1, Math.ceil(steelKg / 3000) + 1));

  b.summary.unshift(
    { label: 'Размер в плане', value: r2(L * W, 1), unit: `м² (${L}×${W})` },
    { label: 'Металл', value: r2(steelKg, 0), unit: 'кг' },
    { label: 'Кровля', value: r2(roofArea, 1), unit: 'м²' },
    { label: 'Профлист на стенах', value: r2(profArea, 1), unit: 'м²' },
    { label: 'Сетка', value: r2(meshArea, 1), unit: 'м²' },
    { label: 'Столбов', value: postSet.size, unit: 'шт' },
  );
  if (truss) warnings.push(`Пролёт ${r2(slopeLen, 1)} м — стропила заменены фермами (пояса ${chordProf}, решётка ${webProf})`);
  warnings.push('Эскиз и расчёт материалов, а не расчёт прочности. Сечения подобраны по типовым таблицам — для ответственных объектов проверьте у конструктора.');

  return {
    params: p, members, panels, steel, lines: b.lines, summary: b.summary.filter((s) => s.value > 0), warnings: [...warnings, ...b.warnings],
    info: { span, lenV, alongX, truss, rafterProf, purProf, beamProf, postProf, rafters: rafV.length, rafterSpacing: r2(rafterSpacing), purlins: [...new Set(purU)].length, roofArea: r2(roofArea, 1), slabArea: r2(slabArea, 1), posts: postSet.size, hHigh, hLow, steelKg: r2(steelKg, 0) },
  };
}
export type CanopyResult = ReturnType<typeof buildCanopy>;
