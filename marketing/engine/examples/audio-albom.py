"""Звук «Всеобщий калькулятор»: загадочная тема с щелчками фотоаппарата и «дун-дун» на красном кружке → напряжённый дрон → бит под приложение → тропический чилл → джингл."""
import numpy as np, wave
from scipy.signal import lfilter, butter, sosfilt, fftconvolve

SR = 44100; DUR = 23.8; N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(5)
T = {'photos': 2.3, 'twist': 8.6, 'phone': 10.2, 'vac': 17.0, 'end': 20.8}

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


def boing(at, f0=220, f1=660, d=.3, g=.22):
    t = t_(d); fr = f0 * (f1 / f0) ** (t / d); x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 5)
    add(x, at, g, .1)

def party(t0, t1, g=1.0):
    """Мажорный бит 120 BPM с «боингом» на каждом прыжке."""
    b = 60 / 120; prog = [(43, [67, 71, 74]), (40, [64, 67, 71]), (36, [64, 67, 72]), (38, [66, 69, 74])]
    mel = [79, 83, 86, 83, 81, 79, 76, 79, 78, 81, 83, 86, 88, 86, 83, 81]
    for i in range(int((t1 - t0) / b + .5)):
        at = t0 + i * b; bar = (i // 4) % 4
        kick(at, 1.1 * g)
        if i % 2: clap(at, 1.1 * g)
        for h in range(2): hat(at + b / 2 + h * b / 4, .15, pan=.3)
        sub808(prog[bar][0], at, b * .9, .5 * g)
        pluck(mel[i % 16], at + b / 2, d=.25, g=.13 * g, pan=-.25)
        if i % 4 == 0:
            for n in prog[bar][1]: pluck(n - 12, at, d=b * 3.6, g=.06 * g, pan=.3, rev=.8, bright=1800)
        boing(at + .02, 200, 620, .28, .18 * g)



def shutter(at, g=.35):
    for k, d in ((0, .03), (.07, .05)):
        t = t_(d); add(bp(rng.standard_normal(len(t)), 1500, 6000) * np.exp(-t * 80), at + k, g, .1)
def theremin(notes, at, step, g=.09):
    for k, n in enumerate(notes):
        d = step * 1.05; t = t_(d); fr = f(n) * (1 + .012 * np.sin(2 * np.pi * 5.5 * t))
        x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * adsr(len(t), .08, .1, .9, .15)
        add(x, at + k * step, g, .2); add(x, at + k * step, g * .9, .2, REV)
def dundun(at, g=.6):
    for k, n in enumerate([38, 37]):
        t = t_(.7); x = np.tanh(np.sin(2 * np.pi * f(n) * t) * 2) * np.exp(-t * 3) + np.sin(2 * np.pi * f(n + 12) * t) * np.exp(-t * 4) * .4
        add(x, at + k * .32, g); add(x, at + k * .32, g * .4, 0, REV)
        add(lp(np.sin(2 * np.pi * np.cumsum(45 + 90 * np.exp(-t_(.4) * 25)) / SR) * np.exp(-t_(.4) * 8), 300), at + k * .32, g)
def mystery(t0, t1, g=1.0):
    b = 60 / 100; arp = [62, 65, 69, 65, 62, 65, 70, 65, 61, 64, 69, 64, 61, 64, 67, 64]
    for i in range(int((t1 - t0) / (b / 2) + .5)):
        at = t0 + i * b / 2
        pluck(arp[i % 16], at, d=.35, g=.1 * g, pan=(-1) ** i * .3, rev=.9, bright=2200)
        if i % 4 == 0: kick(at, .55 * g)
        if i % 4 == 2: hat(at, .1 * g, d=.12)
    for k, c in enumerate([[50, 57, 62], [46, 53, 58], [49, 56, 61]]):
        if t0 + k * b * 4 < t1: pad(c, t0 + k * b * 4, min(b * 4.2, t1 - t0 - k * b * 4 + .3), g=.1 * g, cut=900)

PHT = [2.3, 4.4, 6.5]
# 1. загадочная тема
mystery(0, T['twist'])
theremin([74, 77, 81, 80], 0.2, .5, .07)
dundun(.9 + .1, .55)
for at in PHT: shutter(at, .4); whoosh(at - .1, .3, .2); dundun(at + .9, .5)
theremin([77, 76, 74, 73], 5.0, .4, .06)

# 2. разворот: дрон
t0 = T['twist']; d = T['phone'] - t0
t = t_(d + .2); x = sum(np.sin(2 * np.pi * f(n) * (1 + .004 * k) * t) for k, n in enumerate([38, 45, 50, 51])) * (t / d) * .25
add(lp(x, 900), t0, .6); add(x, t0, .2, 0, REV)
for k in range(6): add(np.sin(2 * np.pi * 60 * t_(.2)) * np.exp(-t_(.2) * 20), t0 + k * .27, .5)  # «сердце»
riser(T['phone'] - .9, .9, .25)

# 3. бит под приложение
b = 60 / 120; t0 = T['phone']
crash(t0, .25); kick(t0, 1.1)
bars = [(43, [62, 67, 71]), (40, [64, 67, 71]), (36, [60, 64, 67]), (38, [62, 66, 69])]
mel = [71, 74, 79, 74, 76, 74, 71, 67, 69, 71, 74, 71, 72, 71, 69, 67]
for i in range(int((T['vac'] - t0) / b)):
    at = t0 + i * b; bar = (i // 4) % 4
    if i % 4 in (0, 2) or i % 8 == 7: kick(at, 1.15)
    if i % 4 in (1, 3): clap(at, 1.1)
    for h in range(4): hat(at + h * b / 4, .11 if h % 2 else .17, pan=.35 if h % 2 else -.2)
    if i % 2 == 0: sub808(bars[bar][0], at, b * 1.9, .5)
    pluck(mel[i % 16], at, d=.28, g=.14, pan=.25)
    if i % 4 == 0:
        for n in bars[bar][1]: pluck(n - 12, at, d=b * 3.6, g=.06, pan=-.3, rev=.8, bright=1500)
span = (T['vac'] - t0) / 4
for i in range(4):
    if i != 1: tap(t0 + span * (i + .62))
    if i < 3: whoosh(t0 + span * (i + .8), .3, .2)

# 4. отпуск: тропический чилл (маримба + шейкер)
t0 = T['vac']; b = 60 / 100
shutter(t0, .4)
def marimba(n, at, g=.13):
    t = t_(.5); x = (np.sin(2 * np.pi * f(n) * t) + .25 * np.sin(2 * np.pi * f(n) * 4 * t) * np.exp(-t * 30)) * np.exp(-t * 9)
    add(x, at, g, .2); add(x, at, g * .5, 0, REV)
mm = [67, 71, 74, 71, 76, 74, 71, 67, 69, 72, 76, 72, 74, 72, 69, 66]
chords = [[55, 59, 62], [52, 55, 59], [48, 52, 55], [50, 54, 57]]
for i in range(int((T['end'] - t0) / (b / 2))):
    at = t0 + i * b / 2
    marimba(mm[i % 16], at)
    hat(at + b / 4, .08, d=.05, pan=-.3)
    if i % 2 == 0: kick(at, .7 if i % 4 == 0 else .4)
    if i % 8 == 0:
        c = chords[(i // 8) % 4]
        for n in c: rhodes(n, at, d=b * 4, g=.08)
        add(np.sin(2 * np.pi * f(c[0] - 12) * t_(b * 3.5)) * adsr(int(b * 3.5 * SR), .02, .3, .6, .3), at, .25)
for k, n in enumerate([79, 83, 86, 91]): bell(n, 18.7 + k * .08, .05)

# 5. джингл
t0 = T['end']
for k, n in enumerate([67, 71, 74, 79, 83, 86]): pluck(n, t0 + .05 + k * .09, d=.6, g=.1, pan=(-1) ** k * .3, rev=.8, bright=5000)
bell(91, t0 + .6, .12, 2.5); bell(86, t0 + .75, .08, 2.5)
pad([55, 62, 67, 71], t0 + .1, 2.8, g=.16, cut=1800)

# ---------------- ревербератор (свёртка с затухающим шумом) ----------------
irt = t_(2.4); ir = rng.standard_normal(len(irt)) * np.exp(-irt * 2.6)
irL = lp(ir, 6000); irR = lp(np.roll(ir, 731), 6000)
irL[:int(.012 * SR)] = 0; irR[:int(.017 * SR)] = 0
wetL = fftconvolve(hp(RL, 200), irL)[:N] * .18; wetR = fftconvolve(hp(RR, 200), irR)[:N] * .18
L += wetL; R += wetR

# ---------------- мастер ----------------
for ch in (L, R):
    ch[:] = hp(ch, 30)
# выравнивание громкости частей (плавно) и нормировка по 99,9-му перцентилю
SEC = [0, T['twist'], T['phone'], T['vac'], T['end'], DUR]
gain = np.ones(N); tt = np.arange(N) / SR
for a, b_ in zip(SEC[:-1], SEC[1:]):
    i, j = int(a * SR), int(b_ * SR); r = np.sqrt(((L[i:j] + R[i:j]) ** 2).mean() / 4) + 1e-9
    gain[i:j] = 1 / r
gain = np.convolve(gain, np.ones(int(.15 * SR)) / int(.15 * SR), 'same')
L *= gain; R *= gain
m = np.percentile(np.abs(np.concatenate([L, R])), 99.9)
L /= m; R /= m
L = np.tanh(L * 1.6) / np.tanh(1.6); R = np.tanh(R * 1.6) / np.tanh(1.6)
fade = np.clip((DUR - np.arange(N) / SR) / 1.0, 0, 1); L *= fade * .9; R *= fade * .9
pcm = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open('albom.wav', 'wb') as w_:
    w_.setnchannels(2); w_.setsampwidth(2); w_.setframerate(SR); w_.writeframes(pcm.tobytes())
print('ok')
