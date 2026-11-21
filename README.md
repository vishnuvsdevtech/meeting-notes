# Meeting Notes

Record a review, get decisions, actions and corrections — each pinned to the
minute it was said. Built for Malayalam conversation that carries English
technical terms, which is how a Kerala IT review actually sounds.

## Two ways to run it

### A. Just look at it (no setup)
Open https://vishnuvsdevtech.github.io/meeting-notes/ — the interface with a
sample transcript. No microphone; a banner says so.

### B. Actually record (local)

```bash
git clone https://github.com/vishnuvsdevtech/meeting-notes.git
cd meeting-notes
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# ffmpeg must be on PATH:  sudo apt install ffmpeg   /   brew install ffmpeg
WHISPER_MODEL=large-v3 python3 server.py
```

Then open **http://127.0.0.1:8770** in Chrome or Safari and allow the microphone.

`WHISPER_MODEL` defaults to `base` for a fast start; `large-v3` is the one that
handles Malayalam properly (~1.5 GB, downloads once, ~1× realtime on CPU).
`WHISPER_LANG=ml` forces Malayalam decoding; set it empty to auto-detect.

## Why recording lives locally and not on the site

Browser speech recognition is English-only in Chrome, and it streams your audio
to Google. A review with your manager should not leave your machine, so the
transcription runs locally with faster-whisper. The hosted page is therefore a
demo, not the recorder.

## What the extraction does

The transcript is categorised with deterministic cue-word rules — decisions,
actions, corrections, options, risks, open questions. No model call, so it cannot
invent an action item, and it costs nothing to run. Every note keeps its
timestamp and its neighbouring lines, so you can verify it against what was
actually said.

It collapses transcription loops: Whisper repeats a confident line when it loses
the thread, and three identical lines in a row are one point, not three.

## Known gaps

- Speaker separation is not implemented — infer who said what from content.
- Malayalam→English translation is not wired in; the transcript stays bilingual.
- The rules miss nuance (sarcasm, implied actions). The transcript sits beside
  the notes for that reason.
- The glossary at `../meeting_glossary.json` is what keeps `API`, `NAS`,
  `deployment` as English. Fill in your project names there.
