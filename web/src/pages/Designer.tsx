import React, { useEffect, useMemo, useRef, useState } from 'react';
import { get, post, put, del } from '../api';
import { Chips, Field, NumInput, Sheet, useDebounced, useToast } from '../components/ui';
import CalcResult from '../components/CalcResult';
import { n, rub0, parseNum } from '../format';
import { haptic, confirmDialog } from '../tg';
import { useMe } from '../App';
import { buildCanopy, CANOPY_DEFAULT, OBJ_LABEL, type CanopyParams, type ObjKind, type Side, type Wall } from '../../../shared/design/canopy';
import { render3d, drawings, view3dToSvg, sheetToSvg, RAL } from '../../../shared/design/render';
import { WALL_LABEL } from '../../../shared/design/report';
import { PRESETS } from '../../../shared/design/presets';

/**
 * ИИ-проектировщик (навесы, площадки ТКО): описание словами или параметры → 3D, чертежи с размерами,
 * раскрой металла и смета с работами и материалами. ИИ только заполняет параметры, геометрию считает программа.
 */
// пресет задаёт только своё — остальное из типовых значений (ворота, утепление и т. п. выключены)
const BLANK: Partial<CanopyParams> = { attach: false, frame: 'steel', gate: 'none', door: false, insulate: false, gutter: false, snowGuard: false, lights: 0, snow: 3, waste: 5, profH: 2, slabT: 0.15, sand: 0.2, gravel: 0.2, slabOver: 0, rebar: 'composite' };
const full = (p: Partial<CanopyParams>): CanopyParams => ({ ...CANOPY_DEFAULT, ...BLANK, ...p, walls: { ...CANOPY_DEFAULT.walls, ...(p.walls || {}) } });
const NUMS = ['L', 'W', 'hHigh', 'hLow', 'postStep', 'overhang', 'profH', 'gateW', 'gateH', 'slabT', 'sand', 'gravel', 'slabOver', 'snow', 'waste', 'lights'] as const;
type NumKey = (typeof NUMS)[number];
const MM = new Set<NumKey>(['slabT', 'sand', 'gravel']); // в форме — в миллиметрах
const toStr = (p: CanopyParams) => Object.fromEntries(NUMS.map((k) => [k, String(MM.has(k) ? Math.round(p[k] * 1000) : p[k])])) as Record<NumKey, string>;
const SIDES: { s: Side; label: string }[] = [{ s: 'front', label: 'Спереди (въезд)' }, { s: 'back', label: 'Сзади' }, { s: 'left', label: 'Слева' }, { s: 'right', label: 'Справа' }];
const SIDE_SHORT: Record<Side, string> = { front: 'спереди', back: 'сзади', left: 'слева', right: 'справа' };
const DRAFT = 'smeta_designer_draft';
const KIND_ICON: Record<ObjKind, string> = { canopy: '⛱', tko: '🗑', lean: '🏠', visor: '🚪', gazebo: '🛖', garage: '🚗', greenhouse: '🌱', woodshed: '🪵' };

type Tab = 'params' | 'draw' | 'steel' | 'est';

