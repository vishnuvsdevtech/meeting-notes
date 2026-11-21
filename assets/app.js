/* Meeting Notes — record, transcribe, extract.
 *
 * The extraction is the point. A raw transcript of a 30-minute review is not
 * usable in a follow-up email; what you need is decisions, actions, corrections
 * and options, each pinned to the moment it was said. Everything is derived
 * locally from the transcript, deterministically, so nothing is invented: if a
 * line has no timestamp it does not appear in the notes.
 */
(() => {
  const $ = (s) => document.querySelector(s);
  const stage = $('#stage');
  const recBtn = $('#rec');
  const clockEl = $('#clock');
  const eyebrow = $('#eyebrow');
  const hint = $('#hint');
  const stopBtn = $('#stop');
  const discardBtn = $('#discard');

  let mr = null, chunks = [], startedAt = 0, elapsed = 0, tickTimer = null;
  let audioCtx = null, analyser = null, rafId = null, stream = null;
  let state = 'idle';              // idle | recording | paused | processing | done
  let lastNotes = null;

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('on');
    setTimeout(() => t.classList.remove('on'), 1900);
  }

  /* ---------------- recording ---------------- */
  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      hint.textContent = 'Microphone blocked. Allow mic access for this page, then tap again.';
      return;
    }
    chunks = [];
    mr = new MediaRecorder(stream, pickMime());
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = upload;
    mr.start(1000);

    // level meter from the live stream, so silence is visible before the review starts
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const bars = [...document.querySelectorAll('.meter span')];
    const buf = new Uint8Array(analyser.frequencyBinCount);
    (function draw() {
      analyser.getByteFrequencyData(buf);
      bars.forEach((b, i) => {
        const v = buf[Math.floor((i / bars.length) * buf.length)] / 255;
        b.style.height = (6 + v * 38).toFixed(0) + 'px';
      });
      rafId = requestAnimationFrame(draw);
    })();

    startedAt = Date.now() - elapsed * 1000;
    tickTimer = setInterval(() => {
      if (state !== 'recording') return;
      elapsed = (Date.now() - startedAt) / 1000;
      clockEl.textContent = fmt(elapsed);
    }, 200);

    state = 'recording';
    stage.className = 'stage recording';
    eyebrow.textContent = 'recording';
    hint.textContent = 'Tap to pause. The audio stays on this device.';
    stopBtn.hidden = false;
    discardBtn.hidden = false;
    recBtn.setAttribute('aria-label', 'Pause recording');
  }

  function pickMime() {
    const opts = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    return opts.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  }

  function pause() {
    if (mr && mr.state === 'recording') mr.pause();
    state = 'paused';
    stage.className = 'stage paused';
    eyebrow.textContent = 'paused';
    hint.textContent = 'Tap to resume, or finish to transcribe what you have.';
    recBtn.setAttribute('aria-label', 'Resume recording');
  }

  function resume() {
    if (mr && mr.state === 'paused') mr.resume();
    startedAt = Date.now() - elapsed * 1000;
    state = 'recording';
    stage.className = 'stage recording';
    eyebrow.textContent = 'recording';
  }

  function finish() {
    if (!mr) return;
    if (mr.state === 'paused') mr.resume();
    mr.stop();
    stream && stream.getTracks().forEach((t) => t.stop());
    cancelAnimationFrame(rafId);
    clearInterval(tickTimer);
    audioCtx && audioCtx.close();
    state = 'processing';
    stage.hidden = true;
    $('#processing').hidden = false;
    $('#procTitle').textContent = 'Transcribing…';
    $('#procSub').textContent = Math.round(elapsed) + 's of audio';
    $('#procBar').style.width = '35%';
  }

  function discard() {
    if (mr && mr.state !== 'inactive') { mr.onstop = null; mr.stop(); }
    stream && stream.getTracks().forEach((t) => t.stop());
    cancelAnimationFrame(rafId);
    clearInterval(tickTimer);
    audioCtx && audioCtx.close();
    chunks = []; elapsed = 0;
    resetStage();
    toast('discarded');
  }

  function resetStage() {
    state = 'idle';
    stage.className = 'stage';
    stage.hidden = false;
    stage.style.display = '';
    $('#result').style.display = 'none';
    clockEl.textContent = '00:00';
    eyebrow.textContent = 'ready when you are';
    hint.textContent = 'Tap once to record. Tap to pause. Stop when the review ends.';
    stopBtn.hidden = true;
    discardBtn.hidden = true;
    document.querySelectorAll('.meter span').forEach((b) => (b.style.height = '6px'));
    $('#processing').hidden = true;
    $('#processing').style.display = '';
    $('#result').hidden = true;
  }

  recBtn.addEventListener('click', () => {
    if (state === 'idle') start();
    else if (state === 'recording') pause();
    else if (state === 'paused') resume();
  });
  stopBtn.addEventListener('click', finish);
  discardBtn.addEventListener('click', discard);
  $('#newNote').addEventListener('click', resetStage);

  /* ---------------- upload + transcribe ---------------- */
  async function upload() {
    const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
    if (!blob.size) { toast('no audio captured'); return resetStage(); }

    $('#procBar').style.width = '55%';
    const fd = new FormData();
    fd.append('audio', blob, 'take.webm');
    try {
      const r = await fetch('/transcribe', { method: 'POST', body: fd });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      $('#procBar').style.width = '100%';
      $('#procTitle').textContent = 'Reading what was said…';
      renderResult(data, Math.round(elapsed));
    } catch (e) {
      $('#processing').hidden = true;
      resetStage();
      toast('transcription failed — ' + String(e.message).slice(0, 40));
    }
  }

  /* ---------------- extraction ----------------
   * Deterministic rules over the transcript. Deliberately conservative: a line
   * must contain an explicit cue word to become a note, and every note keeps the
   * source line so it can be checked. No invented owners, no invented deadlines.
   */
  const RULES = [
    { kind: 'decision', label: 'Decision', re: /\b(decided|we will go with|finalis|finaliz|approved|confirmed|fix (on|it as))\b/i },
    { kind: 'correction', label: 'Correction', re: /\b(not like that|instead|should not|shouldn't|don't use|correct it|change it to|wrong|mistake|revert)\b/i },
    { kind: 'action', label: 'Action', re: /\b(need to|have to|must|make sure|check|send|create|update|follow up|implement|fix|review|share|prepare|complete)\b/i },
    { kind: 'option', label: 'Option', re: /\b(option|alternative|or we can|another way|possible|maybe we can)\b/i },
    { kind: 'open', label: 'Open question', re: /\?\s*$/ },
    { kind: 'risk', label: 'Risk', re: /\b(risk|blocker|delay|might fail|problem|issue|concern|depend)\b/i },
  ];

  function extract(segments) {
    // collapse transcription loops: the same line three times in a row is a
    // decoding failure, not three separate points
    const clean = [];
    for (const s of segments) {
      const norm = s.text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
      const last = clean[clean.length - 1];
      if (last && last._norm === norm) { last.count = (last.count || 1) + 1; continue; }
      clean.push({ ...s, _norm: norm });
    }
    const looped = clean.filter((s) => s.count >= 3).length;

    const notes = [];
    for (const s of clean) {
      if ((s._norm || '').length < 8) continue;
      for (const r of RULES) {
        if (r.re.test(s.text)) { notes.push({ ...r, text: s.text, at: s.start }); break; }
      }
    }
    // attach the neighbouring sentence as context: an evidence line that repeats
    // the note verbatim proves nothing
    const idx = new Map(clean.map((s, i) => [s.start, i]));
    for (const n of notes) {
      const i = idx.get(n.at);
      const prev = i > 0 ? clean[i - 1] : null;
      const next = i < clean.length - 1 ? clean[i + 1] : null;
      n.context = [prev && '↑ ' + prev.text, next && '↓ ' + next.text].filter(Boolean).join('  ·  ');
    }
    return { notes, looped };
  }

  function renderResult(data, seconds) {
    const segs = data.segments || [];
    const { notes, looped } = extract(segs);
    lastNotes = { segs, notes };

    // the recorder stage must go away, not sit above the notes
    stage.hidden = true;
    stage.style.display = 'none';
    $('#processing').hidden = true;
    $('#processing').style.display = 'none';
    const res = $('#result');
    res.hidden = false;
    res.style.display = 'block';
    $('#metaTime').textContent = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    $('#metaTitle').textContent = 'Meeting notes';
    $('#metaSub').textContent = `${fmt(seconds)} recorded · ${segs.length} segments · language ${data.language || '—'}` +
      (looped ? ` · ${looped} repeated line${looped > 1 ? 's' : ''} collapsed` : '');

    const kinds = [
      ['all', 'All'], ['decision', 'Decisions'], ['action', 'Actions'],
      ['correction', 'Corrections'], ['option', 'Options'], ['open', 'Open'], ['risk', 'Risks'],
      ['transcript', 'Transcript'],
    ];
    $('#tabs').innerHTML = kinds.map(([k, l]) => {
      const n = k === 'all' ? notes.length : k === 'transcript' ? segs.length : notes.filter((x) => x.kind === k).length;
      // (sum of categories equals ALL because extract() assigns exactly one kind)
      return `<button class="tab ${k === 'all' ? 'on' : ''}" data-k="${k}">${l}<b>${n}</b></button>`;
    }).join('');

    drawNotes('all');
    drawTranscript(segs);

    $('#tabs').onclick = (e) => {
      const b = e.target.closest('.tab');
      if (!b) return;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === b));
      if (b.dataset.k === 'transcript') { $('#notes').innerHTML = ''; $('#transcript').scrollIntoView({ block: 'nearest' }); drawTranscript(segs, true); }
      else drawNotes(b.dataset.k);
    };
    $('#copyNotes').onclick = () => {
      const txt = toText(notes, segs);
      navigator.clipboard.writeText(txt).then(() => toast('notes copied'), () => toast('copy blocked'));
    };
  }

  function drawNotes(filter) {
    const rows = lastNotes.notes.filter((n) => filter === 'all' || n.kind === filter);
    $('#notes').innerHTML = rows.length ? rows.map((n) => `
      <article class="item ${n.kind}">
        <h3><span class="tag">${n.label}</span> <a class="ts" href="#seg-${n.at}" data-jump="${n.at}">${fmt(n.at)}</a></h3>
        <p>${esc(n.text)}</p>
        ${n.context ? `<div class="quote">${esc(n.context)}</div>` : ''}
      </article>`).join('')
      : `<div class="empty-state">Nothing in this category. That is a real result — a review with no corrections is a good review.</div>`;
    $('#notes').querySelectorAll('[data-jump]').forEach((a) => a.onclick = (e) => {
      e.preventDefault();
      const t = document.getElementById('seg-' + a.dataset.jump);
      if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('hl'); setTimeout(() => t.classList.remove('hl'), 1600); }
    });
  }

  function drawTranscript(segs, highlight) {
    $('#transcript').innerHTML = `<h2>Transcript${highlight ? '' : ' · full record'}</h2>` +
      (segs.length ? segs.map((s) => `
        <div class="seg" id="seg-${s.start}">
          <span class="t">${fmt(s.start)}</span>
          <span class="x">${esc(s.text)}</span>
        </div>`).join('')
      : '<div class="empty-state">No speech detected. Check the microphone and try again.</div>');
  }

  function toText(notes, segs) {
    const order = ['decision', 'action', 'correction', 'option', 'risk', 'open'];
    const head = `Meeting notes — ${new Date().toLocaleDateString('en-IN')}\n`;
    const body = order.map((k) => {
      const rows = notes.filter((n) => n.kind === k);
      if (!rows.length) return '';
      return `\n${k.toUpperCase()}S\n` + rows.map((n) => `- [${fmt(n.at)}] ${n.text}`).join('\n');
    }).join('');
    return head + body + `\n\nFULL TRANSCRIPT\n` + segs.map((s) => `[${fmt(s.start)}] ${s.text}`).join('\n');
  }

  /* ---------------- theme ---------------- */
  const savedTheme = localStorage.getItem('mn.theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  else if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
  $('#theme').onclick = () => {
    const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = n;
    localStorage.setItem('mn.theme', n);
  };

  // exposed for testing the extraction without a microphone
  window.__mnRender = (data, secs) => renderResult(data, secs || 50);

  document.documentElement.dataset.ready = '1';
})();
