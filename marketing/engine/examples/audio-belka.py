"""Звук «Белка в ураган»: неловкая пауза → ураган со свистом улёта → бит под приложение → спокойный лоу-фай, улёт шляпы → джингл."""
import numpy as np, wave
from scipy.signal import lfilter, butter, sosfilt, fftconvolve

SR = 44100; DUR = 21.4; N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(5)
T = {'storm': 2.6, 'phone': 6.2, 'win': 14.6, 'hat': 16.0, 'end': 18.4}

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


def boing(at, f0=300, f1=900, d=.35, g=.25):
    t = t_(d); fr = f0 * (f1 / f0) ** (t / d); x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * (1 + .4 * np.sin(2 * np.pi * 18 * t)) * np.exp(-t * 4)
    add(x, at, g)

# ================= 1. неловкая пауза: тихий лоу-фай + «тик-так» =================
b = 60 / 90
for i in range(int(T['storm'] / b) + 1):
    at = i * b
    rhodes([60, 63, 67][i % 3], at, d=b * 1.5, g=.12, pan=-.2)
    hat(at, .08, .04); hat(at + b / 2, .05, .04, -.3)
sub = np.sin(2 * np.pi * f(36) * t_(T['storm'])) * adsr(int(T['storm'] * SR), .3, .2, .8, .3); add(sub, 0, .3)
for k in range(6): add(np.sin(2 * np.pi * 2400 * t_(.03)) * np.exp(-t_(.03) * 120), .2 + k * .4, .25, (-1) ** k * .3)  # часики
vib(71, 1.3, .15); vib(70, 1.55, .15)  # «а-а» неловко

# ================= 2. ураган: ветер, рёв, свист улёта =================
t0 = T['storm']
d = T['phone'] - t0 + .2; t = t_(d); w = rng.standard_normal(len(t)); wl = np.zeros_like(w)
for k in range(0, len(w), 2048):
    fc = 350 + 900 * (k / len(w)) + 300 * np.sin(k / SR * 5); wl[k:k + 2048] = bp(w[k:k + 2048], fc * .5, fc * 1.8)
env = np.clip(t / .8, 0, 1) * np.clip((d - t) / .3, 0, 1)
add(wl * env, t0, .9, -.4); add(np.roll(wl, 4000) * env, t0, .9, .4)
pad([36, 48, 51, 54], t0, d, g=.25, cut=700)   # тревожный уменьшённый
for at in (t0, t0 + .7, t0 + 1.4, t0 + 1.75): taiko(at, .9)
# свист улёта — нисходящий
t = t_(1.8); fr = 1400 * np.exp(-t * 1.1) + 200; x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.clip(t / .1, 0, 1) * np.exp(-t * .8)
add(x, 3.3, .22, .5); boing(3.3, 200, 700, .4, .25)
whoosh(3.6, .5, .4); whoosh(4.4, .5, .35)

# ================= 3. бит под приложение (120 BPM) =================
b = 60 / 120; t0 = T['phone']
crash(t0, .3); kick(t0, 1.1)
bars = [(41, [65, 69, 72]), (38, [62, 65, 69]), (34, [62, 65, 70]), (36, [64, 67, 72])]
mel = [77, 76, 72, 74, 76, 72, 69, 72, 74, 72, 70, 69, 67, 69, 72, 74]
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
    if i != 3: tap(t0 + span * (i + .62))
    if i < 4: whoosh(t0 + span * (i + .8), .3, .22)

# ================= 4. спокойствие + лёгкий ветерок + улёт шляпы =================
t0 = T['win']; b = 60 / 90
for i in range(int((T['end'] - t0) / b) + 1):
    at = t0 + i * b; c = [[53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62], [50, 53, 57, 60]][(i // 2) % 4]
    if i % 2 == 0:
        for k, n in enumerate(c): rhodes(n, at + k * .015, d=b * 2.1, g=.1, pan=-.3 + k * .15)
        add(np.sin(2 * np.pi * f(c[0] - 12) * t_(b * 1.8)) * adsr(int(b * 1.8 * SR), .02, .2, .7, .2), at, .28)
        kick(at, .7)
    else: clap(at, .6)
    hat(at + b / 2, .07, .04)
t = t_(2.2); w = bp(rng.standard_normal(len(t)), 400, 2500) * np.sin(np.pi * t / 2.2) ** 2; add(w, T['hat'] - .6, .45, .3)
boing(T['hat'], 400, 1200, .35, .2); whoosh(T['hat'] + .1, .6, .3)
for k, n in enumerate([72, 76, 79, 84]): vib(n, T['hat'] + .5 + k * .12, .1)

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
fade = np.clip((DUR - np.arange(N) / SR) / 1.0, 0, 1); L *= fade * .9; R *= fade * .9
pcm = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open('belka.wav', 'wb') as w_:
    w_.setnchannels(2); w_.setsampwidth(2); w_.setframerate(SR); w_.writeframes(pcm.tobytes())
print('ok')
