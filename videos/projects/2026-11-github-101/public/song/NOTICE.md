# The two songs

The film's soundtrack is two songs, `zh.mp3` and `en.mp3`, generated on 2026-11-17 with ElevenLabs'
music model (`music_v2_5`) from the plans in this folder (`zh.plan.json`, `en.plan.json`): voice and
music are both synthetic. The Chinese song is two generations joined: the first up to 48 s, then an
ending made again from `zh.ending.plan.json` for a new last line (in that file the first song's id
is replaced by a placeholder).

**The mp3s are not in this repository.** ElevenLabs' Music Terms don't allow putting generated music
where others can download it to use in their own work, and a public repository is such a place. To
render the film again, ask a Novawerk member for the two files and put them in this folder. Running
`scripts/song.py` instead makes a different song.

The finished films in `out/` carry the songs as their soundtrack. The films and the songs are
**not covered by this repository's MIT licence**: ElevenLabs' Music Terms apply to the music. Don't
cut the music out of the films to use it elsewhere.

Wherever a film is posted, follow that platform's rule on labelling AI-generated content.
