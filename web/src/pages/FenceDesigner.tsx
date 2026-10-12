import React, { useEffect, useMemo, useState } from 'react';
import { post } from '../api';
import { Chips, Field, NumInput, Switch, useDebounced } from '../components/ui';
import CalcResult from '../components/CalcResult';
import { Viewer, Drawings } from '../components/Design3D';
import { DesignActions, SteelTable, useDesignStore } from '../components/DesignActions';
import { n, parseNum } from '../format';
import { buildFence, FENCE_DEFAULT, FENCE_3D_TYPES, FENCE_SIDE_LABEL, type FenceParams, type FSide } from '../../../shared/design/fence3d';
import { FENCE_TYPES, MOUNTS, type FenceType, type Mount } from '../../../shared/fence';
import { RAL } from '../../../shared/design/render';
import PostSize from '../components/PostSize';

/** Заборы и ворота в 3D: участок, стороны, вид полотна, откатные/распашные ворота, калитка → 3D, чертежи, металл, смета */
const DRAFT = 'smeta_fence_draft';
const NUMS = ['L', 'W', 'h', 'step', 'gateW', 'gateAt', 'wicketAt', 'demolish'] as const;
type NumKey = (typeof NUMS)[number];
const toStr = (p: FenceParams) => Object.fromEntries(NUMS.map((k) => [k, String(p[k])])) as Record<NumKey, string>;

const PRESETS: { id: string; label: string; title: string; p: Partial<FenceParams> }[] = [
  { id: 'prof', label: 'Профлист + откатные', title: 'Забор из профлиста с откатными воротами', p: { type: 'profnastil', h: 2, step: 2.5, gate: 'slide', gateW: 4, color: 'RAL 8017', mount: 'concrete' } },
  { id: 'euro', label: 'Евроштакетник шахматка', title: 'Забор из евроштакетника (шахматка) с распашными воротами', p: { type: 'euro2', h: 1.8, step: 2.5, gate: 'swing', gateW: 3.5, color: 'RAL 6005', mount: 'buta' } },
  { id: 'mesh3d', label: '3D-сетка', title: 'Забор из 3D-сетки с распашными воротами', p: { type: 'mesh3d', h: 1.73, step: 2.5, gate: 'swing', gateW: 4, color: 'RAL 6005', mount: 'concrete' } },
  { id: 'brick', label: 'Кирпичные столбы', title: 'Забор на кирпичных столбах с откатными воротами', p: { type: 'brick', h: 2, step: 3, gate: 'slide', gateW: 4.5, color: 'RAL 8017', mount: 'strip', automation: true } },
  { id: 'rancho', label: 'Ранчо', title: 'Забор ранчо с откатными воротами', p: { type: 'rancho', h: 1.8, step: 2, gate: 'slide', gateW: 4, color: 'RAL 7024', mount: 'concrete' } },
  { id: 'rabica', label: 'Рабица на дачу', title: 'Забор из сетки-рабицы с калиткой', p: { type: 'rabica', h: 1.5, step: 2.5, gate: 'swing', gateW: 3, color: 'RAL 6005', mount: 'drive', caps: false } },
];

