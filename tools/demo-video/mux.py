import json, subprocess, sys
try:
    import imageio_ffmpeg; FF = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FF = "ffmpeg"
out = sys.argv[1] if len(sys.argv) > 1 else "BrightCampus_E2E_demo.mp4"
t = json.load(open("timeline.json")); v = open("video_path.txt").read().strip()
args = [FF, "-y", "-hide_banner", "-loglevel", "error", "-i", v]; fl = []
for i, s in enumerate(t["scenes"]):
    args += ["-i", s["file"]]; ms = int(max(0, s["at"]) * 1000) + 250
    fl.append(f"[{i+1}:a]aresample=48000,adelay={ms}|{ms}[a{i}]")
n = len(t["scenes"]); end = t["scenes"][-1]["at"] + t["scenes"][-1]["dur"] + 2.0
fl.append("".join(f"[a{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0:dropout_transition=0,volume=1.5,apad[aout]")
open("filter.txt", "w").write(";".join(fl))
args += ["-filter_complex_script", "filter.txt", "-map", "0:v", "-map", "[aout]", "-t", f"{end:.2f}", "-c:v", "libx264", "-preset", "medium", "-crf", "24",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out]
r = subprocess.run(args, capture_output=True, text=True); print("mux rc", r.returncode, r.stderr[-500:])
