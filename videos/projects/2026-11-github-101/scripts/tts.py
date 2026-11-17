"""The narration → public/vo/<lang>/<id>.mp3 and voice.ts (when each phrase starts).

    pip install edge-tts==7.3.1   (needs Node, ffmpeg and ffprobe on the path too)
    python scripts/tts.py [zh|en] [segment ids…]

WARNING: the voice comes from the service behind Edge's "read aloud", through the edge-tts package.
It is free and needs no key, but it is NOT an official interface: it is meant for the Edge browser
itself, calling it from a program like this is probably outside what Microsoft allows, and it can
stop working at any time. The same voices have an official interface (Azure AI Speech, with a free
tier and a key). Whether to move there is the founder's decision: see BRIEF.md, "旁白".

The clips and voice.ts are committed, so the film renders without the service. Run this again only
when narration.ts changes; with segment ids it redoes just those. voice.json is this script's own
record (so a partial run keeps the other segments' times); the film reads voice.ts.

  VO_VOICE_ZH / VO_VOICE_EN   the voice (defaults below)
  VO_RATE_ZH / VO_RATE_EN     how much faster than the voice's own pace, e.g. "+8%"
"""

import asyncio
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
VOICES = {"zh": os.environ.get("VO_VOICE_ZH", "zh-CN-YunxiNeural"), "en": os.environ.get("VO_VOICE_EN", "en-US-BrianMultilingualNeural")}
RATES = {"zh": os.environ.get("VO_RATE_ZH", "+6%"), "en": os.environ.get("VO_RATE_EN", "+4%")}

narration = json.loads(
    subprocess.run(["node", "-e", "import('./narration.ts').then(m=>console.log(JSON.stringify(m.NARRATION)))"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
)
said = lambda p: p if isinstance(p, str) else p["say"]
# what is left of a string once everything the service does not time is gone
norm = lambda s: re.sub(r"[\W_]+", "", s).lower()


async def speak(lang: str, seg: dict) -> dict:
    text = "".join(said(p) for line in seg["lines"] for p in line)
    out = ROOT / "public" / "vo" / lang / f"{seg['id']}.mp3"
    out.parent.mkdir(parents=True, exist_ok=True)
    words = []  # (characters before this word, start s, end s)
    seen = 0
    with open(out, "wb") as f:
        async for chunk in edge_tts.Communicate(text, VOICES[lang], rate=RATES[lang], boundary="WordBoundary").stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 1e7
                words.append((seen, start, start + chunk["duration"] / 1e7))
                seen += len(norm(chunk["text"]))
    if not words:
        raise SystemExit(f"{lang}/{seg['id']}: the service sent no word timings")
    # The service's clips are quiet (about -22 LUFS) and uneven: measure each, then one fixed gain to
    # -16 LUFS with a limiter under it. (A fixed gain keeps the level steady inside the clip.)
    probe = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(out), "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    loud = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", probe)[-1])
    level = out.with_suffix(".level.mp3")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(out), "-af", f"volume={-16 - loud:.2f}dB,alimiter=limit=0.84:level=false", "-ar", "48000", "-ac", "1", "-b:a", "128k", str(level)], check=True)
    level.replace(out)
    total = len(norm(text))
    if abs(seen - total) > max(3, total * 0.05):
        print(f"  ! {lang}/{seg['id']}: the service timed {seen} characters, the text has {total}; phrase times are approximate")
    scale = total / seen if seen else 1

    def at(index: int) -> float:
        """When the word holding the text's `index`th character starts."""
        best = words[0][1]
        for before, start, _ in words:
            if before * scale <= index + 1e-6:
                best = start
            else:
                break
        return best

    t, end, pos = [], [], 0
    for line in seg["lines"]:
        starts = []
        for p in line:
            starts.append(round(at(pos), 2))
            pos += len(norm(said(p)))
        t.append(starts)
        # the line ends where its last word does
        last = [w for w in words if w[0] * scale < pos - 1e-6]
        end.append(round(last[-1][2], 2))
    length = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)], capture_output=True, text=True).stdout)
    print(f"  {lang}/{seg['id']:<8}{end[-1]:6.2f}s  {t}")
    return {"dur": end[-1], "len": round(length, 2), "t": t, "end": end}


async def main():
    args = sys.argv[1:]
    langs = [a for a in args if a in narration] or list(narration)
    only = {a for a in args if a not in narration}
    times_file = ROOT / "voice.json"
    times = json.loads(times_file.read_text()) if times_file.exists() else {}
    for lang in langs:
        times.setdefault(lang, {})
        for seg in narration[lang]:
            if only and seg["id"] not in only:
                continue
            times[lang][seg["id"]] = await speak(lang, seg)
    times_file.write_text(json.dumps(times, indent=1))
    body = "\n".join(
        f"  {lang}: {{\n" + "\n".join(f"    {s['id']}: {json.dumps(times[lang][s['id']])}," for s in narration[lang] if s["id"] in times.get(lang, {})) + "\n  },"
        for lang in narration
    )
    (ROOT / "voice.ts").write_text(
        "// Generated by scripts/tts.py from the speech service's word timings; not hand-edited.\n"
        "// Per language and segment: dur = when the last word ends; len = the length of the clip;\n"
        "// t[line][phrase] = when that phrase starts; end[line] = when the line ends. Seconds from the start\n"
        "// of the clip (public/vo/<lang>/<id>.mp3).\n"
        "export type Times = { dur: number; len: number; t: readonly (readonly number[])[]; end: readonly number[] };\n"
        f"export const VOICE: Record<string, Record<string, Times>> = {{\n{body}\n}};\n"
    )
    for lang in langs:
        print(f"{lang}: {sum(v['dur'] for v in times[lang].values()):.1f}s of speech, voice {VOICES[lang]} at {RATES[lang]}")


asyncio.run(main())
