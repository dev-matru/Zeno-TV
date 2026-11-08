"""Synthesize Zeno's own sounds: the music tracks and the timer alarm.

Everything is generated here from sine waves and noise, so the sounds are
original and free to share. Developer tool, standard library only; the AAC
encoding uses macOS `afconvert`.

    python3 scripts/build/build-demo-audio.py            # everything
    python3 scripts/build/build-demo-audio.py rain alarm  # only some

Each track is made a little longer than it plays and its end is cross-faded into
its start, so it loops without a seam.
"""

import math
import random
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'app/assets/audio'
RATE = 32000
TAU = 2 * math.pi


def freq(midi):
    return 440 * 2 ** ((midi - 69) / 12)


class Track:
    def __init__(self, seconds, fade=3.0):
        self.length = int(seconds * RATE)
        self.fade = int(fade * RATE)
        self.buf = [0.0] * (self.length + self.fade)

    def tone(self, midi, start, duration, gain, partials=((1, 1.0),), attack=0.01, decay=2.5, release=0.1):
        """A note made of harmonic partials (multiple, level) with a soft envelope."""
        f = freq(midi)
        a = int(start * RATE)
        n = int(duration * RATE)
        rel = max(1, int(release * RATE))
        steps = [(TAU * f * k / RATE, level) for k, level in partials]
        buf = self.buf
        for j in range(n):
            i = a + j
            if i >= len(buf):
                break
            t = j / RATE
            env = min(1.0, t / attack) * math.exp(-t * decay) * min(1.0, (n - j) / rel)
            buf[i] += gain * env * sum(level * math.sin(step * j) for step, level in steps)

    def echo(self, seconds, feedback):
        """A repeating echo: each sample comes back `seconds` later, quieter."""
        d = int(seconds * RATE)
        buf = self.buf
        for i in range(d, len(buf)):
            buf[i] += buf[i - d] * feedback

    def samples(self):
        """The loop: the extra tail fades into the start."""
        out = self.buf[: self.length]
        for i in range(self.fade):
            w = i / self.fade
            out[i] = out[i] * w + self.buf[self.length + i] * (1 - w)
        return out


def normalise(samples, peak=0.7):
    top = max(abs(x) for x in samples) or 1.0
    return [x / top * peak for x in samples]


def pcm(samples):
    return b''.join(struct.pack('<h', max(-32767, min(32767, int(x * 32767)))) for x in samples)


def write_wav(path, samples, rate=RATE):
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(pcm(samples))


def write_aac(name, samples):
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / (name + '.wav')
        write_wav(wav, samples)
        target = OUT / (name + '.m4a')
        subprocess.run(
            ['/usr/bin/afconvert', '-f', 'm4af', '-d', 'aac', '-b', '64000', str(wav), str(target)],
            check=True,
        )
    print(name + '.m4a', target.stat().st_size, 'bytes')


# ---- Tracks ----

KEYS = ((1, 1.0), (2, 0.27), (3, 0.1))
SOFT = ((1, 1.0), (2, 0.15))


def lounge():
    """80 BPM, eight bars: soft electric-piano chords, walking bass, brushed pulse."""
    rnd = random.Random(732)
    tr = Track(24, fade=0.5)
    chords = [[48, 55, 59, 62, 64], [45, 52, 55, 59, 60], [50, 57, 60, 64, 65], [43, 50, 53, 57, 59]]
    for bar in range(9):
        start = bar * 3
        chord = chords[bar % 4]
        for midi in chord:
            tr.tone(midi, start, 2.9, 0.035, KEYS, decay=2.8, release=0.08)
        for beat in range(4):
            tr.tone(chord[0] - 12 + (12 if beat % 2 else 0), start + beat * 0.75, 0.68, 0.07, SOFT, decay=2)
        for beat in range(8):
            a = int((start + beat * 0.375) * RATE)
            for j in range(int(0.085 * RATE)):
                if a + j < len(tr.buf):
                    tr.buf[a + j] += (rnd.random() * 2 - 1) * 0.007 * math.exp(-j / (RATE * 0.018))
    melody = [76, 74, 71, 72, 77, 76, 74, 71, 76, 79, 76, 72, 74, 77, 71, 76]
    for k, midi in enumerate(melody):
        tr.tone(midi, 0.75 + k * 1.5, 1.2, 0.045, KEYS, decay=2.8)
    return tr.samples()


def piano():
    """Slow pentatonic arpeggios with a long echo, like a quiet room."""
    rnd = random.Random(11)
    tr = Track(48)
    progression = [[57, 64, 69, 72, 76], [53, 60, 65, 69, 72], [55, 62, 67, 71, 74], [52, 59, 64, 67, 71]]
    bell = ((1, 1.0), (2, 0.35), (3, 0.12), (4, 0.05))
    t = 0.0
    bar = 0
    while t < 51:
        chord = progression[bar % 4]
        tr.tone(chord[0] - 12, t, 6, 0.06, SOFT, attack=0.02, decay=0.5, release=1.0)
        order = chord[:] + chord[-2:0:-1]
        for k, midi in enumerate(order[:7]):
            tr.tone(midi, t + k * 0.42 + rnd.uniform(-0.02, 0.02), 3.2, 0.05, bell, decay=1.4, release=0.6)
        t += 6
        bar += 1
    tr.echo(0.42, 0.32)
    return tr.samples()


