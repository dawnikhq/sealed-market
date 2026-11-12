#!/usr/bin/env python3
"""Build the film's soundtrack: a music bed and designed sound effects, no voiceover.

Everything is synthesised here with numpy, so there is nothing to license.
Event times are copied from assets/film.js; if the picture is re-timed, change them here too.

Outputs (48 kHz stereo, 70 s):  audio/music.wav  audio/sfx.wav  audio/mix.wav
Run:  python3 audio/make_audio.py
"""
import os
import wave

import numpy as np

SR = 48000
DUR = 70.0
N = int(SR * DUR)
BEAT = 0.6  # 100 BPM
LIFT = 14.4  # the product reveal
rng = np.random.default_rng(7)
HERE = os.path.dirname(os.path.abspath(__file__))


# ── helpers ────────────────────────────────────────────────────────────────
def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def band(x, lo, hi):
    """Zero-phase band-pass by FFT masking with soft edges."""
    n = len(x)
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    mask = 1 / (1 + (lo / np.maximum(f, 1e-6)) ** 6) * 1 / (1 + (f / hi) ** 6)
    return np.fft.irfft(spec * mask, n)


def env_ad(dur, attack, decay_k):
    t = t_axis(dur)
    a = np.minimum(1, t / max(attack, 1e-4))
    return a * np.exp(-t * decay_k)


def place(buf, mono, at, gain=1.0, pan=0.0):
    """Add a mono sound into the stereo buffer at time `at` (seconds). pan: -1 left .. 1 right."""
    i = int(at * SR)
    if i >= N or i < 0:
        return
    mono = mono[: N - i]
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    buf[i : i + len(mono), 0] += mono * gain * l
    buf[i : i + len(mono), 1] += mono * gain * r


def tone(freq, dur, decay=6.0, attack=0.004, harm=(1.0,), detune=0.0):
    t = t_axis(dur)
    out = np.zeros_like(t)
    for k, a in enumerate(harm, start=1):
        out += a * np.sin(2 * np.pi * freq * k * (1 + detune * k) * t)
    return out * env_ad(dur, attack, decay)


