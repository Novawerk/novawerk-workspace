"""Cut a product demo video: phone recording + title/end cards + captions + voiceover + music.

Layout next to this script: rec/<take>.mp4 (simctl recording), vo/zh0..6.mp3, vo/en0..6.mp3,
vo/music.mp3. Needs ffmpeg and Pillow; fonts are macOS Hiragino Sans GB.

Usage: RAW=rec/take.mp4 SEGS='[[in,out,speed],...]' python3 render.py zh|en OUT.mp4 LOGO.png
zh renders 1080x1440 (3:4, 小红书), en renders 1080x1350 (4:5, LinkedIn).
SEGS has seven segments; VO_AT pins each voiceover line to one of them. Edit T for the copy."""
import os, subprocess, sys, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get("RAW", f"{S}/rec/take1.mp4")
LOGO = sys.argv[3] if len(sys.argv) > 3 else None
LANG, OUT = sys.argv[1], sys.argv[2]
W = 1080
H = 1440 if LANG == "zh" else 1350
FPS = 30
BG = (245, 245, 244)
INK = (24, 24, 27)
MUTED = (113, 113, 122)
FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
WORK = f"{S}/work_{LANG}"
os.makedirs(WORK, exist_ok=True)

def font(size, bold=True):
    return ImageFont.truetype(FONT, size, index=1 if bold else 0)

def dur(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                                capture_output=True, text=True).stdout)

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-3000:]); sys.exit(1)

# ---------- copy ----------
T = {
 "zh": dict(
   brand="聆镜 PSYGYM",
   title=["新手咨询师的", "练习场"], title_sub="AI 扮演来访者 · AI 督导给反馈",
   end=["这是训练工具，", "不是心理治疗。"], end_sub="来访者都是虚构的。",
   end_url="psygym.novawerk.io", end_meta="开源 · 内测中 · Novawerk 出品",
   speed="{}× 加速",
   vo=["新手咨询师最缺两样东西：练习的机会，和督导。",
       "聆镜让你随时和 AI 来访者谈一场。选一个病例，先看清这次要练什么。",
       "来访者由 AI 扮演，会犹豫，会回避，也会被你的话打动或刺痛。|你就像在真实的初次会谈里一样，提问，倾听。",
       "卡住了？会谈中途，就能看一眼督导的提示。",
       "该问的风险，也要问出口。",
       "结束后，AI 督导引用你的原话，|告诉你哪里做得好，哪句可以换个说法，下次练什么。",
       "聆镜 PSYGYM，开源，正在内测。|这是训练工具，不是心理治疗。"],
   cap_size=42),
 "en": dict(
   brand="聆镜 PSYGYM",
   title=["A practice room", "for new counselors"], title_sub="An AI client · An AI supervisor",
   end=["A training tool,", "not therapy."], end_sub="Every client is fictional.",
   end_url="psygym.novawerk.io", end_meta="Open source · In beta · Part of Novawerk",
   speed="{}× speed",
   vo=["New counselors need two things they rarely get: practice, and supervision.",
       "With PSYGYM, you practise with an AI client, any time. Pick a case, and see what this session is for.",
       "The client hesitates, avoids, and reacts to what you say, just like a real first session.|You ask. You listen.",
       "Stuck? Check a quick hint from the supervisor, mid-session.",
       "And ask the hard question about safety.",
       "When you finish, an AI supervisor quotes your own words back:|what worked, what to say instead, and what to practise next.",
       "PSYGYM is open source, and in beta.|It's a training tool, not therapy."],
   cap_size=40),
}[LANG]
EN_NOTE = None

# ---------- layout ----------
HEADER_Y = 44
PHONE_Y = 128
CAP_H = 170
PHONE_H = H - PHONE_Y - CAP_H - 16
PHONE_W = round(PHONE_H * 1206 / 2622) // 2 * 2
PHONE_H = PHONE_H // 2 * 2
PHONE_X = (W - PHONE_W) // 2
CAP_TOP = PHONE_Y + PHONE_H + 12

# ---------- timeline (raw seconds) ----------
TITLE_D, END_D = 6.0, 7.0
SEGS = [  # (in, out, speed)
    (12.5, 20.5, 1.0),   # home -> case brief
    (20.5, 116.5, 4.0),  # five turns
    (116.5, 118.5, 1.0), # open live hints
    (123.0, 132.0, 1.0), # read live hints, back
    (132.0, 158.0, 3.0), # risk question, close
    (158.0, 182.0, 4.0), # end, report loading
    (182.0, 228.0, 1.6), # report
]
if os.environ.get("SEGS"): SEGS = [tuple(x) for x in json.loads(os.environ["SEGS"])]
starts, t = [], TITLE_D
for a, b, sp in SEGS:
    starts.append(t); t += (b - a) / sp
