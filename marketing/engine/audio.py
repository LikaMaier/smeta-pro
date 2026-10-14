"""Звук ролика: эпик с ветром → бит под приложение → триумф → лоу-фай под тигра → джингл. Стерео, ревербератор, лимитер."""
import numpy as np, wave
from scipy.signal import lfilter, butter, sosfilt, fftconvolve

SR = 44100; DUR = 25.5; N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(5)
T = {'s1': 0.0, 'phone': 6.4, 'win': 13.2, 's3': 16.6, 'end': 22.6}

def f(n): return 440 * 2 ** ((n - 69) / 12)
def t_(d): return np.arange(int(d * SR)) / SR
def adsr(n, a=.01, d=.1, s=.7, r=.2):
    t = np.arange(n) / SR; tot = n / SR
    e = np.where(t < a, t / max(a, 1e-4), np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-4), s))
    rel = np.clip((tot - t) / max(r, 1e-4), 0, 1)
    return e * rel
def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR / 2 - 100) / (SR / 2), 'low', output='sos'), x)
def hp(x, fc, order=2):
    return sosfilt(butter(order, fc / (SR / 2), 'high', output='sos'), x)
def bp(x, lo, hi):
    return sosfilt(butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos'), x)
def saw(fr, d, det=0.0):
    t = t_(d); return 2 * ((fr * (1 + det) * t) % 1) - 1
def add(sig, at, g=1.0, pan=0.0, bus=None):
    i = int(at * SR); j = min(N, i + len(sig))
    if i >= N or j <= 0: return
    s = sig[:j - i] * g
    lg, rg = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    (bus or (L, R))[0][i:j] += s * lg * 1.414; (bus or (L, R))[1][i:j] += s * rg * 1.414

# шина с ревербом
RL = np.zeros(N); RR = np.zeros(N); REV = (RL, RR)

# ---------------- инструменты ----------------
def pad(notes, at, d, g=.12, cut=900, rev=.6):
    for k, n in enumerate(notes):
        for det, pan in ((-.006, -.6), (.006, .6), (0, 0)):
            x = lp(saw(f(n), d, det), cut) * adsr(int(d * SR), a=.6, d=.3, s=.9, r=.8)
            add(x, at, g / len(notes), pan); add(x, at, g * rev / len(notes), pan, REV)
def choir(notes, at, d, g=.08):
    for n in notes:
        x = saw(f(n), d, .003) + saw(f(n), d, -.004)
        y = bp(x, 600, 900) * 1.2 + bp(x, 1000, 1300) * .6
        y *= adsr(len(y), a=.8, d=.2, s=1, r=1.0) * (1 + .08 * np.sin(2 * np.pi * 5 * t_(d)))
        add(y, at, g, 0); add(y, at, g * 1.2, 0, REV)
def taiko(at, g=1.0):
    t = t_(1.2); fr = 70 * np.exp(-t * 3) + 45
    x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 4.5) + lp(rng.standard_normal(len(t)), 900) * np.exp(-t * 18) * .6
    add(x, at, g * .9); add(x, at, g * .5, 0, REV)
def kick(at, g=1.0):
    t = t_(.4); fr = 48 + 140 * np.exp(-t * 35)
    add(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 7) + np.tanh(np.sin(2 * np.pi * np.cumsum(fr) / SR) * 3) * np.exp(-t * 30) * .3, at, g)
def clap(at, g=1.0):
    t = t_(.25); x = bp(rng.standard_normal(len(t)), 900, 3500)
    e = np.exp(-t * 22) + np.where(t < .02, .6, 0) * np.exp(-((t * 120) % 1) * 4)
    add(x * e, at, g * .5, .1); add(x * e, at, g * .35, 0, REV)
def hat(at, g=.3, d=.06, pan=.3):
    t = t_(d); add(hp(rng.standard_normal(len(t)), 7000) * np.exp(-t * 70), at, g, pan)
def sub808(n, at, d, g=.5):
    t = t_(d); fr = f(n) * (1 + .5 * np.exp(-t * 40))
    x = np.tanh(np.sin(2 * np.pi * np.cumsum(fr) / SR) * 1.6) * adsr(len(t), .005, .1, .8, .08)
    add(x, at, g)
def pluck(n, at, d=.35, g=.15, pan=0.0, rev=.5, bright=3000):
    x = saw(f(n), d, .004) * .5 + saw(f(n), d, -.004) * .5
    t = t_(d); y = lp(x, bright) * np.exp(-t * 9)
    add(y, at, g, pan); add(y, at, g * rev, pan, REV)
def brass(notes, at, d, g=.16):
    for n in notes:
        for det, pan in ((-.005, -.4), (.005, .4)):
            x = saw(f(n), d, det); t = t_(d)
            cut = 600 + 3200 * np.exp(-t * 3)  # «вау» фильтром — делаем кусками
            y = np.zeros_like(x)
            for k in range(0, len(x), 2048):
                y[k:k + 2048] = lp(x[k:k + 2048], cut[k])
            y *= adsr(len(y), .04, .2, .7, .5)
            add(y, at, g / len(notes), pan); add(y, at, g * .6 / len(notes), pan, REV)
