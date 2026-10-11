/* ஓய்வு page: three Brownian walks, drawn live on a canvas.

   Each walk is sampled fresh on every visit (Gaussian steps), kept in its
   own unit coordinates, and refitted to whatever size the canvas has, so
   the figure stays sharp at any width. On load the walks trace themselves
   in, staggered, then rest. Clicking, tapping or pressing Enter on the
   figure releases another walker that wanders for a few seconds and fades.

   Under prefers-reduced-motion the finished picture is drawn at once, and
   a released walker appears complete instead of animating. Nothing runs
   while the figure is off-screen or once everything has settled. */
(function () {
  var canvas = document.getElementById("otium-canvas");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var still = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  var WALKS = 3;
  var STEPS = 8000;          // steps per walk
  var DRAW_MS = 5200;        // time for one walk to trace itself in
  var STAGGER_MS = 450;      // delay between walks starting
  var WALKER_MS = 4200;      // a released walker wanders this long...
  var FADE_MS = 1400;        // ...then fades over this long
  var MAX_WALKERS = 8;
  var WALKER_STEPS = 8;      // steps per 16 ms frame
  var WALKER_GAIN = 2.2;     // step length relative to the drawn walks, so it reads as motion
  var LINE = 0.9;            // stroke width, CSS px
  var ALPHA = 0.9;

  function gauss() { // standard normal, Box-Muller
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function makeWalk(n) {
    var xs = new Float32Array(n), ys = new Float32Array(n);
    var x = 0, y = 0, minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (var i = 0; i < n; i++) {
      xs[i] = x; ys[i] = y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      x += gauss(); y += gauss();
    }
    return { xs: xs, ys: ys, n: n, minX: minX, minY: minY,
             w: (maxX - minX) || 1, h: (maxY - minY) || 1,
             drift: Math.random() }; // where it sits in its slot's spare height
  }

  var walks = [];
  for (var i = 0; i < WALKS; i++) walks.push(makeWalk(STEPS));

  // ---- layout: one slot per walk across the width ----
  var W = 0, H = 0, dpr = 1, fits = [], stepPx = 1, stride = 1, ink = "#141414";

  function layout() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    // Slots are a little wider than a third, so neighbouring walks may
    // brush against each other, as in the original plate.
    var slotW = W / WALKS, room = slotW * 1.2, pad = Math.min(slotW, H) * 0.04;
    stepPx = 0;
    fits = walks.map(function (wk, k) {
      var s = Math.min((room - 2 * pad) / wk.w, (H - 2 * pad) / wk.h);
      stepPx += s / WALKS;
      var left = (k + 0.5) * slotW - wk.w * s / 2;
      left = Math.max(pad, Math.min(W - pad - wk.w * s, left)); // never clipped at the edges
      return { s: s,
               ox: left - wk.minX * s,
               oy: pad + (H - 2 * pad - wk.h * s) * wk.drift - wk.minY * s };
    });
    stride = slotW < 150 ? 2 : 1; // phones: every other step, same shape, less ink
  }

  function readInk() { ink = getComputedStyle(canvas).color; }

  function pen(c, alpha) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.lineWidth = LINE;
    c.lineJoin = "round";
    c.lineCap = "round";
    c.strokeStyle = ink;
    c.fillStyle = ink;
    c.globalAlpha = alpha;
  }

  function strokeWalk(c, k, upto) {
    var wk = walks[k], f = fits[k];
    c.beginPath();
    c.moveTo(wk.xs[0] * f.s + f.ox, wk.ys[0] * f.s + f.oy);
    for (var j = stride; j < upto; j += stride) c.lineTo(wk.xs[j] * f.s + f.ox, wk.ys[j] * f.s + f.oy);
    c.lineTo(wk.xs[upto - 1] * f.s + f.ox, wk.ys[upto - 1] * f.s + f.oy);
    c.stroke();
  }

  function dot(c, x, y) {
    c.beginPath();
    c.arc(x, y, 2.2, 0, 2 * Math.PI);
    c.fill();
  }

  // The finished walks are painted once into an offscreen canvas and then
  // copied each frame, so released walkers cost almost nothing to animate.
  var base = null;
  function paintBase() {
    var b = document.createElement("canvas");
    b.width = canvas.width; b.height = canvas.height;
    var c = b.getContext("2d");
    pen(c, ALPHA);
    for (var k = 0; k < WALKS; k++) strokeWalk(c, k, walks[k].n);
    return b;
  }

  // ---- state ----
  var elapsed = still ? Infinity : 0;   // draw-in clock, ms
  var drawDone = still;
  var walkers = [];

  function progress(k) { // eased share of walk k drawn so far
    var t = (elapsed - k * STAGGER_MS) / DRAW_MS;
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (drawDone) {
      if (!base) base = paintBase();
      ctx.globalAlpha = 1;
      ctx.drawImage(base, 0, 0);
    } else {
      pen(ctx, ALPHA);
      for (var k = 0; k < WALKS; k++) {
        var p = progress(k);
        if (p <= 0) continue;
        var upto = Math.max(2, Math.floor(p * (walks[k].n - 1)) + 1);
        strokeWalk(ctx, k, upto);
        if (p < 1) {
          var f = fits[k];
          dot(ctx, walks[k].xs[upto - 1] * f.s + f.ox, walks[k].ys[upto - 1] * f.s + f.oy);
        }
      }
    }
    for (var w = 0; w < walkers.length; w++) drawWalker(walkers[w]);
  }

  // ---- released walkers ----
  function stepWalker(w, count) {
    for (var j = 0; j < count; j++) {
      var n = w.xs.length - 1;
      w.xs.push(w.xs[n] + gauss() * stepPx * WALKER_GAIN);
      w.ys.push(w.ys[n] + gauss() * stepPx * WALKER_GAIN);
    }
  }

  function release(x, y) {
    if (walkers.length >= MAX_WALKERS) walkers.shift();
    var w = { xs: [x], ys: [y], age: 0 };
    walkers.push(w);
    if (still) { // reduced motion: appear complete, no animation
      stepWalker(w, Math.round(WALKER_MS / 16 * WALKER_STEPS));
      w.age = -1; // marks a static walker
      render();
    } else {
      schedule();
    }
  }

  function advanceWalkers(dt) {
    var per = Math.max(1, Math.round(dt / 16 * WALKER_STEPS));
    walkers = walkers.filter(function (w) {
      w.age += dt;
      if (w.age < WALKER_MS) stepWalker(w, per);
      return w.age < WALKER_MS + FADE_MS;
    });
  }

  function drawWalker(w) {
    var a = (w.age < 0 || w.age < WALKER_MS) ? 1 : 1 - (w.age - WALKER_MS) / FADE_MS;
    pen(ctx, ALPHA * Math.max(0, a));
    ctx.beginPath();
    ctx.moveTo(w.xs[0], w.ys[0]);
    for (var j = 1; j < w.xs.length; j++) ctx.lineTo(w.xs[j], w.ys[j]);
    ctx.stroke();
    if (w.age >= 0 && w.age < WALKER_MS) dot(ctx, w.xs[w.xs.length - 1], w.ys[w.ys.length - 1]);
  }

  // ---- animation loop: runs only while something is moving and visible ----
  var running = false, visible = true, last = 0;

  function frame(now) {
    running = false;
    if (!visible) { last = 0; return; }
    var dt = last ? Math.max(0, Math.min(now - last, 50)) : 16; // tab switches can't jump the clock
    last = now;
    if (!drawDone) {
      elapsed += dt;
      if (elapsed >= DRAW_MS + (WALKS - 1) * STAGGER_MS) { drawDone = true; base = null; }
    }
    if (walkers.length) advanceWalkers(dt);
    render();
    if (!drawDone || walkers.length) schedule(); else last = 0;
  }

  function schedule() {
    if (!running && visible && !still) { running = true; requestAnimationFrame(frame); }
  }

  // ---- input ----
  canvas.addEventListener("pointerdown", function (e) {
    var r = canvas.getBoundingClientRect();
    release(e.clientX - r.left, e.clientY - r.top);
  });
  canvas.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      release(W * (0.15 + 0.7 * Math.random()), H * (0.25 + 0.5 * Math.random()));
    }
  });

  // ---- keep in step with size, theme and visibility ----
  function refit() {
    layout();
    base = null;
    walkers = []; // their coordinates belong to the old size
    render();
  }
  if (window.ResizeObserver) {
    var lastW = -1, lastH = -1;
    new ResizeObserver(function () {
      var r = canvas.getBoundingClientRect();
      if (Math.abs(r.width - lastW) < 0.5 && Math.abs(r.height - lastH) < 0.5) return;
      lastW = r.width; lastH = r.height;
      refit();
    }).observe(canvas);
  } else {
    window.addEventListener("resize", refit);
  }

  new MutationObserver(function () { readInk(); base = null; render(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && (!drawDone || walkers.length)) schedule();
    }).observe(canvas);
  }

  // Blog entries reveal in order (CSS reads --i; see otium.css).
  var items = document.querySelectorAll(".blog-entry, .blog-desc");
  for (var q = 0; q < items.length; q++) items[q].style.setProperty("--i", Math.floor(q / 2));

  readInk();
  layout();
  render();
  schedule();

  // Debug hook (the Browser pane pauses requestAnimationFrame while hidden):
  // OTIUM.__frame(t) advances one frame at time t (ms).
  window.OTIUM = { __frame: function (t) { running = true; frame(t); } };
})();
