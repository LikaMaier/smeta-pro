import React, { useEffect, useMemo, useRef, useState } from 'react';
import { STARTER_PRICES } from '../../../shared/starterPrices';
import { normName } from '../../../shared/names';
import { rub } from '../format';

/** Позиция-подсказка: из «Моих расценок» (с id) или из общего справочника работ */
export type SuggestItem = { id?: string; name: string; unit: string; price: number; type?: string; category?: string; own?: boolean; raw?: any };

const nrm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
const split = (s: string) => nrm(s).split(/[^a-zа-я0-9]+/).filter(Boolean);
const isStarterNote = (it: any) => typeof it?.notes === 'string' && it.notes.startsWith('Примерная цена');

/** Индекс поиска: свои позиции + общий справочник (без дублей по названию) */
export function useSuggestIndex(own: any[] | undefined) {
  return useMemo(() => {
    const seen = new Set<string>();
    const out: (SuggestItem & { w: string[]; n: string })[] = [];
    for (const i of own || []) {
      if (i.active === false || i.deletedAt) continue;
      const k = normName(i.name);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ id: i.id, name: i.name, unit: i.unit, price: Number(i.price) || 0, type: i.type, category: i.category, own: !isStarterNote(i), raw: i, w: split(i.name), n: nrm(i.name) });
    }
    for (const p of STARTER_PRICES) {
      const k = normName(p.name);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...p, own: false, w: split(p.name), n: nrm(p.name) });
    }
    return out;
  }, [own]);
}

/** Подбор: каждое слово запроса — начало какого-то слова названия (порядок любой) */
export function suggest(index: ReturnType<typeof useSuggestIndex>, query: string, limit = 6): SuggestItem[] {
  const q = split(query);
  if (!q.length || q.join('').length < 2) return [];
  const full = nrm(query.trim());
  const scored: { it: SuggestItem; s: number }[] = [];
  for (const it of index) {
    let s = 0, ok = true;
    for (const t of q) {
      const pos = it.w.findIndex((w) => w.startsWith(t));
      if (pos < 0) {
        if (t.length >= 4 && it.n.includes(t)) { s += 1; continue; }
        ok = false; break;
      }
      s += pos === 0 ? 6 : 3;
    }
    if (!ok) continue;
    if (it.n === full) continue; // уже выбрано — не мешаем
    if (it.n.startsWith(full)) s += 8;
    if (it.own) s += 4;
    s -= it.name.length / 40;
    scored.push({ it, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.it);
}

/** Подсвечиваем совпавшие начала слов */
function Hl({ text, query }: { text: string; query: string }) {
  const q = split(query);
  if (!q.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const re = /[A-Za-zА-Яа-яЁё0-9]+|[^A-Za-zА-Яа-яЁё0-9]+/g;
  let m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    const w = m[0];
    const t = q.filter((x) => nrm(w).startsWith(x)).sort((a, b) => b.length - a.length)[0];
    parts.push(t ? <React.Fragment key={i++}><mark>{w.slice(0, t.length)}</mark>{w.slice(t.length)}</React.Fragment> : <React.Fragment key={i++}>{w}</React.Fragment>);
  }
  return <>{parts}</>;
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  onPick: (it: SuggestItem) => void;
  index: ReturnType<typeof useSuggestIndex>;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  ariaLabel?: string;
  /** что показать справа от поля (кнопка «…») */
  after?: React.ReactNode;
  rowClassName?: string;
};

/**
 * Поле названия с подсказками ПОД строкой (в потоке страницы, а не поверх):
 * ничего не перекрывает, не вылезает за экран, закрывается крестиком, Esc или выбором.
 */
export default function NameSuggest({ value, onChange, onPick, index, className, placeholder, readOnly, ariaLabel, after, rowClassName }: Props) {
  const [focus, setFocus] = useState(false);
  const [closed, setClosed] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const blurT = useRef<number>();
  const list = useMemo(() => (focus && !closed && !readOnly ? suggest(index, value) : []), [focus, closed, readOnly, index, value]);
  useEffect(() => setActive(0), [value]);
  useEffect(() => () => window.clearTimeout(blurT.current), []);
  // клавиатура телефона закрывает пол-экрана — держим строку и подсказки на виду
  useEffect(() => {
    if (!list.length || !box.current) return;
    const t = window.setTimeout(() => {
      const r = box.current?.getBoundingClientRect();
      const vh = window.visualViewport?.height ?? window.innerHeight;
      if (r && (r.bottom > vh - 8 || r.top < 60)) box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [list.length]);

  const pick = (it: SuggestItem) => { onPick(it); setClosed(true); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!list.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % list.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + list.length) % list.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(list[active]); }
    else if (e.key === 'Escape') setClosed(true);
  };

  return (
    <div ref={box} className="ns">
      <div className={rowClassName}>
        <input className={className} value={value} placeholder={placeholder} readOnly={readOnly} aria-label={ariaLabel}
          autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="done"
          role="combobox" aria-expanded={list.length > 0} aria-autocomplete="list"
          onChange={(e) => { onChange(e.target.value); setClosed(false); }}
          onFocus={() => { window.clearTimeout(blurT.current); setFocus(true); setClosed(false); }}
          onBlur={() => { blurT.current = window.setTimeout(() => setFocus(false), 180); }}
          onKeyDown={onKey} />
        {after}
      </div>
      {list.length > 0 && (
        <div className="ns-list" role="listbox" onMouseDown={(e) => e.preventDefault()}>
          <div className="ns-head">
            <span>Подходящие работы</span>
            <button type="button" className="ns-close" aria-label="Скрыть подсказки" onClick={() => setClosed(true)}>×</button>
          </div>
          {list.map((it, i) => (
            <button type="button" key={(it.id || '') + it.name} role="option" aria-selected={i === active}
              className={`ns-item ${i === active ? 'on' : ''}`} onClick={() => pick(it)}>
              <span className="ns-name"><Hl text={it.name} query={value} />{it.own && <span className="ns-own">моя</span>}</span>
              <span className="ns-meta">
                {it.category && <span className="ns-cat">{it.category}</span>}
                <span className="ns-price">{rub(it.price)}<span>/{it.unit}</span></span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
