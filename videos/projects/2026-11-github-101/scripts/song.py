"""A plan (words and styles) → a song, with ElevenLabs' music model.

    ELEVENLABS_API_KEY=… python scripts/song.py zh|en [out.mp3] [plan.json]

Sends public/song/<lang>.plan.json (or the plan named) to the model (music_v2_5): the voice and the
beat come back as one file. The Music API needs a paid ElevenLabs plan.

The Chinese song's ending was made again this way (2026-11-17, a new last line): the plan
public/song/zh.ending.plan.json keeps the first 48.1 s of the first song by its id (a placeholder in
the committed file) and asks for a new last section. What comes back is close to the first song up to there but not the same audio, so the
film's zh.mp3 is the first song up to 48.26 s joined to the new one from 48.20 s, between two lines:

    ffmpeg -i first.mp3 -i new.mp3 -filter_complex "[0:a]atrim=0:48.26,asetpts=PTS-STARTPTS[a];\
      [1:a]atrim=48.20,asetpts=PTS-STARTPTS,volume=1.15[b];[a][b]acrossfade=d=0.06:c1=tri:c2=tri" zh.mp3

WARNING: every run makes a different song. public/song/zh.mp3 and en.mp3 are the ones the film is
cut to (the founder heard and approved both on 2026-11-17; the Chinese one's ending was then made
again at his request, see above); the model cannot make them again. So this writes next to them
(public/song/<lang>.new.mp3) unless told where: listen first, then replace the file, run
scripts/align.py, then `pnpm video 2026-11-github-101 all`. Change a word in the plan and lyrics.ts must change with it
(align.py checks that they agree).

The songs are not in this repository and not under its MIT licence: see NOTICE.md in the project's folder.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
lang = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
plan = json.loads((Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / "public" / "song" / f"{lang}.plan.json").read_text())
out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "public" / "song" / f"{lang}.new.mp3"

req = urllib.request.Request(
    "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
    data=json.dumps({"composition_plan": plan, "model_id": "music_v2_5"}).encode(),
    headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"},
)
try:
    with urllib.request.urlopen(req, timeout=540) as res:
        out.write_bytes(res.read())
        print(f"{out} · song id {res.headers.get('song-id')}")
except urllib.error.HTTPError as e:
    sys.exit(f"HTTP {e.code}: {e.read().decode()[:800]}")