END_AT = t
TOTAL = END_AT + END_D
VO_AT = [0.5, starts[0] + 0.5, starts[1] + 1.0, starts[2] + 0.3, starts[4] + 0.4, starts[6] + 0.8, END_AT + 0.3]

def wrap(draw, text, f, maxw):
    lines, cur = [], ""
    tokens = list(text) if LANG == "zh" else text.split(" ")
    sep = "" if LANG == "zh" else " "
    for tok in tokens:
        cand = (cur + sep + tok) if cur else tok
        if draw.textlength(cand, font=f) <= maxw: cur = cand
        else:
            lines.append(cur); cur = tok
    if cur: lines.append(cur)
    # no line starting with CJK punctuation
    for i in range(1, len(lines)):
        while lines[i] and lines[i][0] in "，。：、？！）」":
            lines[i - 1] += lines[i][0]; lines[i] = lines[i][1:]
    return lines

def logo_img(size):
    im = Image.open(LOGO).convert("RGBA").resize((size, size), Image.LANCZOS)
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=size // 4, fill=255)
    im.putalpha(m); return im

def brand_row(img, y, size=52):
    d = ImageDraw.Draw(img); f = font(round(size * 0.72))
    tw = d.textlength(T["brand"], font=f); gap = 16
    x = (W - (size + gap + tw)) / 2
    img.alpha_composite(logo_img(size), (int(x), y))
    d.text((x + size + gap, y + size / 2), T["brand"], font=f, fill=INK, anchor="lm")

# background with header
bg = Image.new("RGBA", (W, H), BG + (255,))
brand_row(bg, HEADER_Y, 50)
# phone shadow
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
r = round(PHONE_W * 0.137)
ImageDraw.Draw(sh).rounded_rectangle([PHONE_X, PHONE_Y + 10, PHONE_X + PHONE_W, PHONE_Y + PHONE_H + 10], radius=r, fill=(0, 0, 0, 60))
sh = sh.filter(ImageFilter.GaussianBlur(18))
bg.alpha_composite(sh)
bg.save(f"{WORK}/bg.png")
mask = Image.new("L", (PHONE_W, PHONE_H), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, PHONE_W - 1, PHONE_H - 1], radius=r, fill=255)
mask.save(f"{WORK}/mask.png")

def card(lines, sub, extra, path):
    im = Image.new("RGBA", (W, H), (255, 255, 255, 255)); d = ImageDraw.Draw(im)
    brand_row(im, int(H * 0.22), 64)
    big = font(92 if LANG == "zh" else 80)
    y = int(H * 0.36)
    for ln in lines:
        d.text((W / 2, y), ln, font=big, fill=INK, anchor="mt"); y += int(big.size * 1.3)
    y += 24
    d.text((W / 2, y), sub, font=font(40, False), fill=MUTED, anchor="mt"); y += 90
    for i, (txt, sz, col) in enumerate(extra):
        d.text((W / 2, y), txt, font=font(sz, i == 0 and sz > 40), fill=col, anchor="mt"); y += int(sz * 1.7)
    im.save(path)

card(T["title"], T["title_sub"], [(EN_NOTE, 30, MUTED)] if EN_NOTE else [], f"{WORK}/title.png")
card(T["end"], T["end_sub"], [(T["end_url"], 44, INK), (T["end_meta"], 34, MUTED)], f"{WORK}/end.png")

