import React, { useState } from 'react';
import { get } from '../api';
import { Icon, Load, SearchBox, State, useDebounced, useLoad } from './ui';
import { rub } from '../format';

/** Позиция из прайса поставщика */
export interface BaseItem { name: string; unit: string; price: number; cat: string; code: string; perM2: number | null }
export const baseInfo = (d?: { source: string; city: string; date: string } | null) =>
  d ? `${d.source}, ${d.city.replace('Санкт-Петербург', 'СПб')}, цены на ${new Date(d.date).toLocaleDateString('ru-RU')}` : '';
/** Категория для справочника: раздел прайса без подраздела */
export const baseCategory = (it: BaseItem) => it.cat.split(' / ')[0] || 'Материалы';
export const baseNote = (it: BaseItem, d: any) => `${baseInfo(d)}, арт. ${it.code}`;

/** Результаты поиска по базе материалов для уже введённого запроса (без своего поля поиска) */
export function BaseResults({ q, onPick, limit = 20, title = true }: { q: string; onPick: (it: BaseItem, info: any) => void; limit?: number; title?: boolean }) {
  const res = useLoad(() => (q.trim().length >= 2 ? get<any>('/materials/search', { q, limit }) : Promise.resolve(null)), [q, limit]);
  if (q.trim().length < 2) return null;
  return (
    <Load state={res}>{(d) => (!d ? null : (
      <>
        {title && <div className="xs muted" style={{ margin: '12px 0 6px' }}>🏪 Прайс «{d.source}» · {d.city} · {new Date(d.date).toLocaleDateString('ru-RU')} — {d.items.length ? `найдено ${d.items.length}${d.items.length >= limit ? '+' : ''}` : 'ничего не найдено'}</div>}
        {d.items.length > 0 && (
          <div className="list">
            {d.items.map((it: BaseItem) => (
              <button key={it.code + it.name} className="list-item" onClick={() => onPick(it, d)}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title" style={{ fontSize: 14, lineHeight: 1.25 }}>{it.name}</div>
                  <div className="xs muted ellipsis">{it.cat}</div>
                </div>
                <div className="num right small" style={{ flex: 'none' }}>{rub(it.price)}<div className="xs muted">за {it.unit}{it.perM2 ? ` · ${rub(it.perM2)}/м²` : ''}</div></div>
                <Icon.plus width={18} style={{ color: 'var(--accent)', flex: 'none' }} />
              </button>
            ))}
          </div>
        )}
      </>
    ))}</Load>
  );
}

/** Поиск по всей базе материалов: своё поле поиска + результаты */
export default function MaterialBase({ onPick, hint }: { onPick: (it: BaseItem, info: any) => void; hint?: string }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  return (
    <>
      <p className="small muted" style={{ marginTop: 0 }}>{hint || 'Около 47 000 материалов с ценами из прайс-листа «Петрович» (Санкт-Петербург). Найдите и добавьте — цену потом можно поправить.'}</p>
      <SearchBox value={q} onChange={setQ} placeholder="Например: ОСБ 12, ГКЛ влагостойкий, кабель 3х2,5" />
      {dq.trim().length < 2 ? <State title="Введите название" text="Размеры можно писать как 12х1250, 60х60 или 3x2,5 — найдётся." /> : <BaseResults q={dq} onPick={onPick} limit={40} />}
    </>
  );
}
