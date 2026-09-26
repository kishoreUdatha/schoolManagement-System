"""Narration voice for the demo video.

  python3 tts.py <text-file> <out.wav>

Voice, in order of preference:
  0. Sarvam AI Bulbul, Indian English female (needs SARVAM_API_KEY and api.sarvam.ai
     allowed; speaker from SARVAM_SPEAKER, default priya).
  1. Google Cloud Text-to-Speech, Indian English female (needs GOOGLE_TTS_API_KEY;
     voice from TTS_VOICE, default en-IN-Chirp3-HD-Aoede).
  1b. Kokoro offline, Indian female "hf_alpha" (after ./setup_kokoro.sh).
  2. Microsoft Edge "Neerja Expressive" (needs speech.platform.bing.com allowed).
  3. RHVoice (offline fallback, not Indian English).
  TTS_PROVIDER=silent writes silence of the expected length (a dry run for timing and screen checks).
Clips are cached by text + voice, so re-recording costs nothing extra.
"""
import base64, hashlib, json, os, subprocess, sys, urllib.request

text = open(sys.argv[1], encoding="utf-8").read().strip()
out = sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
voice = os.environ.get("TTS_VOICE", "en-IN-Chirp3-HD-Aoede")
rate = float(os.environ.get("TTS_RATE", "1.1"))
cache = os.path.join(here, "tts_cache"); os.makedirs(cache, exist_ok=True)
key = os.environ.get("GOOGLE_TTS_API_KEY")
kokoro_dir = os.environ.get("KOKORO_DIR", os.path.join(here, "kokoro"))
default = "kokoro" if os.path.exists(os.path.join(kokoro_dir, "say.mjs")) else "rhvoice"
sarvam_key = os.environ.get("SARVAM_API_KEY")
provider = os.environ.get("TTS_PROVIDER") if os.environ.get("TTS_PROVIDER") == "silent" else "sarvam" if sarvam_key else "google" if key else os.environ.get("TTS_PROVIDER", default)
if provider == "sarvam":
    voice = os.environ.get("SARVAM_SPEAKER", "priya")
if provider == "kokoro":
    voice = os.environ.get("TTS_VOICE", "hf_alpha")
hit = os.path.join(cache, hashlib.sha1(f"{provider}|{voice}|{rate}|{os.environ.get('KOKORO_LANG', 'b')}|{text}".encode()).hexdigest() + ".wav")

def done(src):
    subprocess.run(["cp", src, out], check=True); print(provider); sys.exit(0)

if os.path.exists(hit):
    done(hit)

import ssl
ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE", "/root/.ccr/ca-bundle.crt"))

if provider == "sarvam":
    # bulbul:v2 (and its speakers such as anushka) is retired; v3 takes no loudness or preprocessing flags
    body = {"text": text, "target_language_code": "en-IN", "speaker": voice, "model": os.environ.get("SARVAM_MODEL", "bulbul:v3"),
            "pace": rate, "speech_sample_rate": 24000}
    req = urllib.request.Request("https://api.sarvam.ai/text-to-speech", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "api-subscription-key": sarvam_key})
    with urllib.request.urlopen(req, context=ctx, timeout=90) as r:
        audio = base64.b64decode("".join(json.loads(r.read())["audios"]))
    open(hit, "wb").write(audio)
elif provider == "google":
    body = {"input": {"text": text}, "voice": {"languageCode": "en-IN", "name": voice},
            "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": 24000, "speakingRate": rate}}
    req = urllib.request.Request(f"https://texttospeech.googleapis.com/v1/text:synthesize?key={key}",
                                 data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, context=ctx, timeout=60) as r:
        audio = base64.b64decode(json.loads(r.read())["audioContent"])
    open(hit, "wb").write(audio)
elif provider == "silent":
    # Dry run: silence as long as the line would take to say, so timing and captions can be checked.
    import wave
    with wave.open(hit, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000)
        w.writeframes(b"\0\0" * int(24000 * (0.5 + len(text.split()) / (2.6 * rate))))
elif provider == "kokoro":
    env = dict(os.environ, KOKORO_LANG=os.environ.get("KOKORO_LANG", "b"))
    subprocess.run(["node", os.path.join(kokoro_dir, "say.mjs"), voice, str(rate), sys.argv[1], hit], check=True, env=env, stdout=subprocess.DEVNULL)
elif provider == "edge":
    mp3 = hit[:-4] + ".mp3"
    subprocess.run([sys.executable, "-m", "edge_tts", "--voice", "en-IN-NeerjaExpressiveNeural", "--rate", "+8%",
                    "--text", text, "--write-media", mp3], check=True)
    try:
        import imageio_ffmpeg; ff = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        ff = "ffmpeg"
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", mp3, "-ar", "24000", "-ac", "1", hit], check=True)
else:
    subprocess.run(["RHVoice-test", "-p", "slt", "-r", "105", "-i", sys.argv[1], "-o", hit], check=True)
done(hit)
