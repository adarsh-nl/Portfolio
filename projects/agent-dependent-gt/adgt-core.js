/* ==================================================================
   adgt-core.js: shared runtime for the agent-dependent ground truth page.

   Provides (on window.AG):
     colors()        theme-aware palette read from CSS variables
     onTheme(fn)     redraw callbacks fired when the theme flips
     loop(el, fn)    animation loop, paused offscreen and in hidden tabs
     reducedMotion   live prefers-reduced-motion flag
     rng(seed)       deterministic PRNG (mulberry32)
     fitCanvas       HiDPI canvas sizing
     svg(tag, attrs, parent)
     tooltip.show / hide
     seg(root, fn)   segmented control (role=tab or aria-pressed buttons)
     fmt             number formatting with a true minus sign
     __frame(t)      test hook: force one frame of every loop

   Also wires: scroll reveals, the sticky in-page nav, KaTeX rendering,
   the BibTeX copy button and the hero's links from AG.PAPER.
   Vanilla ES2017, no dependencies.
================================================================== */
(function () {
  "use strict";
  var AG = (window.AG = window.AG || {});
  document.documentElement.classList.add("ag-js");

  /* ---------- colours ------------------------------------------ */

  var cache = null;
  var NAMES = ["s1", "s2", "s3", "s4", "s5", "tp", "fn", "out", "fp", "uniq", "blind",
    "good", "warn", "ink", "ink2", "muted", "grid", "axis", "surface", "surface2",
    "surface3", "border", "halo", "bg", "road", "roadline", "build", "buildline"];

  AG.colors = function () {
    if (cache) return cache;
    var cs = getComputedStyle(document.documentElement);
    cache = {};
    NAMES.forEach(function (n) { cache[n] = cs.getPropertyValue("--ag-" + n).trim(); });
    cache.agent = [cache.s1, cache.s2, cache.s3, cache.s4, cache.s5];
    return cache;
  };

  var themeFns = [];
  AG.onTheme = function (fn) { themeFns.push(fn); };
  new MutationObserver(function () {
    cache = null;
    themeFns.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- reduced motion ----------------------------------- */

  var rmq = window.matchMedia("(prefers-reduced-motion: reduce)");
  AG.reducedMotion = rmq.matches;
  var rmFns = [];
  AG.onReducedMotion = function (fn) { rmFns.push(fn); };
  if (rmq.addEventListener) rmq.addEventListener("change", function (e) {
    AG.reducedMotion = e.matches;
    rmFns.forEach(function (fn) { fn(e.matches); });
  });

  /* ---------- animation loops ---------------------------------- */

  var loops = [];

  /* fn(t, dt) is called every frame while the loop is wanted, the
     element is near the viewport and the tab is visible. */
  AG.loop = function (el, fn) {
    var wanted = false, visible = false, running = false, handle = 0, last = 0;
    function tick(t) {
      if (!running) return;
      var dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      fn(t, dt);
      handle = requestAnimationFrame(tick);
    }
    function sync() {
      var should = wanted && visible && !document.hidden;
      if (should && !running) { running = true; last = 0; handle = requestAnimationFrame(tick); }
      if (!should && running) { running = false; cancelAnimationFrame(handle); }
    }
    new IntersectionObserver(function (es) {
      visible = es[es.length - 1].isIntersecting;
      sync();
    }, { rootMargin: "100px" }).observe(el);
    document.addEventListener("visibilitychange", sync);
    var api = {
      start: function () { wanted = true; sync(); },
      stop: function () { wanted = false; sync(); },
      get wanted() { return wanted; },
      frame: function (t) { fn(t || performance.now(), 1 / 60); }
    };
    loops.push(api);
    return api;
  };

  AG.__frame = function (t) {
    loops.forEach(function (l) { try { l.frame(t); } catch (e) { console.error(e); } });
    return loops.length;
  };

  /* ---------- small utilities ---------------------------------- */

  AG.rng = function (seed) {
    var a = seed >>> 0;
    function next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    next.range = function (lo, hi) { return lo + next() * (hi - lo); };
    return next;
  };

  AG.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  AG.lerp = function (a, b, t) { return a + (b - a) * t; };
  AG.ease = function (t) { return 1 - Math.pow(1 - t, 3); };

  var MINUS = "−";
  AG.fmt = {
    /* fixed decimals with a real minus sign */
    f: function (v, n) {
      var s = Math.abs(v).toFixed(n === undefined ? 4 : n);
      return (v < 0 && Number(s) !== 0 ? MINUS : "") + s;
    },
    /* signed, always shows + or − */
    d: function (v, n) {
      var s = Math.abs(v).toFixed(n === undefined ? 4 : n);
      return (v < 0 ? MINUS : "+") + s;
    },
    pct: function (v, n) { return (v * 100).toFixed(n === undefined ? 1 : n) + "%"; },
    sci: function (v) {
      if (v === 0) return "0";
      var e = Math.floor(Math.log10(Math.abs(v)));
      var m = v / Math.pow(10, e);
      return m.toFixed(1) + " × 10" + String(e).replace("-", "⁻").replace(/\d/g, function (d) {
        return "⁰¹²³⁴⁵⁶⁷⁸⁹"[d];
      });
    }
  };

  AG.fitCanvas = function (canvas, cssH) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    var h = typeof cssH === "function" ? cssH(w) : (cssH || Math.round(w * 0.6));
    canvas.style.height = h + "px";
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  };

  AG.font = function (px, bold) {
    return (bold ? "bold " : "") + px + 'px "Computer Modern Serif", Georgia, serif';
  };

  var NS = "http://www.w3.org/2000/svg";
  AG.svg = function (tag, attrs, parent) {
    var el = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };

  /* re-run fn when an element's width changes (debounced to a frame) */
  AG.onResize = function (el, fn) {
    var lastW = 0, pending = false;
    new ResizeObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        var w = el.clientWidth;
        if (w && w !== lastW) { lastW = w; fn(w); }
      });
    }).observe(el);
  };

  /* ---------- tooltip ------------------------------------------ */

  var tip = null;
  AG.tooltip = {
    show: function (html, x, y) {
      if (!tip) {
        tip = document.createElement("div");
        tip.className = "ag-tooltip";
        tip.setAttribute("aria-hidden", "true");
        document.body.appendChild(tip);
      }
      tip.innerHTML = html;
      var w = tip.offsetWidth || 180, h = tip.offsetHeight || 40;
      tip.style.left = AG.clamp(x + 14, 6, window.innerWidth - w - 6) + "px";
      tip.style.top = (y - h - 14 < 6 ? y + 16 : y - h - 14) + "px";
      tip.classList.add("is-visible");
    },
    hide: function () { if (tip) tip.classList.remove("is-visible"); }
  };

  /* Attach hover + focus tooltips to an SVG/HTML element. */
  AG.tip = function (el, html) {
    el.addEventListener("pointerenter", function (e) { AG.tooltip.show(html(), e.clientX, e.clientY); });
    el.addEventListener("pointermove", function (e) { AG.tooltip.show(html(), e.clientX, e.clientY); });
    el.addEventListener("pointerleave", AG.tooltip.hide);
    el.addEventListener("focus", function () {
      var r = el.getBoundingClientRect();
      AG.tooltip.show(html(), r.left + r.width / 2, r.top);
    });
    el.addEventListener("blur", AG.tooltip.hide);
  };

  /* ---------- segmented controls ------------------------------- */

  /* Buttons with role=tab use aria-selected, others aria-pressed.
     Arrow keys move between options. fn(value, button) on change. */
  AG.seg = function (root, fn) {
    if (!root) return null;
    var btns = Array.prototype.slice.call(root.querySelectorAll("button"));
    var attr = btns[0] && btns[0].getAttribute("role") === "tab" ? "aria-selected" : "aria-pressed";
    function pick(b, silent) {
      btns.forEach(function (o) {
        o.setAttribute(attr, o === b ? "true" : "false");
        if (attr === "aria-selected") o.tabIndex = o === b ? 0 : -1;
      });
      if (!silent) fn(b.dataset.v, b);
    }
    btns.forEach(function (b, i) {
      b.addEventListener("click", function () { pick(b); });
      b.addEventListener("keydown", function (e) {
        var d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 :
                e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = btns[(i + d + btns.length) % btns.length];
        n.focus();
        pick(n);
      });
    });
    var init = btns.filter(function (b) { return b.getAttribute(attr) === "true"; })[0] || btns[0];
    if (init) pick(init, true);
    return {
      set: function (v, silent) {
        var b = btns.filter(function (o) { return o.dataset.v === String(v); })[0];
        if (b) pick(b, silent);
      }
    };
  };

  /* ---------- page wiring -------------------------------------- */

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  /* scroll reveals: one effect, used on section heads and figures */
  ready(function () {
    var els = document.querySelectorAll(".ag-reveal");
    if (AG.reducedMotion || !("IntersectionObserver" in window)) {
      els.forEach(function (e) { e.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (e) { io.observe(e); });
    /* never leave content invisible if the observer is starved */
    setTimeout(function () {
      els.forEach(function (e) {
        var r = e.getBoundingClientRect();
        if (r.top < window.innerHeight) e.classList.add("is-in");
      });
    }, 1500);
  });

  /* sticky nav: mark the section currently in view */
  ready(function () {
    var links = Array.prototype.slice.call(document.querySelectorAll(".ag-toc a"));
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var secs = Object.keys(map).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!secs.length) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove("is-active"); a.removeAttribute("aria-current"); });
        var a = map[e.target.id];
        if (a) {
          a.classList.add("is-active");
          a.setAttribute("aria-current", "true");
          var bar = a.parentElement;
          var x = a.offsetLeft - bar.clientWidth / 2 + a.clientWidth / 2;
          bar.scrollTo({ left: x, behavior: AG.reducedMotion ? "auto" : "smooth" });
        }
      });
    }, { rootMargin: "-35% 0px -60% 0px" });
    secs.forEach(function (s) { io.observe(s); });
  });

  /* KaTeX: rendered after the deferred library loads */
  window.addEventListener("load", function () {
    if (!window.renderMathInElement) return;
    window.renderMathInElement(document.getElementById("main"), {
      delimiters: [
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false }
      ],
      throwOnError: false
    });
    document.dispatchEvent(new CustomEvent("ag:math"));
  });

  /* links and citation from AG.PAPER */
  ready(function () {
    var P = AG.PAPER;
    if (!P) return;

    document.querySelectorAll("[data-link]").forEach(function (a) {
      var url = P.links[a.dataset.link];
      if (url) {
        a.href = url;
        a.removeAttribute("aria-disabled");
        var s = a.querySelector("small");
        if (s) s.remove();
      } else {
        a.removeAttribute("href");
        a.setAttribute("aria-disabled", "true");
        a.setAttribute("role", "link");
      }
    });
    document.querySelectorAll("[data-res]").forEach(function (td) {
      var url = P.links[td.dataset.res];
      if (url) {
        td.innerHTML = "";
        var a = document.createElement("a");
        a.href = url;
        a.textContent = td.dataset.label || url;
        td.appendChild(a);
      }
    });

    var pre = document.getElementById("bibtex");
    if (pre) pre.textContent = P.bibtex;

    var btn = document.getElementById("bib-copy");
    if (btn && pre) btn.addEventListener("click", function () {
      var text = P.bibtex;
      var done = function (ok) {
        btn.dataset.state = ok ? "ok" : "err";
        btn.textContent = ok ? "Copied" : "Copy failed: select the text";
        var live = document.getElementById("bib-status");
        if (live) live.textContent = ok ? "BibTeX copied to clipboard." : "Copy failed. Select the BibTeX text and copy it manually.";
        if (!ok) {
          var r = document.createRange();
          r.selectNodeContents(pre);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        }
        setTimeout(function () { btn.dataset.state = ""; btn.textContent = "Copy BibTeX"; }, 2200);
      };
      function legacy() {
        try {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand("copy");
          document.body.removeChild(ta);
          return ok;
        } catch (e) { return false; }
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(legacy()); });
      } else {
        done(legacy());
      }
    });
  });

  AG.ready = ready;
})();
