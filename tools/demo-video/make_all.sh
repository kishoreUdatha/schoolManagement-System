#!/bin/bash
# The whole demo: the onboarding story, then every menu of every role.
#   ./make_all.sh                 needs SARVAM_API_KEY (or another voice, see tts.py)
#   TTS_PROVIDER=silent ./make_all.sh   a dry run with silent audio of the right length
# Output in out/: 00_story.mp4, one MP4 per role, BrightCampus_full_demo.mp4,
# and test_report.md (every screen opened, and anything that went wrong).
set -e
cd "$(dirname "$0")"
PY=${PY:-python3}
$PY -c "import imageio_ffmpeg" 2>/dev/null || $PY -m pip install -q imageio-ffmpeg
FF=$($PY -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())")
export CODE=${CODE:-SUN$(date +%H%M%S)}
mkdir -p out; rm -f out/*.mp4 tour/report.json

rm -rf video audio
node demo.js | tee run.log
$PY mux.py out/00_story.mp4

node tour.js | tee tour.log
i=1
for part in super_admin school_admin principal accountant teacher staff student teacher_app parent_app student_app; do
  [ -f "tour/$part/video_path.txt" ] || continue
  (cd "tour/$part" && $PY ../../mux.py "../../out/$(printf %02d $i)_$part.mp4")
  i=$((i + 1))
done

(cd out && ls [0-9]*.mp4 | sed "s/.*/file '&'/" > list.txt && "$FF" -y -loglevel error -f concat -safe 0 -i list.txt -c copy BrightCampus_full_demo.mp4 && rm list.txt)
$PY report.py > out/test_report.md
ls -lh out
