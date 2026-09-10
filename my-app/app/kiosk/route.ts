// GET /kiosk — the iPad kiosk, served as a hand-written HTML document.
//
// This is a route handler rather than a page on purpose. The kiosk runs on an
// iPad mini 3 (iOS 12.3, Safari 12.1), which can't parse anything the rest of
// the app is built from: Next's client bundle (optional chaining), Tailwind v4
// (cascade layers, @property) and the Convex client. So this route sends a
// document with no React, no bundle and no Tailwind — just /kiosk.css and
// /kiosk.js from public/, written to that browser's limits, talking to the
// /kiosk/api/* handlers beside it. Every other page is untouched.
//
// Shots default to 4; ?shots=N (1-8) overrides. ?demo=1 (or NEXT_PUBLIC_NOBOOTH)
// runs the whole loop against a simulated booth.

const DEFAULT_SHOTS = 4;
const MAX_SHOTS = 8;

// Strip themes the guest can pick before pressing start. `key` must exist in
// THEMES in photobooth_print.py — that's what the Pi's print agent looks up;
// an unknown key there falls back to the event default, so add the Python
// side first. The colours here only paint the chip; the strip's real look is
// defined in Python.
const THEMES = [
  { key: 'thunderfest', label: 'Thunderfest', bg: '#003a70', fg: '#ffb81c' },
  { key: 'vikes', label: 'Go Vikes', bg: '#ffb81c', fg: '#003a70' },
  { key: 'popflash', label: 'Popflash', bg: '#ffde03', fg: '#000000' },
  { key: 'midnight', label: 'Midnight', bg: '#000000', fg: '#ffffff' },
  { key: 'classic', label: 'Classic', bg: '#ffffff', fg: '#191919' },
] as const;
const DEFAULT_THEME = 'thunderfest';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requested = Number(params.get('shots'));
  const shots = Number.isInteger(requested) && requested >= 1 && requested <= MAX_SHOTS ? requested : DEFAULT_SHOTS;
  const demo = params.get('demo') === '1' || process.env.NEXT_PUBLIC_NOBOOTH === '1';

  return new Response(render({ shots, demo }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function render({ shots, demo }: { shots: number; demo: boolean }): string {
  // Numbers, a boolean and hard-coded slugs go into the page; nothing from the
  // request, so no escaping is needed.
  const config = JSON.stringify({ shots, demo, theme: DEFAULT_THEME });
  const themeChips = THEMES.map(
    (t) =>
      `<button type="button" class="theme${t.key === DEFAULT_THEME ? ' is-selected' : ''}" data-theme="${t.key}" ` +
      `style="background:${t.bg};color:${t.fg}" role="radio" aria-checked="${t.key === DEFAULT_THEME}">${t.label}</button>`,
  ).join('\n      ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="POPFLASH">
<meta name="theme-color" content="#ffde03">
<title>POPFLASH — Kiosk</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&amp;family=Space+Grotesk:wght@500;700&amp;display=swap">
<link rel="stylesheet" href="/kiosk.css">
</head>
<body>
<div id="app">
  <div id="flash" aria-hidden="true"></div>

  <header class="top">
    <span class="wordmark display">POP<span class="pink">FLASH</span></span>
    <span class="chips">
      <span id="chip-demo" class="chip chip-violet" hidden>DEMO MODE</span>
      <span id="chip-reconnect" class="chip chip-paper" hidden>RECONNECTING…</span>
      <span id="chip-code" class="chip chip-paper mono" hidden></span>
    </span>
  </header>

  <section id="screen-idle" class="screen">
    <p class="sticker">📸 STEP UP · LOOK AT THE CAMERA</p>
    <div class="themes-wrap">
      <span class="themes-label">PICK YOUR FRAME</span>
      <div id="themes" class="themes" role="radiogroup" aria-label="Strip frame">
      ${themeChips}
      </div>
    </div>
    <div class="nudge">
      <button id="start" class="start" type="button" disabled>
        <span id="start-title" class="start-title display">Warming up…</span>
        <span class="start-sub">${shots} SHOTS · 3-2-1 EACH TIME</span>
      </button>
    </div>
    <p class="hint">You’ll get a QR at the end — scan it and every photo lands on your phone.</p>
  </section>

  <section id="screen-shoot" class="screen shoot" hidden>
    <div class="pips">
      <span id="pips-label" class="pips-label display"></span>
      <span id="pips" class="pips-boxes"></span>
    </div>
    <div id="stage" class="stage" aria-live="assertive">
      <div id="num" class="num display" hidden></div>
      <p id="look" class="look" hidden>Look at the camera</p>
      <div id="smile" class="smile display" hidden>Smile!</div>
      <div id="big" class="big" hidden>
        <div id="big-frame" class="big-frame"><img id="big-img" alt=""></div>
        <div id="gotit" class="gotit display">Got it!</div>
      </div>
    </div>
    <div id="strip" class="strip"></div>
  </section>

  <section id="screen-done" class="screen done" hidden>
    <div id="done-photos" class="done-photos"></div>
    <div class="done-side">
      <h2 class="h2 display">Scan for your pics</h2>
      <p class="sub">Every shot, plus AI styles, on your phone.</p>
      <div class="qr-plate"><img id="qr" alt="Scan for your photos"></div>
      <p id="done-code" class="code mono"></p>
      <p id="print-state" class="print-state" hidden></p>
      <button id="next" class="btn btn-ink display" type="button">Next guest →</button>
    </div>
  </section>

  <section id="screen-fail" class="screen" hidden role="alert">
    <div class="panel panel-pink">
      <h2 class="h2 display outline">That one didn’t take</h2>
      <p id="fail-msg" class="panel-body"></p>
    </div>
    <div class="row">
      <button id="retry" class="btn btn-ink display" type="button">Try again</button>
      <button id="keep" class="btn btn-paper display" type="button" hidden>Use what we got</button>
    </div>
  </section>

  <section id="screen-offline" class="screen" hidden role="alert">
    <div class="panel panel-paper">
      <h2 class="h2 display">Booth offline</h2>
      <p class="panel-body">Couldn’t start a session. Check the connection, then reload this screen.</p>
    </div>
    <button id="reload" class="btn btn-ink display" type="button">Reload</button>
  </section>
</div>
<script>window.KIOSK = ${config};</script>
<script src="/kiosk.js"></script>
</body>
</html>
`;
}