# captions
caps = []  # (png, start, end)
for i, text in enumerate(T["vo"]):
    vo = f"{S}/vo/{LANG}{i}.mp3"; d0 = dur(vo); parts = text.split("|")
    total_chars = sum(len(p) for p in parts); t0 = VO_AT[i]
    for j, p in enumerate(parts):
        dt = d0 * len(p) / total_chars
        im = Image.new("RGBA", (W, CAP_H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
        f = font(T["cap_size"])
        lines = wrap(dr, p, f, W - 120)
        lh = int(f.size * 1.45); y = (CAP_H - lh * len(lines)) / 2 + 6
        for ln in lines:
            dr.text((W / 2, y), ln, font=f, fill=INK, anchor="mt"); y += lh
        png = f"{WORK}/cap{i}_{j}.png"; im.save(png)
        end = t0 + dt + (0.35 if j == len(parts) - 1 else 0)
        caps.append((png, t0, end)); t0 += dt

# speed badges
badges = []
for k, (a, b, sp) in enumerate(SEGS):
    if sp < 2: continue
    f = font(28); txt = T["speed"].format(int(sp) if sp == int(sp) else sp)
    tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    tw = tmp.textlength(txt, font=f)
    im = Image.new("RGBA", (int(tw + 40), 52), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.rounded_rectangle([0, 0, im.width - 1, 51], radius=26, fill=(24, 24, 27, 215))
    dr.text((im.width / 2, 26), txt, font=f, fill=(255, 255, 255), anchor="mm")
    png = f"{WORK}/speed{k}.png"; im.save(png)
    badges.append((png, starts[k] + 0.2, starts[k] + (b - a) / sp - 0.2))

note = None
if EN_NOTE:
    im = Image.new("RGBA", (W, 40), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.text((W / 2, 20), EN_NOTE, font=font(24, False), fill=MUTED, anchor="mm")
    note = f"{WORK}/note.png"; im.save(note)

# ---------- phone track ----------
parts = []
for k, (a, b, sp) in enumerate(SEGS):
    p = f"{WORK}/seg{k}.mp4"
    run(["ffmpeg", "-y", "-v", "error", "-ss", str(a), "-to", str(b), "-i", RAW, "-an",
         "-vf", f"fps=60,setpts=PTS/{sp},fps={FPS},scale={PHONE_W}:{PHONE_H}:flags=lanczos,format=yuv420p",
         "-c:v", "libx264", "-preset", "medium", "-crf", "16", p])
    parts.append(p)
with open(f"{WORK}/list.txt", "w") as fh:
    fh.write("".join(f"file '{p}'\n" for p in parts))
run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", f"{WORK}/list.txt", "-c", "copy", f"{WORK}/phone.mp4"])

# ---------- compose ----------
inputs = ["-loop", "1", "-t", f"{TOTAL}", "-i", f"{WORK}/bg.png",
          "-i", f"{WORK}/phone.mp4", "-loop", "1", "-i", f"{WORK}/mask.png",
          "-loop", "1", "-i", f"{WORK}/title.png", "-loop", "1", "-i", f"{WORK}/end.png"]
overl = caps + badges
for png, _, _ in overl: inputs += ["-loop", "1", "-i", png]
n_img = 5
vo_idx = n_img + len(overl)
for i in range(7): inputs += ["-i", f"{S}/vo/{LANG}{i}.mp3"]
inputs += ["-i", f"{S}/vo/music.mp3"]

fc = [f"[1:v]setpts=PTS-STARTPTS+{TITLE_D}/TB,format=rgba[ph0]",
      f"[2:v]format=gray[mk]", "[ph0][mk]alphamerge[ph]",
      f"[0:v][ph]overlay={PHONE_X}:{PHONE_Y}:eof_action=pass:format=auto[v0]"]
cur = "v0"
for i, (png, a, b) in enumerate(overl):
    idx = n_img + i
    if png in [c[0] for c in caps]: x, y = 0, CAP_TOP
    elif note and png == note: x, y = 0, PHONE_Y - 46
    else: x, y = PHONE_X + PHONE_W + 22, PHONE_Y + 40
    fc.append(f"[{cur}][{idx}:v]overlay={x}:{y}:enable='between(t,{a:.2f},{b:.2f})'[v{i+1}]"); cur = f"v{i+1}"
fc.append(f"[{cur}][3:v]overlay=0:0:enable='lt(t,{TITLE_D})'[vt]")
fc.append(f"[vt][4:v]overlay=0:0:enable='gte(t,{END_AT})',format=yuv420p[vout]")
# audio
amix = []
for i in range(7):
    ms = int(VO_AT[i] * 1000)
    fc.append(f"[{vo_idx+i}:a]aresample=48000,adelay={ms}|{ms},apad[a{i}]"); amix.append(f"[a{i}]")
m = vo_idx + 7
fc.append(f"[{m}:a]aresample=48000,atrim=0:{TOTAL},afade=t=in:d=1.5,afade=t=out:st={TOTAL-3}:d=3,volume=0.16[mus]")
fc.append("".join(amix) + f"amix=inputs=7:normalize=0,volume=1.0[vo]")
fc.append(f"[vo][mus]amix=inputs=2:normalize=0,atrim=0:{TOTAL},loudnorm=I=-16:TP=-1.5:LRA=11[aout]")

run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(fc),
     "-map", "[vout]", "-map", "[aout]", "-t", f"{TOTAL}", "-r", str(FPS),
     "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", OUT])
print(json.dumps({"out": OUT, "total": round(TOTAL, 2), "size": [W, H], "phone": [PHONE_W, PHONE_H],
                  "vo_at": [round(x, 2) for x in VO_AT], "starts": [round(x, 2) for x in starts], "end_at": round(END_AT, 2)}))