def glide(f0, f1, dur, decay=3.0, attack=0.01):
    t = t_axis(dur)
    f = f0 * (f1 / f0) ** (t / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env_ad(dur, attack, decay)


def thud(dur=0.5, f0=130, f1=42, decay=9.0, click=0.35):
    t = t_axis(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * decay)
    c = band(rng.standard_normal(len(t)), 900, 6000) * np.exp(-t * 160) * click
    return body + c


def whoosh(dur, lo0, lo1, peak=0.5, q=2.2):
    """Filtered-noise sweep: band centre moves lo0 → lo1, loudness peaks at `peak` of the way."""
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    steps = 10
    out = np.zeros(n)
    t = np.linspace(0, 1, n)
    for s in range(steps):
        c = lo0 * (lo1 / lo0) ** ((s + 0.5) / steps)
        w = np.clip(1 - np.abs(t * steps - (s + 0.5)) / 1.0, 0, 1)
        out += band(noise, c / q, c * q) * w
    e = np.exp(-(((t - peak) / 0.24) ** 2))
    return out * e


def paper(dur=0.3, bright=5200):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    x = band(rng.standard_normal(n), 1400, bright)
    return x * np.sin(np.pi * t) ** 1.5


def click(f=2400, dur=0.05):
    t = t_axis(dur)
    return (np.sin(2 * np.pi * f * t) + 0.5 * band(rng.standard_normal(len(t)), 2000, 9000)) * np.exp(-t * 110)


def glass(f, dur=1.4, decay=3.2):
    """Inharmonic glassy ping."""
    return tone(f, dur, decay, 0.002, (1.0,)) + 0.45 * tone(f * 2.76, dur, decay * 1.8) + 0.2 * tone(f * 5.4, dur, decay * 3)


def reverb(stereo, seconds=2.6, wet=0.25, seed=3):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(stereo)
    size = 1 << int(np.ceil(np.log2(len(stereo) + n)))
    for ch in range(2):
        ir = band(r.standard_normal(n), 250, 5200) * np.exp(-t * (5.2 / seconds))
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt(np.sum(ir**2))
        conv = np.fft.irfft(np.fft.rfft(stereo[:, ch], size) * np.fft.rfft(ir, size), size)[: len(stereo)]
        out[:, ch] = conv
    return stereo * (1 - wet * 0.3) + out * wet


def write_wav(name, stereo):
    x = np.clip(stereo, -1, 1)
    pcm = (x * 32767).astype('<i2')
    with wave.open(os.path.join(HERE, name), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# ── music ──────────────────────────────────────────────────────────────────
music = np.zeros((N, 2))
T = np.arange(N) / SR

# Section A (0 – 14.4): tension. A low D drone, a slow heartbeat, air.
drone = np.zeros(N)
for f, a in ((midi(26), 0.5), (midi(38), 0.32), (midi(38) * 1.006, 0.2), (midi(45), 0.1)):
    drone += a * np.sin(2 * np.pi * f * T + 0.3 * np.sin(2 * np.pi * 0.11 * T))
a_env = np.clip(T / 1.5, 0, 1) * np.clip((LIFT + 0.6 - T) / 0.6, 0, 1)
music[:, 0] += drone * a_env * 0.2
music[:, 1] += drone * a_env * 0.2
for b in np.arange(0, LIFT - 0.3, BEAT * 2):
    place(music, thud(0.5, 70, 38, 10, 0.05), b, 0.34)
    place(music, thud(0.4, 62, 36, 12, 0.03), b + 0.26, 0.2)
air = band(rng.standard_normal(N), 3500, 9000) * 0.012 * a_env * (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * T))
music[:, 0] += air
music[:, 1] += np.roll(air, 600)
# Riser into the lift.
ris = whoosh(3.4, 300, 5200, peak=0.96, q=2.6) * np.linspace(0, 1, int(3.4 * SR)) ** 2
place(music, ris, LIFT - 3.4, 0.22, -0.2)
place(music, ris[::-1][: int(0.5 * SR)] * 0.0, LIFT, 0)

# Section B (14.4 – 60.6): the lift. Dm – Bb – F – C, one chord every four beats.
CHORDS = [
    (38, [62, 65, 69, 72]),  # Dm (add 7)
    (34, [58, 62, 65, 70]),  # Bb
    (41, [60, 65, 69, 72]),  # F
    (36, [60, 64, 67, 72]),  # C
]
B_END = 60.6
bar = BEAT * 4


def section_gain(t):
    """Arrangement over time: muffled while inside the vault, fuller for the payout."""
    if 21.3 <= t < 26.3:
        return 0.45
    return 1.0


pad = np.zeros((N, 2))
arp = np.zeros((N, 2))
bass = np.zeros((N, 2))
drums = np.zeros((N, 2))
k = 0
tbar = LIFT
while tbar < B_END - 0.01:
    root, notes = CHORDS[k % 4]
    g = section_gain(tbar)
    # Pad: soft, low-passed so it stays out of a voice's way.
    chord = np.zeros(int((bar + 0.5) * SR))
    tt = t_axis(bar + 0.5)
    for n_ in notes:
        f = midi(n_ - 12)
        chord += np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * f * 2 * tt) + 0.5 * np.sin(2 * np.pi * f * 1.004 * tt)
    e = np.minimum(1, tt / 0.5) * np.minimum(1, (bar + 0.5 - tt) / 0.5)
    place(pad, chord * e, tbar, 0.03 * (0.7 + 0.3 * g), -0.25)
    place(pad, np.roll(chord, 300) * e, tbar, 0.03 * (0.7 + 0.3 * g), 0.25)
    # Bass: root on beats one and three.
    for bb in (0, 2):
        place(bass, tone(midi(root - 12), 1.1, 2.6, 0.01, (1, 0.35, 0.1)), tbar + bb * BEAT, 0.3 * g)
    # Arpeggio: eighth notes, plucked.
    full = tbar >= 26.3
    busy = tbar >= 45.6
    pattern = [0, 1, 2, 3, 2, 1, 2, 3] if not busy else [0, 2, 1, 3, 2, 3, 1, 2]
    for s, idx in enumerate(pattern):
        when = tbar + s * BEAT / 2
        if when >= B_END:
            break
        note = notes[idx] + (12 if busy and s % 4 == 3 else 0)
        pl = tone(midi(note), 0.7, 7.5, 0.003, (1, 0.4, 0.16, 0.06))
        place(arp, pl, when, (0.085 if full else 0.06) * g, 0.5 * np.sin(s * 1.7))
    # Drums: soft kick on every beat, a light tick on the off-beats later on.
    if not (21.3 <= tbar < 26.3):
        for bb in range(4):
            place(drums, thud(0.4, 95, 44, 13, 0.12), tbar + bb * BEAT, 0.42 if bb % 2 == 0 else 0.3)
            if tbar >= 30.0:
                hat = band(rng.standard_normal(int(0.06 * SR)), 6000, 12000) * np.exp(-t_axis(0.06) * 90)
                place(drums, hat, tbar + bb * BEAT + BEAT / 2, 0.05 if not busy else 0.075, 0.3)
    k += 1
    tbar += bar

