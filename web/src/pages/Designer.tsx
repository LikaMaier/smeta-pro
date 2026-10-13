import React, { useEffect, useMemo, useState } from 'react';
import { get, post, put, del, patch } from '../api';
import { DESIGN_PRICES, DESIGN_PRICE_LABELS } from '../../../shared/design/prices';
import { Chips, Field, Fold, NumInput, Sheet, useDebounced, useLoad, useToast } from '../components/ui';
import { normName } from '../../../shared/names';
import { makeVariants } from '../../../shared/design/variants';
import CalcResult from '../components/CalcResult';
import OpeningsEditor from '../components/OpeningsEditor';
import PostSize from '../components/PostSize';
import { Viewer, Drawings } from '../components/Design3D';
import { n, rub0, parseNum } from '../format';
import { haptic, confirmDialog, tg } from '../tg';
import { useMe } from '../App';
import { buildCanopy, CANOPY_DEFAULT, OBJ_LABEL, type CanopyParams, type ObjKind, type Side, type Wall } from '../../../shared/design/canopy';
import { RAL, render3d, view3dToSvg } from '../../../shared/design/render';
import { CITIES, snowByCity, snowLabel } from '../../../shared/design/snow';
import { WALL_LABEL } from '../../../shared/design/report';
import { PRESETS } from '../../../shared/design/presets';

/**
 * ИИ-проектировщик (навесы, площадки ТКО): описание словами или параметры → 3D, чертежи с размерами,
 * раскрой металла и смета с работами и материалами. ИИ только заполняет параметры, геометрию считает программа.
 */
// пресет задаёт только своё — остальное из типовых значений (ворота, утепление и т. п. выключены)
const BLANK: Partial<CanopyParams> = { block: 0, blockAt: 'left', blockWall: 'prof_full', ties: 'auto', curb: false, bumpers: false, entry: 'none', containers: 0, contType: '1.1', profGrade: 'C8', layout: 'perimeter', midRows: 0, stripW: 0.4, stripD: 0.7, eps: 0.1, attach: false, frame: 'steel', gate: 'none', door: false, ops: null, lining: undefined, floorOn: undefined, postA: undefined, postB: undefined, postT: undefined, insulate: false, gutter: false, snowGuard: false, lights: 0, snow: 3, waste: 5, profH: 2, slabT: 0.15, sand: 0.2, gravel: 0.2, slabOver: 0, rebar: 'composite' };
const full = (p: Partial<CanopyParams>): CanopyParams => ({ ...CANOPY_DEFAULT, ...BLANK, ...p, walls: { ...CANOPY_DEFAULT.walls, ...(p.walls || {}) } });
const NUMS = ['L', 'W', 'hHigh', 'hLow', 'postStep', 'overhang', 'profH', 'gateW', 'gateH', 'slabT', 'sand', 'gravel', 'slabOver', 'snow', 'waste', 'lights', 'stripW', 'stripD', 'eps', 'midRows', 'containers', 'block'] as const;
type NumKey = (typeof NUMS)[number];
const MM = new Set<NumKey>(['slabT', 'sand', 'gravel', 'stripW', 'stripD', 'eps']); // в форме — в миллиметрах
const toStr = (p: CanopyParams) => Object.fromEntries(NUMS.map((k) => [k, String(MM.has(k) ? Math.round(p[k] * 1000) : p[k])])) as Record<NumKey, string>;
const SIDES: { s: Side; label: string }[] = [{ s: 'front', label: 'Спереди (въезд)' }, { s: 'back', label: 'Сзади' }, { s: 'left', label: 'Слева' }, { s: 'right', label: 'Справа' }];
const SIDE_SHORT: Record<Side, string> = { front: 'спереди', back: 'сзади', left: 'слева', right: 'справа' };
const DRAFT = 'smeta_designer_draft';
const KIND_ICON: Record<ObjKind, string> = { canopy: '⛱', tko: '🗑', lean: '🏠', visor: '🚪', gazebo: '🛖', garage: '🚗', greenhouse: '🌱', woodshed: '🪵' };

type Tab = 'params' | 'draw' | 'steel' | 'var' | 'est';

