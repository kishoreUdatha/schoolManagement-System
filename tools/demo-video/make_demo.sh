#!/bin/bash
# Re-record the narrated demo. Voice: Google en-IN if GOOGLE_TTS_API_KEY is set,
# else TTS_PROVIDER=edge (needs speech.platform.bing.com), else offline RHVoice.
set -e
cd "$(dirname "$0")"
PY=${PY:-python3}
$PY -c "import edge_tts, imageio_ffmpeg" 2>/dev/null || $PY -m pip install -q edge-tts imageio-ffmpeg
CODE=${CODE:-SUN$(date +%H%M%S)}
rm -rf video audio
CODE=$CODE node demo.js | tee run.log
$PY mux.py "${1:-BrightCampus_E2E_demo.mp4}"
