"""Звук роликов про дренаж: python3 audio-drenazh.py dozhd|shagi out.wav
Инструменты берутся из audio-kapibara.py (всё до аранжировки)."""
import sys, re, numpy as np, wave
MODE, OUT = sys.argv[1], sys.argv[2]
src = open(__file__.replace('audio-drenazh.py', 'audio-kapibara.py'), encoding='utf-8').read()
lib = src.split('# ---- 1.')[0]
DUR = 20.0 if MODE == 'dozhd' else 23.5
lib = re.sub(r'DUR = [\d.]+', f'DUR = {DUR}', lib, count=1)
exec(lib)

def rain_noise(at, d, g):
    x = rng.standard_normal(int(d * SR)); y = hp(lp(x, 6000), 900) * .6 + lp(x, 500) * .25
    drops = (rng.random(len(x)) > .9985) * rng.standard_normal(len(x)) * 3
    y += hp(drops, 2000)
    e = np.minimum(1, np.minimum(t_(d) / .6, (d - t_(d)) / .5))
    add(y * e, at, g, -.3); add(y * e, at, g, .3)
def lofi(t0, t1, bpm, chords, roots, g=1.0):
    b = 60 / bpm; i = 0
    while t0 + i * b < t1:
        at = t0 + i * b; c = (i // 2) % len(chords)
        if i % 2 == 0:
            for k2, n in enumerate(chords[c]): rhodes(n, at + k2 * .015, d=b * 2.1, g=.08 * g, pan=-.3 + k2 * .15)
            add(np.sin(2 * np.pi * f(roots[c]) * t_(b * 1.8)) * adsr(int(b * 1.8 * SR), .02, .2, .7, .2), at, .24 * g)
            kick(at, .75 * g)
        else: clap(at, .5 * g)
        hat(at + b * .5, .06 * g, .04)
        i += 1
def buzz(at, g=.18):
    t = t_(.32); x = np.sign(np.sin(2 * np.pi * 110 * t)) * .6 + saw(116, .32) * .4
    add(lp(x, 1500) * adsr(len(t), .005, .05, .9, .05), at, g)
def crunch(at, d, g=.12):
    x = rng.standard_normal(int(d * SR)) * (rng.random(int(d * SR)) > .97)
    add(bp(x, 800, 5000) * np.sin(np.pi * t_(d) / d), at, g, .2)
def jingle(t0):
    for k, n in enumerate([60, 64, 67, 72, 76, 79]): pluck(n, t0 + .05 + k * .09, d=.6, g=.1, pan=(-1) ** k * .3, rev=.8, bright=5000)
    bell(84, t0 + .6, .12, 2.2); pad([48, 55, 60, 64], t0 + .1, DUR - t0, g=.14, cut=1800)

if MODE == 'dozhd':
    rain_noise(0, 14.3, .22)
    pad([45, 52, 57, 60], 0, 4.0, g=.16, cut=700); pad([41, 48, 53, 57], 3.9, 4.0, g=.16, cut=700)
    for k, n in enumerate([69, 72, 76, 74, 72, 69, 67, 64]): pluck(n, .3 + k * .9, d=.8, g=.08, pan=.2, rev=.9, bright=2000)
    taiko(5.2, .45); thud(7.0, .4)
    riser(7.2, .7, .14); crash(8.0, .25); whoosh(7.85, .3, .2)
    lofi(8.0, 17.6, 92, [[53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62], [57, 60, 64, 67]], [41, 43, 40, 45])
    for k in range(10): bubble(9.6 + k * .4, .06)
    for a in (15.5, 16.6): tap(a - .5, .3); whoosh(a - .2, .25, .12)
    for k, n in enumerate([84, 88, 91]): bell(n, 13.0 + k * .08, .05, 1.2)
    jingle(17.6)
else:
    S = dict(dig=2.2, geo=5.0, g1=7.4, pipe=9.8, g2=12.0, top=14.6, err=16.4, phone=19.4, end=21.4)
    for k, n in enumerate([72, 76, 79]): pluck(n, .1 + k * .12, d=.5, g=.11, rev=.7, bright=4500)
    lofi(0.2, 16.3, 100, [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67], [52, 55, 59, 64]], [45, 41, 43, 40])
    for k, a in enumerate([S['dig'], S['geo'], S['g1'], S['pipe'], S['g2'], S['top']]):
        bell(79 + [0, 2, 4, 5, 7, 12][k], a, .07, 1.0); whoosh(a - .15, .25, .1)
    for k in range(6): thud(S['dig'] + .2 + k * .28, .25)
    crunch(S['g1'], 1.9); crunch(S['g2'], 1.9)
    thud(S['pipe'] + .7, .55)
    for k in range(8): bubble(S['top'] + 1 + k * .2, .06)
    pad([45, 48, 52], S['err'], 3.0, g=.14, cut=600)
    for a in (S['err'] + .3, S['err'] + 1.1, S['err'] + 1.9): buzz(a)
    lofi(S['phone'], S['end'], 100, [[53, 57, 60, 64], [55, 59, 62, 67]], [41, 43], g=.8)
    tap(S['phone'] + .5, .3); whoosh(20.2, .25, .12)
    jingle(S['end'])

# ревербератор и мастер — как в audio-kapibara.py
irt = t_(2.4); ir = rng.standard_normal(len(irt)) * np.exp(-irt * 2.6)
irL = lp(ir, 6000); irR = lp(np.roll(ir, 731), 6000); irL[:int(.012 * SR)] = 0; irR[:int(.017 * SR)] = 0
L += fftconvolve(hp(RL, 200), irL)[:N] * .18; R += fftconvolve(hp(RR, 200), irR)[:N] * .18
for ch in (L, R): ch[:] = hp(ch, 30)
m = max(np.abs(L).max(), np.abs(R).max()); L /= m; R /= m
L = np.tanh(L * 1.8) / np.tanh(1.8); R = np.tanh(R * 1.8) / np.tanh(1.8)
fade = np.clip((DUR - np.arange(N) / SR) / 1.0, 0, 1); L *= fade * .9; R *= fade * .9
pcm = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(OUT, 'wb') as w_: w_.setnchannels(2); w_.setsampwidth(2); w_.setframerate(SR); w_.writeframes(pcm.tobytes())
seg = np.stack([L, R], 1)
print('ok', OUT, [round(float(np.sqrt((seg[int(a * SR):int(min(DUR, a + 2) * SR)] ** 2).mean())), 2) for a in range(0, int(DUR), 2)])
