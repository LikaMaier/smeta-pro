"""Звук «полезных хэллоуинских» роликов: жуткая шкатулка и терменвокс в «плохой» части, «у-у-у» призрака,
потом тёплая акустика по шагам с колокольчиками и шумами работ, весёлый финал. Всё синтезировано.
python3 audio-night.py podval|krysha out.wav"""
import sys, numpy as np, wave
MODE, OUT = sys.argv[1], sys.argv[2]
src = open(__file__.replace('audio-night.py', 'audio-terrasy.py'), encoding='utf-8').read()
sys.argv = [sys.argv[0], OUT]
__file__ = __file__.replace('audio-night.py', 'audio-terrasy.py')
exec(src.split('b = 60 / 80')[0].replace('DUR = 30.0', 'DUR = 28.8'))
A, B = 2.4, 8.2
ST = [8.4 + i * 2.6 for i in range(5)]
FIN = 8.4 + 5 * 2.6; PHONE = FIN + 2.4; END = PHONE + 2.0
def mbox(n, at, g=.06, pan=.2):
    tt = t_(1.4); fr = f(n)
    x = (np.sin(2 * np.pi * fr * tt) + .4 * np.sin(2 * np.pi * fr * 3.01 * tt) * np.exp(-tt * 9) + .2 * np.sin(2 * np.pi * fr * 5.4 * tt) * np.exp(-tt * 14)) * np.exp(-tt * 3.2)
    add(x, at, g, pan); add(x, at, g * .9, -pan, REV)
def whoo(at, d=1.6, g=.06, f0=300):
    tt = t_(d); fr = f0 + 260 * np.sin(np.pi * tt / d) * (1 + .03 * np.sin(2 * np.pi * 6 * tt))
    x = (np.sin(2 * np.pi * np.cumsum(fr) / SR) + .3 * np.sin(4 * np.pi * np.cumsum(fr) / SR)) * np.sin(np.pi * tt / d) ** 1.5
    add(lp(x, 1800), at, g, 0); add(lp(x, 1800), at, g * 1.2, 0, REV)
def thunder(at, d=2.5, g=.2):
    tt = t_(d); x = lp(rng.standard_normal(len(tt)), 300) * (np.exp(-tt * 1.6) + .5 * np.exp(-((tt - .3) * 6) ** 2)); add(x, at, g, -.3); add(x, at, g * .7, .3, REV)
def drip(at, g=.05):
    tt = t_(.12); fr = 900 + 1600 * tt / .12; add(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-tt * 30), at, g, rng.random() - .5)
def scrape(at, d, g=.05):
    add(lp(rng.standard_normal(int(d * SR)), 900) * np.sin(np.pi * t_(d) / d), at, g, .2)
def crackle(at, g=.04):
    tt = t_(.04); add(hp(rng.standard_normal(len(tt)), 4000) * np.exp(-tt * 120), at, g, rng.random() - .5)
def glass(at, g=.12):
    for k in range(7): tt = t_(.5); add(sum(np.sin(2 * np.pi * f0 * tt) * np.exp(-tt * (12 + k)) for f0 in (2800 + k * 310, 4100 + k * 170)), at + k * .03, g / 4, rng.random() - .5)

# ---- плохо: жуткий вальс 3/4 (Dm), шкатулка + пицц. бас
thunder(.1, 2.4, .16)
b = 60 / 100; t = 0; bar = 0
PROG = [(38, [50, 53, 57]), (34, [46, 50, 53]), (31, [43, 46, 50]), (33, [45, 49, 52])]
MEL = [69, 70, 69, 65, 62, 65, 69, 74, 72, 70, 69, 67, 69, 65, 64, 61]
while t < B - .2:
    root, ch = PROG[bar % 4]
    add(np.sin(2 * np.pi * f(root) * t_(.3)) * np.exp(-t_(.3) * 12), t, .25, -.2)
    for k in (1, 2):
        for n_ in ch: mbox(n_ + 12, t + k * b, .025, .35)
    for k in range(3): mbox(MEL[(bar * 3 + k) % len(MEL)] + 12, t + k * b + .01, .075, -.1)
    if bar % 2 == 0: softpad([root + 12, ch[1], ch[2]], t, b * 6, g=.06)
    t += 3 * b; bar += 1
whoo(2.6 if MODE == 'podval' else 2.6, 1.8, .06, 300 if MODE == 'podval' else 360)
if MODE == 'podval':
    for k in range(18): drip(2.6 + rng.random() * 5.4, .05)
    whoo(5.0, 1.6, .05)
else:
    for k in range(16): crackle(4.0 + rng.random() * 2.8, .035)
    glass(6.75, .3); thud(6.8, .3)
