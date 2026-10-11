/**
 * Раскрой профильной трубы на хлысты: «первый подходящий по убыванию» с учётом пропила.
 * Возвращает число хлыстов и процент обрези.
 */
export interface CutResult { bars: number; stock: number; used: number; waste: number; wastePct: number; plan: number[][] }

export function cutStock(pieces: number[], stock: number, kerf = 0.003): CutResult {
  const ps = pieces.filter((p) => p > 0).sort((a, b) => b - a);
  const bins: { left: number; items: number[] }[] = [];
  for (const p0 of ps) {
    if (p0 > stock) {
      // длиннее хлыста — стыкуем сваркой из целых хлыстов + остаток
      const whole = Math.floor(p0 / stock);
      for (let i = 0; i < whole; i++) bins.push({ left: 0, items: [stock] });
      const rest = p0 - whole * stock;
      if (rest > 0.001) place(rest);
      continue;
    }
    place(p0);
  }
  function place(p: number) {
    const b = bins.find((x) => x.left >= p + kerf - 1e-9);
    if (b) { b.left -= p + kerf; b.items.push(p); } else bins.push({ left: stock - p - kerf, items: [p] });
  }
  const used = ps.reduce((a, b) => a + b, 0);
  const total = bins.length * stock;
  return { bars: bins.length, stock, used: r(used), waste: r(total - used), wastePct: total ? Math.round(((total - used) / total) * 1000) / 10 : 0, plan: bins.map((b) => b.items.map(r)) };
}
const r = (v: number) => Math.round(v * 1000) / 1000;

/** Масса 1 м прямоугольной трубы a×b×t (мм), кг */
export const tubeKgPerM = (a: number, b: number, t: number) => Math.round(((2 * (a + b) - 4 * t) * t * 7.85) / 1000 * 1000) / 1000;
/** Наружная площадь окраски 1 м трубы, м² */
export const tubeM2PerM = (a: number, b: number) => (2 * (a + b)) / 1000;
