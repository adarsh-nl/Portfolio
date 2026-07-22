/* ==================================================================
   uxv-widgets.js — every interactive figure on the UxV page except
   the architecture explorer (uxv-arch.js) and the mission simulator
   (uxv-sim.js). Each widget is an isolated init function; all of
   them read theme colors live so dark mode repaints correctly.
================================================================== */
(function () {
  "use strict";
  var U = window.UXV;

  document.addEventListener("DOMContentLoaded", function () {
    initHero();
    initMarket();
    initAppsMatrix();
    initMaritime();
    initFusionHierarchy();
    initSota();
    initDTN();
    initDirectory();
    initFusionTrack();
    initAuction();
    initRoadmap();
  });

  /* ================================================================
     HERO — three domains discovering each other.
     Sky / land / water bands; vehicles roam their own band, and
     cross-domain communication links flicker between them: the
     paper's thesis in one image.
  ================================================================ */
  function initHero() {
    var canvas = document.getElementById("hero-scene");
    if (!canvas) return;
    var rnd = U.rng(20251129);

    var uavs = [], ugvs = [], usvs = [];
    for (var i = 0; i < 5; i++) uavs.push({ p: rnd(), y: 0.10 + rnd() * 0.32, sp: 0.012 + rnd() * 0.02, amp: 8 + rnd() * 14, ph: rnd() * 6.28 });
    for (i = 0; i < 3; i++) ugvs.push({ p: rnd(), y: 0.60 + i * 0.055, sp: 0.006 + rnd() * 0.008, dir: rnd() > 0.5 ? 1 : -1 });
    for (i = 0; i < 2; i++) usvs.push({ p: rnd(), y: 0.84 + i * 0.08, sp: 0.005 + rnd() * 0.006, ph: rnd() * 6.28 });

    function positions(w, h, t) {
      var pts = [];
      uavs.forEach(function (v) {
        var x = ((v.p + v.sp * t) % 1.12) * w * 1.12 - w * 0.06;
        pts.push({ x: x, y: v.y * h + Math.sin(t * 0.9 + v.ph) * v.amp, d: "air", hd: 0 });
      });
      ugvs.forEach(function (v) {
        var ph = (v.p + v.sp * t * v.dir) % 2;
        if (ph < 0) ph += 2;
        var x = (ph < 1 ? ph : 2 - ph) * 0.86 * w + 0.07 * w;
        pts.push({ x: x, y: v.y * h, d: "ground" });
      });
      usvs.forEach(function (v) {
        var x = ((v.p + v.sp * t) % 1.1) * w * 1.1 - w * 0.05;
        pts.push({ x: x, y: v.y * h + Math.sin(t * 1.3 + v.ph) * 2.5, d: "sea" });
      });
      return pts;
    }

    function draw(t) {
      var f = U.fitCanvas(canvas, 260), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);

      /* bands */
      var skyEnd = 0.52 * h, groundEnd = 0.76 * h;
      function band(y0, y1, col, a) {
        ctx.fillStyle = col;
        ctx.globalAlpha = a;
        ctx.fillRect(0, y0, w, y1 - y0);
        ctx.globalAlpha = 1;
      }
      band(0, skyEnd, C.air, 0.05);
      band(skyEnd, groundEnd, C.ground, 0.06);
      band(groundEnd, h, C.sea, 0.08);
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      [skyEnd, groundEnd].forEach(function (y) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      });
      ctx.fillStyle = C.muted;
      ctx.font = U.font(10);
      ctx.textAlign = "left";
      ctx.globalAlpha = 0.75;
      ctx.fillText("AIR", 10, 16);
      ctx.fillText("GROUND", 10, skyEnd + 16);
      ctx.fillText("SEA", 10, groundEnd + 16);
      ctx.globalAlpha = 1;

      var pts = positions(w, h, t);

      /* cross-domain links + traveling pulses */
      for (var i = 0; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++) {
        var a = pts[i], b = pts[j];
        if (a.d === b.d) continue;
        var d = U.dist(a.x, a.y, b.x, b.y);
        if (d > 200) continue;
        var alpha = 0.35 * (1 - d / 200);
        ctx.strokeStyle = C.ink;
        ctx.globalAlpha = alpha;
        ctx.setLineDash([2, 5]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        var ph = (t * 0.45 + i * 0.37 + j * 0.61) % 1;
        ctx.globalAlpha = alpha * 2.2;
        ctx.fillStyle = C.s1;
        ctx.beginPath();
        ctx.arc(U.lerp(a.x, b.x, ph), U.lerp(a.y, b.y, ph), 2.4, 0, 6.29);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      /* vehicles */
      pts.forEach(function (p) {
        var col = p.d === "air" ? C.air : p.d === "ground" ? C.ground : C.sea;
        if (p.d === "air") U.glyph.uav(ctx, p.x, p.y, 6, 0, col);
        else if (p.d === "ground") U.glyph.ugv(ctx, p.x, p.y, 5.5, 0, col);
        else U.glyph.usv(ctx, p.x, p.y, 6, 0, col);
      });
    }

    if (U.reducedMotion) { draw(4); U.onThemeChange(function () { draw(4); }); return; }
    var loop = U.raf(canvas, function (tm) { draw(tm / 1000); });
    loop.start();
  }

  /* ================================================================
     MARKET — $29.3B (2025) → $46B+ (2030).
     A slider over the forecast years; the headline number and the
     bar chart grow together, making the scale of the field felt
     rather than read.
  ================================================================ */
  function initMarket() {
    var slider = document.getElementById("market-year");
    if (!slider) return;
    var valEl = document.getElementById("market-value");
    var yearEl = document.getElementById("market-year-label");
    var svg = document.getElementById("market-bars");
    var Y0 = 2025, Y1 = 2030, V0 = 29.3, V1 = 46.0;
    var rate = Math.pow(V1 / V0, 1 / (Y1 - Y0));
    function valueAt(y) { return V0 * Math.pow(rate, y - Y0); }

    var bars = [];
    function build() {
      svg.innerHTML = "";
      bars = [];
      var C = U.colors();
      var W = 380, H = 130, bw = 40, gap = (W - 6 * bw - 20) / 5;
      for (var y = Y0; y <= Y1; y++) {
        var i = y - Y0;
        var v = valueAt(y);
        var bh = (v / 50) * (H - 34);
        var x = 10 + i * (bw + gap);
        var r = U.svg("rect", {
          x: x, y: H - 22 - bh, width: bw, height: bh, rx: 4,
          fill: C.s1, "fill-opacity": 0.25
        }, svg);
        r.style.transition = "fill-opacity 0.25s ease";
        U.svg("text", {
          x: x + bw / 2, y: H - 8, "text-anchor": "middle",
          "font-size": 11, fill: C.muted, "font-family": "inherit"
        }, svg).textContent = y;
        var lab = U.svg("text", {
          x: x + bw / 2, y: H - 28 - bh, "text-anchor": "middle",
          "font-size": 10, fill: C.ink2, "font-family": "inherit", opacity: 0
        }, svg);
        lab.textContent = "$" + v.toFixed(1) + "B";
        lab.style.transition = "opacity 0.25s ease";
        bars.push({ rect: r, label: lab, year: y });
      }
      update();
    }

    function update() {
      var y = +slider.value;
      valEl.textContent = "$" + valueAt(y).toFixed(1) + "B";
      yearEl.textContent = y;
      bars.forEach(function (b) {
        b.rect.setAttribute("fill-opacity", b.year <= y ? "0.85" : "0.22");
        b.label.setAttribute("opacity", b.year === y ? "1" : "0");
      });
    }

    slider.addEventListener("input", update);
    U.onThemeChange(build);
    build();
  }

  /* ================================================================
     APPLICATION MATRIX — Table I as a clickable platform × sector
     grid. Interaction replaces reading: the visitor samples the
     landscape instead of scanning a table.
  ================================================================ */
  function initAppsMatrix() {
    var root = document.getElementById("apps-matrix");
    if (!root) return;
    var detail = document.getElementById("apps-detail");

    var DOMAINS = ["Transport", "Industrial", "Military", "Entertainment"];
    var DATA = [
      { key: "air", name: "UAV", cells: [
        { s: "Delivery", full: "Package delivery, Urban Air Mobility" },
        { s: "Inspection", full: "Infrastructure inspection, agricultural monitoring" },
        { s: "ISR", full: "Intelligence, Surveillance, Reconnaissance" },
        { s: "Filming", full: "Cinematography, drone racing, light shows" }
      ]},
      { key: "ground", name: "UGV", cells: [
        { s: "Delivery bots", full: "Delivery bots, autonomous transportation" },
        { s: "Warehouses", full: "Warehouse automation, mining bots" },
        { s: "EOD & combat", full: "Combat vehicles, explosive ordnance disposal" },
        { s: "Battle bots", full: "Battle robots, theme-park animatronics" }
      ]},
      { key: "sea", name: "USV", cells: [
        { s: "Cargo ships", full: "Autonomous cargo ships, robotic ferries" },
        { s: "Offshore", full: "Oceanography, offshore maintenance" },
        { s: "Naval patrol", full: "Naval patrol, mine countermeasures" },
        { s: "Tours", full: "Autonomous tours, remote boat racing" }
      ]}
    ];

    var ICONS = {
      air: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--viz-air)" d="M12 9l8 4-8 3-8-3z"/><circle cx="4" cy="7" r="2.4" fill="var(--viz-air)" opacity="0.55"/><circle cx="20" cy="7" r="2.4" fill="var(--viz-air)" opacity="0.55"/></svg>',
      ground: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="8" width="16" height="8" rx="2" fill="var(--viz-ground)"/><circle cx="8" cy="18" r="2.2" fill="var(--viz-ground)" opacity="0.6"/><circle cx="16" cy="18" r="2.2" fill="var(--viz-ground)" opacity="0.6"/></svg>',
      sea: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--viz-sea)" d="M3 13h18l-3 5H6z"/><rect x="11" y="6" width="2" height="6" fill="var(--viz-sea)" opacity="0.7"/></svg>'
    };

    root.appendChild(el("span", "uxv-matrix-corner"));
    DOMAINS.forEach(function (d) {
      var h = el("span", "uxv-matrix-head");
      h.textContent = d;
      root.appendChild(h);
    });

    var buttons = [];
    DATA.forEach(function (row) {
      var rh = el("span", "uxv-matrix-row-head");
      rh.innerHTML = ICONS[row.key] + row.name;
      root.appendChild(rh);
      row.cells.forEach(function (cell, ci) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = row.key;
        b.textContent = cell.s;
        b.dataset.domain = DOMAINS[ci];
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", function () {
          buttons.forEach(function (o) { o.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true");
          detail.innerHTML = "<strong>" + row.name + " &times; " + DOMAINS[ci] + "</strong> &mdash; " +
            cell.full + ". <em>One platform, one domain: today each of these is engineered and deployed on its own.</em>";
        });
        buttons.push(b);
        root.appendChild(b);
      });
    });

    function el(tag, cls) { var e = document.createElement(tag); e.className = cls; return e; }
  }

  /* ================================================================
     MARITIME STORYBOARD — time-to-neutralization vs. coverage.
     Each step adds a domain; the visible payoff is the shrinking
     red bar: synergy quantified, not asserted.
  ================================================================ */
  function initMaritime() {
    var canvas = document.getElementById("maritime-canvas");
    if (!canvas) return;
    var caption = document.getElementById("maritime-caption");
    var playBtn = document.getElementById("maritime-play");

    var STEPS = [
      { ttn: 1.0, detect: 0.34,
        cap: "USV alone: sonar has short reach, so the threat is only confirmed close to the harbour. Engagement works — but response time is the mission cost." },
      { ttn: 0.55, detect: 0.80,
        cap: "Add UAV surveillance: an aerial camera spots the vessel far out at sea. Same USV, same weapons — minutes more warning." },
      { ttn: 0.40, detect: 0.80,
        cap: "Add coastal UGVs: land-based targeting is ready before the threat is in range. The engagement window widens again." },
      { ttn: 0.25, detect: 0.80,
        cap: "Compound effect: aerial detection + coastal targeting + USV underwater tracking. Strengths stack across domains and time-to-neutralization collapses." }
    ];
    var step = 0, animT = 0, playing = false, lastT = 0;
    var shownTtn = 1.0;

    var tabs = U.tabs(document.getElementById("maritime-steps"), function (k) {
      step = +k;
      caption.textContent = STEPS[step].cap;
    });
    caption.textContent = STEPS[0].cap;

    playBtn.addEventListener("click", function () {
      playing = !playing;
      playBtn.classList.toggle("is-playing", playing);
      playBtn.innerHTML = playing ? "&#9646;&#9646;" : "&#9654;";
    });

    function draw(tm) {
      var t = tm / 1000;
      var dt = lastT ? Math.min(t - lastT, 0.1) : 0;
      lastT = t;
      animT += dt;
      if (playing && animT > 3.2) {
        animT = 0;
        step = (step + 1) % 4;
        tabs.highlight(step);
        caption.textContent = STEPS[step].cap;
      }
      shownTtn = U.lerp(shownTtn, STEPS[step].ttn, U.reducedMotion ? 1 : 0.08);

      var f = U.fitCanvas(canvas, 280), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);
      var seaTop = h * 0.30, barY = h - 44;

      /* sky + sea */
      ctx.fillStyle = C.air; ctx.globalAlpha = 0.05; ctx.fillRect(0, 0, w, seaTop);
      ctx.fillStyle = C.sea; ctx.globalAlpha = 0.10; ctx.fillRect(0, seaTop, w, barY - 14 - seaTop);
      ctx.globalAlpha = 1;

      /* harbour on the left */
      ctx.fillStyle = C.ink2;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, seaTop - 12, w * 0.08, barY - 2 - seaTop);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.muted;
      ctx.font = U.font(10);
      ctx.textAlign = "left";
      ctx.fillText("HARBOUR", 6, seaTop - 20);

      var seaMid = seaTop + (barY - 14 - seaTop) * 0.5;

      /* threat: oscillates in from the right; flashes at detection point */
      var det = STEPS[step].detect;                 /* 0..1 from harbour */
      var tx = w * (0.10 + det * 0.82);
      var phase = (animT % 3.2) / 3.2;
      var threatX = U.lerp(w * 0.97, tx, U.clamp(phase * 1.6, 0, 1));
      U.glyph.usv(ctx, threatX, seaMid, 8, 0, C.crit);
      ctx.font = U.font(10);
      ctx.fillStyle = C.crit;
      ctx.textAlign = "center";
      ctx.fillText("threat", threatX, seaMid - 14);
      if (phase > 0.6) {
        ctx.strokeStyle = C.crit;
        ctx.globalAlpha = 0.9 - (phase - 0.6) * 2;
        ctx.beginPath(); ctx.arc(tx, seaMid, 12 + (phase - 0.6) * 60, 0, 6.29); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* USV defender + sonar cone */
      var ux = w * 0.16;
      U.glyph.usv(ctx, ux, seaMid + 24, 8, 0, C.sea);
      ctx.fillStyle = C.sea;
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.moveTo(ux, seaMid + 24);
      ctx.arc(ux, seaMid + 24, w * 0.20, -0.5, 0.35);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      if (step >= 3) { /* underwater tracking ring */
        ctx.strokeStyle = C.sea;
        ctx.setLineDash([3, 4]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(ux, seaMid + 24, w * 0.26 + Math.sin(t * 2) * 4, -0.6, 0.5); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      /* UAV + vision cone */
      if (step >= 1) {
        var ax = w * 0.45, ay = h * 0.13;
        U.glyph.uav(ctx, ax, ay, 7, 0.5, C.air);
        ctx.fillStyle = C.air;
        ctx.globalAlpha = 0.10;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(w * 0.98, seaMid + 30);
        ctx.lineTo(w * 0.50, seaMid + 40);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }

      /* UGV battery on the coast */
      if (step >= 2) {
        U.glyph.ugv(ctx, w * 0.045, seaTop + 16, 6, 0, C.ground);
        ctx.strokeStyle = C.ground;
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(w * 0.06, seaTop + 16);
        ctx.lineTo(threatX - 8, seaMid - 4);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      /* time-to-neutralization bar */
      ctx.fillStyle = C.muted;
      ctx.font = U.font(10.5);
      ctx.textAlign = "left";
      ctx.fillText("TIME TO NEUTRALIZATION", 10, barY + 12);
      var bx = 10, bw = w - 20, by = barY + 18, bh = 12;
      ctx.fillStyle = C.grid;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = shownTtn > 0.6 ? C.crit : shownTtn > 0.35 ? C.warn : C.good;
      ctx.fillRect(bx, by, bw * shownTtn, bh);
      ctx.fillStyle = C.ink;
      ctx.font = U.font(11, true);
      ctx.fillText(Math.round(shownTtn * 100) + "%", bx + bw * shownTtn + 6, by + 10);
    }

    var loop = U.raf(canvas, draw);
    loop.start();
  }

  /* ================================================================
     FUSION HIERARCHY — pyramid selector + one live demo per level.
     Each demo *computes* what its level fuses: noisy sensors → state
     (L1), two viewpoints → one track (L2), facts → meaning (L3).
  ================================================================ */
  function initFusionHierarchy() {
    var pyr = document.getElementById("fusion-pyramid");
    if (!pyr) return;
    var canvas = document.getElementById("fusion-demo");
    var caption = document.getElementById("fusion-caption");

    var LEVELS = [
      { id: 2, name: "Mission-level", q: "why? · so what?",
        cap: "<strong>Mission-level fusion (the gap).</strong> Fuse <em>concepts</em>: intent, capability, causality. A knowledge graph relates agents, tasks and environment — UGV-2 is escorting civilian-1, UAV-3 is on Objective-1, fire blocks exit B — so the collective can reason about trade-offs and act as one." },
      { id: 1, name: "Intra-swarm", q: "what? · where?",
        cap: "<strong>Intra-swarm fusion (the frontier).</strong> Aggregate several vehicles into a shared tactical picture. The key challenge is data association — do two observations refer to the same object? Redundant viewpoints shrink uncertainty, but the result is still geometric: objects and positions, no mission meaning." },
      { id: 0, name: "Intra-vehicle", q: "where am I?",
        cap: "<strong>Intra-vehicle fusion (well studied).</strong> One vehicle merges its own noisy sensors — IMU, GPS, cameras — into a robust state estimate (Kalman filters, factor-graph SLAM). Essential, but egocentric: blind to the wider mission and to every other agent." }
    ];
    var current = 0;   /* demo level id: 0 base, 1 mid, 2 top */

    /* --- pyramid SVG --- */
    var shapes = [];
    function buildPyramid() {
      pyr.innerHTML = "";
      var C = U.colors();
      var geom = [
        { pts: "20,240 280,240 232,175 68,175", id: 0, label: "1 · Intra-vehicle", ly: 212 },
        { pts: "68,167 232,167 187,105 113,105", id: 1, label: "2 · Intra-swarm", ly: 140 },
        { pts: "113,97 187,97 150,30", id: 2, label: "3 · Mission", ly: 78 }
      ];
      var cols = [C.s3, C.s1, C.s5];
      shapes = [];
      geom.forEach(function (g) {
        var grp = U.svg("g", { "class": "pyr-level", role: "tab", tabindex: 0,
          "aria-selected": g.id === current ? "true" : "false", "aria-label": g.label }, pyr);
        var p = U.svg("polygon", { points: g.pts, fill: cols[g.id], "fill-opacity": 0.22,
          stroke: cols[g.id], "stroke-width": 1.5, rx: 4 }, grp);
        var tx = U.svg("text", { x: 150, y: g.ly, "text-anchor": "middle", "font-size": 14,
          "font-family": "inherit", fill: C.ink }, grp);
        tx.textContent = g.label;
        function select() {
          current = g.id;
          caption.innerHTML = LEVELS.filter(function (L) { return L.id === g.id; })[0].cap;
          shapes.forEach(function (s) {
            s.grp.setAttribute("aria-selected", s.id === g.id ? "true" : "false");
            s.poly.setAttribute("fill-opacity", s.id === g.id ? 0.5 : 0.15);
            s.poly.setAttribute("stroke-width", s.id === g.id ? 2.5 : 1.5);
          });
          demoT = 0;
        }
        grp.addEventListener("click", select);
        grp.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } });
        shapes.push({ grp: grp, poly: p, id: g.id, select: select });
      });
      /* re-apply selection state */
      shapes.forEach(function (s) {
        s.poly.setAttribute("fill-opacity", s.id === current ? 0.5 : 0.15);
        s.poly.setAttribute("stroke-width", s.id === current ? 2.5 : 1.5);
      });
    }
    buildPyramid();
    U.onThemeChange(buildPyramid);
    caption.innerHTML = LEVELS[2].cap;   /* default: base level (id 0) — set below */
    current = 0;
    shapes[0].select();

    /* --- demos --- */
    var demoT = 0, lastT = 0;
    var rnd = U.rng(7);

    function truePath(u, w, h) {
      return { x: w * 0.12 + u * w * 0.76, y: h * 0.55 + Math.sin(u * 5.2) * h * 0.2 };
    }

    function drawL0(ctx, w, h, t, C) {
      /* noisy fixes around a true path; fused estimate hugs the path */
      var u = (t * 0.12) % 1;
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var i = 0; i <= 60; i++) {
        var p = truePath(i / 60, w, h);
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
      /* raw GPS fixes: scattered */
      var jr = U.rng(Math.floor(t * 4) + 11);
      for (i = 0; i < 14; i++) {
        var uu = Math.max(0, u - i * 0.012);
        var p2 = truePath(uu, w, h);
        ctx.fillStyle = C.warn;
        ctx.globalAlpha = 0.55 * (1 - i / 14);
        ctx.beginPath();
        ctx.arc(p2.x + jr.gauss() * 14, p2.y + jr.gauss() * 14, 2.5, 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      /* fused trail */
      ctx.strokeStyle = C.s3;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (i = 0; i <= 40; i++) {
        var uf = Math.max(0, u - 0.25) + (i / 40) * Math.min(u, 0.25);
        var pf = truePath(uf, w, h);
        i ? ctx.lineTo(pf.x, pf.y) : ctx.moveTo(pf.x, pf.y);
      }
      ctx.stroke();
      var pv = truePath(u, w, h);
      U.glyph.ugv(ctx, pv.x, pv.y, 7, 0, C.ground);
      label(ctx, C, w, [["■", C.warn, "raw sensor fixes"], ["—", C.s3, "fused state (KF)"]]);
    }

    function drawL1(ctx, w, h, t, C) {
      /* two observers, one target: association + shrinking ellipse */
      var u = (t * 0.10) % 1;
      var tgt = { x: w * 0.25 + u * w * 0.5, y: h * 0.52 + Math.sin(u * 6.28) * h * 0.13 };
      var jr = U.rng(Math.floor(t * 3) + 5);
      var m1 = { x: tgt.x + jr.gauss() * 16, y: tgt.y + jr.gauss() * 5 };
      var m2 = { x: tgt.x + jr.gauss() * 5, y: tgt.y + jr.gauss() * 16 };
      var o1 = { x: w * 0.08, y: h * 0.14 }, o2 = { x: w * 0.9, y: h * 0.86 };
      U.glyph.uav(ctx, o1.x, o1.y, 7, 0.6, C.air);
      U.glyph.usv(ctx, o2.x, o2.y, 7, 0, C.sea);
      /* sight lines */
      ctx.setLineDash([2, 4]);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = C.air;
      ctx.beginPath(); ctx.moveTo(o1.x, o1.y); ctx.lineTo(m1.x, m1.y); ctx.stroke();
      ctx.strokeStyle = C.sea;
      ctx.beginPath(); ctx.moveTo(o2.x, o2.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      /* measurement ellipses */
      ellipse(ctx, m1.x, m1.y, 26, 10, 0, C.air, 0.14);
      ellipse(ctx, m2.x, m2.y, 10, 26, 0, C.sea, 0.14);
      /* association link */
      ctx.strokeStyle = C.ink2;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4);
      ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.ink2;
      ctx.font = U.font(10);
      ctx.textAlign = "center";
      ctx.fillText("same object?", (m1.x + m2.x) / 2, (m1.y + m2.y) / 2 - 8);
      /* fused */
      var fx = (m1.x / (26 * 26) + m2.x / (10 * 10)) / (1 / (26 * 26) + 1 / (10 * 10));
      var fy = (m1.y / (10 * 10) + m2.y / (26 * 26)) / (1 / (10 * 10) + 1 / (26 * 26));
      ellipse(ctx, fx, fy, 9, 9, 0, C.good, 0.22);
      ctx.fillStyle = C.good;
      ctx.beginPath(); ctx.arc(fx, fy, 3, 0, 6.29); ctx.fill();
      U.glyph.usv(ctx, tgt.x, tgt.y, 6, 0, C.muted);
      label(ctx, C, w, [["◯", C.air, "UAV view"], ["◯", C.sea, "USV view"], ["●", C.good, "fused track"]]);
    }

    var KG = {
      nodes: [
        { id: "UAV-3", x: 0.2, y: 0.22, d: "air" },
        { id: "UGV-2", x: 0.16, y: 0.7, d: "ground" },
        { id: "civilian-1", x: 0.48, y: 0.82, d: null },
        { id: "Objective-1", x: 0.55, y: 0.2, d: null },
        { id: "fire", x: 0.82, y: 0.5, d: "crit" },
        { id: "exit B", x: 0.85, y: 0.85, d: null }
      ],
      edges: [
        [0, 3, "performing"], [1, 2, "escorting"], [4, 5, "blocks"],
        [0, 4, "observed"], [2, 5, "needs route to"]
      ]
    };
    function drawL2(ctx, w, h, t, C) {
      var pos = KG.nodes.map(function (n) { return { x: n.x * w, y: n.y * h }; });
      KG.edges.forEach(function (e, i) {
        var a = pos[e[0]], b = pos[e[1]];
        var on = ((t * 0.5) % KG.edges.length) >= i;
        ctx.strokeStyle = C.ink2;
        ctx.globalAlpha = on ? 0.75 : 0.15;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        if (on) {
          ctx.fillStyle = C.s5;
          ctx.font = U.font(10, true);
          ctx.textAlign = "center";
          ctx.globalAlpha = 0.95;
          ctx.fillText(e[2], (a.x + b.x) / 2, (a.y + b.y) / 2 - 5);
        }
        ctx.globalAlpha = 1;
      });
      KG.nodes.forEach(function (n, i) {
        var p = pos[i];
        var col = n.d === "air" ? C.air : n.d === "ground" ? C.ground : n.d === "crit" ? C.crit : C.ink2;
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.16;
        ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, 6.29); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, 6.29); ctx.stroke();
        ctx.fillStyle = C.ink;
        ctx.font = U.font(10.5);
        ctx.textAlign = "center";
        ctx.fillText(n.id, p.x, p.y + 30);
      });
      label(ctx, C, w, [["—", C.s5, "semantic relations, appearing as they are inferred"]]);
    }

    function ellipse(ctx, x, y, rx, ry, rot, col, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = col;
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 6.29); ctx.stroke();
      ctx.restore();
    }
    function label(ctx, C, w, items) {
      ctx.font = U.font(10.5);
      ctx.textAlign = "left";
      var x = 10;
      items.forEach(function (it) {
        ctx.fillStyle = it[1];
        ctx.fillText(it[0], x, 16);
        x += ctx.measureText(it[0]).width + 4;
        ctx.fillStyle = C.ink2;
        ctx.fillText(it[2], x, 16);
        x += ctx.measureText(it[2]).width + 14;
      });
    }

    var loop = U.raf(canvas, function (tm) {
      var t = tm / 1000;
      var f = U.fitCanvas(canvas, 250), ctx = f.ctx, C = U.colors();
      ctx.clearRect(0, 0, f.w, f.h);
      if (current === 0) drawL0(ctx, f.w, f.h, t, C);
      else if (current === 1) drawL1(ctx, f.w, f.h, t, C);
      else drawL2(ctx, f.w, f.h, t, C);
    });
    loop.start();
  }

  /* ================================================================
     PRIOR WORK — Table II, but each row demonstrates its own
     ceiling as a looping sketch. Reading a ✗ is forgettable;
     watching a target get lost at a zone wall is not.
  ================================================================ */
  function initSota() {
    var tbody = document.querySelector("#sota-table tbody");
    if (!tbody) return;
    var title = document.getElementById("sota-title");
    var desc = document.getElementById("sota-desc");
    var canvas = document.getElementById("sota-demo");

    function mark(v) {
      if (v === true) return '<span class="yes">&#10003;</span>';
      if (v === false) return '<span class="no">&mdash;</span>';
      return '<span class="partial">' + v + "</span>";
    }

    var ROWS = [
      { key: "stolfi", work: "Stolfi et al. 2021", uvs: "UAV·UGV·USV", cols: [true, false, false, false, false],
        title: "Static partitioning: co-located, not collaborative",
        desc: "Cross-domain swarms hunt evaders — but each swarm is fenced into its own dedicated zone. No inter-swarm communication, no fused sensing. Watch the target: every time it crosses a boundary, whoever was tracking it goes blind and the next swarm must reacquire from scratch." },
      { key: "jaus", work: "Wang et al. 2022 / JAUS", uvs: "UxV", cols: [true, true, false, false, false],
        title: "Interoperability standards: syntax without semantics",
        desc: "Message standards like JAUS achieve plug-and-play data exchange — the “verbs and nouns” of communication. But delivering a packet is not understanding it: a human operator still sits in the middle doing all the reasoning. The systems talk; they do not think together." },
      { key: "wu", work: "Wu et al. 2022", uvs: "UAV", cols: [true, false, "intra-swarm", false, false],
        title: "Game theory: the mission reduced to cooperate/defect",
        desc: "Evolutionary games elegantly explain when collaboration pays off. But the model compresses a rich, multi-objective mission into a 2×2 payoff matrix — valuable analysis, not a functional architecture that fuses real sensor data or manages real objectives." },
      { key: "xu", work: "Xu et al. 2024", uvs: "UAV·USV", cols: [true, true, "inter-vehicle", false, false],
        title: "Physical coordination: brilliant at one task, blind to the mission",
        desc: "A manipulator arm on a USV catches and lands a UAV in rough seas — hard control, beautifully solved. But the collaboration is purely physical: while the pair coordinates its ballet, a third-party target sails past unobserved. Nothing here scales to negotiating mission objectives." },
      { key: "ours", work: "UxV Ecosystem (proposed)", uvs: "UxV", cols: [true, true, "mission-level", true, true], ours: true,
        title: "The proposed ecosystem: every column, by construction",
        desc: "Collaboration, information sharing and mission-level fusion are not features bolted on — they are what the architecture is made of: a shared world model, semantic services, and decentralized task allocation across all three domains. The rest of this page shows how." }
    ];

    var trs = [];
    ROWS.forEach(function (r, i) {
      var tr = document.createElement("tr");
      if (r.ours) tr.className = "uxv-ours";
      tr.setAttribute("tabindex", "0");
      tr.setAttribute("aria-selected", "false");
      tr.innerHTML = "<td>" + r.work + "</td><td>" + r.uvs + "</td>" +
        r.cols.map(function (c) { return "<td>" + mark(c) + "</td>"; }).join("");
      function select() {
        trs.forEach(function (o) { o.setAttribute("aria-selected", "false"); });
        tr.setAttribute("aria-selected", "true");
        selected = r.key;
        title.textContent = r.title;
        desc.textContent = r.desc;
      }
      tr.addEventListener("click", select);
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } });
      trs.push(tr);
      tbody.appendChild(tr);
      if (i === 0) setTimeout(select, 0);
    });
    var selected = "stolfi";

    /* --- demos --- */
    function demoStolfi(ctx, w, h, t, C) {
      var zones = [[0, w / 3], [w / 3, 2 * w / 3], [2 * w / 3, w]];
      var zcol = [C.air, C.ground, C.sea];
      zones.forEach(function (z, i) {
        ctx.fillStyle = zcol[i];
        ctx.globalAlpha = 0.06;
        ctx.fillRect(z[0], 0, z[1] - z[0], h);
        ctx.globalAlpha = 1;
      });
      [w / 3, 2 * w / 3].forEach(function (x) {
        ctx.strokeStyle = C.ink2;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, h - 4); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
      });
      /* patrols confined to zones */
      for (var i = 0; i < 3; i++) {
        var cx = (zones[i][0] + zones[i][1]) / 2 + Math.cos(t * 1.2 + i * 2) * (w / 9);
        var cy = h / 2 + Math.sin(t * 1.6 + i) * h * 0.28;
        var g = i === 0 ? U.glyph.uav : i === 1 ? U.glyph.ugv : U.glyph.usv;
        g(ctx, cx, cy, 6, 0, zcol[i]);
      }
      /* target crossing all zones */
      var u = (t * 0.11) % 1;
      var txx = u * w, tyy = h * 0.35 + Math.sin(u * 9) * h * 0.15;
      var zone = Math.min(2, Math.floor(txx / (w / 3)));
      var nearWall = Math.abs(txx - w / 3) < w * 0.06 || Math.abs(txx - 2 * w / 3) < w * 0.06;
      ctx.fillStyle = C.crit;
      ctx.beginPath(); ctx.arc(txx, tyy, 5, 0, 6.29); ctx.fill();
      if (!nearWall) {
        ctx.strokeStyle = zcol[zone];
        ctx.beginPath(); ctx.arc(txx, tyy, 12 + Math.sin(t * 5) * 2, 0, 6.29); ctx.stroke();
      } else {
        ctx.fillStyle = C.crit;
        ctx.font = U.font(11, true);
        ctx.textAlign = "center";
        ctx.fillText("track lost!", txx, tyy - 16);
      }
    }

    function demoJaus(ctx, w, h, t, C) {
      var a = { x: w * 0.12, y: h * 0.5 }, b = { x: w * 0.88, y: h * 0.5 };
      U.glyph.uav(ctx, a.x, a.y - 20, 7, 0, C.air);
      U.glyph.ugv(ctx, b.x, b.y - 20, 7, 0, C.ground);
      ctx.strokeStyle = C.axis;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      for (var i = 0; i < 4; i++) {
        var u = ((t * 0.3 + i * 0.25) % 1);
        ctx.fillStyle = C.s1;
        ctx.fillRect(U.lerp(a.x, b.x, u) - 4, a.y - 3, 8, 6);
      }
      ctx.fillStyle = C.ink2;
      ctx.font = U.font(10);
      ctx.textAlign = "center";
      ctx.fillText("SET_WAYPOINT · QUERY_STATUS · REPORT_POSE", w / 2, h * 0.5 + 22);
      ctx.fillStyle = C.good;
      ctx.fillText("✓ delivered", w / 2, h * 0.5 + 38);
      var pulse = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.fillStyle = C.crit;
      ctx.globalAlpha = 0.5 + pulse * 0.5;
      ctx.font = U.font(13, true);
      ctx.fillText("but what does it MEAN for the mission?", w / 2, h * 0.2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.muted;
      ctx.font = U.font(10);
      ctx.fillText("(a human operator still does all the reasoning)", w / 2, h * 0.86);
    }

    function demoWu(ctx, w, h, t, C) {
      var cellW = Math.min(w * 0.18, 70), x0 = w / 2 - cellW, y0 = h * 0.24;
      var step = Math.floor(t * 1.2);
      var jr = U.rng(step);
      var c1 = jr() > 0.4, c2 = jr() > 0.4;
      ctx.font = U.font(11);
      ctx.textAlign = "center";
      ctx.fillStyle = C.ink2;
      ctx.fillText("Cooperate", x0 + cellW / 2, y0 - 8);
      ctx.fillText("Defect", x0 + cellW * 1.5, y0 - 8);
      for (var r = 0; r < 2; r++) for (var c = 0; c < 2; c++) {
        var active = (r === (c1 ? 0 : 1)) && (c === (c2 ? 0 : 1));
        ctx.fillStyle = active ? C.s4 : C.surface2;
        ctx.globalAlpha = active ? 0.6 : 1;
        ctx.fillRect(x0 + c * cellW, y0 + r * cellW * 0.7, cellW - 3, cellW * 0.7 - 3);
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.ink2;
        var pay = [["3,3", "0,5"], ["5,0", "1,1"]][r][c];
        ctx.fillText(pay, x0 + c * cellW + cellW / 2 - 1, y0 + r * cellW * 0.7 + cellW * 0.35);
      }
      ctx.fillStyle = C.ink2;
      ctx.textAlign = "left";
      ctx.fillText("agent 1: " + (c1 ? "cooperate" : "defect"), 12, h * 0.3);
      ctx.fillText("agent 2: " + (c2 ? "cooperate" : "defect"), 12, h * 0.3 + 16);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center";
      ctx.font = U.font(10.5);
      ctx.fillText("an entire multi-objective mission, compressed into one 2×2 game", w / 2, h * 0.88);
    }

    function demoXu(ctx, w, h, t, C) {
      var sx = w * 0.4, sy = h * 0.66 + Math.sin(t * 1.7) * 4;
      U.glyph.usv(ctx, sx, sy, 12, 0, C.sea);
      /* manipulator arm */
      ctx.strokeStyle = C.sea;
      ctx.lineWidth = 2.5;
      var reach = 0.5 + 0.5 * Math.sin(t * 0.8);
      ctx.beginPath();
      ctx.moveTo(sx + 6, sy - 8);
      ctx.lineTo(sx + 16, sy - 22 - reach * 8);
      ctx.lineTo(sx + 8, sy - 34 - reach * 14);
      ctx.stroke();
      ctx.lineWidth = 1;
      /* UAV descending in a loop */
      var ph = (t * 0.25) % 1;
      var ay = h * 0.12 + U.ease(Math.min(1, ph * 1.4)) * (sy - 48 - reach * 14 - h * 0.12);
      U.glyph.uav(ctx, sx + 8 + Math.sin(t * 3) * 3 * (1 - ph), ay, 7, 0, C.air);
      ctx.fillStyle = C.ink2;
      ctx.font = U.font(10.5);
      ctx.textAlign = "left";
      ctx.fillText("precision landing under disturbance: solved ✓", 12, 20);
      /* untracked third party */
      var ux = ((t * 0.06) % 1.2) * w;
      U.glyph.usv(ctx, ux, h * 0.9, 7, 0, C.crit);
      ctx.fillStyle = C.crit;
      ctx.textAlign = "center";
      ctx.fillText("third-party target: nobody is watching", U.clamp(ux, 90, w - 110), h * 0.9 - 16);
    }

    function demoOurs(ctx, w, h, t, C) {
      var hub = { x: w / 2, y: h / 2 };
      var nodes = [
        { x: w * 0.15, y: h * 0.2, d: "air" }, { x: w * 0.85, y: h * 0.22, d: "air" },
        { x: w * 0.12, y: h * 0.78, d: "ground" }, { x: w * 0.5, y: h * 0.9, d: "sea" },
        { x: w * 0.88, y: h * 0.78, d: "ground" }
      ];
      nodes.forEach(function (n, i) {
        ctx.strokeStyle = C.axis;
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(hub.x, hub.y); ctx.stroke();
        ctx.globalAlpha = 1;
        var u = (t * 0.5 + i * 0.2) % 1;
        var out = i % 2 === 0;
        var px = U.lerp(out ? n.x : hub.x, out ? hub.x : n.x, u);
        var py = U.lerp(out ? n.y : hub.y, out ? hub.y : n.y, u);
        ctx.fillStyle = out ? C.s1 : C.s5;
        ctx.beginPath(); ctx.arc(px, py, 3, 0, 6.29); ctx.fill();
        var col = n.d === "air" ? C.air : n.d === "ground" ? C.ground : C.sea;
        (n.d === "air" ? U.glyph.uav : n.d === "ground" ? U.glyph.ugv : U.glyph.usv)(ctx, n.x, n.y, 7, 0, col);
      });
      ctx.fillStyle = C.s5;
      ctx.globalAlpha = 0.15;
      ctx.beginPath(); ctx.arc(hub.x, hub.y, 26 + Math.sin(t * 2) * 3, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.s5;
      ctx.beginPath(); ctx.arc(hub.x, hub.y, 26, 0, 6.29); ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.font = U.font(11, true);
      ctx.textAlign = "center";
      ctx.fillText("DWM", hub.x, hub.y + 4);
      ctx.fillStyle = C.ink2;
      ctx.font = U.font(10);
      ctx.fillText("observations in (blue) · intelligence out (magenta)", w / 2, 16);
    }

    var DEMOS = { stolfi: demoStolfi, jaus: demoJaus, wu: demoWu, xu: demoXu, ours: demoOurs };
    var loop = U.raf(canvas, function (tm) {
      var f = U.fitCanvas(canvas, 210), ctx = f.ctx, C = U.colors();
      ctx.clearRect(0, 0, f.w, f.h);
      (DEMOS[selected] || demoStolfi)(ctx, f.w, f.h, tm / 1000, C);
    });
    loop.start();
  }

  /* ================================================================
     DTN — store-and-forward, felt. The UAV's orbit takes it beyond
     radio range; the buffer visibly grows, then drains on reconnect.
     The "lost: 0, always" counter *is* the lesson.
  ================================================================ */
  function initDTN() {
    var canvas = document.getElementById("dtn-canvas");
    if (!canvas) return;
    var rangeIn = document.getElementById("dtn-range");
    var bufEl = document.getElementById("dtn-buffer");
    var delEl = document.getElementById("dtn-delivered");

    var buffer = 0, delivered = 0, emitAcc = 0, drainAcc = 0, lastT = 0;
    var flying = [];   /* packets in transit to the station */

    function draw(tm) {
      var t = tm / 1000;
      var dt = lastT ? Math.min(t - lastT, 0.1) : 0;
      lastT = t;

      var f = U.fitCanvas(canvas, 240), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);

      var st = { x: w * 0.22, y: h * 0.62 };
      var range = (+rangeIn.value / 100) * w * 0.62;

      /* orbit */
      var cx = w * 0.55, cy = h * 0.48, rx = w * 0.38, ry = h * 0.34;
      var ang = t * 0.55;
      var ux = cx + Math.cos(ang) * rx, uy = cy + Math.sin(ang) * ry;
      var inRange = U.dist(ux, uy, st.x, st.y) <= range;

      /* range disc */
      ctx.fillStyle = C.s1;
      ctx.globalAlpha = 0.07;
      ctx.beginPath(); ctx.arc(st.x, st.y, range, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.s1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(st.x, st.y, range, 0, 6.29); ctx.stroke();
      ctx.setLineDash([]);

      /* station = DWM node */
      ctx.fillStyle = C.s5;
      ctx.globalAlpha = 0.15;
      ctx.beginPath(); ctx.arc(st.x, st.y, 20, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.s5;
      ctx.beginPath(); ctx.arc(st.x, st.y, 20, 0, 6.29); ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.font = U.font(10, true);
      ctx.textAlign = "center";
      ctx.fillText("DWM", st.x, st.y + 3.5);

      /* orbit path */
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.29);
      ctx.stroke();

      /* emissions */
      emitAcc += dt;
      if (emitAcc > 0.7) {
        emitAcc = 0;
        if (inRange) flying.push({ x: ux, y: uy, u: 0 });
        else buffer++;
      }
      /* drain buffer when connected */
      if (inRange && buffer > 0) {
        drainAcc += dt;
        if (drainAcc > 0.12) {
          drainAcc = 0;
          buffer--;
          flying.push({ x: ux, y: uy, u: 0 });
        }
      }
      /* animate packets */
      for (var i = flying.length - 1; i >= 0; i--) {
        var p = flying[i];
        p.u += dt * 1.8;
        if (p.u >= 1) { delivered++; flying.splice(i, 1); continue; }
        ctx.fillStyle = C.s1;
        ctx.beginPath();
        ctx.arc(U.lerp(p.x, st.x, U.ease(p.u)), U.lerp(p.y, st.y, U.ease(p.u)), 3, 0, 6.29);
        ctx.fill();
      }

      /* UAV + link/buffer state */
      U.glyph.uav(ctx, ux, uy, 8, ang + Math.PI / 2, C.air);
      if (inRange) {
        ctx.strokeStyle = C.good;
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(st.x, st.y); ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = C.warn;
        ctx.font = U.font(10, true);
        ctx.textAlign = "center";
        ctx.fillText("out of range — buffering", ux, uy - 26);
      }
      /* buffer stack above the UAV */
      var show = Math.min(buffer, 12);
      for (i = 0; i < show; i++) {
        ctx.fillStyle = C.warn;
        ctx.fillRect(ux - 12 + (i % 6) * 4.5, uy - 16 - Math.floor(i / 6) * 5, 3.5, 3.5);
      }

      bufEl.textContent = buffer;
      delEl.textContent = delivered;
    }

    var loop = U.raf(canvas, draw);
    loop.start();
  }

  /* ================================================================
     SERVICE DIRECTORY — the paper's chemical-spill story as four
     steps: anomaly → query → DHT resolve → fulfilment. The DHT ring
     lights up hop by hop so "distributed lookup" stops being a
     buzzword.
  ================================================================ */
  function initDirectory() {
    var svg = document.getElementById("dir-svg");
    if (!svg) return;
    var caption = document.getElementById("dir-caption");
    var playBtn = document.getElementById("dir-play");

    var CAPS = [
      "A UGV assessing damage at a power plant finds a chemical spill. Its own sensors can't analyse it — it has a capability gap.",
      "The UGV's Gateway publishes a query to the Service Directory: “who provides chem-sensing?” No central server — the directory is a distributed hash table living across the fleet.",
      "The lookup hops node to node until the key resolves: UAV-7, chemical sensor, 1.2 km away, available. Capabilities were registered against a service ontology when each vehicle joined.",
      "UAV-7 accepts the task and flies to the spill. A vehicle that couldn't solve its problem found one that could — autonomously, at mission time."
    ];
    var step = 0, playing = false, timer = null;

    var parts = {};   /* named svg elements */
    function build() {
      svg.innerHTML = "";
      var C = U.colors();
      var W = 640, H = 270;

      /* plant + spill + UGV */
      U.svg("rect", { x: 30, y: 60, width: 84, height: 74, rx: 6, fill: C.surface2, stroke: C.axis }, svg);
      U.svg("text", { x: 72, y: 100, "text-anchor": "middle", "font-size": 11, fill: C.ink2, "font-family": "inherit" }, svg).textContent = "power";
      U.svg("text", { x: 72, y: 114, "text-anchor": "middle", "font-size": 11, fill: C.ink2, "font-family": "inherit" }, svg).textContent = "plant";
      parts.spill = U.svg("ellipse", { cx: 96, cy: 176, rx: 30, ry: 12, fill: C.s7, "fill-opacity": 0.4, stroke: C.s7 }, svg);
      parts.spillLbl = U.svg("text", { x: 96, y: 205, "text-anchor": "middle", "font-size": 11, fill: C.ink2, "font-family": "inherit" }, svg);
      parts.spillLbl.textContent = "chemical spill";
      parts.ugv = U.svg("rect", { x: 130, y: 150, width: 26, height: 18, rx: 4, fill: C.ground }, svg);
      U.svg("text", { x: 143, y: 186, "text-anchor": "middle", "font-size": 11, fill: C.ground, "font-family": "inherit", "font-weight": "bold" }, svg).textContent = "UGV";
      parts.q = U.svg("text", { x: 152, y: 138, "font-size": 15, fill: C.crit, "font-family": "inherit", "font-weight": "bold" }, svg);
      parts.q.textContent = "?";

      /* DHT ring */
      var ringC = { x: 400, y: 115 }, ringR = 62;
      parts.ringNodes = [];
      for (var i = 0; i < 6; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 3;
        var nx = ringC.x + Math.cos(a) * ringR, ny = ringC.y + Math.sin(a) * ringR;
        var n = U.svg("circle", { cx: nx, cy: ny, r: 11, fill: C.surface2, stroke: C.axis, "stroke-width": 1.5 }, svg);
        n.style.transition = "fill 0.3s ease, stroke 0.3s ease";
        parts.ringNodes.push({ el: n, x: nx, y: ny });
      }
      U.svg("text", { x: ringC.x, y: ringC.y + 4, "text-anchor": "middle", "font-size": 11, fill: C.muted, "font-family": "inherit" }, svg).textContent = "service directory";
      U.svg("text", { x: ringC.x, y: ringC.y + 18, "text-anchor": "middle", "font-size": 10, fill: C.muted, "font-family": "inherit" }, svg).textContent = "(DHT)";

      /* query packet */
      parts.pkt = U.svg("g", { opacity: 0 }, svg);
      U.svg("rect", { x: -34, y: -10, width: 96, height: 20, rx: 10, fill: C.s1 }, parts.pkt);
      U.svg("text", { x: 14, y: 4, "text-anchor": "middle", "font-size": 10, fill: "#fff", "font-family": "inherit" }, parts.pkt).textContent = "need: chem-sensing";
      parts.pkt.style.transition = "transform 0.7s ease, opacity 0.3s ease";

      /* resolution card */
      parts.card = U.svg("g", { opacity: 0 }, svg);
      U.svg("rect", { x: 330, y: 208, width: 190, height: 44, rx: 8, fill: C.surface2, stroke: C.s7, "stroke-width": 1.5 }, parts.card);
      U.svg("text", { x: 425, y: 226, "text-anchor": "middle", "font-size": 11, fill: C.ink, "font-family": "inherit", "font-weight": "bold" }, parts.card).textContent = "✓ UAV-7 · chem sensor";
      U.svg("text", { x: 425, y: 242, "text-anchor": "middle", "font-size": 10.5, fill: C.ink2, "font-family": "inherit" }, parts.card).textContent = "1.2 km away · available";
      parts.card.style.transition = "opacity 0.4s ease";

      /* UAV-7 */
      parts.uav = U.svg("g", {}, svg);
      U.svg("path", { d: "M 0 -8 L 12 0 L 0 8 L 4 0 Z", fill: C.air, transform: "rotate(180)" }, parts.uav);
      parts.uavLbl = U.svg("text", { x: 0, y: 24, "text-anchor": "middle", "font-size": 11, fill: C.air, "font-family": "inherit", "font-weight": "bold" }, parts.uav);
      parts.uavLbl.textContent = "UAV-7";
      parts.uav.style.transition = "transform 1.1s ease";
      parts.cone = U.svg("ellipse", { cx: 96, cy: 176, rx: 40, ry: 18, fill: C.air, "fill-opacity": 0, stroke: "none" }, svg);
      parts.cone.style.transition = "fill-opacity 0.5s ease";

      apply();
    }

    function apply() {
      var C = U.colors();
      /* step 0 defaults */
      parts.q.setAttribute("opacity", step === 0 ? 1 : 0);
      parts.pkt.style.opacity = step === 1 ? 1 : 0;
      parts.pkt.style.transform = step >= 1 ? "translate(320px,115px)" : "translate(180px,150px)";
      parts.ringNodes.forEach(function (n, i) {
        var lit = (step === 2 && i <= 3) || (step >= 3 && i === 3);
        n.el.setAttribute("fill", lit ? C.halo : C.surface2);
        n.el.setAttribute("stroke", lit ? C.s1 : C.axis);
      });
      parts.card.style.opacity = step >= 2 ? 1 : 0;
      parts.uav.style.transform = step >= 3 ? "translate(120px,120px)" : "translate(590px,40px)";
      parts.cone.setAttribute("fill-opacity", step >= 3 ? 0.25 : 0);
      caption.textContent = CAPS[step];
    }

    var tabs = U.tabs(document.getElementById("dir-steps"), function (k) {
      step = +k;
      apply();
    });

    playBtn.addEventListener("click", function () {
      playing = !playing;
      playBtn.classList.toggle("is-playing", playing);
      playBtn.innerHTML = playing ? "&#9646;&#9646;" : "&#9654;";
      if (playing) {
        timer = setInterval(function () {
          step = (step + 1) % 4;
          tabs.highlight(step);
          apply();
        }, 2600);
      } else clearInterval(timer);
    });

    build();
    U.onThemeChange(build);
  }

  /* ================================================================
     SPATIO-TEMPORAL FUSION — radar (wide bearing error) + camera
     (wide depth error) → product of Gaussians. Toggling a sensor
     off makes the fused ellipse balloon: redundancy across
     *different* error geometries is where the win comes from.
  ================================================================ */
  function initFusionTrack() {
    var canvas = document.getElementById("fusiontrack-canvas");
    if (!canvas) return;
    var radBtn = document.getElementById("ft-radar");
    var camBtn = document.getElementById("ft-cam");
    var noiseIn = document.getElementById("ft-noise");
    var areaEl = document.getElementById("ft-area");

    var useRadar = true, useCam = true;
    radBtn.addEventListener("click", function () {
      useRadar = !useRadar;
      radBtn.setAttribute("aria-pressed", useRadar);
    });
    camBtn.addEventListener("click", function () {
      useCam = !useCam;
      camBtn.setAttribute("aria-pressed", useCam);
    });

    function draw(tm) {
      var t = tm / 1000;
      var f = U.fitCanvas(canvas, 260), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);

      /* water */
      ctx.fillStyle = C.sea;
      ctx.globalAlpha = 0.06;
      ctx.fillRect(0, h * 0.25, w, h * 0.75);
      ctx.globalAlpha = 1;

      var noise = +noiseIn.value / 45;   /* 1.0 at default */
      var sRx = 46 * noise, sRy = 12 * noise;   /* radar: wide in x  */
      var sCx = 12 * noise, sCy = 46 * noise;   /* camera: wide in y */

      /* true target */
      var u = (t * 0.09) % 1;
      var tx = w * 0.15 + u * w * 0.7, ty = h * 0.6 + Math.sin(u * 6.28 * 1.5) * h * 0.14;

      /* observers */
      var usv = { x: w * 0.08, y: h * 0.88 }, uav = { x: w * 0.85, y: h * 0.1 };
      U.glyph.usv(ctx, usv.x, usv.y, 8, 0, C.sea);
      U.glyph.uav(ctx, uav.x, uav.y, 8, 2.6, C.air);
      ctx.font = U.font(10);
      ctx.textAlign = "center";
      ctx.fillStyle = C.sea; ctx.fillText("radar", usv.x, usv.y - 16);
      ctx.fillStyle = C.air; ctx.fillText("camera", uav.x, uav.y - 14);

      var jr = U.rng(Math.floor(t * 2.5) + 3);
      var mR = { x: tx + jr.gauss() * sRx * 0.4, y: ty + jr.gauss() * sRy * 0.4 };
      var mC = { x: tx + jr.gauss() * sCx * 0.4, y: ty + jr.gauss() * sCy * 0.4 };

      function drawEllipse(m, rx, ry, col) {
        ctx.save();
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.13;
        ctx.beginPath(); ctx.ellipse(m.x, m.y, rx, ry, 0, 0, 6.29); ctx.fill();
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = col;
        ctx.beginPath(); ctx.ellipse(m.x, m.y, rx, ry, 0, 0, 6.29); ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      function sight(o, m, col) {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(m.x, m.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      if (useRadar) { sight(usv, mR, C.sea); drawEllipse(mR, sRx, sRy, C.sea); }
      if (useCam) { sight(uav, mC, C.air); drawEllipse(mC, sCx, sCy, C.air); }

      /* fusion: product of Gaussians per axis */
      var fx, fy, frx, fry;
      if (useRadar && useCam) {
        var wxR = 1 / (sRx * sRx), wxC = 1 / (sCx * sCx);
        var wyR = 1 / (sRy * sRy), wyC = 1 / (sCy * sCy);
        fx = (mR.x * wxR + mC.x * wxC) / (wxR + wxC);
        fy = (mR.y * wyR + mC.y * wyC) / (wyR + wyC);
        frx = 1 / Math.sqrt(wxR + wxC);
        fry = 1 / Math.sqrt(wyR + wyC);
      } else if (useRadar) { fx = mR.x; fy = mR.y; frx = sRx; fry = sRy; }
      else if (useCam) { fx = mC.x; fy = mC.y; frx = sCx; fry = sCy; }

      /* ghost of the true position */
      ctx.strokeStyle = C.muted;
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(tx - 6, ty); ctx.lineTo(tx + 6, ty); ctx.moveTo(tx, ty - 6); ctx.lineTo(tx, ty + 6); ctx.stroke();
      ctx.globalAlpha = 1;

      if (useRadar || useCam) {
        drawEllipse({ x: fx, y: fy }, frx, fry, C.good);
        ctx.fillStyle = C.good;
        ctx.beginPath(); ctx.arc(fx, fy, 3.5, 0, 6.29); ctx.fill();
        ctx.font = U.font(10.5, true);
        ctx.fillStyle = C.good;
        ctx.textAlign = "left";
        ctx.fillText("fused track", fx + frx + 6, fy);
        areaEl.textContent = Math.round(Math.PI * frx * fry) + " px²" +
          (useRadar && useCam ? " (smaller than either sensor)" : " (single sensor)");
      } else {
        ctx.fillStyle = C.crit;
        ctx.font = U.font(13, true);
        ctx.textAlign = "center";
        ctx.fillText("no sensors — no track", w / 2, h * 0.45);
        areaEl.textContent = "∞";
      }
      /* legend of what the ellipses mean */
      ctx.font = U.font(10);
      ctx.textAlign = "left";
      ctx.fillStyle = C.ink2;
      ctx.fillText("radar: precise range, sloppy bearing · camera: the opposite · fused: best of both", 10, 16);
    }

    var loop = U.raf(canvas, draw);
    loop.start();
  }

  /* ================================================================
     AUCTION — market-based task allocation with live re-auction on
     failure. Bids are honest costs (capability + distance), so the
     "natural and efficient allocation" of the paper emerges on its
     own — and keeps emerging when the winner dies.
  ================================================================ */
  function initAuction() {
    var canvas = document.getElementById("auction-canvas");
    if (!canvas) return;
    var typeSel = document.getElementById("auction-type");
    var newBtn = document.getElementById("auction-new");
    var killBtn = document.getElementById("auction-kill");
    var taskEl = document.getElementById("auction-task");
    var bidsEl = document.getElementById("auction-bids");

    var FLEET = [
      { id: "UAV-1", d: "air", home: { x: 0.2, y: 0.14 } },
      { id: "UAV-2", d: "air", home: { x: 0.65, y: 0.1 } },
      { id: "UGV-1", d: "ground", home: { x: 0.3, y: 0.52 } },
      { id: "UGV-2", d: "ground", home: { x: 0.75, y: 0.58 } },
      { id: "USV-1", d: "sea", home: { x: 0.45, y: 0.88 } }
    ];
    var TASKS = {
      aerial: { label: "TASK: aerial imagery of grid B", site: { x: 0.52, y: 0.3 }, base: { air: 8, ground: 88, sea: 70 } },
      delivery: { label: "TASK: deliver med-kit inland", site: { x: 0.82, y: 0.45 }, base: { air: 48, ground: 10, sea: 82 } },
      water: { label: "TASK: sample water quality", site: { x: 0.7, y: 0.86 }, base: { air: 45, ground: 92, sea: 7 } }
    };

    var state = { task: null, bids: [], winner: null, dead: {}, anim: {} };
    FLEET.forEach(function (v) { state.anim[v.id] = { x: v.home.x, y: v.home.y }; });

    function announce() {
      var tk = TASKS[typeSel.value];
      state.task = tk;
      state.winner = null;
      taskEl.textContent = tk.label;
      var rnd = U.rng(Date.now ? (performance.now() | 0) : 42);
      state.bids = FLEET.map(function (v) {
        if (state.dead[v.id]) return { v: v, bid: null };
        var d = U.dist(v.home.x, v.home.y, tk.site.x, tk.site.y);
        return { v: v, bid: tk.base[v.d] + d * 40 + rnd() * 4 };
      });
      renderBids(false);
      setTimeout(function () {
        var alive = state.bids.filter(function (b) { return b.bid !== null; });
        if (!alive.length) { taskEl.textContent = tk.label + " — no capable vehicles left!"; return; }
        alive.sort(function (a, b) { return a.bid - b.bid; });
        state.winner = alive[0].v;
        renderBids(true);
        killBtn.disabled = false;
      }, 900);
    }

    function renderBids(withWinner) {
      bidsEl.innerHTML = "";
      var C = U.colors();
      var max = Math.max.apply(null, state.bids.map(function (b) { return b.bid || 0; })) || 1;
      state.bids.forEach(function (b) {
        var row = document.createElement("div");
        row.className = "uxv-bid-row" +
          (state.dead[b.v.id] ? " is-dead" : "") +
          (withWinner && state.winner === b.v ? " is-winner" : "");
        var col = b.v.d === "air" ? C.air : b.v.d === "ground" ? C.ground : C.sea;
        row.innerHTML =
          '<span class="uxv-bid-name">' + b.v.id + "</span>" +
          '<span class="uxv-bid-bar-wrap"><span class="uxv-bid-bar" style="background:' + col + '"></span></span>' +
          '<span class="uxv-bid-val">' + (b.bid === null ? "dead" :
            (withWinner && state.winner === b.v ? "✓ " : "") + b.bid.toFixed(0)) + "</span>";
        bidsEl.appendChild(row);
        var bar = row.querySelector(".uxv-bid-bar");
        requestAnimationFrame(function () {
          bar.style.width = b.bid === null ? "0%" : (b.bid / max * 100) + "%";
        });
      });
    }

    newBtn.addEventListener("click", function () {
      killBtn.disabled = true;
      announce();
    });
    killBtn.addEventListener("click", function () {
      if (!state.winner) return;
      state.dead[state.winner.id] = true;
      taskEl.textContent = state.task.label + " — " + state.winner.id + " lost! Re-auctioning…";
      state.winner = null;
      killBtn.disabled = true;
      setTimeout(announce, 700);
    });

    function draw(tm) {
      var f = U.fitCanvas(canvas, 260), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);
      /* bands */
      ctx.fillStyle = C.air; ctx.globalAlpha = 0.05; ctx.fillRect(0, 0, w, h * 0.34);
      ctx.fillStyle = C.ground; ctx.globalAlpha = 0.06; ctx.fillRect(0, h * 0.34, w, h * 0.4);
      ctx.fillStyle = C.sea; ctx.globalAlpha = 0.08; ctx.fillRect(0, h * 0.74, w, h * 0.26);
      ctx.globalAlpha = 1;

      /* task site */
      if (state.task) {
        var sx = state.task.site.x * w, sy = state.task.site.y * h;
        ctx.strokeStyle = C.s4;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(sx, sy, 14 + Math.sin(tm / 300) * 2, 0, 6.29); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.fillStyle = C.s4;
        ctx.font = U.font(10, true);
        ctx.textAlign = "center";
        ctx.fillText("task site", sx, sy - 20);
      }

      FLEET.forEach(function (v) {
        var a = state.anim[v.id];
        var target = (state.winner === v && state.task) ? state.task.site : v.home;
        a.x = U.lerp(a.x, target.x, 0.04);
        a.y = U.lerp(a.y, target.y, 0.04);
        var col = state.dead[v.id] ? C.muted : v.d === "air" ? C.air : v.d === "ground" ? C.ground : C.sea;
        var g = v.d === "air" ? U.glyph.uav : v.d === "ground" ? U.glyph.ugv : U.glyph.usv;
        g(ctx, a.x * w, a.y * h, 7, 0, col);
        if (state.dead[v.id]) {
          ctx.strokeStyle = C.crit;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(a.x * w - 6, a.y * h - 6); ctx.lineTo(a.x * w + 6, a.y * h + 6);
          ctx.moveTo(a.x * w + 6, a.y * h - 6); ctx.lineTo(a.x * w - 6, a.y * h + 6);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.fillStyle = C.ink2;
        ctx.font = U.font(9.5);
        ctx.textAlign = "center";
        ctx.fillText(v.id, a.x * w, a.y * h + 20);
      });
    }

    var loop = U.raf(canvas, draw);
    loop.start();
    announce();
  }

  /* ================================================================
     ROADMAP — the five future-work directions.
  ================================================================ */
  function initRoadmap() {
    var track = document.getElementById("roadmap-track");
    if (!track) return;
    var detail = document.getElementById("roadmap-detail");
    var ITEMS = [
      { t: "Cross-domain missions", d: "Heterogeneous teams for disaster response, infrastructure inspection and logistics — each mission type driving new coordination and planning research. The wildfire simulator above is a toy version of exactly this class of problem." },
      { t: "Open standards", d: "Shared formats for data exchange, task negotiation and capability description, so vehicles from different vendors can join the same ecosystem — the Gateway's Canonical Data Model needs to be a community artifact, not a proprietary one." },
      { t: "Formal mission semantics", d: "Modeling goals, constraints and roles formally, so cross-agent reasoning and dynamic task decomposition can scale beyond hand-written objective lists — the Mission Interface's structured format, made rigorous." },
      { t: "Simulation at scale", d: "High-fidelity environments for testing cross-domain swarms under real-world constraints — validation and benchmarking need shared testbeds before anyone deploys mixed fleets in a real disaster." },
      { t: "Emerging technologies", d: "6G networking for the fabric, edge AI for on-vehicle intelligence, quantum-safe cryptography for trust — each slots into a specific layer of the architecture rather than replacing it." }
    ];
    var btns = [];
    ITEMS.forEach(function (it, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", i === 0 ? "true" : "false");
      b.textContent = it.t;
      b.addEventListener("click", function () {
        btns.forEach(function (o) { o.setAttribute("aria-selected", "false"); });
        b.setAttribute("aria-selected", "true");
        detail.innerHTML = "<strong>" + it.t + ".</strong> " + it.d;
      });
      btns.push(b);
      track.appendChild(b);
    });
    detail.innerHTML = "<strong>" + ITEMS[0].t + ".</strong> " + ITEMS[0].d;
  }
})();
