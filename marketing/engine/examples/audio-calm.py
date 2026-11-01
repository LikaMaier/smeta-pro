"""Очень спокойная музыка (эмбиент-пианино 56 BPM, без барабанов): python3 audio-calm.py out.wav <длительность> [сдвиг тональности]: спокойный лоу-фай 72 BPM — мягкое электропиано, тёплый бас, пэд, тихие щётки, лёгкий треск пластинки. Без резких звуков. Инструменты — из audio-terrasy.py. Всё синтезировано.
python3 audio-calm.py out.wav"""
import sys, numpy as np, wave
OUT = sys.argv[1]; ARGV = list(sys.argv)
src = open(__file__.replace('audio-calm.py', 'audio-terrasy.py'), encoding='utf-8').read()
sys.argv = [sys.argv[0], OUT]
__file__ = __file__.replace('audio-calm.py', 'audio-terrasy.py')
exec(src.split('b = 60 / 80')[0].replace('DUR = 30.0', 'DUR = float(ARGV[2]) if len(ARGV) > 2 else 24.0'))

TR = int(ARGV[3]) if len(ARGV) > 3 else 0
b = 60 / 56
def epiano(n, at, d=3.0, g=.05, pan=0.0):
    tt = t_(d); fr = f(n + TR)
    x = (np.sin(2 * np.pi * fr * tt) + .25 * np.sin(4 * np.pi * fr * tt) * np.exp(-tt * 2)) * np.exp(-tt * .9)
    add(lp(x, 1600) * np.minimum(1, tt / .02), at, g, pan); add(lp(x, 1200), at, g * .7, pan, REV)
# Cmaj7 — Am7 — Fmaj7 — G6, медленно, мягко
CH = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]]
MEL = [76, 74, 72, None, 72, 71, 69, None, 69, 71, 72, 74, 76, None, 74, None]
t = 0.0; bar = 0
while t < DUR - .5:
    ch = CH[bar % 4]
    softpad([n + TR + 12 for n in ch[1:]], t, b * 4 + 1.2, g=.05)
    epiano(ch[0], t, d=b * 4, g=.06)
    for k, n in enumerate(ch[1:]): epiano(n, t + .35 + k * .28, d=b * 3.5, g=.035, pan=-.25 + k * .25)
    for k in range(2):
        m = MEL[(bar * 2 + k) % len(MEL)]
        if m and t + b * (1 + 2 * k) < DUR - 1.5: epiano(m, t + b * (1 + 2 * k), d=b * 3, g=.045, pan=.15)
    t += 4 * b; bar += 1
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