# Inside the vault the bed is muffled: low-pass that stretch of the arpeggio.
i0, i1 = int(21.3 * SR), int(26.3 * SR)
for ch in range(2):
    arp[i0:i1, ch] = band(arp[i0:i1, ch], 60, 700)
music += pad + arp + bass + drums

# Section C (60.6 – 70): everything falls away, then one resolved chord on the mark.
tt = t_axis(9.2)
final = np.zeros(len(tt))
for n_, a in ((38, 1.0), (50, 0.8), (57, 0.6), (62, 0.55), (66, 0.5), (69, 0.4), (74, 0.25)):  # D major
    f = midi(n_)
    final += a * (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 2.001 * tt))
final *= np.minimum(1, tt / 0.03) * np.exp(-tt * 0.55)
place(music, final, 63.0, 0.075, -0.2)
place(music, np.roll(final, 420), 63.0, 0.075, 0.2)
hold = np.zeros(N)
seg = (T > 60.3) & (T < 63.2)
hold[seg] = np.sin(2 * np.pi * midi(38) * T[seg]) * np.clip((T[seg] - 60.3) / 0.6, 0, 1) * np.clip((63.2 - T[seg]) / 0.3, 0, 1)
music[:, 0] += hold * 0.12
music[:, 1] += hold * 0.12

music = reverb(music, 2.8, 0.3, seed=11)

# ── sound effects ──────────────────────────────────────────────────────────
sfx = np.zeros((N, 2))


def coin_ping(at, f=2100, gain=0.3, pan=0.0):
    place(sfx, glass(f, 0.9, 6), at, gain, pan)


def impact(at, gain=0.8, pan=0.0, heavy=False):
    place(sfx, thud(0.7 if heavy else 0.45, 150 if heavy else 120, 36 if heavy else 46, 6 if heavy else 10, 0.5), at, gain, pan)


# Shot 1: the sheet slides, then copies fan out.
place(sfx, paper(0.55), 0.45, 0.4, -0.2)
place(sfx, thud(0.25, 90, 50, 18, 0.2), 1.05, 0.3, 0.2)
for i in range(10):
    place(sfx, paper(0.16, 7000), 1.2 + i * 0.055, 0.3, -0.6 + i * 0.13)
    place(sfx, click(1700 + i * 90, 0.03), 1.24 + i * 0.055, 0.08, -0.6 + i * 0.13)
# Transition 1: whip pan.
place(sfx, whoosh(0.75, 500, 4200, 0.5), 2.62, 0.75, 0.0)
place(sfx, thud(0.3, 80, 44, 14, 0.1), 3.32, 0.35, 0.3)
# Shot 2: the coin hesitates, the folder snaps shut.
place(sfx, paper(0.7, 3000), 3.7, 0.16, -0.3)
for at in (4.95, 5.6, 6.0, 6.65):
    place(sfx, click(3200, 0.04), at, 0.1, -0.1)
place(sfx, paper(0.6, 4200), 6.3, 0.22, 0.3)
impact(7.5, 0.85, 0.3)
place(sfx, click(1500, 0.07), 7.5, 0.5, 0.3)
coin_ping(7.55, 1700, 0.12, -0.2)
# Transition 2: pan back, the copies gather.
place(sfx, whoosh(0.95, 3800, 420, 0.5), 8.65, 0.7, 0.0)
for i in range(10):
    place(sfx, paper(0.14, 7000), 9.12 + i * 0.05, 0.22 + i * 0.012, 0.6 - i * 0.12)
