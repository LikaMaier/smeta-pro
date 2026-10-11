import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post, del } from '../api';
import { Field, Icon, Load, NumInput, Sheet, State, useLoad, useToast } from '../components/ui';
import { rub, date, parseNum, n } from '../format';
import { confirmDialog, haptic, tg } from '../tg';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const FORM_LABEL: Record<string, string> = { act: 'Акт', ks2: 'КС-2', ks3: 'КС-3' };

/** Акты выполненных работ по смете: промежуточные акты, остаток работ, КС-2 и КС-3 */
export default function Acts() {
  const { id } = useParams();
  const toast = useToast();
  const data = useLoad(() => get<any>(`/estimates/${id}/acts`), [id]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');

  const send = async (actId: string, form: string) => {
    setBusy(`${actId}:${form}`);
    try { await post(`/acts/${actId}/send/${form}`); haptic('success'); toast(`${FORM_LABEL[form]} отправлен вам в чат бота`); }
    catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setBusy(''); }
  };
  const openDoc = async (actId: string, form: string) => {
    try {
      const { url } = await get(`/acts/${actId}/link/${form}`);
      const full = new URL(url, location.origin).toString();
      if (tg?.openLink) tg.openLink(full); else window.open(full, '_blank');
    } catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); }
  };

  return (
    <Load state={data}>{(d) => {
      const done = d.doneTotal || 0;
      const pct = d.estimate.total > 0 ? Math.min(100, Math.round((done / d.estimate.total) * 100)) : 0;
      const left = d.rows.filter((r: any) => r.left > 0);
      return (
        <>
          <Link to={`/estimates/${id}`} className="list-item panel" style={{ marginBottom: 12 }}>
            <div className="grow"><div className="title">{d.estimate.title}</div><div className="xs muted">Смета на {rub(d.estimate.total)}</div></div>
            <Icon.chevron className="chev" width={18} />
          </Link>
          <div className="panel">
            <div className="row between"><b>Закрыто актами</b><b className="num">{rub(done)} · {pct}%</b></div>
            <div className="progress" style={{ marginTop: 8 }}><i style={{ width: `${pct}%` }} /></div>
            <div className="xs muted" style={{ marginTop: 6 }}>Осталось выполнить: позиций {left.length}</div>
          </div>
          <button className="btn primary block lg" style={{ marginTop: 12 }} disabled={!left.length} onClick={() => setOpen(true)}><Icon.plus width={18} />Новый акт</button>
          {!left.length && d.rows.length > 0 && <p className="small muted">Все работы по смете закрыты актами 🎉</p>}

          <h2 className="section-title">Акты</h2>
          {d.acts.length ? (
            <div className="list">
              {d.acts.map((a: any) => (
                <div key={a.id} className="panel" style={{ padding: 12 }}>
                  <div className="row between">
                    <div><b>Акт № {a.number}</b> <span className="xs muted">от {date(a.date)}{a.periodFrom ? ` · с ${date(a.periodFrom)}` : ''} · позиций {a.items}</span></div>
                    <b className="num">{rub(a.total)}</b>
                  </div>
                  <div className="grid3" style={{ marginTop: 10 }}>
                    {['act', 'ks2', 'ks3'].map((f) => (
                      <button key={f} className="btn sm" disabled={!!busy} onClick={() => send(a.id, f)}>{busy === `${a.id}:${f}` ? '…' : FORM_LABEL[f]}</button>
                    ))}
                  </div>
                  <div className="row" style={{ marginTop: 8, gap: 12 }}>
                    <button className="xs" style={{ background: 'none', border: 0, color: 'var(--muted)', padding: 0, cursor: 'pointer' }} onClick={() => openDoc(a.id, 'act')}>Открыть акт</button>
                    <button className="xs" style={{ background: 'none', border: 0, color: 'var(--muted)', padding: 0, cursor: 'pointer' }} onClick={() => openDoc(a.id, 'ks2')}>Открыть КС-2</button>
                    <button className="xs" style={{ background: 'none', border: 0, color: 'var(--bad)', padding: 0, cursor: 'pointer', marginLeft: 'auto' }} onClick={async () => {
                      if (!(await confirmDialog(`Удалить акт № ${a.number}? Объёмы вернутся в остаток.`))) return;
                      await del(`/acts/${a.id}`); toast('Акт удалён'); data.reload();
                    }}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          ) : <State title="Актов пока нет" text="Сделали часть работ — отметьте объёмы и сформируйте промежуточный акт. В конце — акт на остаток." />}
          <p className="xs muted">КС-2 и КС-3 — унифицированные формы для заказчиков-организаций. Коды ОКПО и должности впишите при необходимости.</p>

          <h2 className="section-title">Выполнение по позициям</h2>
          <div className="list">
            {d.rows.map((r: any) => (
              <div key={r.key} className="list-item" style={{ display: 'block' }}>
                <div className="row between"><span className="ellipsis" style={{ maxWidth: '70%' }}>{r.name}</span><span className="xs muted num">{n(r.done)} из {n(r.qty)} {r.unit}</span></div>
                <div className="progress thin" style={{ marginTop: 6 }}><i style={{ width: `${r.pct}%` }} /></div>
              </div>
            ))}
          </div>

          <NewAct open={open} rows={d.rows} taxPct={d.estimate.taxPct} estimateId={id!} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); data.reload(); }} />
        </>
      );
    }}</Load>
  );
}

