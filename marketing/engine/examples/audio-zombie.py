"""Звук ролика: ночная жуть (шкатулка, терменвокс, сердце) → бит под приложение → рассвет → джингл. Стерео, ревербератор, лимитер."""
import numpy as np, wave
from scipy.signal import lfilter, butter, sosfilt, fftconvolve

SR = 44100; DUR = 20; N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(5)
T = {'note': 2.4, 'pere': 4.4, 'phone': (6.4, 12.6), 'win': (12.6, 16.6), 'end': (16.6, 20)}
import sys; OUT = sys.argv[1] if len(sys.argv) > 1 else 'a.wav'

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


def theremin(notes, at, step, g=.09):
    d = step * len(notes) + .4; t = t_(d)
    idx = np.minimum((t / step).astype(int), len(notes) - 1)
    fr = np.array([f(n) for n in notes])[idx]
    fr = lfilter([.002], [1, -.998], fr - fr[0]) + fr[0]
    fr = fr * (1 + .012 * np.sin(2 * np.pi * 5.5 * t))
    x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * adsr(len(t), .3, .2, .9, .4)
    add(x, at, g, .1); add(x, at, g, -.1, REV)
def box(n, at, g=.07):
    t = t_(1.2); x = (np.sin(2 * np.pi * f(n) * t) + .4 * np.sin(2 * np.pi * f(n) * 3.01 * t) * np.exp(-t * 6)) * np.exp(-t * 3.5)
    add(x, at, g, .35); add(x, at, g, -.2, REV)
def ding(at, g=.2):
    for n, dt in ((88, 0), (93, .12)): bell(n, at + dt, g * .6, 1.2)
def heart(at, g=.8):
    for dt, k in ((0, 1), (.2, .7)):
        t = t_(.3); fr = 40 + 50 * np.exp(-t * 30)
        add(lp(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 12), 200), at + dt, g * k)
def birds(at, d, g=.05):
    k = 0
    while k < d:
        t = t_(.12); fr = 3200 + 1400 * np.sin(np.pi * t / .12)
        add(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * t / .12), at + k, g, (-1) ** int(k * 7) * .5)
        k += .18 + rng.random() * .5

# ================= 1. ночная жуть (0–6.4) =================
t = t_(T['phone'][0] + .3); w = rng.standard_normal(len(t)); wl = np.zeros_like(w)
for k in range(0, len(w), 2048):
    fc = 400 + 250 * np.sin(k / SR * 1.1); wl[k:k + 2048] = bp(w[k:k + 2048], fc * .6, fc * 1.6)
env = np.clip(t / .4, 0, 1) * np.clip((T['phone'][0] + .3 - t) / .5, 0, 1)
add(wl * env, 0, .22, -.3); add(np.roll(wl, 3000) * env, 0, .22, .3)
pad([38, 45, 50, 53], 0.0, 4.6, g=.22, cut=600)
pad([37, 44, 49, 52], 4.4, 2.2, g=.24, cut=900)
mel = [74, 77, 76, 74, 73, 74, 70, 69]
for k, n in enumerate(mel): box(n, .1 + k * .3, .09)
theremin([62, 65, 64, 61], .4, .5, .08)
for at in (0.0, .9, 1.8, 2.7, 3.6): heart(at, .75)
ding(T['note'], .3)
for k, at in enumerate((4.4, 4.8, 5.2, 5.6)):
    taiko(at, .9); brass([37 + k, 44 + k, 49 + k], at, .35, .22)
riser(5.6, .8, .3)

