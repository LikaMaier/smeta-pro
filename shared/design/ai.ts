/**
 * ИИ-проектировщик: разбор описания («навес 10 на 9, высота 6 и 5, профлист 2 м по трём сторонам…»)
 * в параметры модели. ИИ только заполняет параметры — геометрию и материалы считает программа.
 */
import type { CanopyParams } from './canopy';
import { snowByCity } from './snow';

const num = { type: ['number', 'null'] };
const wall = { type: ['string', 'null'], enum: ['open', 'prof', 'prof_full', 'mesh', 'prof_mesh', 'rail', 'poly', 'sandwich', 'wood', 'wood_low', null] };
export const CANOPY_AI_SCHEMA = {
  name: 'canopy_params',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    required: ['kind', 'block', 'blockWall', 'contType', 'ties', 'curb', 'bumpers', 'profGrade', 'entry', 'containers', 'layout', 'midRows', 'city', 'stripW', 'stripD', 'frame', 'gutter', 'snowGuard', 'lights', 'L', 'W', 'roof', 'hHigh', 'hLow', 'highSide', 'attach', 'postStep', 'overhang', 'cover', 'walls', 'profH', 'gate', 'gateW', 'gateH', 'door', 'insulate', 'base', 'slabT', 'sand', 'gravel', 'rebar', 'snow', 'color', 'title', 'questions'],
    properties: {
      L: num, W: num, hHigh: num, hLow: num, postStep: num, overhang: num, profH: num, slabT: num, sand: num, gravel: num, snow: num, gateW: num, gateH: num,
      kind: { type: ['string', 'null'], enum: ['canopy', 'tko', 'lean', 'visor', 'gazebo', 'garage', 'greenhouse', 'woodshed', null] },
      roof: { type: ['string', 'null'], enum: ['single', 'gable', 'hip', 'arch', null] },
      frame: { type: ['string', 'null'], enum: ['steel', 'wood', null] }, city: { type: ['string', 'null'] }, layout: { type: ['string', 'null'], enum: ['perimeter', 'center', null] }, block: num, blockWall: wall, contType: { type: ['string', 'null'], enum: ['1.1', '0.75', '8', null] }, ties: { type: ['string', 'null'], enum: ['auto', 'yes', 'no', null] }, curb: { type: ['boolean', 'null'] }, bumpers: { type: ['boolean', 'null'] }, midRows: num, containers: num, profGrade: { type: ['string', 'null'], enum: ['C8', 'C20', 'HC35', null] }, entry: { type: ['string', 'null'], enum: ['front', 'back', 'left', 'right', 'none', null] }, stripW: num, stripD: num, gutter: { type: ['boolean', 'null'] }, snowGuard: { type: ['boolean', 'null'] }, lights: num,
      attach: { type: ['boolean', 'null'] }, door: { type: ['boolean', 'null'] }, insulate: { type: ['boolean', 'null'] },
      gate: { type: ['string', 'null'], enum: ['none', 'swing', 'sectional', null] },
      highSide: { type: ['string', 'null'], enum: ['front', 'back', 'left', 'right', null] },
      cover: { type: ['string', 'null'], enum: ['prof', 'tile', 'soft', 'poly', 'sandwich', 'slats', 'none', null] },
      base: { type: ['string', 'null'], enum: ['slab', 'ushp', 'strip', 'piles', 'screw', 'deck', 'paving', 'none', null] },
      rebar: { type: ['string', 'null'], enum: ['steel', 'composite', null] },
      color: { type: ['string', 'null'] },
      walls: { type: 'object', additionalProperties: false, required: ['front', 'back', 'left', 'right'], properties: { front: wall, back: wall, left: wall, right: wall } },
      title: { type: 'string' },
      questions: { type: 'array', items: { type: 'string' } },
    },
  },
};

