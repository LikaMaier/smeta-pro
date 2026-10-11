import React, { useMemo, useRef, useState } from 'react';
import type { buildCanopy } from '../../../shared/design/canopy';
import { render3d, drawings, view3dToSvg, sheetToSvg } from '../../../shared/design/render';

/** 3D-просмотр и чертежи проекта — общие для проектировщика и страницы заказчика */
/** 3D: вращение пальцем/мышью */
export function Viewer({ res }: { res: ReturnType<typeof buildCanopy> }) {
  const [ang, setAng] = useState({ yaw: -35, pitch: 24 });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const svg = useMemo(() => view3dToSvg(render3d(res, ang.yaw, ang.pitch, 640, 440)), [res, ang]);
  return (
    <div className="dz-3d" style={{ touchAction: 'none' }}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ...ang }; }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; setAng({ yaw: d.yaw + (e.clientX - d.x) * 0.5, pitch: Math.max(5, Math.min(70, d.pitch - (e.clientY - d.y) * 0.3)) }); }}
      onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="dz-3d-bar">
        <span className="xs muted">↔ вращайте пальцем</span>
        {[['Спереди', -35, 24], ['Сзади', 145, 24], ['Сверху', -35, 68]].map(([l, y, p]) => <button key={l as string} className="chip" onClick={() => setAng({ yaw: y as number, pitch: p as number })}>{l}</button>)}
      </div>
    </div>
  );
}

export function Drawings({ res, note = true }: { res: ReturnType<typeof buildCanopy>; note?: boolean }) {
  const sheets = useMemo(() => drawings(res), [res]);
  return (
    <div className="stack">
      {sheets.map((sh) => (
        <div key={sh.title} className="dz-sheet">
          <div className="dz-sheet-t">{sh.title}</div>
          <div dangerouslySetInnerHTML={{ __html: sheetToSvg(sh, 620) }} />
        </div>
      ))}
      {note && <p className="xs muted">Размеры на чертежах — в миллиметрах. Полный комплект (3D, план, 4 фасада, разрез основания, раскрой и ведомость) — в PDF.</p>}
    </div>
  );
}
