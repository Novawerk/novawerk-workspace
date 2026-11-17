"""The songs → voice.ts: when each phrase of lyrics.ts is sung, and where the beat is.

    pip install numpy            (needs Node, ffmpeg and ffprobe on the path too)
    ELEVENLABS_API_KEY=… python scripts/align.py [zh|en] [segment ids…]
    BPM_RANGE=80,100             where to look for the tempo (the default fits these two songs)

For each language it sends public/song/<lang>.mp3 and the sung words to ElevenLabs' forced alignment
(a time for every character), turns that into a start time per phrase and an end time per line, and
measures the tempo and the first beat from the audio itself (the model was asked for 90 BPM; it
does not always keep to it). It also checks that lyrics.ts and the plan the song was made from
(public/song/<lang>.plan.json, with its last section replaced by <lang>.ending.plan.json where a
song's ending was made again) say the same words. voice.ts is committed; run this again only when a
song is replaced.

The alignment is good to about a tenth of a second, and two runs over the same audio differ by that
much; now and then it puts a line's first word a whole second early, into the pause before it. So:
with segment ids only those segments are timed again and the rest keep the times in voice.ts (the
Chinese song's ending was redone that way: `align.py zh habits close`), and after any run read the
film against the song before trusting it.
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
import uuid
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
lyrics = json.loads(subprocess.run(["node", "-e", "import('./lyrics.ts').then(m=>console.log(JSON.stringify(m.LYRICS)))"], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
said = lambda p: p if isinstance(p, str) else p["say"]
# what is left of a string once everything that is not sung is gone
norm = lambda s: re.sub(r"[\W_]+", "", s).lower()


def forced_alignment(audio: Path, text: str) -> list:
    boundary = uuid.uuid4().hex
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="text"\r\n\r\n{text}\r\n'.encode(),
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{audio.name}"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode() + audio.read_bytes() + b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/forced-alignment",
        data=b"".join(parts),
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=300) as res:
        return json.load(res)["characters"]


def beat(audio: Path) -> tuple[float, float]:
    """Tempo (BPM) and the time of the first beat: the grid that the onsets sit on best."""
    sr, hop, n = 11025, 64, 512
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(audio), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    spectrum = np.log1p(20 * np.abs(np.fft.rfft(np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * np.hanning(n), axis=1)))
    onsets = np.maximum(0, np.diff(spectrum, axis=0)).sum(axis=1)
    onsets -= onsets.mean()
    rate = sr / hop
    best = (-1.0, 0.0, 0.0)
    low, high = (float(x) for x in os.environ.get("BPM_RANGE", "80,100").split(","))
    for bpm in np.arange(low, high, 0.02):
        period = 60 / bpm * rate
        for phase in np.linspace(0, period, 40, endpoint=False):
            score = onsets[np.round(np.arange(phase, len(onsets) - 1, period)).astype(int)].mean()
            if score > best[0]:
                best = (score, float(bpm), phase / rate)
    if best[1] - low < 0.5 or high - best[1] < 0.5:
        print(f"  ! tempo {best[1]:.2f} BPM sits at the edge of the range searched ({low:g} to {high:g}); set BPM_RANGE and run again")
    return round(best[1], 2), round(best[2], 3)


def align(lang: str, only: set, old: dict) -> dict:
    audio = ROOT / "public" / "song" / f"{lang}.mp3"
    segments = lyrics[lang]
    text = "\n".join("".join(said(p) for p in line) for seg in segments for line in seg["lines"])
    chunks = json.loads((audio.with_suffix(".plan.json")).read_text())["chunks"]
    ending = audio.with_suffix(".ending.plan.json")
    if ending.exists():  # the last section was made again: its words replace the first plan's last chunk
        chunks = chunks[:-1] + [c for c in json.loads(ending.read_text())["chunks"] if "text" in c]
    sung = norm("".join(line for chunk in chunks for line in chunk["text"].split("\n") if not re.match(r"\s*[\[({]", line)))
    if sung != norm(text):
        raise SystemExit(f"{lang}: lyrics.ts and {audio.stem}.plan.json do not say the same words")
    # one (start, end) per sung character, in order
    chars = [(c["start"], c["end"]) for c in forced_alignment(audio, text) for _ in norm(c["text"])]
    if len(chars) != len(norm(text)):
        raise SystemExit(f"{lang}: the alignment timed {len(chars)} characters, the lyrics have {len(norm(text))}")
    out, pos = {}, 0
    for seg in segments:
        t, end = [], []
        for line in seg["lines"]:
            starts = []
            for p in line:
                starts.append(round(chars[pos][0], 2))
                pos += len(norm(said(p)))
            t.append(starts)
            end.append(round(chars[pos - 1][1], 2))
        kept = only and seg["id"] not in only and seg["id"] in old.get("seg", {})
        out[seg["id"]] = old["seg"][seg["id"]] if kept else {"t": t, "end": end}
        print(f"  {lang}/{seg['id']:<7}{out[seg['id']]['t']}  ends {out[seg['id']]['end']}" + ("  (kept)" if kept else ""))
    length = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(audio)], capture_output=True, text=True, check=True).stdout)
    bpm, first = beat(audio)
    print(f"{lang}: {length:.2f}s, {bpm} BPM, first beat at {first}s")
    return {"len": round(length, 2), "bpm": bpm, "beat": first, "seg": out}


def main():
    langs = [a for a in sys.argv[1:] if a in lyrics] or list(lyrics)
    only = {a for a in sys.argv[1:] if a not in lyrics}
    ids = {seg["id"] for lang in langs for seg in lyrics[lang]}
    if only - ids:
        raise SystemExit(f"no such language or segment: {sorted(only - ids)}")
    record = ROOT / "voice.ts"
    old = {}
    if record.exists():  # keep the other language's times on a partial run
        for lang, body in re.findall(r"^  (\w+): (\{.*\}),$", record.read_text(), re.M):
            old[lang] = json.loads(body)
    for lang in langs:
        old[lang] = align(lang, only, old.get(lang, {}))
    body = "\n".join(f"  {lang}: {json.dumps(old[lang])}," for lang in lyrics if lang in old)
    record.write_text(
        "// Generated by scripts/align.py from the songs; not hand-edited. Per language: len = the song's\n"
        "// length; bpm and beat = its tempo and when its first beat falls; seg[segment].t[line][phrase] =\n"
        "// when that phrase starts; seg[segment].end[line] = when the line's last word ends. Seconds from\n"
        "// the start of the song (public/song/<lang>.mp3).\n"
        "export type Times = { t: readonly (readonly number[])[]; end: readonly number[] };\n"
        "export type Song = { len: number; bpm: number; beat: number; seg: Record<string, Times> };\n"
        f"export const VOICE: Record<string, Song> = {{\n{body}\n}};\n"
    )


main()
