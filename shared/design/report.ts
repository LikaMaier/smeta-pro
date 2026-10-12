/** Данные для PDF «Эскизный проект» и подписи параметров */
import { OBJ_LABEL, type CanopyResult, type Wall } from './canopy';
import { snowLabel } from './snow';
import { render3d, drawings } from './render';
import { fenceParamRows, buildFence, type FenceResult } from './fence3d';

/** Крупный вид забора: только сторона улицы с воротами и калиткой */
export const fenceCloseup = (r: FenceResult) => (r.params.sides.front ? buildFence({ ...r.params, kind: 'fence', W: 2.5, sides: { front: true, back: false, left: false, right: false } } as any) : r);
import { siteParamRows, type SiteResult } from './site';
import { mepParamRows, type MepResult } from './mep';

export const WALL_LABEL: Record<Wall, string> = { open: 'открыто', prof: 'профлист', prof_full: 'профлист на всю высоту', mesh: 'сетка', prof_mesh: 'профлист + сетка до кровли', rail: 'перила 1,0 м', poly: 'поликарбонат', sandwich: 'сэндвич-панели 100 мм', wood: 'обшивка доской', wood_low: 'доска снизу до 1,0 м' };
const SIDE_LABEL = { front: 'Спереди (въезд)', back: 'Сзади', left: 'Слева', right: 'Справа' } as const;

