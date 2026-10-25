"""Звук «Навес и парковка»: зимний ветер и тревожный перебор → скрип и обрушение → светлая акустика с колокольчиком
на каждом этапе, виброплита, укладка плитки, машина заезжает. Инструменты — из audio-terrasy.py. Всё синтезировано.
python3 audio-naves.py out.wav"""
import sys, numpy as np, wave
OUT = sys.argv[1]
src = open(__file__.replace('audio-naves.py', 'audio-terrasy.py'), encoding='utf-8').read()
sys.argv = [sys.argv[0], OUT]
__file__ = __file__.replace('audio-naves.py', 'audio-terrasy.py')
exec(src.split('b = 60 / 80')[0])

A, B, SD = 2.2, 8.3, 2.2
ST = [8.4 + i * SD for i in range(7)]
TEST = 8.4 + 7 * SD; PHONE = TEST + 2.2; END = PHONE + 2.0
b = 60 / 80
PICK = [0, 2, 3, 4, 3, 2, 1, 3]

def wind(at, d, g):
    x = rng.standard_normal(int(d * SR)); tt = t_(d)
    y = np.zeros_like(x)
    for k in range(0, len(x), 2048):
        fc = 650 + 280 * np.sin(2 * np.pi * .35 * (k / SR)) + 120 * np.sin(2 * np.pi * .9 * (k / SR))
        y[k:k + 2048] = bp(x[k:k + 2048], fc * .7, fc * 1.4)
    e = np.minimum(1, np.minimum(tt / 1.0, (d - tt) / .8))
    add(y * e, at, g, -.3); add(y * e * .8, at + .03, g, .3)
def creak(at, d=.4, g=.04, f0=170):
    tt = t_(d); fr = f0 + 70 * np.sin(np.pi * tt / d)
    add(lp(np.sign(np.sin(2 * np.pi * np.cumsum(fr) / SR)) * np.sin(np.pi * tt / d), 1500), at, g, .2)
def clank(at, g=.05, f0=900):
    tt = t_(.5); x = sum(np.sin(2 * np.pi * f0 * r * tt) * np.exp(-tt * k) for r, k in ((1, 9), (2.4, 14), (3.9, 20)))
    add(x, at, g, -.2); add(x, at, g * .5, .2, REV)
def click(at, g=.06):
    tt = t_(.05); add(bp(rng.standard_normal(len(tt)), 1200, 4000) * np.exp(-tt * 90), at, g, .1)
def vibro(at, d, g=.03):
    tt = t_(d); x = lp(np.sign(np.sin(2 * np.pi * 42 * tt)) + .3 * rng.standard_normal(len(tt)), 700) * np.sin(np.pi * tt / d) ** .5
    add(x, at, g, .2)
def engine(at, d, g=.08):
    tt = t_(d); fr = 30 + 14 * np.sin(np.pi * tt / d)
    add(lp(np.sign(np.sin(2 * np.pi * np.cumsum(fr) / SR)) + .2 * rng.standard_normal(len(tt)), 260) * np.sin(np.pi * tt / d) ** .7, at, g, -.3)

# ---- «на скорую»: перебор в ля миноре, со 3.6 — зимний ветер
SAD = [(33, [45, 52, 57, 60, 64]), (29, [41, 48, 53, 57, 60]), (36, [48, 55, 60, 64, 67]), (31, [43, 50, 55, 59, 62])]
t = 0.0; bar = 0
while t < 6.2:
    root, ch = SAD[bar % 4]
    guitar(root + 12, t, d=b * 4, g=.11, pan=-.15)
    for k, idx in enumerate(PICK):
        at = t + k * b / 2
        if at < 6.25: guitar(ch[idx], at, d=1.5, g=.07, pan=-.35 + idx * .17)
    softpad([n + 12 for n in ch[:3]], t, b * 4 + .4, g=.045)
    t += 4 * b; bar += 1
for k, n in enumerate([76, 74, 72, 71]): piano(n, .3 + k * 1.5, d=2.2, g=.07)
wind(3.4, B - 3.4 + .2, .07)
for k in range(4): creak(5.0 + k * .3, .32, .035, 160 + k * 20)
thud(6.3, .6); thud(6.4, .35)
x = lp(rng.standard_normal(int(1.2 * SR)), 1600) * np.exp(-t_(1.2) * 4); add(x, 6.3, .14)
for k in range(6): clank(6.35 + k * .07, .025, 1400 + k * 230)
pad([33, 40, 45], 6.4, 1.8, g=.08, cut=500)
# ---- правильно: светлая акустика (C–G–Am–F)
HAPPY = [(36, [48, 52, 55, 60, 64]), (31, [43, 50, 55, 59, 62]), (33, [45, 52, 57, 60, 64]), (29, [41, 48, 53, 57, 60])]
MEL = [76, 74, 72, 74, 76, 79, 76, 74, 72, 71, 69, 71, 72, 74, 76, 72]
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
for i, n in enumerate([72, 74, 76, 79, 81, 84, 86]): glock(n, ST[i] + .02, .055)
x = lp(rng.standard_normal(int(.9 * SR)), 1000) * np.sin(np.pi * t_(.9) / .9); add(x, ST[0] + .1, .05)
for a in (ST[1] + .5, ST[1] + 1.2): clank(a, .03, 700)
thud(ST[2] + .7, .2); thud(ST[2] + .95, .2)
vibro(ST[3] + .9, SD - .95)
for i in range(10): click(ST[4] + .6 + i * .1 + .3, .05)
for i in range(10): clank(ST[5] + .1 + i * .15, .015, 1100 + (i % 3) * 200)
thud(ST[6] + .55, .15)
wind(TEST - .1, PHONE - TEST + .2, .035)
engine(TEST, 1.4, .07)
for k, n in enumerate([79, 84, 88]): glock(n, TEST + .9 + k * .1, .05)
tap(PHONE + .5, .18)
for k, n in enumerate([60, 64, 67, 72, 76]): guitar(n, END + k * .07, d=2.5, g=.09, pan=-.3 + k * .15)
piano(84, END + .4, d=2.5, g=.08); softpad([48, 55, 60, 64], END, DUR - END, g=.07)

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
