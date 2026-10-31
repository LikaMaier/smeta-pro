"""Звук «Раньше строили на века»: спокойный лоу-фай 72 BPM — мягкое электропиано, тёплый бас, пэд, тихие щётки, лёгкий треск пластинки. Без резких звуков. Инструменты — из audio-terrasy.py. Всё синтезировано.
python3 audio-krovlya.py out.wav"""
import sys, numpy as np, wave
OUT = sys.argv[1]
src = open(__file__.replace('audio-krovlya.py', 'audio-terrasy.py'), encoding='utf-8').read()
sys.argv = [sys.argv[0], OUT]
__file__ = __file__.replace('audio-krovlya.py', 'audio-terrasy.py')
exec(src.split('b = 60 / 80')[0].replace('DUR = 30.0', 'DUR = 20.5'))

b = 60 / 72
def rhodes(n, at, d=1.6, g=.06, pan=0.0):
    tt = t_(d); fr = f(n)
    x = np.sin(2 * np.pi * fr * tt + .8 * np.sin(2 * np.pi * fr * 2 * tt) * np.exp(-tt * 3)) * np.exp(-tt * 1.4)
    x *= 1 + .12 * np.sin(2 * np.pi * 4.5 * tt)
    add(lp(x, 2200) * np.minimum(1, tt / .005), at, g, pan); add(lp(x, 1800), at, g * .5, pan, REV)
def bass(n, at, d, g=.12):
    tt = t_(d); x = np.sin(2 * np.pi * f(n) * tt) * np.exp(-tt * 1.2) * np.minimum(1, tt / .01)
    add(lp(x, 400), at, g, 0)
def crackle(d, g=.006):
    x = np.zeros(int(d * SR)); idx = rng.integers(0, len(x), int(d * 40)); x[idx] = rng.uniform(-1, 1, len(idx))
    add(hp(x, 2000) + .15 * lp(rng.standard_normal(len(x)), 300), 0, g, 0)
# Fmaj7 — Em7 — Dm7 — Cmaj7 (спокойно, тепло)
CH = [(r + 3, [n + 3 for n in ns]) for r, ns in [(41, [53, 57, 60, 64]), (40, [52, 55, 59, 62]), (38, [50, 53, 57, 60]), (36, [48, 52, 55, 59])]]
MEL = [n + 3 for n in ([76, 74, 72, 74, 72, 71, 69, 67, 69, 72, 74, 76, 79, 77, 76, 74][10:] + [76, 74, 72, 74, 72, 71, 69, 67, 69, 72, 74, 76, 79, 77, 76, 74][:10])]
t = 0.0; bar = 0
while t < DUR - .5:
    root, ch = CH[bar % 4]
    bass(root, t, b * 2, .14); bass(root + 7, t + b * 2.5, b * 1.4, .09)
    for k, n in enumerate(ch): rhodes(n, t + k * .025, d=b * 4, g=.045, pan=-.3 + k * .2)
    rhodes(ch[2] + 12, t + b * 2, d=b * 2, g=.03, pan=.2)
    softpad([n + 12 for n in ch[:3]], t, b * 4 + .3, g=.035)
    for k in range(4):
        at = t + k * b
        if at < DUR - .3:
            if k in (0, 2): softkick(at, .16)
            brush(at + b / 2, .018); brush(at + b * .75, .01)
    for k in range(2):
        at = t + k * b * 2 + b * .5
        if at < DUR - 1: rhodes(MEL[(bar * 2 + k) % len(MEL)], at, d=b * 2.2, g=.055, pan=.15)
    t += 4 * b; bar += 1
crackle(DUR)
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