impact(9.84, 0.7)
# Shot 3: the vault arrives, the sheet drops in, the lid shuts, the seal stamps.
place(sfx, whoosh(1.0, 180, 900, 0.6, 3.0), 11.9, 0.4, 0.0)
place(sfx, glide(70, 110, 0.9, 2.0, 0.3), 12.05, 0.3)
place(sfx, click(900, 0.08), 12.6, 0.4)
place(sfx, paper(0.3, 5000), 12.82, 0.25)
place(sfx, paper(0.62, 4200) * np.linspace(1, 0.4, int(0.62 * SR)), 13.12, 0.5)
impact(13.85, 1.0, 0.0, heavy=True)
place(sfx, click(700, 0.09), 13.85, 0.5)
place(sfx, glide(900, 2400, 0.42, 4, 0.05) * 0.5 + band(rng.standard_normal(int(0.42 * SR)), 5000, 11000) * np.linspace(0, 1, int(0.42 * SR)) * 0.25, 13.98, 0.16)
impact(14.4, 0.95, 0.0, heavy=True)
place(sfx, glass(midi(86), 2.4, 1.6), 14.4, 0.2, -0.1)
place(sfx, glass(midi(81), 2.4, 1.8), 14.4, 0.16, 0.1)
# Transition 3 and shot 4: the seller's screen, encrypt, rows leave as light.
place(sfx, whoosh(1.0, 400, 2600, 0.5), 16.15, 0.55, -0.3)
place(sfx, click(1900, 0.05), 17.7, 0.45, -0.4)
place(sfx, thud(0.18, 110, 70, 22, 0.1), 17.7, 0.25, -0.4)
r2 = np.random.default_rng(21)
for i in range(46):
    at = 17.9 + i * 0.024 + r2.random() * 0.01
    place(sfx, click(2600 + r2.random() * 3600, 0.022), at, 0.07, -0.55 + r2.random() * 0.3)
place(sfx, glass(midi(88), 0.6, 7), 19.05, 0.12, -0.4)
for i in range(5):
    at = 19.1 + i * 0.26
    place(sfx, whoosh(0.5, 1800, 7000, 0.7, 1.8), at, 0.3, -0.5 + i * 0.05)
    place(sfx, glass(midi(79 + i * 2), 0.8, 6), at + 0.48, 0.16, 0.25)
# Transition 4: push through the glass.
place(sfx, whoosh(0.85, 300, 3000, 0.75, 2.6), 20.8, 0.8)
place(sfx, thud(1.4, 80, 30, 2.6, 0.05), 21.45, 0.75)
# Shot 5: scanned inside; bars; pull out; only the ring leaves.
for at in (22.2, 23.4):
    place(sfx, glide(420, 1250, 1.2, 0.9, 0.3) * 0.5 + band(rng.standard_normal(int(1.2 * SR)), 3000, 8000) * np.sin(np.pi * np.linspace(0, 1, int(1.2 * SR))) * 0.2, at, 0.13, -0.3)
for i in range(5):
    place(sfx, click(1500 + i * 180, 0.035), 23.0 + i * 0.3, 0.2, 0.4)
    place(sfx, glide(500 + i * 60, 900 + i * 80, 0.5, 5, 0.02), 23.0 + i * 0.3, 0.05, 0.4)
place(sfx, whoosh(0.9, 2600, 300, 0.4, 2.6), 25.7, 0.75)
place(sfx, thud(0.5, 90, 40, 9, 0.1), 26.35, 0.45)
place(sfx, glide(midi(62), midi(74), 0.8, 2.0, 0.05), 26.4, 0.12, 0.2)
place(sfx, glide(midi(74), midi(86), 1.7, 0.4, 0.4) * 0.5 + glass(midi(86), 1.7, 1.2) * 0.25, 26.75, 0.1, 0.1)
place(sfx, glass(midi(90), 1.6, 2.4), 28.45, 0.22, 0.1)
place(sfx, glass(midi(86), 1.6, 2.4), 28.45, 0.16, -0.1)
# Transition 5: the ring travels to the report and lands on it.
place(sfx, whoosh(0.95, 600, 3200, 0.5), 29.35, 0.6, -0.2)
place(sfx, click(1300, 0.06), 30.3, 0.4, -0.4)
place(sfx, thud(0.3, 100, 52, 14, 0.15), 30.3, 0.4, -0.4)
# Shot 6: the report fills in.
for i, at in enumerate((30.5, 30.64, 30.78)):
    place(sfx, glide(700 + i * 160, 1100 + i * 200, 0.16, 16, 0.004), at, 0.16, -0.3)