export function paramRows(r0: CanopyResult | FenceResult | SiteResult | MepResult): [string, string][] {
  if ((r0 as any).mep) return mepParamRows(r0 as MepResult);
  if ((r0 as any).fence) return fenceParamRows(r0 as FenceResult);
  if ((r0 as any).site) return siteParamRows(r0 as SiteResult);
  const r = r0 as CanopyResult;
  const p = r.params, i = r.info;
  const pitch = Math.round((Math.atan((i.hHigh - i.hLow) / (p.roof === 'single' ? i.span : i.span / 2)) * 180) / Math.PI);
  const rows: [string, string][] = [
    ['Объект', OBJ_LABEL[p.kind] + (p.attach ? ', примыкает к стене дома' : '')],
    ['Размер в плане', `${p.L} × ${p.W} м`],
    ['Кровля', p.roof === 'arch' ? `арочная, подъём ${Math.round((i.hHigh - i.hLow) * 100) / 100} м` : (p.roof === 'single' ? 'односкатная' : p.roof === 'gable' ? 'двускатная' : 'четырёхскатная') + `, уклон ${pitch}°`],
    ['Каркас', (i.wood ? `деревянный (брус, доска), ${i.woodVol} м³` : `металлический (профтруба), ${i.steelKg} кг`) + (p.color === 'none' ? ', без покраски' : '')],
    [p.roof === 'single' ? 'Высота: высокая / низкая сторона' : 'Высота: конёк / карниз', `${i.hHigh} / ${i.hLow} м`],
    ['Покрытие', p.cover === 'prof' ? `профнастил ${({ C8: 'С-8', C20: 'С-20', HC35: 'НС-35' } as any)[p.profGrade] || 'С-8'}, ${p.color === 'none' ? 'оцинкованный' : p.color}` : p.cover === 'tile' ? `металлочерепица${p.color === 'none' ? '' : `, ${p.color}`}` : p.cover === 'soft' ? 'гибкая черепица по OSB' : p.cover === 'sandwich' ? `сэндвич-панели 150 мм${p.color === 'none' ? '' : `, ${p.color}`}` : p.cover === 'slats' ? 'ламели (пергола), шаг 300 мм' : p.cover === 'poly' ? 'поликарбонат 8 мм' : 'без кровли'],
    [i.wood && p.postStep <= 0.8 ? 'Стойки каркаса' : 'Столбы', i.posts ? `${i.posts} шт, ${i.wood ? (p.postStep <= 0.8 ? 'доска' : 'брус') : 'труба'} ${i.postProf}${i.postRec ? ' (свой размер)' : ''}, шаг до ${p.postStep} м${i.center ? ', один ряд по центру (консольный)' : i.midRows ? `, ${i.midRows + 1} пролёта` : ''}` : 'нет — консоли от стены'],
    [i.truss ? 'Фермы' : p.roof === 'arch' ? 'Арки' : 'Стропила', `${i.rafters} шт, ${i.rafterProf}`],
    [i.wood ? 'Обрешётка' : 'Прогоны', `${i.purlins} рядов, ${i.purProf}`],
  ];
  for (const s of ['front', 'back', 'left', 'right'] as const) {
    const m2 = (v: number) => Math.round(v * 100) / 100;
    const ops = r.openings.filter((o) => o.side === s).map((o) => (o.kind === 'gate' ? `ворота ${p.gate === 'sectional' ? 'секционные' : 'распашные'} ${m2(o.a1 - o.a0)}×${m2(o.h)} м` : o.kind === 'window' ? `окно ${m2(o.a1 - o.a0)}×${m2(o.h - (o.z0 || 0))} м` : `дверь ${m2(o.a1 - o.a0)}×${m2(o.h)} м`));
    rows.push([SIDE_LABEL[s], (p.attach && s === p.highSide ? 'стена дома' : WALL_LABEL[p.walls[s]] + (p.walls[s] === 'prof' || p.walls[s] === 'prof_mesh' ? ` ${p.profH} м` : '')) + (ops.length ? `, ${ops.join(', ')}` : '')]);
  }
  if (p.insulate) rows.push(['Утепление', `минвата 100 мм, стены и кровля; снаружи мембрана и вентзазор${p.lining && p.lining !== 'none' ? `; внутри — ${p.lining === 'osb' ? 'OSB 12 мм' : 'вагонка'}` : ''}`]);
  rows.push(['Основание', p.base === 'slab' ? `плита ${Math.round(p.slabT * 1000)} мм, щебень ${Math.round(p.gravel * 1000)}, песок ${Math.round(p.sand * 1000)}` : p.base === 'ushp' ? `УШП: плита ${Math.round(p.slabT * 1000)} мм по ЭППС ${Math.round(p.eps * 1000)} мм, песок ${Math.round(p.sand * 1000)}` : p.base === 'strip' ? `ленточный ${Math.round(p.stripW * 1000)}×${Math.round(p.stripD * 1000)} мм` : p.base === 'screw' ? 'винтовые сваи 108×2500' : p.base === 'piles' ? 'буронабивные сваи под столбы' : p.base === 'deck' ? 'настил из террасной доски на винтовых сваях' : p.base === 'paving' ? 'тротуарная плитка 60 мм с бордюром' : p.base === 'floor' ? `утеплённый пол: ростверк 150×150 на ${p.floorOn === 'blocks' ? 'бетонных блоках с подушкой' : 'винтовых сваях'}, лаги 50×150 шаг 0,5 м, черновой пол, мембрана${p.insulate ? ', минвата 150 мм' : ''}, пароизоляция, OSB 18 мм` : 'нет']);
  const extras = [p.gutter && 'водосток', p.snowGuard && 'снегозадержатели', p.lights > 0 && `освещение: ${p.lights} светильн.`].filter(Boolean);
  if (extras.length) rows.push(['Дополнительно', extras.join(', ')]);
  rows.push(['Снеговой район', `${p.city ? `${p.city}: ` : ''}${snowLabel(p.snow)}`], ['Запас материалов', `${p.waste}%`]);
  return rows;
}

export function designPdfData(r: CanopyResult | FenceResult | SiteResult | MepResult, extra: { title: string; company?: string; logoPath?: string | null; freeMark?: boolean; lines?: { name: string; qty: number; unit: string; price: number; type: string }[] }) {
  const lines = extra.lines || r.lines;
  return {
    title: extra.title, company: extra.company || '', logoPath: extra.logoPath || null, freeMark: !!extra.freeMark,
    view3d: (r as any).mep ? [render3d(r, -30, 52, 900, 620), render3d(r, 150, 55, 700, 500)] : (r as any).fence ? [render3d(fenceCloseup(r as FenceResult), -30, 14, 900, 620), render3d(r, -35, 30, 700, 500)] : (r as any).site ? [render3d(r, -35, 38, 900, 620), render3d(r, 145, 45, 700, 500)] : [render3d(r, -35, 24, 900, 620), render3d(r, 140, 30, 700, 500)],
    layout: (r as any).fence || (r as any).site || (r as any).mep ? 'sheets' : 'canopy',
    sheets: drawings(r), params: paramRows(r), wood: r.info.wood, summary: r.summary, warnings: r.warnings, steel: r.steel,
    lines: lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, price: l.price, type: l.type })),
    total: Math.round(lines.reduce((a, l) => a + l.qty * l.price, 0)),
  };
}
