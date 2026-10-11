/** Данные для PDF «Эскизный проект» и подписи параметров */
import type { CanopyResult, Wall } from './canopy';
import { render3d, drawings } from './render';

export const WALL_LABEL: Record<Wall, string> = { open: 'открыто', prof: 'профлист', prof_full: 'профлист на всю высоту', mesh: 'сетка', prof_mesh: 'профлист + сетка до кровли' };
const SIDE_LABEL = { front: 'Спереди (въезд)', back: 'Сзади', left: 'Слева', right: 'Справа' } as const;

export function paramRows(r: CanopyResult): [string, string][] {
  const p = r.params, i = r.info;
  const rows: [string, string][] = [
    ['Размер в плане', `${p.L} × ${p.W} м`],
    ['Кровля', p.roof === 'single' ? `односкатная, уклон ${Math.round(((i.hHigh - i.hLow) / i.span) * 100)}%` : 'двускатная'],
    [p.roof === 'single' ? 'Высота: высокая / низкая сторона' : 'Высота: конёк / карниз', `${i.hHigh} / ${i.hLow} м`],
    ['Покрытие', p.cover === 'prof' ? `профнастил НС-35, ${p.color}` : p.cover === 'poly' ? 'поликарбонат 8 мм' : 'без кровли'],
    ['Столбы', `${i.posts} шт, ${i.postProf}, шаг до ${p.postStep} м`],
    [i.truss ? 'Фермы' : 'Стропила', `${i.rafters} шт, ${i.rafterProf}`],
    ['Прогоны', `${i.purlins} рядов, ${i.purProf}`],
  ];
  for (const s of ['front', 'back', 'left', 'right'] as const) rows.push([SIDE_LABEL[s], WALL_LABEL[p.walls[s]] + (p.walls[s] === 'prof' || p.walls[s] === 'prof_mesh' ? ` ${p.profH} м` : '')]);
  rows.push(['Основание', p.base === 'slab' ? `плита ${Math.round(p.slabT * 1000)} мм, щебень ${Math.round(p.gravel * 1000)}, песок ${Math.round(p.sand * 1000)}` : p.base === 'piles' ? 'сваи под столбы' : 'нет']);
  rows.push(['Снеговой район / запас', `${p.snow} / ${p.waste}%`]);
  return rows;
}

export function designPdfData(r: CanopyResult, extra: { title: string; company?: string; logoPath?: string | null; freeMark?: boolean; lines?: { name: string; qty: number; unit: string; price: number; type: string }[] }) {
  const lines = extra.lines || r.lines;
  return {
    title: extra.title, company: extra.company || '', logoPath: extra.logoPath || null, freeMark: !!extra.freeMark,
    view3d: [render3d(r, -35, 24, 900, 620), render3d(r, 140, 30, 700, 500)],
    sheets: drawings(r), params: paramRows(r), summary: r.summary, warnings: r.warnings, steel: r.steel,
    lines: lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, price: l.price, type: l.type })),
    total: Math.round(lines.reduce((a, l) => a + l.qty * l.price, 0)),
  };
}