# ================= 2. бит под приложение (6.4–12.6) =================
b = 60 / 120; t0 = T['phone'][0]
crash(t0, .3); kick(t0, 1.1)
bars = [(38, [62, 65, 69]), (34, [62, 65, 70]), (36, [60, 64, 67]), (33, [61, 64, 69])]
m2 = [74, 72, 69, 72, 74, 77, 76, 72, 74, 72, 69, 65, 67, 69, 72, 69]
for i in range(int((T['win'][0] - t0) / b)):
    at = t0 + i * b; bar = (i // 4) % 4
    if i % 4 in (0, 2) or i % 8 == 7: kick(at, 1.3)
    if i % 4 in (1, 3): clap(at, 1.3)
    for h in range(4): hat(at + h * b / 4, .12 if h % 2 else .2, pan=.35 if h % 2 else -.2)
    if i % 2 == 0: sub808(bars[bar][0], at, b * 1.9, .6)
    pluck(m2[i % 16], at, d=.28, g=.17, pan=.25)
    if i % 4 == 0:
        for n in bars[bar][1]: pluck(n - 12, at, d=b * 3.6, g=.06, pan=-.3, rev=.8, bright=1500)
span = (T['phone'][1] - T['phone'][0]) / 4
for i in range(4):
    if i != 2: tap(t0 + span * (i + .6))
    if i < 3: whoosh(t0 + span * (i + .8), .3, .22)

# ================= 3. рассвет (12.6–16.6) =================
t0 = T['win'][0]
riser(t0 - .8, .8, .25); kick(t0, 1.0); crash(t0, .3)
pad([50, 57, 62, 66, 69], t0, 4.2, g=.24, cut=2200)
choir([62, 66, 69, 74], t0 + .2, 3.8, .06)
for k, n in enumerate([74, 78, 81, 86, 81, 78, 81, 86]): bell(n, t0 + .3 + k * .22, .06)
for k, n in enumerate([62, 66, 69, 66, 71, 69, 74, 73]): rhodes(n, t0 + .2 + k * .45, d=1.2, g=.12, pan=.2)
b = 60 / 90
for i in range(int(4.0 / b)):
    at = t0 + i * b
    if i % 2 == 0: kick(at, .7)
    else: clap(at, .6)
    hat(at + b / 2, .1)
birds(t0 + .8, 3.0, .04)

# ================= 4. джингл =================
t0 = T['end'][0]
for k, n in enumerate([62, 66, 69, 74, 78, 81]): pluck(n, t0 + .05 + k * .09, d=.6, g=.1, pan=(-1) ** k * .3, rev=.8, bright=5000)
bell(86, t0 + .6, .12, 2.5); bell(81, t0 + .75, .08, 2.5)
pad([50, 57, 62, 66], t0 + .1, 3.0, g=.16, cut=1800)

# ---------------- ревербератор (свёртка с затухающим шумом) ----------------
irt = t_(2.4); ir = rng.standard_normal(len(irt)) * np.exp(-irt * 2.6)
irL = lp(ir, 6000); irR = lp(np.roll(ir, 731), 6000)
irL[:int(.012 * SR)] = 0; irR[:int(.017 * SR)] = 0
wetL = fftconvolve(hp(RL, 200), irL)[:N] * .18; wetR = fftconvolve(hp(RR, 200), irR)[:N] * .18
L += wetL; R += wetR

CUTS = [0, 2.4, 4.4, 6.4, 12.6, 16.6, 20]
# ---------------- выравнивание громкости частей ----------------
gain = np.ones(N)
for a, b_ in zip(CUTS, CUTS[1:]):
    i, j = int(a * SR), int(b_ * SR); r = np.sqrt(((L[i:j] ** 2 + R[i:j] ** 2) / 2).mean()) + 1e-9
    gain[i:j] = 1 / r
gain = np.convolve(gain, np.ones(int(.15 * SR)) / int(.15 * SR), 'same'); gain[:int(.1 * SR)] = gain[int(.1 * SR)]; gain[-int(.1 * SR):] = gain[-int(.1 * SR)]
L *= gain; R *= gain

# ---------------- мастер ----------------
for ch in (L, R):
    ch[:] = hp(ch, 30)
m = max(np.abs(L).max(), np.abs(R).max())
L /= m; R /= m
L = np.tanh(L * 1.6) / np.tanh(1.6); R = np.tanh(R * 1.6) / np.tanh(1.6)
fade = np.clip((DUR - np.arange(N) / SR) / 1.0, 0, 1); L *= fade * .9; R *= fade * .9
pcm = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(OUT, 'wb') as w_:
    w_.setnchannels(2); w_.setsampwidth(2); w_.setframerate(SR); w_.writeframes(pcm.tobytes())
print('ok')
