# Narrated demo video

Records real browser sessions of a brand-new school, with captions and an
Indian English female voiceover, in two parts:

1. **The story** (`demo.js`, about 8 minutes): the platform creates a plan and
   onboards Sunrise Public School; the admin runs the setup wizard; then its
   first day through the teacher, parents, a student, the accountant and the
   principal.
2. **Every menu, every role** (`tour.js`): each role signs in and opens every
   item in its menu, every screen in each menu group and every tab on those
   screens; then the teacher, parent and student phone apps, through their
   bottom bar and More menu. About 400 screens. Anything that goes wrong on the
   way (API errors, page errors, error notes, missing pages) is written to
   `tour/report.json`, so the run doubles as an end-to-end test.

Needs the API on :8000 (with a super admin `admin@sms.local` / `ChangeMe123!`)
and the web app on :3100. Use a production build of the web app
(`npm run build && npx next start -p 3100`): the dev server recompiles pages
after they sit idle, which shows as dead air on the video and makes clicks
land on half-loaded pages.

```bash
./make_all.sh                          # both parts, one MP4 per role, the whole demo, and out/test_report.md
TTS_PROVIDER=silent ./make_all.sh      # dry run: silent audio of the right length, to check timing and screens
CODE=SUN1234 FAST=1 node tour.js       # quick check of every screen, no video (after demo.js made school SUN1234)
node tour.js school_admin parent_app   # only some roles
```

Voice, in order:
0. Sarvam AI Bulbul (Indian English) when `SARVAM_API_KEY` is set and the network
   allows `api.sarvam.ai`. Female speakers: `anushka` (default), `manisha`,
   `vidya`, `arya`; pick with `SARVAM_SPEAKER`.
1. Google Cloud TTS `en-IN-Chirp3-HD-Aoede` when `GOOGLE_TTS_API_KEY` is set
   (`TTS_VOICE` picks another en-IN voice).
2. Microsoft "Neerja Expressive" with `TTS_PROVIDER=edge`
   (the network must allow `speech.platform.bing.com`).
3. Kokoro offline, Indian female `hf_alpha` (run `./setup_kokoro.sh` once;
   `TTS_VOICE=hf_beta` for the second voice).
4. RHVoice offline (not Indian English) otherwise.

Clips are cached by text and voice in `tts_cache/`, so a re-run costs nothing
for lines that did not change.

The story's narration is in `narration.json`, one line per scene. The tour's
is in `tour_lines.py` (one line per screen, by route; per menu label for the
phone apps): edit it and run `python3 tour_lines.py` to rebuild
`tour_narration.json`. A screen with no line is announced by its menu label.
Each run creates a new school (`CODE=...` to choose its code).