export default function Designer() {
  const toast = useToast();
  const { me, refreshMe } = useMe();
  const saved0 = useMemo(() => {
    // ?preset=bytovka — из мастера «Новая смета»: открываем выбранную постройку
    const pid = new URLSearchParams(location.search).get('preset');
    const pr = pid ? PRESETS.find((x) => x.id === pid) : null;
    if (pr) return { p: pr.p, title: pr.title, id: null };
    try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch { return null; }
  }, []);
  const [base, setBase] = useState<CanopyParams>(() => full(saved0?.p || CANOPY_DEFAULT));
  const [nums, setNums] = useState<Record<NumKey, string>>(() => toStr(full(saved0?.p || CANOPY_DEFAULT)));
  const [title, setTitle] = useState<string>(saved0?.title || PRESETS.find((x) => x.id === 'tko')!.title);
  const [designId, setDesignId] = useState<string | null>(saved0?.id || null);
  const [tab, setTab] = useState<Tab>('params');
  const [text, setText] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [busy, setBusy] = useState<'' | 'ai' | 'pdf' | 'save' | 'share'>('');
  const [listOpen, setListOpen] = useState(false);
  const [slopeIn, setSlopeIn] = useState('');
  const [pricesOpen, setPricesOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const savePrices = async (reset = false) => {
    const out: Record<string, number> = {};
    if (!reset) for (const [k, v] of Object.entries(priceDraft)) { const x = parseNum(v); if (x > 0) out[k] = x; }
    try { await patch('/me', { designPrices: Object.keys(out).length ? out : null }); await refreshMe(); setPricesOpen(false); haptic('success'); toast(reset ? 'Вернули цены по умолчанию' : 'Цены сохранены — все проекты пересчитаны'); }
    catch (e: any) { toast(e.message, true); }
  };
  const [showVariants, setShowVariants] = useState<boolean>(!!saved0?.sv);
  const [list, setList] = useState<any[] | null>(null);

  const params: CanopyParams = useMemo(() => {
    const p: any = { ...base, walls: { ...base.walls } };
    for (const k of NUMS) { const v = parseNum(nums[k]); if (Number.isFinite(v) && nums[k].trim() !== '') p[k] = MM.has(k) ? v / 1000 : v; }
    return p;
  }, [base, nums]);
  const dp = useDebounced(params, 250);
  const ownPrices = (me as any).designPrices || null;
  const res = useMemo(() => buildCanopy(dp, ownPrices), [dp, ownPrices]);
  const cityHint = (() => {
    const c = snowByCity(base.city);
    if (c) return `${c.name}: снеговой район ${snowLabel(c.region)} — подставлен. Ориентировочно по СП 20.13330, границы районов проверяйте по карте.`;
    return base.city ? 'Города нет в справочнике — укажите снеговой район вручную' : 'Снеговой район подставится сам';
  })();
  const errors = useMemo(() => {
    const e: string[] = [];
    if (params.L < 1 || params.L > 60 || params.W < 1 || params.W > 60) e.push('Размеры в плане — от 1 до 60 м');
    if (params.hHigh < 1.2 || params.hHigh > 12 || params.hLow < 1.2 || params.hLow > 12) e.push('Высоты — от 1,2 до 12 м');
    if (params.lights < 0 || params.lights > 50) e.push('Светильников — от 0 до 50');
    if (params.midRows < 0 || params.midRows > 6) e.push('Промежуточных рядов столбов — от 0 до 6');
    if (params.snow < 1 || params.snow > 8) e.push('Снеговой район — от 1 до 8');
    if (params.base === 'strip' && (params.stripW < 0.2 || params.stripW > 1 || params.stripD < 0.3 || params.stripD > 2)) e.push('Лента: ширина 200–1000 мм, высота 300–2000 мм');
    if (params.frame === 'wood' ? params.postStep < 0.4 || params.postStep > 6 : params.postStep < 1.5 || params.postStep > 6) e.push(params.frame === 'wood' ? 'Шаг стоек — от 0,4 до 6 м' : 'Шаг столбов — от 1,5 до 6 м');
    return e;
  }, [params]);

  useEffect(() => { try { localStorage.setItem(DRAFT, JSON.stringify({ p: params, title, id: designId, sv: showVariants })); } catch { /* */ } }, [params, title, designId, showVariants]);

  const apply = (p0: Partial<CanopyParams> & { _variants?: any }, t?: string, id: string | null = null) => {
    const { _variants, ...p } = p0 as any;
    if (id) setShowVariants(!!_variants);
    const f = full(p); setBase(f); setNums(toStr(f)); if (t) setTitle(t); setDesignId(id); setQuestions([]);
  };
  const setB = (patch: Partial<CanopyParams>) => setBase((b) => ({ ...b, ...patch }));
  const setWall = (s: Side, w: Wall) => setBase((b) => ({ ...b, walls: { ...b.walls, [s]: w } }));
  const num = (k: NumKey, label: string, unit: string, hint?: string) => (
    <Field label={label} hint={hint}><NumInput value={nums[k]} onChange={(v) => setNums((x) => ({ ...x, [k]: v }))} unit={unit} aria-label={label} /></Field>
  );

  const parse = async () => {
    if (text.trim().length < 3) return toast('Опишите навес: размеры, высоты, кровлю, стены, основание', true);
    setBusy('ai');
    try {
      const r = await post('/designer/parse', { text, params });
      apply(r.params, r.title, designId); setQuestions(r.questions || []); haptic('success');
      toast('Параметры заполнены — проверьте и поправьте при необходимости');
    } catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setBusy(''); }
  };
  // три варианта (эконом / стандарт / премиум) с ценами из справочника прораба
  const items = useLoad(() => get<any[]>('/items').catch(() => []), []);
  const priceMap = useMemo(() => new Map<string, number>((items.data || []).map((i: any) => [normName(i.name), Number(i.price)])), [items.data]);
  const variants = useMemo(() => (tab === 'var' || showVariants ? makeVariants(dp).map((v) => {
    const r = buildCanopy(v.params, ownPrices);
    return { ...v, res: r, total: Math.round(r.lines.reduce((a, l: any) => a + l.qty * (priceMap.get(normName(l.name)) ?? l.price ?? 0), 0)) };
  }) : []), [dp, tab, showVariants, priceMap, ownPrices]);
  const withVariants = () => (showVariants && variants.length ? { ...params, _variants: variants.map(({ id, label, changes, total, params: vp }) => ({ id, label, changes, total, params: vp })) } : params);
  // сохранить (или обновить) проект и вернуть его id
  const persist = async (): Promise<string> => {
    const body = { title, params: withVariants() };
    try {
      const d = designId ? await put(`/designs/${designId}`, body) : await post('/designs', { ...body, kind: 'canopy' });
      setDesignId(d.id); return d.id;
    } catch (e: any) {
      if (e.status !== 404) throw e;
      const d = await post('/designs', { ...body, kind: 'canopy' }); setDesignId(d.id); return d.id;
    }
  };
  const save = async () => {
    setBusy('save');
    try { await persist(); haptic('success'); toast('Проект сохранён'); }
    catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setBusy(''); }
  };
  const [share, setShare] = useState<{ url: string | null; viewedAt?: string | null } | null>(null);
  const openShare = async () => {
    if (errors.length) return toast(errors[0], true);
    setBusy('share');
    try { const id = await persist(); setShare(await post(`/designs/${id}/share`)); haptic('success'); }
    catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setBusy(''); }
  };
  const shareText = `${title}: 3D-проект, чертежи и параметры. Покрутите модель пальцем:`;
  const sendTg = () => { if (!share?.url) return; const u = `https://t.me/share/url?url=${encodeURIComponent(share.url)}&text=${encodeURIComponent(shareText)}`; if (tg?.openTelegramLink) tg.openTelegramLink(u); else window.open(u, '_blank'); };
  const copy = async () => { if (!share?.url) return; try { await navigator.clipboard.writeText(`${shareText}\n${share.url}`); haptic('success'); toast('Скопировано — вставьте в WhatsApp, SMS или почту'); } catch { toast(share.url); } };
  const linkToEstimate = async (estimateId: string) => { const id = await persist(); await post(`/designs/${id}/link`, { estimateId }); };
  const sendPdf = async () => {
    if (errors.length) return toast(errors[0], true);
    setBusy('pdf');
    try { await post('/designer/pdf/send', { title, params }); haptic('success'); toast('PDF эскизного проекта отправлен в чат с ботом'); }
    catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setBusy(''); }
  };
  const openList = async () => { setListOpen(true); setList(null); try { setList(await get('/designs', { kind: 'canopy' })); } catch (e: any) { toast(e.message, true); setList([]); } };
  const remove = async (d: any) => {
    if (!(await confirmDialog(`Удалить проект «${d.title}»?`))) return;
    await del(`/designs/${d.id}`); setList((l) => (l || []).filter((x) => x.id !== d.id)); if (d.id === designId) setDesignId(null);
  };

  return (
    <>
      {!me.aiAvailable ? (
        <div className="dz-warn" style={{ borderColor: 'var(--gold)' }}>🤖 Скоро: опишете объект словами — ИИ сам заполнит параметры. Пока выберите тип и типовой вариант ниже.</div>
      ) : (
      <div className="panel" style={{ padding: 12 }}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <b>Опишите словами</b>
          <span className="xs muted">{me.aiAvailable ? 'ИИ заполнит параметры' : 'ИИ не подключён — заполните ниже'}</span>
        </div>
        <textarea className="input textarea" style={{ minHeight: 84 }} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Например: гараж 6 на 6, двускатная крыша, конёк 3,6 м, стены 2,8 м, профлист, секционные ворота 3×2,5 и дверь, плита 150 мм. Или: беседка 4×3 с четырёхскатной крышей из металлочерепицы, перила с трёх сторон, пол на винтовых сваях" />
        <button className="btn primary block" style={{ marginTop: 8 }} disabled={busy === 'ai'} onClick={parse}>{busy === 'ai' ? 'Разбираю…' : '✨ Заполнить параметры по описанию'}</button>
        {questions.length > 0 && <div className="xs" style={{ marginTop: 8 }}><b>Уточните:</b>{questions.map((q, i) => <div key={i}>• {q}</div>)}</div>}
      </div>
      )}

      <div className="dz-kinds">
        {(Object.keys(OBJ_LABEL) as ObjKind[]).map((k) => (
          <button key={k} className={`dz-kind ${base.kind === k ? 'on' : ''}`} onClick={() => { const pr = PRESETS.find((x) => x.kind === k)!; apply(pr.p, pr.title); }}>
            <span aria-hidden="true">{KIND_ICON[k]}</span>{OBJ_LABEL[k]}
          </button>
        ))}
      </div>
      {PRESETS.filter((x) => x.kind === base.kind).length > 1 && (
        <div className="row wrap" style={{ gap: 6, margin: '0 0 8px' }}>
          <span className="xs muted">Типовые:</span>
          {PRESETS.filter((x) => x.kind === base.kind).map((pr) => <button key={pr.id} className="chip" onClick={() => apply(pr.p, pr.title)}>{pr.label}</button>)}
        </div>
      )}

      <Field label="Название проекта"><input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></Field>

      <Viewer res={res} />
      <div className="dz-sum">
        {res.summary.slice(0, 6).map((s) => <div key={s.label}><span className="xs muted">{s.label}</span><b className="num">{n(s.value, 1)} <small>{s.unit}</small></b></div>)}
      </div>
      {errors.map((e) => <div key={e} className="dz-warn bad">{e}</div>)}

      <Chips<Tab> value={tab} onChange={setTab} options={[{ value: 'params', label: 'Параметры' }, { value: 'draw', label: 'Чертежи' }, { value: 'steel', label: res.info.wood ? 'Пиломатериал' : 'Металл' }, { value: 'var', label: 'Варианты' }, { value: 'est', label: 'Смета' }]} />

      {tab === 'params' && (
        <div className="stack">
          <Fold id="dz-size" title="Размеры и форма крыши" summary={`${params.L}×${params.W} м, ${({single:'односкатная',gable:'двускатная',hip:'четырёхскатная',arch:'арка'} as any)[base.roof]}`} defaultOpen>
          <div className="grid2">{num('L', 'Длина (по фасаду)', 'м')}{num('W', 'Глубина', 'м')}</div>
          <Field label="Кровля"><Chips value={base.roof} onChange={(v) => setB({ roof: v, ...(v !== 'single' ? { attach: false } : {}), ...(v === 'arch' ? { frame: 'steel' } : {}) })} options={[{ value: 'single', label: 'Односкатная' }, { value: 'gable', label: 'Двускатная' }, { value: 'hip', label: 'Четырёхскатная' }, { value: 'arch', label: 'Арочная' }]} /></Field>
          <div className="grid2">
            {num('hHigh', base.roof === 'single' ? 'Высокая сторона' : 'Высота в коньке', 'м')}
            {num('hLow', base.roof === 'single' ? 'Низкая сторона' : 'Высота карниза', 'м')}
          </div>
          {base.roof !== 'arch' && (() => {
            const run = base.roof === 'hip' ? Math.min(params.L, params.W) / 2 : base.roof === 'gable' ? res.info.span / 2 : res.info.span;
            const deg = (Math.atan(Math.max(0, params.hHigh - params.hLow) / Math.max(0.1, run)) * 180) / Math.PI;
            const setDeg = (v: string) => { const d = parseNum(v); if (!(d >= 0 && d < 60)) return; const h = params.hLow + Math.tan((d * Math.PI) / 180) * run; setNums((x) => ({ ...x, hHigh: String(Math.round(h * 100) / 100) })); };
            return (
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span className="small muted grow">Уклон: <b>{n(deg, 1)}°</b> ({n(Math.tan((deg * Math.PI) / 180) * 100, 0)}%)</span>
                <span className="small muted">задать, °</span>
                <div style={{ width: 96 }}><NumInput value={slopeIn} placeholder={n(deg, 1)} onChange={setSlopeIn} onBlur={() => { if (slopeIn) { setDeg(slopeIn); setSlopeIn(''); } }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label="Уклон, градусы" /></div>
              </div>
            );
          })()}
          <Field label={base.roof === 'single' ? 'Где высокая сторона' : 'Скаты на стороны'}>
            {base.roof === 'hip' ? <p className="xs muted" style={{ margin: 0 }}>Конёк — вдоль длинной стороны; при квадрате кровля шатровая</p>
              : base.roof === 'arch' ? <Chips value={base.highSide === 'left' || base.highSide === 'right' ? 'left' : 'front'} onChange={(v) => setB({ highSide: v as Side })} options={[{ value: 'left', label: 'арки поперёк фасада' }, { value: 'front', label: 'арки вдоль фасада' }]} />
              : base.roof === 'single'
              ? <Chips value={base.highSide} onChange={(v) => setB({ highSide: v })} options={SIDES.map((x) => ({ value: x.s, label: SIDE_SHORT[x.s] }))} />
              : <Chips value={base.highSide === 'left' || base.highSide === 'right' ? 'left' : 'front'} onChange={(v) => setB({ highSide: v as Side })} options={[{ value: 'front', label: 'спереди и сзади' }, { value: 'left', label: 'слева и справа' }]} />}
          </Field>
          {base.roof === 'single' && base.kind !== 'visor' && (
            <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={base.attach} onChange={(e) => setB({ attach: e.target.checked })} />Крепится к стене дома высокой стороной ({SIDE_SHORT[base.highSide]}) — без столбов у стены</label>
          )}
          {base.kind === 'visor' && <p className="xs muted" style={{ margin: 0 }}>Козырёк крепится к стене на консолях (подкосах), без столбов</p>}
          </Fold><Fold id="dz-posts" title="Столбы" summary={`${res.info.posts} шт, шаг ${params.postStep} м, ${res.info.postProf}`}>
          {!['visor', 'lean'].includes(base.kind) && base.roof !== 'hip' && !base.attach && (
            <Field label="Расстановка столбов">
              <Chips value={base.layout} onChange={(v) => setB({ layout: v })} options={[{ value: 'perimeter', label: 'По периметру' }, { value: 'center', label: 'Один ряд по центру (консольный)' }]} />
            </Field>
          )}
          {base.layout === 'perimeter' && base.kind !== 'visor' && (
            <Field label="Въезд без столбов" hint={base.kind === 'tko' ? 'Мусоровоз заезжает с этой стороны: промежуточных столбов нет, над проёмом — ферма' : 'Промежуточные столбы на этой стороне убираются, над проёмом — балка или ферма'}>
              <Chips value={base.entry} onChange={(v) => setB({ entry: v })} options={[{ value: 'none', label: 'нет' }, ...SIDES.filter((x) => !(base.attach && x.s === base.highSide)).map((x) => ({ value: x.s, label: SIDE_SHORT[x.s] }))]} />
            </Field>
          )}
          {base.kind === 'tko' && (
            <>
              <div className="grid2">
                {num('containers', 'Контейнеров в макете', 'шт')}
                <Field label="Объём контейнера"><Chips value={base.contType} onChange={(v) => setB({ contType: v })} options={[{ value: '1.1', label: '1,1 м³' }, { value: '0.75', label: '0,75 м³' }, { value: '8', label: 'бункер 8 м³' }]} /></Field>
              </div>
              <p className="xs muted" style={{ margin: 0 }}>Контейнеры ставятся вдоль стены напротив въезда; программа проверит, что они помещаются и остаётся проход.</p>
            </>
          )}
          {base.layout === 'perimeter' && base.roof !== 'hip' && !['visor'].includes(base.kind) && num('midRows', 'Промежуточных рядов столбов', 'шт', '0 — один пролёт; 1 и больше — многопролётный навес (стоянки, склады)')}
          <div className="grid2">{base.kind !== 'visor' && num('postStep', base.frame === 'wood' && params.postStep <= 0.8 ? 'Шаг стоек каркаса' : 'Шаг столбов, до', 'м', base.frame === 'wood' ? '0,6 м — каркасная стена из доски 50×100 (бытовка, хозблок)' : undefined)}{num('overhang', 'Свес кровли', 'м')}</div>
          {res.info.posts > 0 && <Field label={res.info.wood ? 'Сечение столба (брус)' : 'Сечение столба (профтруба)'}><PostSize a={base.postA} b={base.postB} t={base.postT} wood={res.info.wood} auto={(res.info as any).postRec || res.info.postProf} onChange={(x) => setB(x)} /></Field>}
          </Fold><Fold id="dz-cover" title="Каркас, кровля и цвет" summary={`${base.frame === 'wood' ? 'дерево' : 'металл'}, ${({ prof: 'профнастил', tile: 'металлочерепица', soft: 'гибкая черепица', poly: 'поликарбонат', sandwich: 'сэндвич', slats: 'ламели', none: 'без кровли' } as any)[base.cover]}, ${base.color === 'none' ? 'без покраски' : base.color}`}>
          {base.roof !== 'arch' && <Field label="Каркас"><Chips value={base.frame} onChange={(v) => setB({ frame: v })} options={[{ value: 'steel', label: 'Металл (профтруба)' }, { value: 'wood', label: 'Дерево (брус)' }]} /></Field>}
          <Field label="Покрытие кровли"><Chips value={base.cover} onChange={(v) => setB({ cover: v })} options={[{ value: 'prof', label: 'Профнастил' }, { value: 'tile', label: 'Металлочерепица' }, { value: 'soft', label: 'Гибкая черепица' }, { value: 'poly', label: 'Поликарбонат' }, { value: 'sandwich', label: 'Сэндвич' }, { value: 'slats', label: 'Ламели (пергола)' }, { value: 'none', label: 'Без кровли' }]} /></Field>
          {base.cover === 'prof' && base.roof !== 'arch' && <Field label="Марка профнастила" hint="С-8 — дешевле, нужна частая обрешётка и уклон от 10°; НС-35 — для больших пролётов и малых уклонов"><Chips value={base.profGrade} onChange={(v) => setB({ profGrade: v })} options={[{ value: 'C8', label: 'С-8' }, { value: 'C20', label: 'С-20' }, { value: 'HC35', label: 'НС-35' }]} /></Field>}
          <Field label="Цвет (RAL)" hint={base.color === 'none' ? 'Без покраски: металл — оцинковка или с антикором по швам, листы — оцинкованные. Краска и покраска убраны из сметы.' : undefined}>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className={`dz-ral ${base.color === 'none' ? 'on' : ''}`} onClick={() => setB({ color: 'none' })} aria-label="Без покраски"><i style={{ background: 'repeating-linear-gradient(45deg,#C9CED4 0 4px,#A9AFB6 4px 8px)' }} />Без покраски</button>
              {Object.entries(RAL).map(([code, hex]) => (
                <button key={code} className={`dz-ral ${base.color === code ? 'on' : ''}`} onClick={() => setB({ color: code })} title={code} aria-label={code}><i style={{ background: hex }} />{code.replace('RAL ', '')}</button>
              ))}
            </div>
          </Field>

          </Fold><Fold id="dz-walls" title="Стены" summary={[...new Set(Object.values(base.walls).map((w) => WALL_LABEL[w as Wall]))].join(', ')}>
          {SIDES.map(({ s, label }) => base.attach && s === base.highSide ? <Field key={s} label={label}><div className="small muted">стена дома</div></Field> : (
            <Field key={s} label={label}>
              <select className="select" value={base.walls[s]} onChange={(e) => setWall(s, e.target.value as Wall)}>
                {(Object.keys(WALL_LABEL) as Wall[]).map((w) => <option key={w} value={w}>{WALL_LABEL[w]}</option>)}
              </select>
            </Field>
          ))}
          {Object.values(base.walls).some((w) => w === 'prof' || w === 'prof_mesh') && num('profH', 'Высота профлиста', 'м')}

          </Fold><Fold id="dz-block" title="Совмещённый объект" summary={parseNum(nums.block) > 0 ? `блок ${nums.block} м` : 'нет'}>
          <p className="xs muted" style={{ margin: 0 }}>Часть по длине — закрытый блок (хозблок, гараж, кухня, подсобка, отсек КГМ), остальное — открытый навес под одной крышей. Ворота и дверь ставятся в блок.</p>
          <div className="grid2">
            {num('block', 'Длина закрытого блока', 'м', '0 — без блока')}
            <Field label="Блок с какой стороны"><Chips value={base.blockAt} onChange={(v) => setB({ blockAt: v })} options={[{ value: 'left', label: 'слева' }, { value: 'right', label: 'справа' }]} /></Field>
          </div>
          {parseNum(nums.block) > 0 && (
            <Field label="Стены блока">
              <select className="select" value={base.blockWall} onChange={(e) => setB({ blockWall: e.target.value as Wall })}>
                {(Object.keys(WALL_LABEL) as Wall[]).filter((w) => w !== 'open').map((w) => <option key={w} value={w}>{WALL_LABEL[w]}</option>)}
              </select>
            </Field>
          )}

          </Fold><Fold id="dz-ops" title="Ворота, двери и окна" summary={res.openings.length ? `${res.openings.length} шт` : 'нет'}>
          <OpeningsEditor p={params} res={res} onChange={(patch) => setB(patch)} />
          {base.gate !== 'none' && !Array.isArray(base.ops) && <div className="grid2">{num('gateW', 'Ширина ворот', 'м')}{num('gateH', 'Высота ворот', 'м')}</div>}
          {Object.values(base.walls).some((w) => w === 'prof_full' || w === 'prof' || w === 'wood') && (
            <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={base.insulate} onChange={(e) => setB({ insulate: e.target.checked })} />Утеплить стены и кровлю (минвата 100 мм)</label>
          )}
          {base.insulate && <Field label="Внутренняя обшивка"><Chips value={base.lining || 'none'} onChange={(v) => setB({ lining: v })} options={[{ value: 'none', label: 'Без обшивки' }, { value: 'vagonka', label: 'Вагонка' }, { value: 'osb', label: 'OSB 12 мм' }]} /></Field>}

          </Fold><Fold id="dz-base" title="Основание" summary={({ slab: 'плита', ushp: 'УШП', strip: 'лента', piles: 'сваи ТИСЭ', screw: 'винтовые сваи', deck: 'настил', paving: 'плитка', floor: 'утеплённый пол', none: 'нет' } as any)[base.base]}>
          <Chips value={base.base} onChange={(v) => setB({ base: v })} options={[{ value: 'slab', label: 'Бетонная плита' }, { value: 'ushp', label: 'УШП (тёплая плита)' }, { value: 'strip', label: 'Ленточный' }, { value: 'piles', label: 'Буронабивные сваи' }, { value: 'screw', label: 'Винтовые сваи' }, { value: 'deck', label: 'Настил на винтовых сваях' }, { value: 'paving', label: 'Тротуарная плитка' }, { value: 'floor', label: 'Утеплённый пол на опорах' }, { value: 'none', label: 'Нет' }]} />
          {base.base === 'floor' && <Field label="Опоры под ростверк" hint="Ростверк — брус 150×150, лаги 50×150 через 0,5 м, черновой пол, мембрана, утеплитель, пароизоляция, чистовой пол"><Chips value={base.floorOn || 'screw'} onChange={(v) => setB({ floorOn: v })} options={[{ value: 'screw', label: 'Винтовые сваи' }, { value: 'blocks', label: 'Бетонные блоки' }]} /></Field>}
          {base.base === 'floor' && <Field label="Чистовой пол"><Chips value={base.floorTop || 'osb'} onChange={(v) => setB({ floorTop: v })} options={[{ value: 'osb', label: 'OSB 18 мм' }, { value: 'board', label: 'Доска пола 36 мм' }]} /></Field>}
          {base.base === 'strip' && <div className="grid2">{num('stripW', 'Ширина ленты', 'мм')}{num('stripD', 'Высота ленты', 'мм', 'из них 200 мм над землёй')}</div>}
          {base.base === 'ushp' && <div className="grid3">{num('slabT', 'Плита', 'мм')}{num('eps', 'ЭППС', 'мм')}{num('sand', 'Песок', 'мм')}</div>}
          {base.base === 'paving' && num('slabOver', 'Плитка шире навеса на', 'м', 'с каждой стороны')}
          {base.base === 'slab' && (
            <>
              <div className="grid3">{num('slabT', 'Плита', 'мм')}{num('gravel', 'Щебень', 'мм')}{num('sand', 'Песок', 'мм')}</div>
              {num('slabOver', 'Плита шире навеса на', 'м', 'с каждой стороны; 0 — по осям столбов')}
              <Field label="Арматура"><Chips value={base.rebar} onChange={(v) => setB({ rebar: v })} options={[{ value: 'composite', label: 'Композитная' }, { value: 'steel', label: 'Стальная А500' }]} /></Field>
            </>
          )}
          </Fold><Fold id="dz-extra" title="Дополнительно" summary={[base.gutter && 'водосток', base.snowGuard && 'снегозадержатели', base.lights > 0 && `свет ${base.lights}`].filter(Boolean).join(', ') || `снег ${params.snow}`}>
          <Field label="Связи жёсткости" hint="Крестовые связи в крайних пролётах стен и по кровле. «Авто» — при высоте от 3,2 м или длине от 12 м"><Chips value={base.ties} onChange={(v) => setB({ ties: v })} options={[{ value: 'auto', label: 'авто' }, { value: 'yes', label: 'да' }, { value: 'no', label: 'нет' }]} /></Field>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={base.curb} onChange={(e) => setB({ curb: e.target.checked })} />Бордюр по периметру (кроме въезда)</label>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={base.bumpers} onChange={(e) => setB({ bumpers: e.target.checked })} />Колесоотбойники у столбов{base.kind === 'tko' ? ' и отбойник для контейнеров вдоль стен' : ''}</label>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={base.gutter} onChange={(e) => setB({ gutter: e.target.checked })} />Водосток (желоба и трубы)</label>
          {['prof', 'tile', 'soft', 'sandwich'].includes(base.cover) && <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={base.snowGuard} onChange={(e) => setB({ snowGuard: e.target.checked })} />Снегозадержатели</label>}
          {num('lights', 'Освещение: светильников', 'шт', '0 — без освещения; кабель, автомат и монтаж посчитаются')}
          <Field label="Город или посёлок" hint={cityHint}>
            <input className="input" list="dz-cities" value={base.city} placeholder="например, Всеволожск" maxLength={80}
              onChange={(e) => { const v = e.target.value; setB({ city: v }); const c = snowByCity(v); if (c) setNums((x) => ({ ...x, snow: String(c.region) })); }} />
            <datalist id="dz-cities">{CITIES.map((c) => <option key={c.name} value={c.name} />)}</datalist>
          </Field>
          <div className="grid2">{num('snow', 'Снеговой район', '1–8')}{num('waste', 'Запас материалов', '%')}</div>
          </Fold>
        </div>
      )}

      {tab === 'draw' && <Drawings res={res} />}

      {tab === 'steel' && (
        <div className="panel" style={{ padding: 10, overflowX: 'auto' }}>
          <table className="dz-table">
            <thead><tr><th>{res.info.wood ? 'Сечение' : 'Профиль'}</th><th>Где</th><th>Деталей</th><th>{res.info.wood ? 'Штук по 6 м' : 'Хлыстов'}</th><th>Отход</th><th>{res.info.wood ? 'Объём' : 'Вес'}</th></tr></thead>
            <tbody>
              {res.steel.map((s) => (
                <tr key={s.profile + s.use}><td className="num">{s.profile}</td><td>{s.use}</td><td className="num">{s.pieces} · {n(s.length, 1)} м</td><td className="num">{s.bars} × {s.stock} м</td><td className="num">{n(s.wastePct, 0)}%</td><td className="num">{res.info.wood ? `${n(s.vol, 2)} м³` : `${n(s.kg, 0)} кг`}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={5}>Итого {res.info.wood ? 'пиломатериала' : 'металла'} (с отходом)</td><td className="num"><b>{res.info.wood ? `${n(res.steel.reduce((a, s) => a + s.vol, 0), 2)} м³` : `${n(res.steel.reduce((a, s) => a + s.kg, 0), 0)} кг`}</b></td></tr></tfoot>
          </table>
          <p className="xs muted">{res.info.wood ? 'Брус и доска — по 6 м, хвоя естественной влажности.' : 'Раскрой — по хлыстам 6 и 12 м с пропилом 3 мм.'} Сечения — по типовым таблицам для снегового района {params.snow}.</p>
        </div>
      )}

      {tab === 'var' && (
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>Три комплектации одного объекта — заказчику проще выбрать между вашими вариантами, чем между вами и конкурентом. Цены — из вашего справочника, где он есть, иначе ориентировочные.</p>
          {variants.map((v) => (
            <div key={v.id} className={`panel dz-var ${v.id === 'std' ? 'on' : ''}`} style={{ padding: 10 }}>
              <div className="row between"><b>{v.label}</b><b className="num">{rub0(v.total)}</b></div>
              <div className="dz-var-3d" dangerouslySetInnerHTML={{ __html: view3dToSvg(render3d(v.res, -35, 24, 480, 300)) }} />
              <ul className="xs" style={{ margin: '6px 0', paddingLeft: 18 }}>{v.changes.map((c) => <li key={c}>{c}</li>)}</ul>
              {v.id !== 'std' && <button className="btn sm block" onClick={() => { apply(v.params, title, designId); setTab('params'); toast(`Взят вариант «${v.label}» — можно поправить`); }}>Взять за основу</button>}
            </div>
          ))}
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={showVariants} onChange={(e) => setShowVariants(e.target.checked)} />Показывать 3 варианта с ценами заказчику по 3D-ссылке</label>
        </div>
      )}

      {tab === 'est' && (
        <CalcResult calcId="design-canopy" suggestions={res.lines as any} estimateTitle={title} onAdded={linkToEstimate} />
      )}

      {res.warnings.length > 0 && <Fold id="dz-warn" title="⚠️ Подсказки и замечания" summary={`${res.warnings.length}`}>{res.warnings.map((w) => <div key={w} className="dz-warn" style={{ margin: 0 }}>{w}</div>)}</Fold>}

      <div className="stack" style={{ marginTop: 12 }}>
        <button className="btn primary block lg" disabled={busy === 'share'} onClick={openShare}>{busy === 'share' ? 'Готовлю ссылку…' : '🧊 3D-ссылка для заказчика'}</button>
        <button className="btn block" disabled={busy === 'pdf'} onClick={sendPdf}>{busy === 'pdf' ? 'Готовлю PDF…' : '📄 PDF эскизного проекта в Telegram'}</button>
        <div className="grid2">
          <button className="btn" disabled={busy === 'save'} onClick={save}>{designId ? 'Сохранить' : 'Сохранить проект'}</button>
          <button className="btn" onClick={openList}>Мои проекты</button>
        </div>
        <button className="btn block" onClick={() => { setPriceDraft(Object.fromEntries(Object.entries((me as any).designPrices || {}).map(([k, v]) => [k, String(v)]))); setPricesOpen(true); }}>💰 Мои цены на материалы{(me as any).designPrices ? ' · заданы' : ''}</button>
        {tab !== 'est' && <button className="btn block" onClick={() => setTab('est')}>Смета по проекту · ≈ {rub0(res.lines.reduce((a, l: any) => a + l.qty * (l.price || 0), 0))}</button>}
      </div>

      <Sheet open={!!share} onClose={() => setShare(null)} title="3D для заказчика">
        <p className="small muted" style={{ marginTop: 0 }}>Заказчик откроет ссылку в любом браузере без Telegram: покрутит 3D, посмотрит чертежи и параметры. Когда откроет — придёт уведомление. Если добавить проект в смету и поделиться сметой, на странице сметы появится кнопка «Посмотреть в 3D».</p>
        {share?.url && <input className="input" readOnly value={share.url} onFocus={(e) => e.target.select()} />}
        {share?.viewedAt && <p className="xs muted">Заказчик открывал: {new Date(share.viewedAt).toLocaleString('ru-RU')}</p>}
        <div className="stack" style={{ marginTop: 10 }}>
          <button className="btn primary block" onClick={sendTg}>Отправить в Telegram</button>
          <button className="btn block" onClick={copy}>Скопировать для WhatsApp / SMS</button>
          {share?.url && <a className="btn block" href={share.url} target="_blank" rel="noreferrer">Открыть как заказчик</a>}
          <button className="btn block" onClick={async () => { if (!designId) return; setShare(null); await del(`/designs/${designId}/share`); toast('Ссылка отключена'); }}>Отключить ссылку</button>
        </div>
      </Sheet>

      <Sheet open={pricesOpen} onClose={() => setPricesOpen(false)} title="Мои цены на материалы">
        <p className="small muted" style={{ marginTop: 0 }}>Укажите свои цены — все проекты, варианты и PDF посчитаются по ним. Пустое поле — цена по умолчанию (серым).</p>
        {[...new Set(DESIGN_PRICE_LABELS.map((x) => x.group))].map((g) => (
          <div key={g}>
            <div className="tile-group" style={{ margin: '10px 0 4px' }}>{g}</div>
            {DESIGN_PRICE_LABELS.filter((x) => x.group === g).map((x) => (
              <div key={x.key} className="row" style={{ gap: 8, marginBottom: 6 }}>
                <span className="small grow">{x.label}</span>
                <div style={{ width: 150 }}><NumInput value={priceDraft[x.key] ?? ''} placeholder={String(DESIGN_PRICES[x.key])} onChange={(v) => setPriceDraft((d) => ({ ...d, [x.key]: v }))} unit={x.unit} aria-label={x.label} /></div>
              </div>
            ))}
          </div>
        ))}
        <div className="stack" style={{ marginTop: 10 }}>
          <button className="btn primary block" onClick={() => savePrices()}>Сохранить цены</button>
          <button className="btn block" onClick={() => savePrices(true)}>Сбросить на цены по умолчанию</button>
        </div>
      </Sheet>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Мои проекты">
        {list == null ? <p className="muted">Загрузка…</p> : !list.length ? <p className="muted">Сохранённых проектов пока нет.</p> : (
          <div className="list">
            {list.map((d) => (
              <div key={d.id} className="list-item">
                <button className="grow linklike" style={{ textAlign: 'left', textDecoration: 'none', color: 'inherit' }} onClick={() => { apply(d.params, d.title, d.id); setListOpen(false); }}>
                  <div className="title">{d.title}</div>
                  <div className="xs muted">{d.params?.L}×{d.params?.W} м · {new Date(d.updatedAt).toLocaleDateString('ru-RU')}</div>
                </button>
                <button className="btn sm" onClick={() => remove(d)} aria-label="Удалить">✕</button>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}

