import React, { useEffect, useRef, useState } from 'react';
import { Chips, Field, NumInput } from './ui';
import { parseNum } from '../format';
import { haptic } from '../tg';
import { OPENING_DEFAULT, type CanopyParams, type CanopyResult, type OpeningSpec, type Side } from '../../../shared/design/canopy';

const SIDE_LABEL: Record<Side, string> = { front: 'спереди', back: 'сзади', left: 'слева', right: 'справа' };
const ICON: Record<OpeningSpec['kind'], string> = { door: '🚪', window: '🪟', gate: '🚧' };
const uid = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Число с запятой: своё текстовое состояние, чтобы «0,» не превращалось в «0» на лету */
function Num({ v, onV, unit, label }: { v: number; onV: (x: number) => void; unit: string; label: string }) {
  const [s, setS] = useState(String(v).replace('.', ','));
  useEffect(() => { if (Math.abs(parseNum(s) - v) > 1e-6) setS(String(v).replace('.', ',')); }, [v]); // eslint-disable-line
  return <Field label={label}><NumInput value={s} onChange={(t) => { setS(t); const x = parseNum(t); if (Number.isFinite(x) && t.trim() !== '' && !/[,.]$/.test(t)) onV(x); }} unit={unit} aria-label={label} /></Field>;
}

