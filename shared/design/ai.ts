/**
 * ИИ-проектировщик: разбор описания («навес 10 на 9, высота 6 и 5, профлист 2 м по трём сторонам…»)
 * в параметры модели. ИИ только заполняет параметры — геометрию и материалы считает программа.
 */
import type { CanopyParams } from './canopy';

const num = { type: ['number', 'null'] };
const wall = { type: ['string', 'null'], enum: ['open', 'prof', 'prof_full', 'mesh', 'prof_mesh', 'rail', null] };
export const CANOPY_AI_SCHEMA = {
  name: 'canopy_params',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    required: ['kind', 'L', 'W', 'roof', 'hHigh', 'hLow', 'highSide', 'attach', 'postStep', 'overhang', 'cover', 'walls', 'profH', 'gate', 'gateW', 'gateH', 'door', 'insulate', 'base', 'slabT', 'sand', 'gravel', 'rebar', 'snow', 'color', 'title', 'questions'],
    properties: {
      L: num, W: num, hHigh: num, hLow: num, postStep: num, overhang: num, profH: num, slabT: num, sand: num, gravel: num, snow: num, gateW: num, gateH: num,
      kind: { type: ['string', 'null'], enum: ['canopy', 'tko', 'lean', 'gazebo', 'garage', null] },
      roof: { type: ['string', 'null'], enum: ['single', 'gable', 'hip', null] },
      attach: { type: ['boolean', 'null'] }, door: { type: ['boolean', 'null'] }, insulate: { type: ['boolean', 'null'] },
      gate: { type: ['string', 'null'], enum: ['none', 'swing', 'sectional', null] },
      highSide: { type: ['string', 'null'], enum: ['front', 'back', 'left', 'right', null] },
      cover: { type: ['string', 'null'], enum: ['prof', 'tile', 'poly', 'none', null] },
      base: { type: ['string', 'null'], enum: ['slab', 'piles', 'deck', 'none', null] },
      rebar: { type: ['string', 'null'], enum: ['steel', 'composite', null] },
      color: { type: ['string', 'null'] },
      walls: { type: 'object', additionalProperties: false, required: ['front', 'back', 'left', 'right'], properties: { front: wall, back: wall, left: wall, right: wall } },
      title: { type: 'string' },
      questions: { type: 'array', items: { type: 'string' } },
    },
  },
};

export const CANOPY_AI_PROMPT = `Ты — помощник прораба. Пользователь описывает лёгкое металлическое строение: навес, площадку для мусорных контейнеров под навесом, пристенный навес к дому, беседку или гараж/мастерскую из профлиста.
kind: canopy — навес, tko — площадка ТКО, lean — навес к стене дома (тогда attach = true, roof = single, highSide — сторона дома), gazebo — беседка, garage — гараж/мастерская/ангар из профлиста.
Заполни параметры в метрах. Чего нет в описании — ставь null (программа подставит типовые значения), ничего не выдумывай.
Обозначения: L — длина вдоль стороны въезда/фасада, W — глубина. front — сторона въезда (обычно открыта), back — задняя, left/right — боковые.
roof: single — односкатная, gable — двускатная, hip — четырёхскатная (вальмовая, шатровая). Для односкатной hHigh — высокая сторона, hLow — низкая, highSide — где высокая сторона.
Для двускатной hHigh — конёк, hLow — карниз. Миллиметры переводи в метры (6000 мм = 6).
walls: open — открыто; rail — перила/ограждение 1 м (беседка); prof — профлист снизу высотой profH; prof_full — профлист на всю высоту; mesh — сетка на всю высоту; prof_mesh — профлист profH + сетка до кровли.
cover: prof — профнастил, tile — металлочерепица, poly — поликарбонат, none — без кровли. base: slab — бетонная плита, piles — столбы на сваях, deck — деревянный настил (терраса) на винтовых сваях, none — без основания.
gate: ворота в передней стене (front): swing — распашные, sectional — секционные/подъёмные, none — нет; gateW, gateH — размеры ворот. door — нужна дверь/калитка. insulate — утеплённый (тёплый гараж).
color — код RAL, если назван (например «RAL 7024»), иначе null. snow — снеговой район 1–8, если назван регион/город, иначе null.
title — короткое название проекта. questions — 0–3 коротких уточняющих вопроса, только если без ответа размеры нельзя определить.`;

export function mergeAiParams(base: CanopyParams, ai: any): CanopyParams {
  const out: any = { ...base, walls: { ...base.walls } };
  for (const [k, v] of Object.entries(ai || {})) {
    if (k === 'walls' && v && typeof v === 'object') { for (const [s, w] of Object.entries(v as any)) if (w) out.walls[s] = w; continue; }
    if (['title', 'questions'].includes(k)) continue;
    if (v !== null && v !== undefined && k in base) out[k] = v;
  }
  return out;
}
