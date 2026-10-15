"""Звук ролика: крадущийся пиццикато → фонк с коубеллом на «могну» → триумф → джингл. Стерео, ревербератор, лимитер."""
import numpy as np, wave
from scipy.signal import lfilter, butter, sosfilt, fftconvolve

SR = 44100; DUR = 20; N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(5)
T = {'mog': 4.0, 'phone': (6.2, 13.0), 'win': 13.0, 'end': (16.8, 20)}
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


def cowbell(n, at, d=.28, g=.12, pan=0.0):
    t = t_(d); fr = f(n)
    x = np.sign(np.sin(2 * np.pi * fr * t)) * .5 + np.sign(np.sin(2 * np.pi * fr * 1.48 * t)) * .5
    y = bp(x, 600, 3500) * np.exp(-t * 11)
    add(y, at, g, pan); add(y, at, g * .5, pan, REV)
def pizz(n, at, g=.16, pan=0.0):
    t = t_(.3); x = np.sin(2 * np.pi * f(n) * t) * np.exp(-t * 16) + .3 * np.sin(4 * np.pi * f(n) * t) * np.exp(-t * 25)
    add(x, at, g, pan); add(x, at, g * .4, pan, REV)
def scratch(at, g=.3):
    t = t_(.35); fr = 300 + 1600 * np.abs(np.sin(t * 28))
    x = bp(rng.standard_normal(len(t)), 300, 3000) * .6 + np.sin(2 * np.pi * np.cumsum(fr) / SR) * .4
    add(x * np.exp(-t * 4), at, g)

# ================= 1. «шпионская» пиццикато-крадучка (0–4.0) =================
b = 60 / 120
walk = [50, 53, 57, 53, 50, 53, 56, 55]
for i in range(8):
    at = i * b; pizz(walk[i] - 12, at, .2, -.2); pizz(walk[i], at + b / 2, .12, .3)
    if i % 2 == 0: kick(at, .55)
    hat(at + b / 2, .1)
pad([38, 50, 53, 57], 0.0, 4.0, g=.12, cut=700)
bell(81, 2.2, .06)
riser(3.0, 1.0, .28)
scratch(3.85, .28)

# ================= 2. фонк на «могну» (4.0–13.0) =================
t0 = T['mog']; b = 60 / 130
kick(t0, 1.4); crash(t0, .35); brass([38, 45, 50, 53], t0, .9, .3)
bassl = [38, 38, 41, 36]
cb = [74, 74, 77, 74, 72, 72, 69, 72, 74, 74, 77, 79, 77, 74, 72, 69]
nb = int((T['win'] - t0) / b)
for i in range(nb):
    at = t0 + i * b; bar = (i // 4) % 4
    if i % 4 in (0, 2) or i % 8 == 7: kick(at, 1.2)
    if i % 4 in (1, 3): clap(at, 1.1)
    for h in range(2): hat(at + h * b / 2, .14 if h else .2, pan=.3 if h else -.2)
    if i % 2 == 0: sub808(bassl[bar], at, b * 1.9, .62)
    cowbell(cb[i % 16], at, .22, .11, .2)
    if i % 2 == 1: cowbell(cb[(i + 3) % 16], at + b / 2, .18, .07, -.25)
span = (T['phone'][1] - T['phone'][0]) / 5
for i in range(5):
    if i != 3: tap(T['phone'][0] + span * (i + .65))
    if i < 4: whoosh(T['phone'][0] + span * (i + .8), .3, .22)
whoosh(T['phone'][0] - .2, .4, .3)

# ================= 3. триумф (13.0–16.8) =================
t0 = T['win']
riser(t0 - .8, .8, .25)
kick(t0, 1.1); taiko(t0, .8); crash(t0, .3)
brass([50, 57, 62, 66, 69], t0, 1.4, .28); brass([52, 59, 64, 67, 71], t0 + 1.4, .8, .24); brass([50, 57, 62, 66, 74], t0 + 2.2, 1.4, .27)
for k, n in enumerate([74, 78, 81, 86, 81, 86, 90]): bell(n, t0 + .2 + k * .12, .05)
b = 60 / 130
for i in range(int((T['end'][0] - t0) / b)):
    at = t0 + i * b
    if i % 2 == 0: kick(at, .9)
    else: clap(at, .8)
    hat(at + b / 2, .14)
taiko(t0 + 1.4, .7); taiko(t0 + 2.2, .9)
taiko(t0 + 3.3, .8)

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

CUTS = [0, 4.0, 6.2, 13.0, 16.8, 20]
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
