import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../api';
import { Chips, Field, NumInput, Switch, useDebounced } from '../components/ui';
import CalcResult from '../components/CalcResult';
import { Viewer, Drawings } from '../components/Design3D';
import { DesignActions, useDesignStore } from '../components/DesignActions';
import { n, parseNum } from '../format';
import { haptic } from '../tg';
import { buildSite, siteChecks, newObjId, gasSize, GAS_VOLS, SITE_DEFAULT, SITE_OPT_DEFAULT, SITE_PRESETS, SITE_TYPES, type SiteObj, type SiteObjType, type SiteParams } from '../../../shared/design/site';

/**
 * Благоустройство: план участка. Объекты перетаскиваются пальцем, расстояния по нормам проверяются сразу,
 * 3D участка, генплан и схема сетей, смета на септик, газгольдер, скважину, мощение и газон.
 */
const DRAFT = 'smeta_site_draft';
const COLORS: Record<string, string> = {
  house: '#E9D8BC', bath: '#D9B58B', garage: '#C9CDD3', shed: '#D9B58B', greenhouse: '#BFE2F0', septic: '#9CCB8E', gasholder: '#F2C46D', well: '#8FC1EA',
  borehole: '#8FC1EA', parking: '#BDB8AE', path: '#CFCAC0', terrace: '#C99A6B', beds: '#9B7550', tree: '#6FAE57', compost: '#9B7550', wc: '#D9B58B',
};
const GROUPS: { id: 'build' | 'eng' | 'yard'; label: string }[] = [{ id: 'eng', label: 'Инженерия' }, { id: 'build', label: 'Постройки' }, { id: 'yard', label: 'Двор' }];