for i, at in enumerate((31.4, 31.7)):
    place(sfx, click(2200, 0.04), at, 0.24, -0.35)
    place(sfx, glass(midi(84 + i * 3), 0.5, 9), at, 0.08, -0.35)
place(sfx, whoosh(0.5, 500, 1800, 0.6, 2.2), 32.3, 0.22, -0.3)
for i in range(3):
    place(sfx, click(1500 + i * 180, 0.035), 32.8 + i * 0.25, 0.16, -0.2)
# Transition 6: the score becomes a coin and drops into escrow.
place(sfx, whoosh(0.55, 4000, 700, 0.75, 2.2), 36.2, 0.45, -0.4)
coin_ping(36.72, 2400, 0.3, -0.3)
place(sfx, whoosh(1.0, 500, 2400, 0.55), 36.6, 0.5, 0.0)
place(sfx, whoosh(0.4, 900, 3600, 0.9, 2.0), 37.4, 0.4, 0.3)
impact(37.8, 0.75, 0.3)
coin_ping(37.8, 1560, 0.42, 0.3)
coin_ping(37.8, 2340, 0.22, 0.3)
coin_ping(38.03, 1650, 0.16, 0.3)
coin_ping(38.3, 1700, 0.07, 0.3)
# Shot 7: a question goes in, one number comes out; a narrow question is refused.
place(sfx, paper(0.6), 40.2, 0.36, -0.4)
place(sfx, paper(0.42, 6500), 40.72, 0.3, 0.1)
place(sfx, thud(0.6, 95, 40, 6, 0.1), 41.12, 0.55, 0.2)
place(sfx, whoosh(0.7, 900, 5000, 0.4, 2.2), 41.1, 0.4, -0.2)
r3 = np.random.default_rng(5)
for i in range(22):
    at = 41.2 + (i / 22) ** 1.6 * 1.0
    place(sfx, click(1800 + i * 70, 0.02), at, 0.07, -0.4)
place(sfx, glass(midi(81), 1.6, 2.2), 42.2, 0.2, -0.4)
place(sfx, glass(midi(88), 1.6, 2.2), 42.2, 0.12, -0.3)
place(sfx, paper(0.62), 43.15, 0.36, -0.4)
impact(43.78, 1.0, 0.3, heavy=True)
buzz = np.sign(np.sin(2 * np.pi * 82 * t_axis(0.32))) * np.exp(-t_axis(0.32) * 9)
place(sfx, band(buzz, 60, 900), 43.78, 0.28, 0.3)
place(sfx, click(520, 0.1), 43.78, 0.55, 0.3)
place(sfx, paper(0.2, 6000), 44.1, 0.2, -0.1)
place(sfx, thud(0.2, 140, 80, 26, 0.3), 44.3, 0.18, -0.1)
place(sfx, click(1200, 0.05), 44.9, 0.2, 0.3)
# Transition 7: the slit's light opens to white.
place(sfx, whoosh(0.5, 800, 9000, 0.95, 2.4) * np.linspace(0, 1, int(0.5 * SR)) ** 1.5, 45.1, 0.85)
place(sfx, thud(1.2, 110, 34, 3.2, 0.1), 45.58, 0.7)
place(sfx, glass(midi(93), 2.0, 1.8), 45.58, 0.13)
# Shot 8: the payment splits three ways; then the refund.
place(sfx, glide(1500, 700, 0.3, 8, 0.02), 46.1, 0.12, -0.3)
ROW = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2]
for i, r in enumerate(ROW):
    coin_ping(46.4 + i * 0.105 + 0.6, [midi(86), midi(81), midi(77)][r] * (1 + 0.004 * (i % 3)), 0.15, 0.45)
    place(sfx, whoosh(0.3, 1500, 5000, 0.8, 1.8), 46.4 + i * 0.105 + 0.25, 0.08, 0.1)
