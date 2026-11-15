"""Voiceover clips with ElevenLabs, one mp3 per line: vo/zh0.mp3 ... vo/en6.mp3.
Usage: ELEVENLABS_API_KEY=... python3 vo.py vo/
Edit ZH / EN (one line per storyboard shot) and the voice ids below."""
import json,os,sys,urllib.request,subprocess
key=os.environ["ELEVENLABS_API_KEY"]; out=sys.argv[1]; os.makedirs(out, exist_ok=True)
ZH=["新手咨询师最缺两样东西：练习的机会，和督导。",
"聆镜让你随时和 AI 来访者谈一场。选一个病例，先看清这次要练什么。",
"来访者由 AI 扮演，会犹豫，会回避，也会被你的话打动或刺痛。你就像在真实的初次会谈里一样，提问，倾听。",
"卡住了？会谈中途，就能看一眼督导的提示。",
"该问的风险，也要问出口。",
"结束后，AI 督导引用你的原话，告诉你哪里做得好，哪句可以换个说法，下次练什么。",
"聆镜 PSYGYM，开源，正在内测。这是训练工具，不是心理治疗。"]
EN=["New counselors need two things they rarely get: practice, and supervision.",
"With PSYGYM, you practise with an AI client, any time. Pick a case, and see what this session is for.",
"The client hesitates, avoids, and reacts to what you say, just like a real first session. You ask. You listen.",
"Stuck? Check a quick hint from the supervisor, mid-session.",
"And ask the hard question about safety.",
"When you finish, an AI supervisor quotes your own words back: what worked, what to say instead, and what to practise next.",
"PSYGYM is open source, and in beta. It's a training tool, not therapy."]
for lang,voice,lines in [("zh","bhJUNIXWQQ94l8eI2VUf",ZH),("en","EXAVITQu4vr4xnSDxMaL",EN)]:
  for i,t in enumerate(lines):
    req=urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
      data=json.dumps({"text":t,"model_id":"eleven_multilingual_v2","voice_settings":{"stability":0.55,"similarity_boost":0.75,"style":0.15}}).encode(),
      headers={"xi-api-key":key,"Content-Type":"application/json"})
    p=f"{out}/{lang}{i}.mp3"; open(p,"wb").write(urllib.request.urlopen(req).read())
    d=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",p],capture_output=True,text=True).stdout.strip()
    print(lang,i,d)
