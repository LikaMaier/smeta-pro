"""Звук «Террасирование»: спокойная акустика 80 BPM (ре мажор): гитарный перебор, войлочное пианино,
тёплый пэд, мягкие щётки, птицы, колокольчик на каждом шаге. Всё синтезировано — без чужой музыки.
python3 audio-terrasy.py out.wav"""
import sys, re, numpy as np, wave
OUT = sys.argv[1]
src = open(__file__.replace('audio-terrasy.py', 'audio-kapibara.py'), encoding='utf-8').read()
lib = src.split('# ---- 1.')[0]
DUR = 30.0
lib = re.sub(r'DUR = [\d.]+', f'DUR = {DUR}', lib, count=1)
exec(lib)
rng = np.random.default_rng(11)

def guitar(n, at, d=1.8, g=.1, pan=0.0):
    fr = f(n); P = int(SR / fr); M = int(d * SR)
    y = np.zeros(M); y[:P] = lp(rng.uniform(-1, 1, P), 3500) if P > 40 else rng.uniform(-1, 1, P)
    for i in range(P, M): y[i] = .4985 * (y[i - P] + y[i - P + 1])
    y = lp(y, 4200) * adsr(M, .001, .1, 1, .25)
    add(y, at, g, pan); add(y, at, g * .45, pan, REV)
def piano(n, at, d=2.2, g=.1, pan=0.0):
    t = t_(d); fr = f(n)
    x = sum(a * np.sin(2 * np.pi * fr * h * (1 + .0004 * h * h) * t) * np.exp(-t * (1.6 + h * .9)) for h, a in ((1, 1), (2, .45), (3, .18), (4, .08)))
    x = lp(x, 2600) * adsr(len(t), .006, .1, 1, .4)
    add(x, at, g, pan); add(x, at, g * .6, pan, REV)
def softpad(notes, at, d, g=.06):
    for n in notes:
        for det, pan in ((-.004, -.5), (.004, .5)):
            t = t_(d); x = np.sin(2 * np.pi * f(n) * (1 + det) * t) + .25 * np.sin(4 * np.pi * f(n) * (1 + det) * t)
            x *= adsr(len(t), 1.2, .3, .9, 1.2)
            add(x, at, g / len(notes), pan); add(x, at, g * .8 / len(notes), pan, REV)
def brush(at, g=.03):
    t = t_(.22); add(bp(rng.standard_normal(len(t)), 2500, 9000) * np.exp(-t * 14), at, g, .3)
def softkick(at, g=.35):
    t = t_(.35); fr = 45 + 60 * np.exp(-t * 30)
    add(lp(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 9), 200), at, g)
def glock(n, at, g=.07):
    t = t_(1.6); x = (np.sin(2 * np.pi * f(n) * t) + .3 * np.sin(2 * np.pi * f(n) * 2.76 * t) * np.exp(-t * 6)) * np.exp(-t * 2.8)
    add(x, at, g, .25); add(x, at, g * .9, -.25, REV)
def bird(at, g=.035, pan=.6):
    for k in range(2 + int(rng.random() * 3)):
        d = .06 + rng.random() * .05; t = t_(d); base = 2800 + rng.random() * 1600
        fr = base + 900 * np.sin(np.pi * t / d)
        add(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * t / d) ** 2, at + k * (.1 + rng.random() * .05), g, pan)

b = 60 / 80
# D — Bm — G — A (+ A sus в конце)
PROG = [(38, [50, 54, 57, 62, 66]), (35, [47, 54, 59, 62, 66]), (31, [43, 50, 55, 59, 62]), (33, [45, 52, 57, 61, 64])]
PICK = [0, 2, 3, 4, 3, 2, 1, 3]          # перебор по 8-м
T0, D = 2.4, 2.8; PHONE = T0 + 8 * D; END = PHONE + 2.6
MEL = [74, 76, 78, 81, 78, 76, 74, 73, 71, 73, 74, 76, 78, 76, 74, 69]

t = 0.0; bar = 0
while t < END - .05:
    root, ch = PROG[bar % 4]
    guitar(root + 12, t, d=b * 4, g=.12, pan=-.15)
    for k, idx in enumerate(PICK):
        at = t + k * b / 2
        if at < END - .05: guitar(ch[idx], at, d=1.6, g=.075, pan=(-.35 + idx * .17))
    softpad([n + 12 for n in ch[:3]], t, b * 4 + .4, g=.05)
    if t >= T0 - .1:
        for k in range(4):
            at = t + k * b
            if k in (0, 2): softkick(at, .28 if k == 0 else .2)
            brush(at + b / 2, .028); brush(at + b * .75, .018)
    # мелодия пианино — со 2-го такта, по 2 ноты на такт
    if bar >= 1:
        for k in range(2):
            n = MEL[((bar - 1) * 2 + k) % len(MEL)]
            piano(n, t + k * 2 * b + (.02 if k else 0), d=2.4, g=.085, pan=.15)
    t += 4 * b; bar += 1

# колокольчик на каждом шаге: восходящая пентатоника
for i, n in enumerate([74, 76, 78, 81, 83, 86, 88, 90]): glock(n, T0 + i * D + .02, .06)
# птицы
for a in (0.4, 3.1, 6.9, 11.2, 15.8, 20.6, 22.6, 23.4): bird(a, .03, (-1) ** int(a) * .6)
# шорох грунта (шаг 3) и стук блоков (шаг 5) — тихо
x = lp(rng.standard_normal(int(1.8 * SR)), 1200) * np.sin(np.pi * t_(1.8) / 1.8); add(x, T0 + 2 * D + .2, .05)
for r in range(6): thud(T0 + 4 * D + .4 + r * .3, .1)
# телефон: тап
tap(PHONE + .6, .18)
# финал: тихое разрешение на D
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
