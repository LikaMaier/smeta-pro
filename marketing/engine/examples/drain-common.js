// Общие помощники для обучающих роликов про дренаж (разрез грунта, дождь, телефон, концовка)
const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const E = (tag, a = {}, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const eOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const back = (x) => { x = clamp(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const lerp = (a, b, k) => a + (b - a) * k;
const R = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const win = (t, a, b, fi = .25, fo = .2) => (t < a || t > b ? 0 : clamp(Math.min((t - a) / fi, (b - t) / fo)));

const COMMON_CSS = `
@font-face { font-family: 'PT'; src: url('file:///home/claude/smeta-pro/server/pdf/fonts/PT_Sans-Web-Bold.ttf'); font-weight: 700; }
@font-face { font-family: 'PTR'; src: url('file:///home/claude/smeta-pro/server/pdf/fonts/PT_Sans-Web-Regular.ttf'); }
@font-face { font-family: 'PTN'; src: url('file:///home/claude/smeta-pro/server/pdf/fonts/PT_Sans-Narrow-Web-Bold.ttf'); font-weight: 700; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 540px; height: 960px; overflow: hidden; background: #000; }
#stage { position: relative; width: 540px; height: 960px; overflow: hidden; }
svg.main { position: absolute; inset: 0; }
.cap { position: absolute; left: 22px; right: 22px; text-align: center; font-family: 'PT', 'Noto Color Emoji'; color: #fff; z-index: 19;
  -webkit-text-stroke: 7px #000; paint-order: stroke fill; line-height: 1.12; }
#hook { top: 70px; font-size: 40px; }
#sub { bottom: 70px; font-size: 32px; min-height: 80px; display: flex; align-items: flex-end; justify-content: center; }
#sub b, #hook b { color: #FFD43B; }
.tag { position: absolute; z-index: 15; font-family: 'PT', 'Noto Color Emoji'; font-size: 28px; padding: 8px 16px; border-radius: 14px; color: #fff; box-shadow: 0 8px 22px rgba(0,0,0,.35); white-space: nowrap; }
.tag.bad { background: #e5383b; } .tag.good { background: #2fa36b; } .tag.info { background: #0d2440; border: 2px solid #FFD43B; }
#phone { position: absolute; left: 139px; top: 150px; width: 262px; height: 560px; border-radius: 40px; background: #05080d; padding: 9px; box-shadow: 0 30px 70px rgba(0,0,0,.6), inset 0 0 0 3px #2c3442; z-index: 12; opacity: 0; }
#phone .scr { position: relative; width: 100%; height: 100%; border-radius: 32px; overflow: hidden; background: #0D2440; }
#phone img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top; }
#tap { position: absolute; width: 44px; height: 44px; margin: -22px; border-radius: 50%; background: rgba(255,255,255,.4); border: 3px solid rgba(255,255,255,.9); opacity: 0; }
#end { position: absolute; inset: 0; z-index: 30; background: radial-gradient(120% 80% at 50% 40%, #16365e, #0a1a30 70%); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; opacity: 0; color: #fff; text-align: center; font-family: 'PT'; }
#end .ic { font-family: 'Noto Color Emoji'; font-size: 84px; }
#end .logo { font-family: 'PTN'; font-size: 92px; color: #FFD43B; -webkit-text-stroke: 3px #08162a; paint-order: stroke fill; line-height: .9; }
#end .l2 { font-size: 29px; padding: 0 30px; line-height: 1.2; }
#end .bot { margin-top: 8px; background: #FFD43B; color: #0a1a30; font-family: 'PTN'; font-size: 46px; padding: 10px 26px; border-radius: 18px; box-shadow: 0 8px 0 #b38b00; }
#end .sm { font-size: 22px; color: #9fc8f5; }
#fade { position: absolute; inset: 0; background: #000; opacity: 0; z-index: 25; pointer-events: none; }
`;
document.head.insertAdjacentHTML('beforeend', `<style>${COMMON_CSS}</style>`);

const SCR = '/home/claude/smeta-pro/marketing/engine/sc/';
function setImg(el, n) { if (el._n !== n) { el.src = SCR + n + '.png'; el._n = n; } }

/** Телефон с экранами приложения: SCREENS = [[время, 'имя', x тапа, y тапа], …] */
function renderPhone(t, a, b, SCREENS) {
  const pin = back((t - a) / .5);
  $('phone').style.opacity = win(t, a, b, .2, .25);
  $('phone').style.transform = `translateY(${(1 - pin) * 520}px) rotate(${lerp(10, -3, pin) + Math.sin(t * 1.3) * 1}deg)`;
  let cur = SCREENS[0], nxt = null;
  for (let i = 0; i < SCREENS.length; i++) if (t >= SCREENS[i][0]) { cur = SCREENS[i]; nxt = SCREENS[i + 1]; }
  setImg($('imA'), cur[1]);
  const sw = nxt ? clamp((t - (nxt[0] - .25)) / .25) : 0;
  if (nxt) setImg($('imB'), nxt[1]);
  $('imA').style.transform = `translateX(${-sw * 100}%)`; $('imB').style.transform = `translateX(${(1 - sw) * 100}%)`; $('imB').style.opacity = sw > 0 ? 1 : 0;
  const tk = nxt ? (t - (nxt[0] - .7)) / .45 : -1, tp = $('tap');
  if (tk > 0 && tk < 1) { tp.style.left = cur[2] + 'px'; tp.style.top = cur[3] + 'px'; tp.style.opacity = 1 - tk; tp.style.transform = `scale(${.6 + tk})`; } else tp.style.opacity = 0;
}

let _sub = '';
function renderSubs(t, SUBS) {
  const s = SUBS.find(([a, b]) => t >= a && t < b);
  const h = s ? s[2] : '';
  if (h !== _sub) { $('sub').innerHTML = `<span>${h}</span>`; _sub = h; }
  $('sub').style.opacity = s ? win(t, s[0], s[1], .18, .15) : 0;
  $('sub').style.transform = s ? `scale(${lerp(.9, 1, eOut((t - s[0]) / .2))})` : '';
}

/** Капли дождя: группа SVG-линий, падают по кругу */
function makeRain(g, n = 70) {
  const drops = [];
  for (let i = 0; i < n; i++) drops.push(E('line', { x1: 0, y1: 0, x2: -4, y2: 18, stroke: '#bfe3ff', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .75 }, g));
  return (t, k, ground = 470) => drops.forEach((d, i) => {
    const sp = 520 + R(i) * 260, ph = R(i + 9);
    const y = ((t * sp / 600 + ph) % 1) * (ground + 60) - 40, x = R(i + 3) * 600 - 30 - y * .2;
    d.setAttribute('transform', `translate(${x} ${y})`); d.setAttribute('opacity', k * (.5 + R(i + 4) * .4));
  });
}

/** Плитки-шаги и ярлыки (HTML) */
function renderTag(id, t, a, b, dx = 0) {
  const el = $(id);
  el.style.opacity = win(t, a, b, .2, .2);
  el.style.transform = `translateX(${dx}px) scale(${back((t - a) / .35)})`;
}

function renderEnd(t, a) {
  $('end').style.opacity = clamp((t - a) / .4);
  $('end').firstElementChild.style.transform = `rotate(${Math.sin(t * 3) * 8}deg) scale(${back((t - a - .1) / .5)})`;
}

function readyWith(names) {
  window.READY = Promise.all([document.fonts.ready, ...names.map((n) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = SCR + n + '.png'; }))])
    .then(() => { window.render(0); window.OK = true; });
}
