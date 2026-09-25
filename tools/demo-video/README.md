# Narrated demo video

Records a real browser session of a brand-new school, from platform onboarding
to its first day across every role, with captions and an Indian English female
voiceover. Output: `BrightCampus_E2E_demo.mp4` (about 8 minutes).

Needs the web app on :3100 and the API on :8000 (with a super admin
`admin@sms.local` / `ChangeMe123!` and a plan named "Standard School").

```bash
./make_demo.sh                 # voice picked automatically
```

Voice, in order:
1. Google Cloud TTS `en-IN-Chirp3-HD-Aoede` when `GOOGLE_TTS_API_KEY` is set
   (`TTS_VOICE` picks another en-IN voice).
2. Microsoft "Neerja Expressive" with `TTS_PROVIDER=edge`
   (the network must allow `speech.platform.bing.com`).
3. RHVoice offline (not Indian English) otherwise.

The narration is in `narration.json`, one line per scene; edit it and re-run.
Each run creates a new school (`CODE=...` to choose its code).
