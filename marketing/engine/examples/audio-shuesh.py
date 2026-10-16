"""Звук ролика «Да ты шуешь?»: пицц-вступление → глитч → бит под приложение → светлый луп + глитч №2 → джингл."""
import sys; OUT = sys.argv[1] if len(sys.argv) > 1 else "a.wav"
import numpy as np, wave
from scipy.signal import lfilter, butter, sosfilt, fftconvolve

SR = 44100; DUR = 22.6; N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(5)
T = {'s1': 0.0, 'g1': 3.9, 'phone': 6.6, 'win': 15.0, 'g2': 16.6, 'end': 19.6}

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

# ================= доп. инструменты: глитч =================
def glitch_burst(at, d=.12, g=.3):
    t = t_(d); fr = 200 + rng.random() * 1800
    x = np.sign(np.sin(2 * np.pi * fr * t)) * .6 + rng.standard_normal(len(t)) * .3
    x = np.round(x * 4) / 4  # «битность»
    add(x * np.exp(-t * 10), at, g, (rng.random() - .5) * 1.2)
def tape_stop(at, d=.6, g=.35, n=50):
    t = t_(d); fr = f(n) * (1 - t / d) ** 1.5
    x = np.tanh(np.sin(2 * np.pi * np.cumsum(fr) / SR) * 2) * (1 - t / d)
    add(lp(x, 2500), at, g)
def ding(at, g=.25):
    for n, k in ((88, 0), (95, .09)): bell(n, at + k, g, 1.2)

# ================= 1. вступление: пицц. «смешная тревога» (Ля минор, 120 BPM) =================
b = 60 / 120
for i in range(int(T['g1'] / b)):
    at = i * b
    pluck([45, 52, 48, 52][i % 4] + 12, at, d=.18, g=.16, pan=-.2, rev=.3, bright=1800)
    if i % 2 == 1: pluck([69, 72, 71, 76][(i // 2) % 4], at + b / 2, d=.16, g=.12, pan=.3, rev=.4, bright=3000)
    kick(at, .6) if i % 2 == 0 else hat(at, .18)
    hat(at + b / 2, .1)
    sub808(45 if i < 4 else 41, at, b * .9, .3)
riser(T['g1'] - .9, .9, .2)

# ================= 2. глитч «да ты шуешь?» =================
t0 = T['g1']
tape_stop(t0, .55, .45); crash(t0, .2)
for k in range(26):
    at = t0 + .1 + k * .095 + rng.random() * .03
    glitch_burst(at, .06 + rng.random() * .08, .28)
# заикающийся аккорд (стаб, режем на куски)
for k in range(8):
    at = t0 + .6 + k * .25
    if k % 3 != 2:
        for n in (57, 60, 64): pluck(n + (k % 2) * 1, at, d=.12, g=.09, pan=(-1) ** k * .5, rev=.6, bright=5000)
for at in (t0 + .6, t0 + 1.35, t0 + 2.1): taiko(at, .55)
riser(T['phone'] - .6, .6, .25)

# ================= 3. бит под приложение (120 BPM) =================
t0 = T['phone']
crash(t0, .3); kick(t0, 1.1)
bars = [(45, [57, 60, 64]), (41, [57, 60, 65]), (43, [55, 59, 62]), (40, [56, 59, 64])]
mel = [76, 74, 72, 74, 76, 79, 76, 72, 74, 72, 69, 72, 71, 72, 74, 71]
for i in range(int((T['win'] - t0) / b)):
    at = t0 + i * b; bar = (i // 4) % 4
    if i % 4 in (0, 2) or i % 8 == 7: kick(at, 1.3)
    if i % 4 in (1, 3): clap(at, 1.3)
    for h in range(4): hat(at + h * b / 4, .12 if h % 2 else .2, pan=.35 if h % 2 else -.2)
    if i % 2 == 0: sub808(bars[bar][0], at, b * 1.9, .6)
    pluck(mel[i % 16], at, d=.28, g=.17, pan=.25)
    if i % 4 == 0:
        for n in bars[bar][1]: pluck(n - 12, at, d=b * 3.6, g=.06, pan=-.3, rev=.8, bright=1500)
span = (T['win'] - t0) / 6
for i in range(6):
    if i != 4: tap(t0 + span * (i + .62))
    if i < 5: whoosh(t0 + span * (i + .82), .3, .22)

# ================= 4. PDF у заказчика: светлый луп + глитч №2 =================
t0 = T['win']
kick(t0, 1.0); crash(t0, .25)
ding(t0 + .45, .22)
for i in range(int((T['end'] - t0) / b)):
    at = t0 + i * b; c = (i // 4) % 2
    if at >= T['g2'] and at < T['g2'] + 1.0: continue  # провал на кручении головы
    if i % 2 == 0:
        for k, n in enumerate([[60, 64, 67, 71], [57, 60, 64, 67]][c]): rhodes(n, at + k * .012, d=b * 2.1, g=.08, pan=-.3 + k * .2)
        kick(at, .9); sub808([48, 45][c], at, b * 1.8, .45)
    else: clap(at, .9)
    for h in range(2): hat(at + h * b / 2, .12)
t0 = T['g2']
tape_stop(t0, .5, .3, 55)
# «вжух» по кругу — кручение головы
t = t_(1.0); x = bp(rng.standard_normal(len(t)), 600, 3000) * np.sin(np.pi * t) ** 2
add(x * (1 + np.sin(2 * np.pi * 3 * t)) * .5, t0, .3, 0)
for k in range(18): glitch_burst(t0 + .1 + k * .14 + rng.random() * .04, .05 + rng.random() * .07, .22)
for k, n in enumerate([72, 76, 79, 84]): pluck(n, t0 + 1.05 + k * .08, d=.4, g=.12, pan=(-1) ** k * .3, rev=.7, bright=5000)

# ================= 5. джингл =================
t0 = T['end']
for k, n in enumerate([60, 64, 67, 72, 76, 79]): pluck(n, t0 + .05 + k * .09, d=.6, g=.1, pan=(-1) ** k * .3, rev=.8, bright=5000)
bell(84, t0 + .6, .12, 2.5); bell(79, t0 + .75, .08, 2.5)
pad([48, 55, 60, 64], t0 + .1, 2.8, g=.16, cut=1800)

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