export default function SitePlan() {
  const nav = useNavigate();
  const saved0 = useMemo(() => { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch { return null; } }, []);
  const [p, setP] = useState<SiteParams>(() => saved0?.p || SITE_DEFAULT);
  const [dims, setDims] = useState({ L: String(p.L), W: String(p.W) });
  const [title, setTitle] = useState<string>(saved0?.title || SITE_PRESETS[0].title);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<'plan' | '3d' | 'draw' | 'est'>('plan');
  const [showOk, setShowOk] = useState(false);
  const params: SiteParams = useMemo(() => {
    const L = parseNum(dims.L), W = parseNum(dims.W);
    return { ...p, L: L >= 5 && L <= 300 ? L : p.L, W: W >= 5 && W <= 300 ? W : p.W };
  }, [p, dims]);
  const dp = useDebounced(params, 200);
  const res = useMemo(() => buildSite(dp), [dp]);
  const checks = useMemo(() => siteChecks(params), [params]); // мгновенно, пока тянем объект
  const store = useDesignStore('site', title, params, saved0?.id || null);
  useEffect(() => { try { localStorage.setItem(DRAFT, JSON.stringify({ p: params, title, id: store.designId })); } catch { /* */ } }, [params, title, store.designId]);

  const errors = useMemo(() => (params.objs.length ? [] : ['Добавьте на участок хотя бы один объект']), [params.objs.length]);
  const total = Math.round(res.lines.reduce((a, l) => a + l.qty * (l.price || 0), 0));
  const cur = params.objs.find((o) => o.id === sel) || null;
  const setObj = (id: string, patch: Partial<SiteObj>) => setP((x) => ({ ...x, objs: x.objs.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const setOpt = (id: string, patch: Record<string, any>) => setP((x) => ({ ...x, objs: x.objs.map((o) => (o.id === id ? { ...o, opt: { ...(o.opt || {}), ...patch } } : o)) }));
  const add = (type: SiteObjType) => {
    const t = SITE_TYPES[type];
    const o: SiteObj = { id: newObjId(), type, x: Math.round(params.L / 2 * 10) / 10, y: Math.round(params.W / 2 * 10) / 10, w: t.w, d: t.d, opt: { ...(SITE_OPT_DEFAULT[type] || {}) } };
    setP((x) => ({ ...x, objs: [...x.objs, o] })); setSel(o.id); setTab('plan'); haptic('light');
  };
  const apply = (sp: SiteParams, t?: string, id: string | null = null) => { setP(sp); setDims({ L: String(sp.L), W: String(sp.W) }); if (t) setTitle(t); setSel(null); store.setDesignId(id); };

  const bad = checks.filter((c) => !c.ok && !c.soft), soft = checks.filter((c) => !c.ok && c.soft), ok = checks.filter((c) => c.ok);

  return (
    <>
      <div className="row wrap" style={{ gap: 6, margin: '0 0 8px' }}>
        <span className="xs muted">Типовые:</span>
        {SITE_PRESETS.map((pr) => <button key={pr.id} className="chip" onClick={() => apply(JSON.parse(JSON.stringify(pr.p)), pr.title)}>{pr.label}</button>)}
      </div>
      <Field label="Название проекта"><input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid2">
        <Field label="Участок по улице"><NumInput value={dims.L} onChange={(v) => setDims((d) => ({ ...d, L: v }))} unit="м" /></Field>
        <Field label="В глубину"><NumInput value={dims.W} onChange={(v) => setDims((d) => ({ ...d, W: v }))} unit="м" /></Field>
      </div>
      <p className="xs muted" style={{ margin: '0 0 6px' }}>{n(params.L * params.W / 100, 1)} сотки · улица — снизу плана. Перетаскивайте объекты пальцем, нажмите — чтобы поменять размер.</p>

      <Chips value={tab} onChange={setTab} options={[{ value: 'plan', label: 'План' }, { value: '3d', label: '3D' }, { value: 'draw', label: 'Чертежи' }, { value: 'est', label: 'Смета' }]} />

      {tab === 'plan' && (
        <>
          <PlanEditor p={params} sel={sel} setSel={setSel} onMove={(id, x, y) => setObj(id, { x, y })} checks={checks} />
          {GROUPS.map((g) => (
            <div key={g.id} className="row wrap" style={{ gap: 6, margin: '6px 0' }}>
              <span className="xs muted" style={{ minWidth: 78 }}>+ {g.label}:</span>
              {(Object.keys(SITE_TYPES) as SiteObjType[]).filter((t) => SITE_TYPES[t].group === g.id).map((t) => <button key={t} className="chip" onClick={() => add(t)}>{SITE_TYPES[t].icon} {SITE_TYPES[t].label}</button>)}
            </div>
          ))}
          {cur && <ObjPanel o={cur} setObj={setObj} setOpt={setOpt} onDelete={() => { setP((x) => ({ ...x, objs: x.objs.filter((o) => o.id !== cur.id) })); setSel(null); }} onCopy={() => { const c = { ...cur, id: newObjId(), x: cur.x + 1, y: cur.y + 1, opt: { ...cur.opt } }; setP((x) => ({ ...x, objs: [...x.objs, c] })); setSel(c.id); }} />}

          <div className="csection">Расстояния по нормам</div>
          {!bad.length && !soft.length && <div className="dz-warn" style={{ borderColor: 'var(--ok)' }}>✓ Все проверенные расстояния в норме ({ok.length})</div>}
          {bad.map((c) => <div key={c.label} className="dz-warn bad">✗ {c.label}: {c.d > 0 ? `${String(c.d).replace('.', ',')} м, нужно ≥ ${c.min} м` : c.why} <span className="muted">· {c.why}</span></div>)}
          {soft.map((c) => <div key={c.label} className="dz-warn">⚠ {c.label}: {String(c.d).replace('.', ',')} м, желательно ≥ {c.min} м</div>)}
          {ok.length > 0 && <button className="btn sm" onClick={() => setShowOk(!showOk)}>{showOk ? 'Скрыть' : 'Показать'} в норме · {ok.length}</button>}
          {showOk && ok.map((c) => <div key={c.label} className="xs muted">✓ {c.label}: {String(c.d).replace('.', ',')} м (≥ {c.min})</div>)}
          <p className="xs muted">Нормы — ориентировочно: СП 53.13330.2019, СП 32.13330, СП 62.13330, СанПиН. Сверяйте с ГПЗУ, газовой службой и паспортом оборудования.</p>

          <div className="csection">Участок</div>
          <div className="row between"><span>Забор по границе</span><Switch checked={params.fence} onChange={(v) => setP((x) => ({ ...x, fence: v }))} label="Забор" /></div>
          {params.fence && <Field label="Въезд с улицы: от левого угла"><NumInput value={String(params.gateX)} onChange={(v) => setP((x) => ({ ...x, gateX: parseNum(v) || 0 }))} unit="м" /></Field>}
          <Field label="Газон"><Chips value={params.lawn} onChange={(v) => setP((x) => ({ ...x, lawn: v }))} options={[{ value: 'seed', label: 'Посев' }, { value: 'roll', label: 'Рулонный' }, { value: 'none', label: 'Без газона' }]} /></Field>
          <button className="btn block" onClick={() => nav(`/fence?L=${params.L}&W=${params.W}&gate=${params.gateX}`)}>🚧 Забор и ворота для этого участка в 3D</button>
        </>
      )}
      {tab === '3d' && (
        <>
          <Viewer res={res} pitch={40} />
          <div className="dz-sum">{res.summary.slice(0, 6).map((s) => <div key={s.label}><span className="xs muted">{s.label}</span><b className="num">{n(s.value, 1)} <small>{s.unit}</small></b></div>)}</div>
        </>
      )}
      {tab === 'draw' && <Drawings res={res} note={false} />}
      {tab === 'est' && <CalcResult calcId="design-site" suggestions={res.lines as any} estimateTitle={title} onAdded={async (estimateId: string) => { const id = await store.persist(); await post(`/designs/${id}/link`, { estimateId }); }} />}

      <DesignActions kind="site" title={title} params={params} errors={errors} total={total} persist={store.persist} designId={store.designId} setDesignId={store.setDesignId}
        onOpen={(d) => apply(d.params, d.title, d.id)} onEstimate={() => { setTab('est'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
    </>
  );
}

/** План участка: SVG в метрах, перетаскивание объектов, подсветка нарушений у выбранного */
function PlanEditor({ p, sel, setSel, onMove, checks }: { p: SiteParams; sel: string | null; setSel: (v: string | null) => void; onMove: (id: string, x: number, y: number) => void; checks: ReturnType<typeof siteChecks> }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const pad = Math.max(1.5, Math.max(p.L, p.W) * 0.05);
  const Y = (y: number) => p.W - y; // улица снизу
  const toM = (e: React.PointerEvent) => {
    const s = svg.current!; const pt = s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = pt.matrixTransform(s.getScreenCTM()!.inverse());
    return { x: m.x, y: p.W - m.y };
  };
  const fs = Math.max(0.5, Math.max(p.L, p.W) / 32);
  const selObj = p.objs.find((o) => o.id === sel);
  const selChecks = selObj ? checks.filter((c) => c.min > 0.01 && isFor(c, selObj)) : checks.filter((c) => !c.ok && !c.soft && c.min > 0.01);
  return (
    <div className="site-plan">
      <svg ref={svg} viewBox={`${-pad} ${-pad} ${p.L + 2 * pad} ${p.W + 2 * pad + fs * 1.6}`} style={{ touchAction: 'none', width: '100%', display: 'block' }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const m = toM(e); const o = p.objs.find((x) => x.id === d.id); if (!o) return;
          const nx = Math.round(Math.max(o.w / 2, Math.min(p.L - o.w / 2, m.x - d.dx)) * 10) / 10, ny = Math.round(Math.max(o.d / 2, Math.min(p.W - o.d / 2, m.y - d.dy)) * 10) / 10; onMove(d.id, nx, ny); }}
        onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)} onPointerDown={(e) => { if (e.target === svg.current) setSel(null); }}>
        <rect x={0} y={0} width={p.L} height={p.W} fill="#E7F0DC" stroke="#333" strokeWidth={0.12} onPointerDown={() => setSel(null)} />
        {/* сетка 5 м */}
        {Array.from({ length: Math.floor(p.L / 5) }, (_, i) => <line key={`gx${i}`} x1={(i + 1) * 5} y1={0} x2={(i + 1) * 5} y2={p.W} stroke="#000" strokeOpacity={0.06} strokeWidth={0.05} />)}
        {Array.from({ length: Math.floor(p.W / 5) }, (_, i) => <line key={`gy${i}`} x1={0} y1={Y((i + 1) * 5)} x2={p.L} y2={Y((i + 1) * 5)} stroke="#000" strokeOpacity={0.06} strokeWidth={0.05} />)}
        {p.fence && <line x1={Math.max(0.3, Math.min(p.L - 4.3, p.gateX))} y1={p.W} x2={Math.max(0.3, Math.min(p.L - 4.3, p.gateX)) + 4} y2={p.W} stroke="#fff" strokeWidth={0.35} />}
        <text x={p.L / 2} y={p.W + fs * 1.3} fontSize={fs * 0.8} textAnchor="middle" fill="#888">улица</text>
        {p.objs.map((o) => {
          const on = o.id === sel;
          const down = (e: React.PointerEvent) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); const m = toM(e); drag.current = { id: o.id, dx: m.x - o.x, dy: m.y - o.y }; setSel(o.id); };
          const label = o.w * o.d >= 6 || on;
          return (
            <g key={o.id} onPointerDown={down} style={{ cursor: 'grab' }}>
              {o.type === 'tree'
                ? <circle cx={o.x} cy={Y(o.y)} r={o.w / 2} fill={COLORS.tree} fillOpacity={0.75} stroke={on ? '#E65100' : '#3d6b2e'} strokeWidth={on ? 0.18 : 0.06} />
                : <rect x={o.x - o.w / 2} y={Y(o.y) - o.d / 2} width={o.w} height={o.d} fill={COLORS[o.type]} stroke={on ? '#E65100' : '#444'} strokeWidth={on ? 0.18 : 0.06} rx={['septic', 'well', 'borehole', 'gasholder'].includes(o.type) ? Math.min(o.w, o.d) / 2 : 0.05} />}
              <text x={o.x} y={Y(o.y) + fs * 0.35} fontSize={Math.min(fs * 1.2, Math.max(o.w, o.d) * 0.8)} textAnchor="middle" style={{ pointerEvents: 'none' }}>{SITE_TYPES[o.type].icon}</text>
              {label && <text x={o.x} y={Y(o.y) + fs * 0.35 + Math.min(fs * 1.1, o.d * 0.45)} fontSize={fs * 0.62} textAnchor="middle" fill="#333" style={{ pointerEvents: 'none' }}>{SITE_TYPES[o.type].label}</text>}
            </g>
          );
        })}
        {selChecks.map((c) => {
          const color = c.ok ? '#2e7d32' : c.soft ? '#C77700' : '#c62828';
          return (
            <g key={c.label} style={{ pointerEvents: 'none' }}>
              <line x1={c.a[0]} y1={Y(c.a[1])} x2={c.b[0]} y2={Y(c.b[1])} stroke={color} strokeWidth={0.1} strokeDasharray="0.4 0.25" />
              <text x={(c.a[0] + c.b[0]) / 2 + 0.2} y={Y((c.a[1] + c.b[1]) / 2) - 0.2} fontSize={fs * 0.5} fill={color} fontWeight={c.ok ? 400 : 700}>{String(c.d).replace('.', ',')}{c.ok ? '' : `<${c.min}`}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
// проверка относится к выбранному объекту: один из концов лежит на нём
function isFor(c: { a: [number, number]; b: [number, number] }, o: SiteObj) {
  const inside = (q: [number, number]) => (o.type === 'tree' ? Math.hypot(q[0] - o.x, q[1] - o.y) < 0.05 : q[0] >= o.x - o.w / 2 - 0.01 && q[0] <= o.x + o.w / 2 + 0.01 && q[1] >= o.y - o.d / 2 - 0.01 && q[1] <= o.y + o.d / 2 + 0.01);
  return inside(c.a) || inside(c.b);
}

function ObjPanel({ o, setObj, setOpt, onDelete, onCopy }: { o: SiteObj; setObj: (id: string, p: Partial<SiteObj>) => void; setOpt: (id: string, p: Record<string, any>) => void; onDelete: () => void; onCopy: () => void }) {
  const t = SITE_TYPES[o.type];
  const sizeNum = (k: 'w' | 'd', label: string) => <Field label={label}><NumInput value={String(o[k])} onChange={(v) => { const x = parseNum(v); if (x >= 0.3 && x <= 60) setObj(o.id, { [k]: x }); }} unit="м" /></Field>;
  return (
    <div className="panel stack" style={{ padding: 10, marginTop: 8 }}>
      <div className="row between"><b>{t.icon} {t.label}</b><span className="xs muted">центр: {n(o.x, 1)} × {n(o.y, 1)} м</span></div>
      {o.type === 'tree' ? (
        <Field label="Дерево"><Chips value={o.opt?.size || 'mid'} onChange={(v) => setOpt(o.id, { size: v })} options={[{ value: 'tall', label: 'Высокое' }, { value: 'mid', label: 'Среднее' }, { value: 'shrub', label: 'Кустарник' }]} /></Field>
      ) : o.type === 'gasholder' ? (
        <Field label="Объём газгольдера"><Chips value={String(o.opt?.vol || 4850)} onChange={(v) => { const [w, d] = gasSize(Number(v)); setObj(o.id, { w: o.w >= o.d ? w : d, d: o.w >= o.d ? d : w, opt: { ...o.opt, vol: Number(v) } }); }} options={GAS_VOLS.map((v) => ({ value: String(v), label: `${v} л` }))} /></Field>
      ) : (
        <div className="grid2">{sizeNum('w', 'Ширина (по улице)')}{sizeNum('d', 'Глубина')}</div>
      )}
      {o.type === 'septic' && (
        <>
          <Field label="Система"><Chips value={o.opt?.sys || 'station'} onChange={(v) => setOpt(o.id, { sys: v })} options={[{ value: 'station', label: 'Станция биоочистки' }, { value: 'plastic', label: 'Пластиковый септик' }, { value: 'rings', label: 'Ж/б кольца' }]} /></Field>
          {o.opt?.sys !== 'rings' && <Field label="Человек в доме"><NumInput value={String(o.opt?.users || 5)} onChange={(v) => setOpt(o.id, { users: Math.max(1, Math.min(20, Math.round(parseNum(v) || 5))) })} unit="чел." /></Field>}
        </>
      )}
      {o.type === 'borehole' && (
        <div className="grid2">
          <Field label="Глубина"><NumInput value={String(o.opt?.depth || 40)} onChange={(v) => setOpt(o.id, { depth: Math.max(5, Math.min(250, parseNum(v) || 40)) })} unit="м" /></Field>
          <Field label="Водоносный слой"><Chips value={o.opt?.rock || 'lime'} onChange={(v) => setOpt(o.id, { rock: v })} options={[{ value: 'lime', label: 'Известняк' }, { value: 'sand', label: 'Песок' }]} /></Field>
        </div>
      )}
      {o.type === 'well' && <Field label="Колец"><NumInput value={String(o.opt?.rings || 10)} onChange={(v) => setOpt(o.id, { rings: Math.max(2, Math.min(25, Math.round(parseNum(v) || 10))) })} unit="шт" /></Field>}
      {(o.type === 'parking' || o.type === 'path') && <Field label="Покрытие"><Chips value={o.opt?.surf || 'paving'} onChange={(v) => setOpt(o.id, { surf: v })} options={[{ value: 'paving', label: 'Плитка' }, { value: 'gravel', label: 'Щебень' }]} /></Field>}
      {o.type === 'house' && <Field label="Этажей"><Chips value={String(o.opt?.floors || 2)} onChange={(v) => setOpt(o.id, { floors: Number(v) })} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }]} /></Field>}
      <div className="row wrap" style={{ gap: 6 }}>
        {o.type !== 'tree' && <button className="btn sm" onClick={() => setObj(o.id, { w: o.d, d: o.w })}>↻ Повернуть</button>}
        <button className="btn sm" onClick={onCopy}>Копия</button>
        <button className="btn sm danger" onClick={onDelete}>Удалить</button>
      </div>
    </div>
  );
}