def crash(at, g=.35):
    t = t_(2.5); x = hp(rng.standard_normal(len(t)), 4000) * np.exp(-t * 1.6)
    add(x, at, g, -.2); add(x, at, g * .5, .2, REV)
def riser(at, d, g=.25):
    t = t_(d); x = rng.standard_normal(len(t)); y = np.zeros_like(x)
    for k in range(0, len(x), 1024):
        fc = 300 + 7000 * (k / len(x)) ** 2; y[k:k + 1024] = bp(x[k:k + 1024], max(100, fc * .7), min(18000, fc * 1.3))
    add(y * (t / d) ** 2, at, g); add(y * (t / d) ** 2, at, g * .5, 0, REV)
def whoosh(at, d=.35, g=.25):
    t = t_(d); x = bp(rng.standard_normal(len(t)), 500, 4000) * np.sin(np.pi * t / d) ** 2
    add(x, at, g, -.5); add(x, at, g * .3, .5, REV)
def tap(at, g=.35):
    t = t_(.08); add(np.sin(2 * np.pi * (1800 - 9000 * t) * t) * np.exp(-t * 60), at, g, .2)
def rhodes(n, at, d=1.6, g=.12, pan=0.0):
    t = t_(d); fc = f(n)
    idx = 2.2 * np.exp(-t * 3)
    x = np.sin(2 * np.pi * fc * t + idx * np.sin(2 * np.pi * fc * t)) * np.exp(-t * 1.4) * (1 + .15 * np.sin(2 * np.pi * 4.5 * t))
    x *= adsr(len(t), .005, .1, 1, .3)
    add(x, at, g, pan); add(x, at, g * .5, pan, REV)
def bell(n, at, g=.12, d=1.8):
    t = t_(d); x = sum(a * np.sin(2 * np.pi * f(n) * r * t) * np.exp(-t * k) for r, a, k in ((1, 1, 2.5), (2.76, .5, 4), (5.4, .25, 6)))
    add(x, at, g, .3); add(x, at, g * .8, -.3, REV)
def vib(n, at, g=.14):
    t = t_(1.2); x = (np.sin(2 * np.pi * f(n) * t) + .3 * np.sin(2 * np.pi * f(n) * 4 * t) * np.exp(-t * 8)) * np.exp(-t * 2.5) * (1 + .2 * np.sin(2 * np.pi * 6 * t))
    add(x, at, g); add(x, at, g * .6, 0, REV)

# ================= 1. эпик с ветром (Ре минор) =================
t = t_(T['phone'] + .3); w = rng.standard_normal(len(t)); wl = np.zeros_like(w)
for k in range(0, len(w), 2048):
    fc = 500 + 450 * np.sin(k / SR * 1.3) + (500 if 3 < k / SR < 5.2 else 0); wl[k:k + 2048] = bp(w[k:k + 2048], fc * .6, fc * 1.6)
env = np.clip(t / .4, 0, 1) * np.clip((T['phone'] + .3 - t) / .5, 0, 1) * (.6 + .4 * np.sin(t * 1.7) ** 2)
add(wl * env, 0, .32, -.3); add(np.roll(wl, 3000) * env, 0, .32, .3)
pad([38, 50, 53, 57], 0.0, 3.2, g=.22)            # Dm
pad([34, 46, 50, 53], 3.0, 2.4, g=.24)            # Bb
pad([43, 55, 58, 62], 5.2, 1.4, g=.24, cut=1400)  # Gm
choir([62, 65, 69], 0.4, 2.8); choir([62, 65, 70], 3.0, 2.3); choir([67, 70, 74], 5.2, 1.3)
for at, g in ((0.0, .8), (1.6, .6), (3.0, 1.0), (3.75, .6), (4.4, .8), (5.2, 1.0), (5.6, .6), (5.9, .7), (6.15, .8)): taiko(at, g)
for k in range(32):  # тремоло струнных — напряжение
    at = 3.0 + k * .068; pluck(62 + (k % 2) * 3, at, d=.08, g=.05, pan=(-1) ** k * .4, rev=.8, bright=2200)
riser(5.2, 1.2, .3)

