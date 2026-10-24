"""Звук роликов «отмостка» (хаус-фанк 120 BPM, маримба) и «плитка» (акустика 96 BPM, гитара Карплюса-Стронга).
python3 audio-ucheba2.py otmostka|plitka out.wav"""
import sys, re, numpy as np, wave
MODE, OUT = sys.argv[1], sys.argv[2]
src = open(__file__.replace('audio-ucheba2.py', 'audio-kapibara.py'), encoding='utf-8').read()
lib = src.split('# ---- 1.')[0]
DUR = 23.5 if MODE == 'otmostka' else 23.0
lib = re.sub(r'DUR = [\d.]+', f'DUR = {DUR}', lib, count=1)
exec(lib)

def marimba(n, at, g=.12, pan=0.0):
    t = t_(.9); fr = f(n)
    x = np.sin(2 * np.pi * fr * t) * np.exp(-t * 6) + .35 * np.sin(2 * np.pi * fr * 4 * t) * np.exp(-t * 22) + .15 * np.sin(2 * np.pi * fr * 10 * t) * np.exp(-t * 45)
    add(x * adsr(len(t), .002, .05, 1, .1), at, g, pan); add(x, at, g * .35, pan, REV)
def bassp(n, at, d=.22, g=.3):
    x = lp(saw(f(n), d), 500 + 1800 * 0.5) * np.exp(-t_(d) * 7)
    add(np.tanh(x * 1.5), at, g)
def ohat(at, g=.09):
    t = t_(.18); add(hp(rng.standard_normal(len(t)), 6500) * np.exp(-t * 18), at, g, -.2)
def blip(at, up=True, g=.12):
    t = t_(.18); fr = (600 + 1800 * t / .18) if up else (2400 - 1800 * t / .18)
    add(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * t / .18), at, g, .3); add(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * t / .18), at, g * .5, -.3, REV)
def guitar(n, at, d=1.6, g=.1, pan=0.0, bright=.5):
    fr = f(n); P = int(SR / fr); M = int(d * SR)
    buf = rng.uniform(-1, 1, P); buf = lp(buf, 2000 + 5000 * bright) if P > 30 else buf
    y = np.zeros(M); y[:P] = buf
    for i in range(P, M): y[i] = .497 * (y[i - P] + y[i - P + 1])
    y = lp(y, 5000) * adsr(M, .001, .1, 1, .2)
    add(y, at, g, pan); add(y, at, g * .4, pan, REV)
def strum(chord, at, g=.07, down=True):
    ns = chord if down else chord[::-1]
    for k, n in enumerate(ns): guitar(n, at + k * .018, d=1.4, g=g, pan=-.4 + k * .16)
def shaker(at, g=.05):
    t = t_(.09); add(bp(rng.standard_normal(len(t)), 5000, 11000) * np.sin(np.pi * t / .09), at, g, .4)
def rim(at, g=.25):
    t = t_(.06); add(bp(rng.standard_normal(len(t)), 1500, 3500) * np.exp(-t * 60) + np.sin(2 * np.pi * 1700 * t) * np.exp(-t * 80) * .5, at, g, .1)
def sadtrom(at, g=.16):
    for k, n in enumerate([58, 57, 56, 55]):
        d = .32 if k < 3 else 1.0; t = t_(d)
        x = lp(saw(f(n), d) * (1 + .3 * np.sin(2 * np.pi * (6 if k == 3 else 0) * t)), 900) * adsr(len(t), .03, .1, .8, .15)
        add(x, at + k * .34, g); add(x, at + k * .34, g * .4, 0, REV)
def engine(at, d, g=.12):
    t = t_(d); fr = 38 + 14 * np.sin(np.pi * t / d)
    x = lp(saw(1, d) * 0 + np.sign(np.sin(2 * np.pi * np.cumsum(fr) / SR)), 300) * np.sin(np.pi * t / d) ** 1.5
    add(x, at, g, 0)
def buzz(at, g=.16):
    t = t_(.3); x = np.sign(np.sin(2 * np.pi * 110 * t)) * .6 + saw(116, .3) * .4
    add(lp(x, 1500) * adsr(len(t), .005, .05, .9, .05), at, g)
def crunch(at, d, g=.12):
    x = rng.standard_normal(int(d * SR)) * (rng.random(int(d * SR)) > .97)
    add(bp(x, 800, 5000) * np.sin(np.pi * t_(d) / d), at, g, .2)

