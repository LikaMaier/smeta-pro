/** Данные для PDF «Эскизный проект» и подписи параметров */
import { OBJ_LABEL, type CanopyResult, type Wall } from './canopy';
import { snowLabel } from './snow';
import { render3d, drawings } from './render';

export const WALL_LABEL: Record<Wall, string> = { open: 'открыто', prof: 'профлист', prof_full: 'профлист на всю высоту', mesh: 'сетка', prof_mesh: 'профлист + сетка до кровли', rail: 'перила 1,0 м', poly: 'поликарбонат', sandwich: 'сэндвич-панели 100 мм', wood: 'обшивка доской', wood_low: 'доска снизу до 1,0 м' };
const SIDE_LABEL = { front: 'Спереди (въезд)', back: 'Сзади', left: 'Слева', right: 'Справа' } as const;

export function paramRows(r: CanopyResult): [string, string][] {
  const p = r.params, i = r.info;
  const pitch = Math.round((Math.atan((i.hHigh - i.hLow) / (p.roof === 'single' ? i.span : i.span / 2)) * 180) / Math.PI);
  const rows: [string, string][] = [
    ['Объект', OBJ_LABEL[p.kind] + (p.attach ? ', примыкает к стене дома' : '')],
    ['Размер в плане', `${p.L} × ${p.W} м`],
    ['Кровля', p.roof === 'arch' ? `арочная, подъём ${Math.round((i.hHigh - i.hLow) * 100) / 100} м` : (p.roof === 'single' ? 'односкатная' : p.roof === 'gable' ? 'двускатная' : 'четырёхскатная') + `, уклон ${pitch}°`],
    ['Каркас', i.wood ? `деревянный (брус, доска), ${i.woodVol} м³` : `металлический (профтруба), ${i.steelKg} кг`],
    [p.roof === 'single' ? 'Высота: высокая / низкая сторона' : 'Высота: конёк / карниз', `${i.hHigh} / ${i.hLow} м`],
    ['Покрытие', p.cover === 'prof' ? `профнастил НС-35, ${p.color}` : p.cover === 'tile' ? `металлочерепица, ${p.color}` : p.cover === 'soft' ? 'гибкая черепица по OSB' : p.cover === 'sandwich' ? `сэндвич-панели 150 мм, ${p.color}` : p.cover === 'slats' ? 'ламели (пергола), шаг 300 мм' : p.cover === 'poly' ? 'поликарбонат 8 мм' : 'без кровли'],
    ['Столбы', i.posts ? `${i.posts} шт, шаг до ${p.postStep} м${i.center ? ', один ряд по центру (консольный)' : i.midRows ? `, ${i.midRows + 1} пролёта` : ''}` : 'нет — консоли от стены'],
    [i.truss ? 'Фермы' : p.roof === 'arch' ? 'Арки' : 'Стропила', `${i.rafters} шт, ${i.rafterProf}`],
    [i.wood ? 'Обрешётка' : 'Прогоны', `${i.purlins} рядов, ${i.purProf}`],
  ];
  for (const s of ['front', 'back', 'left', 'right'] as const) {
    const ops = r.openings.filter((o) => o.side === s).map((o) => (o.kind === 'gate' ? `ворота ${p.gate === 'sectional' ? 'секционные' : 'распашные'} ${Math.round((o.a1 - o.a0) * 100) / 100}×${Math.round(o.h * 100) / 100} м` : 'дверь'));
    rows.push([SIDE_LABEL[s], (p.attach && s === p.highSide ? 'стена дома' : WALL_LABEL[p.walls[s]] + (p.walls[s] === 'prof' || p.walls[s] === 'prof_mesh' ? ` ${p.profH} м` : '')) + (ops.length ? `, ${ops.join(', ')}` : '')]);
  }
  if (p.insulate) rows.push(['Утепление', 'минвата 100 мм, стены и кровля']);
  rows.push(['Основание', p.base === 'slab' ? `плита ${Math.round(p.slabT * 1000)} мм, щебень ${Math.round(p.gravel * 1000)}, песок ${Math.round(p.sand * 1000)}` : p.base === 'ushp' ? `УШП: плита ${Math.round(p.slabT * 1000)} мм по ЭППС ${Math.round(p.eps * 1000)} мм, песок ${Math.round(p.sand * 1000)}` : p.base === 'strip' ? `ленточный ${Math.round(p.stripW * 1000)}×${Math.round(p.stripD * 1000)} мм` : p.base === 'screw' ? 'винтовые сваи 108×2500' : p.base === 'piles' ? 'буронабивные сваи под столбы' : p.base === 'deck' ? 'настил из террасной доски на винтовых сваях' : p.base === 'paving' ? 'тротуарная плитка 60 мм с бордюром' : 'нет']);
  const extras = [p.gutter && 'водосток', p.snowGuard && 'снегозадержатели', p.lights > 0 && `освещение: ${p.lights} светильн.`].filter(Boolean);
  if (extras.length) rows.push(['Дополнительно', extras.join(', ')]);
  rows.push(['Снеговой район', `${p.city ? `${p.city}: ` : ''}${snowLabel(p.snow)}`], ['Запас материалов', `${p.waste}%`]);
  return rows;
}

export function designPdfData(r: CanopyResult, extra: { title: string; company?: string; logoPath?: string | null; freeMark?: boolean; lines?: { name: string; qty: number; unit: string; price: number; type: string }[] }) {
  const lines = extra.lines || r.lines;
  return {
    title: extra.title, company: extra.company || '', logoPath: extra.logoPath || null, freeMark: !!extra.freeMark,
    view3d: [render3d(r, -35, 24, 900, 620), render3d(r, 140, 30, 700, 500)],
    sheets: drawings(r), params: paramRows(r), wood: r.info.wood, summary: r.summary, warnings: r.warnings, steel: r.steel,
    lines: lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, price: l.price, type: l.type })),
    total: Math.round(lines.reduce((a, l) => a + l.qty * l.price, 0)),
  };
}
