// Набор моделей для R3: люди, деревья, пальмы, кипарисы, частицы пыли; общий оверлей (титры, плашки, концовка).
const K = (() => {
  const { M, Mesh } = R3;
  const B = (f) => { const m = new Mesh(); f(m); return R3.build(m); };
  /** человек из частей; st: { skin, top, bottom, shoes, hair, hat, robe } */
  function person(st = {}) {
    const skin = st.skin || '#c99a7a', top = st.top || '#d9d4c8', bot = st.bottom || '#3b4a63', shoes = st.shoes || '#2b2520';
    const p = {
      legL: B((m) => { if (!st.robe) { m.rod([0, .9, 0], [0, .08, 0], .075, { color: bot, mat: 'cloth', r2: .06 }); m.box(-.06, .06, 0, .08, -.06, .16, { color: shoes, mat: 'plain' }); } }),
      torso: B((m) => { if (st.robe) m.lathe([0, 0, 0], [[.0, 0], [.32, 0], [.26, .5], [.2, 1.0], [.22, 1.4], [.12, 1.5], [0, 1.5]], { color: top, mat: 'cloth', seg: 18 });
        else m.lathe([0, .86, 0], [[0, 0], [.19, 0], [.2, .2], [.22, .45], [.2, .58], [.1, .64], [0, .64]], { color: top, mat: 'cloth', seg: 16 });
        m.rod([0, 1.48, 0], [0, 1.56, 0], .05, { color: skin, mat: 'skin' }); }),
      arm: B((m) => { m.rod([0, 0, 0], [0, -.56, 0], .055, { color: st.robe ? skin : top, mat: 'cloth', r2: .045 }); m.sphere([0, -.6, 0], .05, { color: skin, mat: 'skin', seg: 8, rings: 5 }); }),
      head: B((m) => { m.sphere([0, 0, 0], .115, { color: skin, mat: 'skin', seg: 16, rings: 10, sy: 1.12 }); if (st.hair) m.sphere([0, .04, -.015], .122, { color: st.hair, mat: 'cloth', seg: 16, rings: 8, sy: .95 }); if (st.hat) { m.sphere([0, .05, 0], .135, { color: st.hat, mat: 'plain', seg: 16, rings: 8, sy: .75 }); m.cyl([0, .03, 0], .17, .015, { color: st.hat, seg: 16 }); } }),
    };
    /** items(x, y, z, face, pose, t) — pose: stand | walk | phone | cross | shrug | point */
    p.items = (x, y, z, face, pose = 'stand', t = 0) => {
      const base = M.chain(M.T(x, y, z), M.RY(face)), out = [];
      const sw = pose === 'walk' ? Math.sin(t * 6) * .45 : 0;
      if (!st.robe) { out.push({ mesh: p.legL, M: M.chain(base, M.T(-.1, 0, 0), M.about([0, .9, 0], M.RX(sw))) }); out.push({ mesh: p.legL, M: M.chain(base, M.T(.1, 0, 0), M.about([0, .9, 0], M.RX(-sw))) }); }
      out.push({ mesh: p.torso, M: base });
      let aL = [-sw * .8, 0, .08], aR = [sw * .8, 0, -.08];
      if (pose === 'phone') aR = [-2.2, 0, -.5];
      if (pose === 'cross') { aL = [-1.2, 0, -.9]; aR = [-1.2, 0, .9]; }
      if (pose === 'shrug') { const k = Math.sin(t * 3) * .1; aL = [-.6, 0, .9 + k]; aR = [-.6, 0, -.9 - k]; }
      if (pose === 'point') aR = [-1.5, 0, -.15];
      if (pose === 'hands') { aL = [-.3, 0, .25]; aR = [-.3, 0, -.25]; }
      const arm = (sx, a) => M.chain(base, M.T(sx, 1.42, 0), M.RZ(a[2]), M.RX(a[0]));
      out.push({ mesh: p.arm, M: arm(-.25, aL) }, { mesh: p.arm, M: arm(.25, aR) });
      const nod = pose === 'shrug' ? Math.sin(t * 3) * .08 : 0;
      out.push({ mesh: p.head, M: M.chain(base, M.T(0, 1.68, 0), M.RZ(nod)) });
      return out;
    };
    return p;
  }
  const tree = (c, s = 1, col = '#3f6a2c') => B((m) => { m.rod([c[0], c[1], c[2]], [c[0], c[1] + 2.4 * s, c[2]], .16 * s, { color: '#55402f', mat: 'wood', r2: .1 * s }); for (const [dx, dy, dz, r] of [[0, 3.3, 0, 1.5], [.9, 2.8, .4, 1.0], [-.8, 3.0, -.3, 1.1], [.2, 4.1, .1, .95]]) m.sphere([c[0] + dx * s, c[1] + dy * s, c[2] + dz * s], r * s, { color: col, mat: 'grass', seg: 12, rings: 8 }); });
  const cypress = (c, s = 1) => B((m) => { m.rod(c, [c[0], c[1] + .8 * s, c[2]], .1 * s, { color: '#4b3a2a', mat: 'wood' }); m.lathe([c[0], c[1] + .5 * s, c[2]], [[0, 0], [.55 * s, .4 * s], [.62 * s, 1.6 * s], [.45 * s, 3.2 * s], [.18 * s, 4.4 * s], [0, 4.9 * s]], { color: '#2f4a26', mat: 'grass', seg: 12 }); });
  const palm = (c, s = 1, lean = .15) => B((m) => {
    let p = c; for (let i = 0; i < 8; i++) { const q = [c[0] + Math.sin(i / 8 * 1.2) * lean * 5 * s * (i / 8), c[1] + (i + 1) * .7 * s, c[2]]; m.rod(p, q, .17 * s * (1 - i * .05), { color: '#7a6248', mat: 'wood', r2: .16 * s * (1 - i * .05), seg: 8 }); p = q; }
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, d = [Math.cos(a), 0, Math.sin(a)], L = 2.4 * s; const mid = [p[0] + d[0] * L * .5, p[1] + .35 * s, p[2] + d[2] * L * .5], tip = [p[0] + d[0] * L, p[1] - .6 * s, p[2] + d[2] * L], side = [-d[2] * .35 * s, 0, d[0] * .35 * s];
      m.poly([p, [mid[0] + side[0], mid[1], mid[2] + side[2]], tip], { color: '#4f7a2e', mat: 'grass', two: true }); m.poly([p, tip, [mid[0] - side[0], mid[1], mid[2] - side[2]]], { color: '#5d8a36', mat: 'grass', two: true }); }
  });
  // ---------- 2D-оверлей ----------
  const CSS = `
  @font-face { font-family: 'PT'; src: url('file:///home/claude/smeta-pro/server/pdf/fonts/PT_Sans-Web-Bold.ttf'); font-weight: 700; }
  @font-face { font-family: 'PTN'; src: url('file:///home/claude/smeta-pro/server/pdf/fonts/PT_Sans-Narrow-Web-Bold.ttf'); font-weight: 700; }
  * { margin: 0; padding: 0; box-sizing: border-box; } html, body { width: 540px; height: 960px; overflow: hidden; background: #000; }
  #stage { position: relative; width: 540px; height: 960px; overflow: hidden; }
  #gl, #fx { position: absolute; inset: 0; width: 540px; height: 960px; }
  #fx { z-index: 5; pointer-events: none; }
  #vig { position: absolute; inset: 0; z-index: 6; background: radial-gradient(120% 75% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,.45)); pointer-events: none; }
  #year { position: absolute; left: 0; right: 0; top: 84px; z-index: 10; text-align: center; font-family: 'PTN'; font-size: 64px; color: #fff; letter-spacing: 1px; text-shadow: 0 4px 24px rgba(0,0,0,.55), 0 0 2px rgba(0,0,0,.8); opacity: 0; line-height: 1; }
  #year small { display: block; font-family: 'PT'; font-size: 22px; letter-spacing: 3px; text-transform: uppercase; color: #ffd8a8; margin-top: 6px; }
  #sub { position: absolute; left: 24px; right: 24px; bottom: 200px; z-index: 11; text-align: center; font-family: 'PT', 'Noto Color Emoji'; font-size: 28px; line-height: 1.18; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,.9), 0 0 18px rgba(0,0,0,.6); opacity: 0; }
  #sub span { display: inline-block; background: rgba(10,12,16,.5); padding: 8px 16px 10px; border-radius: 16px; backdrop-filter: blur(2px); }
  #sub b { color: #ffc078; }
  #hook { position: absolute; left: 24px; right: 24px; top: 300px; z-index: 12; text-align: center; font-family: 'PTN'; font-size: 54px; line-height: 1.05; color: #fff; text-shadow: 0 4px 28px rgba(0,0,0,.7), 0 0 3px #000; opacity: 0; }
  #hook b { color: #ff922b; }
  #flash { position: absolute; inset: 0; z-index: 20; background: #000; opacity: 0; pointer-events: none; }
  #end { position: absolute; inset: 0; z-index: 30; background: radial-gradient(120% 80% at 50% 40%, #16365e, #0a1a30 70%); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; opacity: 0; color: #fff; text-align: center; font-family: 'PT'; padding: 0 26px; }
  #end .q { font-family: 'PTN'; font-size: 44px; line-height: 1.08; } #end .q b { color: #ff922b; }
  #end .logo { font-family: 'PTN'; font-size: 78px; color: #FFD43B; line-height: .9; margin-top: 18px; }
  #end .l2 { font-size: 25px; line-height: 1.2; color: #d0e4fb; }
  #end .bot { margin-top: 6px; background: #FFD43B; color: #0a1a30; font-family: 'PTN'; font-size: 44px; padding: 10px 26px; border-radius: 18px; box-shadow: 0 8px 0 #b38b00; }
  #end .sm { font-size: 20px; color: #9fc8f5; }
  .card { position: absolute; z-index: 13; opacity: 0; }
  `;
  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const eOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const lerp = (a, b, k) => a + (b - a) * k;
  const win = (t, a, b, fi = .3, fo = .3) => (t < a || t > b ? 0 : clamp(Math.min((t - a) / fi, (b - t) / fo)));
  const R = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  let _s = '', _y = '';
  function subs(t, list) { const s = list.find(([a, b]) => t >= a && t < b), h = s ? s[2] : ''; if (h !== _s) { $('sub').innerHTML = h ? `<span>${h}</span>` : ''; _s = h; } $('sub').style.opacity = s ? win(t, s[0], s[1], .2, .2) : 0; $('sub').style.transform = s ? `translateY(${(1 - eOut((t - s[0]) / .3)) * 14}px)` : ''; }
  function year(t, list) { const s = list.find(([a, b]) => t >= a && t < b), h = s ? s[2] : ''; if (h !== _y) { $('year').innerHTML = h; _y = h; } $('year').style.opacity = s ? win(t, s[0], s[1], .25, .25) : 0; $('year').style.transform = s ? `scale(${lerp(1.12, 1, eOut((t - s[0]) / .5))})` : ''; }
  /** пыль: облака частиц в мировых координатах, рисуются на #fx */
  function dust(fx, t, t0, c, n = 40, spread = 3, col = '200,180,150') {
    const dt = t - t0; if (dt < 0 || dt > 4) return;
    for (let i = 0; i < n; i++) { const a = R(i) * Math.PI * 2, sp = .5 + R(i + 3) * 1.5, p = [c[0] + Math.cos(a) * sp * spread * eOut(dt / 2.5), c[1] + R(i + 5) * 1.5 * eOut(dt / 2) + dt * .2, c[2] + Math.sin(a) * sp * spread * .6 * eOut(dt / 2.5)];
      const q = R3.proj(p); if (q[2] < .3) continue; const r = (14 + R(i + 7) * 30) * (1 + dt * .6) * 6 / q[2]; const al = .32 * (1 - dt / 4) * (.5 + R(i + 9) * .5);
      const g = fx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r); g.addColorStop(0, `rgba(${col},${al})`); g.addColorStop(1, `rgba(${col},0)`); fx.fillStyle = g; fx.fillRect(q[0] - r, q[1] - r, r * 2, r * 2); }
  }
  const END = (q) => `<div id="end"><div class="q">${q}</div><div class="logo">СМЕТА PRO</div><div class="l2">Сроки, этапы и цена — в смете<br>за 2 минуты в Telegram</div><div class="bot">@CMETA_Pro_bot</div><div class="sm">День бесплатно + 12 дней за подписку на Instagram</div></div>`;
  return { B, person, tree, cypress, palm, subs, year, dust, END, $, clamp, ease, eOut, lerp, win, R };
})();
