/* POPFLASH kiosk — /kiosk (app/kiosk/route.ts).
   Runs on Safari 12.1 (iPad mini 3, iOS 12.3): plain ES2017, no bundler. No
   optional chaining, no ??, no replaceAll. Talks only to this origin's
   /kiosk/api/* handlers, which proxy to Convex, and polls instead of
   subscribing.

   Countdown timing: the Pi runs with COUNTDOWN_MS=0 (pi/README.md) — the kiosk
   owns the count — and shoots ~1.5-2s after it sees a request (subscription
   push + rpicam's 1s warm-up). So the request goes out SHUTTER_LEAD_MS before
   the on-screen count hits zero, and the shutter lands as "SMILE" appears. If
   the Pi were left at its old 3000ms default the shot would simply land ~3s
   later, and "SMILE" holds until it does. The digit ticks on a local clock; the
   network can't stutter it.

   Printing: every capture carries {burstId, seq, framesTotal}. When the Pi
   writes the last frame of a 4-frame burst it drops a print job on its local
   spool (scripts/pi-listener.mjs → pi/booth_print_agent.py), before it even
   uploads — so the strips print automatically, with no request from here. The
   handoff screen then polls the agent's status report to say when they're out. */
(function () {
  'use strict';

  var cfg = window.KIOSK || {};
  var SHOTS = cfg.shots || 4;
  var DEMO = !!cfg.demo;

  var COUNTDOWN_MS = 3000;
  var SHUTTER_LEAD_MS = 1800; // request → Pi shutter, with COUNTDOWN_MS=0 on the Pi
  var HOLD_MS = 1300; // the landed photo, shown big
  var FLY_MS = 450; // ...then shrinking into its strip slot
  var POLL_MS = 500;
  var PRINT_POLL_MS = 2000;
  var STAGE_TIMEOUT_MS = 20000; // per Pi stage; a silent listener fails visibly

  function $(id) {
    return document.getElementById(id);
  }

  var el = {
    chipDemo: $('chip-demo'),
    chipReconnect: $('chip-reconnect'),
    chipCode: $('chip-code'),
    screens: {
      idle: $('screen-idle'),
      shoot: $('screen-shoot'),
      done: $('screen-done'),
      fail: $('screen-fail'),
      offline: $('screen-offline'),
    },
    start: $('start'),
    startTitle: $('start-title'),
    pipsLabel: $('pips-label'),
    pips: $('pips'),
    num: $('num'),
    look: $('look'),
    smile: $('smile'),
    big: $('big'),
    bigFrame: $('big-frame'),
    bigImg: $('big-img'),
    gotit: $('gotit'),
    strip: $('strip'),
    donePhotos: $('done-photos'),
    qr: $('qr'),
    doneCode: $('done-code'),
    printState: $('print-state'),
    next: $('next'),
    failMsg: $('fail-msg'),
    retry: $('retry'),
    keep: $('keep'),
    reload: $('reload'),
    flash: $('flash'),
  };

  // --- booth adapters ---------------------------------------------------------

  function api(path, options) {
    return fetch(path, options).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body && body.error ? body.error : 'HTTP ' + res.status);
        return body;
      });
    });
  }

  var live = {
    createSession: function () {
      return api('/kiosk/api/session', { method: 'POST' });
    },
    requestCapture: function (token, burst) {
      return api('/kiosk/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token,
          burstId: burst.burstId,
          seq: burst.seq,
          framesTotal: burst.framesTotal,
        }),
      }).then(function (body) {
        return body.requestId;
      });
    },
    getState: function (token) {
      // Cache-buster: some iOS versions cache same-URL GETs regardless of headers.
      return api('/kiosk/api/state?token=' + encodeURIComponent(token) + '&_=' + Date.now());
    },
  };

  // The Pi's timeline, simulated: 3s countdown, shutter, upload, frame lands.
  var demo = (function () {
    var seq = 0;
    var capture = null;
    var photos = [];
    var print = null;
    var pending = [];
    function at(ms, fn) {
      pending.push(setTimeout(fn, ms));
    }
    return {
      createSession: function () {
        pending.forEach(clearTimeout);
        pending = [];
        capture = null;
        photos = [];
        print = null;
        return api('/kiosk/api/session?demo=1', { method: 'POST' });
      },
      // Mirrors the Pi with COUNTDOWN_MS=0: claim, ~1.5s to the shutter, upload.
      requestCapture: function (token, burst) {
        var id = 'demo-' + ++seq;
        capture = { requestId: id, status: 'counting_down', error: null };
        at(1500, function () {
          capture = { requestId: id, status: 'capturing', error: null };
        });
        at(2100, function () {
          capture = { requestId: id, status: 'uploading', error: null };
        });
        at(2700, function () {
          photos[burst.seq] = fakePhoto(burst.seq + 1);
          capture = { requestId: id, status: 'complete', error: null };
        });
        // The last frame of a full strip queues a sheet; a SELPHY pass is ~41s,
        // shortened here so the handoff screen's states can be seen.
        if (burst.seq === burst.framesTotal - 1 && burst.framesTotal === 4) {
          at(2700, function () {
            print = { status: 'queued', detail: null, error: null };
          });
          at(4500, function () {
            print = { status: 'printing', detail: 'job 1', error: null };
          });
          at(12000, function () {
            print = { status: 'printed', detail: null, error: null };
          });
        }
        return Promise.resolve(id);
      },
      getState: function () {
        return Promise.resolve({ capture: capture, photos: photos.filter(Boolean), print: print });
      },
    };
  })();

  var booth = DEMO ? demo : live;

  function fakePhoto(seed) {
    var canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 450;
    var ctx = canvas.getContext('2d');
    var hue = (seed * 47) % 360;
    var g = ctx.createLinearGradient(0, 0, 800, 450);
    g.addColorStop(0, 'hsl(' + hue + ', 45%, 70%)');
    g.addColorStop(1, 'hsl(' + ((hue + 60) % 360) + ', 45%, 45%)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 800, 450);
    ctx.fillStyle = 'hsl(' + ((hue + 180) % 360) + ', 55%, 82%)';
    ctx.beginPath();
    ctx.arc(400, 210, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Demo capture ' + seed, 400, 410);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  // --- state --------------------------------------------------------------------

  var session = null; // { token, shortCode, qr }
  var generation = 0; // bumped per guest so a late session mint can't leak in
  var burstId = null; // one per run of SHOTS; a retried shot re-sends it
  var run = null; // { shot, requestId, startedAt, sent, status, landed }
  var strip = []; // url per landed shot, by slot
  var timers = { tick: null, poll: null, stage: null, hold: null, print: null };

  function clearTimers() {
    clearInterval(timers.tick);
    clearInterval(timers.poll);
    clearInterval(timers.print);
    clearTimeout(timers.stage);
    clearTimeout(timers.hold);
    timers.tick = timers.poll = timers.print = timers.stage = timers.hold = null;
  }

  function mintBurstId() {
    return 'kiosk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function setScreen(name) {
    Object.keys(el.screens).forEach(function (key) {
      el.screens[key].hidden = key !== name;
    });
    el.chipCode.hidden = name === 'shoot' || !session;
  }

  function showStage(name) {
    el.num.hidden = name !== 'num';
    el.look.hidden = name !== 'num';
    el.smile.hidden = name !== 'smile';
    el.big.hidden = name !== 'big';
  }

  // --- guest lifecycle --------------------------------------------------------------

  function boot() {
    generation += 1;
    var mine = generation;
    clearTimers();
    session = null;
    run = null;
    burstId = null;
    strip = [];
    buildStrip();
    el.printState.hidden = true;
    el.start.disabled = true;
    el.startTitle.textContent = 'Warming up…';
    setScreen('idle');

    booth.createSession().then(
      function (minted) {
        if (mine !== generation) return;
        session = minted;
        el.start.disabled = false;
        el.startTitle.textContent = 'Take Photos';
        el.chipCode.textContent = minted.shortCode;
        el.chipCode.hidden = false;
        el.qr.src = minted.qr;
        el.doneCode.textContent = minted.shortCode;
      },
      function (error) {
        console.error('[kiosk] could not start a session:', error);
        if (mine === generation) setScreen('offline');
      },
    );
  }

  function fire(shot) {
    clearTimers();
    run = { shot: shot, requestId: null, startedAt: Date.now(), sent: false, status: 'armed', landed: false };
    lastDigit = null;
    setScreen('shoot');
    renderPips(shot);
    showStage('num');
    tick();
    timers.tick = setInterval(tick, 100);
  }

  // The request itself. Called from the ticker SHUTTER_LEAD_MS before zero, so
  // the Pi's shutter (which fires ~1.5-2s after it sees the row) lands on
  // "SMILE" rather than on "2".
  function sendCapture() {
    if (!run || run.sent) return;
    run.sent = true;
    run.status = 'sent';
    timers.poll = setInterval(poll, POLL_MS);
    armStageTimeout();

    var mine = run;
    var burst = { burstId: burstId, seq: run.shot - 1, framesTotal: SHOTS };
    booth.requestCapture(session.token, burst).then(
      function (requestId) {
        if (run === mine) run.requestId = requestId;
      },
      function (error) {
        console.error('[kiosk] capture request failed:', error);
        if (run === mine && !run.landed) fail("We couldn't reach the booth. " + (error && error.message ? error.message : ''));
      },
    );
  }

  var lastDigit = null;
  function tick() {
    if (!run || run.landed) return;
    var elapsed = Date.now() - run.startedAt;
    if (!run.sent && elapsed >= COUNTDOWN_MS - SHUTTER_LEAD_MS) sendCapture();
    var left = Math.ceil((COUNTDOWN_MS - elapsed) / 1000);
    if (left > 0) {
      if (left !== lastDigit) {
        lastDigit = left;
        setNumeral(left);
      }
    } else {
      // "SMILE" holds past zero until the Pi reports the frame landed, so a slow
      // shutter never leaves the screen ahead of the camera.
      clearInterval(timers.tick);
      timers.tick = null;
      sendCapture(); // only if the lead ever exceeds the count
      showStage('smile');
    }
  }

  // Re-created per digit so the slam animation replays.
  function setNumeral(n) {
    var fresh = el.num.cloneNode(false);
    fresh.hidden = false;
    fresh.textContent = String(n);
    el.num.parentNode.replaceChild(fresh, el.num);
    el.num = fresh;
  }

  function poll() {
    if (!run || run.landed || !session) return;
    var mine = run;
    booth.getState(session.token).then(
      function (state) {
        el.chipReconnect.hidden = true;
        if (run !== mine || run.landed) return;
        var capture = state.capture;
        if (!capture || !run.requestId || capture.requestId !== run.requestId) return;
        if (capture.status !== run.status) {
          run.status = capture.status;
          armStageTimeout();
        }
        if (capture.status === 'failed') {
          fail(capture.error || "That one didn't take.");
        } else if (capture.status === 'complete') {
          var photos = state.photos || [];
          landed(photos[photos.length - 1] || '');
        }
      },
      function (error) {
        console.warn('[kiosk] poll failed:', error);
        el.chipReconnect.hidden = false;
      },
    );
  }

  function armStageTimeout() {
    clearTimeout(timers.stage);
    timers.stage = setTimeout(function () {
      if (!run || run.landed) return;
      // Say which stage stalled: "never picked it up" is the listener being
      // down or busy; a stall at uploading is the Pi's link to Convex.
      var stage = run.status === 'sent' ? 'never picked the request up' : 'stalled at ' + run.status.replace('_', ' ');
      fail("The booth didn't answer (" + stage + ').');
    }, STAGE_TIMEOUT_MS);
  }

  // The frame landed: flash, show it big with the stamp, hold, then fly it down
  // into its slot and move on.
  function landed(url) {
    run.landed = true;
    clearTimers();
    var shot = run.shot;
    strip[shot - 1] = url;

    flash();
    el.bigImg.src = url;
    el.gotit.hidden = false;
    showStage('big');
    renderPips(shot, true);

    timers.hold = setTimeout(function () {
      flyToSlot(shot, url, function () {
        if (shot < SHOTS) fire(shot + 1);
        else finish();
      });
    }, HOLD_MS);
  }

  // FLIP: measure where the big frame is and where its slot is, then transition
  // the frame's transform between them. Uniform scale, since both are 16:9.
  function flyToSlot(shot, url, done) {
    var slot = el.strip.children[shot - 1];
    var frame = el.bigFrame;
    var from = frame.getBoundingClientRect();
    var to = slot.getBoundingClientRect();
    el.gotit.hidden = true;
    frame.style.transformOrigin = '0 0';
    frame.style.transition = 'transform ' + FLY_MS + 'ms cubic-bezier(0.2, 0.7, 0.2, 1)';
    frame.getBoundingClientRect(); // commit the start state before transitioning
    frame.style.transform =
      'translate(' + (to.left - from.left) + 'px, ' + (to.top - from.top) + 'px) ' +
      'scale(' + to.width / from.width + ', ' + to.height / from.height + ')';

    setTimeout(function () {
      fillSlot(slot, url);
      frame.style.transition = '';
      frame.style.transform = '';
      showStage('none');
      done();
    }, FLY_MS);
  }

  function finish() {
    run = null;
    clearTimers();
    el.donePhotos.innerHTML = '';
    strip.forEach(function (url) {
      if (!url) return;
      var tile = document.createElement('div');
      tile.className = 'tile';
      var img = document.createElement('img');
      img.src = url;
      img.alt = '';
      tile.appendChild(img);
      el.donePhotos.appendChild(tile);
    });
    setScreen('done');
    // Every frame of a full strip is on the Pi's disk, so the sheet is already
    // queued locally; from here we only mirror what the print agent reports.
    if (strip.filter(Boolean).length === SHOTS && SHOTS === 4) {
      renderPrintState({ status: 'queued' });
      pollPrint();
      timers.print = setInterval(pollPrint, PRINT_POLL_MS);
    }
  }

  function pollPrint() {
    if (!session) return;
    var mine = generation;
    booth.getState(session.token).then(
      function (state) {
        if (mine !== generation || !state.print) return;
        renderPrintState(state.print);
        if (state.print.status === 'printed' || state.print.status === 'failed') {
          clearInterval(timers.print);
          timers.print = null;
        }
      },
      function () {},
    );
  }

  var PRINT_LABELS = {
    queued: ['is-busy', '🖨 Printing your strips…'],
    composing: ['is-busy', '🖨 Printing your strips…'],
    printing: ['is-busy', '🖨 Printing your strips…'],
    printed: ['is-out', '✂ Strips are out — grab them!'],
    blocked: ['is-blocked', '⚠ Printer needs attention'],
    failed: ['is-blocked', "⚠ Print didn't finish — photos are on your phone"],
  };
  function renderPrintState(print) {
    var entry = PRINT_LABELS[print.status] || ['is-busy', '🖨 ' + print.status];
    el.printState.className = 'print-state ' + entry[0];
    el.printState.textContent = entry[1];
    el.printState.hidden = false;
  }

  var failedShot = 1;
  function fail(message) {
    failedShot = run ? run.shot : 1;
    if (run) run.landed = true; // stop reacting to this shot
    clearTimers();
    el.failMsg.textContent = message + ' (Shot ' + failedShot + ' of ' + SHOTS + '.)';
    el.keep.hidden = strip.filter(Boolean).length === 0;
    setScreen('fail');
  }

  // --- rendering ----------------------------------------------------------------------

  function buildStrip() {
    el.strip.innerHTML = '';
    for (var i = 0; i < SHOTS; i++) {
      var slot = document.createElement('div');
      slot.className = 'slot';
      slot.textContent = String(i + 1);
      el.strip.appendChild(slot);
    }
  }

  function fillSlot(slot, url) {
    slot.textContent = '';
    slot.className = 'slot is-filled';
    var img = document.createElement('img');
    img.src = url;
    img.alt = '';
    slot.appendChild(img);
  }

  function renderPips(shot, currentDone) {
    el.pipsLabel.textContent = 'Shot ' + shot + ' of ' + SHOTS;
    el.pips.innerHTML = '';
    for (var i = 1; i <= SHOTS; i++) {
      var pip = document.createElement('span');
      pip.className = 'pip' + (i < shot || (i === shot && currentDone) ? ' is-done' : i === shot ? ' is-current' : '');
      el.pips.appendChild(pip);
    }
  }

  function flash() {
    el.flash.classList.remove('go');
    void el.flash.offsetWidth; // restart the animation
    el.flash.classList.add('go');
  }

  // --- wiring ---------------------------------------------------------------------------

  el.start.addEventListener('click', function () {
    if (!session || run) return;
    burstId = mintBurstId();
    fire(1);
  });
  el.retry.addEventListener('click', function () {
    fire(failedShot);
  });
  el.keep.addEventListener('click', finish);
  el.next.addEventListener('click', boot);
  el.reload.addEventListener('click', function () {
    window.location.reload();
  });

  // iOS only styles :active on touch when something listens for touchstart.
  document.addEventListener('touchstart', function () {}, { passive: true });
  // No double-tap zoom on a kiosk. (The viewport meta asks too, but iOS Safari
  // has ignored user-scalable=no since iOS 10.)
  var lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    function (event) {
      var now = Date.now();
      if (now - lastTouchEnd < 350) event.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );

  // Swap in Archivo Black once it has actually loaded (see .display in kiosk.css).
  if (document.fonts && document.fonts.load) {
    document.fonts.load("1em 'Archivo Black'").then(
      function (faces) {
        if (faces.length) document.documentElement.classList.add('fonts-ready');
      },
      function () {},
    );
  }

  el.chipDemo.hidden = !DEMO;
  boot();
})();
