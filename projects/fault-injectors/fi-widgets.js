/* ==================================================================
   fi-widgets.js: every interactive figure on the page.

   One widget per fault injector, plus the hero occlusion figure, the
   ranking chart, and the AgentDrop / MissingModality contrast.

   All of them read the same shared scene (FI.scene: agent count and
   world seed), so changing the agent count anywhere changes every
   figure at once. Each widget:
     - reads theme colours via FI.colors() at draw time,
     - redraws on theme flip, resize, and scene change,
     - pauses its loop offscreen via FI.raf,
     - degrades to a meaningful static frame under reduced motion.
================================================================== */
(function () {
  "use strict";
  var FI = window.FI;

  /* ---------- shared scene ------------------------------------- */

  var S = null;                 /* the current built scene */
  var redraws = [];             /* every widget's repaint entry point */

  function rebuild() {
    S = FI.buildScene(FI.scene.seed, FI.scene.agents);
  }
  function redrawAll() {
    redraws.forEach(function (fn) { try { fn(); } catch (e) {} });
  }
  function onSceneChange() { rebuild(); redrawAll(); }

  /* debounced resize */
  var rzT = null;
  window.addEventListener("resize", function () {
    clearTimeout(rzT);
    rzT = setTimeout(redrawAll, 120);
  });

  /* Canvas height for a BEV panel. The default ratio is close to the
     4:3 aspect of FI.WORLD.VIEW, so the contain-fit inside FI.view wastes
     almost none of the canvas at the widths these panels actually get. */
  function bevH(canvas, lo, hi, ratio) {
    var w = canvas.clientWidth || 600;
    return Math.round(FI.clamp(w * (ratio || 0.75), lo || 220, hi || 520));
  }

  /* register a widget repaint */
  function register(fn) {
    redraws.push(fn);
    FI.onThemeChange(fn);
    return fn;
  }

  /* a play/pause button bound to a loop */
  function playButton(btn, loop, opts) {
    if (!btn) return { set: function () {} };
    var on = false;
    function paint() {
      btn.innerHTML = on ? "&#10073;&#10073;" : "&#9654;";
      btn.setAttribute("aria-label", on ? "Pause animation" : "Play animation");
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-playing", on);
    }
    function set(v) {
      on = v;
      if (on) loop.start(); else loop.stop();
      paint();
      if (!on && opts && opts.onStop) opts.onStop();
    }
    btn.addEventListener("click", function () { set(!on); });
    paint();
    return { set: set, get on() { return on; } };
  }

  /* ==================================================================
     FUSION GRAPH STRIP
     Ego at the left, collaborators in a row, one edge each. The node
     state is the entire difference between AgentDrop and
     MissingModality, so this strip is what makes the two legible.
  ================================================================== */

  function drawGraph(canvas, states, counts, opts) {
    opts = opts || {};
    var n = states.length;
    var f = FI.fitCanvas(canvas, opts.h || 118);
    var ctx = f.ctx, C = FI.colors();
    ctx.clearRect(0, 0, f.w, f.h);

    var padL = Math.max(46, f.w * 0.09);
    var padR = 18;
    var cy = f.h * 0.44;
    var ex = padL;
    var span = f.w - padL - padR;
    var gap = n > 1 ? span / (n - 1) : 0;

    function nodeX(i) { return i === 0 ? ex : ex + gap * i; }

    /* edges first */
    for (var i = 1; i < n; i++) {
      var x0 = nodeX(0), x1 = nodeX(i);
      var st = states[i];
      ctx.beginPath();
      ctx.moveTo(x0, cy);
      ctx.bezierCurveTo((x0 + x1) / 2, cy - 26, (x0 + x1) / 2, cy - 26, x1, cy);
      if (st === "dropped") {
        ctx.strokeStyle = C.muted;
        ctx.globalAlpha = 0.3;
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1;
      } else if (st === "empty") {
        ctx.strokeStyle = C.agent[i];
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([]);
        ctx.lineWidth = 1.4;
      } else {
        ctx.strokeStyle = C.agent[i];
        ctx.globalAlpha = 0.9;
        ctx.setLineDash([]);
        ctx.lineWidth = 2.2;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    /* nodes */
    for (i = 0; i < n; i++) {
      var x = nodeX(i), st2 = states[i], col = C.agent[i];
      var r = i === 0 ? 15 : 13;
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, 7);
      if (st2 === "dropped") {
        ctx.strokeStyle = C.muted;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.6, cy - r * 0.6); ctx.lineTo(x + r * 0.6, cy + r * 0.6);
        ctx.moveTo(x + r * 0.6, cy - r * 0.6); ctx.lineTo(x - r * 0.6, cy + r * 0.6);
        ctx.stroke();
      } else if (st2 === "empty") {
        ctx.fillStyle = C.surface;
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = col;
        ctx.fill();
      }

      ctx.fillStyle = st2 === "dropped" ? C.muted : C.ink2;
      ctx.font = FI.font(11, i === 0);
      ctx.textAlign = "center";
      ctx.fillText(i === 0 ? "ego" : "A" + i, x, cy + r + 15);

      var sub;
      if (st2 === "dropped") sub = "no link";
      else if (st2 === "empty") sub = "0 pts";
      else sub = counts ? FI.fmt.n(counts[i] || 0) + " pts" : "";
      ctx.fillStyle = st2 === "present" ? C.muted : (st2 === "empty" ? C.warn : C.muted);
      ctx.font = FI.font(10);
      ctx.fillText(sub, x, cy + r + 28);
    }

    /* title strip */
    if (opts.title) {
      ctx.fillStyle = C.muted;
      ctx.font = FI.font(11);
      ctx.textAlign = "left";
      ctx.fillText(opts.title, 4, 12);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    rebuild();
    FI.scene.bindControls();
    FI.scene.on(onSceneChange);

    /* ==============================================================
       HERO: two vehicles seeing around an occlusion.
       A bespoke miniature scene: the ego's visibility polygon stops at
       a corner building, a car coming down the cross street sits in the
       shadow, and the collaborator's polygon covers exactly that gap.
    ============================================================== */
    (function hero() {
      var canvas = document.getElementById("hero-bev");
      if (!canvas) return;
      var capEl = document.getElementById("hero-caption");

      var NB = 480, STEP = (Math.PI * 2) / NB, RANGE = 46;

      /* Miniature world, laid out wide so it fills a hero-shaped canvas.
         The corner building is sized so that the ego's sight line to the
         cross-street car is blocked over the car's whole travel, while
         the collaborator's sight line to it is clear. */
      var HB = [
        { cx: -6, cy: 13.5, w: 30, h: 13 },
        { cx: 39, cy: 17, w: 18, h: 12 },
        { cx: -8, cy: -14, w: 26, h: 10 },
        { cx: 39, cy: -14, w: 18, h: 10 }
      ];
      var segs = [];
      HB.forEach(function (b) {
        var c = FI.boxCorners(b.cx, b.cy, b.w, b.h, 0);
        for (var i = 0; i < 4; i++) {
          segs.push({ x1: c[i][0], y1: c[i][1], x2: c[(i + 1) % 4][0], y2: c[(i + 1) % 4][1] });
        }
      });
      var EGO = { x: -34, y: -3, h: 0 };
      var COL = { x: 40, y: 3, h: Math.PI };
      var HID = { x: 16, y: 15, h: -Math.PI / 2 };

      function hidCorners(t) {
        /* the hidden car rolls slowly down the cross street, staying
           inside the ego's shadow for the whole loop */
        var y = HID.y - ((t * 1.1) % 6);
        return { y: y, corners: FI.boxCorners(HID.x, y, 4.7, 2.0, HID.h) };
      }

      function cast(ax, ay, extra) {
        var d = new Float32Array(NB);
        d.fill(RANGE);
        var all = segs.concat(extra || []);
        all.forEach(function (s) { FI.castSeg(ax, ay, s, d, null, 0); });
        return d;
      }

      function polyFill(ctx, v, ax, ay, depth, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        for (var b = 0; b < NB; b++) {
          var th = b * STEP, r = Math.min(depth[b], RANGE);
          var X = v.sx(ax + Math.cos(th) * r), Y = v.sy(ay + Math.sin(th) * r);
          if (b) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function points(ctx, v, ax, ay, depth, color, frac) {
        ctx.fillStyle = color;
        var lim = Math.floor(NB * frac);
        for (var b = 0; b < NB; b++) {
          if ((b * 7919) % NB > lim) continue;
          var r = depth[b];
          if (r >= RANGE) continue;
          var th = b * STEP;
          ctx.fillRect(v.sx(ax + Math.cos(th) * r) - 1, v.sy(ay + Math.sin(th) * r) - 1, 2, 2);
        }
      }

      var CAPS = [
        "One vehicle, one viewpoint. The building on the corner casts a LiDAR shadow, and the car coming down the cross street is inside it.",
        "A second vehicle shares its point cloud. Its viewpoint is not blocked by that building.",
        "Fused, the shadow is filled in and the hidden car is detected. This is the whole promise of cooperative perception, and it is what every fault below erodes."
      ];
      /* Under reduced motion the static equivalent is the fused frame,
         because that is the one that carries the point. The step buttons
         still walk back through the setup. */
      var stage = FI.reducedMotion ? 2 : 0, manual = false;

      /* Contain-fit on a wide view box, so the scene fills the hero
         canvas at desktop widths and never crops on a phone. */
      var HV = { cx: 5, cy: 1.5, w: 100, h: 44 };

      function view() {
        var w = canvas.clientWidth || 700;
        var h = Math.round(FI.clamp(w * 0.42, 160, 420));
        var f = FI.fitCanvas(canvas, h);
        var scale = Math.min(f.w / HV.w, f.h / HV.h);
        var ox = f.w / 2 - HV.cx * scale, oy = f.h / 2 + HV.cy * scale;
        return {
          ctx: f.ctx, w: f.w, h: f.h, scale: scale,
          sx: function (x) { return ox + x * scale; },
          sy: function (y) { return oy - y * scale; },
          m: function (d) { return d * scale; }
        };
      }

      function draw(tms) {
        var v = view(), ctx = v.ctx, C = FI.colors();
        var t = (tms || 0) / 1000;
        var ph;
        if (manual || FI.reducedMotion) {
          ph = stage;
        } else {
          var cyc = t % 13;
          ph = cyc < 4 ? 0 : (cyc < 6 ? 1 : 2);
          stage = ph;
        }
        var hid = hidCorners(manual || FI.reducedMotion ? 3 : t);
        var hidSegs = [];
        for (var i = 0; i < 4; i++) {
          hidSegs.push({ x1: hid.corners[i][0], y1: hid.corners[i][1],
                         x2: hid.corners[(i + 1) % 4][0], y2: hid.corners[(i + 1) % 4][1] });
        }
        var dE = cast(EGO.x, EGO.y, hidSegs);
        var dC = cast(COL.x, COL.y, hidSegs);

        ctx.clearRect(0, 0, v.w, v.h);
        ctx.fillStyle = C.surface2;
        ctx.fillRect(0, 0, v.w, v.h);

        /* roads, drawn out to the canvas edges */
        ctx.fillStyle = C.road;
        ctx.fillRect(0, v.sy(6), v.w, v.m(12));
        ctx.fillRect(v.sx(11), 0, v.m(16), v.h);

        /* visibility polygons */
        polyFill(ctx, v, EGO.x, EGO.y, dE, C.s1, 0.16);
        if (ph >= 1) polyFill(ctx, v, COL.x, COL.y, dC, C.s2, ph === 1 ? 0.10 : 0.16);

        /* buildings */
        ctx.fillStyle = C.build;
        ctx.strokeStyle = C.buildline;
        ctx.lineWidth = 1;
        HB.forEach(function (b) {
          ctx.beginPath();
          ctx.rect(v.sx(b.cx - b.w / 2), v.sy(b.cy + b.h / 2), v.m(b.w), v.m(b.h));
          ctx.fill(); ctx.stroke();
        });

        /* point clouds */
        points(ctx, v, EGO.x, EGO.y, dE, C.s1, 1);
        if (ph >= 1) points(ctx, v, COL.x, COL.y, dC, C.s2, ph === 1 ? 0.55 : 1);

        /* the hidden vehicle */
        var seen = ph >= 2;
        FI.drawBox(v, hid.corners, seen ? C.good : C.muted, "stroke", seen ? null : [4, 4]);
        ctx.fillStyle = seen ? C.good : C.muted;
        ctx.font = FI.font(11, seen);
        ctx.textAlign = "center";
        ctx.fillText(seen ? "detected" : "not seen by ego",
          v.sx(HID.x), v.sy(hid.y) - v.m(3.6));

        /* the two vehicles */
        [[EGO, C.s1, "ego"], [COL, C.s2, "collaborator"]].forEach(function (a, idx) {
          if (idx === 1 && ph < 1) return;
          var p = a[0];
          ctx.save();
          ctx.translate(v.sx(p.x), v.sy(p.y));
          ctx.rotate(-p.h);
          var L = v.m(5.4), W = v.m(2.5);
          ctx.beginPath();
          ctx.moveTo(L / 2, 0); ctx.lineTo(-L / 2, -W / 2);
          ctx.lineTo(-L / 3, 0); ctx.lineTo(-L / 2, W / 2);
          ctx.closePath();
          ctx.fillStyle = a[1];
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = a[1];
          ctx.font = FI.font(11, true);
          ctx.fillText(a[2], v.sx(p.x), v.sy(p.y) + v.m(4.6));
        });

        if (capEl && capEl.dataset.stage !== String(ph)) {
          capEl.dataset.stage = String(ph);
          capEl.textContent = CAPS[ph];
        }
        var steps = document.getElementById("hero-steps");
        if (steps) {
          Array.prototype.forEach.call(steps.children, function (b, i) {
            b.setAttribute("aria-selected", i === ph ? "true" : "false");
          });
        }
      }

      var loop = FI.raf(canvas, draw);
      var play = playButton(document.getElementById("hero-play"), loop);
      var steps = document.getElementById("hero-steps");
      if (steps) FI.tabs(steps, function (k) {
        manual = true;
        play.set(false);
        stage = parseInt(k, 10);
        draw(0);
      });

      register(function () { draw(manual || FI.reducedMotion ? 0 : performance.now()); });
      draw(0);
      if (!FI.reducedMotion) play.set(true);
      FI.onIOBroken(function () { draw(0); });
    })();

    /* ==============================================================
       LEGEND / SETUP: a clean cooperative frame, no fault at all.
       This is the reference every fault figure is compared against.
    ============================================================== */
    (function setup() {
      var canvas = document.getElementById("bev-clean");
      if (!canvas) return;
      var out = FI.makeCloud(8000);
      var statEl = document.getElementById("clean-stats");

      function draw() {
        var v = FI.view(canvas, bevH(canvas, 230, 640, 0.75));
        S.compose(out, null, null);
        FI.drawWorld(v, S);
        S.vehicles(0).forEach(function (veh) {
          FI.drawBox(v, veh.corners, FI.colors().muted, "stroke", [3, 3]);
        });
        FI.drawPoints(v, out, "agent");
        FI.drawAgents(v, S);
        FI.drawScaleBar(v, 20);
        if (statEl) {
          var byA = S.countByAgent(out);
          statEl.innerHTML = byA.map(function (c, i) {
            return "<span class=\"fi-chip\" style=\"--c:var(--viz-s" + (i + 1) + ")\">" +
              (i === 0 ? "ego" : "A" + i) + " " + FI.fmt.n(c) + "</span>";
          }).join("") + "<span class=\"fi-chip fi-chip-total\">total " + FI.fmt.n(out.n) + "</span>";
        }
      }
      register(draw);
      draw();
    })();

    /* ==============================================================
       01 · PoseError
       Clean and faulty overlaid, with displacement vectors between
       corresponding points. The vectors grow with range because the
       rotation term is applied about the collaborator's own origin.
    ============================================================== */
    (function pose() {
      var canvas = document.getElementById("bev-pose");
      if (!canvas) return;
      var inj = FI.DATA.byKey("pose");
      var clean = FI.makeCloud(8000), bad = FI.makeCloud(8000);
      var sev = 0, mag = 3;
      var ro = document.getElementById("ro-pose");

      var magSel = document.getElementById("pose-mag");
      if (magSel) magSel.addEventListener("change", function () {
        mag = parseFloat(magSel.value);
        draw();
      });

      function draw() {
        var v = FI.view(canvas, bevH(canvas));
        var C = FI.colors();
        var offs = FI.faults.poseOffsets(S, sev, FI.scene.seed);
        S.compose(clean, null, null);
        FI.faults.pose(clean, bad, S, offs);

        FI.drawWorld(v, S);

        /* clean collaborator points, faded: the ghost */
        FI.drawPoints(v, clean, "agent", { alpha: 0.22 });

        /* displacement vectors, magnified for legibility only */
        var sumD = 0, maxD = 0, nD = 0;
        if (sev > 0) {
          var ctx = v.ctx;
          ctx.lineWidth = 1;
          for (var k = 0; k < clean.n; k++) {
            var a = clean.a[k];
            if (a === 0) continue;
            var dx = bad.x[k] - clean.x[k], dy = bad.y[k] - clean.y[k];
            var d = Math.hypot(dx, dy);
            sumD += d; nD++;
            if (d > maxD) maxD = d;
            if (k % 11) continue;
            ctx.strokeStyle = C.agent[a];
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.moveTo(v.sx(clean.x[k]), v.sy(clean.y[k]));
            ctx.lineTo(v.sx(clean.x[k] + dx * mag), v.sy(clean.y[k] + dy * mag));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }

        /* faulty cloud, drawn at the magnified offset */
        if (sev > 0 && mag !== 1) {
          for (var j = 0; j < bad.n; j++) {
            bad.x[j] = clean.x[j] + (bad.x[j] - clean.x[j]) * mag;
            bad.y[j] = clean.y[j] + (bad.y[j] - clean.y[j]) * mag;
          }
        }
        FI.drawPoints(v, bad, "agent");
        FI.drawAgents(v, S);
        FI.drawScaleBar(v, 20);

        if (ro) {
          var mean = nD ? sumD / nD : 0;
          var rows = offs.slice(1).map(function (o, i) {
            return "<tr><th scope=\"row\"><span class=\"fi-dot\" style=\"background:" +
              C.agent[i + 1] + "\"></span>A" + (i + 1) + "</th><td>" +
              o.dx.toFixed(2) + ", " + o.dy.toFixed(2) + " m</td><td>" +
              (o.dh * 180 / Math.PI).toFixed(2) + "°</td></tr>";
          }).join("");
          ro.innerHTML =
            "<div class=\"fi-stat\"><span class=\"fi-stat-label\">Mean point displacement</span>" +
            "<span class=\"fi-stat-value\">" + mean.toFixed(2) + " m</span>" +
            "<span class=\"fi-stat-sub\">worst point " + maxD.toFixed(2) + " m</span></div>" +
            "<table class=\"fi-mini\"><caption>Sampled pose error per collaborator</caption>" +
            "<thead><tr><th>Agent</th><th>Δx, Δy</th><th>Δθ</th></tr></thead><tbody>" +
            (rows || "<tr><td colspan=\"3\">no collaborators</td></tr>") + "</tbody></table>";
        }
      }

      FI.tierControl(document.querySelector(".fi-sev-host[data-inj=pose]"), inj, function (v) {
        sev = v; draw();
      });
      FI.numbersTable(document.querySelector(".fi-nums[data-inj=pose]"), inj);
      register(draw);
      draw();
    })();

    /* ==============================================================
       02 · CommLatency
       Runs continuously. Collaborators contribute the world as it was
       Δt ago, so their returns on moving vehicles trail the live ones.
       The lag is annotated in metres, because that is the unit the
       detector actually cares about.
    ============================================================== */
    (function latency() {
      var canvas = document.getElementById("bev-latency");
      if (!canvas) return;
      var inj = FI.DATA.byKey("latency");
      var cloud = FI.makeCloud(9000);
      var sev = 0, tNow = 0;
      var ro = document.getElementById("ro-latency");
      var scrubEl = document.getElementById("latency-time");

      /* Scrubbing takes over from playback, which is what a scrubber
         should do, and gives the reduced-motion path a real control. */
      if (scrubEl) scrubEl.addEventListener("input", function () {
        play.set(false);
        tNow = parseFloat(scrubEl.value) / 100 * 12;
        draw();
      });

      /* draw(tms) advances the clock, draw() repaints the current instant.
         Every control repaints immediately rather than waiting for the
         next animation frame, so nothing ever shows a stale readout. */
      function draw(tms) {
        if (tms !== null && tms !== undefined) tNow = (tms / 1000) % 12;
        var dt = FI.PARAMS.latency.dt[sev];
        var v = FI.view(canvas, bevH(canvas));
        var C = FI.colors();

        S.compose(cloud, function (ai) { return ai === 0 ? tNow : tNow - dt; }, null);

        FI.drawWorld(v, S);

        /* stale vehicle outlines, then live ones */
        if (dt > 0) {
          S.vehicles(tNow - dt).forEach(function (veh) {
            FI.drawBox(v, veh.corners, C.warn, "stroke", [3, 3]);
          });
        }
        S.vehicles(tNow).forEach(function (veh) {
          FI.drawBox(v, veh.corners, C.muted, "stroke", null);
        });

        FI.drawPoints(v, cloud, "agent");
        FI.drawAgents(v, S);
        FI.drawScaleBar(v, 20);

        /* annotate the lag on the fastest vehicle */
        var fast = S.vehicles(tNow)[0], old = S.vehicles(tNow - dt)[0];
        if (dt > 0) {
          var ctx = v.ctx;
          ctx.strokeStyle = C.crit;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(v.sx(old.x), v.sy(old.y) - v.m(2.6));
          ctx.lineTo(v.sx(fast.x), v.sy(fast.y) - v.m(2.6));
          ctx.stroke();
          var lag = fast.speed * dt;
          ctx.fillStyle = C.crit;
          ctx.font = FI.font(11, true);
          ctx.textAlign = "center";
          ctx.fillText(lag.toFixed(1) + " m behind",
            (v.sx(old.x) + v.sx(fast.x)) / 2, v.sy(fast.y) - v.m(4.4));
        }

        FI.drawCaption(v, [
          { text: dt > 0 ? "collaborators are showing t − " + (dt * 1000).toFixed(0) + " ms"
                         : "all agents synchronised", color: dt > 0 ? C.warn : C.muted }
        ]);

        if (ro) {
          var rows = S.vehicles(tNow).map(function (veh, i) {
            return "<tr><th scope=\"row\">V" + (i + 1) + "</th><td>" + veh.speed.toFixed(1) +
              " m/s</td><td>" + (veh.speed * dt).toFixed(2) + " m</td></tr>";
          }).join("");
          ro.innerHTML =
            "<div class=\"fi-stat\"><span class=\"fi-stat-label\">Positional lag at 9 m/s</span>" +
            "<span class=\"fi-stat-value\">" + (9 * dt).toFixed(2) + " m</span>" +
            "<span class=\"fi-stat-sub\">lag = v × Δt</span></div>" +
            "<table class=\"fi-mini\"><caption>Lag per moving vehicle</caption>" +
            "<thead><tr><th>Vehicle</th><th>speed</th><th>lag</th></tr></thead><tbody>" +
            rows + "</tbody></table>";
        }
      }

      var loop = FI.raf(canvas, draw);
      var play = playButton(document.getElementById("latency-play"), loop, {
        onStop: function () { if (scrubEl) scrubEl.value = (tNow / 12 * 100).toFixed(0); }
      });

      FI.tierControl(document.querySelector(".fi-sev-host[data-inj=latency]"), inj, function (v) {
        sev = v;
        draw();
      });
      FI.numbersTable(document.querySelector(".fi-nums[data-inj=latency]"), inj);
      register(function () { draw(); });
      draw();
      if (!FI.reducedMotion) play.set(true);
    })();

    /* ==============================================================
       03 · AgentDrop
       BEV plus fusion graph. The dropped agent leaves the graph
       entirely, which is exactly what distinguishes it from §04.
    ============================================================== */
    (function agentDrop() {
      var canvas = document.getElementById("bev-drop");
      if (!canvas) return;
      var inj = FI.DATA.byKey("drop");
      var cloud = FI.makeCloud(8000);
      var sev = 0, roll = 0;
      var graph = document.getElementById("graph-drop");
      var ro = document.getElementById("ro-drop");
      var note = document.getElementById("note-drop");

      var reroll = document.getElementById("drop-reroll");
      if (reroll) reroll.addEventListener("click", function () { roll++; draw(); });

      function draw() {
        var p = FI.PARAMS.drop.p[sev];
        var dropped = FI.faults.bernoulli(S, p, FI.scene.seed + roll * 977);
        var v = FI.view(canvas, bevH(canvas));

        S.compose(cloud, null, function (ai) { return dropped[ai]; });
        FI.drawWorld(v, S);
        FI.drawPoints(v, cloud, "agent");
        FI.drawAgents(v, S, { off: dropped });
        FI.drawScaleBar(v, 20);

        var counts = S.countByAgent(cloud);
        if (graph) {
          drawGraph(graph, dropped.map(function (d) { return d ? "dropped" : "present"; }),
            counts, { title: "fusion graph" });
        }

        var k = S.agents.length - 1;
        var alive = dropped.slice(1).filter(function (d) { return !d; }).length;
        if (ro) {
          ro.innerHTML =
            "<div class=\"fi-stat\"><span class=\"fi-stat-label\">Surviving collaborators</span>" +
            "<span class=\"fi-stat-value\">" + alive + " <span class=\"fi-of\">of " + k + "</span></span>" +
            "<span class=\"fi-stat-sub\">expected " + (k * (1 - p)).toFixed(1) + " at p = " + p.toFixed(2) + "</span></div>" +
            "<div class=\"fi-stat\"><span class=\"fi-stat-label\">Points fused</span>" +
            "<span class=\"fi-stat-value\">" + FI.fmt.n(cloud.n) + "</span>" +
            "<span class=\"fi-stat-sub\">ego contributes " + FI.fmt.n(counts[0]) + "</span></div>";
        }
        if (note) {
          var pAll = Math.pow(p, k);
          note.innerHTML = k === 1
            ? "With a single collaborator, every drop collapses the scene to single-agent perception. " +
              "At p = " + p.toFixed(2) + " that happens in <strong>" + FI.fmt.pct(pAll) +
              "</strong> of frames, and cooperative perception simply stops existing."
            : "With " + k + " collaborators, losing all of them at once takes p<sup>" + k +
              "</sup> = <strong>" + FI.fmt.pct(pAll) + "</strong> of frames. The rest of the time " +
              "the surviving agents still cover most of the scene, which is why AgentDrop stays mild. " +
              "Drag the agent count down to 2 to watch that safety net disappear.";
        }
      }

      FI.tierControl(document.querySelector(".fi-sev-host[data-inj=drop]"), inj, function (v) {
        sev = v; draw();
      });
      FI.numbersTable(document.querySelector(".fi-nums[data-inj=drop]"), inj);
      register(draw);
      draw();
    })();

    /* ==============================================================
       04 · MissingModality
       Same points removed, different graph. Two panels side by side so
       the only visible difference from §03 is where it actually is.
    ============================================================== */
    (function missingModality() {
      var canvas = document.getElementById("bev-modality");
      if (!canvas) return;
      var inj = FI.DATA.byKey("modality");
      var cloud = FI.makeCloud(8000);
      var sev = 0, roll = 0;
      var graph = document.getElementById("graph-modality");
      var ro = document.getElementById("ro-modality");

      var reroll = document.getElementById("modality-reroll");
      if (reroll) reroll.addEventListener("click", function () { roll++; draw(); });

      function draw() {
        var p = FI.PARAMS.drop.p[sev];
        var empty = FI.faults.bernoulli(S, p, FI.scene.seed + roll * 977);
        var v = FI.view(canvas, bevH(canvas, 220, 430, 0.78));

        S.compose(cloud, null, function (ai) { return empty[ai]; });
        FI.drawWorld(v, S);
        FI.drawPoints(v, cloud, "agent");
        FI.drawAgents(v, S, { off: empty });
        FI.drawScaleBar(v, 20);

        var counts = S.countByAgent(cloud);
        if (graph) {
          drawGraph(graph, empty.map(function (d) { return d ? "empty" : "present"; }),
            counts, { title: "fusion graph: every node still present", h: 150 });
        }
        var k = S.agents.length - 1;
        var n = empty.slice(1).filter(Boolean).length;
        if (ro) {
          ro.innerHTML =
            "<div class=\"fi-stat\"><span class=\"fi-stat-label\">Agents contributing nothing</span>" +
            "<span class=\"fi-stat-value\">" + n + " <span class=\"fi-of\">of " + k + "</span></span>" +
            "<span class=\"fi-stat-sub\">still in the fusion graph, still consuming attention</span></div>";
        }
      }

      FI.tierControl(document.querySelector(".fi-sev-host[data-inj=modality]"), inj, function (v) {
        sev = v; draw();
      });
      FI.numbersTable(document.querySelector(".fi-nums[data-inj=modality]"), inj);
      register(draw);
      draw();
    })();

    /* ==============================================================
       04b · The contrast figure
       Same p, same Bernoulli draw, two graphs, two sets of numbers.
       This is the most interesting comparison on the page.
    ============================================================== */
    (function contrast() {
      var gA = document.getElementById("graph-cmp-drop");
      var gB = document.getElementById("graph-cmp-modality");
      if (!gA || !gB) return;
      var barsEl = document.getElementById("cmp-bars");
      var tier = 2;

      var tabs = document.getElementById("cmp-tiers");
      if (tabs) FI.tabs(tabs, function (k) { tier = parseInt(k, 10); draw(); });

      function draw() {
        var p = FI.PARAMS.drop.p[tier];
        var hit = FI.faults.bernoulli(S, p, FI.scene.seed + 4242);
        var counts = new Array(S.agents.length).fill(0);
        var byA = S.countByAgent(S.compose(FI.makeCloud(8000), null, null));
        counts = byA;
        drawGraph(gA, hit.map(function (d) { return d ? "dropped" : "present"; }), counts,
          { title: "AgentDrop: the node leaves the graph", h: 132 });
        drawGraph(gB, hit.map(function (d) { return d ? "empty" : "present"; }), counts,
          { title: "MissingModality: the node stays, empty", h: 132 });

        if (barsEl) {
          var d = FI.DATA.byKey("drop"), m = FI.DATA.byKey("modality");
          var rows = [
            { name: "AgentDrop", v50: d.d50[tier - 1], v70: d.d70[tier - 1], c: "s3" },
            { name: "MissingModality", v50: m.d50[tier - 1], v70: m.d70[tier - 1], c: "s2" }
          ];
          var C = FI.colors();
          var max = 0.14;
          barsEl.innerHTML = rows.map(function (r) {
            return "<div class=\"fi-cmp-row\">" +
              "<span class=\"fi-cmp-name\" style=\"color:" + C[r.c] + "\">" + r.name + "</span>" +
              "<span class=\"fi-cmp-bar\"><i style=\"width:" +
                (Math.abs(r.v70) / max * 100).toFixed(1) + "%;background:" + C[r.c] + "\"></i></span>" +
              "<span class=\"fi-cmp-val\">" + FI.fmt.d(r.v70) + "</span>" +
              "<span class=\"fi-cmp-val fi-cmp-dim\">" + FI.fmt.d(r.v50) + "</span>" +
              "</div>";
          }).join("") +
          "<div class=\"fi-cmp-legend\">bars and first column are ΔAP@0.7, second column ΔAP@0.5, at p = " +
            p.toFixed(2) + "</div>" +
          "<p class=\"fi-cmp-gap\">MissingModality costs a further <strong>" +
            FI.fmt.f(Math.abs(m.d70[tier - 1]) - Math.abs(d.d70[tier - 1]), 3) +
            " AP@0.7</strong> than AgentDrop at the same p, even though the point clouds are identical.</p>";
        }
      }
      register(draw);
      draw();
    })();

    /* ==============================================================
       05 · PointsReduce
    ============================================================== */
    (function pointsReduce() {
      var canvas = document.getElementById("bev-points");
      if (!canvas) return;
      var inj = FI.DATA.byKey("points");
      var clean = FI.makeCloud(8000), thin = FI.makeCloud(8000);
      var sev = 0;
      var ro = document.getElementById("ro-points");

      function draw() {
        var keep = FI.PARAMS.points.keep[sev];
        var v = FI.view(canvas, bevH(canvas));
        S.compose(clean, null, null);
        FI.faults.reduce(clean, thin, keep, FI.scene.seed);

        FI.drawWorld(v, S);
        FI.drawPoints(v, thin, "agent", { size: sev > 0 ? 2.2 : 1.9 });
        FI.drawAgents(v, S);
        FI.drawScaleBar(v, 20);

        if (ro) {
          var byA = S.countByAgent(thin);
          var C = FI.colors();
          ro.innerHTML =
            "<div class=\"fi-stat\"><span class=\"fi-stat-label\">Points surviving</span>" +
            "<span class=\"fi-stat-value\">" + FI.fmt.n(thin.n) + "</span>" +
            "<span class=\"fi-stat-sub\">of " + FI.fmt.n(clean.n) + " clean, keeping " +
            FI.fmt.pct(keep) + "</span></div>" +
            "<div class=\"fi-bars\">" + byA.map(function (c, i) {
              return "<div class=\"fi-bar-row\"><span>" + (i === 0 ? "ego" : "A" + i) + "</span>" +
                "<span class=\"fi-bar\"><i style=\"width:" + (c / (byA[0] || 1) * 100).toFixed(0) +
                "%;background:" + C.agent[i] + "\"></i></span><span>" + FI.fmt.n(c) + "</span></div>";
            }).join("") + "</div>";
        }
      }

      FI.tierControl(document.querySelector(".fi-sev-host[data-inj=points]"), inj, function (v) {
        sev = v; draw();
      });
      FI.numbersTable(document.querySelector(".fi-nums[data-inj=points]"), inj);
      register(draw);
      draw();
    })();

    /* ==============================================================
       06 · LidarFog
       Points coloured by intensity, so the whole distribution visibly
       shifts hue as energy is absorbed. Relocated returns migrate
       toward their own sensor, animated.
    ============================================================== */
    (function fog() {
      var canvas = document.getElementById("bev-fog");
      if (!canvas) return;
      var inj = FI.DATA.byKey("fog");
      var clean = FI.makeCloud(8000), bad = FI.makeCloud(8000);
      var sev = 0;
      var ro = document.getElementById("ro-fog");
      var hist = document.getElementById("fog-hist");

      function drawHist(faulty) {
        if (!hist) return;
        var f = FI.fitCanvas(hist, 92);
        var ctx = f.ctx, C = FI.colors();
        ctx.clearRect(0, 0, f.w, f.h);
        var NBIN = 40;
        var hc = new Float32Array(NBIN), hf = new Float32Array(NBIN);
        var k;
        for (k = 0; k < clean.n; k++) hc[Math.min(NBIN - 1, Math.floor(clean.i[k] * NBIN))]++;
        for (k = 0; k < faulty.n; k++) hf[Math.min(NBIN - 1, Math.floor(faulty.i[k] * NBIN))]++;
        var max = 0;
        for (k = 0; k < NBIN; k++) max = Math.max(max, hc[k], hf[k]);
        if (!max) return;
        var bw = f.w / NBIN, base = f.h - 16;

        for (k = 0; k < NBIN; k++) {
          var q = Math.min(C.ramp.length - 1, Math.floor((k / NBIN) * C.ramp.length));
          ctx.fillStyle = C.ramp[q];
          var h = (hf[k] / max) * (base - 6);
          ctx.fillRect(k * bw, base - h, bw - 0.6, h);
        }
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        for (k = 0; k < NBIN; k++) {
          var y = base - (hc[k] / max) * (base - 6);
          if (k) ctx.lineTo(k * bw + bw / 2, y); else ctx.moveTo(k * bw + bw / 2, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.muted;
        ctx.font = FI.font(10);
        ctx.textAlign = "left";
        ctx.fillText("intensity 0", 2, f.h - 3);
        ctx.textAlign = "right";
        ctx.fillText("1", f.w - 2, f.h - 3);
        ctx.textAlign = "center";
        ctx.fillText("dashed outline is the clean distribution", f.w / 2, f.h - 3);
      }

      var lastT = 0;

      function draw(tms) {
        if (tms !== null && tms !== undefined) lastT = tms;
        var v = FI.view(canvas, bevH(canvas));
        var C = FI.colors();
        var ph = 1;
        if (sev > 0 && !FI.reducedMotion && play.on) {
          ph = 0.5 - 0.5 * Math.cos((lastT / 1000) * 1.1);
          ph = 0.25 + 0.75 * ph;
        }
        S.compose(clean, null, null);
        FI.faults.fog(clean, bad, S, sev, FI.scene.seed, ph);

        FI.drawWorld(v, S);
        FI.drawPoints(v, bad, "intensity");
        FI.drawAgents(v, S);
        FI.drawScaleBar(v, 20);
        FI.drawCaption(v, [{
          text: sev === 0 ? "clean returns, intensity near 0.94"
                          : "returns absorbed and pulled back toward each sensor",
          color: sev === 0 ? C.muted : C.warn
        }]);

        drawHist(bad);

        if (ro) {
          var mi = S.meanIntensity(bad);
          var moved = 0;
          for (var k = 0; k < bad.n; k++) if (bad.s[k] === FI.ST.MOVED) moved++;
          ro.innerHTML =
            "<div class=\"fi-stat\"><span class=\"fi-stat-label\">Mean intensity</span>" +
            "<span class=\"fi-stat-value\">" + mi.toFixed(2) + "</span>" +
            "<span class=\"fi-stat-sub\">" + (sev === 0 ? "no fog injected"
              : "clean 0.94, measured target " + inj.extra.values[sev - 1].toFixed(2)) +
            "</span></div>" +
            "<div class=\"fi-stat\"><span class=\"fi-stat-label\">Returns relocated</span>" +
            "<span class=\"fi-stat-value\">" + FI.fmt.pct(bad.n ? moved / bad.n : 0) + "</span>" +
            "<span class=\"fi-stat-sub\">landing short of the true surface</span></div>";
        }
      }

      var loop = FI.raf(canvas, draw);
      var play = playButton(document.getElementById("fog-play"), loop);
      FI.tierControl(document.querySelector(".fi-sev-host[data-inj=fog]"), inj, function (v) {
        sev = v;
        draw();
      });
      FI.numbersTable(document.querySelector(".fi-nums[data-inj=fog]"), inj);
      register(function () { draw(); });
      draw(0);
      if (!FI.reducedMotion) play.set(true);
    })();

    /* ==============================================================
       07 · LidarSnow
       Per-point status colouring, plus the mechanism chart: removal
       falls while damage rises, so removal is not what does the harm.
    ============================================================== */
    (function snow() {
      var canvas = document.getElementById("bev-snow");
      if (!canvas) return;
      var inj = FI.DATA.byKey("snow");
      var clean = FI.makeCloud(8000), bad = FI.makeCloud(14000);
      var sev = 0, roll = 0;
      var ro = document.getElementById("ro-snow");

      var reroll = document.getElementById("snow-reroll");
      if (reroll) reroll.addEventListener("click", function () { roll++; draw(); });

      function draw() {
        var v = FI.view(canvas, bevH(canvas));
        var C = FI.colors();
        S.compose(clean, null, null);
        FI.faults.snow(clean, bad, S, sev, FI.scene.seed + roll * 613);

        FI.drawWorld(v, S);
        FI.drawPoints(v, bad, "status");
        FI.drawAgents(v, S);
        FI.drawScaleBar(v, 20);

        if (ro) {
          var st = bad.stats;
          ro.innerHTML =
            "<div class=\"fi-legend\">" +
              "<span><i style=\"background:" + C.s1 + "\"></i>unchanged</span>" +
              "<span><i style=\"background:" + C.s4 + "\"></i>attenuated</span>" +
              "<span><i style=\"background:" + C.crit + "\"></i>added scatter</span>" +
            "</div>" +
            "<div class=\"fi-stat-row\">" +
              "<div class=\"fi-stat\"><span class=\"fi-stat-label\">Removed</span>" +
              "<span class=\"fi-stat-value\">" + FI.fmt.pct(st.base ? st.removed / st.base : 0) + "</span>" +
              "<span class=\"fi-stat-sub\">" + FI.fmt.n(st.removed) + " points</span></div>" +
              "<div class=\"fi-stat\"><span class=\"fi-stat-label\">Added</span>" +
              "<span class=\"fi-stat-value fi-bad\">" + FI.fmt.pct(st.base ? st.added / st.base : 0) + "</span>" +
              "<span class=\"fi-stat-sub\">" + FI.fmt.n(st.added) + " points</span></div>" +
            "</div>";
        }
      }

      FI.tierControl(document.querySelector(".fi-sev-host[data-inj=snow]"), inj, function (v) {
        sev = v; draw();
      });
      FI.numbersTable(document.querySelector(".fi-nums[data-inj=snow]"), inj);
      register(draw);
      draw();
    })();

    /* --- the snow mechanism chart (two lines, two axes) ---------- */
    (function snowMechanism() {
      var host = document.getElementById("snow-mech");
      if (!host) return;
      var inj = FI.DATA.byKey("snow");

      function draw() {
        var C = FI.colors();
        var W = 640, H = 300, m = { t: 26, r: 62, b: 46, l: 62 };
        var iw = W - m.l - m.r, ih = H - m.t - m.b;
        host.innerHTML = "";
        var svg = FI.svg("svg", {
          viewBox: "0 0 " + W + " " + H, role: "img",
          "aria-label": "Two lines over the three snow severity tiers. The fraction of " +
            "points removed falls from 0.399 to 0.323 to 0.290 while the AP at 0.7 " +
            "degradation grows from 0.394 to 0.404 to 0.448. Removal volume falls as " +
            "damage rises, so the damage cannot be caused by removal."
        }, host);

        var rem = inj.extra.values;                 /* 0.399, 0.323, 0.290 */
        var dmg = inj.d70.map(Math.abs);            /* 0.394, 0.404, 0.448 */
        var remLo = 0.25, remHi = 0.45;
        var dmgLo = 0.35, dmgHi = 0.48;

        function px(i) { return m.l + (i / 2) * iw; }
        function pyL(v) { return m.t + ih - ((v - remLo) / (remHi - remLo)) * ih; }
        function pyR(v) { return m.t + ih - ((v - dmgLo) / (dmgHi - dmgLo)) * ih; }

        /* grid + tier labels */
        [0, 1, 2].forEach(function (i) {
          FI.svg("line", { x1: px(i), x2: px(i), y1: m.t, y2: m.t + ih,
            stroke: C.grid, "stroke-width": 1 }, svg);
          FI.svg("text", { x: px(i), y: H - m.b + 20, "text-anchor": "middle",
            "font-size": 12, fill: C.ink2, "font-family": "inherit" }, svg)
            .textContent = FI.DATA.tiers[i];
          FI.svg("text", { x: px(i), y: H - m.b + 34, "text-anchor": "middle",
            "font-size": 10, fill: C.muted, "font-family": "inherit" }, svg)
            .textContent = "severity " + (i + 1);
        });

        /* axes */
        [0.25, 0.30, 0.35, 0.40, 0.45].forEach(function (v) {
          FI.svg("text", { x: m.l - 10, y: pyL(v) + 4, "text-anchor": "end",
            "font-size": 10, fill: C.s3, "font-family": "inherit" }, svg)
            .textContent = v.toFixed(2);
        });
        [0.36, 0.40, 0.44, 0.48].forEach(function (v) {
          FI.svg("text", { x: W - m.r + 10, y: pyR(v) + 4, "text-anchor": "start",
            "font-size": 10, fill: C.crit, "font-family": "inherit" }, svg)
            .textContent = v.toFixed(2);
        });
        FI.svg("text", { x: 14, y: m.t + ih / 2, "text-anchor": "middle", "font-size": 11,
          fill: C.s3, "font-family": "inherit",
          transform: "rotate(-90 14 " + (m.t + ih / 2) + ")" }, svg)
          .textContent = "fraction of points removed";
        FI.svg("text", { x: W - 12, y: m.t + ih / 2, "text-anchor": "middle", "font-size": 11,
          fill: C.crit, "font-family": "inherit",
          transform: "rotate(90 " + (W - 12) + " " + (m.t + ih / 2) + ")" }, svg)
          .textContent = "AP@0.7 lost";

        function series(vals, mapY, color, dashed) {
          var d = vals.map(function (v, i) {
            return (i ? "L" : "M") + px(i).toFixed(1) + " " + mapY(v).toFixed(1);
          }).join(" ");
          var p = FI.svg("path", { d: d, fill: "none", stroke: color, "stroke-width": 2.4,
            "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
          if (dashed) p.setAttribute("stroke-dasharray", "6 4");
          vals.forEach(function (v, i) {
            FI.svg("circle", { cx: px(i), cy: mapY(v), r: 4.5, fill: color,
              stroke: C.surface, "stroke-width": 2 }, svg);
            FI.svg("text", { x: px(i), y: mapY(v) - 12, "text-anchor": "middle",
              "font-size": 11, fill: color, "font-family": "inherit" }, svg)
              .textContent = v.toFixed(3);
          });
          if (!FI.reducedMotion) {
            var len = p.getTotalLength();
            p.style.strokeDasharray = dashed ? len : len;
            p.style.strokeDashoffset = len;
            p.getBoundingClientRect();
            p.style.transition = "stroke-dashoffset 1s ease";
            p.style.strokeDashoffset = "0";
          }
        }
        series(rem, pyL, C.s3, true);
        series(dmg, pyR, C.crit, false);

        FI.svg("text", { x: m.l, y: 16, "font-size": 11, fill: C.s3,
          "font-family": "inherit" }, svg).textContent = "removed (dashed, left axis)";
        FI.svg("text", { x: W - m.r, y: 16, "text-anchor": "end", "font-size": 11,
          fill: C.crit, "font-family": "inherit" }, svg)
          .textContent = "AP@0.7 lost (solid, right axis)";
      }
      register(draw);
      draw();
    })();

    /* ==============================================================
       08 · RANKING
       All seven at one tier, sorted by damage. Grouped so the headline
       reads off the chart: agent loss is cheap, corrupted data is not.
    ============================================================== */
    (function ranking() {
      var host = document.getElementById("rank-chart");
      if (!host) return;
      var tier = 3, metric = "d70";

      var tt = document.getElementById("rank-tiers");
      if (tt) FI.tabs(tt, function (k) { tier = parseInt(k, 10); draw(); });
      var mt = document.getElementById("rank-metric");
      if (mt) FI.tabs(mt, function (k) { metric = k; draw(); });

      function draw() {
        var C = FI.colors();
        var rows = FI.DATA.injectors.map(function (inj) {
          var arr = inj[metric];
          return {
            key: inj.key, name: inj.name,
            v: arr ? arr[tier - 1] : null,
            unit: inj.units[tier - 1],
            family: (inj.key === "drop" || inj.key === "modality") ? "loss" : "corrupt"
          };
        });
        rows.sort(function (a, b) {
          if (a.v === null) return 1;
          if (b.v === null) return -1;
          return Math.abs(b.v) - Math.abs(a.v);
        });
        var max = 0.70;

        host.innerHTML = rows.map(function (r) {
          if (r.v === null) {
            return "<a class=\"fi-rank-row is-na\" href=\"#inj-" + r.key + "\">" +
              "<span class=\"fi-rank-name\">" + r.name + "</span>" +
              "<span class=\"fi-rank-bar\"></span>" +
              "<span class=\"fi-rank-val fi-na\">not recorded</span></a>";
          }
          var w = (Math.abs(r.v) / max) * 100;
          var col = r.family === "loss" ? C.s3 : C.crit;
          return "<a class=\"fi-rank-row\" href=\"#inj-" + r.key + "\" " +
            "aria-label=\"" + r.name + ", " + FI.fmt.d(r.v) + " at " + r.unit +
            ". Jump to its section.\">" +
            "<span class=\"fi-rank-name\">" + r.name +
              "<span class=\"fi-rank-unit\">" + r.unit + "</span></span>" +
            "<span class=\"fi-rank-bar\"><i style=\"width:" + w.toFixed(1) +
              "%;background:" + col + "\"></i></span>" +
            "<span class=\"fi-rank-val\">" + FI.fmt.d(r.v) + "</span></a>";
        }).join("");

        var lab = document.getElementById("rank-key");
        if (lab) {
          lab.innerHTML =
            "<span><i style=\"background:" + C.s3 + "\"></i>losing a collaborator</span>" +
            "<span><i style=\"background:" + C.crit + "\"></i>receiving corrupted data</span>" +
            "<span class=\"fi-rank-scale\">bar length is |Δ| against a 0.70 full scale</span>";
        }
      }
      register(draw);
      draw();
    })();

    /* ==============================================================
       NOT INJECTED: cards generated from the same data object
    ============================================================== */
    (function notInjected() {
      var host = document.getElementById("not-injected");
      if (!host) return;
      host.innerHTML = FI.DATA.notInjected.map(function (x) {
        return "<div class=\"fi-card fi-card-out\"><h3>" + x.name + "</h3><p>" + x.why + "</p></div>";
      }).join("");
    })();

    /* ==============================================================
       OPTIONAL REAL-DATA TOGGLES
       Appear only for injectors that have an entry in
       real/manifest.json. Without the file, nothing changes.
    ============================================================== */
    FI.real.onLoad(function () {
      FI.DATA.injectors.forEach(function (inj) {
        if (!FI.real.has(inj.key)) return;
        var host = document.querySelector(".fi-real-host[data-inj=" + inj.key + "]");
        if (!host) return;
        host.hidden = false;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fi-ctl-text";
        btn.textContent = "Show exported cluster frame";
        btn.setAttribute("aria-pressed", "false");
        var box = document.createElement("div");
        box.className = "fi-real-box";
        box.hidden = true;
        host.appendChild(btn);
        host.appendChild(box);
        btn.addEventListener("click", function () {
          var on = btn.getAttribute("aria-pressed") === "true";
          btn.setAttribute("aria-pressed", on ? "false" : "true");
          box.hidden = on;
          if (!on && !box.dataset.built) {
            var sevSel = document.getElementById("sev-" + inj.key);
            var tier = sevSel ? parseInt(sevSel.value, 10) : 3;
            var asset = FI.real.get(inj.key, tier) || FI.real.get(inj.key, 3);
            if (!asset) { box.innerHTML = "<p class=\"fi-note\">No clip for this tier.</p>"; return; }
            box.innerHTML = asset.type === "video"
              ? "<video src=\"" + asset.src + "\" controls loop muted playsinline " +
                (asset.poster ? "poster=\"" + asset.poster + "\" " : "") + "></video>"
              : "<img src=\"" + asset.src + "\" alt=\"" + (asset.alt || "Exported frame") + "\">";
            box.innerHTML += "<p class=\"fi-note\">" + (asset.caption || "Exported from the cluster.") + "</p>";
            box.dataset.built = "1";
          }
        });
      });
    });
  });
})();