export default function FenceDesigner() {
  const saved0 = useMemo(() => { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch { return null; } }, []);
  // с плана участка можно прийти с размерами: ?L=20&W=30
  const q = new URLSearchParams(location.search);
  const start: FenceParams = { ...FENCE_DEFAULT, ...(saved0?.p || {}), ...(q.get('L') ? { L: Number(q.get('L')), W: Number(q.get('W')), gateAt: Number(q.get('gate') || 3) } : {}) };
  const [base, setBase] = useState<FenceParams>(start);
  const [nums, setNums] = useState<Record<NumKey, string>>(() => toStr(start));
  const [title, setTitle] = useState<string>(saved0?.title || PRESETS[0].title);
  const [tab, setTab] = useState<'params' | 'draw' | 'steel' | 'est'>('params');
  const [close, setClose] = useState(true);
  const params: FenceParams = useMemo(() => {
    const p: any = { ...base, sides: { ...base.sides } };
    for (const k of NUMS) { const v = parseNum(nums[k]); if (Number.isFinite(v) && nums[k].trim() !== '') p[k] = v; }
    return p;
  }, [base, nums]);
  const dp = useDebounced(params, 250);
  const res = useMemo(() => buildFence(dp), [dp]);
  const view = useMemo(() => (close && dp.sides.front ? buildFence({ ...dp, W: 2.5, sides: { front: true, back: false, left: false, right: false } }) : res), [dp, res, close]);
  const store = useDesignStore('fence', title, params, saved0?.id || null);
  useEffect(() => { try { localStorage.setItem(DRAFT, JSON.stringify({ p: params, title, id: store.designId })); } catch { /* */ } }, [params, title, store.designId]);

  const errors = useMemo(() => {
    const e: string[] = [];
    if (params.L < 2 || params.L > 300 || params.W < 2 || params.W > 300) e.push('Размеры участка — от 2 до 300 м');
    if (params.h < 0.5 || params.h > 4) e.push('Высота забора — от 0,5 до 4 м');
    if (params.step < 1 || params.step > 4) e.push('Шаг столбов — от 1 до 4 м');
    if (params.gate !== 'none' && (params.gateW < 1 || params.gateW > 10)) e.push('Ширина ворот — от 1 до 10 м');
    return e;
  }, [params]);
  const apply = (p: Partial<FenceParams>, t?: string, id: string | null = null) => {
    const f = { ...FENCE_DEFAULT, ...p, sides: { ...FENCE_DEFAULT.sides, ...(p.sides || {}) } } as FenceParams;
    setBase(f); setNums(toStr(f)); if (t) setTitle(t); store.setDesignId(id);
  };
  const setB = (patch: Partial<FenceParams>) => setBase((b) => ({ ...b, ...patch }));
  const num = (k: NumKey, label: string, unit: string, hint?: string) => <Field label={label} hint={hint}><NumInput value={nums[k]} onChange={(v) => setNums((x) => ({ ...x, [k]: v }))} unit={unit} aria-label={label} /></Field>;
  const total = Math.round(res.lines.reduce((a, l) => a + l.qty * (l.price || 0), 0));

  return (
    <>
      <div className="row wrap" style={{ gap: 6, margin: '0 0 8px' }}>
        <span className="xs muted">Типовые:</span>
        {PRESETS.map((pr) => <button key={pr.id} className="chip" onClick={() => apply({ ...base, postA: undefined, postB: undefined, postT: undefined, ...pr.p, sides: base.sides, L: params.L, W: params.W }, pr.title)}>{pr.label}</button>)}
      </div>
      <Field label="Название проекта"><input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></Field>

      <Viewer res={view} pitch={close ? 14 : 30} h={close ? 320 : 440} />
      <div className="seg">
        <button className={`chip ${close ? 'on' : ''}`} onClick={() => setClose(true)}>Улица крупно</button>
        <button className={`chip ${!close ? 'on' : ''}`} onClick={() => setClose(false)}>Весь участок</button>
      </div>
      <div className="dz-sum">
        {res.summary.slice(0, 6).map((s) => <div key={s.label}><span className="xs muted">{s.label}</span><b className="num">{n(s.value, 1)} <small>{s.unit}</small></b></div>)}
      </div>
      {errors.map((e) => <div key={e} className="dz-warn bad">{e}</div>)}

      <Chips value={tab} onChange={setTab} options={[{ value: 'params', label: 'Параметры' }, { value: 'draw', label: 'Чертежи' }, { value: 'steel', label: 'Металл' }, { value: 'est', label: 'Смета' }]} />

      {tab === 'params' && (
        <div className="stack">
          <div className="csection" style={{ marginTop: 0 }}>Участок</div>
          <div className="grid2">{num('L', 'По улице', 'м')}{num('W', 'В глубину', 'м')}</div>
          <Field label="Где забор">
            <div className="seg" style={{ flexWrap: 'wrap' }}>
              {(Object.keys(FENCE_SIDE_LABEL) as FSide[]).map((s) => <button key={s} className={`chip ${base.sides[s] ? 'on' : ''}`} aria-pressed={base.sides[s]} onClick={() => setB({ sides: { ...base.sides, [s]: !base.sides[s] } })}>{FENCE_SIDE_LABEL[s]}</button>)}
            </div>
          </Field>

          <div className="csection">Полотно</div>
          <Field label="Вид забора">
            <select className="select" value={base.type} onChange={(e) => { const t = e.target.value as FenceType; setB({ type: t }); setNums((x) => ({ ...x, step: String(FENCE_TYPES[t].step) })); }}>
              {FENCE_3D_TYPES.map((t) => <option key={t} value={t}>{FENCE_TYPES[t].label}</option>)}
            </select>
          </Field>
          <div className="grid2">{num('h', 'Высота', 'м')}{num('step', 'Шаг столбов', 'м')}</div>
          <Field label="Монтаж столбов">
            <select className="select" value={base.mount} onChange={(e) => setB({ mount: e.target.value as Mount })}>
              {(Object.keys(MOUNTS) as Mount[]).map((m) => <option key={m} value={m}>{MOUNTS[m].label}</option>)}
            </select>
          </Field>
          {(!res.info.masonry || base.type === 'brick') && <Field label="Сечение столба (профтруба)"><PostSize a={base.postA} b={base.postB} t={base.postT} auto={(res.info as any).postAuto || res.info.postProf} onChange={(x) => setB(x)} /></Field>}
          <Field label="Цвет" hint={base.color === 'none' ? 'Без покраски: оцинкованные столбы и лаги, грунт-эмаль убрана из сметы' : undefined}>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className={`dz-ral ${base.color === 'none' ? 'on' : ''}`} onClick={() => setB({ color: 'none' })} aria-label="Без покраски"><i style={{ background: 'repeating-linear-gradient(45deg,#C9CED4 0 4px,#A9AFB6 4px 8px)' }} />Без покраски</button>
              {Object.entries(RAL).map(([k, c]) => <button key={k} className={`dz-ral ${base.color === k ? 'on' : ''}`} onClick={() => setB({ color: k })}><i style={{ background: c }} />{k.replace('RAL ', '')}</button>)}
            </div>
          </Field>

          <div className="csection">Ворота и калитка</div>
          <Field label="Ворота"><Chips value={base.gate} onChange={(v) => setB({ gate: v })} options={[{ value: 'slide', label: 'Откатные' }, { value: 'swing', label: 'Распашные' }, { value: 'none', label: 'Нет' }]} /></Field>
          {base.gate !== 'none' && <div className="grid2">{num('gateW', 'Ширина проёма', 'м')}{num('gateAt', 'От левого угла', 'м')}</div>}
          {base.gate === 'slide' && <Field label="Откатываются"><Chips value={base.slideDir} onChange={(v) => setB({ slideDir: v })} options={[{ value: 'right', label: 'Вправо' }, { value: 'left', label: 'Влево' }]} /></Field>}
          {base.gate !== 'none' && <div className="row between"><span>Автоматика (привод, пульты)</span><Switch checked={base.automation} onChange={(v) => setB({ automation: v })} label="Автоматика" /></div>}
          <div className="row between"><span>Калитка 1 м</span><Switch checked={base.wicket} onChange={(v) => setB({ wicket: v })} label="Калитка" /></div>
          {base.wicket && num('wicketAt', 'Калитка от левого угла', 'м')}

          <div className="csection">Дополнительно</div>
          <div className="row between"><span>Колпаки на столбы</span><Switch checked={base.caps} onChange={(v) => setB({ caps: v })} label="Колпаки" /></div>
          <div className="row between"><span>Участок на склоне (ступенями, +15% к работе)</span><Switch checked={base.slope} onChange={(v) => setB({ slope: v })} label="Склон" /></div>
          {num('demolish', 'Демонтаж старого забора', 'м', '0 — не нужен')}
        </div>
      )}
      {tab === 'draw' && <Drawings res={res} note={false} />}
      {tab === 'steel' && <SteelTable steel={res.steel} />}
      {tab === 'est' && <CalcResult calcId="design-fence" suggestions={res.lines as any} estimateTitle={title} onAdded={async (estimateId: string) => { const id = await store.persist(); await post(`/designs/${id}/link`, { estimateId }); }} />}

      {res.warnings.map((w) => <div key={w} className="dz-warn">{w}</div>)}
      <DesignActions kind="fence" title={title} params={params} errors={errors} total={total} persist={store.persist} designId={store.designId} setDesignId={store.setDesignId}
        onOpen={(d) => apply(d.params, d.title, d.id)} onEstimate={() => { setTab('est'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
    </>
  );
}
