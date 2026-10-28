"""Звук «Хэллоуин прораба»: гром и сова → жуткий вальс музыкальной шкатулки (ре минор) с терменвоксом,
«у-у-у» призраков и писком мышей → весёлый мажорный финал. Инструменты — из audio-terrasy.py. Всё синтезировано.
python3 audio-halloween.py out.wav"""
import sys, numpy as np, wave
OUT = sys.argv[1]
src = open(__file__.replace('audio-halloween.py', 'audio-terrasy.py'), encoding='utf-8').read()
sys.argv = [sys.argv[0], OUT]
__file__ = __file__.replace('audio-halloween.py', 'audio-terrasy.py')
exec(src.split('b = 60 / 80')[0].replace('DUR = 30.0', 'DUR = 23.0'))

H, P3, P2, P1, PHONE, END = 2.6, 2.6, 7.4, 12.0, 16.6, 20.2
def mbox(n, at, g=.06, pan=.2):
    tt = t_(1.4); fr = f(n)
    x = (np.sin(2 * np.pi * fr * tt) + .4 * np.sin(2 * np.pi * fr * 3.01 * tt) * np.exp(-tt * 9) + .2 * np.sin(2 * np.pi * fr * 5.4 * tt) * np.exp(-tt * 14)) * np.exp(-tt * 3.2)
    add(x, at, g, pan); add(x, at, g * .9, -pan, REV)
def theremin(notes, at, step, g=.05):
    d = len(notes) * step; tt = t_(d)
    fr = np.repeat([f(n) for n in notes], int(step * SR))[:len(tt)]
    fr = np.concatenate([fr, np.full(len(tt) - len(fr), fr[-1])]) if len(fr) < len(tt) else fr
    fr = lp(fr, 6) * (1 + .012 * np.sin(2 * np.pi * 5.5 * tt))
    x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.minimum(1, np.minimum(tt / .3, (d - tt) / .4))
    add(x, at, g, -.2); add(x, at, g, .2, REV)
def thunder(at, d=2.5, g=.25):
    tt = t_(d); x = lp(rng.standard_normal(len(tt)), 300) * (np.exp(-tt * 1.6) + .5 * np.exp(-((tt - .3) * 6) ** 2))
    add(x, at, g, -.3); add(x, at, g * .7, .3, REV)
def owl(at, g=.05):
    for k, d in enumerate([.28, .5]):
        tt = t_(d); fr = 420 - 60 * tt / d
        add(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * tt / d) ** 2, at + k * .45, g, .6); add(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * tt / d) ** 2, at + k * .45, g * .8, .6, REV)
def whoo(at, d=1.6, g=.06):
    tt = t_(d); fr = 300 + 260 * np.sin(np.pi * tt / d) * (1 + .03 * np.sin(2 * np.pi * 6 * tt))
    x = (np.sin(2 * np.pi * np.cumsum(fr) / SR) + .3 * np.sin(4 * np.pi * np.cumsum(fr) / SR)) * np.sin(np.pi * tt / d) ** 1.5
    add(lp(x, 1800), at, g, 0); add(lp(x, 1800), at, g * 1.2, 0, REV)
def squeak(at, g=.03):
    tt = t_(.06); fr = 5000 + 2500 * np.sin(np.pi * tt / .06); add(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * tt / .06), at, g, rng.random() * 1.6 - .8)
def boom(at, g=.4):
    tt = t_(1.2); add(lp(np.sin(2 * np.pi * np.cumsum(55 + 40 * np.exp(-tt * 8)) / SR) * np.exp(-tt * 3), 300), at, g); add(hp(rng.standard_normal(len(tt)), 3000) * np.exp(-tt * 9), at, g * .15, 0, REV)

