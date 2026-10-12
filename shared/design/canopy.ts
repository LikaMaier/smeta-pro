/**
 * Параметрическая модель лёгкого строения: навес, площадка ТКО под навесом, пристенный навес, козырёк,
 * беседка, гараж / мастерская / ангар, теплица, дровник / хозблок. Каркас — металл или дерево.
 * Из размеров строит каркас (столбы, обвязка, стропила или фермы, прогоны, ригели обшивки, рамы проёмов, перила),
 * панели (кровля, профлист, сетка, ворота, плита, настил) для 2D/3D, спецификацию с раскроем и строки сметы.
 * Это эскиз и расчёт материалов, а не расчёт прочности: сечения — по типовым таблицам.
 */
import { cutStock, tubeKgPerM, tubeM2PerM } from './cut';
import { Builder } from '../masters';
import { mergePrices, type DesignPrices } from './prices';

export type V3 = [number, number, number];
export type MemberKind = 'post' | 'beam' | 'rafter' | 'chord' | 'web' | 'purlin' | 'rail' | 'frame' | 'hip' | 'handrail' | 'baluster' | 'brace' | 'tie' | 'bollard' | 'bumper' | 'pillar' | 'cpillar' | 'trunk' | 'wireL' | 'wireS' | 'wireP' | 'wireN' | 'pipeC' | 'pipeH' | 'pipeS';
export interface Member { kind: MemberKind; profile: string; a: V3; b: V3 }
export interface Panel { kind: 'window' | 'roof' | 'prof' | 'mesh' | 'slab' | 'deck' | 'gate' | 'door' | 'house' | 'poly' | 'sandwich' | 'wood' | 'paving' | 'strip' | 'container' | 'curb' | 'plank' | 'concrete' | 'block' | 'stone' | 'tree' | 'grass' | 'gravel' | 'wall' | 'lid' | 'soil' | 'floor' | 'tile' | 'fixture' | 'pointE' | 'pointL' | 'pipeBox' | 'cut'; pts: V3[] }
export type Wall = 'open' | 'prof' | 'prof_full' | 'mesh' | 'prof_mesh' | 'rail' | 'poly' | 'sandwich' | 'wood' | 'wood_low';
export type Side = 'front' | 'back' | 'left' | 'right';
export type ObjKind = 'canopy' | 'tko' | 'lean' | 'visor' | 'gazebo' | 'garage' | 'greenhouse' | 'woodshed';
export const OBJ_LABEL: Record<ObjKind, string> = { canopy: 'Навес', tko: 'Площадка ТКО', lean: 'Пристенный навес', visor: 'Козырёк', gazebo: 'Беседка', garage: 'Гараж / ангар', greenhouse: 'Теплица', woodshed: 'Дровник / хозблок' };

export interface CanopyParams {
  kind: ObjKind;        // тип объекта (подписи и типовые решения)
  L: number;            // длина (по фасаду, ось X), м
  W: number;            // глубина (ось Y), м
  roof: 'single' | 'gable' | 'hip' | 'arch';
  frame: 'steel' | 'wood'; // каркас: профтруба или брус
  hHigh: number;        // односкатная: высокая сторона; двускатная/четырёхскатная: конёк
  hLow: number;         // односкатная: низкая сторона; иначе: карниз
  highSide: Side;       // односкатная: где высокая сторона; двускатная: конёк вдоль X при front/back, вдоль Y при left/right
  attach: boolean;      // пристенный: высокая сторона крепится к стене дома (только односкатная)
  postStep: number;     // шаг столбов, м
  overhang: number;     // свесы кровли, м
  cover: 'prof' | 'tile' | 'soft' | 'poly' | 'sandwich' | 'slats' | 'none'; // slats — ламели (пергола)
  layout: 'perimeter' | 'center'; // столбы по периметру или в один ряд по центру (консольный Т-навес)
  midRows: number;      // промежуточные ряды столбов поперёк пролёта (многопролётный навес)
  walls: Record<Side, Wall>;
  profH: number;        // высота профлиста при «профлист» / «профлист + сетка»
  profGrade: 'C8' | 'C20' | 'HC35'; // марка кровельного профнастила
  entry: Side | 'none'; // въезд без промежуточных столбов (над проёмом — ферма)
  containers: number;   // площадка ТКО: сколько контейнеров показать в макете
  contType: '1.1' | '0.75' | '8'; // евроконтейнер 1,1 / 0,75 м³ или бункер 8 м³
  ties: 'auto' | 'yes' | 'no'; // связи жёсткости
  curb: boolean;        // бордюр по периметру основания (кроме въезда)
  bumpers: boolean;     // колесоотбойники у столбов и отбойник вдоль стен
  block: number;        // совмещённый объект: длина закрытого блока по фасаду, м (0 — нет)
  blockAt: 'left' | 'right';
  blockWall: Wall;      // обшивка закрытого блока
  gate: 'none' | 'swing' | 'sectional'; // ворота в передней стене
  gateW: number; gateH: number;
  door: boolean;        // дверь / калитка 0,9×2,05
  /** Проёмы вручную: если задан список — ворота, двери и окна берутся из него (положение, размер), иначе расставляются сами */
  ops?: OpeningSpec[] | null;
  insulate: boolean;    // утепление стен и кровли (гараж, мастерская)
  base: 'slab' | 'ushp' | 'strip' | 'piles' | 'screw' | 'deck' | 'paving' | 'none';
  stripW: number; stripD: number; // ленточный: ширина и высота ленты, м
  eps: number;          // УШП: толщина ЭППС, м
  city: string;         // город — для снегового района
  gutter: boolean;      // водосток
  snowGuard: boolean;   // снегозадержатели
  lights: number;       // светильников
  slabT: number; sand: number; gravel: number; slabOver: number;
  rebar: 'steel' | 'composite';
  snow: number;         // снеговой район 1–8
  color: string;        // RAL; 'none' — без покраски (оцинковка / естественный металл)
  postA?: number; postB?: number; postT?: number; // свой столб: ширина × длина сечения × толщина стенки, мм (пусто — подбирается сам)
  waste: number;        // запас на материалы, %
}

export const CANOPY_DEFAULT: CanopyParams = {
  kind: 'tko', L: 10.2, W: 9.2, roof: 'single', layout: 'perimeter', midRows: 0, frame: 'steel', gutter: false, snowGuard: false, lights: 0, hHigh: 6, hLow: 5, highSide: 'left', attach: false, postStep: 3, overhang: 0.3, cover: 'prof',
  walls: { front: 'open', back: 'prof_mesh', left: 'prof_mesh', right: 'prof_mesh' }, profH: 2, profGrade: 'C8', entry: 'front', containers: 6, contType: '1.1', ties: 'auto', curb: true, bumpers: true, block: 0, blockAt: 'left', blockWall: 'prof_full',
  gate: 'none', gateW: 3, gateH: 2.5, door: false, insulate: false,
  base: 'slab', stripW: 0.4, stripD: 0.7, eps: 0.1, city: '', slabT: 0.15, sand: 0.2, gravel: 0.2, slabOver: 0, rebar: 'composite', snow: 3, color: 'RAL 7024', waste: 5,
};

// ---------- сечения ----------
interface Prof { a: number; b: number; t: number }
const P = (s: string): Prof => { const [a, b, t] = s.split('×').map(Number); return { a, b, t }; };
const postProfile = (h: number) => (h <= 3 ? '80×80×3' : h <= 4.5 ? '100×100×3' : h <= 6.2 ? '120×120×4' : '140×140×5');
const beamProfile = (step: number) => (step <= 3.2 ? '100×50×3' : step <= 4.5 ? '120×80×4' : '160×80×5');
const rafterProfile = (span: number) => (span <= 3 ? '60×40×2' : span <= 4.5 ? '80×40×3' : '100×50×3');
const purlinProfile = (spacing: number) => (spacing <= 1.0 ? '40×20×2' : spacing <= 1.6 ? '60×40×2' : spacing <= 3.2 ? '80×40×3' : '100×50×3');
const rafterMax = (snow: number, wood: boolean) => (wood ? (snow <= 2 ? 1.0 : snow <= 4 ? 0.8 : 0.6) : snow <= 2 ? 1.5 : snow <= 4 ? 1.2 : 0.9);
/** кровельный профнастил: ширина листа / полезная, ₽ за м² листа, шаг обрешётки по снегу */
export const PROF_GRADE = {
  C8: { name: 'С-8', w: 1.2, use: 1.15, price: 480, step: (snow: number) => (snow <= 2 ? 0.6 : snow <= 3 ? 0.5 : 0.4), minDeg: 10 },
  C20: { name: 'С-20', w: 1.15, use: 1.1, price: 560, step: (snow: number) => (snow <= 3 ? 0.8 : 0.6), minDeg: 8 },
  HC35: { name: 'НС-35', w: 1.06, use: 1.0, price: 780, step: (snow: number) => (snow <= 3 ? 1.0 : 0.6), minDeg: 5 },
} as const;
const r2 = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const steps = (len: number, maxStep: number) => { const n = Math.max(1, Math.ceil(len / maxStep - 1e-9)); return Array.from({ length: n + 1 }, (_, i) => (len * i) / n); };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** площадь плоского многоугольника в 3D (веером) */
const area3 = (pts: V3[]) => {
  let s = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[0], b = pts[i], c = pts[i + 1];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    s += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return s;
};
const SIDES: Side[] = ['front', 'back', 'left', 'right'];
/** Проём, заданный вручную: at — центр проёма от начала стороны (спереди и сзади — от левого угла, слева и справа — от переднего), м */
export interface OpeningSpec { id: string; kind: 'door' | 'window' | 'gate'; side: Side; at: number; w: number; h: number; sill?: number }
export interface Opening { id?: string; side: Side; a0: number; a1: number; h: number; z0?: number; kind: 'gate' | 'door' | 'window' }
export const OPENING_DEFAULT: Record<OpeningSpec['kind'], { w: number; h: number; sill?: number; label: string }> = {
  door: { w: 0.9, h: 2.05, label: 'Дверь' }, window: { w: 1.0, h: 1.0, sill: 0.9, label: 'Окно' }, gate: { w: 3, h: 2.5, label: 'Ворота' },
};