if MODE == 'otmostka':
    S = dict(dig=2.2, sand=5.0, eps=7.4, tape=9.8, conc=12.2, done=14.8, err=16.6, phone=19.6, end=21.4)
    b = 60 / 120
    prog = [(57, [69, 72, 76]), (53, [69, 72, 77]), (55, [71, 74, 79]), (52, [68, 71, 76])]
    # интро: маримба без ударных
    for k, n in enumerate([69, 72, 76, 81, 79, 76, 72, 76]): marimba(n, .1 + k * b / 2, .11, (-1) ** k * .3)
    i = 0
    while 2.0 + i * b / 2 < S['err']:
        at = 2.0 + i * b / 2; bar = int(i // 8) % 4; root, ch = prog[bar]
        if i % 2 == 0: kick(at, .85)
        else: ohat(at, .08)
        if i % 4 == 2: clap(at, .45)
        hat(at + b / 4, .04, .03)
        if i % 8 in (0, 3, 6): bassp(root - 12 + (12 if i % 8 == 6 else 0), at, .2, .3)
        if i % 8 in (1, 4): [marimba(n, at, .055, .2) for n in ch]
        i += 1
    for a in (S['sand'], S['eps'], S['tape'], S['conc']): blip(a - .05, True, .1); whoosh(a - .2, .25, .08)
    for k in range(5): thud(S['dig'] + .3 + k * .3, .22)
    crunch(S['sand'], 1.3, .1); crunch(S['conc'], 1.5, .08)
    for k, n in enumerate([76, 79, 84]): marimba(n, S['done'] + k * .1, .12)
    for k in range(8): bubble(S['done'] + .3 + k * .2, .05)
    pad([45, 48, 52], S['err'], 3.0, g=.12, cut=600)
    for a in (S['err'] + .3, S['err'] + 1.1, S['err'] + 1.9): buzz(a)
    i = 0
    while S['phone'] + i * b / 2 < S['end']:
        at = S['phone'] + i * b / 2
        if i % 2 == 0: kick(at, .7)
        else: ohat(at, .07)
        if i % 4 == 1: [marimba(n, at, .05) for n in [69, 72, 76]]
        i += 1
    tap(S['phone'] + .4, .3); whoosh(20.4, .25, .1)
    jt = S['end']
    for k, n in enumerate([69, 72, 76, 81, 84, 88]): marimba(n, jt + .05 + k * .08, .1, (-1) ** k * .3)
    pad([45, 52, 57, 61], jt + .1, DUR - jt, g=.13, cut=1800)
else:
    S = dict(car1=2.6, good=7.6, gr=9.6, sd=11.4, tl=13.0, curb=14.6, car2=16.0, phone=18.8, end=20.8)
    b = 60 / 96
    # плохой вариант: минор, гитара
    for k, (at, ch) in enumerate([(0.1, [50, 57, 62, 65]), (0.1 + 2 * b, [46, 53, 58, 62]), (0.1 + 4 * b, [48, 55, 60, 64]), (0.1 + 6 * b, [45, 52, 57, 61])]):
        strum(ch, at, .16); strum(ch, at + b, .12, False); kick(at, .4)
    i = 0
    while 2.6 + i * b / 2 < S['good'] - .3:
        at = 2.6 + i * b / 2
        if i % 4 == 0: kick(at, .55)
        if i % 4 == 2: rim(at, .22)
        shaker(at + b / 4, .045)
        if i % 4 == 0: strum([[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 61]][(i // 4) % 4], at, .055)
        i += 1
    engine(S['car1'], 4.4, .14)
    for k in range(6): thud(3.4 + k * .45, .2)
    sadtrom(5.0)
    riser(S['good'] - .6, .6, .1); crash(S['good'], .2)
    # правильный пирог: мажор, бодрее
    prog = [[52, 59, 64, 68, 71], [49, 56, 61, 64, 68], [45, 52, 57, 61, 64], [47, 54, 59, 63, 66]]
    i = 0
    while S['good'] + i * b / 2 < S['phone']:
        at = S['good'] + i * b / 2
        if i % 2 == 0: kick(at, .7)
        if i % 4 == 2: clap(at, .4)
        shaker(at + b / 4, .05)
        if i % 4 == 0: strum(prog[(i // 4) % 4], at, .06)
        if i % 4 == 3: strum(prog[(i // 4) % 4][1:], at, .045, False)
        i += 1
    for a in (S['gr'], S['sd'], S['tl'], S['curb']): bell(84, a, .05, .9); whoosh(a - .2, .25, .08)
    crunch(S['gr'], 1.4, .1)
    for k in range(10): rim(S['tl'] + k * .07, .1)
    thud(S['curb'] + .45, .45)
    engine(S['car2'], 2.6, .12)
    for k, n in enumerate([76, 80, 83]): bell(n, S['car2'] + 1.3 + k * .08, .05, 1.2)
    i = 0
    while S['phone'] + i * b / 2 < S['end']:
        at = S['phone'] + i * b / 2
        if i % 2 == 0: kick(at, .55)
        shaker(at + b / 4, .04)
        if i % 4 == 0: strum([52, 59, 64, 68], at, .05)
        i += 1
    tap(S['phone'] + .5, .3); whoosh(19.7, .25, .1)
    jt = S['end']
    for k, n in enumerate([64, 68, 71, 76, 80, 83]): guitar(n, jt + .05 + k * .09, d=1.8, g=.09, pan=(-1) ** k * .3)
    pad([52, 59, 64, 68], jt + .1, DUR - jt, g=.12, cut=1600)

irt = t_(2.4); ir = rng.standard_normal(len(irt)) * np.exp(-irt * 2.6)
irL = lp(ir, 6000); irR = lp(np.roll(ir, 731), 6000); irL[:int(.012 * SR)] = 0; irR[:int(.017 * SR)] = 0
L += fftconvolve(hp(RL, 200), irL)[:N] * .18; R += fftconvolve(hp(RR, 200), irR)[:N] * .18
for ch in (L, R): ch[:] = hp(ch, 30)
m = max(np.abs(L).max(), np.abs(R).max()); L /= m; R /= m
L = np.tanh(L * 1.8) / np.tanh(1.8); R = np.tanh(R * 1.8) / np.tanh(1.8)
fade = np.clip((DUR - np.arange(N) / SR) / 1.0, 0, 1); L *= fade * .82; R *= fade * .82
pcm = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(OUT, 'wb') as w_: w_.setnchannels(2); w_.setsampwidth(2); w_.setframerate(SR); w_.writeframes(pcm.tobytes())
seg = np.stack([L, R], 1)
print('ok', OUT, [round(float(np.sqrt((seg[int(a * SR):int(min(DUR, a + 2) * SR)] ** 2).mean())), 2) for a in range(0, int(DUR), 2)])
