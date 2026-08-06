/* ==================================================================
   fi-core.js — shared runtime for the fault-injector benchmark page.

   Provides (on window.FI):
     colors()        theme-aware palette read from CSS variables
     onThemeChange   register redraw callbacks fired when the theme flips
     raf(el, fn)     per-widget animation loop, auto-paused offscreen
     rng(seed)       deterministic PRNG (mulberry32) + gaussians
     fitCanvas       HiDPI canvas sizing
     scene           global scene state (agent count, seed) + subscribers
     DATA            the measured numbers, single source of truth
     tierControl     builds a 4-stop severity slider with clickable ticks
     numbersTable    builds the measured-degradation panel for an injector
     tooltip, tabs, svg, fmt
     __frame(t)      test hook: force one frame of every registered loop

   No dependencies; everything below is vanilla ES2017.
================================================================== */
(function () {
  "use strict";
  var FI = (window.FI = window.FI || {});

  /* ---------- theme-aware colors ------------------------------- */

  var colorCache = null;
  var VAR_NAMES = [
    "s1", "s2", "s3", "s4", "s5", "s6",
    "crit", "good", "warn", "ink", "ink2", "muted",
    "grid", "axis", "surface", "surface2", "surface3", "border", "halo",
    "road", "roadline", "build", "buildline", "ghost",
    "i0", "i1", "i2", "i3", "i4"
  ];

  FI.colors = function () {
    if (colorCache) return colorCache;
    var cs = getComputedStyle(document.documentElement);
    colorCache = {};
    VAR_NAMES.forEach(function (n) {
      colorCache[n] = cs.getPropertyValue("--viz-" + n).trim();
    });
    /* agent slot 0 is always the ego (blue); 1..5 are collaborators */
    colorCache.agent = [colorCache.s1, colorCache.s2, colorCache.s3,
                        colorCache.s4, colorCache.s5, colorCache.s6];
    /* intensity ramp, low to high */
    colorCache.ramp = [colorCache.i0, colorCache.i1, colorCache.i2,
                       colorCache.i3, colorCache.i4];
    return colorCache;
  };

  var themeListeners = [];
  FI.onThemeChange = function (fn) { themeListeners.push(fn); };

  new MutationObserver(function () {
    colorCache = null;
    themeListeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- reduced motion ----------------------------------- */

  var rmq = window.matchMedia("(prefers-reduced-motion: reduce)");
  FI.reducedMotion = rmq.matches;
  if (rmq.addEventListener) rmq.addEventListener("change", function (e) {
    FI.reducedMotion = e.matches;
  });

  /* ---------- animation loop manager --------------------------- */

  var allLoops = [];

  FI.raf = function (el, drawFn) {
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
      FI.__markIO();
      visible = entries[0].isIntersecting;
      sync();
    }, { rootMargin: "120px" });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);

    var api = {
      start: function () { wanted = true; sync(); },
      stop: function () { wanted = false; sync(); },
      draw: drawFn,
      get running() { return wanted; }
    };
    allLoops.push(api);
    return api;
  };

  /* Force one frame of every loop. Used to verify rendering in a
     hidden or offscreen pane where IntersectionObserver never fires. */
  FI.__frame = function (t) {
    allLoops.forEach(function (l) { try { l.draw(t || 0); } catch (e) {} });
    return allLoops.length;
  };

  /* Some environments never deliver IntersectionObserver callbacks. */
  FI._ioFired = false;
  var ioFallbacks = [];
  FI.__markIO = function () { FI._ioFired = true; };
  FI.onIOBroken = function (fn) { ioFallbacks.push(fn); };
  (function probeIO() {
    var io = new IntersectionObserver(function () { FI.__markIO(); io.disconnect(); });
    if (document.body) io.observe(document.body);
    else document.addEventListener("DOMContentLoaded", function () { io.observe(document.body); });
  })();
  setTimeout(function () {
    if (!FI._ioFired) ioFallbacks.forEach(function (fn) { try { fn(); } catch (e) {} });
  }, 1600);

  /* ---------- deterministic randomness ------------------------- */

  FI.rng = function (seed) {
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
    next.range = function (lo, hi) { return lo + next() * (hi - lo); };
    return next;
  };

  FI.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  FI.lerp = function (a, b, t) { return a + (b - a) * t; };
  FI.ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  FI.fmt = {
    /* signed delta, always three decimals: -0.162 */
    d: function (v) { return (v < 0 ? "−" : "+") + Math.abs(v).toFixed(3); },
    /* plain fixed */
    f: function (v, n) { return v.toFixed(n === undefined ? 2 : n); },
    /* thousands separator for point counts */
    n: function (v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); },
    pct: function (v) { return Math.round(v * 100) + "%"; }
  };

  /* ---------- canvas sizing (HiDPI) ---------------------------- */

  FI.fitCanvas = function (canvas, cssH) {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    var h = cssH || canvas.clientHeight || Math.round(w * 0.66);
    canvas.style.height = h + "px";
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  };

  FI.font = function (px, bold) {
    return (bold ? "bold " : "") + px + 'px "Computer Modern Serif", Georgia, serif';
  };
  FI.monoFont = function (px, bold) {
    return (bold ? "bold " : "") + px + 'px "SFMono-Regular", Menlo, Consolas, monospace';
  };

  /* ---------- SVG helper --------------------------------------- */

  var SVGNS = "http://www.w3.org/2000/svg";
  FI.svg = function (tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };

  /* ---------- shared tooltip ----------------------------------- */

  var tipEl = null;
  FI.tooltip = {
    show: function (html, x, y) {
      if (!tipEl) {
        tipEl = document.createElement("div");
        tipEl.className = "fi-tooltip";
        tipEl.setAttribute("role", "status");
        document.body.appendChild(tipEl);
      }
      tipEl.innerHTML = html;
      var pad = 14;
      var w = tipEl.offsetWidth || 160;
      var left = FI.clamp(x + pad, 6, window.innerWidth - w - 6);
      var top = y - (tipEl.offsetHeight || 40) - pad;
      if (top < 6) top = y + pad;
      tipEl.style.left = left + "px";
      tipEl.style.top = top + "px";
      tipEl.classList.add("is-visible");
    },
    hide: function () { if (tipEl) tipEl.classList.remove("is-visible"); }
  };

  /* ---------- tab groups --------------------------------------- */

  FI.tabs = function (root, onChange) {
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
      }
    };
  };

  /* ==================================================================
     GLOBAL SCENE STATE
     Agent count and world seed are shared by every widget on the page,
     so changing them anywhere changes the whole benchmark scene. Every
     control bound with FI.scene.bindControls stays in sync.
  ================================================================== */

  FI.scene = {
    agents: 4,          /* total agents including ego: 2..6 */
    seed: 7,
    _subs: [],
    on: function (fn) { this._subs.push(fn); },
    set: function (patch) {
      var changed = false;
      for (var k in patch) {
        if (this[k] !== patch[k]) { this[k] = patch[k]; changed = true; }
      }
      if (changed) this._subs.forEach(function (fn) { try { fn(); } catch (e) {} });
    }
  };

  /* Wire any .fi-scene-bar block (there are several on the page) to the
     shared state, and keep all of them showing the same values. */
  FI.scene.bindControls = function () {
    var bars = Array.prototype.slice.call(document.querySelectorAll(".fi-scene-bar"));
    bars.forEach(function (bar) {
      var slider = bar.querySelector("input[type=range]");
      var out = bar.querySelector(".fi-scene-count");
      var reseed = bar.querySelector(".fi-reseed");
      if (slider) {
        slider.value = FI.scene.agents;
        slider.addEventListener("input", function () {
          FI.scene.set({ agents: parseInt(slider.value, 10) });
        });
      }
      if (reseed) reseed.addEventListener("click", function () {
        FI.scene.set({ seed: (FI.scene.seed * 1103515245 + 12345) >>> 8 });
      });
      bar._sync = function () {
        if (slider) slider.value = FI.scene.agents;
        if (out) {
          var c = FI.scene.agents - 1;
          out.textContent = FI.scene.agents + " agents (ego plus " +
            c + " collaborator" + (c === 1 ? "" : "s") + ")";
        }
      };
      bar._sync();
    });
    FI.scene.on(function () { bars.forEach(function (b) { b._sync(); }); });
  };

  /* ==================================================================
     MEASURED DATA — the single source of truth for every number shown.

     Everything here is CoBEVT evaluated on V2XSet at the checkpoint's
     shipped "Perfect" setting. Values are deltas against that model's
     own clean baseline, not absolute AP.

     To add another baseline when its runs finish, add an entry to
     FI.DATA.models and give each injector a d50/d70 array under that
     model key. See README.md.
  ================================================================== */

  FI.DATA = {
    model: {
      key: "cobevt",
      name: "CoBEVT",
      dataset: "V2XSet",
      setting: "Perfect",
      note: "Deltas are against this model's own clean baseline. " +
            "Two further baselines are still running and are not on this page yet."
    },

    tiers: ["Mild", "Moderate", "Severe"],

    injectors: [
      {
        key: "pose",
        name: "PoseError",
        num: "01",
        one: "A collaborator thinks it is somewhere it is not, so everything it sends lands in the wrong place.",
        param: "σ",
        units: ["0.2 m, 0.2°", "0.4 m, 0.4°", "0.6 m, 0.6°"],
        d50: [-0.015, -0.073, -0.162],
        d70: [-0.064, -0.197, -0.303]
      },
      {
        key: "latency",
        name: "CommLatency",
        num: "02",
        one: "A collaborator's message arrives late, so you are fusing a picture of where things used to be.",
        param: "Δt",
        units: ["100 ms", "200 ms", "300 ms"],
        d50: [-0.014, -0.117, -0.247],
        d70: [-0.068, -0.190, -0.266]
      },
      {
        key: "drop",
        name: "AgentDrop",
        num: "03",
        one: "A collaborator goes silent and disappears from the fusion graph entirely.",
        param: "p",
        units: ["0.25", "0.50", "0.75"],
        d50: [-0.024, -0.052, -0.087],
        d70: [-0.030, -0.069, -0.113]
      },
      {
        key: "modality",
        name: "MissingModality",
        num: "04",
        one: "A collaborator still shows up and still gets fused, but its sensor delivers nothing.",
        param: "p",
        units: ["0.25", "0.50", "0.75"],
        d50: [-0.032, -0.069, -0.116],
        d70: [-0.034, -0.075, -0.124]
      },
      {
        key: "points",
        name: "PointsReduce",
        num: "05",
        one: "Every agent keeps only a fraction of its returns, so the whole scene thins out.",
        param: "keep",
        units: ["30%", "20%", "10%"],
        d50: [-0.138, -0.203, -0.336],
        d70: [-0.170, -0.238, -0.355]
      },
      {
        key: "fog",
        name: "LidarFog",
        num: "06",
        one: "Fog swallows the return energy and drags returns back toward the sensor.",
        param: "severity",
        units: ["1", "2", "3"],
        d50: [-0.693, -0.840, -0.849],
        d70: [-0.551, -0.658, -0.660],
        extra: { label: "mean intensity", clean: 0.94, values: [0.80, 0.66, 0.51] }
      },
      {
        key: "snow",
        name: "LidarSnow",
        num: "07",
        one: "Snowflakes knock out some returns and invent new ones close to the sensor.",
        param: "severity",
        units: ["1", "2", "3"],
        d50: null,
        d70: [-0.394, -0.404, -0.448],
        extra: { label: "points removed", clean: 0.0, values: [0.399, 0.323, 0.290] }
      }
    ],

    byKey: function (k) {
      for (var i = 0; i < this.injectors.length; i++) {
        if (this.injectors[i].key === k) return this.injectors[i];
      }
      return null;
    },

    /* Injectors considered but deliberately left out of the suite. */
    notInjected: [
      {
        name: "BandwidthLimit",
        why: "It degraded the raw point cloud rather than the transmitted feature map. " +
             "That measures the wrong thing: bandwidth pressure in cooperative perception " +
             "acts on what goes over the link after the encoder, not on the sensor input."
      },
      {
        name: "TemporalMisalignment",
        why: "It is a cross-modal fault, defined between a camera stream and a LiDAR stream " +
             "that drift out of sync. On LiDAR-only input there is no second clock to " +
             "misalign against, so the injector has nothing to do."
      },
      {
        name: "BeamReduce",
        why: "Dropping laser rings needs a per-point ring index, and these clouds do not " +
             "carry one. Approximating rings from elevation angle would inject a made-up " +
             "sensor model, and the result would measure the approximation, not the fault."
      },
      {
        name: "Camera faults",
        why: "All three baselines here are LiDAR-only. Image blur, exposure and lens " +
             "occlusion have nothing to act on, so they are out of scope until a " +
             "camera-LiDAR baseline joins the set."
      }
    ]
  };

  /* ==================================================================
     SEVERITY CONTROL
     Four stops: clean, then the three measured tiers. Discrete on
     purpose, because a measurement exists only at those four points and
     an interpolated slider would imply numbers nobody measured.
  ================================================================== */

  FI.tierControl = function (host, inj, onChange) {
    var wrap = document.createElement("div");
    wrap.className = "fi-sev";

    var lab = document.createElement("label");
    lab.className = "fi-sev-label";
    lab.setAttribute("for", "sev-" + inj.key);
    lab.innerHTML = "Severity <span class=\"fi-sev-now\" id=\"sevnow-" + inj.key + "\"></span>";
    wrap.appendChild(lab);

    var input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = "3";
    input.step = "1";
    input.value = "0";
    input.id = "sev-" + inj.key;
    input.className = "fi-sev-range";
    input.setAttribute("aria-describedby", "sevticks-" + inj.key);
    wrap.appendChild(input);

    var ticks = document.createElement("div");
    ticks.className = "fi-sev-ticks";
    ticks.id = "sevticks-" + inj.key;
    var labels = ["Clean"].concat(FI.DATA.tiers);
    labels.forEach(function (name, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.dataset.v = i;
      b.innerHTML = "<span class=\"fi-tick-name\">" + name + "</span>" +
        "<span class=\"fi-tick-val\">" + (i === 0 ? "none" : inj.units[i - 1]) + "</span>";
      b.setAttribute("aria-label", name + (i === 0 ? "" : ", " + inj.param + " = " + inj.units[i - 1]));
      b.addEventListener("click", function () {
        input.value = i;
        fire();
      });
      ticks.appendChild(b);
    });
    wrap.appendChild(ticks);

    var now = null;
    function fire() {
      var v = parseInt(input.value, 10);
      if (!now) now = document.getElementById("sevnow-" + inj.key);
      if (now) {
        now.textContent = v === 0 ? "clean" : (inj.param + " = " + inj.units[v - 1]);
      }
      Array.prototype.forEach.call(ticks.children, function (b, i) {
        b.setAttribute("aria-current", i === v ? "true" : "false");
      });
      var table = document.querySelector(".fi-nums[data-inj=" + inj.key + "]");
      if (table) {
        Array.prototype.forEach.call(table.querySelectorAll("tbody tr"), function (tr, i) {
          tr.classList.toggle("is-active", i === v - 1);
        });
      }
      onChange(v);
    }
    input.addEventListener("input", fire);

    host.appendChild(wrap);
    fire();
    return { get value() { return parseInt(input.value, 10); }, input: input, refresh: fire };
  };

  /* ==================================================================
     NUMBERS PANEL — measured degradation for one injector.
  ================================================================== */

  FI.numbersTable = function (host, inj) {
    var M = FI.DATA.model;
    host.className = "fi-nums";
    host.dataset.inj = inj.key;

    var cap = "Measured degradation, " + M.name + " on " + M.dataset +
      ", " + M.setting + " setting. Delta against that model's own clean baseline.";

    var html = "<table><caption>" + cap + "</caption><thead><tr>" +
      "<th scope=\"col\">Tier</th>" +
      "<th scope=\"col\">" + inj.param + "</th>" +
      "<th scope=\"col\">ΔAP@0.5</th>" +
      "<th scope=\"col\">ΔAP@0.7</th>" +
      "</tr></thead><tbody>";

    for (var i = 0; i < 3; i++) {
      html += "<tr><th scope=\"row\">" + FI.DATA.tiers[i] + "</th>" +
        "<td>" + inj.units[i] + "</td>" +
        "<td>" + (inj.d50 ? FI.fmt.d(inj.d50[i]) : "<span class=\"fi-na\">n/a</span>") + "</td>" +
        "<td class=\"fi-num-key\">" + FI.fmt.d(inj.d70[i]) + "</td></tr>";
    }
    html += "</tbody></table>";
    if (!inj.d50) {
      html += "<p class=\"fi-nums-note\">AP@0.5 was not recorded for this injector in the " +
        "current run, so only the stricter threshold is shown.</p>";
    }
    host.innerHTML = html;
  };

  /* ==================================================================
     OPTIONAL REAL-DATA LAYER
     If projects/fault-injectors/real/manifest.json exists, each injector
     that has an entry gains a "Real data" toggle that swaps the
     synthetic canvas for an exported clip from the cluster. The page is
     complete without it; a missing or malformed manifest is silent.
  ================================================================== */

  FI.real = {
    manifest: null,
    _subs: [],
    onLoad: function (fn) { this._subs.push(fn); if (this.manifest) fn(this.manifest); },
    get: function (key, tier) {
      if (!this.manifest || !this.manifest[key]) return null;
      return this.manifest[key][String(tier)] || null;
    },
    has: function (key) { return !!(this.manifest && this.manifest[key]); }
  };

  (function loadManifest() {
    if (!window.fetch) return;
    var url = "/Portfolio/projects/fault-injectors/real/manifest.json";
    fetch(url, { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || typeof j !== "object") return;
        FI.real.manifest = j;
        FI.real._subs.forEach(function (fn) { try { fn(j); } catch (e) {} });
      })
      .catch(function () { /* no manifest: synthetic scenes only */ });
  })();

  /* ==================================================================
     PAGE FURNITURE
  ================================================================== */

  document.addEventListener("DOMContentLoaded", function () {

    /* KaTeX for the few inline formulas */
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
    var toc = document.querySelectorAll(".fi-toc a");
    var byId = {};
    toc.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          toc.forEach(function (a) { a.classList.remove("is-active"); });
          var a = byId[e.target.id];
          if (a) {
            a.classList.add("is-active");
            if (a.scrollIntoView) {
              var bar = a.parentElement;
              var want = a.offsetLeft - bar.clientWidth / 2 + a.clientWidth / 2;
              bar.scrollTo({ left: want, behavior: FI.reducedMotion ? "auto" : "smooth" });
            }
          }
        }
      });
    }, { rootMargin: "-12% 0px -72% 0px" });
    document.querySelectorAll(".fi-section").forEach(function (s) { spy.observe(s); });

    /* scroll reveal on widgets */
    var widgets = document.querySelectorAll(".fi-widget, .fi-card");
    if (!FI.reducedMotion) {
      var rev = new IntersectionObserver(function (entries) {
        FI.__markIO();
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("is-in"); rev.unobserve(e.target); }
        });
      }, { rootMargin: "0px 0px -6% 0px" });
      widgets.forEach(function (w) { w.classList.add("fi-reveal"); rev.observe(w); });
      FI.onIOBroken(function () {
        widgets.forEach(function (w) { w.classList.add("is-in"); });
        rev.disconnect();
      });
    }

    /* BibTeX-style copy buttons */
    document.querySelectorAll(".fi-copy").forEach(function (b) {
      b.addEventListener("click", function () {
        var pre = b.parentElement.querySelector("pre");
        if (!pre || !navigator.clipboard) return;
        navigator.clipboard.writeText(pre.innerText).then(function () {
          b.textContent = "copied";
          setTimeout(function () { b.textContent = "copy"; }, 1200);
        }).catch(function () {});
      });
    });
  });
})();
