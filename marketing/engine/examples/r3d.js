// R3 — маленький WebGL2-движок для «реалистичных» роликов: процедурные материалы (кирпич, камень, дерево,
// бетон, штукатурка, черепица, трава, вода), солнце с мягкими тенями (shadow map + PCF), небо, туман, ACES.
const R3 = (() => {
  // ---------- математика (матрицы по столбцам) ----------
  const V = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k],
  };
  const M = {
    id: () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    mul: (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    persp: (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; },
    ortho: (l, r, b, t, n, f) => { const m = M.id(); m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n); m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); return m; },
    look: (e, c, up = [0, 1, 0]) => { const z = V.norm(V.sub(e, c)), x = V.norm(V.cross(up, z)), y = V.cross(z, x); const m = M.id(); m[0] = x[0]; m[4] = x[1]; m[8] = x[2]; m[1] = y[0]; m[5] = y[1]; m[9] = y[2]; m[2] = z[0]; m[6] = z[1]; m[10] = z[2]; m[12] = -V.dot(x, e); m[13] = -V.dot(y, e); m[14] = -V.dot(z, e); return m; },
    T: (x, y, z) => { const m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
    S: (x, y = x, z = x) => { const m = M.id(); m[0] = x; m[5] = y; m[10] = z; return m; },
    RX: (a) => { const m = M.id(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
    RY: (a) => { const m = M.id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
    RZ: (a) => { const m = M.id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
    chain: (...ms) => ms.reduce((a, b) => M.mul(a, b)),
    /** поворот вокруг точки p */
    about: (p, R) => M.chain(M.T(p[0], p[1], p[2]), R, M.T(-p[0], -p[1], -p[2])),
    apply: (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]],
  };
  const hex = (h) => { if (Array.isArray(h)) return h; const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
  // srgb -> linear
  const lin = (c) => c.map((v) => Math.pow(v, 2.2));
  const MAT = { plain: 0, brick: 1, stone: 2, wood: 3, concrete: 4, grass: 5, plaster: 6, tile: 7, water: 8, sky: 9, emit: 10, metal: 11, soil: 12, mud: 13, cloth: 14, skin: 15, glass: 16, asphalt: 17, sand: 18, rooftile: 19 };

  // ---------- построитель геометрии ----------
  class Mesh {
    constructor() { this.v = []; }
    tri(a, b, c, n, col, mat, na, nb, nc) { for (const [p, nn] of [[a, na || n], [b, nb || n], [c, nc || n]]) this.v.push(p[0], p[1], p[2], nn[0], nn[1], nn[2], col[0], col[1], col[2], mat); }
    /** многоугольник (выпуклый), нормаль считается сама; o.flip — развернуть */
    poly(pts, o = {}) {
      const col = lin(hex(o.color || '#cccccc')), mat = MAT[o.mat || 'plain'] ?? 0;
      let n = V.norm(V.cross(V.sub(pts[1], pts[0]), V.sub(pts[2], pts[0]))); if (o.flip) { n = V.mul(n, -1); pts = pts.slice().reverse(); }
      for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0], pts[i], pts[i + 1], n, col, mat);
      if (o.two) { const r = pts.slice().reverse(), nn = V.mul(n, -1); for (let i = 1; i < r.length - 1; i++) this.tri(r[0], r[i], r[i + 1], nn, col, mat); }
      return this;
    }
    box(x0, x1, y0, y1, z0, z1, o = {}) {
      const P = (x, y, z) => [x, y, z], f = (pts, oo) => this.poly(pts, { ...o, ...oo });
      if (o.top !== false) f([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], o.topO || {});
      if (o.bottom) f([P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)]);
      f([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], o.frontO || {});
      f([P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0)]);
      f([P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)]);
      f([P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1)]);
      return this;
    }
    /** тело вращения вокруг оси y: prof = [[r, y], …] снизу вверх */
    lathe(c, prof, o = {}) {
      const n = o.seg || 32, col = lin(hex(o.color || '#cccccc')), mat = MAT[o.mat || 'plain'] ?? 0;
      const P = (i, k) => { const a = k / n * Math.PI * 2; return [c[0] + prof[i][0] * Math.cos(a), c[1] + prof[i][1], c[2] + prof[i][0] * Math.sin(a)]; };
      const N = (i, k) => { const a = k / n * Math.PI * 2, i0 = Math.max(0, i - 1), i1 = Math.min(prof.length - 1, i + 1), dr = prof[i1][0] - prof[i0][0], dy = prof[i1][1] - prof[i0][1]; const nn = V.norm([dy, -dr, 0]); return V.norm([nn[0] * Math.cos(a), nn[1], nn[0] * Math.sin(a)]); };
      for (let i = 0; i < prof.length - 1; i++) for (let k = 0; k < n; k++) {
        const a = P(i, k), b = P(i, k + 1), cc = P(i + 1, k + 1), d = P(i + 1, k);
        const na = N(i, k), nb = N(i, k + 1), nc = N(i + 1, k + 1), nd = N(i + 1, k);
        this.tri(a, cc, b, na, col, mat, na, nc, nb); this.tri(a, d, cc, na, col, mat, na, nd, nc);
      }
      return this;
    }
    cyl(c, r, h, o = {}) { this.lathe(c, [[0, 0], [r, 0], [r, 0], [o.r2 ?? r, h], [o.r2 ?? r, h], [0, h]], o); return this; }
    sphere(c, r, o = {}) { const p = [], m = o.rings || 12, sy = o.sy || 1; for (let i = 0; i <= m; i++) { const a = -Math.PI / 2 + i / m * Math.PI; p.push([Math.cos(a) * r + 1e-4, Math.sin(a) * r * sy]); } return this.lathe(c, p, o); }
    /** стержень между двумя точками */
    rod(a, b, r, o = {}) {
      const n = o.seg || 10, d = V.norm(V.sub(b, a)), u = V.norm(V.cross(d, Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0])), w = V.cross(d, u), col = lin(hex(o.color || '#cccccc')), mat = MAT[o.mat || 'plain'] ?? 0;
      for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2; const n0 = V.add(V.mul(u, Math.cos(a0)), V.mul(w, Math.sin(a0))), n1 = V.add(V.mul(u, Math.cos(a1)), V.mul(w, Math.sin(a1)));
        const p0 = V.add(a, V.mul(n0, r)), p1 = V.add(a, V.mul(n1, r)), q0 = V.add(b, V.mul(n0, o.r2 ?? r)), q1 = V.add(b, V.mul(n1, o.r2 ?? r));
        this.tri(p0, q1, p1, n0, col, mat, n0, n1, n1); this.tri(p0, q0, q1, n0, col, mat, n0, n0, n1); }
      return this;
    }
    /** выдавливание многоугольника [[x,y]] вдоль z */
    extrude(pts, z0, z1, o = {}) {
      this.poly(pts.map((p) => [p[0], p[1], z1]), o); this.poly(pts.map((p) => [p[0], p[1], z0]).reverse(), o);
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; this.poly([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], { ...o, ...(o.sideO || {}) }); }
      return this;
    }
  }

  // ---------- шейдеры ----------
  const VS = `#version 300 es
  layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC; layout(location=3) in float aM;
  uniform mat4 uVP, uM, uL; out vec3 vP, vN, vC; out float vM; out vec4 vL;
  void main(){ vec4 w = uM * vec4(aP,1.); vP = w.xyz; vN = mat3(uM) * aN; vC = aC; vM = aM; vL = uL * w; gl_Position = uVP * w; }`;
  const FS = `#version 300 es
  precision highp float; precision highp sampler2DShadow;
  in vec3 vP, vN, vC; in float vM; in vec4 vL; out vec4 o;
  uniform vec3 uE, uSun, uSunC, uSkyT, uSkyH, uGnd, uTint; uniform float uFog, uFogH, uAlpha, uT, uExp; uniform sampler2DShadow uSh; uniform float uShOn; uniform vec2 uClip;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
  float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n2(p); p*=2.03; a*=.5; } return s; }
  vec2 uvOf(vec3 p, vec3 n){ vec3 a=abs(n); return a.y>a.x && a.y>a.z ? p.xz : (a.x>a.z ? p.zy : p.xy); }
  vec3 sky(vec3 d){ float k = clamp(d.y*1.6, 0., 1.); vec3 c = mix(uSkyH, uSkyT, pow(k, .6)); if (d.y < 0.) c = mix(uSkyH, uGnd*1.4, clamp(-d.y*4.,0.,1.));
    float s = max(dot(d, uSun), 0.); c += uSunC * (pow(s, 600.)*8. + pow(s, 12.)*.12); return c; }
  void main(){
    if (vP.y < uClip.x || vP.y > uClip.y) discard;
    int m = int(vM + .5); vec3 n = normalize(vN); vec3 P = vP; vec3 V = normalize(uE - P);
    if (!gl_FrontFacing) n = -n;
    vec2 uv = uvOf(P, n); vec3 col = vC; float rough = .85, spec = .04, ao = 1.;
    if (m == 9) { o = vec4(pow(sky(normalize(P - uE)), vec3(1./2.2)), 1.); return; }
    if (m == 10) { vec3 c = col * uExp; c = (c*(2.51*c+.03))/(c*(2.43*c+.59)+.14); o = vec4(pow(c, vec3(1./2.2)), uAlpha); return; }
    if (m == 1) { // кирпич 0.25×0.065 + шов
      vec2 q = uv / vec2(.26, .077); q.x += step(1., mod(floor(q.y), 2.)) * .5; vec2 f = fract(q), id = floor(q);
      float mortar = step(f.x, .04) + step(f.y, .13); col *= .8 + .4*h(id) ; col = mix(col, vec3(.62,.58,.52), clamp(mortar,0.,1.)); col *= .85 + .3*fbm(uv*20.); ao = mortar>0. ? .75 : 1.; }
    else if (m == 2) { // тёсаный камень
      vec2 q = uv / vec2(.6, .32); q.x += h(vec2(floor(q.y), 3.)) ; vec2 f = fract(q), id = floor(q);
      float j = min(min(f.x, 1.-f.x)*1.8, min(f.y, 1.-f.y)); float joint = 1. - smoothstep(.02, .06, j);
      col *= .78 + .35*h(id) ; col *= .7 + .5*fbm(uv*6. + id); col = mix(col, col*.45, joint); ao = 1. - joint*.4; }
    else if (m == 3) { // доски
      vec2 q = uv; float w = .14; float id = floor(q.y / w + .5*0.); float g = fbm(vec2(q.x*1.5, q.y*40.) + id*7.);
      col *= .75 + .45*g; col *= .85 + .3*h(vec2(id, 1.)); float seam = smoothstep(.0, .015, abs(fract(q.y / w) - .0)); col *= mix(.6, 1., seam); rough = .7; }
    else if (m == 4) { col *= .82 + .3*fbm(uv*3.) ; col *= .92 + .16*h(floor(uv*80.)); col -= .06*step(.985, h(floor(uv*40.))); }
    else if (m == 5) { float g = fbm(uv*1.3); float g2 = fbm(uv*9.); col = mix(col*.75, col*1.15, g); col = mix(col, vec3(.36,.30,.18)*.6, smoothstep(.62,.8, g2)*.35); col *= .85 + .25*h(floor(uv*120.)); }
    else if (m == 6) { col *= .9 + .12*fbm(uv*8.); col *= .97 + .05*h(floor(uv*200.)); }
    else if (m == 7) { vec2 q = uv / .3; vec2 f = fract(q); float l = step(f.x,.03)+step(f.y,.03); col = mix(col, col*.55, clamp(l,0.,1.)); col *= .92+.12*h(floor(q)); spec = .25; rough = .3; }
    else if (m == 8) { float r = fbm(P.xz*3. + vec2(uT*.4, uT*.3)); n = normalize(n + vec3(r-.5, 0., fbm(P.xz*3.+7.)-.5)*.35); spec = .6; rough = .08; col *= .8 + .2*r; }
    else if (m == 11) { spec = .55; rough = .3; col *= .9 + .15*fbm(uv*12.); }
    else if (m == 12 || m == 13 || m == 18) { col *= .7 + .55*fbm(uv*(m==18? 6. : 2.5)); col *= .88 + .2*h(floor(uv*90.)); if (m == 13) { spec = .35; rough = .35; } }
    else if (m == 14) { col *= .85 + .2*fbm(uv*30.); }
    else if (m == 15) { rough = .55; spec = .05; }
    else if (m == 16) { spec = .8; rough = .05; }
    else if (m == 17) { col *= .75 + .4*fbm(uv*14.); col *= .9 + .2*h(floor(uv*160.)); }
    else if (m == 19) { // черепица/шифер рядами
      vec2 q = uv / vec2(.32, .22); q.x += .5*step(1., mod(floor(q.y),2.)); vec2 f = fract(q); float l = smoothstep(.0,.12,f.y); col *= mix(.5, 1., l) * (.85+.3*h(floor(q))); spec = .12; }
    else { col *= .95 + .08*fbm(uv*5.); }
    // тень
    float sh = 1.;
    if (uShOn > .5) { vec3 lp = vL.xyz / vL.w * .5 + .5; float bias = .0012 + .002*(1.-max(dot(n,uSun),0.)); sh = 0.;
      for (int i=-1;i<=1;i++) for (int j=-1;j<=1;j++) sh += texture(uSh, vec3(lp.xy + vec2(i,j)/2048.*1.6, lp.z - bias));
      sh /= 9.; if (lp.x<0.||lp.x>1.||lp.y<0.||lp.y>1.) sh = 1.; }
    float ndl = max(dot(n, uSun), 0.);
    vec3 hv = normalize(uSun + V); float sp = pow(max(dot(n, hv), 0.), mix(8., 180., 1.-rough)) * spec * 4. * ndl;
    float fres = pow(1. - max(dot(n, V), 0.), 5.);
    vec3 amb = mix(uGnd, uSkyT, n.y*.5+.5) * .55;
    vec3 c = col * (amb * ao + uSunC * ndl * sh) + uSunC * sp * sh + (m == 8 || m == 16 ? sky(reflect(-V, n)) * (.15 + .85*fres) * .6 : vec3(0.));
    c *= uTint;
    // туман
    float d = length(P - uE); float fg = 1. - exp(-d * uFog) ; fg *= exp(-max(P.y, 0.) * uFogH);
    c = mix(c, sky(normalize(P - uE)) * .9 + uSkyH*.1, clamp(fg, 0., 1.));
    c *= uExp; c = (c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);
    o = vec4(pow(c, vec3(1./2.2)), uAlpha);
  }`;
  const SVS = `#version 300 es
  layout(location=0) in vec3 aP; uniform mat4 uL, uM; out float vY; void main(){ vec4 w = uM * vec4(aP,1.); vY = w.y; gl_Position = uL * w; }`;
  const SFS = `#version 300 es
  precision highp float; in float vY; uniform vec2 uClip; out vec4 o; void main(){ if (vY < uClip.x || vY > uClip.y) discard; o = vec4(1.); }`;

  let gl, prog, sprog, shTex, shFB, W, H, U = {}, SU = {}, skyMesh;
  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function link(v, f) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
  function init(canvas, w = 1080, h = 1920) {
    W = w; H = h; canvas.width = w; canvas.height = h;
    gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
    prog = link(VS, FS); sprog = link(SVS, SFS);
    for (const n of ['uVP', 'uM', 'uL', 'uE', 'uSun', 'uSunC', 'uSkyT', 'uSkyH', 'uGnd', 'uTint', 'uFog', 'uFogH', 'uAlpha', 'uT', 'uExp', 'uSh', 'uShOn', 'uClip']) U[n] = gl.getUniformLocation(prog, n);
    for (const n of ['uL', 'uM', 'uClip']) SU[n] = gl.getUniformLocation(sprog, n);
    shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, 2048, 2048);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    shFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, shFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shTex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    skyMesh = build(new Mesh().sphere([0, 0, 0], 1, { mat: 'sky', seg: 24, rings: 12 }));
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  }
  function build(mesh) {
    const data = new Float32Array(mesh.v), vao = gl.createVertexArray(), buf = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const st = 40; gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 24); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 36);
    gl.bindVertexArray(null); return { vao, count: data.length / 10 };
  }
  let VP = M.id(), E = [0, 0, 0];
  /** кадр. s: { cam: {pos, target, fov}, sun: {dir, color, intensity}, sky: {top, horizon, ground}, fog, fogH, exposure, shadow: {center, radius}, items: [{mesh, M, tint, alpha, noShadow}], t } */
  function frame(s) {
    const cam = s.cam; E = cam.pos;
    const P = M.persp((cam.fov || 40) * Math.PI / 180, W / H, cam.near || .1, cam.far || 600); VP = M.mul(P, M.look(cam.pos, cam.target));
    const L = V.norm(s.sun.dir), sc = s.shadow || { center: cam.target, radius: 30 };
    const LV = M.look(V.add(sc.center, V.mul(L, sc.radius * 2)), sc.center), r = sc.radius, LP = M.mul(M.ortho(-r, r, -r, r, .1, r * 4), LV);
    const items = s.items.filter((i) => i && i.mesh && (i.alpha ?? 1) > .003);
    // карта теней
    gl.bindFramebuffer(gl.FRAMEBUFFER, shFB); gl.viewport(0, 0, 2048, 2048); gl.clear(gl.DEPTH_BUFFER_BIT); gl.useProgram(sprog); gl.uniformMatrix4fv(SU.uL, false, LP);
    gl.disable(gl.CULL_FACE);
    for (const it of items) if (!it.noShadow && (it.alpha ?? 1) > .5) { gl.uniform2fv(SU.uClip, it.clip || [-1e9, 1e9]); gl.uniformMatrix4fv(SU.uM, false, it.M || M.id()); gl.bindVertexArray(it.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, it.mesh.count); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);
    const sunC = lin(hex(s.sun.color || '#fff4e0')).map((v) => v * (s.sun.intensity ?? 3));
    const u3 = (n, v) => gl.uniform3fv(U[n], v);
    u3('uE', cam.pos); u3('uSun', L); u3('uSunC', sunC); u3('uSkyT', lin(hex(s.sky.top)).map((v) => v * (s.sky.k ?? 1))); u3('uSkyH', lin(hex(s.sky.horizon))); u3('uGnd', lin(hex(s.sky.ground || '#6b5a45')).map((v) => v * .6));
    gl.uniform1f(U.uFog, s.fog ?? .006); gl.uniform1f(U.uFogH, s.fogH ?? .02); gl.uniform1f(U.uT, s.t || 0); gl.uniform1f(U.uExp, s.exposure ?? 1);
    gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniformMatrix4fv(U.uL, false, LP);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shTex); gl.uniform1i(U.uSh, 0); gl.uniform1f(U.uShOn, s.noShadows ? 0 : 1);
    // небо
    gl.disable(gl.CULL_FACE); gl.depthMask(false); gl.uniformMatrix4fv(U.uM, false, M.mul(M.T(...cam.pos), M.S(400))); gl.uniform3fv(U.uTint, [1, 1, 1]); gl.uniform1f(U.uAlpha, 1);
    gl.uniform2fv(U.uClip, [-1e9, 1e9]); gl.bindVertexArray(skyMesh.vao); gl.drawArrays(gl.TRIANGLES, 0, skyMesh.count); gl.depthMask(true);
    const draw = (it) => { gl.uniform2fv(U.uClip, it.clip || [-1e9, 1e9]); gl.uniformMatrix4fv(U.uM, false, it.M || M.id()); gl.uniform3fv(U.uTint, it.tint || [1, 1, 1]); gl.uniform1f(U.uAlpha, it.alpha ?? 1); gl.bindVertexArray(it.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, it.mesh.count); };
    gl.disable(gl.BLEND); for (const it of items) if ((it.alpha ?? 1) >= .999) draw(it);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    for (const it of items) if ((it.alpha ?? 1) < .999) draw(it);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  /** мировая точка → CSS-пиксели 540×960; z<0 — за камерой */
  function proj(p) { const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13], w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15]; return [(x / w * .5 + .5) * 540, (1 - (y / w * .5 + .5)) * 960, w]; }
  return { V, M, Mesh, MAT, init, build, frame, proj, get gl() { return gl; } };
})();
