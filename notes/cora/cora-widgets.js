/* ==================================================================
   cora-widgets.js — interactive figures for the CoRA explainer.
   Charts built from the paper's tables live in cora-charts.js.
================================================================== */
(function () {
  "use strict";
  var U = window.CORA;

  document.addEventListener("DOMContentLoaded", function () {
    initHero();
    initOcclusion();
    initMisalign();
    initFig1();
    initParadigm();
    initArch();
    initCIT();
    initLC();
    initPAC();
  });

  /* ---------- shared helpers ------------------------------------ */

  function car(ctx, x, y, len, wid, heading, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading || 0);
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-len / 2, -wid / 2, len, wid, wid * 0.3);
    else ctx.rect(-len / 2, -wid / 2, len, wid);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(len * 0.05, -wid * 0.32, len * 0.22, wid * 0.64);
    ctx.restore();
  }

  function segsIntersect(p1, p2, p3, p4) {
    function ccw(a, b, c) { return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x); }
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
  }
  function segHitsRect(a, b, r) {
    if (a.x > r.x && a.x < r.x + r.w && a.y > r.y && a.y < r.y + r.h) return true;
    var c = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
    return segsIntersect(a, b, c[0], c[1]) || segsIntersect(a, b, c[1], c[2]) ||
           segsIntersect(a, b, c[2], c[3]) || segsIntersect(a, b, c[3], c[0]);
  }
  function blob(ctx, x, y, r, color, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    /* fade to transparent *of the same hue* so overlaps stay colorful */
    g.addColorStop(1, /^#[0-9a-f]{6}$/i.test(color) ? color + "00" : "rgba(128,128,128,0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.29); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* ================================================================
     HERO — the whole paper in one loop: a truck hides a car from
     the ego; the collaborator's message reveals it.
  ================================================================ */
  function initHero() {
    var canvas = document.getElementById("hero-scene");
    if (!canvas) return;

    function draw(t) {
      var f = U.fitCanvas(canvas, 260), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);

      /* road */
      var ry = h * 0.36, rh = h * 0.4;
      ctx.fillStyle = C.ink;
      ctx.globalAlpha = 0.07;
      ctx.fillRect(0, ry, w, rh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.axis;
      ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.moveTo(0, ry + rh / 2); ctx.lineTo(w, ry + rh / 2); ctx.stroke();
      ctx.setLineDash([]);

      var laneA = ry + rh * 0.27, laneB = ry + rh * 0.74;
      var ego = { x: w * 0.18, y: laneA };
      var truck = { x: w * 0.46, y: laneA };
      var hidden = { x: w * 0.72, y: laneA };
      var collab = { x: w * 0.62, y: laneB };

      /* ego sensing cone, clipped by the truck */
      ctx.fillStyle = C.s1;
      ctx.globalAlpha = 0.08;
      ctx.beginPath();
      ctx.moveTo(ego.x + 16, ego.y);
      ctx.lineTo(truck.x - 26, ego.y - 46);
      ctx.lineTo(truck.x - 26, ego.y + 46);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;

      /* collaborator sensing cone reaches the hidden car */
      ctx.fillStyle = C.s2;
      ctx.globalAlpha = 0.08;
      ctx.beginPath();
      ctx.moveTo(collab.x, collab.y - 8);
      ctx.lineTo(hidden.x - 20, hidden.y + 4);
      ctx.lineTo(hidden.x + 34, hidden.y + 8);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;

      car(ctx, ego.x, ego.y, 34, 16, 0, C.s1);
      ctx.fillStyle = C.muted;
      car(ctx, truck.x, truck.y, 52, 20, 0, C.muted);
      car(ctx, hidden.x, hidden.y, 32, 15, 0, C.crit);
      car(ctx, collab.x, collab.y, 34, 16, Math.PI, C.s2);

      ctx.font = U.font(10.5);
      ctx.textAlign = "center";
      ctx.fillStyle = C.s1; ctx.fillText("ego", ego.x, ego.y - 16);
      ctx.fillStyle = C.muted; ctx.fillText("truck", truck.x, truck.y - 18);
      ctx.fillStyle = C.crit; ctx.fillText("hidden", hidden.x, hidden.y - 15);
      ctx.fillStyle = C.s2; ctx.fillText("collaborator", collab.x, collab.y + 22);

      /* V2X pulse: collab → ego, then the detection appears */
      var ph = (t * 0.4) % 1;
      ctx.strokeStyle = C.s2;
      ctx.globalAlpha = 0.3;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(collab.x, collab.y); ctx.lineTo(ego.x, ego.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      if (ph < 0.45) {
        var u = ph / 0.45;
        ctx.fillStyle = C.s2;
        ctx.beginPath();
        ctx.arc(U.lerp(collab.x, ego.x, u), U.lerp(collab.y, ego.y, u), 4, 0, 6.29);
        ctx.fill();
      } else {
        var a = Math.min(1, (ph - 0.45) / 0.15);
        ctx.strokeStyle = C.good;
        ctx.globalAlpha = a * (ph > 0.9 ? (1 - ph) / 0.1 : 1);
        ctx.lineWidth = 2;
        ctx.strokeRect(hidden.x - 22, hidden.y - 13, 44, 26);
        ctx.font = U.font(10, true);
        ctx.fillStyle = C.good;
        ctx.fillText("detected via V2X", hidden.x, hidden.y + 28);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
      }
    }

    if (U.reducedMotion) { draw(1.2); U.onThemeChange(function () { draw(1.2); }); return; }
    U.raf(canvas, function (tm) { draw(tm / 1000); }).start();
  }

  /* ================================================================
     OCCLUSION PLAYGROUND — raycast LiDAR with a draggable occluder;
     the collaborator toggle is the entire value proposition of
     collaborative perception, verified by a counter.
  ================================================================ */
  function initOcclusion() {
    var canvas = document.getElementById("occl-canvas");
    if (!canvas) return;
    var truckIn = document.getElementById("occl-truck");
    var collabBtn = document.getElementById("occl-collab");
    var countEl = document.getElementById("occl-count");
    var collabOn = false;

    collabBtn.addEventListener("click", function () {
      collabOn = !collabOn;
      collabBtn.setAttribute("aria-pressed", String(collabOn));
      collabBtn.textContent = collabOn ? "Disable collaborator" : "Enable collaborator";
    });

    function draw(t) {
      var f = U.fitCanvas(canvas, 300), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);

      var ego = { x: w * 0.1, y: h * 0.78 };
      var collab = { x: w * 0.86, y: h * 0.16 };
      var tx = w * (0.25 + (+truckIn.value / 100) * 0.42);
      var truck = { x: tx, y: h * 0.42, w: w * 0.16, h: h * 0.14 };
      var hazards = [
        { x: w * 0.62, y: h * 0.28, name: "pedestrian", r: 6 },
        { x: w * 0.78, y: h * 0.5, name: "cyclist", r: 7 }
      ];

      /* ego rays */
      var nRays = 60;
      for (var i = 0; i < nRays; i++) {
        var ang = -0.92 + (i / (nRays - 1)) * 0.98;
        var end = { x: ego.x + Math.cos(ang) * w, y: ego.y + Math.sin(ang) * w };
        /* shorten ray at truck by binary stepping */
        var hitT = 1;
        if (segHitsRect(ego, end, truck)) {
          var lo = 0, hi = 1;
          for (var k = 0; k < 12; k++) {
            var mid = (lo + hi) / 2;
            var p = { x: U.lerp(ego.x, end.x, mid), y: U.lerp(ego.y, end.y, mid) };
            if (segHitsRect(ego, p, truck)) hi = mid; else lo = mid;
          }
          hitT = hi;
        }
        ctx.strokeStyle = C.s1;
        ctx.globalAlpha = 0.1;
        ctx.beginPath();
        ctx.moveTo(ego.x, ego.y);
        ctx.lineTo(U.lerp(ego.x, end.x, hitT), U.lerp(ego.y, end.y, hitT));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      /* collaborator rays */
      if (collabOn) {
        for (i = 0; i < nRays; i++) {
          var ang2 = 2.0 + (i / (nRays - 1)) * 1.1;
          var end2 = { x: collab.x + Math.cos(ang2) * w, y: collab.y + Math.sin(ang2) * w };
          var hitT2 = 1;
          if (segHitsRect(collab, end2, truck)) {
            var lo2 = 0, hi2 = 1;
            for (k = 0; k < 12; k++) {
              var mid2 = (lo2 + hi2) / 2;
              var p2 = { x: U.lerp(collab.x, end2.x, mid2), y: U.lerp(collab.y, end2.y, mid2) };
              if (segHitsRect(collab, p2, truck)) hi2 = mid2; else lo2 = mid2;
            }
            hitT2 = hi2;
          }
          ctx.strokeStyle = C.s2;
          ctx.globalAlpha = 0.09;
          ctx.beginPath();
          ctx.moveTo(collab.x, collab.y);
          ctx.lineTo(U.lerp(collab.x, end2.x, hitT2), U.lerp(collab.y, end2.y, hitT2));
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        /* V2X link */
        ctx.strokeStyle = C.s2;
        ctx.globalAlpha = 0.4;
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(collab.x, collab.y); ctx.lineTo(ego.x, ego.y); ctx.stroke();
        ctx.setLineDash([]);
        var u = (t * 0.6) % 1;
        ctx.fillStyle = C.s2;
        ctx.beginPath();
        ctx.arc(U.lerp(collab.x, ego.x, u), U.lerp(collab.y, ego.y, u), 3.5, 0, 6.29);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      /* truck */
      ctx.fillStyle = C.muted;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(truck.x, truck.y, truck.w, truck.h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.surface;
      ctx.font = U.font(10.5, true);
      ctx.textAlign = "center";
      ctx.fillText("TRUCK", truck.x + truck.w / 2, truck.y + truck.h / 2 + 4);

      /* hazards */
      var visible = 0;
      hazards.forEach(function (hz) {
        var egoSees = !segHitsRect(ego, hz, truck);
        var collabSees = collabOn && !segHitsRect(collab, hz, truck);
        var seen = egoSees || collabSees;
        if (seen) visible++;
        ctx.fillStyle = seen ? C.good : C.crit;
        ctx.beginPath(); ctx.arc(hz.x, hz.y, hz.r, 0, 6.29); ctx.fill();
        if (seen) {
          ctx.strokeStyle = C.good;
          ctx.beginPath(); ctx.arc(hz.x, hz.y, hz.r + 5 + Math.sin(t * 4) * 1.5, 0, 6.29); ctx.stroke();
        } else {
          ctx.strokeStyle = C.crit;
          ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.arc(hz.x, hz.y, hz.r + 5, 0, 6.29); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = C.ink2;
        ctx.font = U.font(10);
        ctx.fillText(hz.name + (seen ? "" : " — unseen!"), hz.x, hz.y - hz.r - 8);
      });

      car(ctx, ego.x, ego.y, 34, 16, -0.5, C.s1);
      ctx.fillStyle = C.s1;
      ctx.font = U.font(10.5, true);
      ctx.fillText("ego", ego.x, ego.y + 24);
      if (collabOn) {
        car(ctx, collab.x, collab.y, 34, 16, 2.6, C.s2);
        ctx.fillStyle = C.s2;
        ctx.fillText("collaborator", collab.x, collab.y - 18);
      }
      countEl.textContent = visible + " / 2";
    }

    U.raf(canvas, function (tm) { draw(tm / 1000); }).start();
  }

  /* ================================================================
     MISALIGNMENT PLAYGROUND — pose error made tactile: the
     collaborator's features rotate/translate off the true objects,
     ghosts appear, and the alignment score quantifies the damage.
  ================================================================ */
  function initMisalign() {
    var canvas = document.getElementById("misalign-canvas");
    if (!canvas) return;
    var tIn = document.getElementById("mis-t"), rIn = document.getElementById("mis-r");
    var tVal = document.getElementById("mis-t-val"), rVal = document.getElementById("mis-r-val");
    var apEl = document.getElementById("mis-ap"), noteEl = document.getElementById("mis-note");

    var OBJS = [
      { x: 0.3, y: 0.35 }, { x: 0.55, y: 0.6 }, { x: 0.72, y: 0.3 }, { x: 0.45, y: 0.8 }
    ];

    function draw(t) {
      var f = U.fitCanvas(canvas, 290), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);

      /* faint BEV grid */
      ctx.strokeStyle = C.grid;
      for (var gx = 0; gx < w; gx += 36) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (var gy = 0; gy < h; gy += 36) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

      var sT = +tIn.value / 100, sR = +rIn.value / 100;
      tVal.textContent = (sT * 0.8).toFixed(1);
      rVal.textContent = (sR * 0.8).toFixed(1);

      var dx = sT * 46, dy = sT * -20;
      var th = sR * 0.16;
      var pivot = { x: w * 0.1, y: h * 0.9 };   /* collaborator's origin */

      function warp(p) {
        var px = p.x * w - pivot.x, py = p.y * h - pivot.y;
        return {
          x: pivot.x + px * Math.cos(th) - py * Math.sin(th) + dx,
          y: pivot.y + px * Math.sin(th) + py * Math.cos(th) + dy
        };
      }

      var totalErr = 0;
      OBJS.forEach(function (o) {
        var ox = o.x * w, oy = o.y * h;
        /* true object */
        ctx.strokeStyle = C.muted;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(ox - 16, oy - 9, 32, 18);
        ctx.setLineDash([]);
        /* ego features */
        blob(ctx, ox, oy, 24, C.s1, 0.5);
        /* collaborator features, warped */
        var wp = warp(o);
        blob(ctx, wp.x, wp.y, 24, C.s2, 0.5);
        var d = U.dist(ox, oy, wp.x, wp.y);
        totalErr += d;
        if (d > 14) {
          ctx.strokeStyle = C.s2;
          ctx.globalAlpha = 0.55;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(wp.x - 16, wp.y - 9, 32, 18);
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          ctx.fillStyle = C.crit;
          ctx.font = U.font(9.5, true);
          ctx.textAlign = "center";
          ctx.fillText("ghost", wp.x, wp.y - 14);
        }
      });

      car(ctx, pivot.x, pivot.y, 30, 14, -0.4, C.s2);
      ctx.font = U.font(10);
      ctx.textAlign = "left";
      ctx.fillStyle = C.s2;
      ctx.fillText("collaborator (its reported pose is wrong)", pivot.x + 20, pivot.y + 4);

      var avg = totalErr / OBJS.length;
      var align = Math.max(0, Math.round(100 * Math.exp(-avg / 30)));
      apEl.textContent = align + "%";
      noteEl.textContent =
        align > 90 ? "Perfect poses: the two feature maps reinforce each other. This is the world intermediate fusion was designed for." :
        align > 60 ? "Small errors already split each object into two half-strength responses — accuracy quietly erodes." :
        align > 30 ? "Ghost objects everywhere: fused features now describe a scene that does not exist. This is the misalignment collapse." :
        "At this point collaboration actively hurts — worse than not fusing at all. Compare with the single-agent line in the chart below.";
    }

    [tIn, rIn].forEach(function (el) { el.addEventListener("input", function () {}); });
    U.raf(canvas, function (tm) { draw(tm / 1000); }).start();
  }

  /* ================================================================
     FIG. 1 REBUILT — accuracy vs. communication volume as an
     animated bubble chart with real Table-1 numbers. The flip
     between ideal and noisy is the paper's motivation in one click.
  ================================================================ */
  function initFig1() {
    var canvas = document.getElementById("fig1-canvas");
    if (!canvas) return;
    var note = document.getElementById("fig1-note");

    var DATA = [
      { n: "CoRA", comm: 3.80, ideal: 0.8658, noisy: 0.6544, ours: true },
      { n: "DSRC", comm: 21.35, ideal: 0.8526, noisy: 0.4738 },
      { n: "ERMVP", comm: 6.34, ideal: 0.8404, noisy: 0.5655 },
      { n: "CoAlign", comm: 21.35, ideal: 0.8381, noisy: 0.4849 },
      { n: "CoSDH", comm: 6.65, ideal: 0.8373, noisy: 0.2825 },
      { n: "V2VNet", comm: 22.74, ideal: 0.8221, noisy: 0.3950 },
      { n: "V2X-ViT", comm: 21.35, ideal: 0.8119, noisy: 0.4266 },
      { n: "Where2comm", comm: 10.74, ideal: 0.7889, noisy: 0.3904 },
      { n: "MRCNet", comm: 21.35, ideal: 0.7673, noisy: 0.6113 },
      { n: "MDD", comm: 32.03, ideal: 0.6817, noisy: 0.3394 }
    ];
    var SINGLE = 0.6853;
    var mode = "ideal";
    DATA.forEach(function (d) { d.cur = d.ideal; });

    var NOTES = {
      ideal: "Ideal poses: everyone beats the single-agent line — collaboration pays. Note CoRA already tops the chart with the smallest bubble (3.80 MB).",
      noisy: "0.6 m / 0.6° pose noise: most methods crash; several fall far below single-agent — their collaboration now hurts. CoRA degrades least by a wide margin (and at this extreme it still beats single-agent on AP@0.5: 0.845 vs 0.808)."
    };
    note.textContent = NOTES.ideal;

    U.tabs(document.getElementById("fig1-tabs"), function (k) {
      mode = k;
      note.textContent = NOTES[k];
    });

    var m = { l: 52, r: 16, t: 14, b: 38 };
    function px(comm, w) { return m.l + (comm / 35) * (w - m.l - m.r); }
    function py(ap, h) { return m.t + (1 - (ap - 0.2) / 0.7) * (h - m.t - m.b); }

    var hover = null;
    canvas.addEventListener("mousemove", function (evt) {
      var rect = canvas.getBoundingClientRect();
      var mx = evt.clientX - rect.left, my = evt.clientY - rect.top;
      hover = null;
      DATA.forEach(function (d) {
        if (U.dist(mx, my, d.px || -99, d.py || -99) < (d.pr || 0) + 5) hover = d;
      });
      if (hover) {
        U.tooltip.show('<span class="tt-title">' + hover.n + "</span><br>AP@0.7: " +
          hover.cur.toFixed(3) + "<br>comm: " + hover.comm.toFixed(1) + " MB", evt.clientX, evt.clientY);
      } else U.tooltip.hide();
    });
    canvas.addEventListener("mouseleave", function () { hover = null; U.tooltip.hide(); });

    function draw() {
      var f = U.fitCanvas(canvas, 300), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);

      /* axes */
      ctx.strokeStyle = C.grid;
      ctx.fillStyle = C.muted;
      ctx.font = U.font(10.5);
      [0.3, 0.5, 0.7, 0.9].forEach(function (v) {
        var y = py(v, h);
        ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillText(v.toFixed(1), m.l - 6, y + 3);
      });
      [0, 10, 20, 30].forEach(function (v) {
        ctx.textAlign = "center";
        ctx.fillText(v + " MB", px(v, w), h - m.b + 16);
      });
      ctx.fillStyle = C.ink2;
      ctx.textAlign = "center";
      ctx.fillText("communication volume →", (m.l + w - m.r) / 2, h - 6);
      ctx.save();
      ctx.translate(12, (m.t + h - m.b) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("AP@0.7 →", 0, 0);
      ctx.restore();

      /* single-agent line */
      var sy = py(SINGLE, h);
      ctx.strokeStyle = C.muted;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(m.l, sy); ctx.lineTo(w - m.r, sy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      ctx.fillText("single-agent (no collaboration)", m.l + 4, sy - 5);

      /* bubbles */
      DATA.forEach(function (d) {
        var target = mode === "ideal" ? d.ideal : d.noisy;
        d.cur = U.lerp(d.cur, target, U.reducedMotion ? 1 : 0.09);
        d.px = px(d.comm, w);
        d.py = py(d.cur, h);
        d.pr = 5 + Math.sqrt(d.comm) * 2.1;
        var col = d.ours ? C.s1 : (d.cur < SINGLE ? C.crit : C.ink2);
        ctx.fillStyle = col;
        ctx.globalAlpha = d.ours ? 0.85 : 0.4;
        ctx.beginPath(); ctx.arc(d.px, d.py, d.pr, 0, 6.29); ctx.fill();
        ctx.globalAlpha = 1;
        if (d.ours || hover === d) {
          ctx.strokeStyle = col;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(d.px, d.py, d.pr + 2, 0, 6.29); ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.fillStyle = d.ours ? C.s1 : C.ink2;
        ctx.font = U.font(10, d.ours);
        ctx.textAlign = "center";
        ctx.fillText(d.n, d.px, d.py - d.pr - 4);
      });
    }

    U.raf(canvas, draw).start();
  }

  /* ================================================================
     PARADIGM COMPARISON — the paper's core insight as an experiment:
     the same pose error hits both paradigms; only one is repairable.
  ================================================================ */
  function initParadigm() {
    var canvas = document.getElementById("paradigm-canvas");
    if (!canvas) return;
    var errIn = document.getElementById("para-err");
    var correctBtn = document.getElementById("para-correct");
    var verdict = document.getElementById("para-verdict");
    var caption = document.getElementById("para-caption");

    var mode = "inter";
    var fixT = null;        /* correction animation start time */
    var CAPS = {
      inter: "Intermediate fusion: feature maps are BLENDED into one shared representation before detection. High ceiling when aligned — but once misaligned features mix, the original signals are gone.",
      late: "Late fusion: each agent detects first, then boxes are exchanged. The ceiling is lower (low-level context is discarded) — but every box arrives intact, merely displaced."
    };
    caption.textContent = CAPS.inter;

    U.tabs(document.getElementById("para-tabs"), function (k) {
      mode = k;
      fixT = null;
      verdict.textContent = "";
      caption.textContent = CAPS[k];
    });

    correctBtn.addEventListener("click", function () {
      fixT = performance.now();
      verdict.textContent = "";
    });

    var OBJS = [{ x: 0.3, y: 0.42 }, { x: 0.62, y: 0.32 }, { x: 0.5, y: 0.7 }];

    function draw(nowMs) {
      var t = nowMs / 1000;
      var f = U.fitCanvas(canvas, 270), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);
      var err = +errIn.value / 100;
      var dx = err * 40, dy = err * -16;

      var fixU = 0;
      if (fixT !== null) {
        fixU = U.clamp((nowMs - fixT) / 900, 0, 1);
        if (fixU >= 1) {
          verdict.textContent = mode === "late"
            ? "✓ recovered — boxes moved back into place"
            : "✗ unrecoverable — the blend cannot be un-mixed";
          verdict.style.color = mode === "late" ? C.good : C.crit;
        }
      }

      ctx.font = U.font(11, true);
      ctx.textAlign = "center";
      ctx.fillStyle = C.ink2;
      ctx.fillText(mode === "inter" ? "shared feature representation (after fusion)" : "fused detections (after exchange)", w / 2, 18);

      OBJS.forEach(function (o) {
        var ox = o.x * w, oy = o.y * h + 10;
        /* truth */
        ctx.strokeStyle = C.muted;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(ox - 17, oy - 10, 34, 20);
        ctx.setLineDash([]);

        if (mode === "inter") {
          /* blended blobs; correction shakes but cannot separate */
          var shake = fixT !== null && fixU < 1 ? Math.sin(nowMs / 30) * 3 * (1 - fixU) : 0;
          blob(ctx, ox + shake, oy, 26, C.s1, 0.45);
          blob(ctx, ox + dx + shake, oy + dy, 26, C.s2, 0.45);
          /* the mixture region */
          if (err > 0.12) {
            ctx.fillStyle = C.crit;
            ctx.font = U.font(9.5, true);
            ctx.fillText("mixed", ox + dx / 2 + shake, oy + dy / 2 + 3);
          }
        } else {
          /* intact boxes; correction lerps displaced boxes home */
          ctx.strokeStyle = C.s1;
          ctx.lineWidth = 2;
          ctx.strokeRect(ox - 17, oy - 10, 34, 20);
          var cdx = dx * (1 - (mode === "late" ? fixU : 0));
          var cdy = dy * (1 - (mode === "late" ? fixU : 0));
          ctx.strokeStyle = C.s2;
          ctx.strokeRect(ox + cdx - 17, oy + cdy - 10, 34, 20);
          ctx.lineWidth = 1;
        }
      });

      ctx.font = U.font(10);
      ctx.textAlign = "left";
      ctx.fillStyle = C.s1; ctx.fillText("■ ego", 12, h - 12);
      ctx.fillStyle = C.s2; ctx.fillText("■ collaborator (pose-shifted)", 64, h - 12);
      ctx.fillStyle = C.muted; ctx.fillText("┄ ground truth", w - 110, h - 12);
    }

    U.raf(canvas, draw).start();
  }

  /* ================================================================
     ARCHITECTURE EXPLORER — CoRA's Fig. 2 as a clickable diagram
     with a one-cycle trace animation.
  ================================================================ */
  function initArch() {
    var svg = document.getElementById("arch-svg");
    if (!svg) return;
    var panel = document.getElementById("arch-panel");
    var W = 640, H = 430;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    var MODULES = {
      "collab": { x: 16, y: 60, w: 120, h: 44, name: "Collaborator j", tag: "Input",
        desc: "Every other connected vehicle. It captures its own sensor data and — crucially — reports its own pose, which may be corrupted in transit.",
        ex: "N agents; the ego fuses messages from all j ≠ i under a bandwidth budget." },
      "encoder": { x: 16, y: 130, w: 120, h: 40, name: "Encoder", tag: "Feature branch",
        desc: "A PointPillar backbone turns the collaborator's point cloud into a BEV feature map F_j, plus a confidence head that scores where it actually sees something.",
        ex: "F_j ∈ R^{C×H×W}; confidence map M(1) is only 1×H×W — almost free to transmit." },
      "dethead": { x: 16, y: 310, w: 120, h: 40, name: "Local Detection Head", tag: "Object branch",
        desc: "The collaborator also runs its own full detector locally, producing classification and regression maps — complete, self-contained detections.",
        ex: "These object-level outputs O_j stay intact no matter what the pose says." },
      "cit": { x: 200, y: 96, w: 128, h: 52, name: "CIT", tag: "Feature branch",
        desc: "Competitive Information Transmission: confidence maps up, demand computed, per-pixel winner-take-all, sparse exclusive request masks back, sparse features forward. Receiver-centric, near-constant overhead.",
        ex: "Walkthrough in section 05 below." },
      "lc": { x: 370, y: 96, w: 128, h: 52, name: "LC", tag: "Feature branch",
        desc: "Lightweight Collaboration: confidence-weighted fusion of ego + collaborative features via attention, a Mamba-style Collaborative State Space Model, and a spatial gating unit.",
        ex: "Content-aware: the gate opens only where collaborator evidence beats the ego's own." },
      "distill": { x: 370, y: 22, w: 128, h: 40, name: "Teacher (training only)", tag: "Feature branch",
        desc: "A parallel branch sees the full dense features and produces a guidance map; L_align pushes the sparse pipeline's output to match it. Train dense, transmit sparse.",
        ex: "L_align = ‖F_out − F_teacher‖²  — deleted at inference time." },
      "pac": { x: 285, y: 304, w: 128, h: 52, name: "PAC", tag: "Object branch",
        desc: "Pose-Aware Correction: scores collaborator detections by semantic relevance to the ego's (cross-agent attention over positional-embedded descriptors), predicts a dense 2D offset field from their disagreement, and resamples via deformable convolution.",
        ex: "Walkthrough in section 06 below." },
      "egoenc": { x: 200, y: 200, w: 128, h: 40, name: "Ego encoder + detections", tag: "Ego",
        desc: "The ego's own features feed the LC fusion, and its own detections provide the reference that PAC uses to judge and correct collaborator boxes.",
        ex: "The ego never blindly trusts — everything is measured against its own view." },
      "fusion": { x: 520, y: 200, w: 104, h: 52, name: "Adaptive Fusion", tag: "Output",
        desc: "Both branches' classification maps are concatenated; learned uncertainty maps recalibrate each side's confidence before the final merge.",
        ex: "Clean poses → trust features. Noisy poses → the corrected object branch holds the line." },
      "nms": { x: 520, y: 290, w: 104, h: 40, name: "3D NMS → output", tag: "Output",
        desc: "All predictions enter one pool; 3D non-maximum suppression prunes duplicates, yielding the ego's definitive detections B_i.",
        ex: "One unified output — the visitor-facing 'what the car sees'." }
    };

    var rects = {}, centers = {}, flowLayer = null, highlighted = null, selectedId = null;

    function build() {
      svg.innerHTML = "";
      var C = U.colors();

      /* branch tint bands */
      U.svg("rect", { x: 8, y: 14, width: W - 16, height: 158, rx: 10, fill: C.s1, "fill-opacity": 0.05, stroke: C.s1, "stroke-opacity": 0.3 }, svg);
      U.svg("text", { x: 18, y: 32, "font-size": 11, fill: C.s1, "font-family": "inherit", "font-weight": "bold" }, svg).textContent = "FEATURE-LEVEL FUSION BRANCH — the performance engine";
      U.svg("rect", { x: 8, y: 288, width: W - 16, height: 84, rx: 10, fill: C.s7, "fill-opacity": 0.05, stroke: C.s7, "stroke-opacity": 0.3 }, svg);
      U.svg("text", { x: 18, y: 306, "font-size": 11, fill: C.s7, "font-family": "inherit", "font-weight": "bold" }, svg).textContent = "OBJECT-LEVEL CORRECTION BRANCH — the robustness guarantee";

      /* static connectors */
      function link(a, b) {
        var pa = centers[a], pb = centers[b];
        U.svg("line", { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: C.axis, "stroke-width": 1.2, "stroke-dasharray": "4 3", "stroke-opacity": 0.7 }, svg);
      }

      Object.keys(MODULES).forEach(function (id) {
        var mm = MODULES[id];
        centers[id] = { x: mm.x + mm.w / 2, y: mm.y + mm.h / 2 };
      });
      [["collab", "encoder"], ["collab", "dethead"], ["encoder", "cit"], ["cit", "lc"],
       ["lc", "fusion"], ["distill", "lc"], ["dethead", "pac"], ["pac", "fusion"],
       ["egoenc", "lc"], ["egoenc", "pac"], ["egoenc", "cit"], ["fusion", "nms"]].forEach(function (p) { link(p[0], p[1]); });

      Object.keys(MODULES).forEach(function (id) {
        var mm = MODULES[id];
        var g = U.svg("g", { "class": "arch-module", role: "button", tabindex: 0, "aria-label": mm.name }, svg);
        var r = U.svg("rect", { x: mm.x, y: mm.y, width: mm.w, height: mm.h, rx: 7,
          fill: C.surface, "fill-opacity": 0.92, stroke: C.ink2, "stroke-width": 1 }, g);
        var lines = mm.name.split(" (");
        U.svg("text", { x: mm.x + mm.w / 2, y: mm.y + mm.h / 2 + (lines.length > 1 ? -3 : 4),
          "text-anchor": "middle", "font-size": 11.5, fill: C.ink, "font-family": "inherit",
          "font-weight": "bold" }, g).textContent = lines[0];
        if (lines.length > 1) {
          U.svg("text", { x: mm.x + mm.w / 2, y: mm.y + mm.h / 2 + 11, "text-anchor": "middle",
            "font-size": 9, fill: C.muted, "font-family": "inherit" }, g).textContent = "(" + lines[1];
        }
        rects[id] = r;
        function choose() { select(id, r); }
        g.addEventListener("click", choose);
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } });
      });

      flowLayer = U.svg("g", { style: "pointer-events:none" }, svg);
      if (selectedId && rects[selectedId]) highlight(rects[selectedId]);
    }

    function highlight(rect) {
      var C = U.colors();
      if (highlighted) highlighted.setAttribute("stroke-width", 1);
      highlighted = rect;
      if (rect) { rect.setAttribute("stroke", C.s1); rect.setAttribute("stroke-width", 2.5); }
    }

    function select(id, rect) {
      var mm = MODULES[id];
      selectedId = id;
      highlight(rect);
      panel.innerHTML =
        '<span class="arch-layer-tag">' + mm.tag + "</span>" +
        "<h4>" + mm.name + "</h4>" +
        "<p>" + mm.desc + "</p>" +
        '<p class="arch-example">' + mm.ex + "</p>";
    }

    panel.innerHTML =
      '<span class="arch-layer-tag">Explore</span>' +
      "<h4>Click any module</h4>" +
      "<p>Blue band: the feature branch chasing accuracy at minimal bandwidth. Green band: the object branch guaranteeing robustness. They only meet at the adaptive fusion — that separation <em>is</em> the decoupling.</p>" +
      '<p class="arch-example">Press “Trace one perception cycle” to watch a message travel the whole system.</p>';

    var FLOW = [
      { from: "encoder", to: "cit", note: "confidence map up — 1×H×W, almost free" },
      { from: "egoenc", to: "cit", note: "ego computes demand, runs the competition" },
      { from: "cit", to: "lc", note: "sparse requested features arrive" },
      { from: "egoenc", to: "lc", note: "fused with the ego's own features" },
      { from: "dethead", to: "pac", note: "meanwhile: intact detections, possibly displaced" },
      { from: "egoenc", to: "pac", note: "PAC aligns them against the ego's view" },
      { from: "lc", to: "fusion", note: "feature branch: high-precision candidates" },
      { from: "pac", to: "fusion", note: "object branch: pose-robust candidates" },
      { from: "fusion", to: "nms", note: "uncertainty-recalibrated merge → final output" }
    ];
    var flow = null, STAGE = 950;

    document.getElementById("arch-flow").addEventListener("click", function () {
      flow = { start: performance.now() };
      loop.start();
    });

    var loop = U.raf(svg, function (now) {
      if (!flowLayer) return;
      flowLayer.innerHTML = "";
      if (!flow) return;
      var C = U.colors();
      var el = now - flow.start;
      var si = Math.floor(el / STAGE);
      if (si >= FLOW.length) { if (el > FLOW.length * STAGE + 400) flow = null; return; }
      var st = FLOW[si];
      var u = U.ease(U.clamp((el - si * STAGE) / (STAGE * 0.9), 0, 1));
      var a = centers[st.from], b = centers[st.to];
      U.svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: C.s1, "stroke-opacity": 0.4 }, flowLayer);
      U.svg("circle", { cx: U.lerp(a.x, b.x, u), cy: U.lerp(a.y, b.y, u), r: 4.5, fill: C.s1 }, flowLayer);
      var destRect = rects[st.to];
      if (destRect && u > 0.85) {
        destRect.setAttribute("stroke", C.s1);
        destRect.setAttribute("stroke-width", 2.5);
        setTimeout(function () {
          if (destRect !== highlighted) {
            destRect.setAttribute("stroke-width", 1);
            destRect.setAttribute("stroke", U.colors().ink2);
          }
        }, 650);
      }
      U.svg("text", { x: W / 2, y: H - 8, "text-anchor": "middle", "font-size": 11.5,
        fill: C.s1, "font-family": "inherit", "font-weight": "bold" }, flowLayer).textContent = st.note;
    });

    build();
    U.onThemeChange(build);
    loop.start();
  }

  /* ================================================================
     CIT WALKTHROUGH — the receiver-centric protocol computed live on
     a BEV grid, plus the comm-volume bars that explain *why*.
  ================================================================ */
  function initCIT() {
    var canvas = document.getElementById("cit-canvas");
    if (!canvas) return;
    var note = document.getElementById("cit-note");
    var playBtn = document.getElementById("cit-play");
    var nIn = document.getElementById("cit-n"), nVal = document.getElementById("cit-n-val");
    var barsEl = document.getElementById("comm-bars");

    var GW = 26, GH = 15;
    var rnd = U.rng(42);

    function field(cx, cy, spread) {
      var m = new Float32Array(GW * GH);
      for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
        var v = Math.exp(-((x - cx) * (x - cx) + (y - cy) * (y - cy) * 2.2) / (2 * spread * spread));
        m[y * GW + x] = Math.min(1, v * 1.25 + rnd() * 0.04);
      }
      return m;
    }
    var egoConf = field(5, 11, 5.5);
    var confA = field(16, 3.5, 5);
    var confB = field(22, 10, 4.5);

    /* precompute the protocol */
    var demand = new Float32Array(GW * GH);
    var winner = new Int8Array(GW * GH);     /* -1 none, 0 A, 1 B */
    for (var i = 0; i < GW * GH; i++) {
      demand[i] = 1 - egoConf[i];
      var sA = demand[i] * confA[i], sB = demand[i] * confB[i];
      winner[i] = (Math.max(sA, sB) < 0.22) ? -1 : (sA >= sB ? 0 : 1);
    }

    var step = 0, playing = false, timer = null, animStart = 0;
    var CAPS = [
      "STAGE 1 — Each collaborator sends only a confidence map: one channel, 1×H×W, a rounding error next to a feature map. Orange: collaborator A. Teal: collaborator B. Bright = “I can see something here.”",
      "STAGE 2 — The ego computes its demand D = 1 − σ(own confidence). Bright blue = the ego's perceptual gaps: exactly the regions behind its occluders and beyond its range.",
      "STAGE 3 — Relevance S_j = D ⊙ M_j, then a per-pixel winner-take-all: each cell is assigned to the single collaborator who sees it best. No cell is served twice.",
      "STAGE 4 — The assignments become sparse, exclusive binary request masks Q_j, sent back to each collaborator. Most of the grid is requested from no one.",
      "STAGE 5 — Collaborators transmit features only where requested: M(2) = F_j ⊙ Q_j. The ego just sums them — the masks are disjoint, so nothing collides. Near-constant received volume, any fleet size."
    ];

    var tabs = U.tabs(document.getElementById("cit-steps"), function (k) {
      step = +k;
      animStart = performance.now();
      note.textContent = CAPS[step];
    });
    note.textContent = CAPS[0];

    playBtn.addEventListener("click", function () {
      playing = !playing;
      playBtn.classList.toggle("is-playing", playing);
      playBtn.innerHTML = playing ? "&#9646;&#9646;" : "&#9654;";
      if (playing) timer = setInterval(function () {
        step = (step + 1) % 5;
        tabs.highlight(step);
        animStart = performance.now();
        note.textContent = CAPS[step];
      }, 3400);
      else clearInterval(timer);
    });

    function commBars() {
      var n = +nIn.value;
      nVal.textContent = n;
      var C = U.colors();
      var sender = n * 6.3;              /* each agent broadcasts its selection */
      var cit = 3.5 + n * 0.12;          /* sparse features + n tiny conf maps  */
      var max = 8 * 6.3;
      barsEl.innerHTML = "";
      [["Sender-centric", sender, C.crit], ["CIT (receiver-centric)", cit, C.s1]].forEach(function (row) {
        var div = document.createElement("div");
        div.className = "cora-comm-row";
        div.innerHTML = '<span class="cora-comm-name">' + row[0] + '</span>' +
          '<span class="cora-comm-bar-wrap"><span class="cora-comm-bar" style="background:' + row[2] + '"></span></span>' +
          '<span class="cora-comm-val">' + row[1].toFixed(1) + ' MB</span>';
        barsEl.appendChild(div);
        var bar = div.querySelector(".cora-comm-bar");
        requestAnimationFrame(function () { bar.style.width = (row[1] / max * 100) + "%"; });
      });
    }
    nIn.addEventListener("input", commBars);
    commBars();
    U.onThemeChange(commBars);

    function draw(nowMs) {
      var f = U.fitCanvas(canvas, 320), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);
      var cs = Math.min(w / GW, (h - 24) / GH);
      var ox = (w - cs * GW) / 2, oy = 24;
      var animU = U.clamp((nowMs - animStart) / 700, 0, 1);

      function cellRect(x, y) { return [ox + x * cs, oy + y * cs, cs - 1, cs - 1]; }
      function heat(mArr, col, alphaScale) {
        for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
          var v = mArr[y * GW + x];
          if (v < 0.04) continue;
          ctx.fillStyle = col;
          ctx.globalAlpha = v * (alphaScale || 0.85);
          var r = cellRect(x, y);
          ctx.fillRect(r[0], r[1], r[2], r[3]);
        }
        ctx.globalAlpha = 1;
      }

      /* base grid */
      ctx.strokeStyle = C.grid;
      for (var x = 0; x <= GW; x++) { ctx.beginPath(); ctx.moveTo(ox + x * cs, oy); ctx.lineTo(ox + x * cs, oy + GH * cs); ctx.stroke(); }
      for (var y = 0; y <= GH; y++) { ctx.beginPath(); ctx.moveTo(ox, oy + y * cs); ctx.lineTo(ox + GW * cs, oy + y * cs); ctx.stroke(); }

      ctx.font = U.font(10.5, true);
      ctx.textAlign = "left";
      var title = ["Collaborator confidence maps M(1)", "Ego demand map D", "Winner-take-all competition",
                   "Sparse request masks Q_j", "Sparse feature transmission → F_coll"][step];
      ctx.fillStyle = C.ink2;
      ctx.fillText(title, ox, 14);

      if (step === 0) {
        heat(confA, C.s2, 0.8);
        heat(confB, C.sea || C.s3, 0.8);
      } else if (step === 1) {
        heat(demand, C.s1, 0.8);
      } else if (step >= 2) {
        /* assignment coloring; steps 3-4 sparsify to masks/features */
        for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
          var wI = winner[y * GW + x];
          if (wI < 0) continue;
          var r = cellRect(x, y);
          var col = wI === 0 ? C.s2 : (C.sea || C.s3);
          if (step === 2) {
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.55;
            ctx.fillRect(r[0], r[1], r[2], r[3]);
            ctx.globalAlpha = 1;
          } else if (step === 3) {
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.6;
            ctx.strokeRect(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2);
            ctx.lineWidth = 1;
          } else {
            /* features flying in from panel edges */
            var srcX = wI === 0 ? ox + 16 * cs : ox + 22 * cs;
            var srcY = wI === 0 ? oy - 14 : oy - 14;
            var uu = U.clamp(animU * 1.4 - (x + y) * 0.012, 0, 1);
            var fx2 = U.lerp(srcX, r[0], uu), fy2 = U.lerp(srcY, r[1], uu);
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.35 + 0.5 * uu;
            ctx.fillRect(fx2, fy2, r[2], r[3]);
            ctx.globalAlpha = 1;
          }
        }
      }

      /* ego marker */
      car(ctx, ox + 3 * cs, oy + 12.5 * cs, cs * 2.2, cs * 1.1, -0.4, C.s1);
      ctx.fillStyle = C.s1;
      ctx.font = U.font(10, true);
      ctx.fillText("ego", ox + 3 * cs - 10, oy + 12.5 * cs + cs * 1.6);
    }

    U.raf(canvas, draw).start();
  }

  /* ================================================================
     LC PIPELINE — a compact animated diagram of the fusion path,
     with the training-only teacher hovering above it.
  ================================================================ */
  function initLC() {
    var canvas = document.getElementById("lc-canvas");
    if (!canvas) return;

    var STAGES = ["F_coll ⊙ S_coll", "F_i ⊙ S_i", "Attn", "CSSM", "Gate g", "F_out"];

    function draw(t) {
      var f = U.fitCanvas(canvas, 190), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);
      var y0 = h * 0.62;
      var xs = [0.09, 0.09, 0.38, 0.55, 0.72, 0.9];
      var ys = [h * 0.42, h * 0.82, y0, y0, y0, y0];
      var bw = w * 0.13, bh = 30;

      /* teacher */
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = C.s5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(w * 0.5 - bw / 2, 8, bw * 1.6, 26);
      ctx.font = U.font(10);
      ctx.fillStyle = C.s5;
      ctx.textAlign = "center";
      ctx.fillText("teacher: dense features", w * 0.5 + bw * 0.3, 25);
      ctx.beginPath();
      ctx.moveTo(w * 0.5 + bw * 0.3, 34);
      ctx.lineTo(xs[5] * w, y0 - bh / 2 - 4);
      ctx.stroke();
      ctx.fillText("L_align (training only)", w * 0.72, 40);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      /* boxes */
      STAGES.forEach(function (s, i) {
        var bx = xs[i] * w - bw / 2, by = ys[i] - bh / 2;
        ctx.fillStyle = C.surface2;
        ctx.strokeStyle = i >= 2 ? C.s1 : C.axis;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = C.ink;
        ctx.font = U.font(10.5);
        ctx.textAlign = "center";
        ctx.fillText(s, xs[i] * w, ys[i] + 4);
      });

      /* converging + forward tokens */
      function flowLine(x1, y1, x2, y2, phase, col) {
        ctx.strokeStyle = C.axis;
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.globalAlpha = 1;
        var u = (t * 0.7 + phase) % 1;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(U.lerp(x1, x2, u), U.lerp(y1, y2, u), 3, 0, 6.29); ctx.fill();
      }
      flowLine(xs[0] * w + bw / 2, ys[0], xs[2] * w - bw / 2, y0 - 4, 0, C.s2);
      flowLine(xs[1] * w + bw / 2, ys[1], xs[2] * w - bw / 2, y0 + 4, 0.4, C.s1);
      for (var i = 2; i < 5; i++) flowLine(xs[i] * w + bw / 2, y0, xs[i + 1] * w - bw / 2, y0, i * 0.25, C.s1);

      /* the gate visual: opens/closes over time */
      var g = 0.5 + 0.45 * Math.sin(t * 1.4);
      ctx.fillStyle = C.good;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(xs[4] * w - bw / 2, y0 + bh / 2 + 6, bw * g, 5);
      ctx.globalAlpha = 1;
      ctx.font = U.font(9.5);
      ctx.fillStyle = C.ink2;
      ctx.textAlign = "left";
      ctx.fillText("gate opening: " + Math.round(g * 100) + "%", xs[4] * w - bw / 2, y0 + bh / 2 + 24);
    }

    U.raf(canvas, function (tm) { draw(tm / 1000); }).start();
  }

  /* ================================================================
     PAC WALKTHROUGH — displaced boxes → attention match → offset
     field → deformable snap-back, with a live IoU readout.
  ================================================================ */
  function initPAC() {
    var canvas = document.getElementById("pac-canvas");
    if (!canvas) return;
    var errIn = document.getElementById("pac-err");
    var iouEl = document.getElementById("pac-iou");
    var noteEl = document.getElementById("pac-note");

    var TRUTH = [
      { x: 0.22, y: 0.3 }, { x: 0.44, y: 0.62 }, { x: 0.6, y: 0.26 },
      { x: 0.76, y: 0.55 }, { x: 0.35, y: 0.82 }
    ];
    var EGO_SEES = [0, 1, 4];   /* indices the ego detected itself */

    var step = 0, animStart = 0;
    var CAPS = [
      "The collaborator's detections arrive displaced by its pose error. Naive late fusion would paste them exactly here — creating duplicates and phantoms.",
      "PAC first scores semantic relevance: descriptors (box parameters + positional embedding) from both agents meet in cross-agent attention. Strong links = “these are the same physical object.”",
      "From the concatenated detection maps, a shared encoder predicts a dense 2D offset field Δp — the estimated displacement for every cell. Note it points opposite to the pose error.",
      "Deformable convolution resamples the collaborator's maps at the corrected locations. Boxes snap back onto the truth — the residual is what the offset predictor couldn't explain."
    ];
    var tabs = U.tabs(document.getElementById("pac-steps"), function (k) {
      step = +k;
      animStart = performance.now();
      noteEl.textContent = CAPS[step];
    });
    noteEl.textContent = CAPS[0];

    function boxIoU(dx, dy, bw2, bh2) {
      var ix = Math.max(0, bw2 - Math.abs(dx)), iy = Math.max(0, bh2 - Math.abs(dy));
      var inter = ix * iy, uni = 2 * bw2 * bh2 - inter;
      return inter / uni;
    }

    function draw(nowMs) {
      var f = U.fitCanvas(canvas, 300), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);
      var err = +errIn.value / 100;
      var dx = err * 42, dy = err * -18;
      var animU = U.clamp((nowMs - animStart) / 900, 0, 1);
      var corr = step === 3 ? U.ease(animU) : 0;
      var resid = 0.1;   /* correction recovers ~90% */
      var cdx = dx * (1 - corr * (1 - resid)), cdy = dy * (1 - corr * (1 - resid));

      var BW = 36, BH = 20;

      /* offset field (step 2+) */
      if (step === 2 || (step === 3 && animU < 0.5)) {
        ctx.strokeStyle = C.s6;
        ctx.globalAlpha = 0.55;
        for (var gx = 30; gx < w - 10; gx += 44) for (var gy = 26; gy < h - 30; gy += 40) {
          var mag = 0.35 + 0.65 * Math.exp(-U.dist(gx, gy, w * 0.5, h * 0.5) / (w * 0.55));
          var ax = -dx * 0.35 * mag, ay = -dy * 0.35 * mag;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx + ax, gy + ay);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(gx + ax, gy + ay, 1.6, 0, 6.29);
          ctx.fill && (ctx.fillStyle = C.s6, ctx.fill());
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.s6;
        ctx.font = U.font(10, true);
        ctx.textAlign = "left";
        ctx.fillText("Δp: predicted offset field", 12, h - 10);
      }

      var iouSum = 0;
      TRUTH.forEach(function (o, i) {
        var ox = o.x * w, oy = o.y * h;
        /* truth */
        ctx.strokeStyle = C.muted;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(ox - BW / 2, oy - BH / 2, BW, BH);
        ctx.setLineDash([]);
        /* ego detections */
        if (EGO_SEES.indexOf(i) >= 0) {
          ctx.strokeStyle = C.s1;
          ctx.lineWidth = 2.2;
          ctx.strokeRect(ox - BW / 2, oy - BH / 2, BW, BH);
          ctx.lineWidth = 1;
        }
        /* collaborator detections */
        var bx = ox + cdx, by = oy + cdy;
        ctx.strokeStyle = C.s2;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - BW / 2, by - BH / 2, BW, BH);
        ctx.lineWidth = 1;
        iouSum += boxIoU(cdx, cdy, BW / 2, BH / 2);

        /* attention links (step 1) */
        if (step === 1 && EGO_SEES.indexOf(i) >= 0) {
          var att = Math.exp(-U.dist(ox, oy, bx, by) / 90);
          ctx.strokeStyle = C.s5;
          ctx.globalAlpha = 0.35 + att * 0.6;
          ctx.lineWidth = 1 + att * 2.5;
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(bx, by); ctx.stroke();
          ctx.lineWidth = 1;
          ctx.globalAlpha = 1;
          ctx.fillStyle = C.s5;
          ctx.font = U.font(9.5, true);
          ctx.textAlign = "center";
          ctx.fillText("A=" + att.toFixed(2), (ox + bx) / 2, (oy + by) / 2 - 5);
        }
      });

      iouEl.textContent = (iouSum / TRUTH.length).toFixed(2);

      ctx.font = U.font(10);
      ctx.textAlign = "left";
      ctx.fillStyle = C.s1; ctx.fillText("■ ego detections", 12, 16);
      ctx.fillStyle = C.s2; ctx.fillText("■ collaborator detections", 110, 16);
      ctx.fillStyle = C.muted; ctx.fillText("┄ ground truth", 260, 16);
    }

    U.raf(canvas, draw).start();
  }
})();