export function buildCanopy(p0: Partial<CanopyParams>, ownPrices?: Partial<DesignPrices> | null) {
  const PR = mergePrices(ownPrices);
  const p: CanopyParams = { ...CANOPY_DEFAULT, ...p0, walls: { ...CANOPY_DEFAULT.walls, ...(p0.walls || {}) } };
  const warnings: string[] = [];
  if (p0.entry === undefined) p.entry = p.kind === 'tko' ? 'front' : 'none';
  if (p0.containers === undefined && p.kind !== 'tko') p.containers = 0;
  if (p0.curb === undefined && p.kind !== 'tko') p.curb = false;
  if (p0.bumpers === undefined && p.kind !== 'tko') p.bumpers = false;
  if (p.kind === 'visor') { p.roof = 'single'; p.attach = true; }
  if (p.roof !== 'single') p.attach = false;
  if (p.attach) p.walls = { ...p.walls, [p.highSide]: 'open' };
  if (p.roof === 'arch' && p.frame === 'wood') { p.frame = 'steel'; warnings.push('Арочный каркас делается из гнутой профтрубы — каркас переключён на металл'); }
  const consoles = p.kind === 'visor';
  if (p.roof === 'hip' || consoles || p.attach) { p.layout = 'perimeter'; }
  const center = p.layout === 'center';
  if (center) { p.walls = { front: 'open', back: 'open', left: 'open', right: 'open' }; p.gate = 'none'; p.door = false; p.midRows = 0; }
  const midRows = p.roof === 'hip' ? 0 : clamp(Math.round(p.midRows || 0), 0, 6);
  // большой снег (V район и выше) — стропила и балки на размер мощнее
  const snowK = p.snow >= 6 ? 1.4 : p.snow >= 5 ? 1.2 : 1;
  const light = p.kind === 'greenhouse' && p.frame === 'steel'; // теплица: лёгкий оцинкованный каркас
  const wood = p.frame === 'wood';
  const L = Math.max(1, p.L), W = Math.max(1, p.W);
  const hLow = Math.min(p.hHigh, p.hLow);
  const hip = p.roof === 'hip', arch = p.roof === 'arch';
  const ov = p.overhang;

  // ---------- геометрия кровли ----------
  // односкатная/двускатная: u — вдоль стропил (уклона), v — поперёк
  const alongX = p.highSide === 'left' || p.highSide === 'right';
  const span = alongX ? L : W, lenV = alongX ? W : L;
  const highAtStart = p.highSide === 'left' || p.highSide === 'front';
  // арка: дуга окружности по хорде span со стрелой fA
  const fA = arch ? clamp(Math.max(p.hHigh, p.hLow) - hLow, 0.15, span / 2 - 0.01) : 0;
  if (arch && Math.abs(Math.max(p.hHigh, p.hLow) - hLow - fA) > 0.01) warnings.push(`Подъём арки ограничен половиной пролёта — высота в коньке ${r2(hLow + fA, 2)} м`);
  const Ra = arch ? (span * span / 4 + fA * fA) / (2 * fA) : 0;
  const hHigh = arch ? hLow + fA : Math.max(p.hHigh, p.hLow);
  const toW = (u: number, v: number, z: number): V3 => (alongX ? [u, v, z] : [v, u, z]);
  const hAt = (u: number) => {
    if (arch) return hLow + Math.sqrt(Math.max(0, Ra * Ra - (u - span / 2) ** 2)) - (Ra - fA);
    if (p.roof === 'gable') return hLow + (hHigh - hLow) * (1 - Math.abs(u - span / 2) / (span / 2));
    const t = u / span;
    return highAtStart ? hHigh - (hHigh - hLow) * t : hLow + (hHigh - hLow) * t;
  };
  // четырёхскатная: a — вдоль длинной стороны, b — вдоль короткой
  const longX = L >= W;
  const hl = longX ? L : W, hs = longX ? W : L;
  const kHip = (hHigh - hLow) / (hs / 2);
  const ab2w = (a: number, b: number, z: number): V3 => (longX ? [a, b, z] : [b, a, z]);
  const hipZ = (a: number, b: number) => hLow + kHip * Math.min(a, b, hl - a, hs - b, hs / 2);
  /** низ кровли (верх каркаса) в любой точке плана */
  const topAt = (x: number, y: number) => (hip ? hipZ(longX ? x : y, longX ? y : x) : hAt(alongX ? x : y));

  const members: Member[] = [];
  const panels: Panel[] = [];
  const add = (kind: MemberKind, profile: string, a: V3, b: V3) => members.push({ kind, profile, a, b });

  // стороны: t — расстояние вдоль стороны от её начала
  const sideDefs: Record<Side, { pt: (t: number) => [number, number]; len: number }> = {
    front: { pt: (t) => [t, 0], len: L }, back: { pt: (t) => [t, W], len: L },
    left: { pt: (t) => [0, t], len: W }, right: { pt: (t) => [L, t], len: W },
  };
  const sideOf = (x: number, y: number): { side: Side; t: number }[] => {
    const r: { side: Side; t: number }[] = [];
    if (Math.abs(y) < 1e-6) r.push({ side: 'front', t: x });
    if (Math.abs(y - W) < 1e-6) r.push({ side: 'back', t: x });
    if (Math.abs(x) < 1e-6) r.push({ side: 'left', t: y });
    if (Math.abs(x - L) < 1e-6) r.push({ side: 'right', t: y });
    return r;
  };
  // сторона-фронтон: верх стены не прямой (двускатная — излом посередине, арка — дуга)
  const kinkSide = (s: Side) => (p.roof === 'gable' || arch) && ((alongX && (s === 'front' || s === 'back')) || (!alongX && (s === 'left' || s === 'right')));
  const sideBps = (s: Side): number[] => (!kinkSide(s) ? [] : p.roof === 'gable' ? [sideDefs[s].len / 2] : steps(sideDefs[s].len, sideDefs[s].len / 12).slice(1, -1));

  // ---------- столбы по периметру ----------

  const postMap = new Map<string, [number, number]>();
  const addPost = (x: number, y: number) => { const k = `${x.toFixed(3)}|${y.toFixed(3)}`; if (!postMap.has(k)) postMap.set(k, [x, y]); };
  steps(L, p.postStep).forEach((x) => { addPost(x, 0); addPost(x, W); });
  steps(W, p.postStep).forEach((y) => { addPost(0, y); addPost(L, y); });
  for (const s of SIDES) if (p.roof === 'gable' && kinkSide(s)) addPost(...sideDefs[s].pt(sideDefs[s].len / 2));
  // пристенный: со стороны дома столбов нет — несущая балка на анкерах
  if (p.attach) for (const [k, [x, y]] of postMap) if (sideOf(x, y).some((q) => q.side === p.highSide)) postMap.delete(k);
  // промежуточные ряды столбов (многопролётный навес)
  const midU = Array.from({ length: midRows }, (_, i) => (span * (i + 1)) / (midRows + 1));
  // совмещённый объект: закрытый блок по длине фасада (хозблок, гараж, кухня) + открытая часть
  const B = clamp(Number(p.block) || 0, 0, L - 1);
  const bx0 = p.blockAt === 'right' ? L - B : 0, bx1 = bx0 + B, xPart = p.blockAt === 'right' ? L - B : B;
  if (B > 0) for (const y of steps(W, p.postStep)) addPost(xPart, y);
  for (const u of midU) for (const v of steps(lenV, p.postStep)) addPost(...(toW(u, v, 0).slice(0, 2) as [number, number]));
  // консольный Т-навес: один ряд столбов по центру
  if (center) {
    postMap.clear();
    for (const v of steps(lenV, p.postStep)) addPost(...(toW(span / 2, v, 0).slice(0, 2) as [number, number]));
    if (span / 2 > 3.5) warnings.push(`Консольный навес: вылет ${r2(span / 2, 1)} м в каждую сторону — больше 3,5 м нужен расчёт, лучше два ряда столбов`);
  }
  // козырёк: столбов нет совсем — консоли (подкосы) от стены
  if (consoles) { postMap.clear(); if (span > 2) warnings.push('Козырёк на консолях — вылет больше 2 м нужно проверить, лучше поставить столбы (тип «Пристенный навес»)'); }

  // въезд без промежуточных столбов (мусоровоз, автомобиль, техника) — остаются только угловые
  const entry: Side | null = p.entry && p.entry !== 'none' && !center && !consoles && !(p.attach && p.entry === p.highSide) ? p.entry : null;
  let entrySpans = 1;
  if (entry) {
    const eLen = sideDefs[entry].len;
    // в закрытом блоке (хозблок, подсобка) столбы остаются; проём — только в открытой части
    const [o0, o1] = B > 0 && (entry === 'front' || entry === 'back') ? (p.blockAt === 'right' ? [0, bx0] : [bx1, L]) : [0, eLen];
    // проём длиннее 12 м делим на равные части — ферма больше 12 м нереальна
    entrySpans = Math.max(1, Math.ceil((o1 - o0) / 12 - 1e-9));
    const keep = Array.from({ length: entrySpans - 1 }, (_, i) => o0 + ((o1 - o0) * (i + 1)) / entrySpans);
    for (const [k, [x, y]] of postMap) {
      const q = sideOf(x, y).find((z) => z.side === entry);
      if (q && q.t > o0 + 0.01 && q.t < o1 - 0.01) postMap.delete(k);
    }
    for (const t of keep) addPost(...sideDefs[entry].pt(t));
    if (entrySpans > 1) warnings.push(`Въезд ${r2(o1 - o0, 1)} м разделён столбом на ${entrySpans} проёма по ${r2((o1 - o0) / entrySpans, 1)} м`);
  }

  // ---------- проёмы: ворота, двери, окна ----------
  const openings: Opening[] = [];
  const manual = Array.isArray(p.ops) && !center;
  if (manual) {
    const SL: Record<Side, string> = { front: 'спереди', back: 'сзади', left: 'слева', right: 'справа' };
    for (const o of p.ops!) {
      const d = sideDefs[o.side];
      if (!d) continue;
      const name = `${OPENING_DEFAULT[o.kind]?.label || 'Проём'} ${SL[o.side]}`;
      if (p.attach && o.side === p.highSide) { warnings.push(`${name}: с этой стороны стена дома — проём не построен`); continue; }
      const w = clamp(Number(o.w) || 0.9, 0.4, Math.max(0.4, d.len - 0.2));
      const a0 = clamp((Number.isFinite(Number(o.at)) ? Number(o.at) : d.len / 2) - w / 2, 0.1, Math.max(0.1, d.len - 0.1 - w)), a1 = a0 + w;
      const room = Math.min(topAt(...d.pt(a0)), topAt(...d.pt(a1)), topAt(...d.pt((a0 + a1) / 2))) - 0.1;
      let z0 = 0.05, h: number;
      if (o.kind === 'window') {
        const sill = Number.isFinite(Number(o.sill)) ? Number(o.sill) : 0.9;
        z0 = clamp(sill, 0.2, Math.max(0.2, room - 0.3));
        h = z0 + clamp(Number(o.h) || 1, 0.3, Math.max(0.3, room - z0));
        if (h - z0 < (Number(o.h) || 1) - 0.01) warnings.push(`${name}: высота окна уменьшена до ${r2(h - z0, 2)} м — упирается в кровлю`);
      } else {
        h = clamp(Number(o.h) || 2, 1.5, Math.max(1.5, room));
        if (h < (Number(o.h) || 2) - 0.01) warnings.push(`${name}: высота уменьшена до ${r2(h, 2)} м — по высоте стены`);
      }
      if (w < (Number(o.w) || 0) - 0.01) warnings.push(`${name}: ширина уменьшена до ${r2(w, 2)} м — по длине стены`);
      const clash = openings.find((q) => q.side === o.side && a1 > q.a0 - 0.15 && a0 < q.a1 + 0.15);
      if (clash) warnings.push(`${name} пересекается с соседним проёмом — сдвиньте его`);
      openings.push({ id: o.id, side: o.side, a0: r2(a0, 3), a1: r2(a1, 3), h: r2(h, 2), z0: r2(z0, 2), kind: o.kind });
      // промежуточные столбы внутри проёма убираем — по краям проёма стойки рамы
      let removed = 0;
      for (const [k, [x, y]] of postMap) {
        const q = sideOf(x, y).find((z) => z.side === o.side);
        if (q && q.t > a0 + 0.02 && q.t < a1 - 0.02 && q.t > 0.01 && q.t < d.len - 0.01) { postMap.delete(k); removed++; }
      }
      if (removed && o.kind !== 'gate') warnings.push(`${name} стоит на месте промежуточного столба — столб заменён стойками по краям проёма`);
    }
  }
  if (!manual && p.gate !== 'none') {
    const fl = B > 0 ? B : sideDefs.front.len;
    const gw = clamp(p.gateW, 1.5, fl - 0.6);
    const minTop = Math.min(topAt(0, 0), topAt(L, 0), topAt(L / 2, 0));
    const gh = clamp(p.gateH, 1.8, minTop - 0.3);
    if (gw !== p.gateW) warnings.push(`Ширина ворот уменьшена до ${r2(gw, 2)} м — по ширине фасада`);
    if (gh !== p.gateH) warnings.push(`Высота ворот уменьшена до ${r2(gh, 2)} м — по высоте карниза`);
    const a0 = (B > 0 ? bx0 : 0) + (fl - gw) / 2;
    openings.push({ side: 'front', a0, a1: a0 + gw, h: gh, kind: 'gate' });
    // столбы внутри проёма убираем — пролёт перекрывает обвязка, по краям — стойки рамы
    for (const [k, [x, y]] of postMap) if (Math.abs(y) < 1e-6 && x > a0 - 0.1 && x < a0 + gw + 0.1) postMap.delete(k);
  }
  if (!manual && p.door) {
    const dw = 0.9, need = dw + 0.2;
    const order: Side[] = ['front', 'right', 'left', 'back'];
    let placed = false;
    for (const s of order) {
      if (p.attach && s === p.highSide) continue;
      const d = sideDefs[s];
      const ts = [...postMap.values()].flatMap(([x, y]) => sideOf(x, y).filter((q) => q.side === s).map((q) => q.t));
      const busy = openings.filter((o) => o.side === s);
      const cands: number[] = [];
      const lim: [number, number] = B > 0 && (s === 'front' || s === 'back') ? [bx0, bx1] : [0, d.len];
      if (B > 0 && (s === 'left' || s === 'right') && s !== (p.blockAt === 'right' ? 'right' : 'left')) continue; // в открытой части двери не нужны
      for (let t = lim[0] + 0.15; t + need <= lim[1] - 0.1 + 1e-9; t += 0.05) cands.push(t);
      // без ворот дверь ставим ближе к середине стены, с воротами — сбоку от них
      if (!busy.length) cands.sort((x, y) => Math.abs(x + need / 2 - (lim[0] + lim[1]) / 2) - Math.abs(y + need / 2 - (lim[0] + lim[1]) / 2));
      for (const t of cands) {
        const a0 = t + 0.1, a1 = a0 + dw;
        if (ts.some((x) => x > a0 - 0.12 && x < a1 + 0.12)) continue;
        if (busy.some((o) => a1 > o.a0 - 0.3 && a0 < o.a1 + 0.3)) continue;
        const room = Math.min(topAt(...d.pt(a0)), topAt(...d.pt(a1))) - 0.1;
        if (room < 1.75) continue;
        openings.push({ side: s, a0, a1, h: r2(Math.min(2.05, room), 2), kind: 'door' });
        placed = true; break;
      }
      if (placed) { if (s !== 'front') warnings.push(`Дверь размещена ${s === 'right' ? 'справа' : s === 'left' ? 'слева' : 'сзади'} — на фасаде не хватило места между столбами и воротами`); break; }
    }
    if (!placed) warnings.push('Дверь не поместилась между столбами — уменьшите шаг столбов или ширину ворот');
  }

  // сечение столбов — по самому высокому столбу (у четырёхскатной и двускатной без средних стоек это карниз)
  const postProf = postProfile(Math.max(hLow, ...[...postMap.values()].map(([x, y]) => topAt(x, y))) + (center ? 1.6 : 0)); // консольный — столбы мощнее
  const postSet = new Map<string, V3>();
  for (const [k, [x, y]] of postMap) { postSet.set(k, [x, y, 0]); add('post', postProf, [x, y, 0], [x, y, topAt(x, y)]); }
  if (hHigh > 6.2) warnings.push('Высота больше 6 м — сечение столбов и связи нужно проверить расчётом');

  // ---------- обвязка по периметру (по верху столбов, повторяет уклон) ----------
  let beamProf = beamProfile(p.postStep);
  let girder: { side: Side; len: number; h: number } | null = null;
  const girderSet = new Set<Member>(); // подстропильная ферма над въездом — не путать со стропилами в подписях
  for (const s of SIDES) {
    const d = sideDefs[s];
    const ts = [...postMap.values()].flatMap(([x, y]) => sideOf(x, y).filter((q) => q.side === s).map((q) => q.t))
      .concat(openings.filter((o) => o.side === s && o.kind === 'gate').flatMap((o) => [o.a0, o.a1])).sort((a, b) => a - b);
    const isHouse = p.attach && s === p.highSide;
    let gap = p.postStep;
    for (let i = 1; i < ts.length; i++) gap = Math.max(gap, ts[i] - ts[i - 1]);
    // над въездом длиннее 6 м — подстропильная ферма вместо балки
    if (s === entry && gap > 6 && !kinkSide(s)) {
      // по участкам между столбами: где пролёт больше 6 м — ферма, остальное — балка
      const pts = [...new Set([0, d.len, ...ts].map((v) => r2(v, 4)))].sort((a, b) => a - b);
      const zt = (t: number) => topAt(...d.pt(t));
      for (let j = 0; j < pts.length - 1; j++) {
        const t0 = pts[j], t1 = pts[j + 1], seg = t1 - t0;
        const [x0, y0] = d.pt(t0), [x1, y1] = d.pt(t1);
        if (seg <= 6) { add('beam', beamProfile(seg * snowK), [x0, y0, zt(t0)], [x1, y1, zt(t1)]); continue; }
        const hg = clamp(seg / 10, 0.6, 1.2);
        const g0 = members.length;
        add('beam', '100×100×4', [x0, y0, zt(t0)], [x1, y1, zt(t1)]);
        add('chord', '100×100×4', [x0, y0, zt(t0) - hg], [x1, y1, zt(t1) - hg]);
        const n = Math.max(4, Math.ceil(seg / (hg * 1.2)));
        for (let i = 0; i <= n; i++) {
          const t = t0 + (seg * i) / n, [x, y] = d.pt(t);
          add('web', '60×60×3', [x, y, zt(t) - hg], [x, y, zt(t)]);
          if (i < n) { const t2 = t0 + (seg * (i + 1)) / n, [x2, y2] = d.pt(t2); if (i % 2 === 0) add('web', '60×60×3', [x, y, zt(t) - hg], [x2, y2, zt(t2)]); else add('web', '60×60×3', [x, y, zt(t)], [x2, y2, zt(t2) - hg]); }
        }
        for (let q = g0; q < members.length; q++) girderSet.add(members[q]);
        if (!girder || seg > girder.len) girder = { side: s, len: seg, h: hg };
      }
      continue;
    }
    const prof = isHouse ? beamProfile(p.postStep * snowK) : beamProfile(gap * snowK);
    if (P(prof).a > P(beamProf).a) beamProf = prof;
    if (gap > 6) warnings.push(`Пролёт обвязки ${r2(gap, 1)} м над проёмом — нужна усиленная балка или ферма, проверьте у конструктора`);
    const bps = [0, d.len, ...sideBps(s)].sort((a, b) => a - b);
    for (let i = 0; i < bps.length - 1; i++) {
      const [x0, y0] = d.pt(bps[i]), [x1, y1] = d.pt(bps[i + 1]);
      add('beam', prof, [x0, y0, topAt(x0, y0)], [x1, y1, topAt(x1, y1)]);
    }
  }

  // балки по внутренним рядам столбов (поперёк — вдоль v)
  for (const u of center ? [span / 2] : midU) add('beam', beamProfile(p.postStep * snowK), toW(u, 0, hAt(u)), toW(u, lenV, hAt(u)));

  // ---------- стропильная система ----------
  const rStepMax = rafterMax(p.snow, wood || light);
  const slats = p.cover === 'slats';
  const purStep = slats ? 0.3 : light ? 1.0 : p.cover === 'poly' ? 0.7 : p.cover === 'tile' ? 0.35 : p.cover === 'soft' ? 0.6 : p.cover === 'sandwich' ? 1.5 : (PROF_GRADE[p.profGrade] || PROF_GRADE.C8).step(p.snow);
  let bentLen = 0; // гнутые элементы арки
  let truss = false, rafterProf = '', chordProf = '', webProf = '', purProf = '', rafterCount = 0, rafterSpacing = 0, purlinRows = 0, slopeLen = 0;
  const roofPolys: V3[][] = [];
  let ridgeLen = 0, eaveLen = 0, vergeLen = 0; // для доборных элементов кровли

  if (!hip) {
    const vPos = steps(lenV, p.postStep);
    // опоры поперёк пролёта: края, конёк, промежуточные ряды; самый длинный участок решает — стропила или фермы
    const supU = [...new Set([0, span, ...(p.roof === 'gable' ? [span / 2] : []), ...midU].map((u) => r2(u, 4)))].sort((a, b) => a - b);
    const segU: [number, number][] = supU.slice(1).map((u, i) => [supU[i], u]);
    const maxSeg = center ? span / 2 : Math.max(...segU.map(([a, b]) => b - a));
    const halfSpan0 = maxSeg;
    truss = arch ? maxSeg > 7 : Math.hypot(halfSpan0, (hHigh - hLow) * (maxSeg / (p.roof === 'gable' ? span / 2 : span))) > 6.5 && !center;
    // фермы ставим по линиям столбов, обычные стропила — с шагом по снеговой нагрузке
    const perBay = truss ? 1 : Math.max(1, Math.ceil((lenV / (vPos.length - 1)) / rStepMax - 1e-9));
    const rafV: number[] = [];
    for (let i = 0; i < vPos.length - 1; i++) for (let k = 0; k < perBay; k++) rafV.push(vPos[i] + ((vPos[i + 1] - vPos[i]) * k) / perBay);
    rafV.push(lenV);
    rafterSpacing = lenV / (rafV.length - 1);
    rafterCount = rafV.length;
    const AN = 16; // число прямых участков дуги
    const arcUs = (u0: number, u1: number) => Array.from({ length: AN + 1 }, (_, i) => u0 + ((u1 - u0) * i) / AN);
    const polyLen = (us: number[], dz = 0) => us.slice(1).reduce((a, u, i) => a + Math.hypot(u - us[i], hAt(u) - hAt(us[i])), 0) + dz * 0;
    slopeLen = arch ? polyLen(arcUs(0, span)) / 2 : Math.hypot(halfSpan0, hHigh - hLow);
    rafterProf = rafterProfile(slopeLen * snowK);
    if (truss) {
      chordProf = slopeLen <= 9 ? '60×40×3' : '80×60×3'; webProf = '40×40×2'; rafterProf = chordProf;
      const ht = Math.min(1.0, Math.max(0.4, maxSeg / 12));
      if (slopeLen > 12) warnings.push('Пролёт больше 12 м — ферма требует расчёта конструктора');
      for (const v of rafV) {
        const segs: [number, number][] = segU;
        for (const [u0, u1] of segs) {
          const n = Math.max(2, Math.ceil((u1 - u0) / (ht * 1.4)));
          if (arch) {
            const us = arcUs(u0, u1);
            for (let i = 0; i < AN; i++) { add('chord', chordProf, toW(us[i], v, hAt(us[i])), toW(us[i + 1], v, hAt(us[i + 1]))); add('chord', chordProf, toW(us[i], v, hAt(us[i]) - ht), toW(us[i + 1], v, hAt(us[i + 1]) - ht)); }
            bentLen += 2 * polyLen(us);
          } else {
            add('chord', chordProf, toW(u0, v, hAt(u0)), toW(u1, v, hAt(u1)));
            add('chord', chordProf, toW(u0, v, hAt(u0) - ht), toW(u1, v, hAt(u1) - ht));
          }
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
      // у стены дома свеса нет
      const o0 = p.attach && highAtStart ? 0 : ov, o1 = p.attach && !highAtStart ? 0 : ov;
      // консольный Т-навес: подкосы от столба к стропилам в обе стороны
      if (center) for (const v of steps(lenV, p.postStep)) {
        const zc = hAt(span / 2), reach = Math.min(span * 0.3, 1.8), drop = Math.min(1.2, Math.max(0.5, span * 0.18));
        add('brace', beamProfile(p.postStep) === '100×50×3' ? '80×40×3' : '100×50×3', toW(span / 2, v, zc - drop), toW(span / 2 - reach, v, hAt(span / 2 - reach) - 0.02));
        add('brace', beamProfile(p.postStep) === '100×50×3' ? '80×40×3' : '100×50×3', toW(span / 2, v, zc - drop), toW(span / 2 + reach, v, hAt(span / 2 + reach) - 0.02));
      }
      for (const v of rafV) {
        if (arch) { const us = arcUs(-ov, span + ov); for (let i = 0; i < AN; i++) add('rafter', rafterProf, toW(us[i], v, hAt(us[i])), toW(us[i + 1], v, hAt(us[i + 1]))); bentLen += polyLen(us); }
        else if (p.roof === 'gable') { add('rafter', rafterProf, toW(-ov, v, hAt(-ov)), toW(span / 2, v, hAt(span / 2))); add('rafter', rafterProf, toW(span / 2, v, hAt(span / 2)), toW(span + ov, v, hAt(span + ov))); }
        else add('rafter', rafterProf, toW(-o0, v, hAt(-o0)), toW(span + o1, v, hAt(span + o1)));
      }
    }
    // прогоны
    purProf = slats ? '60×20×2' : purlinProfile(rafterSpacing);
    const roofTop = (u: number) => hAt(u) + 0.03;
    const purU: number[] = [];
    if (p.roof === 'gable') { steps(span / 2, purStep).forEach((u) => purU.push(u)); steps(span / 2, purStep).forEach((u) => purU.push(span / 2 + u)); }
    else steps(span, purStep).forEach((u) => purU.push(u));
    const uniq = [...new Set(purU.map((u) => r2(u, 3)))];
    purlinRows = uniq.length;
    uniq.forEach((u) => add('purlin', purProf, toW(u, -ov, roofTop(u)), toW(u, lenV + ov, roofTop(u))));
    // консоли козырька: подкосы от стены к краю
    if (consoles) {
      const uH = highAtStart ? 0 : span, dir = highAtStart ? 1 : -1, reach = span * 0.7, drop = Math.min(0.9, Math.max(0.4, span * 0.6));
      for (const v of steps(lenV, Math.min(p.postStep, 1.5))) add('brace', '40×40×2', toW(uH, v, hHigh - drop), toW(uH + dir * reach, v, hAt(uH + dir * reach) - 0.02));
    }
    // кровля
    const s0 = p.attach && highAtStart ? 0 : ov, s1 = p.attach && !highAtStart ? 0 : ov;
    const archU = arch ? arcUs(-ov, span + ov) : [];
    const roofSegs: [number, number][] = arch ? archU.slice(1).map((u, i) => [archU[i], u] as [number, number]) : p.roof === 'gable' ? [[-ov, span / 2], [span / 2, span + ov]] : [[-s0, span + s1]];
    const skin = (u: number) => roofTop(u) + 0.05; // кровля лежит поверх прогонов
    for (const [u0, u1] of roofSegs) roofPolys.push([toW(u0, -ov, skin(u0)), toW(u1, -ov, skin(u1)), toW(u1, lenV + ov, skin(u1)), toW(u0, lenV + ov, skin(u0))]);
    const slopes = roofSegs.map(([u0, u1]) => Math.hypot(u1 - u0, roofTop(u1) - roofTop(u0)));
    vergeLen = 2 * slopes.reduce((a, b) => a + b, 0);
    eaveLen = (p.roof === 'gable' || arch ? 2 : 1) * (lenV + 2 * ov);
    ridgeLen = p.roof === 'gable' ? lenV + 2 * ov : 0;
  } else {
    // четырёхскатная (вальмовая; при квадрате — шатровая)
    slopeLen = Math.hypot(hs / 2, hHigh - hLow);
    if (slopeLen > 6) warnings.push('Скат длиннее 6 м — для четырёхскатной кровли нужен расчёт стропильной системы');
    rafterProf = rafterProfile(slopeLen * snowK);
    const hipProf = P(rafterProf).a < 80 ? '80×40×3' : '100×50×4';
    const z = (a: number, b: number) => hipZ(a, b);
    const r1: [number, number] = [hs / 2, hs / 2], rr2: [number, number] = [hl - hs / 2, hs / 2];
    if (hl - hs > 0.01) add('hip', hipProf, ab2w(...r1, hHigh), ab2w(...rr2, hHigh));
    const corners: [number, number, [number, number]][] = [[-ov, -ov, r1], [hl + ov, -ov, rr2], [hl + ov, hs + ov, rr2], [-ov, hs + ov, r1]];
    for (const [a, b, r] of corners) add('hip', hipProf, ab2w(a, b, z(a, b)), ab2w(r[0], r[1], hHigh));
    // рядовые и укороченные стропила
    for (const a of steps(hl, rStepMax)) {
      const e = Math.min(hs / 2, a, hl - a);
      if (e < 0.25) continue;
      add('rafter', rafterProf, ab2w(a, -ov, z(a, -ov)), ab2w(a, e, z(a, e))); rafterCount++;
      add('rafter', rafterProf, ab2w(a, hs + ov, z(a, hs + ov)), ab2w(a, hs - e, z(a, hs - e))); rafterCount++;
    }
    for (const b of steps(hs, rStepMax)) {
      const e = Math.min(hs / 2, b, hs - b);
      if (e < 0.25) continue;
      add('rafter', rafterProf, ab2w(-ov, b, z(-ov, b)), ab2w(e, b, z(e, b))); rafterCount++;
      add('rafter', rafterProf, ab2w(hl + ov, b, z(hl + ov, b)), ab2w(hl - e, b, z(hl - e, b))); rafterCount++;
    }
    rafterSpacing = rStepMax;
    purProf = slats ? '60×20×2' : purlinProfile(rafterSpacing);
    // прогоны — замкнутыми кольцами по скатам
    for (let t = -ov + 0.05; t < hs / 2 - 0.1; t += purStep) {
      const zz = hLow + kHip * t + 0.03;
      const pts: [number, number][] = [[t, t], [hl - t, t], [hl - t, hs - t], [t, hs - t]];
      for (let i = 0; i < 4; i++) { const [a0, b0] = pts[i], [a1, b1] = pts[(i + 1) % 4]; if (Math.hypot(a1 - a0, b1 - b0) > 0.05) add('purlin', purProf, ab2w(a0, b0, zz), ab2w(a1, b1, zz)); }
      purlinRows++;
    }
    const ez = hLow - kHip * ov + 0.08, rz = hHigh + 0.08; // кровля поверх прогонов
    const E1 = ab2w(-ov, -ov, ez), E2 = ab2w(hl + ov, -ov, ez), E3 = ab2w(hl + ov, hs + ov, ez), E4 = ab2w(-ov, hs + ov, ez);
    const R1 = ab2w(...r1, rz), R2 = ab2w(...rr2, rz);
    // порядок точек: первая и последняя — по карнизу (рёбра профиля идут вниз по скату)
    roofPolys.push([E1, R1, R2, E2], [E2, R2, R2, E3], [E3, R2, R1, E4], [E4, R1, R1, E1]);
    ridgeLen = Math.max(0, hl - hs) + 4 * dist(E1, R1);
    eaveLen = 2 * (hl + hs + 4 * ov);
  }
  if (p.cover !== 'none' && !slats) roofPolys.forEach((pts) => panels.push({ kind: 'roof', pts }));
  const roofArea = roofPolys.reduce((a, q) => a + area3(q), 0);

  // ---------- связи жёсткости: крестовые в крайних пролётах стен и по кровле ----------
  const needTies = !consoles && postMap.size > 0 && (p.ties === 'yes' || (p.ties === 'auto' && (hLow >= 3.2 || Math.max(L, W) >= 12)));
  let tieCount = 0;
  if (needTies) {
    const tp = '40×40×3';
    for (const sd of SIDES) {
      if (sd === entry || (p.attach && sd === p.highSide)) continue;
      const d = sideDefs[sd];
      const ts = [...new Set([...postMap.values()].flatMap(([x, y]) => sideOf(x, y).filter((q) => q.side === sd).map((q) => r2(q.t, 4))))].sort((a, b) => a - b);
      if (ts.length < 2) continue;
      const bays: [number, number][] = ts.slice(1).map((t, i) => [ts[i], t]);
      const pick = bays.length <= 2 ? [bays[0]] : [bays[0], bays[bays.length - 1]];
      for (const [t0, t1] of pick) {
        if (openings.some((o) => o.side === sd && o.a1 > t0 && o.a0 < t1)) continue;
        const [x0, y0] = d.pt(t0), [x1, y1] = d.pt(t1);
        add('tie', tp, [x0, y0, 0.3], [x1, y1, topAt(x1, y1) - 0.25]);
        add('tie', tp, [x1, y1, 0.3], [x0, y0, topAt(x0, y0) - 0.25]);
        tieCount += 2;
      }
    }
    if (!hip && !arch) {
      const vp = steps(lenV, p.postStep);
      const ends: [number, number][] = vp.length > 2 ? [[vp[0], vp[1]], [vp[vp.length - 2], vp[vp.length - 1]]] : [[vp[0], vp[1]]];
      const segs: [number, number][] = p.roof === 'gable' ? [[0, span / 2], [span / 2, span]] : [[0, span]];
      for (const [v0, v1] of ends) for (const [u0, u1] of segs) {
        add('tie', tp, toW(u0, v0, hAt(u0) - 0.04), toW(u1, v1, hAt(u1) - 0.04));
        add('tie', tp, toW(u0, v1, hAt(u0) - 0.04), toW(u1, v0, hAt(u1) - 0.04));
        tieCount += 2;
      }
    }
  }

  // ---------- стены: обшивка, перила, проёмы ----------
  let profFixedSheets = 0, profFixedArea = 0, profFullArea = 0, meshArea = 0, railLen = 0, wallAvgH = 0, polyWall = 0, sandWall = 0, woodWall = 0;
  const wallRun = (d: { pt: (t: number) => [number, number]; len: number }, w: Wall, ops: Opening[], extra: number[], tA: number, tB: number) => {
    if (w === 'open' && !ops.length) return;
    const top = (t: number) => topAt(...d.pt(t)) - 0.05;
    const bps = [...new Set([tA, tB, ...ops.flatMap((o) => [o.a0, o.a1]), ...extra].filter((v) => v >= tA - 1e-9 && v <= tB + 1e-9).map((v) => r2(v, 4)))].sort((a, b) => a - b);
    const quad = (t0: number, t1: number, z0: (t: number) => number, z1: (t: number) => number, kind: Panel['kind']) => {
      const [x0, y0] = d.pt(t0), [x1, y1] = d.pt(t1);
      if (z1(t0) - z0(t0) < 0.02 && z1(t1) - z0(t1) < 0.02) return 0;
      panels.push({ kind, pts: [[x0, y0, z0(t0)], [x1, y1, z0(t1)], [x1, y1, z1(t1)], [x0, y0, z1(t0)]] });
      return (t1 - t0) * ((z1(t0) - z0(t0)) + (z1(t1) - z0(t1))) / 2;
    };
    const railAt = (t0: number, t1: number, z: number) => { const [x0, y0] = d.pt(t0), [x1, y1] = d.pt(t1); if (z < Math.min(top(t0), top(t1)) - 0.05) add('rail', '40×20×2', [x0, y0, z], [x1, y1, z]); };
    for (let i = 0; i < bps.length - 1; i++) {
      const t0 = bps[i], t1 = bps[i + 1];
      if (t1 - t0 < 0.01) continue;
      const tm = (t0 + t1) / 2;
      const op = ops.find((o) => tm > o.a0 && tm < o.a1);
      const zb = op ? op.h : 0.05;
      const c = (v: number) => () => v;
      // под окном — стена до подоконника
      if (op && op.kind === 'window' && (op.z0 || 0) > 0.1) {
        const sill = op.z0!;
        if (w === 'prof_full') profFullArea += quad(t0, t1, c(0.05), c(sill), 'prof');
        else if (w === 'poly' || w === 'sandwich' || w === 'wood') { const a = quad(t0, t1, c(0.05), c(sill), w); if (w === 'poly') polyWall += a; else if (w === 'sandwich') sandWall += a; else woodWall += a; }
        else if ((w === 'prof' || w === 'prof_mesh') && p.profH > 0.1) profFixedArea += quad(t0, t1, c(0.05), c(Math.min(sill, p.profH)), 'prof');
        else if (w === 'wood_low') woodWall += quad(t0, t1, c(0.05), c(Math.min(1.0, sill)), 'wood');
      }
      if (w === 'prof_full') {
        profFullArea += quad(t0, t1, c(zb), top, 'prof');
        for (let z = op ? op.h + 0.6 : 0.2; z < Math.max(top(t0), top(t1)); z += 1.2) railAt(t0, t1, z);
      } else if (w === 'poly' || w === 'sandwich' || w === 'wood') {
        const a = quad(t0, t1, c(zb), top, w);
        if (w === 'poly') polyWall += a; else if (w === 'sandwich') sandWall += a; else woodWall += a;
        if (w !== 'sandwich') for (let z = op ? op.h + 0.6 : 0.2; z < Math.max(top(t0), top(t1)); z += w === 'poly' ? 1.0 : 1.2) railAt(t0, t1, z);
      } else if (w === 'wood_low') {
        if (!op) { woodWall += quad(t0, t1, c(0.05), (t) => Math.min(1.0, top(t)), 'wood'); [0.15, 0.95].forEach((z) => railAt(t0, t1, z)); }
      } else if (w === 'mesh') {
        meshArea += quad(t0, t1, c(zb), top, 'mesh');
        if (!op) [0.2, 1.5].forEach((z) => railAt(t0, t1, z));
      } else if (w === 'prof' || w === 'prof_mesh') {
        if (zb < p.profH) { const a = quad(t0, t1, c(zb), (t) => Math.min(p.profH, top(t)), 'prof'); profFixedArea += a; profFixedSheets += Math.ceil((t1 - t0) / 1.15 - 1e-9); }
        if (w === 'prof_mesh') meshArea += quad(t0, t1, c(Math.max(zb, p.profH)), top, 'mesh');
        if (!op) [0.2, p.profH - 0.1].forEach((z) => railAt(t0, t1, z));
        if (w === 'prof_mesh') railAt(t0, t1, Math.max(zb, p.profH));
      } else if (w === 'rail' && !op) {
        const [x0, y0] = d.pt(t0), [x1, y1] = d.pt(t1);
        add('handrail', '40×40×2', [x0, y0, 1.0], [x1, y1, 1.0]);
        add('handrail', '40×20×2', [x0, y0, 0.12], [x1, y1, 0.12]);
        const n = Math.max(1, Math.round((t1 - t0) / 0.13));
        for (let k = 1; k < n; k++) { const [x, y] = d.pt(t0 + ((t1 - t0) * k) / n); add('baluster', '20×20×1.5', [x, y, 0.12], [x, y, 1.0]); }
        railLen += t1 - t0;
      }
    }
    if (w === 'prof_full' || w === 'sandwich') wallAvgH = Math.max(wallAvgH, (top(tA) + top(tB)) / 2);
  };
  for (const side of SIDES) {
    const d = sideDefs[side];
    const ops = openings.filter((o) => o.side === side);
    const blockEnd = B > 0 && side === (p.blockAt === 'right' ? 'right' : 'left');
    if (B > 0 && (side === 'front' || side === 'back')) {
      wallRun(d, p.blockWall, ops.filter((o) => o.a0 >= bx0 - 1e-6 && o.a1 <= bx1 + 1e-6), sideBps(side), bx0, bx1);
      const [r0, r1] = p.blockAt === 'right' ? [0, bx0] : [bx1, L];
      wallRun(d, p.walls[side], ops.filter((o) => o.a0 >= r0 - 1e-6 && o.a1 <= r1 + 1e-6), sideBps(side), r0, r1);
    } else wallRun(d, blockEnd ? p.blockWall : p.walls[side], ops, sideBps(side), 0, d.len);
    const top = (t: number) => topAt(...d.pt(t)) - 0.05;
    // проёмы: полотна и рамы
    for (const o of ops) {
      const [x0, y0] = d.pt(o.a0), [x1, y1] = d.pt(o.a1);
      const z0 = o.z0 ?? 0.05;
      panels.push({ kind: o.kind, pts: [[x0, y0, z0], [x1, y1, z0], [x1, y1, o.h], [x0, y0, o.h]] });
      const fp = o.kind === 'gate' ? postProf : wood ? '100×50×0' : '60×40×2';
      add('frame', fp, [x0, y0, 0], [x0, y0, top(o.a0) + 0.05]);
      add('frame', fp, [x1, y1, 0], [x1, y1, top(o.a1) + 0.05]);
      add('frame', o.kind === 'gate' ? '80×40×3' : wood ? '100×50×0' : '60×40×2', [x0, y0, o.h], [x1, y1, o.h]);
      if (o.kind === 'window') add('frame', wood ? '100×50×0' : '60×40×2', [x0, y0, z0], [x1, y1, z0]);
    }
  }
  // перегородка между закрытым блоком и открытой частью + балка по ней
  if (B > 0) {
    const dP = { pt: (t: number): [number, number] => [xPart, t], len: W };
    wallRun(dP, p.blockWall, [], sideBps('left'), 0, W);
    const bp = [0, W, ...sideBps('left')].sort((a, b) => a - b);
    for (let i = 0; i < bp.length - 1; i++) add('beam', beamProfile(p.postStep), [xPart, bp[i], topAt(xPart, bp[i])], [xPart, bp[i + 1], topAt(xPart, bp[i + 1])]);
  }
  const profArea = profFixedArea + profFullArea;

  // стена дома (для пристенного) — только для показа
  let houseLen = 0;
  if (p.attach) {
    const d = sideDefs[p.highSide];
    const out = 0.06;
    const [nx, ny] = p.highSide === 'front' ? [0, -out] : p.highSide === 'back' ? [0, out] : p.highSide === 'left' ? [-out, 0] : [out, 0];
    const ext = consoles ? 0.8 : 1.2;
    const [x0, y0] = d.pt(-ext), [x1, y1] = d.pt(d.len + ext);
    panels.push({ kind: 'house', pts: [[x0 + nx, y0 + ny, -0.1], [x1 + nx, y1 + ny, -0.1], [x1 + nx, y1 + ny, hHigh + (consoles ? 0.4 : 0.9)], [x0 + nx, y0 + ny, hHigh + (consoles ? 0.4 : 0.9)]] });
    if (consoles) {
      // входная дверь дома под козырьком — для наглядности
      const [dx0, dy0] = d.pt(d.len / 2 - 0.45), [dx1, dy1] = d.pt(d.len / 2 + 0.45);
      const k2 = 0.8; // чуть ближе к козырьку, чем стена
      panels.push({ kind: 'door', pts: [[dx0 + nx * k2, dy0 + ny * k2, 0], [dx1 + nx * k2, dy1 + ny * k2, 0], [dx1 + nx * k2, dy1 + ny * k2, Math.min(2.1, hLow - 0.25)], [dx0 + nx * k2, dy0 + ny * k2, Math.min(2.1, hLow - 0.25)]] });
    }
    houseLen = d.len;
  }

  // ---------- основание ----------
  const sx = L + 2 * p.slabOver, sy = W + 2 * p.slabOver;
  const slabArea = sx * sy;
  if (p.base === 'strip') {
    const w2 = p.stripW / 2;
    panels.push({ kind: 'strip', pts: [[-w2, -w2, 0], [L + w2, -w2, 0], [L + w2, w2, 0], [-w2, w2, 0]] });
    panels.push({ kind: 'strip', pts: [[-w2, W - w2, 0], [L + w2, W - w2, 0], [L + w2, W + w2, 0], [-w2, W + w2, 0]] });
    panels.push({ kind: 'strip', pts: [[-w2, w2, 0], [w2, w2, 0], [w2, W - w2, 0], [-w2, W - w2, 0]] });
    panels.push({ kind: 'strip', pts: [[L - w2, w2, 0], [L + w2, w2, 0], [L + w2, W - w2, 0], [L - w2, W - w2, 0]] });
  }
  if (p.base === 'slab' || p.base === 'ushp') panels.push({ kind: 'slab', pts: [[-p.slabOver, -p.slabOver, 0], [L + p.slabOver, -p.slabOver, 0], [L + p.slabOver, W + p.slabOver, 0], [-p.slabOver, W + p.slabOver, 0]] });
  if (p.base === 'deck') panels.push({ kind: 'deck', pts: [[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]] });
  if (p.base === 'paving') panels.push({ kind: 'paving', pts: [[-p.slabOver, -p.slabOver, 0], [L + p.slabOver, -p.slabOver, 0], [L + p.slabOver, W + p.slabOver, 0], [-p.slabOver, W + p.slabOver, 0]] });

  // ---------- площадка ТКО: контейнеры в макете и проезд мусоровоза ----------
  let contPlaced = 0;
  if (p.kind === 'tko' && p.containers > 0) {
    const [cw, cd, ch] = p.contType === '8' ? [3.6, 1.9, 1.55] : p.contType === '0.75' ? [1.26, 0.78, 1.3] : [1.37, 1.07, 1.47];
    const gap = 0.3, edge = 0.35;
    // ряды вдоль стены, противоположной въезду
    const back: Side = entry === 'back' ? 'front' : entry === 'left' ? 'right' : entry === 'right' ? 'left' : 'back';
    const along = back === 'front' || back === 'back' ? L : W, across = back === 'front' || back === 'back' ? W : L;
    // закрытый блок (подсобка, отсек КГМ) не занимаем
    const [aMin, aMax] = B > 0 && (back === 'front' || back === 'back') ? (p.blockAt === 'right' ? [0, bx0] : [bx1, L]) : [0, along];
    const perRow = Math.max(0, Math.floor((aMax - aMin - 2 * edge + gap) / (cw + gap)));
    const rowsFit = Math.max(0, Math.floor((across - 2.5) / (cd + 0.6))); // 2,5 м — проход к контейнерам
    const want = Math.round(p.containers);
    for (let i = 0; i < want && perRow > 0; i++) {
      const row = Math.floor(i / perRow), col = i % perRow;
      if (row >= Math.max(1, rowsFit)) break;
      const a0 = aMin + edge + col * (cw + gap), b0 = 0.25 + row * (cd + 0.6);
      // a — вдоль задней стены, b — от неё внутрь
      const toXY = (a: number, b: number): [number, number] => back === 'back' ? [a, W - b] : back === 'front' ? [a, b] : back === 'left' ? [b, a] : [L - b, a];
      const c = [toXY(a0, b0), toXY(a0 + cw, b0), toXY(a0 + cw, b0 + cd), toXY(a0, b0 + cd)];
      panels.push({ kind: 'container', pts: c.map(([x, y]) => [x, y, ch] as V3) });
      contPlaced++;
    }
    if (contPlaced < want) warnings.push(`Помещается ${contPlaced} ${p.contType === '8' ? 'бункер(ов) 8' : `контейнер(ов) ${p.contType}`} м³ из ${want} — увеличьте площадку или уменьшите число`);
  }
  // ---------- колесоотбойники и отбойник для контейнеров ----------
  let bollards = 0, bumperLen = 0;
  if (p.bumpers && !consoles) {
    for (const [x, y] of postMap.values()) {
      const sd = sideOf(x, y);
      const exposed = !sd.length || sd.some((q) => q.side === entry || p.walls[q.side] === 'open');
      if (!exposed) continue;
      // ставим перед столбом — со стороны подъезда (снаружи по оси въезда или внутрь от внутреннего столба)
      const dx = x <= 1e-6 ? -0.3 : x >= L - 1e-6 ? 0.3 : 0, dy = y <= 1e-6 ? -0.3 : y >= W - 1e-6 ? 0.3 : 0;
      const [bx, by] = sd.length ? [x + (entry === 'left' || entry === 'right' ? dx : 0), y + (entry === 'front' || entry === 'back' || !entry ? dy : 0)] : [x + 0.3, y];
      add('bollard', '108×108×4', [bx, by, 0], [bx, by, 1.0]);
      bollards++;
    }
    if (p.kind === 'tko') {
      for (const sd of SIDES) {
        if (sd === entry || p.walls[sd] === 'open') continue;
        const d = sideDefs[sd];
        const inset = 0.25;
        const off = (t: number): [number, number] => { const [x, y] = d.pt(t); return sd === 'front' ? [x, y + inset] : sd === 'back' ? [x, y - inset] : sd === 'left' ? [x + inset, y] : [x - inset, y]; };
        const t0 = 0.3, t1 = d.len - 0.3;
        add('bumper', '80×80×3', [...off(t0), 0.45] as V3, [...off(t1), 0.45] as V3);
        for (const t of steps(t1 - t0, 1.5).map((v) => v + t0)) add('bumper', '60×60×3', [...off(t), 0] as V3, [...off(t), 0.45] as V3);
        bumperLen += t1 - t0;
      }
    }
  }
  // ---------- бордюр по периметру основания (со стороны въезда — нет) ----------
  let curbLen = 0;
  if (p.curb && p.base !== 'paving') {
    const o = ['slab', 'ushp'].includes(p.base) ? p.slabOver : 0.2, cw = 0.15;
    const x0 = -o - cw, x1 = L + o, y0 = -o - cw, y1 = W + o;
    const runs: Record<Side, [number, number, number, number]> = { front: [x0, y0, x1 + cw, y0 + cw], back: [x0, y1, x1 + cw, y1 + cw], left: [x0, y0 + cw, x0 + cw, y1], right: [x1, y0 + cw, x1 + cw, y1] };
    for (const sd of SIDES) {
      if (sd === entry) continue;
      const [a, b2, c, d2] = runs[sd];
      panels.push({ kind: 'curb', pts: [[a, b2, 0.15], [c, b2, 0.15], [c, d2, 0.15], [a, d2, 0.15]] });
      curbLen += Math.max(c - a, d2 - b2);
    }
  }
  if (p.kind === 'tko' && entry && p.cover !== 'none') {
    const minH = Math.min(...[0, 0.5, 1].map((f) => topAt(...sideDefs[entry].pt(sideDefs[entry].len * f)))) - (girder ? girder.h : 0.15);
    if (minH < 3.5) warnings.push(`Высота проезда над въездом ${r2(minH, 2)} м — мусоровозу нужно не меньше 3,5–4 м`);
  }
  if (girder) warnings.push(`Въезд без промежуточных столбов: над проёмом ${r2(girder.len, 1)} м — подстропильная ферма высотой ${Math.round(girder.h * 1000)} мм${entrySpans > 1 ? ` (×${entrySpans})` : ''}`);

  // ---------- теплица: лёгкие оцинкованные профили ----------
  if (light) for (const m of members) m.profile = ({ post: '40×40×2', beam: '40×20×2', rafter: '40×20×2', chord: '40×20×2', web: '20×20×1.5', hip: '40×20×2', purlin: '20×20×1.5', rail: '20×20×1.5', frame: '40×20×2', handrail: '40×20×2', baluster: '20×20×1.5', brace: '40×20×2', tie: '20×20×1.5', bollard: m.profile, bumper: m.profile } as Record<MemberKind, string>)[m.kind];
  if (light && (span > 4.5 || hHigh > 3.5)) warnings.push('Для теплицы шире 4,5 м или выше 3,5 м лёгкий каркас 40×20 недостаточен — проверьте сечения');

  // ---------- деревянный каркас: сечения бруса и доски вместо профтрубы ----------
  if (wood) {
    const postH = Math.max(hLow, ...members.filter((m) => m.kind === 'post').map((m) => m.b[2]));
    if (postH > 4.5) warnings.push('Деревянные столбы выше 4,5 м — лучше металлический каркас или клеёный брус');
    for (const m of members) {
      const len = dist(m.a, m.b);
      m.profile = ({
        post: postH <= 3.2 ? '150×150' : '200×200', beam: P(m.profile).a >= 120 ? '200×100' : '150×100',
        rafter: len <= 3.2 ? '50×150' : len <= 4.5 ? '50×200' : '100×200', hip: '100×200', chord: '50×200', web: '50×100',
        purlin: slats ? '50×150' : rafterSpacing > 1.0 ? '50×100' : '25×100', rail: '50×100', frame: '100×100', handrail: '50×100', baluster: '50×50', brace: '100×100', tie: '50×100', bollard: m.profile, bumper: m.profile,
      } as Record<MemberKind, string>)[m.kind];
      if (m.kind === 'rafter' && len > 6) warnings.push('Деревянное стропило длиннее 6 м — нужен стык или клеёный брус');
    }
  }

  // ---------- свой размер столба ----------
  const pa = Math.round(Number(p.postA) || 0), pb = Math.round(Number(p.postB) || 0) || pa, pt = Number(p.postT) || 0;
  let postRec = '';
  if (pa >= 20 && pa <= 500 && pb >= 20 && pb <= 500) {
    const posts = members.filter((m) => m.kind === 'post');
    if (posts.length) {
      postRec = posts[0].profile;
      const t = wood ? 0 : clamp(pt || (Math.min(pa, pb) <= 60 ? 2 : Math.min(pa, pb) <= 100 ? 3 : 4), 1, Math.min(pa, pb) / 2 - 1);
      const own = wood ? `${pa}×${pb}` : `${pa}×${pb}×${String(r2(t, 1))}`;
      for (const m of posts) m.profile = own;
      // сравниваем жёсткость по слабой оси с подобранным сечением
      const inertia = (prof: string) => { const q = P(prof); const a = Math.min(q.a, q.b), b2 = Math.max(q.a, q.b); const tt = wood || !(q.t > 0) ? 0 : q.t; return tt ? (b2 * a ** 3 - (b2 - 2 * tt) * (a - 2 * tt) ** 3) / 12 : (b2 * a ** 3) / 12; };
      if (inertia(own) < inertia(postRec) * 0.85) warnings.push(`Столб ${own} слабее подобранного по нагрузке ${postRec} — для высоты и снега проверьте расчётом или возьмите сечение больше`);
      if (own === postRec) postRec = '';
    }
  }

  // =====================================================================
  // Металл: длины по профилям и раскрой
  // =====================================================================
  const byProf = new Map<string, { pieces: number[]; kinds: Set<string> }>();
  for (const m of members) {
    if (m.kind === 'bollard' || m.kind === 'bumper') continue; // считаются отдельными строками
    const g = byProf.get(m.profile) || { pieces: [], kinds: new Set() };
    g.pieces.push(dist(m.a, m.b)); g.kinds.add(m.kind); byProf.set(m.profile, g);
  }
  const KIND: Record<string, string> = { post: 'столбы', beam: 'обвязка', rafter: 'стропила', chord: 'пояса ферм', web: 'решётка ферм', purlin: slats ? 'ламели' : wood ? 'обрешётка' : 'прогоны', rail: 'ригели обшивки', frame: 'рамы проёмов', hip: 'конёк и рёбра', handrail: 'перила', baluster: 'балясины', brace: 'консоли', tie: 'связи жёсткости', bollard: 'колесоотбойники', bumper: 'отбойник' };
  const steel = [...byProf.entries()].map(([profile, g]) => {
    const pr = P(profile);
    const len = g.pieces.reduce((a, b) => a + b, 0);
    const use = [...g.kinds].map((k) => KIND[k]).join(', ');
    if (wood) {
      // пиломатериал: длина 6 м, объём по сечению
      const cut = cutStock(g.pieces, 6);
      const sec = (pr.a * pr.b) / 1e6;
      const isBoard = Math.min(pr.a, pr.b) <= 50;
      return { profile, use, pieces: g.pieces.length, length: r2(len, 1), bars: cut.bars, stock: 6, wastePct: cut.wastePct, kg: r2(cut.bars * 6 * sec * 500, 0), kgNet: r2(len * sec * 500, 0), m2: r2(len * 2 * (pr.a + pr.b) / 1000, 1), pricePerM: Math.round(sec * (isBoard ? PR.board : PR.timber)), vol: r2(cut.bars * 6 * sec, 3), volNet: r2(len * sec, 3), mat: 'wood' as const, isBoard };
    }
    const stock = pr.a >= 80 ? 12 : 6;
    const cut = cutStock(g.pieces, stock);
    const kgm = tubeKgPerM(pr.a, pr.b, pr.t);
    return { profile, use, pieces: g.pieces.length, length: r2(len, 1), bars: cut.bars, stock, wastePct: cut.wastePct, kg: r2(cut.bars * stock * kgm, 0), kgNet: r2(len * kgm, 0), m2: r2(len * tubeM2PerM(pr.a, pr.b), 1), pricePerM: Math.round(kgm * PR.steelKg), vol: 0, volNet: 0, mat: 'steel' as const, isBoard: false };
  }).sort((a, b) => P(b.profile).a * P(b.profile).b - P(a.profile).a * P(a.profile).b);
  const steelKg = steel.reduce((a, s) => a + s.kgNet, 0);
  const woodVol = steel.reduce((a, s) => a + s.volNet, 0);
  // перила считаются отдельной работой «Изготовление перил» — их вес не входит в изготовление/монтаж каркаса
  const railKg = wood ? 0 : members.filter((m) => m.kind === 'handrail' || m.kind === 'baluster').reduce((a, m) => { const pr = P(m.profile); return a + dist(m.a, m.b) * tubeKgPerM(pr.a, pr.b, pr.t); }, 0);
  const frameKg = steelKg - railKg;
  const paintM2 = steel.reduce((a, s) => a + s.m2, 0);

  // =====================================================================
  // Смета: работы (из справочника) и материалы (ориентировочные цены)
  // =====================================================================
  const k = 1 + p.waste / 100;
  const nPosts = postSet.size + openings.filter((o) => o.kind === 'gate').length * 2;
  const noPaint = p.color === 'none';
  const b = new Builder(wood ? 'Деревянный каркас' : 'Металлокаркас');
  if (wood) {
    for (const s of steel) b.mat(`${s.isBoard ? 'Доска' : 'Брус'} ${s.profile} мм, хвоя (${s.use}), 6 м`, s.bars, 'шт', s.pricePerM * 6);
    if (nPosts) b.mat('Опора столба П-образная с анкерами', nPosts, 'шт', 900);
    b.mat('Крепёж каркаса: уголки, пластины, шпильки, саморезы', Math.ceil(woodVol * 4) + 1, 'компл', 1500);
    b.mat('Антисептик для древесины', Math.ceil(paintM2 * 0.3 * k), 'л', 180);
    if (!noPaint) b.mat('Масло-лазурь для дерева (2 слоя)', Math.ceil(paintM2 * 0.2 * k), 'л', 1300);
    b.work('Сборка деревянного каркаса', woodVol);
    b.work('Антисептирование древесины', paintM2);
    if (!noPaint) b.work('Покраска древесины в 2 слоя', paintM2);
  } else {
    for (const s of steel) b.mat(`Труба профильная${light ? ' оцинкованная' : ''} ${s.profile} (${s.use}), хлыст ${s.stock} м`, s.bars, 'шт', Math.round(s.pricePerM * s.stock * (light ? 1.25 : 1)));
    if (nPosts && light && p.base === 'none') b.mat('Опоры-штыри для теплицы (в грунт)', nPosts, 'шт', 250);
    else if (nPosts && ['slab', 'ushp', 'strip', 'none'].includes(p.base)) b.mat('Закладные пластины 300×300×10 с анкерами', nPosts, 'шт', 1400);
    b.work('Изготовление металлоконструкций', frameKg);
    b.work('Монтаж металлоконструкций', frameKg);
    if (!light) {
      if (!noPaint) {
        b.mat(`Грунт-эмаль по металлу 3 в 1, ${p.color}`, Math.ceil(paintM2 * 2 * 0.12 * k / 0.9), 'банка 0,9 кг', 950);
        b.work('Покраска металлоконструкций', paintM2);
      } else b.mat('Холодный цинк / антикор для сварных швов', Math.max(1, Math.ceil(members.length / 60)), 'баллон', 650);
    }
    if (bentLen > 0) b.work('Гибка профильной трубы', bentLen);
  }
  if (hHigh > 3.5) b.work('Автовышка', Math.max(1, Math.ceil(frameKg / 1500)));
  if (steelKg > 1500 && !wood) b.work('Автокран 25 т', 1);
  if (p.attach) {
    b.mat('Анкерные болты М12×150 с шайбами (крепление к стене)', Math.ceil(houseLen / 0.6) + 1 + members.filter((m) => m.kind === 'brace').length * 2, 'шт', 90);
    b.work('Крепление навеса к стене дома анкерами', houseLen);
    warnings.push('Пристенный навес крепится к несущей стене (кирпич, бетон, брус), а не к утеплителю или облицовке фасада. Примыкание к стене — планка с герметиком.');
    b.mat('Планка примыкания к стене + герметик', houseLen * k, 'пог. м', 450);
  }

  b.sec('Кровля');
  // без покраски: листы — оцинкованные, у сэндвича и черепицы покрытие заводское
  const ral = noPaint ? 'оцинкованный' : p.color;
  const ralF = noPaint ? '(заводское покрытие)' : p.color;
  const pg0 = PROF_GRADE[p.profGrade] || PROF_GRADE.C8;
  const pg = { ...pg0, price: Math.round((p.profGrade === 'HC35' ? PR.profHC35 : p.profGrade === 'C20' ? PR.profC20 : PR.profC8) * (noPaint ? 0.88 : 1)) };
  if (p.cover === 'prof' && !arch) {
    const deg = (Math.atan((hHigh - hLow) / (hip ? hs / 2 : p.roof === 'gable' ? span / 2 : span)) * 180) / Math.PI;
    if (deg < pg.minDeg) warnings.push(`Уклон кровли ${r2(deg, 1)}° — для профнастила ${pg.name} нужно не меньше ${pg.minDeg}°, иначе возможны протечки по нахлёстам. Увеличьте перепад высот или возьмите ${pg.name === 'НС-35' ? 'сэндвич-панели' : 'НС-35'}.`);
  }
  if (p.cover === 'prof') {
    if (arch) b.mat(`Профнастил арочный (гнутый) ${ral}`, roofArea * 1.1 * k, 'м²', Math.round(pg.price * 1.25));
    else if (!hip) {
      const sheetsAcross = Math.ceil((lenV + 2 * ov) / pg.use - 1e-9);
      roofPolys.forEach((q) => b.mat(`Профнастил ${pg.name} ${ral} на кровлю, лист ${String(pg.w).replace('.', ',')} × ${String(r2(dist(q[0], q[1]), 2)).replace('.', ',')} м`, sheetsAcross, 'лист', Math.round(pg.w * dist(q[0], q[1]) * pg.price)));
    } else b.mat(`Профнастил ${pg.name} ${ral} на кровлю (с подрезкой под вальмы)`, roofArea * 1.18 * k, 'м²', pg.price);
    b.mat('Саморезы кровельные 4,8×35 в цвет', Math.ceil(roofArea * 7 * k), 'шт', 3);
    b.work('Монтаж профнастила на кровлю', roofArea);
  }
  if (p.cover === 'tile') {
    b.mat(`Металлочерепица ${ralF}${hip ? ' (с подрезкой под вальмы)' : ''}`, roofArea * (hip ? 1.2 : 1.1) * k, 'м²', PR.tile);
    b.mat('Саморезы кровельные 4,8×35 в цвет', Math.ceil(roofArea * 8 * k), 'шт', 3);
    b.work('Монтаж металлочерепицы', roofArea);
  }
  if (p.cover === 'soft') {
    b.mat('Плита OSB-3 12 мм (сплошной настил)', roofArea * 1.1 * k, 'м²', 520);
    b.mat('Подкладочный ковёр', roofArea * 1.15, 'м²', 260);
    b.mat(`Гибкая черепица${hip ? ' (с подрезкой под вальмы)' : ''}`, roofArea * (hip ? 1.15 : 1.08) * k, 'м²', PR.soft);
    b.mat('Мастика битумная и гвозди ершёные', Math.ceil(roofArea / 15), 'компл', 1400);
    b.work('Монтаж сплошного настила OSB', roofArea);
    b.work('Монтаж мягкой кровли', roofArea);
  }
  if (p.cover === 'sandwich') {
    b.mat(`Сэндвич-панель кровельная 150 мм, минвата, ${ralF}`, roofArea * 1.05 * k, 'м²', PR.sandRoof);
    b.mat('Крепёж сэндвич-панелей (саморезы с шайбой 250 мм)', Math.ceil(roofArea * 2.5), 'шт', 18);
    b.work('Монтаж кровельных сэндвич-панелей', roofArea);
  }
  if (p.cover === 'prof' || p.cover === 'tile' || p.cover === 'soft' || p.cover === 'sandwich') {
    if (ridgeLen > 0) b.mat(hip ? 'Конёк и накладки на рёбра вальм + уплотнитель' : 'Конёк + уплотнитель', ridgeLen * k, 'пог. м', 650);
    b.mat(hip ? 'Карнизная планка' : 'Ветровая и карнизная планки', (vergeLen + eaveLen) * k, 'пог. м', 380);
  }
  if (p.cover === 'poly') {
    b.mat('Поликарбонат сотовый 8 мм (2,1×12 м)', Math.ceil(roofArea * (hip ? 1.25 : arch ? 1.1 : 1) * k / 25.2), 'лист', PR.polyRoof);
    b.mat('Профили и термошайбы для поликарбоната', Math.ceil(roofArea / 10), 'компл', 1500);
    b.work('Монтаж поликарбоната на кровлю', roofArea);
  }

  b.sec('Ограждение');
  if (profFixedArea > 0) {
    b.mat(`Профнастил стеновой С-8 ${ral}, лист 1,2 × ${p.profH} м`, Math.ceil(profFixedSheets * k), 'лист', Math.round(1.2 * p.profH * PR.profC8));
  }
  if (profFullArea > 0) {
    b.mat(`Профнастил стеновой С-8 ${ral}${kinkSide('front') || kinkSide('left') ? ' (с подрезкой фронтонов)' : ''}`, profFullArea * 1.1 * k, 'м²', PR.profC8);
    b.mat('Уголки наружные и обрамление проёмов', (4 * Math.max(wallAvgH, 2) + openings.reduce((a, o) => a + 2 * o.h + (o.a1 - o.a0), 0)) * k, 'пог. м', 350);
  }
  if (profArea > 0) {
    b.mat('Саморезы кровельные 4,8×19 в цвет', Math.ceil(profArea * 8 * k), 'шт', 3);
    b.work('Обшивка каркаса профлистом', profArea);
  }
  if (meshArea > 0) {
    b.mat('Сетка сварная 50×50×4 мм (панели), окраска в цвет', meshArea * k, 'м²', PR.mesh);
    b.mat('Крепёж сетки (болты, пластины)', Math.ceil(meshArea / 4), 'компл', 120);
    b.work('Монтаж сетки на каркас', meshArea);
  }
  if (polyWall > 0) {
    b.mat('Поликарбонат сотовый 6 мм (2,1×6 м) для стен', Math.ceil(polyWall * 1.12 * k / 12.6), 'лист', PR.polyWall);
    b.mat('Профили, уплотнитель и термошайбы для стен', Math.ceil(polyWall / 8), 'компл', 1200);
    b.work('Обшивка каркаса поликарбонатом', polyWall);
  }
  if (sandWall > 0) {
    b.mat(`Сэндвич-панель стеновая 100 мм, минвата, ${ralF}`, sandWall * 1.05 * k, 'м²', PR.sandWall);
    b.mat('Доборные элементы и уплотнители сэндвич-панелей', (4 * Math.max(wallAvgH, 2) + 2 * (L + W) + openings.reduce((a, o) => a + 2 * o.h + (o.a1 - o.a0), 0)) * k, 'пог. м', 450);
    b.work('Монтаж стеновых сэндвич-панелей', sandWall);
  }
  if (woodWall > 0) {
    b.mat('Доска строганая 20×140 (планкен), хвоя', woodWall * 1.15 * k, 'м²', 1500);
    b.mat('Антисептик и масло для обшивки', Math.ceil(woodWall * 0.35), 'л', 600);
    b.work('Обшивка каркаса доской (планкен)', woodWall);
  }
  if (railLen > 0) b.work('Изготовление перил', railLen);

  // ворота и двери
  const gate = openings.find((o) => o.kind === 'gate');
  if (gate) {
    b.sec('Ворота и двери');
    const gw = r2(gate.a1 - gate.a0, 2), gh = r2(gate.h, 2);
    if (p.gate === 'sectional') {
      b.mat(`Ворота секционные ${gw} × ${gh} м, ручной привод (комплект)`, 1, 'шт', Math.round(45000 + gw * gh * 7000));
      b.work('Монтаж гаражных ворот секционных', 1);
      b.warn('Электропривод секционных ворот в смету не включён — добавьте при необходимости');
    } else {
      b.mat(`Ворота распашные ${gw} × ${gh} м: каркас створок, профлист ${ral}, петли, засов`, 1, 'компл', Math.round(gw * gh * 3200));
      b.work('Изготовление ворот распашных (работа)', 1);
      b.work('Установка распашных ворот', 1);
    }
  }
  const doors = openings.filter((o) => o.kind === 'door');
  if (doors.length) {
    if (!gate) b.sec('Ворота и двери');
    for (const o of doors) {
      const sz = `${Math.round((o.a1 - o.a0) * 1000)}×${Math.round(o.h * 1000)}`;
      if (light) {
        b.mat(`Дверь теплицы ${sz} из профиля с поликарбонатом, петли, ручка`, 1, 'шт', 4500);
        b.mat('Форточка теплицы с ручкой', 2, 'шт', 1800);
        b.work('Монтаж калитки', 1);
      } else if (wood) {
        b.mat(`Дверь деревянная уличная ${sz} с коробкой и фурнитурой`, 1, 'шт', Math.round(12000 * Math.max(1, ((o.a1 - o.a0) * o.h) / 1.85)));
        b.work('Монтаж межкомнатной двери', 1);
      } else {
        b.mat(`Дверь металлическая уличная ${sz}`, 1, 'шт', Math.round(18000 * Math.max(1, ((o.a1 - o.a0) * o.h) / 1.85)));
        b.work('Монтаж входной металлической двери', 1);
      }
    }
  }
  const wins = openings.filter((o) => o.kind === 'window');
  if (wins.length) {
    b.sec('Окна');
    for (const o of wins) {
      const ww = o.a1 - o.a0, wh = o.h - (o.z0 ?? 0), a = ww * wh;
      b.mat(`Окно ПВХ ${Math.round(ww * 1000)}×${Math.round(wh * 1000)}, двухкамерный стеклопакет, с открыванием`, 1, 'шт', Math.round(4500 + a * 6500));
      b.work('Монтаж пластикового окна', r2(a, 2));
      b.mat(`Отлив и подоконник ${Math.round(ww * 1000)} мм, пена, лента ПСУЛ`, 1, 'компл', Math.round(1200 + ww * 1300));
    }
    b.work('Монтаж подоконника', wins.length);
  }

  if (p.insulate) {
    b.sec('Утепление');
    const wallIns = profFullArea + profFixedArea + woodWall;
    const roofIns = p.cover === 'sandwich' || p.cover === 'poly' ? 0 : roofArea;
    if (wallIns + roofIns > 0) {
      b.mat('Минвата 100 мм (плиты)', (wallIns + roofIns) * 1.05 * k, 'м²', 380);
      b.mat('Пароизоляция', (wallIns + roofIns) * 1.15, 'м²', 25);
      b.work('Утепление стен изнутри', wallIns);
      b.work('Утепление кровли', roofIns);
      b.work('Монтаж пароизоляции', wallIns + roofIns);
    }
    b.warn('Утепление посчитано без внутренней обшивки (ОСБ, вагонка или профлист) — добавьте её отдельно');
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
    else b.mat('Арматура А500 Ø12', bars * layers * 1.05 * 0.888 / 1000, 'т', PR.rebar);
    b.mat('Вязальная проволока / хомуты, фиксаторы', Math.ceil(slabArea / 20), 'компл', 900);
    b.work('Армирование сеткой', slabArea * layers);
    b.mat('Бетон М300 с доставкой', slabArea * p.slabT * 1.03, 'м³', PR.concrete);
    b.work('Бетонирование плиты/площадки', slabArea * p.slabT);
    b.work('Монтаж закладных и гильз', nPosts);
    b.sum('Плита', slabArea, 'м²').sum('Бетон', slabArea * p.slabT, 'м³').sum('Выемка грунта', digArea * depth, 'м³');
  }
  if (p.base === 'piles') {
    b.sec('Основание (сваи)');
    const n = nPosts;
    b.work('Бурение под сваи ТИСЭ', n); b.work('Бетонирование столбов', n);
    b.mat('Бетон М300 на сваи Ø300×1,5 м', n * Math.PI * 0.15 ** 2 * 1.5 * 1.05, 'м³', PR.concrete);
    b.mat('Арматура А500 Ø12 для свай', n * 4 * 1.8 * 0.888 / 1000 * 1.05, 'т', PR.rebar);
  }
  if (p.base === 'deck') {
    b.sec('Основание (настил на сваях)');
    const nx = Math.ceil(L / 2 - 1e-9) + 1, ny = Math.ceil(W / 2 - 1e-9) + 1;
    const piles = nPosts + Math.max(0, nx - 2) * Math.max(0, ny - 2);
    const deckArea = L * W;
    const lagRows = Math.ceil(W / 0.5 - 1e-9) + 1;
    b.mat('Свая винтовая 89×2000 с оголовком', piles, 'шт', 2900);
    b.work('Монтаж винтовых свай', piles);
    b.mat('Брус для лаг 50×150, антисептированный', lagRows * L * 0.05 * 0.15 * 1.1 * k, 'м³', 25000);
    b.mat('Доска террасная лиственница 28×140', deckArea * 1.1 * k, 'м²', PR.deck);
    b.mat('Крепёж террасной доски (кляймеры, саморезы)', Math.ceil(deckArea / 5), 'компл', 600);
    b.mat('Масло для террасы', Math.ceil(deckArea / 15), 'л', 1200);
    b.work('Монтаж террасной доски', deckArea);
    b.sum('Настил', deckArea, 'м²').sum('Свай', piles, 'шт');
  }
  if (p.base === 'ushp') {
    b.sec('Фундамент (УШП)');
    const per = 2 * (sx + sy);
    const depth = p.slabT + p.eps + p.sand;
    const ribs = per * 0.3 * 0.2 + (Math.ceil(sx / 3) - 1) * sy * 0.25 * 0.15; // контурные и внутренние рёбра
    const vol = slabArea * p.slabT + ribs;
    const epsArea = slabArea + per * 0.5;
    b.work('Разработка грунта экскаватором', slabArea * depth); b.work('Вывоз грунта', slabArea * depth * 1.2); b.work('Экскаватор-погрузчик', 1);
    b.work('Укладка геотекстиля', slabArea * 1.1); b.mat('Геотекстиль 200 г/м²', slabArea * 1.25, 'м²', 45);
    b.work('Устройство песчаной подушки с уплотнением', slabArea * p.sand); b.mat('Песок крупный/средний', slabArea * p.sand * 1.2, 'м³', 1100);
    b.work('Утепление фундамента ЭППС', epsArea); b.mat(`ЭППС ${Math.round(p.eps * 1000)} мм (утепление плиты и Г-блоки по контуру)`, epsArea * 1.05, 'м²', Math.round(650 * p.eps / 0.1));
    b.work('Устройство опалубки', per * (p.slabT + 0.15));
    b.mat('Арматура А500 Ø12 (сетки и рёбра)', ((Math.ceil(sy / 0.2) + 1) * sx + (Math.ceil(sx / 0.2) + 1) * sy) * 1.1 * 0.888 / 1000 + per * 4 * 1.1 * 0.888 / 1000, 'т', PR.rebar);
    b.mat('Фиксаторы, вязальная проволока', Math.ceil(slabArea / 15), 'компл', 900);
    b.work('Армирование сеткой', slabArea * 2);
    b.mat('Бетон М300 с доставкой', vol * 1.03, 'м³', PR.concrete);
    b.work('Бетонирование плиты/площадки', vol);
    if (vol > 8) b.work('Подача бетона бетононасосом', 1);
    if (nPosts) b.work('Монтаж закладных и гильз', nPosts);
    b.warn('УШП посчитана без коммуникаций, дренажа и тёплого пола — добавьте их отдельно');
    b.sum('Плита УШП', slabArea, 'м²').sum('Бетон', vol, 'м³');
  }
  if (p.base === 'strip') {
    b.sec('Фундамент (ленточный)');
    const per = 2 * (L + W);
    const w = p.stripW, h = p.stripD, below = Math.max(0.2, h - 0.2);
    const vol = per * w * h;
    b.work('Разработка грунта экскаватором', per * (w + 0.4) * (below + 0.15));
    b.work('Устройство песчаной подушки с уплотнением', per * (w + 0.2) * 0.15); b.mat('Песок крупный/средний', per * (w + 0.2) * 0.15 * 1.2, 'м³', 1100);
    b.mat('Доска опалубки 25×150', 2 * per * h * 0.025 * 0.6, 'м³', 17000);
    b.mat('Арматура А500 Ø12 (4 стержня)', per * 4 * 1.12 * 0.888 / 1000, 'т', PR.rebar);
    b.mat('Арматура А240 Ø8 (хомуты через 400 мм)', (per / 0.4) * (2 * (w - 0.1) + 2 * (h - 0.1)) * 0.395 / 1000, 'т', 70000);
    b.mat('Бетон М300 с доставкой', vol * 1.03, 'м³', PR.concrete);
    b.work('Ленточный фундамент под ключ (без материала)', vol);
    b.work('Гидроизоляция фундамента обмазочная', per * (h + w)); b.mat('Мастика битумная гидроизоляционная', per * (h + w) * 1.5, 'кг', 220);
    b.work('Обратная засыпка грунтом', per * 0.4 * below);
    if (nPosts) b.work('Монтаж закладных и гильз', nPosts);
    b.warn('Ленточный фундамент: пол внутри (плита или стяжка) в смету не включён');
    b.sum('Лента', per, 'пог. м').sum('Бетон', vol, 'м³');
  }
  if (p.base === 'screw') {
    b.sec('Фундамент (винтовые сваи)');
    const n = Math.max(nPosts, 4);
    b.mat('Свая винтовая 108×2500 с оголовком', n, 'шт', 3800);
    b.work('Монтаж винтовых свай', n);
    b.sum('Свай', n, 'шт');
  }
  if (p.base === 'paving') {
    b.sec('Основание (тротуарная плитка)');
    const per = 2 * (sx + sy);
    b.work('Разработка грунта экскаватором', slabArea * 0.35); b.work('Вывоз грунта', slabArea * 0.35 * 1.2);
    b.mat('Геотекстиль 200 г/м²', slabArea * 1.15, 'м²', 45);
    b.mat('Щебень фр. 20–40', slabArea * 0.2 * 1.25, 'м³', 2300);
    b.mat('Цементно-песчаная смесь для подстилающего слоя', slabArea * 0.05 * 1.2, 'м³', 2800);
    b.mat('Плитка тротуарная 60 мм', slabArea * 1.05 * k, 'м²', PR.paving);
    b.mat('Бордюр садовый 1000×200×80', Math.ceil(per * 1.02), 'шт', 280);
    b.work('Укладка тротуарной плитки (с основанием)', slabArea);
    b.work('Монтаж бордюра', per);
    if (nPosts) {
      b.work('Бурение под сваи ТИСЭ', nPosts); b.work('Бетонирование столбов', nPosts);
      b.mat('Бетон М300 под столбы Ø300×1,2 м', nPosts * Math.PI * 0.15 ** 2 * 1.2 * 1.05, 'м³', PR.concrete);
    }
    b.sum('Плитка', slabArea, 'м²');
  }
  const hardRoof = p.cover === 'prof' || p.cover === 'tile' || p.cover === 'soft' || p.cover === 'sandwich';
  const gutterOk = p.gutter && p.cover !== 'none' && !slats;
  if (gutterOk || (p.snowGuard && hardRoof)) {
    b.sec('Водосток и снегозадержание');
    if (gutterOk) {
      const pipes = (eaveLen > lenV + 2 * ov + 0.1 ? 2 : 1) * Math.max(2, Math.ceil(lenV / 10) + 1);
      b.mat('Водосточная система: желоб, крюки, воронки, колена', eaveLen * k, 'пог. м', 950);
      b.mat('Труба водосточная', pipes * hLow * k, 'пог. м', 650);
      b.work('Монтаж водосточной системы', eaveLen + pipes * hLow);
    }
    if (p.snowGuard && hardRoof) {
      const len = p.roof === 'single' ? lenV + 2 * ov : eaveLen;
      b.mat('Снегозадержатель трубчатый 3 м', Math.ceil(len / 3), 'шт', 2200);
      b.work('Монтаж снегозадержателей', len);
    }
  }
  if (p.lights > 0) {
    b.sec('Освещение');
    const n = Math.round(p.lights);
    const cable = Math.ceil(n * 3 + L + W + 10);
    b.mat('Светильник уличный LED 20 Вт IP65', n, 'шт', 2500);
    b.mat('Кабель ВВГнг-LS 3×1,5', cable, 'м', 70);
    b.mat('Гофра ПНД 20 мм с клипсами', cable, 'м', 25);
    b.mat('Автомат 10 А и выключатель уличный', 1, 'компл', 1500);
    b.work('Монтаж светильника', n);
    b.work('Прокладка кабеля в гофре по стене', cable);
    b.work('Монтаж автомата в щит', 1);
  }
  if (bollards || bumperLen || curbLen) {
    b.sec('Бордюр и отбойники');
    if (curbLen) {
      b.mat('Бордюр дорожный БР 100.30.15', Math.ceil(curbLen * 1.02), 'шт', PR.curb);
      b.mat('Бетон М200 под бордюр', curbLen * 0.05, 'м³', PR.concrete);
      b.work('Монтаж бордюра', curbLen);
    }
    if (bollards) {
      b.mat('Колесоотбойник: труба Ø108×4, высота 1,0 м, окраска жёлто-чёрная', bollards, 'шт', 3500);
      b.work('Бетонирование столбов', bollards);
    }
    if (bumperLen) {
      b.mat('Отбойник для контейнеров: труба 80×80 на стойках, h 0,45 м', bumperLen * k, 'пог. м', 2200);
      b.work('Монтаж металлоконструкций', bumperLen * 9);
    }
  }
  b.sec('Прочее'); b.work('Доставка материалов по городу', Math.max(1, Math.ceil(steelKg / 3000) + 1));

  b.summary.unshift(
    { label: 'Размер в плане', value: r2(L * W, 1), unit: `м² (${L}×${W})` },
    { label: wood ? 'Пиломатериал' : 'Металл', value: wood ? r2(woodVol, 2) : r2(steelKg, 0), unit: wood ? 'м³' : 'кг' },
    { label: slats ? 'Площадь перголы' : 'Кровля', value: r2(roofArea, 1), unit: 'м²' },
    { label: 'Профлист на стенах', value: r2(profArea, 1), unit: 'м²' },
    { label: 'Поликарбонат на стенах', value: r2(polyWall, 1), unit: 'м²' },
    { label: 'Сэндвич-панели на стенах', value: r2(sandWall, 1), unit: 'м²' },
    { label: 'Обшивка доской', value: r2(woodWall, 1), unit: 'м²' },
    { label: 'Сетка', value: r2(meshArea, 1), unit: 'м²' },
    { label: 'Перила', value: r2(railLen, 1), unit: 'пог. м' },
    { label: 'Столбов', value: nPosts, unit: 'шт' },
    { label: p.contType === '8' ? 'Бункеров' : 'Контейнеров', value: contPlaced, unit: `шт по ${p.contType} м³` },
    { label: 'Связей жёсткости', value: tieCount, unit: 'шт' },
  );
  if (slats) warnings.push('Пергола: ламели не защищают от дождя — при необходимости добавьте поликарбонат поверх');
  if (midRows) warnings.push(`Многопролётный навес: ${midRows + 1} пролёта по ${r2(span / (midRows + 1), 2)} м, учитывайте промежуточные столбы в схеме проезда и парковки`);
  if (truss) warnings.push(`Пролёт ${r2(slopeLen, 1)} м — стропила заменены фермами (пояса ${chordProf}, решётка ${webProf})`);
  warnings.push('Эскиз и расчёт материалов, а не расчёт прочности. Сечения подобраны по типовым таблицам — для ответственных объектов проверьте у конструктора.');

  const profOf = (...ks: MemberKind[]) => members.find((m) => ks.includes(m.kind) && !girderSet.has(m))?.profile;
  return {
    params: p, members, panels, steel, entry, girder, manualOps: manual, lines: b.lines, summary: b.summary.filter((s) => s.value > 0), warnings: [...warnings, ...b.warnings], openings, topAt,
    info: { wood, woodVol: r2(woodVol, 2), arch, center, midRows, slats, span: hip ? hs : span, lenV: hip ? hl : lenV, alongX, truss, rafterProf: profOf('chord', 'rafter') || rafterProf, purProf: profOf('purlin') || purProf, beamProf: profOf('beam') || beamProf, postProf: profOf('post') || postProf, postRec, noPaint: p.color === 'none', rafters: rafterCount, rafterSpacing: r2(rafterSpacing), purlins: purlinRows, roofArea: r2(roofArea, 1), slabArea: r2(slabArea, 1), posts: nPosts, hHigh, hLow, steelKg: r2(steelKg, 0) },
  };
}
export type CanopyResult = ReturnType<typeof buildCanopy>;
