/**
 * Три варианта одного проекта для заказчика: эконом / стандарт / премиум.
 * Стандарт — то, что настроил прораб; эконом и премиум получаются заменой покрытия, основания и опций.
 */
import type { CanopyParams } from './canopy';

export interface Variant { id: 'econ' | 'std' | 'prem'; label: string; changes: string[]; params: CanopyParams }

const COVER: Record<string, string> = { prof: 'профнастил', tile: 'металлочерепица', soft: 'гибкая черепица', poly: 'поликарбонат', sandwich: 'сэндвич-панели', slats: 'ламели', none: 'без кровли' };
const BASE: Record<string, string> = { slab: 'бетонная плита', ushp: 'УШП', strip: 'ленточный', piles: 'буронабивные сваи', screw: 'винтовые сваи', deck: 'настил на сваях', paving: 'тротуарная плитка', none: 'без основания' };

export function makeVariants(p: CanopyParams): Variant[] {
  const keepsFloor = p.kind === 'garage' || p.kind === 'tko'; // гаражу и площадке ТКО пол нужен в любом варианте
  const greenhouse = p.kind === 'greenhouse';

  // ---- эконом
  const e: CanopyParams = { ...p, walls: { ...p.walls }, gutter: false, snowGuard: false, lights: 0, insulate: false };
  const ec: string[] = [];
  if (['tile', 'soft', 'sandwich'].includes(p.cover)) { e.cover = 'prof'; ec.push(`кровля: ${COVER.prof} вместо «${COVER[p.cover]}»`); }
  if (!keepsFloor && ['slab', 'paving', 'ushp'].includes(p.base)) { e.base = 'piles'; ec.push(`основание: ${BASE.piles} вместо «${BASE[p.base]}»`); }
  if (keepsFloor && p.base === 'ushp') { e.base = 'slab'; ec.push('плита без утепления вместо УШП'); }
  if (p.frame === 'wood' && p.kind !== 'gazebo') { e.frame = 'steel'; ec.push('каркас: металл вместо бруса'); }
  for (const s of ['front', 'back', 'left', 'right'] as const) if (p.walls[s] === 'sandwich') { e.walls[s] = 'prof_full'; if (!ec.includes('стены: профлист вместо сэндвич-панелей')) ec.push('стены: профлист вместо сэндвич-панелей'); }
  if (p.gutter || p.snowGuard || p.lights > 0 || p.insulate) ec.push('без водостока, снегозадержателей, освещения и утепления');
  if (!ec.length) ec.push('минимальная комплектация');

  // ---- премиум
  const r: CanopyParams = { ...p, walls: { ...p.walls } };
  const rc: string[] = [];
  if (p.cover === 'prof' && p.roof !== 'arch' && !greenhouse) { r.cover = 'tile'; rc.push(`кровля: ${COVER.tile} вместо профнастила`); }
  if (['piles', 'screw', 'none'].includes(p.base) && !greenhouse && p.kind !== 'visor' && p.kind !== 'woodshed') { r.base = 'paving'; r.slabOver = Math.max(p.slabOver, 0.3); rc.push(`основание: ${BASE.paving}`); }
  if (p.base === 'slab' && p.kind === 'garage') { r.base = 'ushp'; r.eps = 0.1; rc.push('тёплая плита УШП вместо обычной'); }
  if (p.base === 'paving' && (p.kind === 'lean' || p.kind === 'gazebo')) { r.base = 'deck'; rc.push('пол из террасной доски на винтовых сваях вместо плитки'); }
  if (p.cover !== 'none' && p.cover !== 'slats' && !p.gutter) { r.gutter = true; rc.push('водосток'); }
  if (['prof', 'tile', 'soft', 'sandwich'].includes(r.cover) && !p.snowGuard && p.kind !== 'visor') { r.snowGuard = true; rc.push('снегозадержатели'); }
  if (p.lights < 2 && !greenhouse) { r.lights = Math.max(2, Math.ceil((p.L * p.W) / 15)); rc.push(`освещение: ${r.lights} светильника`); }
  if (p.kind === 'garage' && !p.insulate && !Object.values(p.walls).includes('sandwich')) { r.insulate = true; rc.push('утепление стен и кровли'); }
  if (!rc.length) rc.push('максимальная комплектация');

  return [
    { id: 'econ', label: 'Эконом', changes: ec, params: e },
    { id: 'std', label: 'Стандарт', changes: ['как в проекте'], params: p },
    { id: 'prem', label: 'Премиум', changes: rc, params: r },
  ];
}