# ---- интро
thunder(.1, 2.6, .2); owl(1.3, .05)
softpad([38, 45, 50, 53], 0, H + .3, g=.12)
for k, n in enumerate([62, 65, 69, 74, 73, 69]): mbox(n + 12, .15 + k * .4, .09, (-1) ** k * .3)
# ---- жуткий вальс 3/4, 100 BPM, Dm — Bb — Gm — A
b = 60 / 100
PROG = [(38, [50, 53, 57]), (34, [46, 50, 53]), (31, [43, 46, 50]), (33, [45, 49, 52])]
MEL = [69, 70, 69, 65, 62, 65, 69, 74, 72, 70, 69, 67, 69, 65, 64, 61]
t = H; bar = 0
while t < PHONE - .3:
    root, ch = PROG[bar % 4]
    pizz = lambda n, a, gg: (add(np.sin(2 * np.pi * f(n) * t_(.3)) * np.exp(-t_(.3) * 12), a, gg, -.2))
    pizz(root, t, .22)
    for k in (1, 2):
        for n in ch: mbox(n + 12, t + k * b, .025, .35)
    for k in range(3):
        mbox(MEL[(bar * 3 + k) % len(MEL)] + 12, t + k * b + .01, .07, -.1)
    if bar % 2 == 0: softpad([root + 12, ch[1], ch[2]], t, b * 6, g=.05)
    t += 3 * b; bar += 1
theremin([74, 72, 70, 69, 70, 69, 65, 62], P2 + .2, .55, .035)
for a in (P3, P2, P1): boom(a, .32)
whoo(P3 + .3, 1.8, .06); whoo(P2 + .4, 1.8, .06); whoo(P1 + .3, 1.8, .06)
for k in range(10): squeak(H + .5 + rng.random() * 13, .025)
owl(P2 + 2.5, .04); thunder(P1 + 2.6, 1.8, .15)
# ---- весёлая развязка: F мажор, 112 BPM
b2 = 60 / 112; t = PHONE; bar = 0
HAP = [(41, [53, 57, 60, 65]), (36, [48, 52, 55, 60]), (38, [50, 53, 57, 62]), (34, [46, 50, 53, 58])]
for k, n in enumerate([65, 69, 72, 77]): glock(n + 12, PHONE + k * .07, .12)
while t < END - .05:
    root, ch = HAP[bar % 4]
    for k in range(4):
        at = t + k * b2
        softkick(at, .55 if k % 2 == 0 else .4); brush(at + b2 / 2, .06)
        guitar(root + 12 + (7 if k % 2 else 0), at, d=.6, g=.22)
        if k in (1, 3): [guitar(n + 12, at + .01 * i, d=.8, g=.1, pan=-.3 + i * .2) for i, n in enumerate(ch)]
    t += 4 * b2; bar += 1
tap(PHONE + 1.0, .2)
for k in range(int((END - PHONE) / (b2 / 2))): glock([77, 81, 84, 81, 79, 77, 76, 72][k % 8], PHONE + k * b2 / 2, .07)
for k, n in enumerate([65, 69, 72, 77, 81]): glock(n, END + k * .08, .12)
for k, n in enumerate([53, 57, 60, 65]): guitar(n, END + .02 * k, d=2.5, g=.18, pan=-.3 + k * .2)
softpad([53, 60, 65, 69], END, DUR - END, g=.16)

irt = t_(2.8); ir = rng.standard_normal(len(irt)) * np.exp(-irt * 2.0)
irL = lp(ir, 5500); irR = lp(np.roll(ir, 731), 5500); irL[:int(.015 * SR)] = 0; irR[:int(.021 * SR)] = 0
L += fftconvolve(hp(RL, 180), irL)[:N] * .24; R += fftconvolve(hp(RR, 180), irR)[:N] * .24
for ch_ in (L, R): ch_[:] = lp(hp(ch_, 35), 12000)
m = max(np.abs(L).max(), np.abs(R).max()); L /= m; R /= m
L = np.tanh(L * 1.4) / np.tanh(1.4); R = np.tanh(R * 1.4) / np.tanh(1.4)
fi = np.clip(np.arange(N) / SR / .2, 0, 1); fo = np.clip((DUR - np.arange(N) / SR) / 1.5, 0, 1)
L *= fi * fo * .85; R *= fi * fo * .85
pcm = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(OUT, 'wb') as w_: w_.setnchannels(2); w_.setsampwidth(2); w_.setframerate(SR); w_.writeframes(pcm.tobytes())
seg = np.stack([L, R], 1)
print('ok', OUT, [round(float(np.sqrt((seg[int(a * SR):int(min(DUR, a + 2) * SR)] ** 2).mean())), 2) for a in range(0, int(DUR), 2)])
