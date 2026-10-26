"""Звук «Газгольдер»: тревожный перебор, вода и скрип → всплытие, хлопок трубы → светлая акустика по шагам
(экскаватор, манипулятор, гидравлика) → тёплый финал. Инструменты — из audio-terrasy.py. Всё синтезировано.
python3 audio-gazgolder.py out.wav"""
import sys, numpy as np, wave
OUT = sys.argv[1]
src = open(__file__.replace('audio-gazgolder.py', 'audio-terrasy.py'), encoding='utf-8').read()
sys.argv = [sys.argv[0], OUT]
__file__ = __file__.replace('audio-gazgolder.py', 'audio-terrasy.py')
exec(src.split('b = 60 / 80')[0].replace('DUR = 30.0', 'DUR = 30.5'))

A, B = 2.2, 8.1
ST = [8.3 + i * 2.5 for i in range(6)]
FIN = 8.3 + 6 * 2.5; PHONE = FIN + 2.4; END = PHONE + 2.0
b = 60 / 80; PICK = [0, 2, 3, 4, 3, 2, 1, 3]

def engine(at, d, g=.08, f0=30):
    tt = t_(d); fr = f0 + 12 * np.sin(np.pi * tt / d)
    add(lp(np.sign(np.sin(2 * np.pi * np.cumsum(fr) / SR)) + .25 * rng.standard_normal(len(tt)), 260) * np.sin(np.pi * tt / d) ** .7, at, g, .3)
def hydro(at, d, g=.025, f0=220, f1=300):
    tt = t_(d); fr = f0 + (f1 - f0) * tt / d
    add(bp(np.sin(2 * np.pi * np.cumsum(fr) / SR) + .5 * np.sin(4 * np.pi * np.cumsum(fr) / SR), 150, 1200) * np.sin(np.pi * tt / d), at, g, .4)
def creak(at, d=.4, g=.035, f0=150):
    tt = t_(d); fr = f0 + 60 * np.sin(np.pi * tt / d)
    add(lp(np.sign(np.sin(2 * np.pi * np.cumsum(fr) / SR)) * np.sin(np.pi * tt / d), 1300), at, g, -.2)
def hiss(at, d, g=.06):
    tt = t_(d); add(hp(rng.standard_normal(len(tt)), 3000) * np.exp(-tt * 2.5), at, g, -.3)
def gulp(at, g=.05):
    tt = t_(.15); fr = 260 + 900 * tt / .15
    add(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-tt * 18), at, g, rng.random() - .5)
def scrape(at, d, g=.05):
    x = lp(rng.standard_normal(int(d * SR)), 900) * np.sin(np.pi * t_(d) / d); add(x, at, g, .2)

# ---- плохо: Am — F — Dm — E, вода, скрип, хлопок
SAD = [(33, [45, 52, 57, 60, 64]), (29, [41, 48, 53, 57, 60]), (26, [38, 45, 50, 53, 57]), (28, [40, 47, 52, 56, 59])]
t = 0.0; bar = 0
while t < B - .3:
    root, ch = SAD[bar % 4]
    guitar(root + 12, t, d=b * 4, g=.11, pan=-.15)
    for k, idx in enumerate(PICK):
        at = t + k * b / 2
        if at < B - .2: guitar(ch[idx], at, d=1.5, g=.07, pan=-.35 + idx * .17)
    softpad([n + 12 for n in ch[:3]], t, b * 4 + .4, g=.05)
    t += 4 * b; bar += 1
