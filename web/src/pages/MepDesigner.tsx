import React, { useEffect, useMemo, useRef, useState } from 'react';
import { post } from '../api';
import { Chips, Field, NumInput, useDebounced } from '../components/ui';
import CalcResult from '../components/CalcResult';
import { Viewer, Drawings } from '../components/Design3D';
import { DesignActions, useDesignStore } from '../components/DesignActions';
import { n, parseNum } from '../format';
import { haptic } from '../tg';
import { buildMep, autoPlace, newMepId, roomAt, MEP_DEFAULT, MEP_PRESETS, POINT_TYPES, ROOM_TYPES, type MepParams, type MepPoint, type Room, type RoomType } from '../../../shared/design/mep';

/**
 * Электрика и сантехника 3D: комнаты → «Расставить по нормам» → трассы кабелей и труб, группы щита,
 * 3D в разрезе, план электрики, схема щита, план сантехники и смета.
 */
const DRAFT = 'smeta_mep_draft';
type Sys = 'el' | 'pl';
const CATS: Record<Sys, { cat: string; types: string[] }[]> = {
  el: [
    { cat: 'Розетки', types: ['socket', 'socket2', 'socketK', 'socketWet', 'net'] },
    { cat: 'Свет', types: ['light', 'spot', 'switch'] },
    { cat: 'Силовые', types: ['stove', 'oven', 'washer', 'dish', 'boilerEl', 'ac', 'floorHeat', 'panel'] },
  ],
  pl: [
    { cat: 'Приборы', types: ['toilet', 'install', 'sink', 'kitchenSink', 'bath', 'shower', 'washerW', 'dishW', 'boiler', 'towel'] },
    { cat: 'Ввод', types: ['riser', 'collector'] },
  ],
};

