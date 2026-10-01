# Original 128 BPM track, cut-synced: intro bar, drop at 1.875s, fills before each scene change, outro hold.
import numpy as np, wave
SR = 48000; BPM = 128; B = 60 / BPM; BAR = 4 * B; DUR = 29.5
N = int(SR * DUR); L = np.zeros(N); R = np.zeros(N)
t_ = lambda d: np.arange(int(SR * d)) / SR
rng = np.random.default_rng(7)
def add(sig, at, pan=0.0, g=1.0):
    i = int(at * SR); j = min(N, i + len(sig))
    if i >= N: return
    s = sig[: j - i] * g; L[i:j] += s * (1 - max(0, pan)); R[i:j] += s * (1 + min(0, pan))
def kick():
    t = t_(0.42); f = 45 + 110 * np.exp(-t * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7.5) + 0.3 * np.sin(ph) * np.exp(-t * 60)
def clap():
    t = t_(0.25); n = rng.standard_normal(len(t)); n = np.diff(n, prepend=0)
    env = np.exp(-t * 18) * (1 + 0.6 * ((t % 0.011) < 0.004) * (t < 0.03))
    return n * env * 0.35
def hat(open_=False):
    t = t_(0.18 if open_ else 0.05); n = np.diff(rng.standard_normal(len(t)), prepend=0); n = np.diff(n, prepend=0)
    return n * np.exp(-t * (14 if open_ else 70)) * 0.12
def saw(f, d, det=(0,)):
    t = t_(d); return sum(2 * ((t * f * (1 + x)) % 1) - 1 for x in det) / len(det)
from scipy.signal import lfilter
def lp(x, a):  # one-pole low-pass; a may sweep (array) for risers
    if np.isscalar(a): return lfilter([a], [1, a - 1], x)
    y = np.zeros_like(x); acc = 0.0
    for i in range(len(x)): acc += a[i] * (x[i] - acc); y[i] = acc
    return y
def crash():
    t = t_(1.8); n = np.diff(rng.standard_normal(len(t)), prepend=0); return n * np.exp(-t * 2.2) * 0.12
def riser(d):
    t = t_(d); n = rng.standard_normal(len(t)); k = t / d
    return lp(n, 0.02 + 0.4 * k ** 2) * k ** 2 * 0.5
def impact():
    t = t_(1.2); return np.sin(2 * np.pi * np.cumsum(60 * np.exp(-t * 3) + 30) / SR) * np.exp(-t * 3) * 0.9
# Am  F  C  G  (roots in Hz), one chord per bar
prog = [(110.0, [220.0, 261.6, 329.6]), (87.31, [174.6, 220.0, 261.6]), (130.8, [261.6, 329.6, 392.0]), (98.0, [196.0, 246.9, 293.7])]
DROP = BAR; END = 26.25
# intro bar: pad + riser
for k, (root, ch) in enumerate(prog[:1]):
    pad = sum(saw(f, BAR, (-.004, 0, .005)) for f in ch) / 3
    add(lp(pad, 0.03) * np.minimum(1, t_(BAR) / BAR * 2), 0, g=0.35)
add(riser(BAR), 0, g=0.6)
add(impact(), DROP, g=0.9); add(crash(), DROP)
bar = 0; t0 = DROP
while t0 < END - 1e-6:
    root, ch = prog[bar % 4]
    pad = lp(sum(saw(f, BAR, (-.004, 0, .005)) for f in ch) / 3, 0.05)
    duck = np.ones(int(BAR * SR))
    for b in range(4):
        i = int(b * B * SR); m = min(len(duck) - i, int(0.22 * SR)); duck[i:i + m] = np.linspace(0.15, 1, m) ** 1.5
    add(pad * duck, t0, -0.2, 0.22); add(pad * duck, t0, 0.2, 0.22)
    for b in range(4):
        tb = t0 + b * B
        add(kick(), tb, g=0.95)
        if b in (1, 3): add(clap(), tb, g=1.0)
        add(hat(), tb + B / 2, 0.3); add(hat(), tb + B / 4, -0.3, 0.5); add(hat(), tb + 3 * B / 4, -0.3, 0.5)
        # offbeat bass
        bs = lp(saw(root, B * 0.45, (-.003, .003)), 0.08) * np.exp(-t_(B * 0.45) * 4)
        add(bs, tb + B / 2, g=0.6)
        # arp stab on 16ths, second half of each bar
        if b >= 2:
            for s in range(2):
                f = ch[(b * 2 + s) % 3] * 2
                add(lp(saw(f, 0.12, (-.006, .006)), 0.2) * np.exp(-t_(0.12) * 22), tb + s * B / 2 + B / 4, 0.4 if s else -0.4, 0.12)
    bar += 1; t0 += BAR
# scene changes at 9.375 / 16.875 / 22.5: riser into a crash; snare roll in the last beat before
for cut in (7.5, 15.0, 18.75, 22.5):
    add(riser(B * 2), cut - B * 2, g=0.35); add(crash(), cut); add(impact(), cut, g=0.35)
    for s in range(8): add(clap(), cut - B + s * B / 8, g=0.25 + s * 0.06)
# outro: big chord hold with fade
root, ch = prog[0]; d = DUR - END
pad = lp(sum(saw(f, d, (-.004, 0, .005)) for f in ch + [440.0]) / 4, 0.05)
add(pad * np.linspace(1, 0, len(pad)) ** 1.2, END, g=0.4); add(impact(), END, g=0.8); add(crash(), END)
add(lp(saw(55.0, d, (0,)), 0.05) * np.linspace(1, 0, int(d * SR)), END, g=0.4)
mix = np.stack([L, R], 1); mix = np.tanh(mix * 1.1); mix /= np.abs(mix).max() / 0.89
fade = np.ones(N); fade[-int(0.3 * SR):] = np.linspace(1, 0, int(0.3 * SR)); mix *= fade[:, None]
with wave.open('music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('ok', DUR)
