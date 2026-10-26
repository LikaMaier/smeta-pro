// Мини-3D для роликов: перспективная камера с облётом, плоские грани с освещением (Ламберт + небо),
// мягкие тени на землю, туман, контуры граней. Canvas 2D, без внешних библиотек.
const M3 = (() => {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const avg = (ps) => { const s = [0, 0, 0]; for (const p of ps) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return mul(s, 1 / ps.length); };
  const hexc = {};
  const rgb = (h) => { if (Array.isArray(h)) return h; if (hexc[h]) return hexc[h]; const v = parseInt(h.slice(1), 16); return (hexc[h] = [(v >> 16) & 255, (v >> 8) & 255, v & 255]); };
  // повороты точки вокруг центра
  const rotZ = (p, c, a) => { const s = Math.sin(a), k = Math.cos(a), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * k - y * s, c[1] + x * s + y * k, p[2]]; };
  const rotY = (p, c, a) => { const s = Math.sin(a), k = Math.cos(a), x = p[0] - c[0], z = p[2] - c[2]; return [c[0] + x * k + z * s, p[1], c[2] - x * s + z * k]; };
  const rotX = (p, c, a) => { const s = Math.sin(a), k = Math.cos(a), y = p[1] - c[1], z = p[2] - c[2]; return [p[0], c[1] + y * k - z * s, c[2] + y * s + z * k]; };

  class Scene {
    constructor(canvas, W = 540, H = 960) {
      this.cv = canvas; this.W = W; this.H = H;
      canvas.width = W * 2; canvas.height = H * 2; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      this.ctx = canvas.getContext('2d');
      this.sh = document.createElement('canvas'); this.sh.width = W * 2; this.sh.height = H * 2; this.shx = this.sh.getContext('2d');
      this.L = norm([-.45, .85, .38]);
      this.fogColor = [214, 230, 242]; this.fog = [18, 70];
      this.groundY = 0.005;
    }
    camera(target, yaw, pitch, dist, fov = 42) {
      const C = add(target, [dist * Math.cos(pitch) * Math.sin(yaw), dist * Math.sin(pitch), dist * Math.cos(pitch) * Math.cos(yaw)]);
      const f = norm(sub(target, C)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
      Object.assign(this, { C, f, r, u, F: (this.H / 2) / Math.tan(fov * Math.PI / 360) });
      this.faces = []; this.shadows = []; this.over = [];
    }
    proj(p) {
      const d = sub(p, this.C), z = dot(d, this.f);
      return [this.W / 2 + dot(d, this.r) * this.F / z, this.H / 2 - dot(d, this.u) * this.F / z, z];
    }
    /** грань: pts — мировые точки; o: alpha, center (для ориентации нормали), tf (преобразование), shadow, ground, smooth, emit, two, line */
    poly(pts, color, o = {}) {
      if (o.tf) pts = pts.map(o.tf);
      const fc = avg(pts);
      let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
      if (o.center) { const c = o.tf ? o.tf(o.center) : o.center; if (dot(n, sub(fc, c)) < 0) n = mul(n, -1); }
      if (o.shadow) this.shadows.push(pts);
      if (!o.two && dot(n, sub(this.C, fc)) <= 0) return;
      const p2 = []; let dz = 0;
      for (const p of pts) { const q = this.proj(p); if (q[2] < .3) return; p2.push(q); dz += q[2]; }
      this.faces.push({ p2, z: dz / pts.length + (o.bias || 0), color, n, o });
    }
    box(x0, x1, y0, y1, z0, z1, color, o = {}) {
      const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], oo = { ...o, center: c };
      const P = (x, y, z) => [x, y, z];
      const top = o.top || color, front = o.front || color, side = o.side || color;
      this.poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], top, { ...oo, ground: o.groundTop });
      this.poly([P(x0, y0, z0), P(x0, y0, z1), P(x1, y0, z1), P(x1, y0, z0)], color, oo);
      this.poly([P(x0, y0, z1), P(x0, y1, z1), P(x1, y1, z1), P(x1, y0, z1)], front, oo);
      this.poly([P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)], color, oo);
      this.poly([P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], side, oo);
      this.poly([P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)], side, oo);
    }
    /** цилиндр вдоль оси 'x' | 'y' | 'z' из центра c */
    cyl(axis, c, r, len, color, o = {}) {
      const n = o.seg || 24, h = len / 2, ring = (s, rr) => { const a = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2, u = rr * Math.cos(t), v = rr * Math.sin(t); a.push(axis === 'x' ? [c[0] + s, c[1] + u, c[2] + v] : axis === 'y' ? [c[0] + u, c[1] + s, c[2] + v] : [c[0] + u, c[1] + v, c[2] + s]); } return a; };
      const r2 = o.r2 == null ? r : o.r2, A = ring(-h, r), B = ring(h, r2), oo = { ...o, center: c, smooth: true };
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.poly([A[i], A[j], B[j], B[i]], color, oo); }
      if (o.caps !== false) { this.poly(A, o.cap || color, { ...o, center: c }); this.poly(B.slice().reverse(), o.cap || color, { ...o, center: c }); }
    }
    /** капсула вдоль x (газгольдер): цилиндр + полусферы */
    capsule(c, len, r, color, o = {}) {
      const n = o.seg || 28, K = 5, h = len / 2;
      const ring = (x, rr) => { const a = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; a.push([c[0] + x, c[1] + rr * Math.cos(t), c[2] + rr * Math.sin(t)]); } return a; };
      const rings = [];
      for (let k = K; k >= 1; k--) { const a = k / K * Math.PI / 2; rings.push(ring(-h - r * Math.sin(a) * .8, r * Math.cos(a))); }
      rings.push(ring(-h, r)); rings.push(ring(h, r));
      for (let k = 1; k <= K; k++) { const a = k / K * Math.PI / 2; rings.push(ring(h + r * Math.sin(a) * .8, r * Math.cos(a))); }
      const oo = { ...o, center: c, smooth: true };
      for (let q = 0; q < rings.length - 1; q++) for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.poly([rings[q][i], rings[q][j], rings[q + 1][j], rings[q + 1][i]], color, oo); }
    }
    cone(c, r, hgt, color, o = {}) {
      const n = o.seg || 9, top = [c[0], c[1] + hgt, c[2]], base = [];
      for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; base.push([c[0] + r * Math.cos(t), c[1], c[2] + r * Math.sin(t)]); }
      const cc = [c[0], c[1] + hgt / 3, c[2]];
      for (let i = 0; i < n; i++) this.poly([base[i], base[(i + 1) % n], top], color, { ...o, center: cc });
    }
    /** линия поверх сцены: pts — мировые; style: {color, w, dash, glow} */
    line(pts, style) { this.over.push({ pts, style }); }

    shade(f) {
      const c = rgb(f.color), o = f.o;
      let k;
      if (o.emit) k = 1;
      else { const lam = Math.max(0, dot(f.n, this.L)); k = .5 + .56 * lam + .1 * Math.max(0, f.n[1]); }
      let r = c[0] * k, g = c[1] * k, b = c[2] * k;
      const fg = Math.max(0, Math.min(1, (f.z - this.fog[0]) / (this.fog[1] - this.fog[0]))) * .75;
      r += (this.fogColor[0] - r) * fg; g += (this.fogColor[1] - g) * fg; b += (this.fogColor[2] - b) * fg;
      return [Math.min(255, r) | 0, Math.min(255, g) | 0, Math.min(255, b) | 0];
    }
    draw(f) {
      const x = this.ctx, c = this.shade(f), a = f.o.alpha == null ? 1 : f.o.alpha;
      x.beginPath(); f.p2.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath();
      x.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`; x.fill();
      if (a > .9) {
        x.lineJoin = 'round';
        if (f.o.smooth) { x.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`; x.lineWidth = .9; }
        else { x.strokeStyle = `rgba(${c[0] * .62 | 0},${c[1] * .62 | 0},${c[2] * .62 | 0},.9)`; x.lineWidth = f.o.edge || .8; }
        x.stroke();
      }
    }
    render() {
      const x = this.ctx;
      x.setTransform(2, 0, 0, 2, 0, 0);
      const ground = this.faces.filter((f) => f.o.ground).sort((a, b) => b.z - a.z);
      const rest = this.faces.filter((f) => !f.o.ground).sort((a, b) => b.z - a.z);
      ground.forEach((f) => this.draw(f));
      // тени: проекция граней вдоль света на землю, одним слоем
      if (this.shadows.length) {
        const s = this.shx; s.setTransform(1, 0, 0, 1, 0, 0); s.clearRect(0, 0, this.sh.width, this.sh.height); s.setTransform(2, 0, 0, 2, 0, 0);
        s.fillStyle = '#000'; const L = this.L, gy = this.groundY;
        for (const pts of this.shadows) {
          s.beginPath(); let ok = true;
          pts.forEach((p, i) => { const k = (p[1] - gy) / L[1]; const q = this.proj(k > 0 ? sub(p, mul(L, k)) : [p[0], gy, p[2]]); if (q[2] < .3) ok = false; i ? s.lineTo(q[0], q[1]) : s.moveTo(q[0], q[1]); });
          if (ok) { s.closePath(); s.fill(); }
        }
        x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = .22; x.filter = 'blur(3px)'; x.drawImage(this.sh, 0, 0); x.restore();
      }
      rest.forEach((f) => this.draw(f));
      for (const { pts, style } of this.over) {
        const q = pts.map((p) => this.proj(p)); if (q.some((p) => p[2] < .3)) continue;
        x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
        if (style.glow) { x.shadowColor = style.glow; x.shadowBlur = 10; }
        x.setLineDash(style.dash || []); x.lineDashOffset = style.offset || 0;
        x.strokeStyle = style.color; x.lineWidth = style.w || 3; x.globalAlpha = style.alpha == null ? 1 : style.alpha;
        x.beginPath(); q.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke(); x.restore();
      }
    }
  }
  return { Scene, sub, add, mul, dot, norm, rotZ, rotY, rotX };
})();
