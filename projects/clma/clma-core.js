/* ==================================================================
   clma-core.js — shared runtime for the CLMA project page.

   Provides (on window.CLMA):
     colors()       theme-aware palette read from CSS variables
     onThemeChange  register redraw callbacks fired when the theme flips
     raf(widget)    per-widget animation loop, auto-paused offscreen
     rng(seed)      deterministic PRNG (mulberry32) + gaussians
     tooltip        one shared tooltip for every chart
     LineChart      small SVG line-chart component (hover, legend, markers)
     reducedMotion  live boolean
   No dependencies; everything below is vanilla ES2017.
================================================================== */
(function () {
  "use strict";
  var CLMA = (window.CLMA = {});

  /* ---------- theme-aware colors ------------------------------- */

  var colorCache = null;
  var VAR_NAMES = [
    "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8",
    "crit", "good", "warn", "ink", "ink2", "muted",
    "grid", "axis", "surface", "surface2", "border", "halo"
  ];

  CLMA.colors = function () {
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
  CLMA.onThemeChange = function (fn) { themeListeners.push(fn); };

  new MutationObserver(function () {
    colorCache = null;
    themeListeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- reduced motion ----------------------------------- */

  var rmq = window.matchMedia("(prefers-reduced-motion: reduce)");
  CLMA.reducedMotion = rmq.matches;
  if (rmq.addEventListener) rmq.addEventListener("change", function (e) { CLMA.reducedMotion = e.matches; });

  /* ---------- animation loop manager ---------------------------
     CLMA.raf(el, drawFn) runs drawFn(tMs) every frame while `el`
     is on screen and the tab is visible. Returns {start, stop}.
     A watchdog falls back to setTimeout if rAF is throttled to a
     halt (embedded webviews, aggressive power saving).           */

  CLMA.raf = function (el, drawFn) {
    var running = false, wanted = false, visible = true;
    var handle = null, mode = "raf", lastTick = 0;

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
      CLMA.__markIO();
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
  CLMA._ioFired = false;
  (function probeIO() {
    var io = new IntersectionObserver(function () {
      CLMA.__markIO();
      io.disconnect();
    });
    if (document.body) io.observe(document.body);
    else document.addEventListener("DOMContentLoaded", function () { io.observe(document.body); });
  })();
  var ioFallbacks = [];
  CLMA.__markIO = function () { CLMA._ioFired = true; };
  CLMA.onIOBroken = function (fn) { ioFallbacks.push(fn); };
  setTimeout(function () {
    if (!CLMA._ioFired) ioFallbacks.forEach(function (fn) { try { fn(); } catch (e) {} });
  }, 1600);

  /* ---------- deterministic randomness ------------------------- */

  CLMA.rng = function (seed) {
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

  CLMA.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  CLMA.lerp = function (a, b, t) { return a + (b - a) * t; };
  CLMA.ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  /* ---------- canvas sizing (HiDPI) ----------------------------
     Fixes the canvas backing store to CSS size × devicePixelRatio
     and returns the 2D context scaled to CSS pixels.             */

  CLMA.fitCanvas = function (canvas, cssH) {
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

  CLMA.font = function (px, bold) {
    return (bold ? "bold " : "") + px + 'px "Computer Modern Serif", Georgia, serif';
  };

  /* ---------- SVG helpers -------------------------------------- */

  var SVGNS = "http://www.w3.org/2000/svg";
  CLMA.svg = function (tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };

  /* ---------- shared tooltip ----------------------------------- */

  var tipEl = null;
  CLMA.tooltip = {
    show: function (html, x, y) {
      if (!tipEl) {
        tipEl = document.createElement("div");
        tipEl.className = "clma-tooltip";
        tipEl.setAttribute("role", "status");
        document.body.appendChild(tipEl);
      }
      tipEl.innerHTML = html;
      var pad = 14;
      var w = tipEl.offsetWidth || 160;
      var left = CLMA.clamp(x + pad, 6, window.innerWidth - w - 6);
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

  CLMA.tabs = function (root, onChange) {
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

  /* ---------- LineChart ----------------------------------------
     A compact SVG line chart: series toggles, hover crosshair,
     vertical event markers, y in [0,1.05]. Rebuild via update(). */

  CLMA.LineChart = function (container, opts) {
    this.container = container;
    this.opts = opts || {};
    this.hidden = {};
    this.data = null;
    var self = this;
    CLMA.onThemeChange(function () { if (self.data) self.render(); });
  };

  CLMA.LineChart.prototype.update = function (data) {
    /* data: { xLabel, yLabel, x: [..], series: [{name,color(key),values:[..]}],
              markers: [{x, label}] } — color is a palette key like "s1". */
    this.data = data;
    this.render();
  };

  CLMA.LineChart.prototype.render = function () {
    var d = this.data, self = this, C = CLMA.colors();
    var W = 640, H = 300, m = { t: 16, r: 14, b: 40, l: 46 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var xs = d.x, n = xs.length;
    var yMax = this.opts.yMax || 1.05;

    function px(i) { return m.l + (i / (n - 1)) * iw; }
    function py(v) { return m.t + ih - (v / yMax) * ih; }

    this.container.innerHTML = "";

    /* legend (toggle buttons) */
    var leg = document.createElement("div");
    leg.className = "clma-chart-legend";
    d.series.forEach(function (s) {
      var b = document.createElement("button");
      b.setAttribute("aria-pressed", self.hidden[s.name] ? "false" : "true");
      b.innerHTML = '<span class="swatch" style="background:' + C[s.color] + '"></span>' + s.name;
      b.addEventListener("click", function () {
        self.hidden[s.name] = !self.hidden[s.name];
        self.render();
      });
      leg.appendChild(b);
    });
    this.container.appendChild(leg);

    var svg = CLMA.svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": this.opts.ariaLabel || "Line chart" });
    this.container.appendChild(svg);

    /* gridlines + y axis (fixed round ticks) */
    [0, 0.2, 0.4, 0.6, 0.8, 1.0].forEach(function (v) {
      var y = py(v);
      CLMA.svg("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: C.grid, "stroke-width": 1 }, svg);
      CLMA.svg("text", { x: m.l - 8, y: y + 4, "text-anchor": "end", "font-size": 11,
        fill: C.muted, "font-family": "inherit" }, svg).textContent = v.toFixed(1);
    });
    /* x ticks */
    xs.forEach(function (x, i) {
      CLMA.svg("text", { x: px(i), y: H - m.b + 18, "text-anchor": "middle", "font-size": 11,
        fill: C.muted, "font-family": "inherit" }, svg).textContent = x;
    });
    CLMA.svg("text", { x: m.l + iw / 2, y: H - 6, "text-anchor": "middle", "font-size": 12,
      fill: C.ink2, "font-family": "inherit" }, svg).textContent = d.xLabel || "";
    var yl = CLMA.svg("text", { x: 12, y: m.t + ih / 2, "text-anchor": "middle", "font-size": 12,
      fill: C.ink2, "font-family": "inherit",
      transform: "rotate(-90 12 " + (m.t + ih / 2) + ")" }, svg);
    yl.textContent = d.yLabel || "";
    /* baseline */
    CLMA.svg("line", { x1: m.l, x2: W - m.r, y1: py(0), y2: py(0), stroke: C.axis, "stroke-width": 1 }, svg);

    /* event markers */
    (d.markers || []).forEach(function (mk) {
      var i = xs.indexOf(mk.x);
      if (i < 0) return;
      CLMA.svg("line", { x1: px(i), x2: px(i), y1: m.t, y2: m.t + ih, stroke: C.crit,
        "stroke-width": 1, "stroke-dasharray": "3 4", opacity: 0.55 }, svg);
      CLMA.svg("text", { x: px(i), y: m.t - 3, "text-anchor": "middle", "font-size": 10,
        fill: C.crit, "font-family": "inherit" }, svg).textContent = mk.label || "";
    });

    /* series */
    var drawn = [];
    d.series.forEach(function (s) {
      if (self.hidden[s.name]) return;
      var path = s.values.map(function (v, i) {
        return (i ? "L" : "M") + px(i).toFixed(1) + " " + py(v).toFixed(1);
      }).join(" ");
      var p = CLMA.svg("path", { d: path, fill: "none", stroke: C[s.color], "stroke-width": 2,
        "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      if (!CLMA.reducedMotion && !self._drawnOnce) {
        var len = p.getTotalLength();
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len;
        p.getBoundingClientRect();
        p.style.transition = "stroke-dashoffset 0.9s ease";
        p.style.strokeDashoffset = "0";
      }
      drawn.push(s);
    });
    self._drawnOnce = true;

    /* hover layer: crosshair + dots + tooltip */
    var hover = CLMA.svg("g", { style: "pointer-events:none" }, svg);
    var overlay = CLMA.svg("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" }, svg);

    function onMove(evt) {
      var rect = svg.getBoundingClientRect();
      var sx = (evt.clientX - rect.left) * (W / rect.width);
      var i = CLMA.clamp(Math.round(((sx - m.l) / iw) * (n - 1)), 0, n - 1);
      hover.innerHTML = "";
      CLMA.svg("line", { x1: px(i), x2: px(i), y1: m.t, y2: m.t + ih, stroke: C.muted,
        "stroke-width": 1, opacity: 0.5 }, hover);
      var lines = ['<span class="tt-title">' + (d.xLabel || "x") + " " + xs[i] + "</span>"];
      drawn.forEach(function (s) {
        CLMA.svg("circle", { cx: px(i), cy: py(s.values[i]), r: 4, fill: C[s.color],
          stroke: C.surface, "stroke-width": 2 }, hover);
        lines.push(s.name + ": " + s.values[i].toFixed(2));
      });
      CLMA.tooltip.show(lines.join("<br>"), evt.clientX, evt.clientY);
    }
    overlay.addEventListener("mousemove", onMove);
    overlay.addEventListener("mouseleave", function () { hover.innerHTML = ""; CLMA.tooltip.hide(); });
  };

  /* ---------- page furniture: scrollspy, reveals, KaTeX -------- */

  document.addEventListener("DOMContentLoaded", function () {
    /* KaTeX for the inline math spans */
    function renderMath() {
      if (window.renderMathInElement) {
        window.renderMathInElement(document.getElementById("main"), {
          delimiters: [{ left: "\\(", right: "\\)", display: false }]
        });
      } else {
        setTimeout(renderMath, 120);
      }
    }
    renderMath();

    /* scrollspy for the sticky in-page nav */
    var toc = document.querySelectorAll(".clma-toc a");
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
    document.querySelectorAll(".clma-section").forEach(function (s) { spy.observe(s); });

    /* gentle scroll reveal on widgets */
    var widgets = document.querySelectorAll(".clma-widget, .clma-card");
    if (!CLMA.reducedMotion) {
      var rev = new IntersectionObserver(function (entries) {
        CLMA.__markIO();
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("is-in"); rev.unobserve(e.target); }
        });
      }, { rootMargin: "0px 0px -8% 0px" });
      widgets.forEach(function (w) { w.classList.add("clma-reveal"); rev.observe(w); });
      CLMA.onIOBroken(function () {
        widgets.forEach(function (w) { w.classList.add("is-in"); });
        rev.disconnect();
      });
    }

    /* hero BibTeX button scrolls to resources */
    var bb = document.getElementById("hero-bib-btn");
    if (bb) bb.addEventListener("click", function () {
      setTimeout(function () {
        var box = document.getElementById("bibbox");
        if (box) box.style.outline = "2px solid " + CLMA.colors().s1;
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