export default function Designer() {
  const toast = useToast();
  const { me } = useMe();
  const saved0 = useMemo(() => { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch { return null; } }, []);
  const [base, setBase] = useState<CanopyParams>(() => full(saved0?.p || CANOPY_DEFAULT));
  const [nums, setNums] = useState<Record<NumKey, string>>(() => toStr(full(saved0?.p || CANOPY_DEFAULT)));
  const [title, setTitle] = useState<string>(saved0?.title || PRESETS.find((x) => x.id === 'tko')!.title);
  const [designId, setDesignId] = useState<string | null>(saved0?.id || null);
  const [tab, setTab] = useState<Tab>('params');
  const [text, setText] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [busy, setBusy] = useState<'' | 'ai' | 'pdf' | 'save'>('');
  const [listOpen, setListOpen] = useState(false);
  const [list, setList] = useState<any[] | null>(null);

  const params: CanopyParams = useMemo(() => {
    const p: any = { ...base, walls: { ...base.walls } };
    for (const k of NUMS) { const v = parseNum(nums[k]); if (Number.isFinite(v) && nums[k].trim() !== '') p[k] = MM.has(k) ? v / 1000 : v; }
    return p;
  }, [base, nums]);
  const dp = useDebounced(params, 250);
  const res = useMemo(() => buildCanopy(dp), [dp]);
  const errors = useMemo(() => {
    const e: string[] = [];
    if (params.L < 1 || params.L > 60 || params.W < 1 || params.W > 60) e.push('Размеры в плане — от 1 до 60 м');
    if (params.hHigh < 1.2 || params.hHigh > 12 || params.hLow < 1.2 || params.hLow > 12) e.push('Высоты — от 1,2 до 12 м');
    if (params.lights < 0 || params.lights > 50) e.push('Светильников — от 0 до 50');
    if (params.postStep < 1.5 || params.postStep > 6) e.push('Шаг столбов — от 1,5 до 6 м');
    return e;
  }, [params]);

  useEffect(() => { try { localStorage.setItem(DRAFT, JSON.stringify({ p: params, title, id: designId })); } catch { /* */ } }, [params, title, designId]);

  const apply = (p: Partial<CanopyParams>, t?: string, id: string | null = null) => {
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
  const save = async () => {
    setBusy('save');
    try {
      const d = designId ? await put(`/designs/${designId}`, { title, params }) : await post('/designs', { title, params, kind: 'canopy' });
      setDesignId(d.id); haptic('success'); toast('Проект сохранён');
    } catch (e: any) { if (e.status === 404) { setDesignId(null); toast('Проект был удалён — сохраните заново', true); } else if (e.code !== 'subscription_required') toast(e.message, true); } finally { setBusy(''); }
  };
  const sendPdf = async () => {
    if (errors.length) return toast(errors[0], true);
    setBusy('pdf');
    try { await post('/designer/pdf/send', { title, params }); haptic('success'); toast('PDF эскизного проекта отправлен в чат с ботом'); }
    catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setBusy(''); }
  };
  const openList = async () => { setListOpen(true); setList(null); try { setList(await get('/designs')); } catch (e: any) { toast(e.message, true); setList([]); } };
  const remove = async (d: any) => {
    if (!(await confirmDialog(`Удалить проект «${d.title}»?`))) return;
    await del(`/designs/${d.id}`); setList((l) => (l || []).filter((x) => x.id !== d.id)); if (d.id === designId) setDesignId(null);
  };

  return (
    <>
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

      <Chips<Tab> value={tab} onChange={setTab} options={[{ value: 'params', label: 'Параметры' }, { value: 'draw', label: 'Чертежи' }, { value: 'steel', label: res.info.wood ? 'Пиломатериал' : 'Металл' }, { value: 'est', label: 'Смета' }]} />

      {tab === 'params' && (
        <div className="stack">
          <div className="csection" style={{ marginTop: 0 }}>Размеры</div>
          <div className="grid2">{num('L', 'Длина (по фасаду)', 'м')}{num('W', 'Глубина', 'м')}</div>
          <Field label="Кровля"><Chips value={base.roof} onChange={(v) => setB({ roof: v, ...(v !== 'single' ? { attach: false } : {}), ...(v === 'arch' ? { frame: 'steel' } : {}) })} options={[{ value: 'single', label: 'Односкатная' }, { value: 'gable', label: 'Двускатная' }, { value: 'hip', label: 'Четырёхскатная' }, { value: 'arch', label: 'Арочная' }]} /></Field>
          <div className="grid2">
            {num('hHigh', base.roof === 'single' ? 'Высокая сторона' : 'Высота в коньке', 'м')}
            {num('hLow', base.roof === 'single' ? 'Низкая сторона' : 'Высота карниза', 'м')}
          </div>
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
          <div className="grid2">{base.kind !== 'visor' && num('postStep', 'Шаг столбов, до', 'м')}{num('overhang', 'Свес кровли', 'м')}</div>
          {base.roof !== 'arch' && <Field label="Каркас"><Chips value={base.frame} onChange={(v) => setB({ frame: v })} options={[{ value: 'steel', label: 'Металл (профтруба)' }, { value: 'wood', label: 'Дерево (брус)' }]} /></Field>}
          <Field label="Покрытие кровли"><Chips value={base.cover} onChange={(v) => setB({ cover: v })} options={[{ value: 'prof', label: 'Профнастил' }, { value: 'tile', label: 'Металлочерепица' }, { value: 'soft', label: 'Гибкая черепица' }, { value: 'poly', label: 'Поликарбонат' }, { value: 'sandwich', label: 'Сэндвич' }, { value: 'none', label: 'Без кровли' }]} /></Field>
          <Field label="Цвет (RAL)">
            <div className="row wrap" style={{ gap: 6 }}>
              {Object.entries(RAL).map(([code, hex]) => (
                <button key={code} className={`dz-ral ${base.color === code ? 'on' : ''}`} onClick={() => setB({ color: code })} title={code} aria-label={code}><i style={{ background: hex }} />{code.replace('RAL ', '')}</button>
              ))}
            </div>
          </Field>

          <div className="csection">Стены</div>
          {SIDES.map(({ s, label }) => base.attach && s === base.highSide ? <Field key={s} label={label}><div className="small muted">стена дома</div></Field> : (
            <Field key={s} label={label}>
              <select className="select" value={base.walls[s]} onChange={(e) => setWall(s, e.target.value as Wall)}>
                {(Object.keys(WALL_LABEL) as Wall[]).map((w) => <option key={w} value={w}>{WALL_LABEL[w]}</option>)}
              </select>
            </Field>
          ))}
          {Object.values(base.walls).some((w) => w === 'prof' || w === 'prof_mesh') && num('profH', 'Высота профлиста', 'м')}

          <div className="csection">Ворота и дверь</div>
          <Field label="Ворота в передней стене"><Chips value={base.gate} onChange={(v) => setB({ gate: v })} options={[{ value: 'none', label: 'Нет' }, { value: 'swing', label: 'Распашные' }, { value: 'sectional', label: 'Секционные' }]} /></Field>
          {base.gate !== 'none' && <div className="grid2">{num('gateW', 'Ширина ворот', 'м')}{num('gateH', 'Высота ворот', 'м')}</div>}
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={base.door} onChange={(e) => setB({ door: e.target.checked })} />Дверь 0,9×2,05 м (место подберётся между столбами)</label>
          {Object.values(base.walls).some((w) => w === 'prof_full' || w === 'prof' || w === 'wood') && (
            <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={base.insulate} onChange={(e) => setB({ insulate: e.target.checked })} />Утеплить стены и кровлю (минвата 100 мм)</label>
          )}

          <div className="csection">Основание</div>
          <Chips value={base.base} onChange={(v) => setB({ base: v })} options={[{ value: 'slab', label: 'Бетонная плита' }, { value: 'paving', label: 'Тротуарная плитка' }, { value: 'piles', label: 'Сваи под столбы' }, { value: 'deck', label: 'Настил на винтовых сваях' }, { value: 'none', label: 'Нет' }]} />
          {base.base === 'paving' && num('slabOver', 'Плитка шире навеса на', 'м', 'с каждой стороны')}
          {base.base === 'slab' && (
            <>
              <div className="grid3">{num('slabT', 'Плита', 'мм')}{num('gravel', 'Щебень', 'мм')}{num('sand', 'Песок', 'мм')}</div>
              {num('slabOver', 'Плита шире навеса на', 'м', 'с каждой стороны; 0 — по осям столбов')}
              <Field label="Арматура"><Chips value={base.rebar} onChange={(v) => setB({ rebar: v })} options={[{ value: 'composite', label: 'Композитная' }, { value: 'steel', label: 'Стальная А500' }]} /></Field>
            </>
          )}
          <div className="csection">Дополнительно</div>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={base.gutter} onChange={(e) => setB({ gutter: e.target.checked })} />Водосток (желоба и трубы)</label>
          {['prof', 'tile', 'soft', 'sandwich'].includes(base.cover) && <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={base.snowGuard} onChange={(e) => setB({ snowGuard: e.target.checked })} />Снегозадержатели</label>}
          {num('lights', 'Освещение: светильников', 'шт', '0 — без освещения; кабель, автомат и монтаж посчитаются')}
          <div className="grid2">{num('snow', 'Снеговой район', '1–8')}{num('waste', 'Запас материалов', '%')}</div>
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

      {tab === 'est' && (
        <CalcResult calcId="design-canopy" suggestions={res.lines as any} estimateTitle={title} />
      )}

      {res.warnings.map((w) => <div key={w} className="dz-warn">{w}</div>)}

      <div className="stack" style={{ marginTop: 12 }}>
        <button className="btn primary block lg" disabled={busy === 'pdf'} onClick={sendPdf}>{busy === 'pdf' ? 'Готовлю PDF…' : '📄 PDF эскизного проекта в Telegram'}</button>
        <div className="grid2">
          <button className="btn" disabled={busy === 'save'} onClick={save}>{designId ? 'Сохранить' : 'Сохранить проект'}</button>
          <button className="btn" onClick={openList}>Мои проекты</button>
        </div>
        {tab !== 'est' && <button className="btn block" onClick={() => setTab('est')}>Смета по проекту · ≈ {rub0(res.lines.reduce((a, l: any) => a + l.qty * (l.price || 0), 0))}</button>}
      </div>

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

/** 3D: вращение пальцем/мышью */
function Viewer({ res }: { res: ReturnType<typeof buildCanopy> }) {
  const [ang, setAng] = useState({ yaw: -35, pitch: 24 });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const svg = useMemo(() => view3dToSvg(render3d(res, ang.yaw, ang.pitch, 640, 440)), [res, ang]);
  return (
    <div className="dz-3d" style={{ touchAction: 'none' }}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ...ang }; }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; setAng({ yaw: d.yaw + (e.clientX - d.x) * 0.5, pitch: Math.max(5, Math.min(70, d.pitch - (e.clientY - d.y) * 0.3)) }); }}
      onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="dz-3d-bar">
        <span className="xs muted">↔ вращайте пальцем</span>
        {[['Спереди', -35, 24], ['Сзади', 145, 24], ['Сверху', -35, 68]].map(([l, y, p]) => <button key={l as string} className="chip" onClick={() => setAng({ yaw: y as number, pitch: p as number })}>{l}</button>)}
      </div>
    </div>
  );
}

function Drawings({ res }: { res: ReturnType<typeof buildCanopy> }) {
  const sheets = useMemo(() => drawings(res), [res]);
  return (
    <div className="stack">
      {sheets.map((sh) => (
        <div key={sh.title} className="dz-sheet">
          <div className="dz-sheet-t">{sh.title}</div>
          <div dangerouslySetInnerHTML={{ __html: sheetToSvg(sh, 620) }} />
        </div>
      ))}
      <p className="xs muted">Размеры на чертежах — в миллиметрах. Полный комплект (3D, план, 4 фасада, разрез основания, раскрой и ведомость) — в PDF.</p>
    </div>
  );
}
