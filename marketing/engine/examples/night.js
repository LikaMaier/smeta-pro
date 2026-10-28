// Хэллоуинская ночь для 3D-роликов: небо с луной и звёздами, летучие мыши, туман,
// тыквы со светящимися лицами, призраки. Нужен mini3d.js и drain-common.js.
const NIGHT = {
  setup(S) { S.amb = .3; S.dif = .52; S.L = M3.norm([.45, .75, .5]); S.tint = [.62, .66, 1.0]; S.fogColor = [30, 24, 56]; S.fog = [12, 46]; S.shadowA = .28; },
  sky(x, t, yaw) {
    const g = x.createLinearGradient(0, 0, 0, 960); g.addColorStop(0, '#120a2a'); g.addColorStop(.55, '#2b1a4e'); g.addColorStop(1, '#3d2350');
    x.fillStyle = g; x.fillRect(0, 0, 540, 960);
    for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,255,${.3 + .5 * Math.abs(Math.sin(t * 1.3 + i))})`; x.fillRect(R(i) * 540, R(i + 1) * 520, 1.6, 1.6); }
    const mx = 410 - yaw * 70, my = 175;
    const mg = x.createRadialGradient(mx, my, 0, mx, my, 170); mg.addColorStop(0, 'rgba(255,244,214,.55)'); mg.addColorStop(1, 'rgba(255,230,180,0)'); x.fillStyle = mg; x.fillRect(0, 0, 540, 960);
    x.fillStyle = '#fff3d1'; x.beginPath(); x.arc(mx, my, 50, 0, 7); x.fill();
    x.fillStyle = 'rgba(220,200,160,.35)'; for (const [dx, dy, r] of [[-14, -10, 10], [12, 14, 7], [18, -18, 5]]) { x.beginPath(); x.arc(mx + dx, my + dy, r, 0, 7); x.fill(); }
    x.fillStyle = 'rgba(40,28,70,.85)'; for (let i = 0; i < 3; i++) { const cx = ((t * 14 + i * 230) % 760) - 110, cy = 150 + i * 46; x.beginPath(); x.ellipse(cx, cy, 90, 18, 0, 0, 7); x.ellipse(cx + 50, cy - 10, 60, 16, 0, 0, 7); x.fill(); }
  },
  pumpkin(S, [x, z, r]) { S.sphere([x, r * .8, z], r, '#e8781e', { sy: .8, seg: 14, rings: 8, shadow: true }); S.cyl('y', [x, r * 1.6 + .06, z], .05, .16, '#3f6b2a', { seg: 6 }); },
  face(FX, S, [x, z, r], i, t, y0 = 0) {
    const q = S.proj([x, y0 + r * .8, z]); if (q[2] < .3) return;
    const s = S.F * r / q[2], fl = .8 + .2 * Math.sin(t * 13 + i * 3) * Math.sin(t * 7 + i);
    const g0 = S.proj([x, y0 + .02, z]); const gr = FX.createRadialGradient(g0[0], g0[1], 0, g0[0], g0[1], s * 3.2);
    gr.addColorStop(0, `rgba(255,150,40,${.38 * fl})`); gr.addColorStop(1, 'rgba(255,120,20,0)'); FX.fillStyle = gr; FX.beginPath(); FX.arc(g0[0], g0[1], s * 3.2, 0, 7); FX.fill();
    FX.save(); FX.shadowColor = 'rgba(255,200,60,.95)'; FX.shadowBlur = 14; FX.fillStyle = `rgba(255,${200 + 40 * fl | 0},90,${.92 * fl})`;
    const e = (dx) => { FX.beginPath(); FX.moveTo(q[0] + dx * s - .18 * s, q[1] - .05 * s); FX.lineTo(q[0] + dx * s + .18 * s, q[1] - .05 * s); FX.lineTo(q[0] + dx * s, q[1] - .32 * s); FX.closePath(); FX.fill(); };
    e(-.32); e(.32);
    FX.beginPath(); FX.moveTo(q[0] - .5 * s, q[1] + .15 * s);
    for (let k = 0; k <= 6; k++) FX.lineTo(q[0] - .5 * s + k * s / 6, q[1] + (k % 2 ? .28 : .15) * s);
    FX.lineTo(q[0] + .42 * s, q[1] + .42 * s); FX.lineTo(q[0] - .42 * s, q[1] + .42 * s); FX.closePath(); FX.fill(); FX.restore();
  },
  ghost(FX, S, p, sc, a, t, tint = 'rgba(240,238,255,.92)') {
    const q = S.proj(p); if (q[2] < .3 || a <= 0) return null;
    const s = S.F * sc / q[2], x = q[0] + Math.sin(t * 2) * s * .15, y = q[1] + Math.sin(t * 3) * s * .1;
    FX.save(); FX.globalAlpha = a; FX.shadowColor = 'rgba(200,190,255,.9)'; FX.shadowBlur = 30; FX.fillStyle = tint;
    FX.beginPath(); FX.moveTo(x - .5 * s, y + .9 * s); FX.lineTo(x - .5 * s, y); FX.bezierCurveTo(x - .5 * s, y - .75 * s, x + .5 * s, y - .75 * s, x + .5 * s, y); FX.lineTo(x + .5 * s, y + .9 * s);
    for (let k = 0; k < 4; k++) { const x0 = x + .5 * s - k * s / 4; FX.quadraticCurveTo(x0 - s / 8, y + (.75 + .1 * Math.sin(t * 6 + k)) * s, x0 - s / 4, y + .9 * s); }
    FX.closePath(); FX.fill(); FX.shadowBlur = 0; FX.fillStyle = '#1a0b2e';
    FX.beginPath(); FX.ellipse(x - .17 * s, y - .12 * s, .08 * s, .12 * s, 0, 0, 7); FX.ellipse(x + .17 * s, y - .12 * s, .08 * s, .12 * s, 0, 0, 7); FX.fill();
    FX.beginPath(); FX.ellipse(x, y + .18 * s, .1 * s, .14 * s, 0, 0, 7); FX.fill(); FX.restore();
    return [x, y - .7 * s];
  },
  bats(FX, t, n = 6) {
    for (let i = 0; i < n; i++) {
      const k = ((t * .09 + i / n) % 1), x = -60 + k * 680, y = 130 + i * 36 + Math.sin(t * 2 + i) * 30, s = 14 + R(i) * 10, f = Math.sin(t * 16 + i) * .6;
      FX.fillStyle = '#0b0616'; FX.beginPath(); FX.moveTo(x, y);
      FX.quadraticCurveTo(x - s * .6, y - s * (.4 + f), x - s * 1.2, y - s * .1 * f); FX.quadraticCurveTo(x - s * .7, y + s * .1, x - s * .2, y + s * .15);
      FX.lineTo(x, y + s * .25); FX.lineTo(x + s * .2, y + s * .15);
      FX.quadraticCurveTo(x + s * .7, y + s * .1, x + s * 1.2, y - s * .1 * f); FX.quadraticCurveTo(x + s * .6, y - s * (.4 + f), x, y); FX.fill();
    }
  },
  fog(FX, t, a = .14) { for (let i = 0; i < 5; i++) { const fx0 = ((t * 18 * (i % 2 ? 1 : -1) + i * 160) % 900) - 180; const fg = FX.createRadialGradient(fx0, 780 + i * 30, 0, fx0, 780 + i * 30, 260); fg.addColorStop(0, `rgba(190,180,230,${a})`); fg.addColorStop(1, 'rgba(190,180,230,0)'); FX.fillStyle = fg; FX.fillRect(0, 0, 540, 960); } },
  css: `
#sub b, #hook b { color: #ff9f3a !important; }
#phone { box-shadow: 0 0 60px rgba(255,138,31,.6), 0 30px 70px rgba(0,0,0,.6), inset 0 0 0 3px #ff8a1f !important; }
#end { background: radial-gradient(120% 80% at 50% 40%, #3a1a5e, #12081f 70%) !important; }
#end .logo { color: #ff8a1f !important; }
.tag.info { background: #1a0b2e !important; border-color: #ff8a1f !important; }
.bub { position: absolute; z-index: 15; transform: translate(-50%, -100%); background: rgba(240,236,255,.95); color: #1a0b2e; font-family: 'PT', 'Noto Color Emoji'; font-size: 22px; line-height: 1.15; padding: 8px 14px; border-radius: 16px; text-align: center; box-shadow: 0 0 24px rgba(190,170,255,.7); opacity: 0; white-space: nowrap; }
.bub:after { content: ''; position: absolute; left: 50%; bottom: -12px; margin-left: -10px; border: 10px solid transparent; border-top-color: rgba(240,236,255,.95); border-bottom: 0; }
`,
};
document.head.insertAdjacentHTML('beforeend', `<style>${NIGHT.css}</style>`);
