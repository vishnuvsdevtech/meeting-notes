/* Static demo mode: no server, no microphone. Shows the real interface with a
   sample transcript so the layout and extraction can be reviewed publicly.
   The local version (server.py) adds recording + Whisper transcription. */
(() => {
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:80;background:#a2601c;color:#fff;' +
    'font:11px ui-monospace,monospace;letter-spacing:.06em;padding:9px 14px;text-align:center';
  banner.textContent = 'DEMO · sample transcript, no microphone. Recording + Whisper run locally via server.py';
  document.body.appendChild(banner);

  const SAMPLE = { language: 'ml', segments: [
    { start: 3.2, end: 9.1, text: 'Thor device internal storage ഉണ്ട്, അതിൽ store ചെയ്യാം' },
    { start: 9.4, end: 15.8, text: 'Second option external disk, USB ലൂടെ SSD അല്ലെങ്കിൽ hard disk' },
    { start: 16.1, end: 22.0, text: 'Third option NAS, Local Area Network based storage' },
    { start: 22.4, end: 28.0, text: 'Fourth option cloud storage ആണ്' },
    { start: 28.5, end: 33.0, text: 'അതിന് വേണ്ടി ഒരു ticket create ചെയ്യൂ' },
    { start: 33.2, end: 37.0, text: 'അതിന് വേണ്ടി ഒരു ticket create ചെയ്യൂ' },
    { start: 37.2, end: 40.9, text: 'അതിന് വേണ്ടി ഒരു ticket create ചെയ്യൂ' },
    { start: 41.0, end: 46.0, text: 'This is wrong, change it to NFS v4 instead' },
    { start: 46.5, end: 50.0, text: 'Any risk with deployment pipeline?' },
  ] };

  function kick() {
    if (typeof window.__mnRender === 'function') { window.__mnRender(SAMPLE, 50); return true; }
    return false;
  }
  if (!kick()) setTimeout(kick, 300);
})();
