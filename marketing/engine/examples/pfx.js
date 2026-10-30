// Пост-обработка кадра «как в кино»: цветокоррекция, свечение источников света, виньетка, лёгкое зерно.
const PFX = (() => {
  const noise = document.createElement('canvas'); noise.width = noise.height = 256;
  { const n = noise.getContext('2d'), d = n.createImageData(256, 256); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } n.putImageData(d, 0, 0); }
  const tmp = document.createElement('canvas');
  /** ctx — 2D-контекст холста 1080×1920; o: { grade, vignette, grain, glows: [[x, y, r, 'rgba(...)'], …] (в CSS-пикселях 540×960) } */
  function apply(ctx, t, o = {}) {
    const cv = ctx.canvas, W = cv.width, H = cv.height;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (o.grade !== false) {
      if (tmp.width !== W) { tmp.width = W; tmp.height = H; }
      const tx = tmp.getContext('2d'); tx.clearRect(0, 0, W, H); tx.drawImage(cv, 0, 0);
      ctx.filter = o.grade || 'contrast(1.08) saturate(1.16) brightness(1.02)'; ctx.drawImage(tmp, 0, 0); ctx.filter = 'none';
      // мягкое свечение светлых участков (bloom)
      if (o.bloom) { ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = o.bloom; ctx.filter = 'blur(18px) brightness(1.1)'; ctx.drawImage(tmp, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
    for (const [x, y, r, col] of o.glows || []) {
      const g = ctx.createRadialGradient(x * 2, y * 2, 0, x * 2, y * 2, r * 2); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x * 2 - r * 2, y * 2 - r * 2, r * 4, r * 4); ctx.globalCompositeOperation = 'source-over';
    }
    if (o.vignette !== 0) {
      const v = ctx.createRadialGradient(W / 2, H * .46, H * .28, W / 2, H * .5, H * .78);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${o.vignette ?? .42})`); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
    if (o.grain !== 0) { ctx.globalAlpha = o.grain ?? .035; ctx.globalCompositeOperation = 'overlay'; const ox = (t * 977 % 256) | 0, oy = (t * 613 % 256) | 0; for (let y = -oy; y < H; y += 256) for (let x = -ox; x < W; x += 256) ctx.drawImage(noise, x, y); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
  }
  return { apply };
})();
