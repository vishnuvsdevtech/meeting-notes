#!/usr/bin/env python3
"""Local transcription backend for Meeting Notes.

The page records in the browser; audio comes here as one WAV upload and goes
through faster-whisper locally. Nothing leaves this machine — which matters when
the recording is a private review with a manager.

    python3 server.py            # http://127.0.0.1:8770

Endpoints
  GET  /              the app
  POST /transcribe    multipart 'audio' (wav) -> {text, segments, language}
"""
from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, "/opt/data/home/.local/lib/python3.14/site-packages")

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8770"))
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")
LANG = os.environ.get("WHISPER_LANG", "ml")
GLOSSARY = "/opt/data/scripts/meeting_glossary.json"

_model = None


def terms():
    try:
        g = json.load(open(GLOSSARY))
    except Exception:
        return []
    out = []
    for k, v in g.items():
        if k.startswith("_"):
            continue
        out.extend(v)
    return sorted({t for t in out if not t.startswith("REPLACE_WITH")}, key=len, reverse=True)


def prompt_for(ts, limit=860):
    acc, picked = 14, []
    for t in ts:
        if acc + len(t) + 2 > limit:
            break
        picked.append(t)
        acc += len(t) + 2
    return "Terms used in this meeting: " + ", ".join(picked) + "."


def decode(path):
    import numpy as np
    cmd = ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", path,
           "-f", "f32le", "-ac", "1", "-ar", "16000", "-"]
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode("utf-8", "ignore")[:200])
    return np.frombuffer(p.stdout, dtype=np.float32)


def transcribe(wav_bytes: bytes):
    global _model
    from faster_whisper import WhisperModel
    if _model is None:
        _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(wav_bytes)
        tmp = f.name
    try:
        audio = decode(tmp)
        segs, info = _model.transcribe(
            audio,
            language=LANG or None,
            initial_prompt=prompt_for(terms()) or None,
            vad_filter=True,
            beam_size=5,
            condition_on_previous_text=False,
        )
        out = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segs]
        return {"language": info.language, "duration": round(info.duration, 1), "segments": out}
    finally:
        os.unlink(tmp)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            path = "/index.html"
        fp = os.path.join(ROOT, path.lstrip("/"))
        if not os.path.isfile(fp):
            return self._send(404, b'{"error":"not found"}')
        ctype = {"html": "text/html; charset=utf-8", "js": "application/javascript",
                 "css": "text/css", "json": "application/json"}.get(fp.rsplit(".", 1)[-1], "text/plain")
        with open(fp, "rb") as f:
            self._send(200, f.read(), ctype)

    def do_OPTIONS(self):
        self._send(204, b"")

    def do_POST(self):
        if self.path.split("?")[0] != "/transcribe":
            return self._send(404, b'{"error":"not found"}')
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        ctype = self.headers.get("Content-Type", "")
        try:
            if "multipart/form-data" in ctype:
                boundary = ctype.split("boundary=")[-1].strip().encode()
                parts = raw.split(b"--" + boundary)
                wav = b""
                for p in parts:
                    if b'name="audio"' in p:
                        wav = p.split(b"\r\n\r\n", 1)[1].rsplit(b"\r\n", 1)[0]
                        break
            else:
                wav = raw
            if not wav:
                return self._send(400, b'{"error":"no audio"}')
            self._send(200, json.dumps(transcribe(wav)).encode())
        except Exception as e:
            self._send(500, json.dumps({"error": str(e)[:300]}).encode())


if __name__ == "__main__":
    print(f"meeting-notes on http://127.0.0.1:{PORT}  (model={MODEL_SIZE}, lang={LANG})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