/** Двери, окна и ворота: вручную — положение, размер, сторона; на схеме стены проём двигается пальцем */
export default function OpeningsEditor({ p, res, onChange }: { p: CanopyParams; res: CanopyResult; onChange: (patch: Partial<CanopyParams>) => void }) {
  const ops = Array.isArray(p.ops) ? p.ops : null;
  const [cur, setCur] = useState<string | null>(null);
  const [wall, setWall] = useState<Side | null>(null);
  const lenOf = (s: Side) => (s === 'front' || s === 'back' ? p.L : p.W);
  const sides = (['front', 'back', 'left', 'right'] as Side[]).filter((s) => !(p.attach && s === p.highSide));

  const toManual = () => {
    const list: OpeningSpec[] = res.openings.map((o) => ({
      id: uid(), kind: o.kind, side: o.side, at: r2((o.a0 + o.a1) / 2), w: r2(o.a1 - o.a0),
      h: r2(o.kind === 'window' ? o.h - (o.z0 || 0) : o.h), ...(o.kind === 'window' ? { sill: r2(o.z0 || 0.9) } : {}),
    }));
    onChange({ ops: list }); setCur(list[0]?.id || null); haptic('light');
  };
  const setOps = (list: OpeningSpec[]) => onChange({ ops: list, ...(list.some((o) => o.kind === 'gate') && p.gate === 'none' ? { gate: 'swing' } : {}) });
  const upd = (id: string, patch: Partial<OpeningSpec>) => setOps((ops || []).map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const addOp = (kind: OpeningSpec['kind']) => {
    const d = OPENING_DEFAULT[kind];
    const side: Side = (cur && ops?.find((o) => o.id === cur)?.side) || wall || (kind === 'gate' ? 'front' : sides[0]) || 'front';
    const L = lenOf(side);
    // ставим в самое свободное место стены
    const busy = (ops || []).filter((o) => o.side === side).map((o) => [o.at - o.w / 2, o.at + o.w / 2]).sort((a, b) => a[0] - b[0]);
    let best = { at: L / 2, gap: -1 }, prev = 0;
    for (const [a0, a1] of [...busy, [L, L]]) { const g = a0 - prev; if (g > best.gap) best = { at: (prev + a0) / 2, gap: g }; prev = Math.max(prev, a1); }
    const free = best.gap < 0 ? L : best.gap;
    const o: OpeningSpec = { id: uid(), kind, side, at: r2(best.at), w: r2(Math.max(0.4, Math.min(d.w, free - 0.3, L - 0.4))), h: d.h, ...(d.sill != null ? { sill: d.sill } : {}) };
    setOps([...(ops || []), o]); setCur(o.id); haptic('light');
  };

  if (!ops) return (
    <>
      <Field label="Ворота в передней стене"><Chips value={p.gate} onChange={(v) => onChange({ gate: v })} options={[{ value: 'none', label: 'Нет' }, { value: 'swing', label: 'Распашные' }, { value: 'sectional', label: 'Секционные' }]} /></Field>
      <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={p.door} onChange={(e) => onChange({ door: e.target.checked })} />Дверь 0,9×2,05 м (место подберётся между столбами)</label>
      <button className="btn block" onClick={toManual}>✏️ Настроить двери и окна вручную</button>
      <p className="xs muted" style={{ margin: 0 }}>Вручную: двигайте и меняйте размер дверей и ворот, добавляйте и убирайте окна на любой стене.</p>
    </>
  );

  const sel = ops.find((o) => o.id === cur) || null;
  const stripSide: Side = sel?.side || wall || ops[0]?.side || 'front';
  return (
    <>
      <WallStrip side={stripSide} len={lenOf(stripSide)} res={res} ops={ops} cur={cur} onPick={(id) => { setCur(id); }} onMove={(id, at) => upd(id, { at })} />
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="xs muted">Стена на схеме:</span>
        {sides.map((s) => <button key={s} className={`chip ${s === stripSide ? 'on' : ''}`} onClick={() => { const o = ops.find((q) => q.side === s); setWall(s); setCur(o ? o.id : null); }}>{SIDE_LABEL[s]} · {ops.filter((o) => o.side === s).length}</button>)}
      </div>
      {ops.length > 0 && (
        <div className="list">
          {ops.map((o) => (
            <button key={o.id} className={`list-item ${o.id === cur ? 'on' : ''}`} style={{ borderColor: o.id === cur ? 'var(--gold)' : undefined }} onClick={() => setCur(o.id === cur ? null : o.id)}>
              <span>{ICON[o.kind]}</span>
              <div className="grow small" style={{ textAlign: 'left' }}>{OPENING_DEFAULT[o.kind].label} {SIDE_LABEL[o.side]} · {String(o.w).replace('.', ',')}×{String(o.h).replace('.', ',')} м{o.kind === 'window' ? `, низ на ${String(o.sill ?? 0.9).replace('.', ',')} м` : ''}</div>
              <span className="xs muted">{o.id === cur ? 'свернуть' : 'изменить'}</span>
            </button>
          ))}
        </div>
      )}
      {sel && (
        <div className="panel stack" style={{ padding: 10 }}>
          <Field label="Стена"><Chips value={sel.side} onChange={(v) => (setWall(v), upd(sel.id, { side: v, at: Math.min(sel.at, lenOf(v) - sel.w / 2 - 0.1) }))} options={sides.map((s) => ({ value: s, label: SIDE_LABEL[s] }))} /></Field>
          <Field label={`Положение: центр в ${String(sel.at).replace('.', ',')} м от ${sel.side === 'left' || sel.side === 'right' ? 'передней' : 'левой'} стены`}>
            <input type="range" min={sel.w / 2 + 0.1} max={Math.max(sel.w / 2 + 0.1, lenOf(sel.side) - sel.w / 2 - 0.1)} step={0.05} value={sel.at} onChange={(e) => upd(sel.id, { at: r2(Number(e.target.value)) })} style={{ width: '100%' }} aria-label="Положение проёма" />
          </Field>
          <div className="grid2">
            <Num label="Ширина" v={sel.w} unit="м" onV={(x) => x >= 0.3 && x <= 30 && upd(sel.id, { w: x })} />
            <Num label="Высота" v={sel.h} unit="м" onV={(x) => x >= 0.3 && x <= 12 && upd(sel.id, { h: x })} />
            {sel.kind === 'window' && <Num label="Низ окна от пола" v={sel.sill ?? 0.9} unit="м" onV={(x) => x >= 0 && x <= 5 && upd(sel.id, { sill: x })} />}
            <Num label="Центр от угла" v={sel.at} unit="м" onV={(x) => x >= 0 && x <= 60 && upd(sel.id, { at: x })} />
          </div>
          {sel.kind === 'window' && <div className="row wrap" style={{ gap: 6 }}>{[[0.6, 0.6, 1.2, 'Маленькое'], [1.0, 1.0, 0.9, 'Обычное'], [1.2, 1.4, 0.8, 'Большое'], [0.8, 0.4, 1.6, 'Под потолком']].map(([w, h, s, l]) => <button key={l as string} className="chip" onClick={() => upd(sel.id, { w: w as number, h: h as number, sill: s as number })}>{l} {String(w).replace('.', ',')}×{String(h).replace('.', ',')}</button>)}</div>}
          {sel.kind === 'door' && <div className="row wrap" style={{ gap: 6 }}>{[[0.8, 2.0], [0.9, 2.05], [1.2, 2.05], [1.5, 2.1]].map(([w, h]) => <button key={w} className="chip" onClick={() => upd(sel.id, { w, h })}>{String(w).replace('.', ',')}×{String(h).replace('.', ',')}</button>)}</div>}
          {sel.kind === 'gate' && <Field label="Тип ворот"><Chips value={p.gate === 'none' ? 'swing' : p.gate} onChange={(v) => onChange({ gate: v })} options={[{ value: 'swing', label: 'Распашные' }, { value: 'sectional', label: 'Секционные' }]} /></Field>}
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => { const c = { ...sel, id: uid(), at: r2(Math.min(lenOf(sel.side) - sel.w / 2 - 0.1, sel.at + sel.w + 0.6)) }; setOps([...ops, c]); setCur(c.id); }}>Копия рядом</button>
            <button className="btn sm danger" onClick={() => { setOps(ops.filter((o) => o.id !== sel.id)); setCur(null); haptic('light'); }}>Убрать</button>
          </div>
        </div>
      )}
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn sm" onClick={() => addOp('window')}>+ Окно</button>
        <button className="btn sm" onClick={() => addOp('door')}>+ Дверь</button>
        {!ops.some((o) => o.kind === 'gate') && <button className="btn sm" onClick={() => addOp('gate')}>+ Ворота</button>}
        <button className="btn sm" onClick={() => { onChange({ ops: null }); setCur(null); }}>Вернуть авто</button>
      </div>
    </>
  );

}

