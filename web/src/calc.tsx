import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getJob, jobDefaults, jobTotals, jobSections, clampSize, fmtNum, type FirstJob, type SizeField, type JobLine } from '../../shared/firstJobs';
import { calcLines, TIERS } from '../../shared/leadCalc';
import { TIER_LABEL, type Tier } from '../../shared/materialTiers';
import './calc.css';

/**
 * Калькулятор мастера для заказчика (без входа в Telegram): работа → размер → цена в трёх вариантах → телефон.
 * Цены — мастера (данные кладёт сервер в window.__CALC__), расчёт — те же мастера, что и в приложении.
 */
const D: any = (window as any).__CALC__ || null;
const money = (v: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(v || 0))} ₽`;
const qty = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(v);
type Step = 'job' | 'size' | 'result' | 'done';
const TIER_NOTE: Record<Tier, string> = { eco: 'надёжно и недорого', std: 'золотая середина', prem: 'материалы лучше' };
const asText = (j: FirstJob) => Object.fromEntries(Object.entries(jobDefaults(j).sizes).map(([k, v]) => [k, fmtNum(v)]));
const plural = (k: number, one: string, few: string, many: string) => {
  const a = k % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};

function Page() {
  const jobs = useMemo(() => ((D?.jobs || []) as string[]).map((id) => getJob(id)).filter(Boolean) as FirstJob[], []);
  const single = jobs.length === 1 ? jobs[0] : null;
  const [step, setStep] = useState<Step>(single ? 'size' : 'job');
  const [job, setJob] = useState<FirstJob | null>(single);
  const [raw, setRaw] = useState<Record<string, string>>(() => (single ? asText(single) : {}));
  const [opts, setOpts] = useState<Record<string, boolean>>(() => (single ? jobDefaults(single).opts : {}));
  const [tier, setTier] = useState<Tier>('std');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [site, setSite] = useState(''); // ловушка для ботов
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  const sizes = useMemo(() => (job ? Object.fromEntries(job.size.map((f) => [f.key, clampSize(f, raw[f.key])])) : {}), [job, raw]);
  const byTier = useMemo(() => {
    const out = {} as Record<Tier, JobLine[]>;
    for (const t of TIERS) { try { out[t] = job ? calcLines(job.id, sizes, opts, t, D?.own || {}) : []; } catch { out[t] = []; } }
    return out;
  }, [job, sizes, opts]);
  const lines = byTier[tier];
  const totals = jobTotals(lines);

  if (!D || !jobs.length) return <div className="card"><h1>Калькулятор недоступен</h1><p className="muted">Попросите мастера прислать ссылку заново.</p></div>;

  const pick = (j: FirstJob) => { setJob(j); setRaw(asText(j)); setOpts(jobDefaults(j).opts); setTier('std'); setStep('size'); };
  const send = async () => {
    setErr('');
    if (phone.replace(/\D/g, '').length < 10) { setErr('Укажите телефон — мастер перезвонит по нему'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/k/${D.token}/lead`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: job!.id, sizes, opts, tier, phone, name: name.trim() || undefined, comment: comment.trim() || undefined, site: site || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Не получилось отправить — попробуйте ещё раз');
      setStep('done');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="card head">
        {D.logo && <img className="logo" src={D.logo} alt="" />}
        <div><div className="company">{D.company}</div>{D.contacts && <div className="muted small pre">{D.contacts}</div>}</div>
      </div>

      {step === 'job' && (
        <div className="card">
          <div className="steps">Шаг 1 из 3</div>
          <h1>Сколько будет стоить? Посчитайте за минуту</h1>
          <p className="muted">Цены мастера, без звонков и регистрации. Выберите работу:</p>
          <div className="jobs">
            {jobs.map((j) => (
              <button key={j.id} className="job" onClick={() => pick(j)}>
                <span className="ico" aria-hidden="true">{j.icon}</span>
                <b>{j.title}</b>
                <small>{j.text}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'size' && job && (
        <div className="card">
          {jobs.length > 1 && <button className="back" onClick={() => setStep('job')}>← {job.icon} {job.title}</button>}
          <div className="steps">Шаг 2 из 3</div>
          <h1>{job.q}</h1>
          <p className="muted">Не знаете точно — оставьте как есть. Точный размер мастер уточнит на замере.</p>
          {job.size.map((f) => <Size key={f.key} f={f} value={raw[f.key] ?? ''} onChange={(v) => setRaw((x) => ({ ...x, [f.key]: v }))} />)}
          {!!job.opts?.length && (
            <>
              <div className="lbl">Что входит</div>
              {job.opts.map((o) => (
                <label key={o.key} className="opt">
                  <input type="checkbox" checked={Boolean(opts[o.key])} onChange={(e) => setOpts((x) => ({ ...x, [o.key]: e.target.checked }))} />
                  <span>{o.label}</span>
                </label>
              ))}
            </>
          )}
          <div className="live" aria-live="polite"><span className="muted small">Примерно, работы и материалы</span><b>{totals.total > 0 ? money(totals.total) : '—'}</b></div>
          <button className="btn main" disabled={!lines.length} onClick={() => setStep('result')}>Показать цену →</button>
        </div>
      )}

      {step === 'result' && job && (
        <>
          <div className="card">
            <button className="back" onClick={() => setStep('size')}>← Изменить размер</button>
            <div className="steps">Шаг 3 из 3</div>
            <h1>{job.name(sizes)}</h1>
            <div className="lbl">Материалы — какого класса?</div>
            <div className="tiers" role="radiogroup" aria-label="Класс материалов">
              {TIERS.map((t) => (
                <button key={t} role="radio" aria-checked={tier === t} className={`tier${tier === t ? ' on' : ''}${t === 'std' ? ' mid' : ''}`} onClick={() => setTier(t)}>
                  <span>{TIER_LABEL[t]}</span>
                  <b>{money(jobTotals(byTier[t]).total)}</b>
                  <small>{TIER_NOTE[t]}</small>
                </button>
              ))}
            </div>
            <div className="total">
              <span className="muted small">Итого, работы и материалы</span>
              <b>{money(totals.total)}</b>
              <span className="muted small">работы {money(totals.works)} · материалы {money(totals.mats)}</span>
            </div>
            <details className="what">
              <summary>Что входит — {lines.length} {plural(lines.length, 'позиция', 'позиции', 'позиций')}</summary>
              {jobSections(lines).map((s) => (
                <div key={s.title} className="sec">
                  <div className="sec-h"><span>{s.title}</span><b>{money(s.sum)}</b></div>
                  {s.lines.map((l, i) => <div key={i} className="ln"><span>{l.name} · {qty(l.qty)} {l.unit}</span><span>{money(l.qty * l.price)}</span></div>)}
                </div>
              ))}
            </details>
            <p className="muted small">Предварительный расчёт по ценам мастера. Точную стоимость мастер подтвердит после замера.</p>
          </div>
          <div className="card">
            <h2>Отправить расчёт мастеру</h2>
            <p className="muted small" style={{ marginTop: 0 }}>Мастер получит этот расчёт и перезвонит, чтобы договориться о замере.</p>
            <input className="in" placeholder="Ваше имя" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <input className="in" type="tel" inputMode="tel" placeholder="Телефон *" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            <textarea className="in" rows={3} maxLength={500} placeholder="Адрес, сроки, пожелания — необязательно" value={comment} onChange={(e) => setComment(e.target.value)} />
            <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={site} onChange={(e) => setSite(e.target.value)} />
            {err && <div className="err" role="alert">{err}</div>}
            <button className="btn main" disabled={busy} onClick={send}>{busy ? 'Отправляю…' : 'Отправить мастеру'}</button>
            <p className="muted xs">Нажимая кнопку, вы передаёте имя и телефон мастеру, чтобы он с вами связался.</p>
          </div>
        </>
      )}

      {step === 'done' && job && (
        <div className="card center">
          <div className="big" aria-hidden="true">✅</div>
          <h1>Заявка у мастера</h1>
          <p>Мастер получил расчёт «{job.name(sizes)}» на <b>{money(totals.total)}</b> и перезвонит по номеру {phone}.</p>
          <button className="btn" onClick={() => { setErr(''); setStep(jobs.length > 1 ? 'job' : 'size'); }}>Посчитать другую работу</button>
        </div>
      )}

      {!D.hideBrand && <div className="foot">Калькулятор сделан в {D.botUrl ? <a href={D.botUrl}>СМЕТА PRO</a> : 'СМЕТА PRO'}.<br />Вы мастер? {D.botUrl ? <a href={D.botUrl}>Сделайте себе такой же — бесплатно</a> : 'Сделайте себе такой же — бесплатно'}</div>}
    </>
  );
}

function Size({ f, value, onChange }: { f: SizeField; value: string; onChange: (v: string) => void }) {
  const cur = clampSize(f, value);
  const by = (d: number) => onChange(fmtNum(clampSize(f, Math.round((cur + d * f.step) / f.step) * f.step)));
  return (
    <div className="size">
      <div className="lbl">{f.label}</div>
      <div className="num">
        <button type="button" aria-label={`Меньше: ${f.label}`} disabled={cur <= f.min} onClick={() => by(-1)}>−</button>
        <div className="val">
          <input inputMode="decimal" value={value} aria-label={`${f.label}, ${f.unit}`}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))} onBlur={() => onChange(fmtNum(clampSize(f, value)))} />
          <span>{f.unit}</span>
        </div>
        <button type="button" aria-label={`Больше: ${f.label}`} disabled={cur >= f.max} onClick={() => by(1)}>+</button>
      </div>
      {f.presets && <div className="chips">{f.presets.map((p) => <button key={p} type="button" className={cur === p ? 'on' : ''} onClick={() => onChange(fmtNum(p))}>{fmtNum(p)} {f.unit}</button>)}</div>}
      {f.hint && <div className="muted xs">{f.hint}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Page />);
