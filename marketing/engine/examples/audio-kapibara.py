"""Звук ролика: эпик с ветром → бит под приложение → триумф → лоу-фай под тигра → джингл. Стерео, ревербератор, лимитер."""
import numpy as np, wave
from scipy.signal import lfilter, butter, sosfilt, fftconvolve

SR = 44100; DUR = 28.0; N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(5)


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


def chirp(at, g=.05):
    for k in range(3):
        t = t_(.07); fr = 3200 + 1400 * np.sin(np.pi * t / .07)
        add(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * t / .07), at + k * .11, g, .6)
def pizz(n, at, g=.12, pan=0.0):
    t = t_(.25); x = (np.sin(2 * np.pi * f(n) * t) + .4 * np.sin(4 * np.pi * f(n) * t)) * np.exp(-t * 18)
    add(x, at, g, pan); add(x, at, g * .4, pan, REV)
def thud(at, g=.6):
    t = t_(.5); add(lp(np.sin(2 * np.pi * np.cumsum(60 + 80 * np.exp(-t * 20)) / SR) * np.exp(-t * 8), 400), at, g)
def bubble(at, g=.08):
    t = t_(.1); fr = 500 + 2500 * t / .1
    add(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 30), at, g, rng.random() - .5)

# ---- 1. «документалка»: струнный пэд + фортепиано (0–4.6), птицы
amb = lp(rng.standard_normal(int(13.5 * SR)), 900) * .03; add(amb, 0, 1)
pad([48, 55, 60, 64], 0, 2.4, g=.14, cut=1100); pad([45, 52, 57, 60], 2.3, 2.4, g=.14, cut=1100)
for k, n in enumerate([72, 76, 79, 76, 74, 72, 69, 72]): rhodes(n, .2 + k * .55, d=1.2, g=.09, pan=.2)
for a in (0.6, 1.9, 3.3, 5.8, 8.8, 12.6): chirp(a, .04)
# ---- 2. паника бобров: пиццикато 150 BPM (4.6–11.6), на 9.8 быстрее
b = 60 / 150
x = 4.55; k = 0
scale = [60, 62, 64, 65, 67, 65, 64, 62]
while x < 11.5:
    pizz(scale[k % 8] + (12 if k % 16 >= 8 else 0), x, .22, (-1) ** k * .4)
    if k % 2 == 0: pizz(48 + (k // 8 % 2) * 5, x, .22, 0)
    if k % 4 == 0: kick(x, .8)
    hat(x, .05)
    k += 1; x += b if x < 9.8 else b / 1.6
pad([48, 52, 55, 60], 4.6, 5.2, g=.12, cut=800)
for a in (8.1, 8.6): tap(a, .3); whoosh(a - .05, .2, .12)
riser(9.3, .5, .15)
for k in range(8): whoosh(10.3 + k * .12, .3, .14)
thud(11.42, .7)
# ---- 3. стоп-кадр и наезд на капибару (11.6–13.5): тишина + «драматичный» аккорд
pad([41, 48, 53, 56], 11.6, 2.0, g=.22, cut=700)
choir([65, 68, 72], 11.7, 1.8, .06)
taiko(12.9, .5)
# ---- 4. лоу-фай под телефон и баню (13.5–25.2), 84 BPM
t0 = 13.5; b = 60 / 84
chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60, 64], [48, 52, 55, 59]]
roots = [41, 40, 38, 36]
crk = rng.standard_normal(int(12 * SR)); crk = hp(crk, 3000) * (rng.random(len(crk)) > .9993) * 1.5 + lp(rng.standard_normal(len(crk)), 400) * .02
add(crk, t0, .25)
i = 0
while t0 + i * b < 25.1:
    at = t0 + i * b; c = (i // 2) % 4
    if i % 2 == 0:
        for k2, n in enumerate(chords[c]): rhodes(n, at + k2 * .015, d=b * 2.1, g=.09, pan=-.3 + k2 * .15)
        add(np.sin(2 * np.pi * f(roots[c]) * t_(b * 1.8)) * adsr(int(b * 1.8 * SR), .02, .2, .7, .2), at, .25)
        add(lp(np.sin(2 * np.pi * np.cumsum(50 + 90 * np.exp(-t_(.35) * 30)) / SR) * np.exp(-t_(.35) * 9), 300), at, .7)
    else: add(lp(bp(rng.standard_normal(int(.2 * SR)), 300, 2500) * np.exp(-t_(.2) * 18), 2500), at, .35)
    hat(at + b * .5 + .04, .05, .04)
    i += 1
for a in (14.65, 16.05, 17.25, 18.75): tap(a, .3)
for a in (15.3, 16.5, 18.0): whoosh(a - .2, .25, .12)
for k, n in enumerate([84, 88, 91]): bell(n, 19.2 + k * .08, .06, 1.2)
# баня: бульканье и «аах»
for k in range(26): bubble(20.6 + rng.random() * 4.4, .05)
for k, n in enumerate([72, 69, 65, 64]): vib(n, 22.9 + k * .24, .13)
# ---- 5. джингл
t0 = 25.2
for k, n in enumerate([60, 64, 67, 72, 76, 79]): pluck(n, t0 + .05 + k * .09, d=.6, g=.1, pan=(-1) ** k * .3, rev=.8, bright=5000)
bell(84, t0 + .6, .12, 2.2); pad([48, 55, 60, 64], t0 + .1, 2.6, g=.14, cut=1800)
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