export const CANOPY_AI_PROMPT = `Ты — помощник прораба. Пользователь описывает лёгкое металлическое строение: навес, площадку для мусорных контейнеров под навесом, пристенный навес к дому, беседку или гараж/мастерскую из профлиста.
kind: canopy — навес, tko — площадка ТКО, lean — навес к стене дома (тогда attach = true, roof = single, highSide — сторона дома), visor — козырёк над входом на консолях без столбов, gazebo — беседка, garage — гараж/мастерская/ангар/склад, greenhouse — теплица, woodshed — дровник/хозблок/сарай.
frame: steel — каркас из профтрубы, wood — из бруса/дерева.
layout: perimeter — столбы по периметру; center — консольный (Т-образный) навес на одном ряду столбов по центру. midRows — число промежуточных рядов столбов в пролёте (стоянки на много машин, большие навесы), обычно 0.
Заполни параметры в метрах. Чего нет в описании — ставь null (программа подставит типовые значения), ничего не выдумывай.
Обозначения: L — длина вдоль стороны въезда/фасада, W — глубина. front — сторона въезда (обычно открыта), back — задняя, left/right — боковые.
roof: single — односкатная, gable — двускатная, hip — четырёхскатная (вальмовая, шатровая), arch — арочная (полукруглая). Для односкатной hHigh — высокая сторона, hLow — низкая, highSide — где высокая сторона.
Для двускатной hHigh — конёк, hLow — карниз. Миллиметры переводи в метры (6000 мм = 6).
walls: open — открыто; rail — перила/ограждение 1 м (беседка); poly — поликарбонат; sandwich — сэндвич-панели; wood — обшивка доской на всю высоту; wood_low — доска снизу до 1 м; prof — профлист снизу высотой profH; prof_full — профлист на всю высоту; mesh — сетка на всю высоту; prof_mesh — профлист profH + сетка до кровли.
profGrade — марка профнастила, если названа: C8 (С-8), C20 (С-20), HC35 (НС-35). entry — сторона въезда (машины, мусоровоза) без промежуточных столбов. containers — сколько мусорных контейнеров на площадке ТКО; contType — объём: 1.1, 0.75 или 8 (бункер). block — длина закрытой части (хозблок, гараж, подсобка, отсек КГМ) у совмещённого объекта, blockWall — её обшивка. curb — бордюр, bumpers — колесоотбойники/отбойник, ties — связи жёсткости.
cover: prof — профнастил, tile — металлочерепица, soft — гибкая (мягкая) черепица, poly — поликарбонат, sandwich — сэндвич-панели, slats — ламели/пергола без сплошной кровли, none — без кровли. base: slab — бетонная плита, ushp — утеплённая шведская плита (УШП), strip — ленточный фундамент (stripW — ширина, stripD — высота ленты), piles — буронабивные сваи под столбы, screw — винтовые сваи, deck — деревянный настил (терраса) на винтовых сваях, paving — тротуарная плитка, none — без основания.
gutter — нужен водосток; snowGuard — снегозадержатели; lights — число светильников (0 — без освещения).
gate: ворота в передней стене (front): swing — распашные, sectional — секционные/подъёмные, none — нет; gateW, gateH — размеры ворот. door — нужна дверь/калитка. insulate — утеплённый (тёплый гараж).
color — код RAL, если назван (например «RAL 7024»), иначе null. city — город или населённый пункт объекта, если назван (именительный падеж), иначе null. snow — снеговой район 1–8, только если он прямо назван, иначе null.
title — короткое название проекта. questions — 0–3 коротких уточняющих вопроса, только если без ответа размеры нельзя определить.`;

export function mergeAiParams(base: CanopyParams, ai: any): CanopyParams {
  const out: any = { ...base, walls: { ...base.walls } };
  // город → снеговой район (если район не назван явно)
  if (ai?.city && !ai.snow) { const c = snowByCity(ai.city); if (c) { out.snow = c.region; out.city = c.name; } else out.city = ai.city; }
  for (const [k, v] of Object.entries(ai || {})) {
    if (k === 'walls' && v && typeof v === 'object') { for (const [s, w] of Object.entries(v as any)) if (w) out.walls[s] = w; continue; }
    if (['title', 'questions'].includes(k)) continue;
    if (v !== null && v !== undefined && k in base) out[k] = v;
  }
  return out;
}
