"""Звук «11 слоёв пола»: бодрый бит 100 BPM, на каждый слой — удар и колокольчик выше на ступень (растущая гамма),
в финале — тёплый аккорд. Инструменты — из audio-terrasy.py. Всё синтезировано.
python3 audio-pol.py out.wav"""
import sys, numpy as np, wave
OUT = sys.argv[1]
src = open(__file__.replace('audio-pol.py', 'audio-terrasy.py'), encoding='utf-8').read()
sys.argv = [sys.argv[0], OUT]
__file__ = __file__.replace('audio-pol.py', 'audio-terrasy.py')
exec(src.split('b = 60 / 80')[0].replace('DUR = 30.0', 'DUR = 22.5'))

T0, DT, NL = 1.5, 1.2, 11
LT = [T0 + i * DT for i in range(NL)]
DONE = LT[-1] + 1.1; ASK = DONE + 2.6; END = ASK + 2.3
b = .6
def whoosh(at, d=.5, g=.05):
    tt = t_(d); x = rng.standard_normal(len(tt)); y = np.zeros_like(x)
    for k in range(0, len(x), 1024):
        fc = 400 + 3500 * (k / len(x)); y[k:k + 1024] = bp(x[k:k + 1024], fc * .7, fc * 1.3)
    add(y * np.sin(np.pi * tt / d), at, g, 0)
# крючок: подъём
whoosh(0.0, 1.4, .05)
for k, n in enumerate([57, 62, 66, 69]): piano(n, .1 + k * .3, d=1.4, g=.07)
# бит
CH = [(38, [50, 54, 57, 62]), (43, [55, 59, 62, 67]), (35, [47, 50, 54, 59]), (45, [57, 61, 64, 69])]  # D G Bm A
t = T0; bar = 0
while t < DONE - .05:
    root, ch = CH[bar % 4]
    guitar(root + 12, t, d=b * 4, g=.13, pan=-.1)
    softpad([n + 12 for n in ch[:3]], t, b * 4 + .3, g=.05)
    for k in range(4):
        at = t + k * b
        if at < DONE:
            softkick(at, .32 if k % 2 == 0 else .22); brush(at + b / 2, .03)
            guitar(ch[(k * 2) % 4], at, d=1.0, g=.06, pan=.3); guitar(ch[(k * 2 + 1) % 4], at + b / 2, d=.9, g=.05, pan=-.3)
    t += 4 * b; bar += 1
# каждый слой: свист падения, удар, колокольчик — гамма вверх
SCALE = [74, 76, 78, 79, 81, 83, 85, 86, 88, 90, 91]
for i, at in enumerate(LT):
    if i: whoosh(at, .4, .03)
    thud(at + .42, .3 if i == 0 else .2)
    glock(SCALE[i], at + .43, .075)
# финал
for k, n in enumerate([62, 66, 69, 74, 78]): guitar(n, DONE + k * .06, d=3.0, g=.1, pan=-.3 + k * .15)
piano(86, DONE + .3, d=3.0, g=.08); softpad([50, 57, 62, 66], DONE, ASK - DONE + .5, g=.08)
t = DONE + .1
while t < END + 1.5:
    softkick(t, .28); brush(t + b, .03); softkick(t + b, .18)
    for k, n in enumerate([50, 54, 57, 62]): guitar(n + 12, t + k * b / 2, d=1.2, g=.07, pan=-.3 + k * .2)
    t += 2 * b
for k, n in enumerate([69, 74, 78, 81]): glock(n, ASK + k * .12, .05)
for k, n in enumerate([62, 66, 69, 74, 78]): guitar(n, END + k * .07, d=2.0, g=.09, pan=-.3 + k * .15)
piano(86, END + .4, d=1.8, g=.08); softpad([50, 57, 62, 66], END, DUR - END, g=.07)
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
