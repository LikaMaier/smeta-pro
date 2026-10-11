import React from 'react';

/** Иллюстрация главной: стройка на закате — кран, каркас дома, размерная линия. Цвета берутся из темы. */
export default function Hero({ title, sub }: { title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="hero">
      <div className="over"><b>{title}</b>{sub && <span>{sub}</span>}</div>
      <svg viewBox="0 6 400 128" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id="hz" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity=".18" />
          </linearGradient>
        </defs>
        <rect x="0" y="40" width="400" height="80" fill="url(#hz)" />
        {/* солнце */}
        <circle cx="318" cy="96" r="26" fill="var(--accent)" opacity=".22" />
        <circle cx="318" cy="96" r="17" fill="var(--accent)" opacity=".35" />
        {/* дальние дома */}
        <g fill="var(--surface-2)" opacity=".9">
          <rect x="196" y="78" width="26" height="42" /><rect x="226" y="66" width="20" height="54" /><rect x="250" y="84" width="30" height="36" />
          <rect x="350" y="72" width="22" height="48" /><rect x="374" y="88" width="26" height="32" />
        </g>
        {/* каркас строящегося дома */}
        <g stroke="var(--accent)" strokeWidth="1.6" fill="none" opacity=".9">
          <path d="M120 120 V62 H184 V120" />
          <path d="M120 82 H184 M120 101 H184 M141 62 V120 M163 62 V120" opacity=".7" />
          <path d="M116 62 L152 40 L188 62" />
        </g>
        {/* кран */}
        <g stroke="var(--text)" strokeWidth="1.4" fill="none" opacity=".75">
          <path d="M58 120 V22 M64 120 V22" />
          {[30, 42, 54, 66, 78, 90, 102, 114].map((y) => <path key={y} d={`M58 ${y} L64 ${y - 6}`} />)}
          <path d="M40 22 H176 M58 22 L61 12 L64 22" />
          <path d="M61 12 L150 22 M61 12 L44 22" opacity=".7" />
          <rect x="40" y="23" width="12" height="7" fill="var(--text)" opacity=".5" />
          <path d="M146 22 V48" strokeDasharray="2 2" />
        </g>
        <rect x="140" y="48" width="12" height="7" fill="var(--accent)" />
        {/* земля и размерная линия */}
        <path d="M0 120 H400" stroke="var(--gold)" strokeWidth="1.5" />
        <g stroke="var(--accent)" strokeWidth="1.2">
          <path d="M120 127 H184" /><path d="M120 123 V131 M184 123 V131" />
        </g>
      </svg>
    </div>
  );
}