place(sfx, whoosh(1.1, 500, 2600, 0.5), 47.7, 0.5, 0.2)
place(sfx, glass(midi(93), 1.5, 2.6), 48.62, 0.2, -0.3)
place(sfx, glass(midi(86), 1.5, 2.6), 48.62, 0.14, -0.2)
place(sfx, whoosh(0.9, 2600, 500, 0.5), 50.1, 0.5, 0.0)
place(sfx, whoosh(0.4, 900, 3600, 0.9, 2.0), 50.6, 0.35, 0.3)
impact(51.0, 0.7, 0.3)
coin_ping(51.0, 1560, 0.4, 0.3)
coin_ping(51.23, 1650, 0.14, 0.3)
place(sfx, glide(midi(69), midi(62), 0.8, 2.6, 0.05), 51.15, 0.16, 0.0)
place(sfx, click(900, 0.06), 51.55, 0.2, 0.0)
place(sfx, paper(0.2, 3000), 52.0, 0.12, 0.3)
place(sfx, whoosh(0.72, 700, 3800, 0.7), 52.15, 0.6, -0.5)
coin_ping(52.25, 1900, 0.14, -0.3)
# Transition 8 and shot 9: tilt up; the bot ticks through its six steps.
place(sfx, whoosh(0.75, 500, 4200, 0.5), 53.02, 0.7)
place(sfx, thud(0.3, 80, 44, 14, 0.1), 53.7, 0.3, -0.3)
for i in range(6):
    at = 54.0 + i * 0.9
    place(sfx, click(1800, 0.04), at, 0.3, -0.35)
    place(sfx, glass(midi([74, 77, 79, 81, 84, 86][i]), 0.9, 5), at, 0.15, -0.35)
# Transition 9 and shot 10: dolly out; the vault becomes the mark.
place(sfx, whoosh(1.2, 3200, 260, 0.45, 2.6), 59.6, 0.65)
place(sfx, whoosh(1.0, 300, 900, 0.6, 3.0), 61.0, 0.3)
place(sfx, whoosh(0.55, 700, 5200, 0.9, 2.2) * np.linspace(0.2, 1, int(0.55 * SR)), 61.95, 0.5)
place(sfx, click(2600, 0.05), 62.44, 0.35)
coin_ping(62.44, midi(86), 0.16)
place(sfx, glide(900, 2400, 0.5, 3, 0.05), 62.5, 0.07)
impact(63.0, 1.0, 0.0, heavy=True)
place(sfx, glass(midi(86), 3.0, 1.2), 63.0, 0.2, -0.15)
place(sfx, glass(midi(90), 3.0, 1.2), 63.0, 0.16, 0.15)
place(sfx, glass(midi(93), 3.0, 1.4), 63.0, 0.1, 0.0)
for at in (63.9, 65.1, 65.7):
    place(sfx, glide(800, 1300, 0.2, 14, 0.004), at, 0.08)

sfx = reverb(sfx, 1.6, 0.18, seed=5)

# ── mix ────────────────────────────────────────────────────────────────────
fade = np.clip(T / 0.4, 0, 1) * np.clip((DUR - 0.15 - T) / 1.1, 0, 1)
music *= fade[:, None]
sfx *= fade[:, None]


def norm(x, peak):
    return x * (peak / np.max(np.abs(x)))


music = norm(music, 0.5)
sfx = norm(sfx, 0.75)
mix = music * 0.85 + sfx * 0.9
mix = np.tanh(mix * 1.15) / np.tanh(1.15)  # gentle limiting
mix = norm(mix, 0.84)

write_wav('music.wav', norm(music, 0.84))
write_wav('sfx.wav', norm(sfx, 0.84))
write_wav('mix.wav', mix)
rms = 20 * np.log10(np.sqrt(np.mean(mix**2)))
print('wrote music.wav, sfx.wav, mix.wav  |  mix RMS %.1f dBFS, peak %.1f dBFS' % (rms, 20 * np.log10(np.max(np.abs(mix)))))
