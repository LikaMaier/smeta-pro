"""Звук «ЖБ лотки»: тихий дождь + грустный перебор (Dm–B♭–F–C) в части «без лотка», глухой удар при падении забора,
затем светлая акустика (D–A–Bm–G) с колокольчиком на каждом шаге. Инструменты — из audio-terrasy.py. Всё синтезировано.
python3 audio-lotki.py out.wav"""
import sys, numpy as np, wave
OUT = sys.argv[1]
src = open(__file__.replace('audio-lotki.py', 'audio-terrasy.py'), encoding='utf-8').read()
sys.argv = [sys.argv[0], OUT]
__file__ = __file__.replace('audio-lotki.py', 'audio-terrasy.py')
exec(src.split('b = 60 / 80')[0].replace('DUR = 30.0', 'DUR = 32.5'))

def rainbed(at, d, g):
    x = rng.standard_normal(int(d * SR)); y = hp(lp(x, 5500), 700) * .55 + lp(x, 450) * .2
    y += hp((rng.random(len(x)) > .9988) * rng.standard_normal(len(x)) * 2.5, 2000)
    tt = t_(d); e = np.minimum(1, np.minimum(tt / .8, (d - tt) / .8))
    add(y * e, at, g, -.35); add(y * e, at, g, .35)

A, B = 2.4, 10.2
ST = [10.4, 13.0, 15.0, 19.6, 21.9]
st = lambda i: ST[i]
TEST, PHONE, END = 24.3, 26.9, 29.5
b = 60 / 80
# ---- часть A: дождь и грустный перебор
rainbed(0, B + .3, .16)
SAD = [(38, [50, 53, 57, 62, 65]), (34, [46, 53, 58, 62, 65]), (41, [53, 57, 60, 65, 69]), (36, [48, 55, 60, 64, 67])]
PICK = [0, 2, 3, 4, 3, 2, 1, 3]
t = 0.0; bar = 0
while t < 8.0:
    root, ch = SAD[bar % 4]
    guitar(root + 12, t, d=b * 4, g=.11, pan=-.15)
    for k, idx in enumerate(PICK):
        at = t + k * b / 2
        if at < 8.2: guitar(ch[idx], at, d=1.5, g=.07, pan=-.35 + idx * .17)
    softpad([n + 12 for n in ch[:3]], t, b * 4 + .4, g=.045)
    if bar >= 1: piano([74, 72, 69, 65, 67, 69][bar % 6], t + .02, d=2.6, g=.075)
    t += 4 * b; bar += 1
# скрип и падение забора
for k in range(3):
    tt = t_(.35); fr = 180 + 60 * np.sin(np.pi * tt / .35) + k * 25
    add(lp(np.sign(np.sin(2 * np.pi * np.cumsum(fr) / SR)) * np.sin(np.pi * tt / .35), 1400), 6.6 + k * .45, .035)
thud(8.48, .45); thud(8.56, .25)
x = lp(rng.standard_normal(int(1.0 * SR)), 900) * np.exp(-t_(1.0) * 4); add(x, 8.45, .12)
pad([38, 45, 50], 8.5, 1.8, g=.08, cut=500)
# ---- часть B: светлая акустика
HAPPY = [(38, [50, 54, 57, 62, 66]), (33, [45, 52, 57, 61, 64]), (35, [47, 54, 59, 62, 66]), (31, [43, 50, 55, 59, 62])]
MEL = [78, 76, 74, 76, 78, 81, 78, 76, 74, 73, 71, 73, 74, 76, 78, 74]
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
        n = MEL[(bar * 2 + k) % len(MEL)]
        if t + k * 2 * b < END: piano(n, t + k * 2 * b + .02, d=2.4, g=.08, pan=.15)
    t += 4 * b; bar += 1
for i, n in enumerate([74, 76, 78, 81, 83]): glock(n, st(i) + .02, .06)
x = lp(rng.standard_normal(int(1.0 * SR)), 1000) * np.sin(np.pi * t_(1.0)); add(x, st(0) + .1, .05)
# виброплита: щебень и пазухи
def vibro(at, d, g=.035):
    tt = t_(d); x = lp(np.sign(np.sin(2 * np.pi * 42 * tt)) + .3 * rng.standard_normal(len(tt)), 700) * np.sin(np.pi * tt / d) ** .5
    add(x, at, g, .2)
vibro(st(0) + 1.4, st(1) - st(0) - 1.5); vibro(st(4) + .9, 1.0)
# манипулятор: подъезд, гидравлика стрелы, лоток встаёт на подушку, отъезд
def engine(at, d, g=.09, up=0):
    tt = t_(d); fr = 34 + 10 * np.sin(np.pi * tt / d) + up * tt / d * 8
    x = lp(np.sign(np.sin(2 * np.pi * np.cumsum(fr) / SR)) + .2 * rng.standard_normal(len(tt)), 260) * np.sin(np.pi * tt / d) ** .7
    add(x, at, g, .3)
def hydro(at, d, g=.025, f0=220, f1=300):
    tt = t_(d); fr = f0 + (f1 - f0) * tt / d
    x = bp(saw(1, d) * 0 + np.sin(2 * np.pi * np.cumsum(fr) / SR) + .5 * np.sin(4 * np.pi * np.cumsum(fr) / SR), 150, 1200) * np.sin(np.pi * tt / d)
    add(x, at, g, .4)
S2 = st(2)
engine(S2 - .9, 2.4, .1)
for a, d, f0, f1 in ((S2 + 1.6, .5, 200, 260), (S2 + 2.1, .35, 260, 320), (S2 + 2.45, 1.0, 240, 280), (S2 + 3.45, .6, 300, 220), (S2 + 4.35, .55, 220, 260)):
    hydro(a, d, .03, f0, f1)
thud(S2 + 4.05, .35); glock(86, S2 + 4.1, .04)
engine(st(3), 1.6, .07, up=1)
thud(st(4) + 2.0, .15)
rainbed(TEST - .3, PHONE - TEST + .6, .1)
for k, n in enumerate([81, 85, 88]): glock(n, TEST + 1.0 + k * .1, .05)
for a in (B + 1.0, st(2) + .8, st(4) + 1.4): bird(a, .03, .6)
tap(PHONE + .6, .18)
for k, n in enumerate([62, 66, 69, 74, 78]): guitar(n, END + k * .07, d=3.0, g=.09, pan=-.3 + k * .15)
piano(86, END + .5, d=3.0, g=.08); softpad([50, 57, 62, 66], END, DUR - END, g=.07)

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
