import React, { useState } from 'react';
import { Sheet } from './ui';

/** Обычный калькулятор «как на телефоне» — для быстрых прикидок на объекте */
type Op = '+' | '−' | '×' | '÷' | null;
const apply = (a: number, b: number, op: Op) => (op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : op === '÷' ? (b === 0 ? NaN : a / b) : b);
const fmt = (v: number) => (!Number.isFinite(v) ? 'Ошибка' : String(Math.round(v * 1e8) / 1e8).replace('.', ','));

export default function QuickCalc({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [disp, setDisp] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [fresh, setFresh] = useState(true);
  const [expr, setExpr] = useState('');
  const cur = () => Number(disp.replace(',', '.'));

  const digit = (d: string) => {
    if (disp === 'Ошибка') { setDisp(d === ',' ? '0,' : d); setFresh(false); return; }
    if (fresh) { setDisp(d === ',' ? '0,' : d); setFresh(false); return; }
    if (d === ',' && disp.includes(',')) return;
    if (disp.replace(/[-,]/g, '').length >= 14) return;
    setDisp(disp === '0' && d !== ',' ? d : disp + d);
  };
  const operator = (o: Op) => {
    const v = cur();
    const r = acc === null || fresh ? (acc === null ? v : acc) : apply(acc, v, op);
    setAcc(r); setOp(o); setFresh(true); setDisp(fmt(r)); setExpr(`${fmt(r)} ${o}`);
  };
  const equals = () => {
    if (op === null || acc === null) return;
    const r = apply(acc, cur(), op);
    setExpr(`${fmt(acc)} ${op} ${disp} =`);
    setDisp(fmt(r)); setAcc(null); setOp(null); setFresh(true);
  };
  const clear = () => { setDisp('0'); setAcc(null); setOp(null); setFresh(true); setExpr(''); };
  const back = () => { if (fresh) return; setDisp(disp.length > 1 ? disp.slice(0, -1) : '0'); };
  const pct = () => { const v = acc !== null ? (acc * cur()) / 100 : cur() / 100; setDisp(fmt(v)); setFresh(false); };

  const K = ({ k, cls, on }: { k: string; cls?: string; on: () => void }) => <button className={cls} onClick={on}>{k}</button>;
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="qcalc">
        <div className="expr num">{expr}</div>
        <div className="disp" aria-live="polite">{disp}</div>
        <div className="keys">
          <K k="C" cls="op" on={clear} /><K k="⌫" cls="op" on={back} /><K k="%" cls="op" on={pct} /><K k="÷" cls="op" on={() => operator('÷')} />
          {['7', '8', '9'].map((d) => <K key={d} k={d} on={() => digit(d)} />)}<K k="×" cls="op" on={() => operator('×')} />
          {['4', '5', '6'].map((d) => <K key={d} k={d} on={() => digit(d)} />)}<K k="−" cls="op" on={() => operator('−')} />
          {['1', '2', '3'].map((d) => <K key={d} k={d} on={() => digit(d)} />)}<K k="+" cls="op" on={() => operator('+')} />
          <K k="0" on={() => digit('0')} /><K k="00" on={() => { digit('0'); digit('0'); }} /><K k="," on={() => digit(',')} /><K k="=" cls="eq" on={equals} />
        </div>
      </div>
    </Sheet>
  );
}