export default function MepDesigner() {
  const saved0 = useMemo(() => { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch { return null; } }, []);
  const [p, setP] = useState<MepParams>(() => saved0?.p || MEP_DEFAULT);
  const [title, setTitle] = useState<string>(saved0?.title || MEP_PRESETS[2].title);
  const [sys, setSys] = useState<Sys>('el');
  const [tab, setTab] = useState<'plan' | '3d' | 'draw' | 'est'>('plan');
  const [sel, setSel] = useState<{ t: 'room' | 'pt'; id: string } | null>(null);
  const dp = useDebounced(p, 200);
  const res = useMemo(() => buildMep(dp), [dp]);
  const store = useDesignStore('mep', title, p, saved0?.id || null);
  useEffect(() => { try { localStorage.setItem(DRAFT, JSON.stringify({ p, title, id: store.designId })); } catch { /* */ } }, [p, title, store.designId]);
  const total = Math.round(res.lines.reduce((a, l) => a + l.qty * (l.price || 0), 0));
  const errors = p.rooms.length ? [] : ['Добавьте хотя бы одну комнату'];
  const set = (patch: Partial<MepParams>) => setP((x) => ({ ...x, ...patch }));
  const apply = (np: MepParams, t?: string, id: string | null = null) => { setP(np); if (t) setTitle(t); setSel(null); store.setDesignId(id); };

  const usePreset = (i: number) => {
    const pr = MEP_PRESETS[i];
    const np: MepParams = { ...p, rooms: JSON.parse(JSON.stringify(pr.rooms)), points: [], object: pr.object, scheme: pr.object === 'house' ? 'collector' : 'tee' };
    apply({ ...np, points: autoPlace(np) }, pr.title);
  };
  const auto = () => {
    // заменяем точки выбранной системы, другие не трогаем
    const keep = p.points.filter((x) => POINT_TYPES[x.type]?.sys !== sys);
    setP({ ...p, points: [...keep, ...autoPlace(p, sys)] }); setSel(null); haptic('success');
  };
  const addPoint = (type: string) => {
    const r = p.rooms.find((x) => x.id === (sel?.t === 'room' ? sel.id : '')) || p.rooms[0];
    const pt: MepPoint = { id: newMepId(), type, x: r ? +(r.x + r.w / 2).toFixed(2) : 1, y: r ? +(r.y + r.d / 2).toFixed(2) : 1 };
    setP((x) => ({ ...x, points: [...x.points, pt] })); setSel({ t: 'pt', id: pt.id }); haptic('light');
  };
  const addRoom = () => {
    const xs = p.rooms.map((r) => r.x + r.w);
    const r: Room = { id: newMepId('r'), type: 'bedroom', name: 'Комната', x: xs.length ? Math.max(...xs) : 0, y: 0, w: 3, d: 3.5 };
    setP((x) => ({ ...x, rooms: [...x.rooms, r] })); setSel({ t: 'room', id: r.id });
  };
  const curRoom = sel?.t === 'room' ? p.rooms.find((r) => r.id === sel.id) : null;
  const curPt = sel?.t === 'pt' ? p.points.find((x) => x.id === sel.id) : null;
  const setRoom = (id: string, patch: Partial<Room>) => setP((x) => ({ ...x, rooms: x.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const setPt = (id: string, patch: Partial<MepPoint>) => setP((x) => ({ ...x, points: x.points.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));

  return (
    <>
      <div className="row wrap" style={{ gap: 6, margin: '0 0 8px' }}>
        <span className="xs muted">Планировки:</span>
        {MEP_PRESETS.map((pr, i) => <button key={pr.id} className="chip" onClick={() => usePreset(i)}>{pr.label}</button>)}
      </div>
      <Field label="Название проекта"><input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Chips value={sys} onChange={(v) => { setSys(v); setSel(null); }} options={[{ value: 'el', label: '⚡ Электрика' }, { value: 'pl', label: '🚰 Сантехника' }]} />
      <div className="dz-sum">{res.summary.map((s) => <div key={s.label}><span className="xs muted">{s.label}</span><b className="num">{n(s.value, 1)} <small>{s.unit}</small></b></div>)}</div>
      <Chips value={tab} onChange={setTab} options={[{ value: 'plan', label: 'План' }, { value: '3d', label: '3D' }, { value: 'draw', label: 'Чертежи' }, { value: 'est', label: 'Смета' }]} />

      {tab === 'plan' && (
        <>
          <button className="btn primary block" onClick={auto}>✨ Расставить {sys === 'el' ? 'электрику' : 'сантехнику'} по нормам</button>
          <MepPlan p={p} res={res} sys={sys} sel={sel} setSel={setSel} onMovePt={(id, x, y) => setPt(id, { x, y })} onMoveRoom={(id, x, y) => {
            // комната тянет за собой свои точки
            const r = p.rooms.find((q) => q.id === id)!; const dx = x - r.x, dy = y - r.y;
            setP((cur) => ({ ...cur, rooms: cur.rooms.map((q) => (q.id === id ? { ...q, x, y } : q)), points: cur.points.map((pt) => (roomAt([r], pt.x, pt.y) ? { ...pt, x: +(pt.x + dx).toFixed(2), y: +(pt.y + dy).toFixed(2) } : pt)) }));
          }} />
          <details className="rem-quick" style={{ margin: '6px 0' }}>
            <summary>+ Добавить точку вручную</summary>
          {CATS[sys].map((g) => (
            <div key={g.cat} className="row wrap" style={{ gap: 6, margin: '6px 0' }}>
              <span className="xs muted" style={{ minWidth: 64 }}>+ {g.cat}:</span>
              {g.types.map((t) => <button key={t} className="chip" onClick={() => addPoint(t)}>{POINT_TYPES[t].icon} {POINT_TYPES[t].label}</button>)}
            </div>
          ))}
          </details>
          <button className="btn sm" onClick={addRoom}>+ Комната</button>
          <p className="xs muted" style={{ margin: '4px 0' }}>Тяните комнаты и точки пальцем, нажмите — чтобы поменять размер или удалить.</p>

          {curRoom && (
            <div className="panel stack" style={{ padding: 10, marginTop: 8 }}>
              <div className="grid2">
                <Field label="Помещение"><select className="select" value={curRoom.type} onChange={(e) => { const t = e.target.value as RoomType; setRoom(curRoom.id, { type: t, name: ROOM_TYPES[t].label }); }}>{(Object.keys(ROOM_TYPES) as RoomType[]).map((t) => <option key={t} value={t}>{ROOM_TYPES[t].label}</option>)}</select></Field>
                <Field label="Название"><input className="input" value={curRoom.name} maxLength={40} onChange={(e) => setRoom(curRoom.id, { name: e.target.value })} /></Field>
                <Field label="Ширина"><NumInput value={String(curRoom.w)} onChange={(v) => { const x = parseNum(v); if (x >= 0.8 && x <= 30) setRoom(curRoom.id, { w: x }); }} unit="м" /></Field>
                <Field label="Длина"><NumInput value={String(curRoom.d)} onChange={(v) => { const x = parseNum(v); if (x >= 0.8 && x <= 30) setRoom(curRoom.id, { d: x }); }} unit="м" /></Field>
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                <button className="btn sm" onClick={() => setRoom(curRoom.id, { w: curRoom.d, d: curRoom.w })}>↻ Повернуть</button>
                <button className="btn sm danger" onClick={() => { setP((x) => ({ ...x, rooms: x.rooms.filter((r) => r.id !== curRoom.id), points: x.points.filter((pt) => !roomAt([curRoom], pt.x, pt.y)) })); setSel(null); }}>Удалить с точками</button>
              </div>
            </div>
          )}
          {curPt && (
            <div className="panel stack" style={{ padding: 10, marginTop: 8 }}>
              <div className="row between"><b>{POINT_TYPES[curPt.type].icon} {POINT_TYPES[curPt.type].label}</b><span className="xs muted">{roomAt(p.rooms, curPt.x, curPt.y)?.name || 'вне комнат'}</span></div>
              {POINT_TYPES[curPt.type].z !== 'ceil' && POINT_TYPES[curPt.type].sys === 'el' && <Field label="Высота установки"><NumInput value={String(curPt.z ?? POINT_TYPES[curPt.type].z)} onChange={(v) => { const x = parseNum(v); if (x >= 0 && x <= p.h) setPt(curPt.id, { z: x }); }} unit="м" /></Field>}
              <div className="row wrap" style={{ gap: 6 }}>
                {POINT_TYPES[curPt.type].sys === 'pl' && curPt.type !== 'riser' && <button className="btn sm" onClick={() => setPt(curPt.id, { pw: curPt.pd ?? POINT_TYPES[curPt.type].d, pd: curPt.pw ?? POINT_TYPES[curPt.type].w })}>↻ Повернуть</button>}
                <button className="btn sm" onClick={() => { const c = { ...curPt, id: newMepId(), x: +(curPt.x + 0.4).toFixed(2) }; setP((x) => ({ ...x, points: [...x.points, c] })); setSel({ t: 'pt', id: c.id }); }}>Копия</button>
                <button className="btn sm danger" onClick={() => { setP((x) => ({ ...x, points: x.points.filter((q) => q.id !== curPt.id) })); setSel(null); }}>Удалить</button>
              </div>
            </div>
          )}

          {sys === 'el' && res.groups.length > 0 && (
            <>
              <div className="csection">Щит: {res.groups.filter((g) => g.amp > 0).length} групп</div>
              <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="dz-table">
                  <thead><tr><th>№</th><th>Группа</th><th>Автомат</th><th>Кабель</th><th>Длина</th></tr></thead>
                  <tbody>{res.groups.map((g, i) => <tr key={g.name + i}><td>{i + 1}</td><td>{g.name} <span className="muted">· {g.pts.length} т.</span></td><td>{g.amp ? `${g.rcd ? 'дифавт.' : 'авт.'} ${g.amp} А` : '—'}</td><td>{g.cable}</td><td className="num">{g.len} м</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
          {sys === 'pl' && res.pipeLen.cold > 0 && <div className="dz-warn" style={{ borderColor: 'var(--ok)' }}>Вода: ХВС {res.pipeLen.cold} м, ГВС {res.pipeLen.hot} м · канализация Ø50 {res.pipeLen.s50} м, Ø110 {res.pipeLen.s110} м</div>}

          <div className="csection">Параметры</div>
          <div className="grid2">
            <Field label="Высота потолка"><NumInput value={String(p.h)} onChange={(v) => { const x = parseNum(v); if (x >= 2.2 && x <= 4.5) set({ h: x }); }} unit="м" /></Field>
            <Field label="Объект"><Chips value={p.object} onChange={(v) => set({ object: v })} options={[{ value: 'flat', label: 'Квартира' }, { value: 'house', label: 'Дом' }]} /></Field>
          </div>
          {sys === 'el' ? (
            <>
              <Field label="Проводка"><Chips value={p.wiring} onChange={(v) => set({ wiring: v })} options={[{ value: 'hidden', label: 'Скрытая (штроба)' }, { value: 'open', label: 'Открытая (гофра)' }]} /></Field>
              <Field label="Стены"><Chips value={p.walls} onChange={(v) => set({ walls: v })} options={[{ value: 'concrete', label: 'Бетон' }, { value: 'brick', label: 'Кирпич' }, { value: 'gkl', label: 'ГКЛ' }, { value: 'wood', label: 'Дерево' }]} /></Field>
            </>
          ) : (
            <>
              <Field label="Трубы"><Chips value={p.pipes} onChange={(v) => set({ pipes: v })} options={[{ value: 'ppr', label: 'Полипропилен PPR' }, { value: 'pex', label: 'Сшитый PEX' }]} /></Field>
              <Field label="Разводка воды"><Chips value={p.scheme} onChange={(v) => set({ scheme: v })} options={[{ value: 'tee', label: 'Тройниковая' }, { value: 'collector', label: 'Коллекторная' }]} /></Field>
            </>
          )}
        </>
      )}
      {tab === '3d' && <Viewer res={res} pitch={52} />}
      {tab === 'draw' && <Drawings res={res} note={false} />}
      {tab === 'est' && <CalcResult calcId="design-mep" suggestions={res.lines as any} estimateTitle={title} onAdded={async (estimateId: string) => { const id = await store.persist(); await post(`/designs/${id}/link`, { estimateId }); }} />}
      {res.warnings.map((w) => <div key={w} className="dz-warn">{w}</div>)}
      <p className="xs muted">Эскиз и расчёт материалов: трассы — схематично, сечения и автоматы — по типовым решениям. Окончательный проект электрики согласуйте с электриком.</p>

      <DesignActions kind="mep" title={title} params={p} errors={errors} total={total} persist={store.persist} designId={store.designId} setDesignId={store.setDesignId}
        onOpen={(d) => apply(d.params, d.title, d.id)} onEstimate={() => { setTab('est'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
    </>
  );
}

const WIRE_COL: Record<string, string> = { wireL: '#C79A00', wireS: '#E8772E', wireP: '#D32F2F', wireN: '#2E9C8F', pipeC: '#2F6FD6', pipeH: '#E04040', pipeS: '#6B7079' };

/** План: комнаты и точки тянутся пальцем; трассы выбранной системы — поверх */
function MepPlan({ p, res, sys, sel, setSel, onMovePt, onMoveRoom }: { p: MepParams; res: ReturnType<typeof buildMep>; sys: Sys; sel: { t: 'room' | 'pt'; id: string } | null; setSel: (v: any) => void; onMovePt: (id: string, x: number, y: number) => void; onMoveRoom: (id: string, x: number, y: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ t: 'room' | 'pt'; id: string; dx: number; dy: number } | null>(null);
  const xs = p.rooms.flatMap((r) => [r.x, r.x + r.w]), ys = p.rooms.flatMap((r) => [r.y, r.y + r.d]);
  const X0 = Math.min(0, ...xs) - 0.6, X1 = Math.max(4, ...xs) + 0.6, Y0 = Math.min(0, ...ys) - 0.6, Y1 = Math.max(4, ...ys) + 0.6;
  const Y = (y: number) => Y1 + Y0 - y;
  const fs = Math.max(0.22, (X1 - X0) / 40);
  const toM = (e: React.PointerEvent) => { const s = svg.current!; const pt = s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const m = pt.matrixTransform(s.getScreenCTM()!.inverse()); return { x: m.x, y: Y1 + Y0 - m.y }; };
  const kinds = sys === 'el' ? ['wireL', 'wireS', 'wireP', 'wireN'] : ['pipeS', 'pipeC', 'pipeH'];
  const snap = (v: number) => Math.round(v * 20) / 20;
  return (
    <div className="site-plan">
      <svg ref={svg} viewBox={`${X0} ${Y0} ${X1 - X0} ${Y1 - Y0}`} style={{ touchAction: 'none', width: '100%', display: 'block' }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const m = toM(e); if (d.t === 'pt') onMovePt(d.id, snap(m.x - d.dx), snap(m.y - d.dy)); else onMoveRoom(d.id, Math.round((m.x - d.dx) * 10) / 10, Math.round((m.y - d.dy) * 10) / 10); }}
        onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
        <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} fill="#F6F3EC" onPointerDown={() => setSel(null)} />
        {p.rooms.map((r) => {
          const on = sel?.t === 'room' && sel.id === r.id;
          return (
            <g key={r.id} onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); const m = toM(e); drag.current = { t: 'room', id: r.id, dx: m.x - r.x, dy: m.y - r.y }; setSel({ t: 'room', id: r.id }); }}>
              <rect x={r.x} y={Y(r.y + r.d)} width={r.w} height={r.d} fill={ROOM_TYPES[r.type]?.color || '#eee'} stroke={on ? '#E65100' : '#333'} strokeWidth={on ? 0.09 : 0.06} />
              <text x={r.x + 0.12} y={Y(r.y + r.d) + fs * 1.1} fontSize={fs} fill="#555" style={{ pointerEvents: 'none' }}>{r.name} · {Math.round(r.w * r.d * 10) / 10} м²</text>
            </g>
          );
        })}
        {res.members.filter((m) => kinds.includes(m.kind) && Math.abs(m.a[0] - m.b[0]) + Math.abs(m.a[1] - m.b[1]) > 0.01).map((m, i) => (
          <line key={i} x1={m.a[0]} y1={Y(m.a[1])} x2={m.b[0]} y2={Y(m.b[1])} stroke={WIRE_COL[m.kind]} strokeWidth={m.kind === 'pipeS' ? 0.07 : 0.045} strokeDasharray={m.kind === 'pipeS' ? '0.15 0.08' : undefined} style={{ pointerEvents: 'none' }} />
        ))}
        {p.points.filter((pt) => POINT_TYPES[pt.type]?.sys === sys).map((pt) => {
          const T = POINT_TYPES[pt.type], on = sel?.t === 'pt' && sel.id === pt.id;
          const big = T.sys === 'pl' && pt.type !== 'riser';
          const w = pt.pw ?? T.w, d = pt.pd ?? T.d;
          return (
            <g key={pt.id} style={{ cursor: 'grab' }} onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); const m = toM(e); drag.current = { t: 'pt', id: pt.id, dx: m.x - pt.x, dy: m.y - pt.y }; setSel({ t: 'pt', id: pt.id }); }}>
              {big ? <rect x={pt.x - w / 2} y={Y(pt.y) - d / 2} width={w} height={d} rx={0.05} fill="#fff" stroke={on ? '#E65100' : '#555'} strokeWidth={on ? 0.07 : 0.035} />
                : <circle cx={pt.x} cy={Y(pt.y)} r={fs * 0.62} fill="#fff" stroke={on ? '#E65100' : '#555'} strokeWidth={on ? 0.07 : 0.035} />}
              <text x={pt.x} y={Y(pt.y) + fs * 0.33} fontSize={fs * 0.9} textAnchor="middle" style={{ pointerEvents: 'none' }}>{T.icon}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