function NewAct({ open, rows, taxPct, estimateId, onClose, onSaved }: { open: boolean; rows: any[]; taxPct: number; estimateId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [sel, setSel] = useState<Record<string, string>>({});
  const [d, setD] = useState(today());
  const [from, setFrom] = useState('');
  const [saving, setSaving] = useState(false);
  const left = rows.filter((r) => r.left > 0);
  const sum = useMemo(() => left.reduce((a, r) => a + Math.min(parseNum(sel[r.key] || '0'), r.left) * r.unitPrice, 0), [sel, left]);
  const save = async () => {
    const items: Record<string, number> = {};
    for (const [k, v] of Object.entries(sel)) if (parseNum(v) > 0) items[k] = parseNum(v);
    if (!Object.keys(items).length) return toast('Укажите выполненные объёмы', true);
    setSaving(true);
    try { await post(`/estimates/${estimateId}/acts`, { date: d, periodFrom: from || null, items }); haptic('success'); toast('Акт создан'); setSel({}); onSaved(); }
    catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setSaving(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Новый акт">
      <div className="stack">
        <div className="grid2">
          <Field label="Дата акта"><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
          <Field label="Период с" hint="Необязательно"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        </div>
        <div className="row wrap">
          <button className="btn sm" onClick={() => setSel(Object.fromEntries(left.map((r) => [r.key, String(r.left)])))}>Закрыть всё оставшееся</button>
          <button className="btn sm ghost" onClick={() => setSel({})}>Очистить</button>
        </div>
        {left.map((r) => (
          <div key={r.key} className="panel" style={{ padding: 10 }}>
            <div className="small" style={{ fontWeight: 600 }}>{r.name}</div>
            <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center' }}>
              <div style={{ flex: 1 }}><NumInput value={sel[r.key] || ''} onChange={(v) => setSel((s) => ({ ...s, [r.key]: v }))} unit={r.unit} placeholder="0" invalid={parseNum(sel[r.key] || '0') > r.left} /></div>
              <button className="btn sm" onClick={() => setSel((s) => ({ ...s, [r.key]: String(r.left) }))}>всё: {n(r.left)}</button>
            </div>
            <div className="xs muted" style={{ marginTop: 4 }}>осталось {n(r.left)} из {n(r.qty)} {r.unit} · {rub(r.unitPrice)} за {r.unit}</div>
          </div>
        ))}
        <div className="box cresult"><div className="big num">По акту: {rub(sum * (1 + (taxPct || 0) / 100))}</div>{taxPct ? <div className="sub">в т.ч. налог {taxPct}%</div> : null}</div>
        <button className="btn primary block lg" disabled={saving} onClick={save}>{saving ? 'Сохраняю…' : 'Создать акт'}</button>
        <p className="xs muted" style={{ margin: 0 }}>Цены — из сметы, с учётом наценки, скидки и доставки пропорционально.</p>
      </div>
    </Sheet>
  );
}
