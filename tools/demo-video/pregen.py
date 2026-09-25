import json, subprocess, os, sys, tempfile
lines = json.load(open(os.path.join(os.path.dirname(__file__), "narration.json")))
for i, t in enumerate(lines, 1):
    f = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False); f.write(t); f.close()
    r = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "tts.py"), f.name, f"/tmp/claude-0/pre_{i}.wav"], capture_output=True, text=True)
    print(i, r.stdout.strip(), r.stderr.strip()[-200:], flush=True)
