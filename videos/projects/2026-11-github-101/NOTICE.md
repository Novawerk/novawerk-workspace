# Licence note: the music in these films

The two finished films in `out/` (`github-101_3x4.mp4`, Chinese, and `github-101_en_3x4.mp4`,
English) each carry a whole song as their soundtrack. The songs were generated on 2026-11-17 with
ElevenLabs' music model (`music_v2_5`): voice and music are both synthetic.

- **The code that makes the films is under this repository's MIT licence**: everything in this
  folder except the films in `out/`, and the shared `videos/kit/`.
- **The songs, and the finished films that carry them, are not under the MIT licence.**
  ElevenLabs' Music Terms apply to the music. They don't allow putting generated music where others
  can download it to use in their own work. So: watch the films and share them as they are, but
  don't cut the music out of them to use it elsewhere.

The founder decided on 2026-11-17 that the films, with the songs in them, are committed to this
public repository.

## The song files

**The two mp3s (`public/song/zh.mp3`, `public/song/en.mp3`) are not in this repository**
(`videos/.gitignore`), for the reason above: a public repository is a place where others can
download a file to use in their own work. To render the films again, ask a Novawerk member for the
two files and put them in `public/song/`. Running `scripts/song.py` instead makes a different song.

They were made from the plans in `public/song/` (`zh.plan.json`, `en.plan.json`). The Chinese song
is two generations joined: the first up to 48 s, then an ending made again from
`zh.ending.plan.json` for a new last line (in that file the first song's id is replaced by a
placeholder).

## Posting

Wherever a film is posted, follow that platform's rule on labelling AI-generated content.