for k, n in enumerate([76, 72, 69, 68]): piano(n, .4 + k * 1.5, d=2.2, g=.07)
x = lp(rng.standard_normal(int(5.5 * SR)), 380) * np.minimum(1, t_(5.5) / 1.5); add(x, 2.4, .08)
for k in range(22): gulp(2.6 + rng.random() * 4.6, .045)
for k in range(5): creak(5.0 + k * .38, .34, .035, 140 + k * 18)
thud(6.05, .4); hiss(6.05, 1.6, .07)
pad([33, 40, 45], 6.1, 1.9, g=.08, cut=500)
# ---- правильно: D — G — Bm — A, светло
HAPPY = [(38, [50, 54, 57, 62, 66]), (31, [43, 50, 55, 59, 62]), (35, [47, 54, 59, 62, 66]), (33, [45, 52, 57, 61, 64])]
MEL = [78, 76, 74, 76, 78, 81, 83, 81, 78, 76, 74, 73, 74, 76, 78, 74]
t = B; bar = 0
while t < END - .05:
    root, ch = HAPPY[bar % 4]
    guitar(root + 12, t, d=b * 4, g=.12, pan=-.15)
    for k, idx in enumerate(PICK):
        at = t + k * b / 2
        if at < END - .05: guitar(ch[idx], at, d=1.6, g=.075, pan=-.35 + idx * .17)
    softpad([n + 12 for n in ch[:3]], t, b * 4 + .4, g=.05)
    for k in range(4):
        at = t + k * b
        if at < END:
            if k in (0, 2): softkick(at, .26 if k == 0 else .18)
            brush(at + b / 2, .026)
    for k in range(2):
        if t + k * 2 * b < END: piano(MEL[(bar * 2 + k) % len(MEL)], t + k * 2 * b + .02, d=2.4, g=.08, pan=.15)
    t += 4 * b; bar += 1
for i, n in enumerate([74, 76, 78, 81, 83, 86]): glock(n, ST[i] + .02, .055)
for a in (ST[0] + .4, ST[0] + 1.2): bird(a, .03, .6)
engine(ST[1], 2.2, .07, 26); scrape(ST[1] + .2, 1.6, .05)
scrape(ST[2] + .1, .7, .04); thud(ST[2] + 1.55, .3)
engine(ST[3] - .4, 2.8, .07); hydro(ST[3] + .2, 1.7, .03, 240, 200); thud(ST[3] + 1.9, .3)
for a in (ST[4] + .1, ST[4] + .4): hydro(a, .3, .02, 500, 620)
thud(ST[4] + 1.5, .12)
scrape(ST[5] + .1, 1.3, .045)
for k, n in enumerate([81, 85, 88]): glock(n, FIN + .7 + k * .1, .05)
x = lp(rng.standard_normal(int(1.6 * SR)), 2500) * np.sin(np.pi * t_(1.6) / 1.6) ** 2; add(x, FIN + .3, .03)
tap(PHONE + .5, .18)
for k, n in enumerate([62, 66, 69, 74, 78]): guitar(n, END + k * .07, d=2.8, g=.09, pan=-.3 + k * .15)
piano(86, END + .4, d=2.6, g=.08); softpad([50, 57, 62, 66], END, DUR - END, g=.07)

irt = t_(2.8); ir = rng.standard_normal(len(irt)) * np.exp(-irt * 2.2)
irL = lp(ir, 5500); irR = lp(np.roll(ir, 731), 5500); irL[:int(.015 * SR)] = 0; irR[:int(.021 * SR)] = 0
L += fftconvolve(hp(RL, 180), irL)[:N] * .2; R += fftconvolve(hp(RR, 180), irR)[:N] * .2
for ch in (L, R): ch[:] = lp(hp(ch, 35), 12000)
m = max(np.abs(L).max(), np.abs(R).max()); L /= m; R /= m
L = np.tanh(L * 1.4) / np.tanh(1.4); R = np.tanh(R * 1.4) / np.tanh(1.4)
fi = np.clip(np.arange(N) / SR / .4, 0, 1); fo = np.clip((DUR - np.arange(N) / SR) / 1.5, 0, 1)
L *= fi * fo * .85; R *= fi * fo * .85
pcm = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(OUT, 'wb') as w_: w_.setnchannels(2); w_.setsampwidth(2); w_.setframerate(SR); w_.writeframes(pcm.tobytes())
seg = np.stack([L, R], 1)
print('ok', OUT, [round(float(np.sqrt((seg[int(a * SR):int(min(DUR, a + 2) * SR)] ** 2).mean())), 2) for a in range(0, int(DUR), 2)])
