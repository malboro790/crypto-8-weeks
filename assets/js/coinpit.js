/* ==========================================================================
   COIN PIT — hero background
   A vanilla-canvas take on the reactbits "Ballpit": gravity, friction, wall
   bounce and a cursor body that shoves things aside. The balls are the top-20
   assets by market cap, drawn from their own marks and clipped to circles.

   The site has no build step, so this is plain 2D canvas rather than the
   three.js React component — same parameters, same behaviour.

   Resting bodies are put to sleep. Without that, gravity keeps being added
   every frame to a ball already touching the floor and the whole pile shivers.
   ========================================================================== */
(function () {
  'use strict';

  var pits = document.querySelectorAll('[data-coinpit]');
  if (!pits.length) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* One pit per canvas. `data-coinpit="settled"` skips the fall and hands the
     visitor a pile that is already at rest; anything else rains in. */
  function createPit(canvas) {
    if (reduced) { canvas.style.display = 'none'; return; }
    var drop = canvas.getAttribute('data-coinpit') !== 'settled';

  /* --- parameters ------------------------------------------------------- */
  var GRAVITY      = 0.5;
  var FRICTION     = 0.928;
  var WALL_BOUNCE  = 0.95;
  var COUNT        = 50;    // half the reference's 100 — the pit should breathe
  var CURSOR_R     = 90;
  var MAX_DPR      = 2;

  /* REST_SPEED must sit above one frame of gravity after friction
     (0.5 * 0.928 = 0.464); otherwise a ball parked on the floor re-accelerates
     every frame, never crosses the threshold, and the pile shimmers forever. */
  var REST_SPEED   = 0.9;
  var REST_FRAMES  = 24;    // settle for a good while before freezing, or the pile stays loose
  var BOUNCE_FLOOR = 1.3;   // below this vertical speed the floor absorbs instead of bouncing
  var SLOP         = 0.25;  // ignore sub-pixel overlap, or contacts jitter apart and back
  var CORRECTION   = 0.7;   // resolve most of the overlap, not all of it

  /* Top 98 by market cap, in rank order. Every ball gets its own asset — no
     repeats — and the higher-ranked names get the larger discs, so the field
     reads as a ranking rather than confetti. */
  var COINS = [
    'btc', 'eth', 'usdt', 'bnb', 'xrp', 'usdc', 'sol', 'trx', 'hype', 'doge',
    'zec', 'leo', 'link', 'xmr', 'ada', 'xlm', 'dai', 'bch', 'usde', 'cc',
    'usd1', 'gram', 'ltc', 'usdg', 'hbar', 'avax', 'sui', 'shib', 'pyusd', 'xaut',
    'cro', 'tao', 'uni', 'near', 'okb', 'paxg', 'wlfi', 'rlusd', 'aster', 'ondo',
    'm', 'mnt', 'usdd', 'aave', 'sky', 'dot', 'wld', 'icp', 'pump', 'pepe',
    'bgb', 'u', 'morpho', 'etc', 'kcs', 'pi', 'ena', 'pol', 'jst', 'atom',
    'kas', 'algo', 'qnt', 'stable', 'gt', 'render', 'lit', 'vvv', 'jup', 'arb',
    'ethfi', 'xdc', 'fil', 'flr', 'cake', 'nexo', 'tusd', 'apt', 'inj', 'eurc',
    'aero', 'pengu', 'virtual', 'vet', 'crv', 'trump', 'dash', 'spx', 'fdusd', 'pyth',
    'zro', 'sun', 'gno', 'night', 'bsv', 'sei', 'tia', 'jto'
  ];

  var ctx = canvas.getContext('2d', { alpha: true });
  var balls = [];
  var images = [];
  /* A quarter of the marks are near-black artwork that would vanish against the
     dark ground. Rather than maintain a hand-kept list, each image is measured
     on load and the dark ones get a light disc behind them. */
  var needsBacking = [];
  var DARK_MEAN = 62;      // mean luminance, 0–255, below which a mark disappears
  var w = 0, h = 0, dpr = 1;
  var pointer = { x: -9999, y: -9999, active: false, moved: 0 };
  /* A cursor parked over the hero would keep shoving the same coins forever.
     Treat it as gone once it stops moving, so the pile is free to settle. */
  var POINTER_IDLE = 500;
  var running = false;
  var rafId = null;

  COINS.forEach(function (name, i) {
    var img = new Image();
    img.decoding = 'async';
    // The loop parks itself once the pile is asleep, so a mark that finishes
    // loading after that first paint has to ask for its own redraw.
    img.onload = function () { measure(img, i); if (!running) draw(); };
    img.src = 'assets/coins/' + name + '.png';
    images[i] = img;
  });

  /* Mean luminance of the opaque pixels, used to decide whether a mark needs
     a light backing to read on the dark ground. */
  function measure(img, i) {
    try {
      var s = 32;
      var oc = document.createElement('canvas');
      oc.width = oc.height = s;
      var octx = oc.getContext('2d', { willReadFrequently: true });
      octx.drawImage(img, 0, 0, s, s);
      var d = octx.getImageData(0, 0, s, s).data;
      var sum = 0, n = 0;
      for (var p = 0; p < d.length; p += 4) {
        if (d[p + 3] < 40) continue;
        sum += 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
        n++;
      }
      needsBacking[i] = n > 0 && (sum / n) < DARK_MEAN;
    } catch (e) {
      needsBacking[i] = false;   // tainted canvas: leave the mark as-is
    }
  }

  /* --- sizing ----------------------------------------------------------- */
  function resize() {
    var rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function build(drop) {
    balls.length = 0;
    var n = w < 640 ? Math.round(COUNT * 0.5)
          : w < 1040 ? Math.round(COUNT * 0.7)
          : COUNT;
    n = Math.min(n, COINS.length);   // never repeat a mark

    for (var i = 0; i < n; i++) {
      var rank = i;
      var base = w < 640 ? 13 : 16;
      var r = base + (1 - rank / n) * (base * 0.5) + Math.random() * 3;
      balls.push({
        x: Math.random() * (w - r * 2) + r,
        /* Rain, not a curtain: each coin gets its own hold-off and its own
           starting altitude, so they arrive scattered over a few seconds
           instead of landing as one front. */
        delay: drop ? Math.floor(Math.pow(Math.random(), 0.75) * 210) : 0,
        y: drop ? -(r + Math.random() * h * 3.2)
                : Math.random() * Math.max(1, h - r * 2) + r,
        vx: drop ? (Math.random() - 0.5) * 1.6 : (Math.random() - 0.5) * 4,
        vy: drop ? Math.random() * 4 : (Math.random() - 0.5) * 4,
        r: r,
        img: rank,
        asleep: false,
        rest: 0,
        support: false
      });
    }
  }

  function wake(b) { b.asleep = false; b.rest = 0; }

  /* --- physics ---------------------------------------------------------- */
  function step() {
    var i, j, a, b;

    if (pointer.active && performance.now() - pointer.moved > POINTER_IDLE) {
      pointer.active = false;
    }

    for (i = 0; i < balls.length; i++) {
      a = balls[i];

      // Still waiting its turn to fall — kept out of the simulation entirely.
      if (a.delay > 0) { a.delay--; continue; }

      // A sleeping ball only stirs when the pointer comes near it.
      if (a.asleep) {
        if (pointer.active &&
            Math.hypot(a.x - pointer.x, a.y - pointer.y) < CURSOR_R + a.r) {
          wake(a);
        } else {
          continue;
        }
      }

      a.vy += GRAVITY;
      a.vx *= FRICTION;
      a.vy *= FRICTION;

      if (pointer.active) {
        var pdx = a.x - pointer.x;
        var pdy = a.y - pointer.y;
        var pd = Math.hypot(pdx, pdy);
        var reach = CURSOR_R + a.r;
        if (pd < reach && pd > 0.01) {
          var push = (1 - pd / reach) * 6;
          a.vx += (pdx / pd) * push;
          a.vy += (pdy / pd) * push;
        }
      }

      a.x += a.vx;
      a.y += a.vy;

      a.support = false;

      // Side walls
      if (a.x - a.r < 0)      { a.x = a.r;     a.vx = Math.abs(a.vx) * WALL_BOUNCE; }
      else if (a.x + a.r > w) { a.x = w - a.r; a.vx = -Math.abs(a.vx) * WALL_BOUNCE; }

      // Ceiling
      if (a.y - a.r < 0) { a.y = a.r; a.vy = Math.abs(a.vy) * WALL_BOUNCE; }

      // Floor: absorb slow impacts instead of bouncing, or the pile never settles
      if (a.y + a.r > h) {
        a.y = h - a.r;
        if (Math.abs(a.vy) < BOUNCE_FLOOR) { a.vy = 0; }
        else { a.vy = -Math.abs(a.vy) * WALL_BOUNCE; }
        a.support = true;
      }
    }

    // Pairwise collisions — n is small enough that the naive loop is fine.
    for (i = 0; i < balls.length; i++) {
      a = balls[i];
      for (j = i + 1; j < balls.length; j++) {
        b = balls[j];
        if (a.delay > 0 || b.delay > 0) continue;
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var dist = Math.hypot(dx, dy);
        var min = a.r + b.r;
        if (dist >= min || dist === 0) continue;

        // Two settled bodies in contact are left alone entirely.
        if (a.asleep && b.asleep) continue;

        // Only a ball with real momentum wakes its neighbour.
        if (!a.asleep && Math.abs(a.vx) + Math.abs(a.vy) > REST_SPEED) wake(b);
        if (!b.asleep && Math.abs(b.vx) + Math.abs(b.vy) > REST_SPEED) wake(a);

        var nx = dx / dist;
        var ny = dy / dist;
        var pen = min - dist;
        if (pen > SLOP) {
          var overlap = (pen - SLOP) / 2 * CORRECTION;
          if (!a.asleep) { a.x -= nx * overlap; a.y -= ny * overlap; }
          if (!b.asleep) { b.x += nx * overlap; b.y += ny * overlap; }
        }

        // Whichever sits lower is holding the other one up.
        if (dy > 0 && (b.support || b.asleep)) a.support = true;
        if (dy < 0 && (a.support || a.asleep)) b.support = true;

        var rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel > 0) continue;
        var imp = rel * WALL_BOUNCE;
        a.vx += imp * nx; a.vy += imp * ny;
        b.vx -= imp * nx; b.vy -= imp * ny;
      }
    }

    // Sleep pass: a supported, near-motionless ball stops being simulated.
    for (i = 0; i < balls.length; i++) {
      a = balls[i];
      if (a.asleep) continue;
      if (a.support) {
        // Anything being held up — by the floor or by another coin — must stop
        // accumulating gravity, or a stack never stops trembling.
        if (Math.abs(a.vy) < BOUNCE_FLOOR) a.vy = 0;
        a.vx *= 0.7;
        if (Math.abs(a.vx) + Math.abs(a.vy) < REST_SPEED) {
          if (++a.rest >= REST_FRAMES) { a.asleep = true; a.vx = 0; a.vy = 0; }
        } else {
          a.rest = 0;
        }
      } else {
        a.rest = 0;
      }
    }
  }

  /* --- render ----------------------------------------------------------- */
  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < balls.length; i++) {
      var a = balls[i];
      var img = images[a.img];
      if (!img || !img.complete || !img.naturalWidth) continue;

      // Near-black marks sit on a light disc, inset so the disc reads as a rim.
      var inset = 1;
      if (needsBacking[a.img]) {
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fillStyle = '#F2F0FA';
        ctx.fill();
        inset = 0.82;
      }

      // Clip to a circle: several marks ship on square canvases.
      var ir = a.r * inset;
      ctx.save();
      ctx.beginPath();
      ctx.arc(a.x, a.y, ir, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, a.x - ir, a.y - ir, ir * 2, ir * 2);
      ctx.restore();

      // Hairline rim so dark marks stay separated on a dark ground.
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r - 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function allAsleep() {
    for (var i = 0; i < balls.length; i++) if (!balls[i].asleep) return false;
    return true;
  }

  /* Run the pile to rest without drawing, so the first frame the visitor sees is
     already settled and nothing moves until they reach for it. */
  function settle() {
    var wasActive = pointer.active;
    pointer.active = false;
    for (var k = 0; k < 1400; k++) step();
    for (var i = 0; i < balls.length; i++) {
      balls[i].asleep = true; balls[i].vx = 0; balls[i].vy = 0;
    }
    pointer.active = wasActive;
  }

  function frame() {
    // Everything asleep and no pointer: stop the loop outright — zero motion,
    // zero CPU. A pointer move restarts it.
    if (allAsleep() && !pointer.active) { running = false; rafId = null; return; }
    step();
    draw();
    rafId = requestAnimationFrame(frame);
  }
  function start() { if (running) return; running = true; rafId = requestAnimationFrame(frame); }
  function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }

  /* --- pointer ---------------------------------------------------------- */
  function movePointer(e) {
    var rect = canvas.getBoundingClientRect();
    var p = e.touches ? e.touches[0] : e;
    pointer.x = p.clientX - rect.left;
    pointer.y = p.clientY - rect.top;
    pointer.active = true;
    pointer.moved = performance.now();
    start();
  }
  var hero = canvas.parentElement;
  hero.addEventListener('pointermove', movePointer, { passive: true });
  hero.addEventListener('pointerleave', function () { pointer.active = false; });
  hero.addEventListener('touchmove', movePointer, { passive: true });
  hero.addEventListener('touchend', function () { pointer.active = false; });

  /* --- lifecycle -------------------------------------------------------- */
  resize();
  build(drop);
  /* A settled pit is fast-forwarded to rest instead of animated into it. */
  if (!drop) settle();
  draw();
  if (drop) start();

  /* Off-screen the loop stops outright. Coming back it has to restart, or a
     pit parked mid-fall stays frozen in the air for the rest of the visit. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { if (!allAsleep()) start(); }
        else stop();
      });
    }, { threshold: 0 }).observe(canvas);
  }

  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });

  /* На телефоне адресная строка прячется при первом же скролле — это приходит
     как resize и высота экрана меняется на сотню пикселей. Пересобирать по
     нему кучу нельзя: монеты перескакивают на новое место прямо во время
     чтения. Реагируем только на смену ширины, то есть на поворот экрана и на
     настоящее изменение окна; высоту canvas подтягиваем без пересборки. */
  var rt, lastW = window.innerWidth;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      if (window.innerWidth === lastW) { resize(); settle(); draw(); return; }
      lastW = window.innerWidth;
      resize(); build(false); settle(); draw();
    }, 180);
  });
  }

  Array.prototype.forEach.call(pits, createPit);
})();
