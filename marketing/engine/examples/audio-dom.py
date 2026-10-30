"""Звук «Дом 10×10 за 30 секунд»: бодрый бит с первой доли, звуки стройки (шуруповёрт свай, молоток по стойкам, фермы, листы кровли), «касса» на каждом этапе. Инструменты — из audio-terrasy.py. Всё синтезировано.
python3 audio-dom.py out.wav"""
import sys, numpy as np, wave
OUT = sys.argv[1]
src = open(__file__.replace('audio-dom.py', 'audio-terrasy.py'), encoding='utf-8').read()
sys.argv = [sys.argv[0], OUT]
__file__ = __file__.replace('audio-dom.py', 'audio-terrasy.py')
exec(src.split('b = 60 / 80')[0].replace('DUR = 30.0', 'DUR = 24.0'))

ST = [0.6, 5.0, 10.0, 14.0]; FIN = 17.6; SHARE = 20.0; END = 22.0
b = .6
def whoosh(at, d=.5, g=.05):
    tt = t_(d); x = rng.standard_normal(len(tt)); y = np.zeros_like(x)
    for k in range(0, len(x), 1024):
        fc = 400 + 3500 * (k / len(x)); y[k:k + 1024] = bp(x[k:k + 1024], fc * .7, fc * 1.3)
    add(y * np.sin(np.pi * tt / d), at, g, 0)
def ching(at, g=.045):
    for k, n in enumerate([93, 98, 100]): glock(n, at + k * .05, g)
    tt = t_(.25); add(hp(rng.standard_normal(len(tt)), 5000) * np.exp(-tt * 18), at, g * .6, .2)
def whirr(at, d=.4, g=.03):
    tt = t_(d); fr = 180 + 220 * np.minimum(1, tt / .1)
    add(bp(np.sign(np.sin(2 * np.pi * np.cumsum(fr) / SR)) + .3 * rng.standard_normal(len(tt)), 300, 3000) * np.sin(np.pi * tt / d), at, g, rng.random() - .5)
def knock(at, g=.05):
    tt = t_(.08); add(bp(rng.standard_normal(len(tt)), 600, 3500) * np.exp(-tt * 70) + .6 * np.sin(2 * np.pi * 420 * tt) * np.exp(-tt * 60), at, g, rng.random() * .6 - .3)
def clank(at, g=.04):
    tt = t_(.4); x = sum(np.sin(2 * np.pi * f0 * tt) for f0 in (523, 811, 1247, 1630)) * np.exp(-tt * 12)
    add(hp(x + .5 * rng.standard_normal(len(tt)) * np.exp(-tt * 40), 300), at, g, rng.random() - .5)
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
thud(0.0, .14); whoosh(0.0, .8, .04)
for i in range(16): whirr(ST[0] + i * .2, .45, .022)
for i in range(4): knock(ST[0] + 3.4 + i * .2, .05)
for i in range(52): knock(ST[1] + .6 + i * .035, .025)
for i in range(11): knock(ST[2] + i * .12, .05); 
for i in range(10): clank(ST[2] + 1.6 + i * .16, .022)
for i in range(6): knock(ST[3] + .8 + i * .2, .04)
for i, s0 in enumerate(ST): ching(s0 + .3, .04); thud(s0, .12)
for k, n in enumerate([62, 66, 69, 74, 78]): guitar(n, FIN + k * .06, d=2.6, g=.09, pan=-.3 + k * .15)
piano(86, FIN + .3, d=2.4, g=.07); softpad([50, 57, 62, 66], FIN, SHARE - FIN + .5, g=.07)
whoosh(SHARE + .1, 1.0, .035); ching(SHARE + .05, .03)
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
