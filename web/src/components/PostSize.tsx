import React, { useEffect, useState } from 'react';
import { Field, NumInput } from './ui';
import { parseNum } from '../format';

/** Поле в мм с собственным текстом (пусто — «авто») */
function Mm({ label, v, auto, onV }: { label: string; v?: number; auto: string; onV: (x: number | undefined) => void }) {
  const [s, setS] = useState(v ? String(v) : '');
  useEffect(() => { if ((parseNum(s) || undefined) !== (v || undefined)) setS(v ? String(v) : ''); }, [v]); // eslint-disable-line
  return (
    <Field label={label}>
      <NumInput value={s} placeholder={auto} unit="мм" aria-label={label}
        onChange={(t) => { setS(t); const x = parseNum(t); onV(t.trim() === '' || !(x > 0) ? undefined : x); }} />
    </Field>
  );
}

/**
 * Свой размер столба: ширина × длина сечения × толщина стенки (у бруса — без стенки).
 * Пустые поля — сечение подбирается само по высоте и нагрузке.
 */
export default function PostSize({ a, b, t, auto, wood, onChange }: {
  a?: number; b?: number; t?: number; auto: string; wood?: boolean;
  onChange: (patch: { postA?: number; postB?: number; postT?: number }) => void;
}) {
  const [aa, bb, tt] = (auto || '').split('×');
  const custom = !!a;
  return (
    <>
      <div className={wood ? 'grid2' : 'grid3'}>
        <Mm label="Ширина" v={a} auto={aa || '—'} onV={(x) => onChange({ postA: x })} />
        <Mm label="Длина" v={b} auto={bb || aa || '—'} onV={(x) => onChange({ postB: x })} />
        {!wood && <Mm label="Стенка" v={t} auto={tt || '—'} onV={(x) => onChange({ postT: x })} />}
      </div>
      <p className="xs muted" style={{ margin: 0 }}>
        {custom ? <>Свой столб. <button className="linklike" onClick={() => onChange({ postA: undefined, postB: undefined, postT: undefined })}>Вернуть подбор ({auto.replace(/×0$/, '')})</button></> : <>Подобрано по высоте и нагрузке: {wood ? 'брус' : 'труба'} {auto}. Впишите свой размер — пересчитаются 3D, металл и смета.</>}
      </p>
    </>
  );
}
