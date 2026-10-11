import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, patch } from '../api';
import { Icon, Load, State, useLoad, useToast } from '../components/ui';
import { rub, n } from '../format';
import { haptic, tg } from '../tg';

type Item = { key: string; name: string; qty?: number; unit?: string; amount?: number; sub?: { key: string; name: string }[] };

/** Ведомость закупки: материалы из сметы (строки-материалы и «материал» в строках работ) + пункты «в составе» */
function buildList(e: any): Item[] {
  const out: Item[] = [];
  const comp = (l: any, prefix: string) => String(l.composition || '').split('\n').map((x) => x.replace(/^[-–•\s]+/, '').trim()).filter(Boolean)
    .map((x) => ({ key: `${prefix}|${x.toLowerCase()}`, name: x }));
  const merged = new Map<string, Item>();
  for (const l of e.lines || []) {
    const mat = Number(l.matPrice) || 0;
    const coef = Number(l.coef) || 1;
    if (l.type === 'material') {
      const key = `m|${l.name.trim().toLowerCase()}|${l.unit}`;
      const it = merged.get(key) || { key, name: l.name, qty: 0, unit: l.unit, amount: 0, sub: [] };
      it.qty! += Number(l.qty) || 0; it.amount! += (Number(l.qty) || 0) * (Number(l.price) || 0) * coef;
      merged.set(key, it);
    } else if (mat > 0 || l.composition) {
      const key = `w|${l.name.trim().toLowerCase()}|${l.unit}`;
      out.push({ key, name: `Материалы: ${l.name}`, qty: Number(l.qty) || 0, unit: l.unit, amount: mat > 0 ? (Number(l.qty) || 0) * mat * coef : undefined, sub: comp(l, key) });
    }
  }
  return [...merged.values(), ...out];
}

export default function Purchase() {
  const { id } = useParams();
  const est = useLoad(() => get<any>(`/estimates/${id}`), [id]);
  return <Load state={est}>{(e) => <PurchaseList e={e} />}</Load>;
}

function PurchaseList({ e }: { e: any }) {
  const toast = useToast();
  const items = useMemo(() => buildList(e), [e]);
  const [done, setDone] = useState<Set<string>>(() => new Set(Array.isArray(e.purchased) ? e.purchased : []));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => { patch(`/estimates/${e.id}/purchased`, { purchased: [...done] }).then(() => setDirty(false)).catch((er: any) => toast(er.message, true)); }, 700);
    return () => clearTimeout(t);
  }, [done, dirty]); // eslint-disable-line
  const toggle = (k: string) => { setDone((s) => { const c = new Set(s); c.has(k) ? c.delete(k) : c.add(k); return c; }); setDirty(true); haptic('light'); };

  const total = items.reduce((a, i) => a + (i.amount || 0), 0);
  const bought = items.reduce((a, i) => a + (done.has(i.key) ? i.amount || 0 : 0), 0);
  const listText = () => {
    const rows: string[] = [];
    for (const i of items) {
      if (done.has(i.key)) continue;
      if (i.key.startsWith('m|')) rows.push(`• ${i.name} — ${n(i.qty)} ${i.unit}`);
      const subs = (i.sub || []).filter((s) => !done.has(s.key));
      if (!i.key.startsWith('m|') && subs.length) rows.push(`• Для «${i.name.replace(/^Материалы: /, '')}» (${n(i.qty)} ${i.unit}):\n${subs.map((s) => `   – ${s.name}`).join('\n')}`);
    }
    return `Заявка на материалы — ${e.title}${e.address ? `, ${e.address}` : ''}:\n${rows.join('\n')}`;
  };
  const share = () => {
    const u = `https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(listText())}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(u); else window.open(u, '_blank');
  };
  const copy = async () => { try { await navigator.clipboard.writeText(listText()); toast('Список скопирован — вставьте поставщику'); } catch { toast('Не удалось скопировать', true); } };

  if (!items.length) return (
    <>
      <Link to={`/estimates/${e.id}`} className="list-item panel" style={{ marginBottom: 12 }}><div className="grow title">{e.title}</div><Icon.chevron className="chev" width={18} /></Link>
      <State title="Материалов в смете нет" text="Добавьте позиции с типом «Материал», цену материала в строке работы или пункты «в составе» — они появятся здесь списком для закупки." />
    </>
  );
  return (
    <>
      <Link to={`/estimates/${e.id}`} className="list-item panel" style={{ marginBottom: 12 }}><div className="grow"><div className="title">{e.title}</div><div className="xs muted">{e.address || 'Ведомость закупки'}</div></div><Icon.chevron className="chev" width={18} /></Link>
      {total > 0 && (
        <div className="panel">
          <div className="row between"><b>Куплено</b><b className="num">{rub(bought)} из {rub(total)}</b></div>
          <div className="progress" style={{ marginTop: 8 }}><i style={{ width: `${total ? Math.round((bought / total) * 100) : 0}%` }} /></div>
          <div className="xs muted" style={{ marginTop: 6 }}>Суммы — по ценам материалов в смете (для заказчика). Фактические расходы вносите в объект.</div>
        </div>
      )}
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={share}>Отправить поставщику в Telegram</button>
      <button className="btn block" style={{ marginTop: 8 }} onClick={copy}>Скопировать список</button>
      <div className="list" style={{ marginTop: 12 }}>
        {items.map((i) => (
          <div key={i.key} className="list-item" style={{ display: 'block' }}>
            <button className={`check-row ${done.has(i.key) ? 'on' : ''}`} onClick={() => toggle(i.key)} aria-pressed={done.has(i.key)}>
              <span className="box-ch">{done.has(i.key) ? '✓' : ''}</span>
              <span className="grow"><span className="title">{i.name}</span><br /><span className="xs muted">{n(i.qty)} {i.unit}{i.amount ? ` · ${rub(i.amount)}` : ''}</span></span>
            </button>
            {(i.sub || []).length > 0 && (
              <div style={{ marginTop: 8, paddingLeft: 32, display: 'grid', gap: 6 }}>
                {i.sub!.map((s) => (
                  <button key={s.key} className={`check-row ${done.has(s.key) || done.has(i.key) ? 'on' : ''}`} onClick={() => toggle(s.key)}>
                    <span className="box-ch" style={{ width: 18, height: 18 }}>{done.has(s.key) || done.has(i.key) ? '✓' : ''}</span><span className="grow small">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