# ================= 2. бит под приложение (120 BPM) =================
b = 60 / 120; t0 = T['phone']
crash(t0, .3); kick(t0, 1.1)
bars = [(38, [62, 65, 69]), (34, [62, 65, 70]), (36, [60, 64, 67]), (33, [61, 64, 69])]
mel = [74, 72, 69, 72, 74, 77, 76, 72, 74, 72, 69, 65, 67, 69, 72, 69]
for i in range(int((T['win'] - t0) / b)):
    at = t0 + i * b; bar = (i // 4) % 4
    if i % 4 in (0, 2) or i % 8 == 7: kick(at, 1.3)
    if i % 4 in (1, 3): clap(at, 1.3)
    for h in range(4): hat(at + h * b / 4, .12 if h % 2 else .2, pan=.35 if h % 2 else -.2)
    if i % 2 == 0: sub808(bars[bar][0], at, b * 1.9, .6)
    pluck(mel[i % 16], at, d=.28, g=.17, pan=.25)
    if i % 4 == 0:
        for n in bars[bar][1]: pluck(n - 12, at, d=b * 3.6, g=.06, pan=-.3, rev=.8, bright=1500)
span = (T['win'] - t0) / 5
for i in range(5):
    if i in (0, 1, 2, 4): tap(t0 + span * (i + .62))
    if i < 4: whoosh(t0 + span * (i + .8), .3, .22)

# ================= 3. триумф (Ре мажор) =================
t0 = T['win']
riser(t0 - .8, .8, .25)
kick(t0, 1.1); taiko(t0, .8); crash(t0, .3)
brass([50, 57, 62, 66, 69], t0, 1.6, .28); brass([52, 59, 64, 67, 71], t0 + 1.6, .8, .24); brass([50, 57, 62, 66, 74], t0 + 2.4, 1.0, .27)
choir([62, 66, 69, 74], t0, 3.3, .06)
for k, n in enumerate([74, 78, 81, 86, 81, 86, 90]): bell(n, t0 + .2 + k * .12, .05)
taiko(t0 + 1.6, .7); taiko(t0 + 2.4, .9)

# ================= 4. лоу-фай под тигра (80 BPM) =================
t0 = T['s3']; b = 60 / 80
crk = rng.standard_normal(int((T['end'] - t0 + .5) * SR)); crk = hp(crk, 3000) * (rng.random(len(crk)) > .9993) * 1.5 + lp(rng.standard_normal(len(crk)), 400) * .02
add(crk, t0, .25)
chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60, 64], [48, 52, 55, 59]]  # Fmaj7 Em7 Dm9 Cmaj7
roots = [41, 40, 38, 36]
for i in range(int((T['end'] - t0) / b) + 1):
    at = t0 + i * b; c = (i // 2) % 4
    if at > T['end']: break
    if i % 2 == 0:
        for k, n in enumerate(chords[c]): rhodes(n, at + k * .015, d=b * 2.1, g=.095, pan=-.3 + k * .15)
        sub = np.sin(2 * np.pi * f(roots[c]) * t_(b * 1.8)) * adsr(int(b * 1.8 * SR), .02, .2, .7, .2); add(sub, at, .25)
    kk = lambda a, g: add(lp(np.sin(2 * np.pi * np.cumsum(50 + 90 * np.exp(-t_(.35) * 30)) / SR) * np.exp(-t_(.35) * 9), 300), a, g)
    if i % 2 == 0: kk(at, .7)
    else: add(lp(bp(rng.standard_normal(int(.2 * SR)), 300, 2500) * np.exp(-t_(.2) * 18), 2500), at, .35)
    hat(at + b * .5 + .04, .05, .04); hat(at, .04, .03)
for at in (17.2, 18.6): vib(76, at, .1)
# «Вот такие дела, собачка» — спокойное нисходящее «та-да-дам»
for k, n in enumerate([72, 69, 65, 64]): vib(n, 20.2 + k * .22, .16)

# ================= 5. джингл =================
t0 = T['end']
for k, n in enumerate([62, 66, 69, 74, 78, 81]): pluck(n, t0 + .05 + k * .09, d=.6, g=.1, pan=(-1) ** k * .3, rev=.8, bright=5000)
bell(86, t0 + .6, .12, 2.5); bell(81, t0 + .75, .08, 2.5)
pad([50, 57, 62, 66], t0 + .1, 2.8, g=.16, cut=1800)

# ---------------- ревербератор (свёртка с затухающим шумом) ----------------
irt = t_(2.4); ir = rng.standard_normal(len(irt)) * np.exp(-irt * 2.6)
irL = lp(ir, 6000); irR = lp(np.roll(ir, 731), 6000)
irL[:int(.012 * SR)] = 0; irR[:int(.017 * SR)] = 0
wetL = fftconvolve(hp(RL, 200), irL)[:N] * .18; wetR = fftconvolve(hp(RR, 200), irR)[:N] * .18
L += wetL; R += wetR

# ---------------- мастер ----------------
for ch in (L, R):
    ch[:] = hp(ch, 30)
m = max(np.abs(L).max(), np.abs(R).max())
L /= m; R /= m
L = np.tanh(L * 1.6) / np.tanh(1.6); R = np.tanh(R * 1.6) / np.tanh(1.6)
fade = np.clip((DUR - np.arange(N) / SR) / 1.0, 0, 1); L *= fade * .9; R *= fade * .9
pcm = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open('a.wav', 'wb') as w_:
    w_.setnchannels(2); w_.setsampwidth(2); w_.setframerate(SR); w_.writeframes(pcm.tobytes())
print('ok')
