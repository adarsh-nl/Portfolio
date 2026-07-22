/* ==================================================================
   cora-core.js — shared runtime for the UxV Ecosystem project page.

   Provides (on window.CORA):
     colors()       theme-aware palette read from CSS variables
     onThemeChange  register redraw callbacks fired when the theme flips
     raf(el, fn)    per-widget animation loop, auto-paused offscreen
     rng(seed)      deterministic PRNG (mulberry32) + gaussians
     tooltip        one shared tooltip for every chart
     tabs           role=tab wiring helper
     reducedMotion  live boolean
   No dependencies; everything below is vanilla ES2017.
================================================================== */
(function () {
  "use strict";
  var CORA = (window.CORA = {});

  /* ---------- theme-aware colors ------------------------------- */

  var colorCache = null;
  var VAR_NAMES = [
    "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8",
    "air", "ground", "sea", "fire", "crit", "good", "warn",
    "ink", "ink2", "muted", "grid", "axis",
    "surface", "surface2", "border", "halo"
  ];

  CORA.colors = function () {
    if (colorCache) return colorCache;
    var cs = getComputedStyle(document.documentElement);
    colorCache = {};
    VAR_NAMES.forEach(function (n) {
      colorCache[n] = cs.getPropertyValue("--viz-" + n).trim();
    });
    colorCache.series = [colorCache.s1, colorCache.s2, colorCache.s3, colorCache.s4,
                         colorCache.s5, colorCache.s6, colorCache.s7, colorCache.s8];
    return colorCache;
  };

  var themeListeners = [];
  CORA.onThemeChange = function (fn) { themeListeners.push(fn); };

  new MutationObserver(function () {
    colorCache = null;
    themeListeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- reduced motion ----------------------------------- */

  var rmq = window.matchMedia("(prefers-reduced-motion: reduce)");
  CORA.reducedMotion = rmq.matches;
  if (rmq.addEventListener) rmq.addEventListener("change", function (e) { CORA.reducedMotion = e.matches; });

  /* ---------- animation loop manager ---------------------------
     CORA.raf(el, drawFn) runs drawFn(tMs) every frame while `el`
     is on screen and the tab is visible. Returns {start, stop}.
     A watchdog falls back to setTimeout if rAF is throttled to a
     halt (embedded webviews, aggressive power saving).           */

  var allDrawFns = [];
  /* Debug/testing hook: force one frame of every registered loop,
     regardless of visibility. Not used by the page itself. */
  CORA.__frame = function (t) {
    allDrawFns.forEach(function (fn) { try { fn(t); } catch (e) { console.error(e); } });
  };

  CORA.raf = function (el, drawFn) {
    var running = false, wanted = false, visible = true;
    var handle = null, mode = "raf", lastTick = 0;
    allDrawFns.push(drawFn);

    function tick(t) {
      if (!running) return;
      lastTick = performance.now();
      drawFn(t);
      schedule();
    }
    function schedule() {
      if (mode === "raf") handle = requestAnimationFrame(tick);
      else handle = setTimeout(function () { tick(performance.now()); }, 33);
    }
    function cancel() {
      if (handle === null) return;
      if (mode === "raf") cancelAnimationFrame(handle); else clearTimeout(handle);
      handle = null;
    }
    function watchdog() {
      setTimeout(function () {
        if (running && mode === "raf" && performance.now() - lastTick > 450) {
          mode = "timeout";
          cancel();
          schedule();
        }
      }, 500);
    }
    function sync() {
      var should = wanted && visible && !document.hidden;
      if (should && !running) { running = true; lastTick = performance.now(); schedule(); watchdog(); }
      if (!should && running) { running = false; cancel(); }
    }
    var io = new IntersectionObserver(function (entries) {
      CORA.__markIO();
      visible = entries[0].isIntersecting;
      sync();
    }, { rootMargin: "100px" });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);

    return {
      start: function () { wanted = true; sync(); },
      stop: function () { wanted = false; sync(); },
      get running() { return wanted; }
    };
  };

  /* Some environments never deliver IntersectionObserver callbacks;
     anything that waits on one should also register a fallback.   */
  CORA._ioFired = false;
  (function probeIO() {
    var io = new IntersectionObserver(function () {
      CORA.__markIO();
      io.disconnect();
    });
    if (document.body) io.observe(document.body);
    else document.addEventListener("DOMContentLoaded", function () { io.observe(document.body); });
  })();
  var ioFallbacks = [];
  CORA.__markIO = function () { CORA._ioFired = true; };
  CORA.onIOBroken = function (fn) { ioFallbacks.push(fn); };
  setTimeout(function () {
    if (!CORA._ioFired) ioFallbacks.forEach(function (fn) { try { fn(); } catch (e) {} });
  }, 1600);

  /* ---------- deterministic randomness ------------------------- */

  CORA.rng = function (seed) {
    var a = seed >>> 0;
    function next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    next.gauss = function () {
      var u = 0, v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    next.pick = function (arr) { return arr[Math.floor(next() * arr.length)]; };
    return next;
  };

  CORA.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  CORA.lerp = function (a, b, t) { return a + (b - a) * t; };
  CORA.ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  CORA.dist = function (x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); };

  /* ---------- canvas sizing (HiDPI) ----------------------------
     Fixes the canvas backing store to CSS size × devicePixelRatio
     and returns the 2D context scaled to CSS pixels.             */

  CORA.fitCanvas = function (canvas, cssH) {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.parentElement.clientWidth;
    var h = cssH || canvas.clientHeight || Math.round(w * 0.6);
    canvas.style.height = h + "px";
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  };

  CORA.font = function (px, bold) {
    return (bold ? "bold " : "") + px + 'px "Computer Modern Serif", Georgia, serif';
  };

  /* ---------- vehicle glyphs -----------------------------------
     Tiny shared drawing routines so a UAV / UGV / USV looks the
     same in every widget on the page. (x, y) is the centre; r is
     the half-size; heading in radians (0 = east).                */

  CORA.glyph = {
    uav: function (ctx, x, y, r, heading, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(heading || 0);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r, r * 0.85);
      ctx.lineTo(-r * 0.45, 0);
      ctx.lineTo(-r, -r * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    ugv: function (ctx, x, y, r, heading, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      var w = r * 2, h = r * 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, r * 0.35);
      else ctx.rect(-w / 2, -h / 2, w, h);
      ctx.fill();
      ctx.restore();
    },
    usv: function (ctx, x, y, r, heading, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-r * 1.2, -r * 0.5);
      ctx.lineTo(r * 1.2, -r * 0.5);
      ctx.lineTo(r * 0.55, r * 0.6);
      ctx.lineTo(-r * 0.55, r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-r * 0.15, -r * 1.15, r * 0.3, r * 0.65);
      ctx.restore();
    }
  };

  /* ---------- SVG helpers -------------------------------------- */

  var SVGNS = "http://www.w3.org/2000/svg";
  CORA.svg = function (tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };

  /* ---------- shared tooltip ----------------------------------- */

  var tipEl = null;
  CORA.tooltip = {
    show: function (html, x, y) {
      if (!tipEl) {
        tipEl = document.createElement("div");
        tipEl.className = "cora-tooltip";
        tipEl.setAttribute("role", "status");
        document.body.appendChild(tipEl);
      }
      tipEl.innerHTML = html;
      var pad = 14;
      var w = tipEl.offsetWidth || 160;
      var left = CORA.clamp(x + pad, 6, window.innerWidth - w - 6);
      var top = y - (tipEl.offsetHeight || 40) - pad;
      if (top < 6) top = y + pad;
      tipEl.style.left = left + "px";
      tipEl.style.top = top + "px";
      tipEl.classList.add("is-visible");
    },
    hide: function () { if (tipEl) tipEl.classList.remove("is-visible"); }
  };

  /* ---------- tab groups ---------------------------------------
     Wires role=tab buttons inside `root`; calls onChange(key).   */

  CORA.tabs = function (root, onChange) {
    if (!root) return;
    var btns = Array.prototype.slice.call(root.querySelectorAll("[role=tab]"));
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (o) { o.setAttribute("aria-selected", o === b ? "true" : "false"); });
        onChange(b.dataset.tab !== undefined ? b.dataset.tab : b.dataset.step, b);
      });
    });
    return {
      select: function (key) {
        var b = btns.filter(function (o) { return (o.dataset.tab || o.dataset.step) === String(key); })[0];
        if (b) b.click();
      },
      highlight: function (key) {
        btns.forEach(function (o) {
          o.setAttribute("aria-selected", (o.dataset.tab || o.dataset.step) === String(key) ? "true" : "false");
        });
      }
    };
  };

  /* ---------- page furniture: scrollspy, reveals, bib ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    /* scrollspy for the sticky in-page nav */
    var toc = document.querySelectorAll(".cora-toc a");
    var byId = {};
    toc.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          toc.forEach(function (a) { a.classList.remove("is-active"); });
          var a = byId[e.target.id];
          if (a) a.classList.add("is-active");
        }
      });
    }, { rootMargin: "-15% 0px -70% 0px" });
    document.querySelectorAll(".cora-section").forEach(function (s) { spy.observe(s); });

    /* gentle scroll reveal on widgets */
    var widgets = document.querySelectorAll(".cora-widget, .cora-card");
    if (!CORA.reducedMotion) {
      var rev = new IntersectionObserver(function (entries) {
        CORA.__markIO();
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("is-in"); rev.unobserve(e.target); }
        });
      }, { rootMargin: "0px 0px -8% 0px" });
      widgets.forEach(function (w) { w.classList.add("cora-reveal"); rev.observe(w); });
      CORA.onIOBroken(function () {
        widgets.forEach(function (w) { w.classList.add("is-in"); });
        rev.disconnect();
      });
    }

    /* hero BibTeX button highlights the resources bib box */
    var bb = document.getElementById("hero-bib-btn");
    if (bb) bb.addEventListener("click", function () {
      setTimeout(function () {
        var box = document.getElementById("bibbox");
        if (box) box.style.outline = "2px solid " + CORA.colors().s1;
        setTimeout(function () { if (box) box.style.outline = "none"; }, 1600);
      }, 500);
    });

    /* BibTeX copy */
    var copyBtn = document.getElementById("bib-copy");
    if (copyBtn) copyBtn.addEventListener("click", function () {
      var pre = document.querySelector("#bibbox .bibtex");
      if (!pre || !navigator.clipboard) return;
      navigator.clipboard.writeText(pre.innerText).then(function () {
        copyBtn.textContent = "copied";
        setTimeout(function () { copyBtn.textContent = "copy"; }, 1200);
      }).catch(function () {});
    });
  });
})();
