import React, { useEffect, useMemo, useRef, useState } from 'react';
import { post } from '../api';
import { Chips, Field, NumInput, useDebounced } from '../components/ui';
import CalcResult from '../components/CalcResult';
import { Viewer, Drawings } from '../components/Design3D';
import { DesignActions, useDesignStore } from '../components/DesignActions';
import { n, parseNum } from '../format';
import { haptic } from '../tg';
import { buildMep, autoPlace, newMepId, roomAt, zoneRects, elDefaults, defaultPower, pointWatt, MEP_DEFAULT, MEP_PRESETS, POINT_TYPES, ROOM_TYPES, type MepParams, type MepPoint, type Room, type RoomType, type Check } from '../../../shared/design/mep';

/**
 * Электрика и сантехника 3D: комнаты → «Расставить по нормам» → трассы кабелей и труб, группы щита,
 * 3D в разрезе, план электрики, схема щита, план сантехники и смета.
 */
const DRAFT = 'smeta_mep_draft';
type Sys = 'el' | 'pl';
const CATS: Record<Sys, { cat: string; types: string[] }[]> = {
  el: [
    { cat: 'Розетки', types: ['socket', 'socket2', 'socketK', 'hood', 'socketWet', 'net'] },
    { cat: 'Свет', types: ['light', 'spot', 'switch'] },
    { cat: 'Силовые', types: ['stove', 'oven', 'washer', 'dish', 'boilerEl', 'ac', 'floorHeat', 'heatBoiler', 'socketOut', 'panel'] },
    { cat: 'Газ', types: ['gasPipe'] },
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
  // отмена: история состояний (перетаскивание пальцем схлопываем в один шаг)
  const hist = useRef<MepParams[]>([]);
  const last = useRef<{ p: MepParams; at: number }>({ p, at: 0 });
  const undoing = useRef(false);
  useEffect(() => {
    if (undoing.current) { undoing.current = false; last.current = { p, at: Date.now() }; return; }
    if (last.current.p === p) return;
    if (Date.now() - last.current.at > 700) { hist.current.push(last.current.p); if (hist.current.length > 40) hist.current.shift(); }
    last.current = { p, at: Date.now() };
  }, [p]);
  const undo = () => { const prev = hist.current.pop(); if (!prev) return; undoing.current = true; setP(prev); setSel(null); haptic('light'); };
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
    const np: MepParams = { ...p, rooms: JSON.parse(JSON.stringify(pr.rooms)), points: [], object: pr.object, scheme: pr.object === 'house' ? 'collector' : 'tee', ...elDefaults(pr.object, p.gas), power: undefined };
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
          <div className="row" style={{ gap: 6 }}>
            <button className="btn primary grow" onClick={auto}>✨ Расставить {sys === 'el' ? 'электрику' : 'сантехнику'} по нормам</button>
            <button className="btn" onClick={undo} aria-label="Отменить">↶</button>
          </div>
          {sys === 'el' && <NormBadge checks={res.checks} onOpen={() => document.getElementById('mep-norms')?.scrollIntoView({ behavior: 'smooth' })} />}
          <MepPlan p={p} res={res} sys={sys} sel={sel} bad={sys === 'el' ? new Set(res.checks.filter((c) => c.lvl === 'err').flatMap((c) => c.ids || [])) : new Set()} setSel={setSel} onMovePt={(id, x, y) => setPt(id, { x, y })} onMoveRoom={(id, x, y) => {
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
              {POINT_TYPES[curPt.type].z !== 'ceil' && POINT_TYPES[curPt.type].sys === 'el' && (
                <Field label="Высота установки" hint={HEIGHT_HINT[curPt.type] || HEIGHT_HINT[POINT_TYPES[curPt.type].cat]}>
                  <NumInput value={String(curPt.z ?? POINT_TYPES[curPt.type].z)} onChange={(v) => { const x = parseNum(v); if (x >= 0 && x <= p.h) setPt(curPt.id, { z: x }); }} unit="м" />
                  {(HEIGHTS[curPt.type] || []).length > 0 && <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>{HEIGHTS[curPt.type].map(([z, l]) => <button key={z} className={`chip ${(curPt.z ?? POINT_TYPES[curPt.type].z) === z ? 'on' : ''}`} onClick={() => setPt(curPt.id, { z })}>{l} · {String(z).replace('.', ',')} м</button>)}</div>}
                </Field>
              )}
              {POINT_TYPES[curPt.type].own && <Field label="Мощность прибора" hint="Из паспорта прибора — от неё зависят автомат и сечение кабеля"><NumInput value={String(pointWatt(curPt) / 1000)} onChange={(v) => { const x = parseNum(v); if (x > 0 && x <= 30) setPt(curPt.id, { watt: Math.round(x * 1000) }); }} unit="кВт" /></Field>}
              {(() => { const gi = res.groups.findIndex((g) => g.pts.some((q) => q.id === curPt.id)); const g = res.groups[gi]; return g ? <div className="xs muted">Группа {gi + 1}: {g.name}{g.amp ? ` · автомат C${g.amp}${g.rcd ? ' + УЗО 30 мА' : ''} · кабель ${g.cable} · до щита ${g.lmax} м` : ''}</div> : null; })()}
              {res.checks.filter((c) => c.ids?.includes(curPt.id) && c.lvl !== 'ok').map((c) => <div key={c.text} className={`dz-warn ${c.lvl === 'info' ? 'info' : ''}`}>{c.text}{c.norm && <div className="xs muted">{c.norm}</div>}</div>)}
              <div className="row wrap" style={{ gap: 6 }}>
                {POINT_TYPES[curPt.type].sys === 'pl' && curPt.type !== 'riser' && <button className="btn sm" onClick={() => setPt(curPt.id, { pw: curPt.pd ?? POINT_TYPES[curPt.type].d, pd: curPt.pw ?? POINT_TYPES[curPt.type].w })}>↻ Повернуть</button>}
                <button className="btn sm" onClick={() => { const c = { ...curPt, id: newMepId(), x: +(curPt.x + 0.4).toFixed(2) }; setP((x) => ({ ...x, points: [...x.points, c] })); setSel({ t: 'pt', id: c.id }); }}>Копия</button>
                <button className="btn sm danger" onClick={() => { setP((x) => ({ ...x, points: x.points.filter((q) => q.id !== curPt.id) })); setSel(null); }}>Удалить</button>
              </div>
            </div>
          )}

          {sys === 'el' && res.groups.length > 0 && (
            <>
              <div className="csection">Мощность и ввод</div>
              <PowerCard res={res} />
              <div className="csection">Щит: {res.groups.filter((g) => g.amp > 0).length} групп · {res.shield.size} модулей</div>
              <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="dz-table">
                  <thead><tr><th>№</th><th>Группа</th><th>Защита</th><th>Кабель</th><th>Длина</th><th>кВт</th><th>ΔU</th>{p.phases === 3 && <th>Фаза</th>}</tr></thead>
                  <tbody>{res.groups.map((g, i) => (
                    <tr key={g.name + i}>
                      <td>{i + 1}</td><td>{g.name} <span className="muted">· {g.pts.length} т.</span></td>
                      <td>{g.amp ? `${g.rcd ? 'диф. ' : ''}C${g.amp}` : '—'}</td>
                      <td>{g.cable}{g.upsized && <span title="Сечение увеличено из-за длины линии"> ↑</span>}</td>
                      <td className="num">{g.len} м</td>
                      <td className="num">{g.amp ? n(g.watt / 1000, 1) : '—'}</td>
                      <td className="num" style={{ color: g.du > 4 ? 'var(--bad)' : undefined }}>{g.amp ? `${n(g.du, 1)}%` : '—'}</td>
                      {p.phases === 3 && <td>{g.three ? 'L1–L3' : g.phase ? `L${g.phase}` : '—'}</td>}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <details className="rem-quick" style={{ margin: '6px 0' }}>
                <summary>Состав щита на DIN-рейке</summary>
                <div className="list" style={{ marginTop: 6 }}>
                  {res.shield.devices.map((d) => <div key={d.code} className="list-item" style={{ cursor: 'default' }}><b style={{ minWidth: 44 }}>{d.code}</b><div className="grow small">{d.name}{d.group ? <span className="muted"> · гр. {d.group}</span> : null}</div><span className="xs muted">{d.mod} мод.</span></div>)}
                </div>
                <p className="xs muted">Занято {res.shield.used} модулей из {res.shield.size} — резерв на будущее не меньше 20%. Компоновка — на листе «Электрощит» в чертежах.</p>
              </details>
              <div className="csection" id="mep-norms">Проверка по нормам</div>
              <NormList checks={res.checks} onPick={(id) => { setSel({ t: 'pt', id }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </>
          )}
          {sys === 'pl' && res.pipeLen.cold > 0 && <div className="dz-warn" style={{ borderColor: 'var(--ok)' }}>Вода: ХВС {res.pipeLen.cold} м, ГВС {res.pipeLen.hot} м · канализация Ø50 {res.pipeLen.s50} м, Ø110 {res.pipeLen.s110} м</div>}

          <div className="csection">Параметры</div>
          <div className="grid2">
            <Field label="Высота потолка"><NumInput value={String(p.h)} onChange={(v) => { const x = parseNum(v); if (x >= 2.2 && x <= 4.5) set({ h: x }); }} unit="м" /></Field>
            <Field label="Объект"><Chips value={p.object} onChange={(v) => set({ object: v, phases: elDefaults(v).phases })} options={[{ value: 'flat', label: 'Квартира' }, { value: 'house', label: 'Дом' }]} /></Field>
          </div>
          {sys === 'el' ? (
            <>
              <div className="grid2">
                <Field label="Ввод"><Chips value={String(p.phases || elDefaults(p.object).phases)} onChange={(v) => set({ phases: Number(v) as 1 | 3 })} options={[{ value: '1', label: '1 фаза' }, { value: '3', label: '3 фазы' }]} /></Field>
                <Field label="Выделенная мощность" hint={p.power ? 'по договору с энергосетью' : `не указана — заложено ${res.power.allow} кВт`}><NumInput value={p.power ? String(p.power) : ''} placeholder={`авто, от ${defaultPower(p.object, p.gas)}`} onChange={(v) => { const x = parseNum(v); set({ power: x > 0 && x <= 150 ? x : undefined }); }} unit="кВт" /></Field>
              </div>
              <Field label="Плита"><Chips value={p.gas ? 'gas' : 'el'} onChange={(v) => { const gas = v === 'gas'; const np = { ...p, gas }; setP({ ...np, points: [...p.points.filter((x) => POINT_TYPES[x.type]?.sys !== 'el'), ...autoPlace(np, 'el')] }); }} options={[{ value: 'el', label: 'Электрическая' }, { value: 'gas', label: 'Газовая' }]} /></Field>
              <Field label="Защита групп" hint="Дифавтомат — своя защита у каждой линии; УЗО на 2–3 группы — дешевле, но при утечке гаснут все три"><Chips value={p.protect || 'diff'} onChange={(v) => set({ protect: v })} options={[{ value: 'diff', label: 'Дифавтоматы' }, { value: 'rcd', label: 'УЗО + автоматы' }]} /></Field>
              <Field label="УЗИП (от грозы и скачков)"><Chips value={(p.spd ?? true) ? 'y' : 'n'} onChange={(v) => set({ spd: v === 'y' })} options={[{ value: 'y', label: 'Ставим' }, { value: 'n', label: 'Без УЗИП' }]} /></Field>
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
      {(sys === 'pl' || tab !== 'plan') && res.warnings.map((w) => <div key={w} className="dz-warn">{w}</div>)}
      <p className="xs muted">Эскиз и расчёт по ПУЭ, СП 256 и ГОСТ Р 50571: трассы схематичные, нагрузки — оценочные. Рабочий проект и подключение — за электриком с допуском.</p>

      <DesignActions kind="mep" title={title} params={p} errors={errors} total={total} persist={store.persist} designId={store.designId} setDesignId={store.setDesignId}
        onOpen={(d) => apply(d.params, d.title, d.id)} onEstimate={() => { setTab('est'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
    </>
  );
}

/** Типовые высоты установки (от чистого пола) */
const HEIGHTS: Record<string, [number, string][]> = {
  socket: [[0.3, 'обычная'], [0.9, 'у стола'], [1.1, 'кухня']], socket2: [[0.3, 'обычная'], [0.7, 'у кровати'], [0.9, 'у стола']],
  socketK: [[1.1, 'над столешницей']], socketWet: [[1.0, 'у зеркала'], [1.1, 'фен']], washer: [[1.0, 'над машиной'], [0.3, 'за машиной']],
  switch: [[0.9, 'у двери'], [0.8, 'для детей']], net: [[0.3, 'обычная'], [1.2, 'за ТВ']], ac: [[2.3, 'под потолком']], boilerEl: [[1.9, 'у бойлера']], hood: [[2.0, 'над шкафами']],
};
const HEIGHT_HINT: Record<string, string> = {
  switch: 'ПУЭ 7.1.51: со стороны ручки двери, до 1 м',
  socketWet: 'В ванной — вне зон 0–2: дальше 0,6 м от ванны и душа',
  Розетки: 'Обычно 0,3 м; над столешницей 1,1 м; у газа — не ближе 0,5 м',
};
const LVL: Record<Check['lvl'], string> = { err: '⛔', warn: '⚠️', info: 'ℹ️', ok: '✅' };

function NormBadge({ checks, onOpen }: { checks: Check[]; onOpen: () => void }) {
  const err = checks.filter((c) => c.lvl === 'err').length, warn = checks.filter((c) => c.lvl === 'warn').length;
  return (
    <button className={`dz-warn ${!err && !warn ? 'ok' : ''}`} style={{ width: '100%', textAlign: 'left', margin: '6px 0', borderColor: !err && !warn ? 'var(--ok)' : undefined }} onClick={onOpen}>
      {err || warn ? <>Проверка по нормам: <b>{err ? `${err} нарушен${err === 1 ? 'ие' : err < 5 ? 'ия' : 'ий'}` : ''}{err && warn ? ', ' : ''}{warn ? `${warn} замечан${warn === 1 ? 'ие' : warn < 5 ? 'ия' : 'ий'}` : ''}</b> — посмотреть</> : <>✅ По ПУЭ, СП 256 и ГОСТ Р 50571 нарушений нет</>}
    </button>
  );
}

function NormList({ checks, onPick }: { checks: Check[]; onPick: (id: string) => void }) {
  const order = { err: 0, warn: 1, ok: 2, info: 3 };
  const list = [...checks].sort((a, b) => order[a.lvl] - order[b.lvl]);
  if (!list.length) return null;
  return (
    <div className="list">
      {list.map((c, i) => (
        <div key={i} className="list-item" style={{ alignItems: 'flex-start', cursor: c.ids?.length ? 'pointer' : 'default' }} onClick={() => c.ids?.[0] && onPick(c.ids[0])}>
          <span style={{ minWidth: 22 }}>{LVL[c.lvl]}</span>
          <div className="grow small">{c.text}{c.norm && <div className="xs muted">{c.norm}</div>}</div>
          {c.ids?.length ? <span className="xs muted">показать</span> : null}
        </div>
      ))}
    </div>
  );
}

function PowerCard({ res }: { res: ReturnType<typeof buildMep> }) {
  const w = res.power;
  const pct = Math.min(100, Math.round((w.calc / w.allow) * 100));
  return (
    <div className="panel stack" style={{ padding: 10 }}>
      <div className="row between"><span className="small">Расчётная мощность</span><b className="num">{n(w.calc, 1)} из {n(w.allow, 1)} кВт</b></div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--line, #ddd)', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: pct > 100 || w.calc > w.allow ? 'var(--bad)' : pct > 85 ? '#E8A33E' : 'var(--ok)' }} /></div>
      <div className="xs muted">Установлено приборов на {n(w.inst, 1)} кВт — одновременно всё не работает, поэтому считаем с коэффициентами. Ток {n(w.iCalc, 1)} А.</div>
      <div className="small">Ввод: <b>{w.phases === 3 ? '3 фазы 400 В' : '1 фаза 230 В'}</b>, вводной автомат <b>C{w.inAmp}</b>, кабель ввода <b>{w.inCable}</b>{w.phaseKw.length ? <> · L1 {n(w.phaseKw[0], 1)} / L2 {n(w.phaseKw[1], 1)} / L3 {n(w.phaseKw[2], 1)} кВт</> : null}</div>
    </div>
  );
}

const WIRE_COL: Record<string, string> = { wireL: '#C79A00', wireS: '#E8772E', wireP: '#D32F2F', wireN: '#2E9C8F', pipeC: '#2F6FD6', pipeH: '#E04040', pipeS: '#6B7079' };

/** План: комнаты и точки тянутся пальцем; трассы выбранной системы — поверх */
function MepPlan({ p, res, sys, sel, bad, setSel, onMovePt, onMoveRoom }: { p: MepParams; res: ReturnType<typeof buildMep>; sys: Sys; sel: { t: 'room' | 'pt'; id: string } | null; bad: Set<string>; setSel: (v: any) => void; onMovePt: (id: string, x: number, y: number) => void; onMoveRoom: (id: string, x: number, y: number) => void }) {
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
        {sys === 'el' && zoneRects(p.points, p.rooms).map(({ z1: z, z2 }, i) => (
          <g key={`z${i}`} style={{ pointerEvents: 'none' }}>
            <rect x={z2.x0} y={Y(z2.y1)} width={z2.x1 - z2.x0} height={z2.y1 - z2.y0} fill="#2F6FD6" fillOpacity={0.08} stroke="#2F6FD6" strokeOpacity={0.5} strokeWidth={0.025} strokeDasharray="0.1 0.06" />
            <rect x={z.x0} y={Y(z.y1)} width={z.x1 - z.x0} height={z.y1 - z.y0} fill="#2F6FD6" fillOpacity={0.15} />
            <text x={z2.x0 + 0.05} y={Y(z2.y0) - 0.06} fontSize={fs * 0.6} fill="#1f4f9a">зона 2</text>
          </g>
        ))}
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
              {bad.has(pt.id) && <circle cx={pt.x} cy={Y(pt.y)} r={fs * 1.05} fill="none" stroke="#D32F2F" strokeWidth={0.06} style={{ pointerEvents: 'none' }} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
