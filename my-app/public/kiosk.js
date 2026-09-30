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
   handoff screen then polls the agent's status report to say when they're out.

   Paying: when the session mint comes back with a `price`, the button reads
   "$5.00 · TAP TO PAY" and pressing it opens the Square Point of Sale app ON
   THIS IPAD (Square's POS API deep link; needs iPadOS 17.1+, Square POS signed
   in, the Reader paired, and this page in a Safari tab — Square returns to
   Safari, never to a Home-Screen app). The guest taps their card, Square comes
   back through /pay/callback, which reloads us as /kiosk?resume=<token>&result=…
   and we pick the guest's session back up and start the count. Meanwhile the
   idle screen also polls /kiosk/api/state, so a charge taken on the operator's
   phone (/pay) unlocks the button too. The server refuses the shutter for an
   unpaid session regardless — the button is UX, not enforcement.

   /prepaid-kiosk serves this same script with cfg.prepaid: the mint asks for a
   prepaid session (plus cfg.key if the event gates it), comes back with no
   price, and the whole payment branch above is simply never entered. */
(function () {
  'use strict';

  var cfg = window.KIOSK || {};
  var SHOTS = cfg.shots || 4;
  var DEMO = !!cfg.demo;
  // Strip theme key, sent with every capture so the Pi prints in it. Starts on
  // the server's default; the picker on the idle screen changes it per guest.
  var theme = cfg.theme || 'thunderfest';
  // Square: public ids for the deep link (null = no Application ID configured),
  // and the one-shot return-from-Square state the server pulled off the URL.
  var SQUARE = cfg.square || null;
  var PREPAID = !!cfg.prepaid;
  var PREPAID_KEY = cfg.key || null;
  var RESUME = cfg.resume || null;
  var RESUME_THEME = cfg.resumeTheme || null;
  var RESULT = cfg.result || null;
  var RESULT_ERROR = cfg.error || null;

  var COUNTDOWN_MS = 3000;
  var SHUTTER_LEAD_MS = 1800; // request → Pi shutter, with COUNTDOWN_MS=0 on the Pi
  var HOLD_MS = 1300; // the landed photo, shown big
  var FLY_MS = 450; // ...then shrinking into its strip slot
  var POLL_MS = 500;
  var PRINT_POLL_MS = 2000;
  var PAY_POLL_MS = 2000;
  var PAY_LAUNCH_TIMEOUT_MS = 2500; // Square POS not in the foreground by then = not installed / blocked
  var PAID_BEAT_MS = 1500; // "Paid ✓ — get ready!" before the first count
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
    startSub: $('start-sub'),
    payNote: $('pay-note'),
    themes: $('themes'),
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
    // `resume` re-adopts the session we were serving before Square took over
    // the screen; undefined mints a fresh one.
    createSession: function (resume) {
      return api('/kiosk/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mintBody(resume)),
      });
    },
    // Live charging navigates away to Square POS (see startPayment); nothing to do here.
    charge: null,
    requestCapture: function (token, burst) {
      return api('/kiosk/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token,
          burstId: burst.burstId,
          seq: burst.seq,
          framesTotal: burst.framesTotal,
          theme: burst.theme,
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
    var paidAt = Infinity;
    var pending = [];
    function at(ms, fn) {
      pending.push(setTimeout(fn, ms));
    }
    return {
      createSession: function (resume) {
        pending.forEach(clearTimeout);
        pending = [];
        capture = null;
        photos = [];
        print = null;
        paidAt = Infinity;
        return api('/kiosk/api/session?demo=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mintBody(resume)),
        });
      },
      // Stands in for Square POS: the "card" lands two seconds after the tap.
      charge: function () {
        paidAt = Date.now() + 2000;
        return Promise.resolve();
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
        return Promise.resolve({
          paid: Date.now() >= paidAt,
          capture: capture,
          photos: photos.filter(Boolean),
          print: print,
        });
      },
    };
  })();

  var booth = DEMO ? demo : live;

  function mintBody(resume) {
    var body = {};
    if (resume) body.resume = resume;
    if (PREPAID) {
      body.prepaid = true;
      if (PREPAID_KEY) body.key = PREPAID_KEY;
    }
    return body;
  }

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
  var timers = { tick: null, poll: null, stage: null, hold: null, print: null, pay: null, launch: null };
  var START_SUB = el.startSub.textContent; // "4 SHOTS · 3-2-1 EACH TIME"
  var price = null; // { cents, currency } while payments are on, else null
  var paid = false; // this session may shoot (always true with no price)
  var awaitingPay = false; // we sent the guest to Square (or the demo's stand-in) and are waiting
  var handedOff = false; // this document navigated to Square POS and may be a stale background tab

  function clearTimers() {
    clearInterval(timers.tick);
    clearInterval(timers.poll);
    clearInterval(timers.print);
    clearInterval(timers.pay);
    clearTimeout(timers.stage);
    clearTimeout(timers.hold);
    clearTimeout(timers.launch);
    timers.tick = timers.poll = timers.print = timers.pay = timers.stage = timers.hold = timers.launch = null;
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

  // `resume` is the token we were serving before Square POS took the screen;
  // absent for a fresh guest.
  function boot(resume) {
    generation += 1;
    var mine = generation;
    clearTimers();
    session = null;
    run = null;
    burstId = null;
    strip = [];
    price = null;
    paid = false;
    awaitingPay = false;
    handedOff = false;
    buildStrip();
    el.printState.hidden = true;
    hidePayNote();
    selectTheme((resume && RESUME_THEME) || cfg.theme || 'thunderfest');
    el.start.disabled = true;
    el.startTitle.textContent = 'Warming up…';
    el.startSub.textContent = START_SUB;
    setScreen('idle');

    // The return-from-Square URL is consumed exactly once: the next guest gets
    // a clean /kiosk, and a reload can't replay a "paid" result.
    var returned = resume ? { result: RESULT, error: RESULT_ERROR } : null;
    RESUME = RESULT = RESULT_ERROR = RESUME_THEME = null;
    if (resume && window.history && window.history.replaceState) {
      var keep = [];
      if (SHOTS !== 4) keep.push('shots=' + SHOTS);
      if (cfg.demo) keep.push('demo=1');
      window.history.replaceState(null, '', window.location.pathname + (keep.length ? '?' + keep.join('&') : ''));
    }

    booth.createSession(resume).then(
      function (minted) {
        if (mine !== generation) return;
        session = minted;
        price = minted.price && minted.price.cents > 0 ? minted.price : null;
        paid = !price || !!minted.paid;
        el.chipCode.textContent = minted.shortCode;
        el.chipCode.hidden = false;
        el.qr.src = minted.qr;
        el.doneCode.textContent = minted.shortCode;
        setStartCopy();
        el.start.disabled = false;
        if (!paid) timers.pay = setInterval(pollPaid, PAY_POLL_MS);

        if (returned && minted.resumed) {
          if (paid) paidBeat();
          else if (returned.result === 'failed') showPayNote(describePayError(returned.error), 'bad');
          else showPayNote('Payment is still pending — tap to try again', 'bad');
        }
      },
      function (error) {
        console.error('[kiosk] could not start a session:', error);
        if (mine === generation) setScreen('offline');
      },
    );
  }

  // --- paying ---------------------------------------------------------------------

  // Dollar-sign currencies show as "$5.00" (this booth is in Canada as often as
  // not); anything else shows its code.
  function money(p) {
    var n = (p.cents / 100).toFixed(2);
    var dollar = ['USD', 'CAD', 'AUD', 'NZD'].indexOf(p.currency) !== -1;
    return dollar ? '$' + n : n + ' ' + p.currency;
  }

  function setStartCopy() {
    el.startTitle.textContent = 'Take Photos';
    el.startSub.textContent = price && !paid ? money(price) + ' · TAP TO PAY · ' + START_SUB : START_SUB;
  }

  function showPayNote(text, tone) {
    el.payNote.className = 'pay-note' + (tone ? ' is-' + tone : '');
    el.payNote.textContent = text;
    el.payNote.hidden = false;
  }
  function hidePayNote() {
    el.payNote.hidden = true;
  }

  // Idle-screen poll: a charge taken elsewhere (the operator's /pay page, or
  // the demo's stand-in for Square) shows up here.
  function pollPaid() {
    if (!session || run || paid) return;
    var mine = generation;
    booth.getState(session.token).then(
      function (state) {
        if (mine !== generation || run || paid) return;
        el.chipReconnect.hidden = true;
        if (!state.paid) return;
        if (awaitingPay) paidBeat();
        else {
          paid = true;
          clearInterval(timers.pay);
          timers.pay = null;
          setStartCopy();
          showPayNote('Paid ✓ — tap to start', 'good');
        }
      },
      function (error) {
        console.warn('[kiosk] paid poll failed:', error);
        el.chipReconnect.hidden = false;
      },
    );
  }

  // Payment landed while the guest is standing here: a short beat, then shoot.
  function paidBeat() {
    paid = true;
    awaitingPay = false;
    clearInterval(timers.pay);
    clearTimeout(timers.launch);
    timers.pay = timers.launch = null;
    setStartCopy();
    el.start.disabled = true;
    showPayNote('Paid ✓ — get ready!', 'good');
    timers.hold = setTimeout(function () {
      hidePayNote();
      burstId = mintBurstId();
      fire(1);
    }, PAID_BEAT_MS);
  }

  // The Start press when the session isn't paid yet: hand the screen to Square
  // POS. We come back as a fresh page load — see boot(resume).
  function startPayment() {
    if (!session || run || awaitingPay) return;
    awaitingPay = true;
    el.start.disabled = true;

    if (booth.charge) {
      showPayNote('Tap your card on the reader…', 'busy');
      booth.charge();
      return;
    }

    var problem = null;
    if (!SQUARE) problem = "Square isn't set up on this kiosk (no Application ID)";
    else if (window.location.protocol !== 'https:') problem = 'Square needs this page on HTTPS';
    else if (posPlatform() === 'other') problem = 'Square POS runs on iPad or Android only';
    if (problem) {
      awaitingPay = false;
      el.start.disabled = false;
      showPayNote(problem, 'bad');
      return;
    }

    showPayNote('Opening Square…', 'busy');
    // If Square POS hasn't taken the foreground by then, it isn't installed or
    // signed in; iOS gives no error for a URL scheme nobody handles.
    timers.launch = setTimeout(function () {
      if (document.visibilityState !== 'visible') return;
      awaitingPay = false;
      el.start.disabled = false;
      showPayNote("Square POS didn't open — is it installed and signed in on this iPad?", 'bad');
    }, PAY_LAUNCH_TIMEOUT_MS);

    var charge = {
      amountCents: price.cents,
      currency: price.currency,
      callbackUrl: window.location.origin + '/pay/callback', // the registered Web Callback URL
      state: JSON.stringify({ surface: 'kiosk', token: session.token, shots: SHOTS, theme: theme }),
      note: 'Photobooth ' + session.shortCode,
    };
    // From here this document is expendable: Square returns via /pay/callback
    // as a NEW page load, possibly in a new Safari tab. Stop polling so a
    // stale background tab can never see "paid" and start its own countdown.
    handedOff = true;
    clearInterval(timers.pay);
    timers.pay = null;
    window.location.href = posPlatform() === 'android' ? androidPosUrl(charge) : iosPosUrl(charge);
  }

  function posPlatform() {
    var ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
    // iPadOS Safari claims to be a Mac; touch tells them apart.
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'other';
  }

  // ES2017 twins of lib/squarePos.ts (this file can't import it). Keep in step.
  function iosPosUrl(c) {
    var data = {
      amount_money: { amount: String(c.amountCents), currency_code: c.currency },
      callback_url: c.callbackUrl,
      client_id: SQUARE.applicationId,
      version: '1.3',
      state: c.state,
      notes: c.note,
      options: { supported_tender_types: ['CREDIT_CARD'], auto_return: true, skip_receipt: false },
    };
    if (SQUARE.locationId) data.location_id = SQUARE.locationId;
    return 'square-commerce-v1://payment/create?data=' + encodeURIComponent(JSON.stringify(data));
  }
  function androidPosUrl(c) {
    var parts = [
      'action=com.squareup.pos.action.CHARGE',
      'package=com.squareup',
      'S.com.squareup.pos.WEB_CALLBACK_URI=' + encodeURIComponent(c.callbackUrl),
      'S.com.squareup.pos.CLIENT_ID=' + encodeURIComponent(SQUARE.applicationId),
      'S.com.squareup.pos.API_VERSION=v2.0',
      'i.com.squareup.pos.TOTAL_AMOUNT=' + String(c.amountCents),
      'S.com.squareup.pos.CURRENCY_CODE=' + c.currency,
      'S.com.squareup.pos.TENDER_TYPES=com.squareup.pos.TENDER_CARD',
      'S.com.squareup.pos.REQUEST_METADATA=' + encodeURIComponent(c.state),
      'S.com.squareup.pos.NOTE=' + encodeURIComponent(c.note),
      'l.com.squareup.pos.AUTO_RETURN_TIMEOUT_MS=3200',
    ];
    if (SQUARE.locationId) parts.push('S.com.squareup.pos.LOCATION_ID=' + encodeURIComponent(SQUARE.locationId));
    return 'intent:#Intent;' + parts.join(';') + ';end';
  }

  var PAY_ERRORS = {
    payment_canceled: 'Payment cancelled — tap to try again',
    transaction_canceled: 'Payment cancelled — tap to try again',
    not_logged_in: 'Square POS is signed out on this iPad',
    user_not_logged_in: 'Square POS is signed out on this iPad',
    no_network_connection: 'This iPad is offline',
    no_network: 'This iPad is offline',
    currency_code_mismatch: "Square's currency doesn't match ours (SQUARE_CURRENCY)",
    unknown_session: 'That session expired — starting a new one',
  };
  function describePayError(code) {
    if (!code) return "Payment didn't go through — tap to try again";
    return PAY_ERRORS[code.toLowerCase()] || "Payment didn't go through: " + code;
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
    var burst = { burstId: burstId, seq: run.shot - 1, framesTotal: SHOTS, theme: theme };
    booth.requestCapture(session.token, burst).then(
      function (requestId) {
        if (run === mine) run.requestId = requestId;
      },
      function (error) {
        console.error('[kiosk] capture request failed:', error);
        if (run === mine && !run.landed)
          fail("We couldn't reach the booth. " + (error && error.message ? error.message : ''));
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
      'translate(' +
      (to.left - from.left) +
      'px, ' +
      (to.top - from.top) +
      'px) ' +
      'scale(' +
      to.width / from.width +
      ', ' +
      to.height / from.height +
      ')';

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
    // On a fault, show the agent's own reason (a CUPS state, a traceback's last
    // line) so the operator at the table doesn't need the Pi's journal.
    var reason = print.status === 'failed' || print.status === 'blocked' ? print.error || print.detail : null;
    el.printState.className = 'print-state ' + entry[0];
    el.printState.textContent = entry[1] + (reason ? ' — ' + reason : '');
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
    if (!paid) {
      startPayment();
      return;
    }
    hidePayNote();
    burstId = mintBurstId();
    fire(1);
  });

  // Square POS taking the foreground is the launch's success signal. Coming
  // back to THIS document afterwards means Square returned in another tab (or
  // never opened): this one is stale, so it starts a fresh guest rather than
  // resuming a session another tab may already be shooting.
  function onVisible() {
    if (!handedOff) return;
    handedOff = false;
    boot();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && timers.launch) {
      clearTimeout(timers.launch);
      timers.launch = null;
    }
    if (document.visibilityState === 'visible') onVisible();
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) onVisible();
  });

  // Frame picker. Event delegation, so the chips can be server-rendered.
  el.themes.addEventListener('click', function (event) {
    var chip = event.target.closest ? event.target.closest('.theme') : null;
    if (!chip || run) return;
    selectTheme(chip.getAttribute('data-theme'));
  });
  function selectTheme(key) {
    theme = key;
    var chips = el.themes.querySelectorAll('.theme');
    for (var i = 0; i < chips.length; i++) {
      var on = chips[i].getAttribute('data-theme') === key;
      chips[i].classList.toggle('is-selected', on);
      chips[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }
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
  boot(RESUME);
})();
