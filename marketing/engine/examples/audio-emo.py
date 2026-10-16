"""Звук ролика «Эмо вернулось»: 2007 — дождь и грустная гитара, SMS, бумажки → перемотка → 2026 — поп-панк → джингл."""
import sys; OUT = sys.argv[1] if len(sys.argv) > 1 else "a.wav"
import numpy as np, wave
from scipy.signal import lfilter, butter, sosfilt, fftconvolve

SR = 44100; DUR = 22.8; N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(5)
T = {'s07': 0.0, 'slump': 5.4, 's26': 7.0, 'phone': 8.6, 'win': 16.0, 'end': 19.8}

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

# ================= доп. инструменты =================
def guitar(n, at, d=.9, g=.12, pan=0.0, bright=2200):
    # «чистая гитара»: щипок с затуханием и лёгким хорусом
    t = t_(d); x = (saw(f(n), d, .002) + saw(f(n), d, -.003)) * .5
    y = lp(x, bright) * np.exp(-t * 3.2) * adsr(len(t), .003, .05, 1, .1)
    add(y, at, g, pan); add(y, at, g * .7, pan, REV)
def power(root, at, d, g=.13):
    # дисторшн-пауэр-аккорд: прима + квинта + октава
    t = t_(d); x = sum(saw(f(n), d, det) for n in (root, root + 7, root + 12) for det in (-.004, .004))
    y = lp(np.tanh(x * 3), 3200) * adsr(len(t), .005, .05, .85, .06)
    add(y, at, g, -.45); add(np.roll(y, 300), at, g, .45)
def snare(at, g=1.0):
    t = t_(.22); x = bp(rng.standard_normal(len(t)), 1200, 6000) * np.exp(-t * 18) + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * .6
    add(x, at, g * .55); add(x, at, g * .3, 0, REV)
def ring(at, g=.14):
    # своя «полифония» раскладушки: квадрат, короткие ноты
    for k, n in enumerate([81, 84, 88, 84, 81, 88]):
        t = t_(.11); x = np.sign(np.sin(2 * np.pi * f(n) * t)) * adsr(len(t), .002, .02, .8, .02)
        add(lp(x, 4000), at + k * .12, g, .3)
def thud(at, g=.6):
    t = t_(.5); x = np.sin(2 * np.pi * np.cumsum(60 + 60 * np.exp(-t * 20)) / SR) * np.exp(-t * 9) + lp(rng.standard_normal(len(t)), 600) * np.exp(-t * 25) * .5
    add(x, at, g)
def rustle(at, d=.8, g=.18):
    t = t_(d); x = bp(rng.standard_normal(len(t)), 2000, 8000) * (rng.random(len(t)) > .6) * np.exp(-t * 3)
    add(x, at, g, (rng.random() - .5))
def rewind(at, d=.7, g=.3):
    t = t_(d); fr = 300 + 2600 * (t / d) ** 2
    x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * .3 + bp(rng.standard_normal(len(t)), 1500, 6000) * .5
    add(x * (t / d), at, g)

# ================= 1. 2007: дождь и грустная гитара (Ми минор, 72 BPM) =================
rain = hp(rng.standard_normal(int(7.2 * SR)), 1500) * .5 + lp(rng.standard_normal(int(7.2 * SR)), 900) * .4
rain *= np.clip(np.arange(len(rain)) / SR / .4, 0, 1) * np.clip((7.2 - np.arange(len(rain)) / SR) / .3, 0, 1)
add(rain, 0, .12, -.3); add(np.roll(rain, 5000), 0, .12, .3)
b = 60 / 72; arp = [[40, 47, 52, 55, 59, 55], [36, 43, 48, 52, 55, 52], [43, 50, 55, 59, 62, 59], [38, 45, 50, 54, 57, 54]]  # Em C G D
for i in range(int(T['slump'] / (b / 2))):
    at = i * b / 2; c = (i // 6) % 4
    guitar(arp[c][i % 6], at, d=1.2, g=.16, pan=(-.3 if i % 2 else .3))
pad([52, 55, 59], 0.2, 5.2, g=.07, cut=700)
ring(4.5)
thud(T['slump'], .8); rustle(T['slump'] + .05, 1.0, .25); rustle(T['slump'] + .3, .8, .2)
guitar(40, T['slump'] + .4, d=1.6, g=.18); guitar(46, T['slump'] + .42, d=1.6, g=.12)  # унылый «бзынь»
rewind(T['s26'] - .7, .7, .35)

# ================= 2. 2026: поп-панк (150 BPM, Ми мажор) =================
b = 60 / 150; t0 = T['s26']
crash(t0, .35); kick(t0, 1.2)
prog = [40, 47, 49, 45]  # E B C#m A
mel = [76, 78, 80, 80, 78, 76, 73, 76, 75, 76, 78, 80, 83, 80, 78, 76]
nb = int((T['end'] - t0) / b)
for i in range(nb):
    at = t0 + i * b; bar = (i // 8) % 4
    if T['phone'] - .05 < at < T['phone'] + .05: crash(at, .25)
    if T['win'] - .05 < at < T['win'] + .05: crash(at, .35)
    power(prog[bar], at, b * .92, .12 if at >= T['win'] else .11)
    if i % 2 == 0: kick(at, 1.1)
    else: snare(at, 1.0)
    hat(at, .14, pan=-.2); hat(at + b / 2, .1, pan=.3)
    if at >= T['win']: pluck(mel[i % 16], at, d=.25, g=.11, pan=.25, rev=.5, bright=4000)
    else: pluck(mel[i % 16] - 12, at, d=.22, g=.08, pan=.25, rev=.4, bright=3000)
span = (T['win'] - T['phone']) / 5
for i in range(5):
    if i != 2: tap(T['phone'] + span * (i + .6))
    if i < 4: whoosh(T['phone'] + span * (i + .82), .3, .22)
for k, n in enumerate([88, 92, 95]): bell(n, T['win'] + .1 + k * .1, .06)

# ================= 3. джингл =================
t0 = T['end']
power(40, t0, .9, .12)
for k, n in enumerate([64, 68, 71, 76, 80, 83]): pluck(n, t0 + .05 + k * .09, d=.6, g=.1, pan=(-1) ** k * .3, rev=.8, bright=5000)
bell(88, t0 + .6, .12, 2.5); bell(83, t0 + .75, .08, 2.5)
pad([52, 59, 64, 68], t0 + .1, 2.8, g=.16, cut=1800)

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
# выравнивание громкости частей (цель RMS ≈ 0.19), плавные переходы, мягкий лимитер
edges = sorted(set(list(T.values()) + [DUR]))
gain = np.ones(N)
for a_, b_ in zip(edges, edges[1:]):
    i, j = int(a_ * SR), int(b_ * SR); m_ = (L[i:j] + R[i:j]) / 2
    rms = np.sqrt((m_ ** 2).mean()) + 1e-6; gain[i:j] = min(4.0, .19 / rms)
k_ = np.hanning(int(.15 * SR)); k_ /= k_.sum(); gain = np.convolve(gain, k_, 'same')
L *= gain; R *= gain
L = np.tanh(L * 1.3) / 1.3 * 1.25; R = np.tanh(R * 1.3) / 1.3 * 1.25
L = np.clip(L, -.98, .98); R = np.clip(R, -.98, .98)
fade = np.clip((DUR - np.arange(N) / SR) / 1.0, 0, 1); L *= fade; R *= fade
pcm = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(OUT, 'wb') as w_:
    w_.setnchannels(2); w_.setsampwidth(2); w_.setframerate(SR); w_.writeframes(pcm.tobytes())
print('ok')
