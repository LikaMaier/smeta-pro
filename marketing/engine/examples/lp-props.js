// Реквизит для low-poly роликов: болгарка, стремянка, катушка-удлинитель, робот, бумаги, телефон-реплика.
const PROPS = (() => {
  const S = () => LP.S;
  /** болгарка: корпус вдоль оси x от точки h (рукоятка), диск в плоскости x-y на конце; guard — кожух, spin — угол, rD — радиус диска */
  function grinder(h, t, o = {}) {
    const s = S(), body = [h[0] + .34, h[1], h[2]], rD = o.rD || .0625, c = [h[0] + .36, h[1] - .02, h[2] + .07];
    LP.rod(h, body, .045, '#2b8a3e', { seg: 10, bias: -2 });
    LP.rod([h[0] + .1, h[1], h[2]], [h[0] + .1, h[1], h[2] - .16], .02, '#212529', { seg: 6, bias: -2 });
    s.cyl('z', c, rD, .006, o.discCol || '#868e96', { seg: 22, bias: -2.2, tf: (p) => M3.rotZ(p, c, o.spin || 0) });
    if (o.guard) { const n = 10; for (let i = 0; i < n; i++) { const a0 = Math.PI * .1 + i / n * Math.PI, a1 = Math.PI * .1 + (i + 1) / n * Math.PI, r = rD + .015; const P = (a, z) => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2] + z]; s.poly([P(a0, -.02), P(a1, -.02), P(a1, .02), P(a0, .02)], '#adb5bd', { two: true, bias: -2.3 }); s.poly([P(a0, -.02), P(a1, -.02), [c[0], c[1], c[2] - .02]], '#adb5bd', { two: true, bias: -2.3 }); } }
    return c;
  }
  /** стремянка/приставная: низ в (x, 0, z), верх наклонён к стене; steps — число ступеней */
  function ladder(base, top, w = .5, steps = 8, col = '#adb5bd') {
    const off = [0, 0, w / 2];
    LP.rod([base[0], base[1], base[2] - w / 2], [top[0], top[1], top[2] - w / 2], .03, col, { seg: 6 });
    LP.rod([base[0], base[1], base[2] + w / 2], [top[0], top[1], top[2] + w / 2], .03, col, { seg: 6 });
    for (let i = 1; i <= steps; i++) { const k = i / (steps + 1), p = [lerp(base[0], top[0], k), lerp(base[1], top[1], k), lerp(base[2], top[2], k)]; LP.rod([p[0], p[1], p[2] - w / 2], [p[0], p[1], p[2] + w / 2], .025, col, { seg: 5 }); }
    void off;
  }
  /** катушка удлинителя: unwound 0..1 — сколько размотано; hot 0..1 — нагрев */
  function reel(c, unwound, hot) {
    const s = S(), col = hot > .05 ? `rgb(${lerp(230, 255, hot) | 0},${lerp(120, 60, hot) | 0},${lerp(40, 20, hot) | 0})` : '#e8590c';
    s.cyl('z', c, .32, .06, '#f08c3a', { seg: 22, bias: -.3 }); s.cyl('z', [c[0], c[1], c[2] + .36], .32, .06, '#f08c3a', { seg: 22, bias: -.3 });
    s.cyl('z', [c[0], c[1], c[2] + .18], lerp(.27, .1, unwound), .3, hot > .05 ? col : '#212529', { seg: 22, bias: -.35, emit: hot > .5 });
    s.box(c[0] - .06, c[0] + .06, c[1] + .3, c[1] + .45, c[2] + .03, c[2] + .33, '#f8f9fa', { bias: -.4 });
  }
  /** робот-прораб */
  function robot(x, y, z, face, t, o = {}) {
    const s = S(), c = [x, y, z], T = (p) => M3.rotY([p[0] + x, p[1] + y, p[2] + z], c, face), tf = { tf: T, shadow: true };
    const step = o.walk ? Math.sin(t * 7) * .1 : 0;
    s.box(-.2, -.04, step > 0 ? step : 0, .75, -.1, .1, '#ced4da', tf); s.box(.04, .2, step < 0 ? -step : 0, .75, -.1, .1, '#ced4da', tf);
    s.box(-.3, .3, .75, 1.45, -.18, .18, o.body || '#e9ecef', tf); s.box(-.12, .12, 1.0, 1.25, .18, .19, '#4dabf7', { tf: T, emit: true });
    s.box(-.42, -.32, .85, 1.42, -.07, .07, '#ced4da', tf); s.box(.32, .42, o.wave ? 1.42 : .85, o.wave ? 1.95 + Math.sin(t * 8) * .05 : 1.42, -.07, .07, '#ced4da', tf);
    s.box(-.2, .2, 1.5, 1.85, -.17, .17, '#e9ecef', tf);
    for (const ex of [-.09, .09]) s.box(ex - .045, ex + .045, 1.64, 1.72, .17, .18, o.eyes || '#40c4ff', { tf: T, emit: true });
    LP.rod(T([0, 1.85, 0]), T([0, 2.05, 0]), .012, '#495057', { seg: 4 }); s.sphere(T([0, 2.07, 0]), .035, o.lamp || '#ff6b6b', { seg: 8, rings: 5, emit: true });
    if (o.hat !== false) s.sphere(T([0, 1.86, 0]), .22, '#f2c230', { seg: 10, rings: 6, sy: .45 });
  }
  /** стопка бумаг (договор, акт) */
  function papers(c, n, k = 1, col = '#f8f9fa') { const s = S(); for (let i = 0; i < n; i++) { const kk = clamp(k * n - i); if (kk <= 0) continue; const y = c[1] + i * .02 + (1 - eOut(kk)) * 1.2; s.box(c[0] - .3 + i * .01, c[0] + .3 + i * .01, y, y + .015, c[2] - .2, c[2] + .2, i % 3 === 2 ? '#e7f5ff' : col, { bias: -2 }); } }
  /** облачко-реплика над точкой (в FX) */
  function say(text, p, a, dy = -70, kind = 'w') { LP.label(text, p, 0, dy, a, kind, 18); }
  return { grinder, ladder, reel, robot, papers, say };
})();