/** Схема стены: контур по высоте кровли, проёмы — тянуть пальцем вдоль стены */
function WallStrip({ side, len, res, ops, cur, onPick, onMove }: { side: Side; len: number; res: CanopyResult; ops: OpeningSpec[]; cur: string | null; onPick: (id: string) => void; onMove: (id: string, at: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number } | null>(null);
  const pt = (t: number): [number, number] => (side === 'front' ? [t, 0] : side === 'back' ? [t, res.params.W] : side === 'left' ? [0, t] : [res.params.L, t]);
  const N = 24, tops = Array.from({ length: N + 1 }, (_, i) => res.topAt(...pt((len * i) / N)));
  const H = Math.max(...tops) + 0.3;
  const Y = (z: number) => H - z;
  const toT = (e: React.PointerEvent) => { const s = svg.current!; const m = s.createSVGPoint(); m.x = e.clientX; m.y = e.clientY; return m.matrixTransform(s.getScreenCTM()!.inverse()).x; };
  const fs = Math.max(0.16, len / 40);
  const built = new Map(res.openings.filter((o) => o.side === side).map((o) => [o.id, o]));
  return (
    <div className="site-plan" style={{ marginBottom: 6 }}>
      <svg ref={svg} viewBox={`-0.3 0 ${len + 0.6} ${H + 0.45}`} style={{ width: '100%', maxHeight: 230, display: 'block', touchAction: 'none' }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const o = ops.find((q) => q.id === d.id); if (!o) return; const at = Math.max(o.w / 2 + 0.1, Math.min(len - o.w / 2 - 0.1, toT(e) - d.dx)); onMove(d.id, Math.round(at * 20) / 20); }}
        onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
        <polygon points={[[0, Y(0)], ...tops.map((z, i) => [(len * i) / N, Y(z)]), [len, Y(0)]].map((q) => q.join(',')).join(' ')} fill="#EDE7DA" stroke="#555" strokeWidth={0.03} />
        <line x1={-0.3} y1={Y(0)} x2={len + 0.3} y2={Y(0)} stroke="#777" strokeWidth={0.04} />
        {ops.filter((o) => o.side === side).map((o) => {
          const b = built.get(o.id);
          const a0 = o.at - o.w / 2, a1 = o.at + o.w / 2; // пока тянем — по заданному, без задержки пересчёта
          const z0 = b ? b.z0 ?? 0.05 : o.kind === 'window' ? o.sill ?? 0.9 : 0.05, z1 = b ? b.h : z0 + o.h;
          const on = o.id === cur;
          return (
            <g key={o.id} style={{ cursor: 'grab' }} onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { id: o.id, dx: toT(e) - o.at }; onPick(o.id); }}>
              <rect x={a0} y={Y(z1)} width={a1 - a0} height={z1 - z0} fill={o.kind === 'window' ? '#BFDCEB' : o.kind === 'door' ? '#4A4E55' : '#9AA1AA'} stroke={on ? '#E65100' : '#333'} strokeWidth={on ? 0.07 : 0.03} />
              {o.kind === 'window' && <line x1={(a0 + a1) / 2} y1={Y(z1)} x2={(a0 + a1) / 2} y2={Y(z0)} stroke="#fff" strokeWidth={0.04} style={{ pointerEvents: 'none' }} />}
              <text x={(a0 + a1) / 2} y={Y(z0) + fs * 1.15 + (o.kind === 'window' ? 0 : 0.05)} fontSize={fs} textAnchor="middle" fill="#333" style={{ pointerEvents: 'none' }}>{String(r2(a1 - a0)).replace('.', ',')} м</text>
            </g>
          );
        })}
        <text x={0} y={H + 0.4} fontSize={fs * 0.9} fill="#666">Стена {SIDE_LABEL[side]}, {String(r2(len)).replace('.', ',')} м · тяните пальцем</text>
      </svg>
    </div>
  );
}