pad([38, 45, 50], 7.2, 1.3, g=.07, cut=500)
# ---- правильно: светлая акустика (D — A — Bm — G) + колокольчики
HAPPY = [(38, [50, 54, 57, 62, 66]), (33, [45, 52, 57, 61, 64]), (35, [47, 54, 59, 62, 66]), (31, [43, 50, 55, 59, 62])]
PICK = [0, 2, 3, 4, 3, 2, 1, 3]; MEL2 = [78, 76, 74, 76, 78, 81, 83, 81, 78, 76, 74, 73, 74, 76, 78, 74]
b = 60 / 80; t = B; bar = 0
while t < END - .05:
    root, ch = HAPPY[bar % 4]
    guitar(root + 12, t, d=b * 4, g=.12, pan=-.15)
    for k, idx in enumerate(PICK):
        at = t + k * b / 2
        if at < END - .05: guitar(ch[idx], at, d=1.6, g=.075, pan=-.35 + idx * .17)
    softpad([n_ + 12 for n_ in ch[:3]], t, b * 4 + .4, g=.05)
    for k in range(4):
        at = t + k * b
        if at < END:
            if k in (0, 2): softkick(at, .26 if k == 0 else .18)
            brush(at + b / 2, .026)
    for k in range(2):
        if t + k * 2 * b < END: piano(MEL2[(bar * 2 + k) % len(MEL2)], t + k * 2 * b + .02, d=2.4, g=.08, pan=.15)
    t += 4 * b; bar += 1
for i, n_ in enumerate([74, 76, 78, 81, 83]): glock(n_, ST[i] + .02, .055)
if MODE == 'podval':
    scrape(ST[0] + .1, 1.4, .05); x = lp(rng.standard_normal(int(1.2 * SR)), 1500) * np.sin(np.pi * t_(1.2) / 1.2); add(x, ST[1] + .1, .035)
    thud(ST[2] + .6, .2); scrape(ST[3] + .1, .8, .045); scrape(ST[4] + .1, 1.0, .045); thud(ST[4] + 1.4, .15)
    for k in range(10): drip(FIN + .3 + k * .14, .03)
    whoo(FIN + .3, 1.4, .05, 420)
else:
    x = lp(rng.standard_normal(int(.7 * SR)), 2500) * np.sin(np.pi * t_(.7) / .7); add(x, ST[0] + .1, .03)
    scrape(ST[1] + .1, 1.0, .04); x = lp(rng.standard_normal(int(.7 * SR)), 2500) * np.sin(np.pi * t_(.7) / .7); add(x, ST[2] + .1, .03)
    for k in range(8): thud(ST[3] + .15 + k * .12, .06)
    x = bp(rng.standard_normal(int(1.6 * SR)), 300, 1500) * np.sin(np.pi * t_(1.6) / 1.6); add(x, ST[3] + .6, .03)
    thud(ST[4] + .3, .12)
for k, n_ in enumerate([81, 85, 88]): glock(n_, FIN + .9 + k * .1, .05)
tap(PHONE + .5, .18)
for k, n_ in enumerate([62, 66, 69, 74, 78]): guitar(n_, END + k * .07, d=2.8, g=.1, pan=-.3 + k * .15)
for k, n_ in enumerate([74, 78, 81, 86]): mbox(n_, END + .3 + k * .1, .05)
softpad([50, 57, 62, 66], END, DUR - END, g=.08)

irt = t_(2.8); ir = rng.standard_normal(len(irt)) * np.exp(-irt * 2.1)
irL = lp(ir, 5500); irR = lp(np.roll(ir, 731), 5500); irL[:int(.015 * SR)] = 0; irR[:int(.021 * SR)] = 0
L += fftconvolve(hp(RL, 180), irL)[:N] * .22; R += fftconvolve(hp(RR, 180), irR)[:N] * .22
for ch_ in (L, R): ch_[:] = lp(hp(ch_, 35), 12000)
m = max(np.abs(L).max(), np.abs(R).max()); L /= m; R /= m
L = np.tanh(L * 1.5) / np.tanh(1.5); R = np.tanh(R * 1.5) / np.tanh(1.5)
fi = np.clip(np.arange(N) / SR / .25, 0, 1); fo = np.clip((DUR - np.arange(N) / SR) / 1.5, 0, 1)
L *= fi * fo * .85; R *= fi * fo * .85
pcm = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(OUT, 'wb') as w_: w_.setnchannels(2); w_.setsampwidth(2); w_.setframerate(SR); w_.writeframes(pcm.tobytes())
seg = np.stack([L, R], 1)
print('ok', OUT, [round(float(np.sqrt((seg[int(a * SR):int(min(DUR, a + 2) * SR)] ** 2).mean())), 2) for a in range(0, int(DUR), 2)])
