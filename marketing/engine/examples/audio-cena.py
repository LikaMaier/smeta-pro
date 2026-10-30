"""Звук «Сколько стоит ремонт однушки»: бит с первой доли, «касса» на каждом этапе, свист самолётика. Инструменты — из audio-terrasy.py. Всё синтезировано.
python3 audio-cena.py out.wav"""
import sys, numpy as np, wave
OUT = sys.argv[1]
src = open(__file__.replace('audio-cena.py', 'audio-terrasy.py'), encoding='utf-8').read()
sys.argv = [sys.argv[0], OUT]
__file__ = __file__.replace('audio-cena.py', 'audio-terrasy.py')
exec(src.split('b = 60 / 80')[0].replace('DUR = 30.0', 'DUR = 17.0'))

S2, S3, BARS, SHARE, END = 4.6, 8.2, 11.3, 13.0, 15.2
b = .6
def whoosh(at, d=.5, g=.05):
    tt = t_(d); x = rng.standard_normal(len(tt)); y = np.zeros_like(x)
    for k in range(0, len(x), 1024):
        fc = 400 + 3500 * (k / len(x)); y[k:k + 1024] = bp(x[k:k + 1024], fc * .7, fc * 1.3)
    add(y * np.sin(np.pi * tt / d), at, g, 0)
def ching(at, g=.07):
    for k, n in enumerate([93, 98, 100]): glock(n, at + k * .05, g)
    tt = t_(.25); add(hp(rng.standard_normal(len(tt)), 5000) * np.exp(-tt * 18), at, g * .6, .2)
def tick(at, g=.03):
    tt = t_(.03); add(hp(rng.standard_normal(len(tt)), 3000) * np.exp(-tt * 200), at, g, rng.random() - .5)
# бит с первого кадра
CH = [(38, [50, 54, 57, 62]), (43, [55, 59, 62, 67]), (35, [47, 50, 54, 59]), (45, [57, 61, 64, 69])]
t = 0.0; bar = 0
while t < END - .05:
    root, ch = CH[bar % 4]
    guitar(root + 12, t, d=b * 4, g=.13, pan=-.1)
    softpad([n + 12 for n in ch[:3]], t, b * 4 + .3, g=.05)
    for k in range(4):
        at = t + k * b
        if at < END:
            softkick(at, .34 if k % 2 == 0 else .24); brush(at + b / 2, .032)
            guitar(ch[(k * 2) % 4], at, d=1.0, g=.06, pan=.3); guitar(ch[(k * 2 + 1) % 4], at + b / 2, d=.9, g=.05, pan=-.3)
    t += 4 * b; bar += 1
thud(0.0, .14); ching(.05, .035)
# счётчик тикает
for k in range(70):
    at = .4 + k * .05
    if at < 3.8: tick(at)
for k in range(30): tick(S2 + k * .05)
for k in range(46): tick(S3 + k * .05)
for at in (S2, S3): thud(at, .16); whoosh(at - .4, .4, .03); ching(at + .05, .045)
for i in range(3): glock([81, 85, 88][i], BARS + i * .25, .06)
whoosh(SHARE + .1, 1.4, .04); ching(SHARE + .05, .035)
for k, n in enumerate([62, 66, 69, 74, 78]): guitar(n, END + k * .07, d=1.8, g=.09, pan=-.3 + k * .15)
piano(86, END + .3, d=1.6, g=.08); softpad([50, 57, 62, 66], END, DUR - END, g=.07)
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
