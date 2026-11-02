// «Спокойный low-poly» стиль обучающих роликов: разрез грунта, домики, деревья-многогранники,
// человечек-строитель, белые выноски с линией, плавная камера. Нужны drain-common.js, mini3d.js, pfx.js.
const LP = (() => {
  const P = {
    skyT: '#c4ccd3', skyB: '#e9ebe8', grass: '#9cc46a', grassSide: '#86ad57', soil: '#c0905c', soilBack: '#a67a4c', soilDark: '#9c7146',
    speck: '#9a6f45', walk: '#dcdcd6', road: '#5f6266', wallW: '#ece6dc', roof: '#9b3f30', fence: '#f6f5f0', trunk: '#7d5a3a',
    leaf: ['#8dbd59', '#7caf4d', '#99c864', '#86b856'], pipe: '#eeeeea', water: '#5fb4e6', sand: '#e4cf98', gravel: '#9a9690', concrete: '#b9bcbd',
  };
  let S, FX;
  const { sub, add, mul, norm, dot, rotY, rotX, rotZ } = M3;
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  document.head.insertAdjacentHTML('beforeend', `<style>
#cv { position: absolute; inset: 0; }
#fx { position: absolute; inset: 0; z-index: 9; pointer-events: none; }
#sub { bottom: 205px; font-size: 27px; color: #1d2b3a; -webkit-text-stroke: 0; min-height: 0; }
#sub span { display: inline-block; background: rgba(255,255,255,.94); padding: 10px 18px 11px; border-radius: 20px; box-shadow: 0 8px 24px rgba(0,0,0,.18); }
#sub b { color: #d9480f; }
#hook { top: 92px; font-size: 37px; color: #1d2b3a; -webkit-text-stroke: 0; }
#hook span { display: inline-block; background: rgba(255,255,255,.95); padding: 12px 22px 14px; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,.2); }
#hook b { color: #d9480f; }
#chip { position: absolute; left: 20px; top: 92px; z-index: 16; font-family: 'PT'; font-size: 21px; color: #fff; background: #1d2b3a; padding: 7px 14px; border-radius: 14px; opacity: 0; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
#chip i { font-style: normal; color: #ffc078; }
</style>`);

  function init() {
    S = new M3.Scene($('cv'));
    S.fogColor = [228, 231, 231]; S.fog = [26, 85]; S.amb = .6; S.dif = .48; S.ao = .22; S.aoH = 1.1; S.shadowA = .16;
    S.L = norm([-.5, .8, .45]);
    FX = $('fx').getContext('2d');
    return S;
  }
  function sky() {
    const x = S.ctx; x.setTransform(2, 0, 0, 2, 0, 0);
    const g = x.createLinearGradient(0, 0, 0, 960); g.addColorStop(0, P.skyT); g.addColorStop(.6, P.skyB); g.addColorStop(1, '#f1f1ec');
    x.fillStyle = g; x.fillRect(0, 0, 540, 960);
    FX.setTransform(2, 0, 0, 2, 0, 0); FX.clearRect(0, 0, 540, 960);
  }
  /** стержень/труба между любыми точками */
  function rod(p0, p1, r, color, o = {}) {
    const n = o.seg || 8, d = norm(sub(p1, p0)), u = norm(cross(d, Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0])), v = cross(d, u);
    const ring = (p, rr) => [...Array(n)].map((_, i) => { const a = i / n * Math.PI * 2; return add(p, add(mul(u, Math.cos(a) * rr), mul(v, Math.sin(a) * rr))); });
    const A = ring(p0, r), B = ring(p1, o.r2 ?? r), c = mul(add(p0, p1), .5), oo = { ...o, center: c, smooth: o.flat ? false : true };
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; S.poly([A[i], A[j], B[j], B[i]], color, oo); }
    if (o.caps !== false) { S.poly(A, o.cap || color, { ...o, center: c }); S.poly(B.slice().reverse(), o.cap || color, { ...o, center: c }); }
  }
  /** труба по ломаной с муфтами на изломах */
  function pipe(pts, r, color = P.pipe, o = {}) {
    for (let i = 0; i < pts.length - 1; i++) rod(pts[i], pts[i + 1], r, color, { seg: 12, caps: false, ...o });
    for (let i = 1; i < pts.length - 1; i++) S.sphere(pts[i], r * 1.18, color, { seg: 10, rings: 6, ...o });
  }
  function tree(x, z, s = 1, k = 0) {
    rod([x, 0, z], [x, 1.5 * s, z], .12 * s, P.trunk, { seg: 6, shadow: true, flat: true });
    S.sphere([x, 2.15 * s, z], 1.0 * s, P.leaf[k % 4], { seg: 7, rings: 5, shadow: true });
    S.sphere([x + .55 * s, 1.75 * s, z + .2 * s], .62 * s, P.leaf[(k + 1) % 4], { seg: 6, rings: 4, shadow: true });
    S.sphere([x - .5 * s, 2.55 * s, z - .15 * s], .55 * s, P.leaf[(k + 2) % 4], { seg: 6, rings: 4 });
  }
  function fence(x0, x1, z, h = .95) {
    for (let x = x0; x <= x1; x += .26) S.box(x - .045, x + .045, 0, h, z - .025, z + .025, P.fence, { shadow: true });
    for (const y of [h * .3, h * .75]) S.box(x0, x1, y - .04, y + .04, z - .07, z - .03, P.fence);
  }
  function gable(x0, x1, z0, z1, yW, yR, color, ov = .35) {
    const xm = (x0 + x1) / 2, c = [xm, (yW + yR) / 2, (z0 + z1) / 2];
    S.poly([[x0 - ov, yW - .15, z1 + ov], [xm, yR, z1 + ov], [xm, yR, z0 - ov], [x0 - ov, yW - .15, z0 - ov]], color, { center: c, shadow: true });
    S.poly([[xm, yR, z1 + ov], [x1 + ov, yW - .15, z1 + ov], [x1 + ov, yW - .15, z0 - ov], [xm, yR, z0 - ov]], color, { center: c, shadow: true });
    return c;
  }
  function bgHouse(x, z, w, d, h, wall = '#e9e4dc', roof = '#8c6f62') {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    S.box(x0, x1, 0, h, z0, z1, wall, { shadow: true });
    const c = gable(x0, x1, z0, z1, h, h + w * .38, roof, .25);
    S.poly([[x0, h, z1], [x1, h, z1], [x, h + w * .38, z1]], wall, { center: c });
    for (const wx of [x - w * .3, x + w * .12]) S.poly([[wx, h * .35, z1 + .02], [wx + w * .17, h * .35, z1 + .02], [wx + w * .17, h * .75, z1 + .02], [wx, h * .75, z1 + .02]], '#7c9ba3', { two: true, bias: -.05 });
    S.poly([[x + w * .33, 0, z1 + .02], [x + w * .45, 0, z1 + .02], [x + w * .45, h * .62, z1 + .02], [x + w * .33, h * .62, z1 + .02]], '#9a5a44', { two: true, bias: -.05 });
  }
  /** фон: соседние дома, деревья, забор, дорога. o.road — z дороги */
  function backdrop(o = {}) {
    const zf = o.fenceZ ?? -9;
    S.box(-40, 40, -.02, 0, -60, zf - 3.2, P.grass, { groundTop: true });
    if (o.road !== false) { S.box(-40, 40, -.01, .01, zf - 3.2, zf - .6, P.road, { groundTop: true }); S.box(-40, 40, 0, .06, zf - .6, zf + .2, P.walk, { groundTop: true }); }
    const H = o.houses || [[-9, -20, 6, 5, 3.4, '#ece5da', '#8d6e60'], [2, -21, 7, 6, 3.6, '#e2e7ea', '#6f6a66'], [12, -19, 6, 5, 3.2, '#efe6d6', '#a0574a'], [-20, -19, 6, 5, 3.4, '#e6e0d8', '#7f6a5c']];
    H.forEach((h) => bgHouse(...h));
    (o.trees || [[-4, -16, 1.1, 0], [7, -15, 1.25, 1], [16, -14, 1.1, 2], [-14, -15, 1.2, 3], [-24, -13, 1.1, 1]]).forEach((t) => tree(...t));
    if (o.fence !== false) fence(o.fx0 ?? -26, o.fx1 ?? 22, zf);
  }
  const SPECK = [...Array(70)].map((_, i) => [R(i * 3 + 1), R(i * 3 + 2), .05 + R(i * 3 + 3) * .07]);
  /** грунт с разрезом по плоскости z=0. holes: [{x0, x1, y (дно, <0), z0 (задняя стенка, <0)}] */
  function ground(o) {
    const { x0, x1, zBack = -9, yB = -9 } = o, holes = (o.holes || []).filter((h) => h.y < -.01 && h.x1 > h.x0);
    const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h.x0, h.x1])])].filter((v) => v >= x0 && v <= x1).sort((a, b) => a - b);
    const blk = (a, b, y0, y1, z0, z1, back) => {
      if (y1 - y0 < .005 || b - a < .005) return;
      const sc = back ? P.soilBack : P.soil;
      if (y1 > -.001) { S.box(a, b, y0, 0, z0, z1, sc, { top: P.grass, side: P.soilBack, groundTop: true }); if (z1 > -.01) S.poly([[a, -.14, .003], [b, -.14, .003], [b, 0, .003], [a, 0, .003]], P.grassSide, { two: true, bias: -.55 }); }
      else S.box(a, b, y0, y1, z0, z1, sc, { top: P.soilDark, side: P.soilBack });
    };
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i + 1], m = (a + b) / 2, h = holes.find((q) => m > q.x0 && m < q.x1 && q.y < -.01);
      if (!h) blk(a, b, yB, 0, zBack, 0);
      else { blk(a, b, yB, h.y, zBack, 0); blk(a, b, h.y, 0, zBack, h.z0, true); }
    }
    for (const [u, v, s] of SPECK) {
      const x = lerp(x0 + .3, x1 - .3, u), y = lerp(yB + .2, -.3, v);
      if (holes.some((h) => x > h.x0 - .1 && x < h.x1 + .1 && y > h.y - .1 && h.y < -.01)) continue;
      S.poly([[x - s, y - s * .6, .004], [x + s, y - s * .7, .004], [x + s * .7, y + s * .6, .004], [x - s * .8, y + s * .5, .004]], P.speck, { two: true, bias: -.6 });
    }
  }
  /** человечек-строитель; face — угол поворота (0 — лицом к камере); pose: 'stand' | 'dig' | 'walk' | 'point' */
  function person(x, y, z, face, t, pose = 'stand', o = {}) {
    const c = [x, y, z], T = (q) => rotY(add(q, c), c, face);
    const part = (x0, x1, y0, y1, z0, z1, col, tf) => S.box(x0, x1, y0, y1, z0, z1, col, { tf: tf ? (p) => T(tf(p)) : T, shadow: true });
    const walk = pose === 'walk' ? Math.sin(t * 7) * .45 : 0;
    const legA = walk, legB = -walk;
    const hipL = [-.09, .88, 0], hipR = [.09, .88, 0];
    part(-.17, -.02, .02, .88, -.08, .08, '#34507e', (p) => rotX(p, hipL, legA));
    part(.02, .17, .02, .88, -.08, .08, '#34507e', (p) => rotX(p, hipR, legB));
    part(-.18, -.01, 0, .07, -.09, .14, '#3a3530', (p) => rotX(p, hipL, legA));
    part(.01, .18, 0, .07, -.09, .14, '#3a3530', (p) => rotX(p, hipR, legB));
    const lean = pose === 'dig' ? .25 + Math.max(0, Math.sin(t * 3.2)) * .25 : 0, hip = [0, .88, 0];
    const body = (p) => rotX(p, hip, lean);
    part(-.21, .21, .86, 1.46, -.12, .12, o.shirt || '#f08c3a', body);
    part(-.21, .21, .86, 1.12, -.125, .125, '#f4f1ea', (p) => body(p)); // нижняя часть — полоска-жилет
    part(-.22, .22, 1.0, 1.06, -.13, .13, '#e8e14a', body);
    let armA = -walk, armB = walk;
    if (pose === 'dig') { const k = Math.sin(t * 3.2); armA = armB = -.9 - k * .5; }
    if (pose === 'point') { armB = -1.45; }
    const shL = [-.27, 1.42, 0], shR = [.27, 1.42, 0];
    part(-.33, -.21, .9, 1.44, -.06, .06, o.shirt || '#f08c3a', (p) => body(rotX(p, shL, armA)));
    part(.21, .33, .9, 1.44, -.06, .06, o.shirt || '#f08c3a', (p) => body(rotX(p, shR, armB)));
    const head = T(body([0, 1.62, 0])); S.sphere(head, .14, '#e9b893', { seg: 9, rings: 6, shadow: true });
    S.sphere(add(head, [0, .06, 0]), .165, '#f2c230', { seg: 10, rings: 6, sy: .62 });
    if (pose === 'dig') { // лопата в руках
      const hand = T(body(rotX([0, .9, 0], [0, 1.42, 0], armA))), tip = T(body(rotX([0, .2, .55], [0, 1.42, 0], armA * .7)));
      rod(hand, tip, .025, '#8a6440', { seg: 5, flat: true });
      const d = norm(sub(tip, hand)); S.box(tip[0] - .12, tip[0] + .12, tip[1] - .02, tip[1] + .2, tip[2] - .02, tip[2] + .02, '#7d8288', { tf: (p) => rotY(p, tip, face) });
      void d;
    }
  }
  /** выноска: белая «таблетка» над точкой, тонкая линия до точки. kind: w | o (оранжевая) | g | r | b */
  function label(text, anchor, dx, dy, a, kind = 'w', size = 19) {
    if (a <= .01) return;
    const q = S.proj(anchor); if (q[2] < .3) return;
    const x = FX, k = back(a * 1.4) * .15 + .85;
    x.save(); x.globalAlpha = clamp(a * 1.3);
    x.font = `700 ${size}px PT, 'Noto Color Emoji'`;
    const w = x.measureText(text).width + 26, h = size + 17, bx = q[0] + dx, by = q[1] + dy;
    x.strokeStyle = kind === 'o' ? '#ff8a3d' : '#ffffff'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(bx, by + (dy < 0 ? h / 2 : -h / 2)); x.lineTo(q[0], q[1]); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(q[0], q[1], 4.2, 0, 7); x.fill(); x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 1; x.stroke();
    x.translate(bx, by); x.scale(k, k);
    const bg = { w: '#ffffff', o: '#ff8a3d', g: '#2f9e5b', r: '#e03131', b: '#1d2b3a' }[kind], fg = kind === 'w' ? '#1d2b3a' : '#ffffff';
    x.shadowColor = 'rgba(0,0,0,.22)'; x.shadowBlur = 12; x.shadowOffsetY = 4;
    x.fillStyle = bg; x.beginPath(); x.roundRect(-w / 2, -h / 2, w, h, h / 2); x.fill(); x.shadowColor = 'transparent';
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 0, 1.5);
    x.restore();
  }
  /** бегущая вода по ломаной */
  function flow(pts, t, a = 1, w = 4) { if (a > .01) S.line(pts, { color: P.water, w, dash: [10, 9], offset: -t * 45, glow: 'rgba(95,180,230,.8)', alpha: a }); }
  /** камера по ключам [t, yaw, pitch, dist, tx, ty, tz] + лёгкое «дыхание» */
  function cam(keys, t) {
    let i = 0; while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1], k = b[0] - a[0] < .05 ? 1 : ease((t - a[0]) / (b[0] - a[0])), v = a.map((u, j) => lerp(u, b[j], k));
    S.camera([v[4], v[5], v[6]], v[1] + Math.sin(t * .23) * .015, v[2] + Math.sin(t * .17) * .008, v[3], 40);
  }
  /** шаги: [[t, 'ШАГ n', 'название'], …] */
  function chip(t, STEPS, end) {
    let s = null; for (const st of STEPS) if (t >= st[0]) s = st;
    const el = $('chip');
    if (!s || t > end) { el.style.opacity = 0; return; }
    const html = `${s[1]} · <i>${s[2]}</i>`; if (el._h !== html) { el.innerHTML = html; el._h = html; }
    el.style.opacity = win(t, STEPS[0][0], end, .3, .3);
    const b = clamp((t - s[0]) / .4); el.style.transform = `translateX(${(1 - eOut(b)) * -24}px)`;
  }
  function hook(t, html, until) {
    const el = $('hook'); if (el._h !== html) { el.innerHTML = `<span>${html}</span>`; el._h = html; }
    el.style.opacity = win(t, 0, until, .01, .35); el.style.transform = `scale(${lerp(.94, 1, eOut(t / .5))})`;
  }
  function post(t) { if (window._np) return; PFX.apply(S.ctx, t, { grade: 'contrast(1.04) saturate(1.08) brightness(1.02)', bloom: .1, vignette: .22, grain: .02 }); }
  return { P, init, sky, rod, pipe, tree, fence, gable, bgHouse, backdrop, ground, person, label, flow, cam, chip, hook, post, get S() { return S; }, get FX() { return FX; } };
})();
const END_HTML = (ic, l1, l2) => `<div id="end"><div class="ic">${ic}</div><div class="logo">СМЕТА PRO</div><div class="l2">${l1}<br><span style="color:#FFD43B">${l2}</span></div><div class="bot">@CMETA_Pro_bot</div><div class="sm">День бесплатно + 12 дней за подписку на Instagram</div></div>`;
