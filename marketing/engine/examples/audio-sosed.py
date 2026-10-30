"""Звук «Почему слышно соседей»: глухой бас соседской музыки «через стену» (тише с каждым исправлением), щелчки шумомера, удары монтажа, в финале — тишина и спокойное пианино. Инструменты — из audio-terrasy.py. Всё синтезировано.
python3 audio-sosed.py out.wav"""
import sys, numpy as np, wave
OUT = sys.argv[1]
src = open(__file__.replace('audio-sosed.py', 'audio-terrasy.py'), encoding='utf-8').read()
sys.argv = [sys.argv[0], OUT]
__file__ = __file__.replace('audio-sosed.py', 'audio-terrasy.py')
exec(src.split('b = 60 / 80')[0].replace('DUR = 30.0', 'DUR = 23.6'))

A = 2.6; XR = 4.2; LD = 2.6; LT = [XR, XR + LD, XR + 2 * LD]; F0 = XR + 3 * LD
FT = [F0, F0 + 1.6, F0 + 3.2, F0 + 4.8]; RES = F0 + 7.2; END = RES + 2.4
def vol(t):
    k = 1.0
    for i, fz in enumerate(FT):
        if t > fz + .8: k = [0.75, 0.55, 0.45, 0.12][i]
    return k
def wbass(n, at, d, g):
    tt = t_(d); f = 440 * 2 ** ((n - 69) / 12)
    x = np.sin(2 * np.pi * f * tt) + .5 * np.sin(4 * np.pi * f * tt) + .3 * np.sign(np.sin(2 * np.pi * f * tt))
    add(lp(x, 220) * np.exp(-tt * 3) * np.minimum(1, tt / .01), at, g, 0)
def thunk(at, g=.12):
    tt = t_(.18); add(lp(rng.standard_normal(len(tt)), 600) * np.exp(-tt * 30) + np.sin(2 * np.pi * 90 * tt) * np.exp(-tt * 25), at, g, -.2)
def beep(at, n=88, g=.05):
    tt = t_(.12); add(np.sin(2 * np.pi * 440 * 2 ** ((n - 69) / 12) * tt) * np.exp(-tt * 20), at, g, .3)
# соседская музыка «через стену»: 120 BPM, глухо (только низ)
BL = [33, 33, 36, 31]; t = 0.0; k = 0
while t < FT[3] + 1.2:
    v = vol(t)
    softkick(t, .5 * v); 
    if k % 2 == 0: wbass(BL[(k // 4) % 4], t, .45, .5 * v)
    else: wbass(BL[(k // 4) % 4] + 7, t, .3, .35 * v)
    t += .5; k += 1
# напряжённый пэд под объяснения
pad([45, 52, 57], A, F0 - A, g=.05, cut=700)
for i, l in enumerate(LT): beep(l, 81 + i * 2, .06); thud(l + .05, .12)
# исправления: удар + шумомер вниз
for i, fz in enumerate(FT): thunk(fz + .2, .14); thunk(fz + .45, .1); beep(fz + .8, 76 - i * 2, .06)
for k2 in range(6): thunk(FT[3] + .3 + k2 * .22, .06)
# ритм под исправления: светлая гитара — становится легче
CH = [(38, [50, 54, 57, 62]), (43, [55, 59, 62, 67]), (35, [47, 50, 54, 59]), (45, [57, 61, 64, 69])]
t = FT[0]; bar = 0; b = .6
while t < RES:
    root, ch = CH[bar % 4]
    for k3 in range(4):
        at = t + k3 * b
        if at < RES: guitar(ch[(k3 * 2) % 4], at, d=1.0, g=.085, pan=.3); guitar(ch[(k3 * 2 + 1) % 4], at + b / 2, d=.9, g=.07, pan=-.3); brush(at + b / 2, .03)
    guitar(root + 12, t, d=b * 4, g=.12); t += 4 * b; bar += 1
# финал: тишина и пианино
for k2, n in enumerate([62, 66, 69, 74]): piano(n, FT[3] + 1.9 + k2 * .35, d=2.4, g=.08)
softpad([50, 57, 62, 66], FT[3] + 1.8, DUR - FT[3] - 1.8, g=.07)
for k2, n in enumerate([78, 81, 86]): glock(n, RES + k2 * .12, .05)
t = RES
while t < DUR - .5: brush(t, .02); softkick(t, .14); t += .6
for k2, n in enumerate([62, 66, 69, 74, 78]): guitar(n, END + k2 * .07, d=1.8, g=.09, pan=-.3 + k2 * .15)
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