def pad():
    """Ambient chords that swell and fade, with a slow shimmer."""
    tr = Track(48, fade=4)
    chords = [[50, 57, 62, 65, 69], [46, 53, 58, 62, 65], [48, 55, 60, 64, 67], [45, 52, 57, 60, 64]]
    warm = ((1, 1.0), (2, 0.45), (3, 0.22), (4, 0.11), (5, 0.06))
    for k in range(5):
        start = k * 12 - 1
        for midi in chords[k % 4]:
            for detune in (-0.06, 0.06):
                tr.tone(midi + detune, max(0, start), 14, 0.018, warm, attack=4, decay=0.02, release=4)
    buf = tr.buf
    for i in range(len(buf)):
        buf[i] *= 0.82 + 0.18 * math.sin(TAU * 0.11 * i / RATE)
    return tr.samples()


def rain():
    """Steady soft rain: filtered noise plus scattered drops."""
    rnd = random.Random(5)
    tr = Track(40)
    buf = tr.buf
    low = high = 0.0
    for i in range(len(buf)):
        white = rnd.random() * 2 - 1
        low += (white - low) * 0.18
        high += (low - high) * 0.012
        swell = 0.85 + 0.15 * math.sin(TAU * i / (RATE * 13.3))
        buf[i] = (low - high) * 0.5 * swell
    for _ in range(1400):
        a = rnd.randrange(len(buf) - RATE // 10)
        f = rnd.uniform(1800, 4200)
        g = rnd.uniform(0.02, 0.08)
        for j in range(int(0.03 * RATE)):
            buf[a + j] += g * math.sin(TAU * f * j / RATE) * math.exp(-j / (RATE * 0.004))
    return tr.samples()


def waves():
    """Sea waves: deep noise that rises and falls every eight to eleven seconds."""
    rnd = random.Random(8)
    tr = Track(40, fade=5)
    buf = tr.buf
    starts = []
    t = 0.0
    while t < 46:
        starts.append((t, rnd.uniform(7.5, 10.5)))
        t += starts[-1][1] * rnd.uniform(0.75, 0.9)
    level = [0.0] * len(buf)
    for start, length in starts:
        a = int(start * RATE)
        n = int(length * RATE)
        for j in range(n):
            if a + j >= len(buf):
                break
            x = j / n
            level[a + j] += math.sin(math.pi * x) ** 2 * (1 - 0.6 * x)
    brown = soft = 0.0
    for i in range(len(buf)):
        white = rnd.random() * 2 - 1
        brown = (brown + white * 0.03) * 0.995
        cut = 0.03 + 0.25 * min(1.0, level[i])
        soft += (white - soft) * cut
        buf[i] = brown * 1.2 * (0.25 + level[i]) + soft * 0.35 * level[i]
    return tr.samples()


def noise():
    """Brown noise: a deep, even hush for focus or sleep."""
    rnd = random.Random(3)
    tr = Track(30)
    brown = 0.0
    for i in range(len(tr.buf)):
        brown = (brown + (rnd.random() * 2 - 1) * 0.02) * 0.998
        tr.buf[i] = brown
    return tr.samples()


TRACKS = {
    'lounge': lounge,
    'piano': piano,
    'pad': pad,
    'rain': rain,
    'waves': waves,
    'noise': noise,
}


# ---- Timer alarm ----


def alarm():
    """A bright three-note marimba phrase, then a pause. The app plays it in a loop."""
    tr = Track(2.4, fade=0.001)
    marimba = ((1, 1.0), (4, 0.25), (10, 0.05))
    for k, midi in enumerate([84, 88, 91, 88]):
        tr.tone(midi, 0.02 + k * 0.17, 0.9, 0.3, marimba, attack=0.003, decay=5.5, release=0.2)
    tr.tone(96, 0.75, 1.2, 0.18, marimba, attack=0.003, decay=4, release=0.4)
    return normalise(tr.buf[: tr.length], 0.6)


def main(names):
    OUT.mkdir(exist_ok=True)
    for name in names or list(TRACKS) + ['alarm']:
        if name == 'alarm':
            write_wav(OUT / 'alarm.wav', alarm(), RATE)
            print('alarm.wav', (OUT / 'alarm.wav').stat().st_size, 'bytes')
        else:
            write_aac(name, normalise(TRACKS[name](), 0.68))


if __name__ == '__main__':
    main(sys.argv[1:])
