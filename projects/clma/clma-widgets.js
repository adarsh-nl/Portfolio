/* ==================================================================
   clma-widgets.js — every interactive figure except the simulator.

   Each widget is an isolated IIFE that:
     - reads theme colors via CLMA.colors() at draw time,
     - re-draws on CLMA.onThemeChange,
     - pauses its loop offscreen via CLMA.raf,
     - degrades to a meaningful static frame under reduced motion.
================================================================== */
(function () {
  "use strict";
  var C = window.CLMA;

  document.addEventListener("DOMContentLoaded", function () {

    /* ==============================================================
       HERO — federated fleet, drift, cohorting (ambient preview)
       Ten clients orbit a server. Packets flow in rounds; sometimes
       a client "drifts" (red pulse), then gets re-cohorted (recolor).
       A silent 12-second preview of the entire paper.
    ============================================================== */
    (function hero() {
      var canvas = document.getElementById("hero-net");
      if (!canvas) return;
      var N = 10;

      function layout() {
        var f = C.fitCanvas(canvas, 240);
        return f;
      }

      /* per-client state: cohort 0 = base; phase offsets for packets */
      var state = Array.apply(null, Array(N)).map(function (_, i) {
        return { cohort: 0, drift: 0 };
      });
      /* scripted loop: [tStart(s), fn] events over a 12 s cycle */
      var CYCLE = 12;

      function draw(tms) {
        var t = (tms / 1000) % CYCLE;
        var f = layout(), ctx = f.ctx, col = C.colors();
        var cx = f.w / 2, cy = f.h / 2 + 6;
        var rx = Math.min(f.w * 0.4, 320), ry = f.h * 0.36;
        ctx.clearRect(0, 0, f.w, f.h);

        /* script: 0-3 s normal round · 3.5 s two clients drift ·
           5-7 s quarantine+recohort · 7-11 s cohort rounds · reset */
        var driftSet = [2, 6], driftSet2 = [3, 7];
        state.forEach(function (s, i) {
          s.drift = 0; s.cohort = 0;
          var isDrift = driftSet.indexOf(i) >= 0, isDrift2 = driftSet2.indexOf(i) >= 0;
          if (t > 3.2 && t < 6 && (isDrift || isDrift2)) s.drift = Math.min(1, (t - 3.2) / 0.6);
          if (t >= 6 && (isDrift || isDrift2)) s.cohort = isDrift ? 1 : 2;
          if (t >= 6 && t < 6.8 && (isDrift || isDrift2)) s.drift = 1 - (t - 6) / 0.8;
        });

        var pos = [];
        for (var i = 0; i < N; i++) {
          var a = (i / N) * Math.PI * 2 - Math.PI / 2;
          pos.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
        }

        /* links + packets */
        var phase = t % 3;                     /* a round every 3 s */
        var out = phase < 1.5;                 /* broadcast, then upload */
        var pt = C.ease((phase % 1.5) / 1.5);
        for (i = 0; i < N; i++) {
          var cohortCol = [col.s1, col.s2, col.s5][state[i].cohort];
          ctx.strokeStyle = col.grid;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(pos[i][0], pos[i][1]);
          ctx.stroke();
          if (!C.reducedMotion) {
            var k = out ? pt : 1 - pt;
            var pxp = C.lerp(cx, pos[i][0], k), pyp = C.lerp(cy, pos[i][1], k);
            ctx.fillStyle = cohortCol;
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.arc(pxp, pyp, 2.4, 0, 7);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }

        /* clients */
        for (i = 0; i < N; i++) {
          var s = state[i];
          var cc = [col.s1, col.s2, col.s5][s.cohort];
          if (s.drift > 0) {
            ctx.strokeStyle = col.crit;
            ctx.globalAlpha = s.drift * 0.8;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pos[i][0], pos[i][1], 11 + s.drift * 4, 0, 7);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = cc;
          ctx.beginPath();
          ctx.arc(pos[i][0], pos[i][1], 7, 0, 7);
          ctx.fill();
        }

        /* server */
        ctx.fillStyle = col.surface2;
        ctx.strokeStyle = col.axis;
        ctx.lineWidth = 1.5;
        var sw = 46, sh = 30;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx - sw / 2, cy - sh / 2, sw, sh, 6);
        else ctx.rect(cx - sw / 2, cy - sh / 2, sw, sh);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = col.ink2;
        ctx.font = C.font(11);
        ctx.textAlign = "center";
        ctx.fillText("server", cx, cy + 4);
      }

      var loop = C.raf(canvas, draw);
      draw(4200);                       /* static first paint either way */
      if (!C.reducedMotion) loop.start();
      C.onThemeChange(function () { if (C.reducedMotion) draw(4200); });
      window.addEventListener("resize", function () { if (C.reducedMotion) draw(4200); });
    })();

    /* ==============================================================
       FL PRIMER — one round in four phases (SVG, stepped/looped)
    ============================================================== */
    (function flPrimer() {
      var svg = document.getElementById("fl-svg");
      if (!svg) return;
      var caption = document.getElementById("fl-caption");
      var CAPS = [
        "1 · The server broadcasts the current global model W to every client.",
        "2 · Each client runs gradient descent on its own private data — data never leaves.",
        "3 · Clients upload only their updated weights Wₙ (and nothing else).",
        "4 · The server averages the weights, weighted by data size, into a new global model."
      ];
      var W = 640, H = 300;
      var srv = { x: 320, y: 52 };
      var clients = [90, 245, 400, 555].map(function (x) { return { x: x, y: 232 }; });

      var phase = 0, t = 0, playing = false, SPEED = 1 / 2200;

      function build() { svg.innerHTML = ""; }

      function draw() {
        var col = C.colors();
        svg.innerHTML = "";
        /* links */
        clients.forEach(function (c) {
          C.svg("line", { x1: srv.x, y1: srv.y + 24, x2: c.x, y2: c.y - 26,
            stroke: col.grid, "stroke-width": 1.5 }, svg);
        });
        /* server */
        var g = C.svg("g", {}, svg);
        C.svg("rect", { x: srv.x - 55, y: srv.y - 24, width: 110, height: 48, rx: 9,
          fill: phase === 3 ? col.halo : col.surface2, stroke: phase === 3 ? col.s1 : col.axis,
          "stroke-width": 1.5 }, g);
        C.svg("text", { x: srv.x, y: srv.y - 1, "text-anchor": "middle", "font-size": 13,
          fill: col.ink, "font-family": "inherit" }, g).textContent = "Server";
        C.svg("text", { x: srv.x, y: srv.y + 15, "text-anchor": "middle", "font-size": 11,
          fill: col.muted, "font-family": "inherit" }, g).textContent = "global model W";

        /* clients */
        clients.forEach(function (c, i) {
          var active = phase === 1;
          C.svg("rect", { x: c.x - 52, y: c.y - 26, width: 104, height: 62, rx: 9,
            fill: active ? col.halo : col.surface2, stroke: active ? col.s1 : col.axis,
            "stroke-width": 1.5 }, svg);
          C.svg("text", { x: c.x, y: c.y - 6, "text-anchor": "middle", "font-size": 12,
            fill: col.ink, "font-family": "inherit" }, svg).textContent = "Client " + (i + 1);
          /* private data drum */
          C.svg("ellipse", { cx: c.x - 22, cy: c.y + 16, rx: 15, ry: 6,
            fill: "none", stroke: col.muted, "stroke-width": 1.2 }, svg);
          C.svg("text", { x: c.x + 8, y: c.y + 20, "text-anchor": "middle", "font-size": 10,
            fill: col.muted, "font-family": "inherit" }, svg).textContent = "private data";
          /* local training progress bar */
          if (phase === 1) {
            var pw = 74 * C.ease(t);
            C.svg("rect", { x: c.x - 37, y: c.y + 26, width: 74, height: 4, rx: 2, fill: col.grid }, svg);
            C.svg("rect", { x: c.x - 37, y: c.y + 26, width: pw, height: 4, rx: 2, fill: col.s1 }, svg);
          }
        });

        /* packets */
        if (phase === 0 || phase === 2) {
          var down = phase === 0;
          clients.forEach(function (c) {
            var k = C.ease(t);
            var x0 = down ? srv.x : c.x, y0 = down ? srv.y + 24 : c.y - 26;
            var x1 = down ? c.x : srv.x, y1 = down ? c.y - 26 : srv.y + 24;
            var x = C.lerp(x0, x1, k), y = C.lerp(y0, y1, k);
            C.svg("rect", { x: x - 6, y: y - 6, width: 12, height: 12, rx: 3,
              fill: down ? col.s1 : col.s2, opacity: 0.9 }, svg);
          });
        }
        /* aggregation animation: four chips merging into one */
        if (phase === 3) {
          var k2 = C.ease(t);
          clients.forEach(function (c, i) {
            var x = C.lerp(srv.x - 36 + i * 24, srv.x, k2);
            var y = C.lerp(srv.y + 40, srv.y + 34, k2);
            C.svg("rect", { x: x - 6, y: y - 6, width: 12, height: 12, rx: 3,
              fill: col.s2, opacity: 1 - k2 * 0.75 }, svg);
          });
          C.svg("circle", { cx: srv.x, cy: srv.y + 34, r: 4 + 5 * k2, fill: col.s1,
            opacity: 0.4 + 0.6 * k2 }, svg);
        }
      }

      var tabs = C.tabs(document.getElementById("fl-steps"), function (step) {
        phase = +step; t = 1; playing = false; sync(); draw();
      });

      var playBtn = document.getElementById("fl-play");
      function sync() {
        playBtn.classList.toggle("is-playing", playing);
        playBtn.innerHTML = playing ? "&#10074;&#10074;" : "&#9654;";
        playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
        tabs.highlight(phase);
        caption.textContent = CAPS[phase];
      }

      var last = 0;
      var loop = C.raf(svg, function (now) {
        if (!last) last = now;
        var dt = now - last; last = now;
        if (playing) {
          t += dt * SPEED;
          if (t >= 1) { t = 0; phase = (phase + 1) % 4; sync(); }
          draw();
        }
      });

      playBtn.addEventListener("click", function () {
        playing = !playing;
        if (playing && C.reducedMotion) { /* stepped mode instead */
          playing = false;
          phase = (phase + 1) % 4; t = 1; draw();
        }
        last = 0; sync();
        if (playing) loop.start();
      });
      document.getElementById("fl-fwd").addEventListener("click", function () {
        playing = false; phase = (phase + 1) % 4; t = 1; sync(); draw();
      });
      document.getElementById("fl-back").addEventListener("click", function () {
        playing = false; phase = (phase + 3) % 4; t = 1; sync(); draw();
      });

      build(); t = 1; sync(); draw();
      C.onThemeChange(draw);
    })();

    /* ==============================================================
       DRIFT PLAYGROUND — covariate vs concept drift on a frozen model
    ============================================================== */
    (function driftPlayground() {
      var canvas = document.getElementById("drift-canvas");
      if (!canvas) return;
      var rng = C.rng(20241218);
      var NPTS = 130;

      /* Features loosely follow PRONTO's air/water flow ranges.
         True label = side of the (movable) true boundary. The frozen
         model keeps the ORIGINAL boundary forever. */
      var pts = [];
      for (var i = 0; i < NPTS; i++) {
        pts.push({ ax: 15 + rng() * 55, wx: 0.4 + rng() * 3.2, flip: rng() });
      }
      var cur = { cov: 0, con: 0, noise: 0 };      /* rendered values  */
      var tgt = { cov: 0, con: 0, noise: 0 };      /* slider targets   */

      /* boundary: water = m*air + b  (original); concept drift shifts b */
      var M0 = -0.045, B0 = 3.6;

      function trueLabel(p, con) {
        var b = B0 - con * 1.15;                  /* concept moves the answer key */
        return p.wx > M0 * p.ax + b ? 1 : 0;      /* 1 = Slugging, 0 = Normal */
      }
      function frozenPred(p, cov) {
        var ax = p.ax + cov * 16;                  /* covariate moves the data */
        return p.wx > M0 * ax + B0 ? 1 : 0;
      }

      function metrics(st) {
        var tp = 0, fp = 0, fn = 0, tn = 0;
        pts.forEach(function (p) {
          var y = trueLabel(p, st.con);
          if (p.flip < st.noise * 0.25) y = 1 - y;
          var yh = frozenPred(p, st.cov);
          if (y && yh) tp++; else if (!y && yh) fp++;
          else if (y && !yh) fn++; else tn++;
        });
        var prec = tp / Math.max(1, tp + fp), rec = tp / Math.max(1, tp + fn);
        var f1 = (prec + rec) ? 2 * prec * rec / (prec + rec) : 0;
        /* macro-ish blend so the empty-class edge cases stay sane */
        var acc = (tp + tn) / NPTS;
        return Math.min(1, 0.5 * f1 + 0.5 * acc);
      }

      function draw() {
        var f = C.fitCanvas(canvas, Math.max(300, canvas.clientWidth * 0.72));
        var ctx = f.ctx, col = C.colors();
        var m = { l: 46, r: 12, t: 10, b: 56 };
        var iw = f.w - m.l - m.r, ih = f.h - m.t - m.b;
        function X(ax) { return m.l + ((ax - 10) / 80) * iw; }
        function Y(wx) { return m.t + ih - ((wx - 0) / 4.4) * ih; }
        ctx.clearRect(0, 0, f.w, f.h);

        /* axes */
        ctx.strokeStyle = col.axis; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, m.t + ih); ctx.lineTo(m.l + iw, m.t + ih);
        ctx.stroke();
        ctx.fillStyle = col.muted; ctx.font = C.font(11); ctx.textAlign = "center";
        ctx.fillText("Air flow rate", m.l + iw / 2, f.h - 30);
        ctx.save();
        ctx.translate(14, m.t + ih / 2); ctx.rotate(-Math.PI / 2);
        ctx.fillText("Water flow rate", 0, 0);
        ctx.restore();

        /* marginal P(x) strip just below the axis — shows covariate shift */
        var bins = new Array(24).fill(0);
        pts.forEach(function (p) {
          var ax = p.ax + cur.cov * 16;
          var bi = C.clamp(Math.floor(((ax - 10) / 80) * 24), 0, 23);
          bins[bi]++;
        });
        var bmax = Math.max.apply(null, bins);
        ctx.fillStyle = col.muted;
        ctx.globalAlpha = 0.45;
        bins.forEach(function (b, bi) {
          var bw = iw / 24;
          var bh = (b / bmax) * 14;
          ctx.fillRect(m.l + bi * bw + 1, m.t + ih + 4, bw - 2, bh);
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = col.muted;
        ctx.textAlign = "left";
        ctx.fillText("P(x)", m.l - 34, m.t + ih + 15);

        /* clip boundaries + points to the plot area */
        ctx.save();
        ctx.beginPath();
        ctx.rect(m.l, m.t, iw, ih);
        ctx.clip();

        /* true boundary (only when concept drifted) */
        var bTrue = B0 - cur.con * 1.15;
        if (Math.abs(cur.con) > 0.02) {
          ctx.strokeStyle = col.s5;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(X(10), Y(M0 * 10 + bTrue));
          ctx.lineTo(X(90), Y(M0 * 90 + bTrue));
          ctx.stroke();
          ctx.fillStyle = col.s5; ctx.font = C.font(11);
          ctx.fillText("new true boundary", X(12), Y(M0 * 12 + bTrue) - 6);
        }

        /* frozen model boundary */
        ctx.strokeStyle = col.ink;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(X(10), Y(M0 * 10 + B0));
        ctx.lineTo(X(90), Y(M0 * 90 + B0));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col.ink2; ctx.font = C.font(11);
        ctx.fillText("frozen model boundary", X(46), Y(M0 * 46 + B0) - 8);

        /* points */
        pts.forEach(function (p) {
          var y = trueLabel(p, cur.con);
          if (p.flip < cur.noise * 0.25) y = 1 - y;
          var wrong = frozenPred(p, cur.cov) !== y;
          var px = X(p.ax + cur.cov * 16), py = Y(p.wx);
          ctx.fillStyle = y ? col.s2 : col.s1;
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.arc(px, py, 3.4, 0, 7);
          ctx.fill();
          ctx.globalAlpha = 1;
          if (wrong) {
            ctx.strokeStyle = col.crit;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(px, py, 5.6, 0, 7);
            ctx.stroke();
          }
        });

        ctx.restore();

        /* legend */
        ctx.font = C.font(11);
        ctx.fillStyle = col.s1; ctx.fillText("● Normal", m.l + 8, m.t + 14);
        ctx.fillStyle = col.s2; ctx.fillText("● Slugging", m.l + 74, m.t + 14);
        ctx.fillStyle = col.crit; ctx.fillText("○ misclassified", m.l + 156, m.t + 14);
      }

      var f1El = document.getElementById("drift-f1");
      var f1Bar = document.getElementById("drift-f1-bar");
      var noteEl = document.getElementById("drift-note");

      function updateReadout() {
        var f1 = metrics(tgt);
        var col = C.colors();
        f1El.textContent = f1.toFixed(2);
        f1Bar.style.width = (f1 * 100).toFixed(0) + "%";
        f1Bar.style.background = f1 > 0.85 ? col.good : (f1 > 0.65 ? col.warn : col.crit);
        var msgs = [];
        if (tgt.cov > 0.08) msgs.push("P(x) shifted — the same faults now show up at different sensor readings");
        if (tgt.con > 0.08) msgs.push("P(y|x) moved — readings the model calls Normal are now labelled Slugging");
        if (tgt.noise > 0.08) msgs.push("labels are noisy — engineers relabelled a fraction of points");
        noteEl.textContent = msgs.length
          ? "Drift active: " + msgs.join("; ") + ". The frozen model never moved — its mistakes are circled."
          : "The model is perfect on the data it was trained on.";
      }

      /* smooth tween toward slider targets */
      var loop = C.raf(canvas, function () {
        var done = true;
        ["cov", "con", "noise"].forEach(function (k) {
          var d = tgt[k] - cur[k];
          if (Math.abs(d) > 0.004) { cur[k] += d * 0.16; done = false; }
          else cur[k] = tgt[k];
        });
        draw();
        if (done) loop.stop();
      });

      function setTargets() {
        tgt.cov = +document.getElementById("drift-cov").value / 100;
        tgt.con = +document.getElementById("drift-con").value / 100;
        tgt.noise = +document.getElementById("drift-noise").value / 100;
        if (C.reducedMotion) { cur.cov = tgt.cov; cur.con = tgt.con; cur.noise = tgt.noise; draw(); }
        else loop.start();
        updateReadout();
      }
      ["drift-cov", "drift-con", "drift-noise"].forEach(function (id) {
        document.getElementById(id).addEventListener("input", setTargets);
      });
      document.querySelectorAll("#w-drift .clma-presets button").forEach(function (b) {
        b.addEventListener("click", function () {
          var p = b.dataset.preset;
          document.getElementById("drift-cov").value = (p === "cov" || p === "both") ? 75 : 0;
          document.getElementById("drift-con").value = (p === "con" || p === "both") ? 75 : 0;
          document.getElementById("drift-noise").value = 0;
          setTargets();
        });
      });

      draw(); updateReadout();
      C.onThemeChange(function () { draw(); updateReadout(); });
      window.addEventListener("resize", draw);
    })();

    /* ==============================================================
       STAGGER GRID — drift staggered across time and space
    ============================================================== */
    (function stagger() {
      var svg = document.getElementById("stagger-svg");
      if (!svg) return;
      var N = 10, R = 10;
      /* type per (client,round): null | key into TYPES */
      var TYPES = {
        covP: { color: "s2", label: "covariate drift (mean +)" },
        covM: { color: "s4", label: "covariate drift (mean −)" },
        conA: { color: "s5", label: "concept drift (boundary A)" },
        conB: { color: "s6", label: "concept drift (boundary B)" }
      };
      var events = {};                          /* "c,r" -> type key */
      [3, 5, 7, 9].forEach(function (r, ri) {
        for (var c = 0; c < 8; c++) {
          var key = (c < 4)
            ? (ri % 2 ? "conA" : "covP")
            : (ri % 2 ? "conB" : "covM");
          events[c + "," + r] = key;
        }
      });

      var sweep = R + 1;                        /* fully revealed by default */

      function draw() {
        var col = C.colors();
        svg.innerHTML = "";
        var W = 640, H = 320, m = { l: 84, t: 30, r: 12, b: 34 };
        var cw = (W - m.l - m.r) / R, ch = (H - m.t - m.b) / N;

        for (var c = 0; c < N; c++) {
          C.svg("text", { x: m.l - 10, y: m.t + c * ch + ch / 2 + 4, "text-anchor": "end",
            "font-size": 11.5, fill: c >= 8 ? col.good : col.muted, "font-family": "inherit" }, svg)
            .textContent = "Client " + (c + 1) + (c >= 8 ? " ✓" : "");
        }
        for (var r = 1; r <= R; r++) {
          C.svg("text", { x: m.l + (r - 1) * cw + cw / 2, y: H - m.b + 18, "text-anchor": "middle",
            "font-size": 11.5, fill: col.muted, "font-family": "inherit" }, svg).textContent = r;
        }
        C.svg("text", { x: m.l + (W - m.l - m.r) / 2, y: H - 2, "text-anchor": "middle",
          "font-size": 12, fill: col.ink2, "font-family": "inherit" }, svg)
          .textContent = "Communication round →";
        C.svg("text", { x: m.l, y: 16, "font-size": 12, fill: col.ink2,
          "font-family": "inherit" }, svg).textContent = "";

        for (c = 0; c < N; c++) {
          for (r = 1; r <= R; r++) {
            var x = m.l + (r - 1) * cw + 2, y = m.t + c * ch + 2;
            var e = events[c + "," + r];
            var revealed = r <= sweep;
            var cell = C.svg("rect", {
              x: x, y: y, width: cw - 4, height: ch - 4, rx: 4,
              fill: revealed && e ? col[TYPES[e].color] : col.surface2,
              stroke: col.border, "stroke-width": 1,
              opacity: revealed ? (e ? 0.92 : 0.75) : 0.25
            }, svg);
            (function (cc, rr, ee) {
              cell.addEventListener("mousemove", function (evt) {
                C.tooltip.show(
                  '<span class="tt-title">Client ' + (cc + 1) + " · Round " + rr + "</span><br>" +
                  (ee ? TYPES[ee].label : (cc >= 8 ? "no drift (clean client)" : "no drift this round")),
                  evt.clientX, evt.clientY);
              });
              cell.addEventListener("mouseleave", C.tooltip.hide);
            })(c, r, e);
          }
        }
        /* sweep cursor */
        if (sweep <= R) {
          var sx = m.l + sweep * cw;
          C.svg("line", { x1: sx, x2: sx, y1: m.t - 4, y2: H - m.b + 4,
            stroke: col.s1, "stroke-width": 2, opacity: 0.7 }, svg);
        }
      }

      /* legend */
      var leg = document.getElementById("stagger-legend");
      function drawLegend() {
        var col = C.colors();
        leg.innerHTML = "";
        Object.keys(TYPES).forEach(function (k) {
          var s = document.createElement("span");
          s.innerHTML = '<span class="swatch" style="background:' + col[TYPES[k].color] + '"></span>' +
            TYPES[k].label.replace("covariate drift", "cov.").replace("concept drift", "con.");
          leg.appendChild(s);
        });
      }

      var playing = false, last = 0, acc = 0;
      var loop = C.raf(svg, function (now) {
        if (!playing) return;
        if (!last) last = now;
        acc += now - last; last = now;
        if (acc > 550) {
          acc = 0; sweep++;
          if (sweep > R) { playing = false; syncBtn(); loop.stop(); }
          draw();
        }
      });
      var btn = document.getElementById("stagger-play");
      function syncBtn() {
        btn.classList.toggle("is-playing", playing);
        btn.innerHTML = playing ? "&#10074;&#10074;" : "&#9654;";
      }
      btn.addEventListener("click", function () {
        if (C.reducedMotion) { sweep = R + 1; draw(); return; }
        if (!playing) { sweep = 0; playing = true; last = 0; acc = 0; loop.start(); }
        else playing = false;
        syncBtn(); draw();
      });

      draw(); drawLegend();
      C.onThemeChange(function () { draw(); drawLegend(); });
    })();

    /* ==============================================================
       BASELINES — tabbed failure demos
    ============================================================== */
    (function baselines() {
      var panels = { fedavg: "bl-fedavg", cda: "bl-cda", fedcond: "bl-fedcond", feddrift: "bl-feddrift" };
      C.tabs(document.getElementById("bl-tabs"), function (key) {
        Object.keys(panels).forEach(function (k) {
          document.getElementById(panels[k]).hidden = k !== key;
        });
      });

      /* ---- FedAvg: averaging poisons the healthy ---------------- */
      (function fedavg() {
        var canvas = document.getElementById("bl-fedavg-canvas");
        if (!canvas) return;
        var slider = document.getElementById("bl-fedavg-drift");
        var f1El = document.getElementById("bl-fedavg-f1");

        function draw() {
          var d = +slider.value / 100;
          var f = C.fitCanvas(canvas, 260);
          var ctx = f.ctx, col = C.colors();
          ctx.clearRect(0, 0, f.w, f.h);
          var cx = f.w / 2, cy = f.h / 2;

          /* weight space: 3 healthy near origin-cluster, 1 drifting */
          var sc = Math.min(1, f.w / 640);
          var healthy = [[-95, -12], [-48, -62], [-105, 48]].map(function (p) {
            return [cx + p[0] * sc, cy + p[1] * sc];
          });
          var drifted = [cx + (40 + d * 210) * sc, cy + (26 + d * 44) * sc];
          var all = healthy.concat([drifted]);
          var gx = all.reduce(function (s, p) { return s + p[0]; }, 0) / 4;
          var gy = all.reduce(function (s, p) { return s + p[1]; }, 0) / 4;

          ctx.fillStyle = col.muted; ctx.font = C.font(11); ctx.textAlign = "left";
          ctx.fillText("weight space (2-D sketch)", 12, 18);

          /* pull lines */
          all.forEach(function (p) {
            ctx.strokeStyle = col.grid; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(gx, gy); ctx.stroke();
          });
          /* healthy */
          healthy.forEach(function (p) {
            ctx.fillStyle = col.s1;
            ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 7); ctx.fill();
          });
          ctx.font = C.font(10.5); ctx.textAlign = "center";
          /* drifted */
          ctx.fillStyle = col.crit;
          ctx.beginPath(); ctx.arc(drifted[0], drifted[1], 7, 0, 7); ctx.fill();
          ctx.fillStyle = col.crit; ctx.font = C.font(10.5); ctx.textAlign = "center";
          ctx.fillText("client 4 (drifted)", drifted[0], drifted[1] - 12);

          /* global average */
          ctx.fillStyle = col.ink;
          ctx.save();
          ctx.translate(gx, gy);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-6, -6, 12, 12);
          ctx.restore();
          ctx.font = C.font(11); ctx.fillStyle = col.ink;
          ctx.fillText("global model (average)", gx, gy - 16);

          /* the healthy cluster, and where its ideal model sits */
          var hx = healthy.reduce(function (s, p) { return s + p[0]; }, 0) / 3;
          var hy = healthy.reduce(function (s, p) { return s + p[1]; }, 0) / 3;
          ctx.strokeStyle = col.good;
          ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.arc(hx, hy, 76 * sc, 0, 7); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = col.good;
          ctx.fillText("healthy clients 1–3", hx, hy + 94 * sc);

          var dist = Math.hypot(gx - hx, gy - hy);
          var f1 = C.clamp(0.95 - dist / (170 * sc), 0.35, 0.95);
          f1El.textContent = f1.toFixed(2);
          f1El.style.color = f1 > 0.85 ? col.good : (f1 > 0.65 ? col.warn : col.crit);
        }
        slider.addEventListener("input", draw);
        draw();
        C.onThemeChange(draw);
        window.addEventListener("resize", draw);
      })();

      /* ---- CDA-FedAvg: probabilistic gate ----------------------- */
      (function cda() {
        var svg = document.getElementById("bl-cda-svg");
        if (!svg) return;
        var missedEl = document.getElementById("bl-cda-missed");
        var results = [];                       /* true = caught */
        var PDET = 0.55;                        /* e^{-2c} for a drifted client */
        var rng = C.rng(7);

        function draw() {
          var col = C.colors();
          svg.innerHTML = "";
          C.svg("text", { x: 20, y: 28, "font-size": 12.5, fill: col.ink2,
            "font-family": "inherit" }, svg)
            .textContent = "A drifted client arrives. Gate: flag drift iff e⁻²ᶜ > r, r ~ U[0,1].";
          C.svg("text", { x: 20, y: 50, "font-size": 12, fill: col.muted,
            "font-family": "inherit" }, svg)
            .textContent = "Here e⁻²ᶜ = " + PDET.toFixed(2) + " — the SAME real drift, 20 independent trials:";
          for (var i = 0; i < 20; i++) {
            var x = 34 + i * 29, y = 100;
            if (i < results.length) {
              var ok = results[i];
              C.svg("circle", { cx: x, cy: y, r: 10, fill: ok ? col.good : col.crit, opacity: 0.9 }, svg);
              C.svg("text", { x: x, y: y + 4.5, "text-anchor": "middle", "font-size": 12,
                fill: "#fff", "font-family": "inherit" }, svg).textContent = ok ? "✓" : "✗";
            } else {
              C.svg("circle", { cx: x, cy: y, r: 10, fill: "none", stroke: col.grid,
                "stroke-width": 1.5 }, svg);
            }
          }
          C.svg("text", { x: 20, y: 150, "font-size": 12, fill: col.ink2, "font-family": "inherit" }, svg)
            .textContent = "✓ drift flagged   ✗ drift silently missed — the client keeps polluting the global model";
          C.svg("text", { x: 20, y: 185, "font-size": 12, fill: col.muted, "font-family": "inherit" }, svg)
            .textContent = "…and when it does fire, every drifted client is adapted the same way,";
          C.svg("text", { x: 20, y: 203, "font-size": 12, fill: col.muted, "font-family": "inherit" }, svg)
            .textContent = "as if all drifts were identical.";
        }

        var timer = null;
        document.getElementById("bl-cda-run").addEventListener("click", function () {
          results = [];
          if (timer) clearInterval(timer);
          var missed = 0;
          function step() {
            var caught = rng() < PDET;
            if (!caught) missed++;
            results.push(caught);
            missedEl.textContent = missed + " / " + results.length;
            draw();
            if (results.length >= 20) { clearInterval(timer); timer = null; }
          }
          if (C.reducedMotion) { for (var i = 0; i < 20; i++) step(); }
          else timer = setInterval(step, 120);
        });
        draw();
        C.onThemeChange(draw);
      })();

      /* ---- FedConD: knife-edge significance --------------------- */
      (function fedcond() {
        var svg = document.getElementById("bl-fedcond-svg");
        if (!svg) return;
        var slider = document.getElementById("bl-fedcond-sig");
        var verdict = document.getElementById("bl-fedcond-verdict");
        var rng = C.rng(99);
        var R = 14;
        var loss = [], trueDrift = [4, 10];
        var v = 0.3;
        for (var r = 0; r < R; r++) {
          v = 0.3 + rng.gauss() * 0.035;
          if (trueDrift.indexOf(r) >= 0) v += 0.28;
          if (r === 7) v += 0.09;               /* a noise bump — trap for loose settings */
          loss.push(v);
        }

        function draw() {
          var col = C.colors();
          var sig = +slider.value / 100;        /* 0 strict … 1 loose */
          var thr = 0.32 - sig * 0.26;          /* jump size needed to fire */
          svg.innerHTML = "";
          var W = 640, H = 240, m = { l: 46, t: 18, r: 14, b: 30 };
          var iw = W - m.l - m.r, ih = H - m.t - m.b;
          function X(i) { return m.l + (i / (R - 1)) * iw; }
          function Y(val) { return m.t + ih - ((val - 0.2) / 0.6) * ih; }

          C.svg("line", { x1: m.l, x2: W - m.r, y1: Y(0.3), y2: Y(0.3), stroke: col.grid }, svg);
          var path = loss.map(function (val, i) { return (i ? "L" : "M") + X(i) + " " + Y(val); }).join(" ");
          C.svg("path", { d: path, fill: "none", stroke: col.s3, "stroke-width": 2 }, svg);

          var falseAlarms = 0, misses = 0;
          for (var i = 1; i < R; i++) {
            var jump = loss[i] - loss[i - 1];
            var fired = jump > thr;
            var isTrue = trueDrift.indexOf(i) >= 0;
            if (fired) {
              C.svg("circle", { cx: X(i), cy: Y(loss[i]), r: 7, fill: "none",
                stroke: isTrue ? col.good : col.warn, "stroke-width": 2.5 }, svg);
              if (!isTrue) falseAlarms++;
            }
            if (isTrue) {
              C.svg("line", { x1: X(i), x2: X(i), y1: m.t, y2: m.t + ih, stroke: col.crit,
                "stroke-width": 1, "stroke-dasharray": "3 4", opacity: 0.5 }, svg);
              if (!fired) {
                misses++;
                C.svg("text", { x: X(i), y: m.t + 12, "text-anchor": "middle", "font-size": 11,
                  fill: col.crit, "font-family": "inherit" }, svg).textContent = "missed!";
              }
            }
          }
          C.svg("text", { x: m.l, y: H - 8, "font-size": 11.5, fill: col.muted,
            "font-family": "inherit" }, svg)
            .textContent = "dashed = true drift · green ring = correct detection · amber ring = false alarm";

          verdict.innerHTML = misses
            ? '<strong style="color:' + col.crit + '">' + misses + " true drift(s) missed</strong>"
            : (falseAlarms
              ? '<strong style="color:' + col.warn + '">' + falseAlarms + " false alarm(s)</strong>"
              : '<strong style="color:' + col.good + '">tuned just right — for THIS dataset</strong>');
        }
        slider.addEventListener("input", draw);
        draw();
        C.onThemeChange(draw);
      })();

      /* ---- FedDrift: loss collision ----------------------------- */
      (function feddrift() {
        var svg = document.getElementById("bl-feddrift-svg");
        if (!svg) return;
        var verdict = document.getElementById("bl-feddrift-verdict");
        var t = 0, playing = false, last = 0;

        function bars(cx, shift, skew, col, colName, t2) {
          /* small weight histogram, animated toward its drifted shape */
          var out = [];
          for (var i = 0; i < 11; i++) {
            var x0 = (i - 5) / 2.2;
            var base = Math.exp(-x0 * x0 / 1.1);
            var drift = Math.exp(-Math.pow(x0 - shift, 2) / (1.1 * (1 + skew)));
            out.push(C.lerp(base, drift, t2));
          }
          return out;
        }

        function draw() {
          var col = C.colors();
          svg.innerHTML = "";
          var t2 = C.ease(Math.min(1, t));
          var lossA = 0.18 + 0.24 * t2, lossB = 0.18 + 0.24 * t2;   /* identical! */

          [{ cx: 168, name: "Client A — covariate drift", shift: 1.6, skew: 0, color: col.s2 },
           { cx: 472, name: "Client B — concept drift", shift: -1.3, skew: 0.9, color: col.s5 }]
          .forEach(function (cl) {
            C.svg("text", { x: cl.cx, y: 26, "text-anchor": "middle", "font-size": 13,
              fill: col.ink, "font-family": "inherit" }, svg).textContent = cl.name;

            /* loss gauge */
            C.svg("rect", { x: cl.cx - 90, y: 44, width: 180, height: 10, rx: 5, fill: col.grid }, svg);
            var lv = cl.cx === 168 ? lossA : lossB;
            C.svg("rect", { x: cl.cx - 90, y: 44, width: 180 * (lv / 0.6), height: 10, rx: 5,
              fill: col.crit, opacity: 0.85 }, svg);
            C.svg("text", { x: cl.cx, y: 72, "text-anchor": "middle", "font-size": 12.5,
              fill: col.ink2, "font-family": "inherit" }, svg)
              .textContent = "loss = " + lv.toFixed(3);

            /* weight histogram */
            var hb = bars(cl.cx, cl.shift, cl.skew, col, cl.color, t2);
            var hmax = Math.max.apply(null, hb);
            hb.forEach(function (h, i) {
              var bh = (h / hmax) * 110;
              C.svg("rect", { x: cl.cx - 88 + i * 16, y: 210 - bh, width: 12, height: bh, rx: 3,
                fill: cl.color, opacity: 0.9 }, svg);
            });
            C.svg("line", { x1: cl.cx - 92, x2: cl.cx + 92, y1: 210, y2: 210, stroke: col.axis }, svg);
            C.svg("text", { x: cl.cx, y: 228, "text-anchor": "middle", "font-size": 11,
              fill: col.muted, "font-family": "inherit" }, svg).textContent = "weight-value histogram";
          });

          /* the equals sign of doom */
          C.svg("text", { x: 320, y: 58, "text-anchor": "middle", "font-size": 22,
            fill: t2 > 0.9 ? col.crit : col.muted, "font-family": "inherit" }, svg).textContent = "=";
          C.svg("text", { x: 320, y: 262, "text-anchor": "middle", "font-size": 20,
            fill: t2 > 0.9 ? col.good : col.muted, "font-family": "inherit" }, svg).textContent = "≠";
          C.svg("text", { x: 320, y: 282, "text-anchor": "middle", "font-size": 11.5,
            fill: col.muted, "font-family": "inherit" }, svg)
            .textContent = "the weights still tell them apart";

          verdict.innerHTML = t2 > 0.9
            ? 'loss says <strong>same cluster</strong> — weights say <strong>different drifts</strong>'
            : "";
        }

        var loop = C.raf(svg, function (now) {
          if (!playing) return;
          if (!last) last = now;
          t += (now - last) / 1800; last = now;
          draw();
          if (t >= 1) { playing = false; loop.stop(); }
        });
        function play() {
          t = 0; last = 0;
          if (C.reducedMotion) { t = 1; draw(); return; }
          playing = true; loop.start();
        }
        document.getElementById("bl-feddrift-run").addEventListener("click", play);
        /* auto-run the first time it becomes visible */
        var seen = new IntersectionObserver(function (e) {
          if (e[0].isIntersecting) { play(); seen.disconnect(); }
        });
        seen.observe(svg);
        draw();
        C.onThemeChange(draw);
      })();
    })();

    /* ==============================================================
       INSIGHT — weights are a fingerprint of the data
    ============================================================== */
    (function insight() {
      var canvas = document.getElementById("insight-canvas");
      if (!canvas) return;
      var slider = document.getElementById("insight-shift");
      var ksEl = document.getElementById("insight-ks");
      var dirEl = document.getElementById("insight-dir");
      var cur = 0, tgt = 0;

      function gaussCurve(ctx, X, Y, mu, sig, color, fill) {
        ctx.beginPath();
        for (var i = 0; i <= 80; i++) {
          var x = -3.4 + (i / 80) * 6.8;
          var y = Math.exp(-Math.pow(x - mu, 2) / (2 * sig * sig));
          var px = X(x), py = Y(y);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        if (fill) {
          ctx.lineTo(X(3.4), Y(0)); ctx.lineTo(X(-3.4), Y(0)); ctx.closePath();
          ctx.fillStyle = color; ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      }

      function draw() {
        var f = C.fitCanvas(canvas, Math.max(240, Math.min(320, canvas.clientWidth * 0.36)));
        var ctx = f.ctx, col = C.colors();
        ctx.clearRect(0, 0, f.w, f.h);
        var half = f.w / 2;
        var m = 34;
        var s = cur;                                 /* data shift in [-1,1] */
        var wShift = s * 0.62;                       /* weights mirror it, damped */

        function XL(x) { return m + ((x + 3.4) / 6.8) * (half - m * 1.6); }
        function XR(x) { return half + m * 0.6 + ((x + 3.4) / 6.8) * (half - m * 1.6); }
        var Y0 = f.h - 44;
        function Y(y) { return Y0 - y * (f.h - 96); }

        ctx.font = C.font(12.5, true); ctx.fillStyle = col.ink; ctx.textAlign = "left";
        ctx.fillText("Client's data distribution", m, 22);
        ctx.fillText("Client's trained weights vs. reference", half + m * 0.6, 22);

        /* left: data */
        gaussCurve(ctx, XL, Y, 0, 1, col.grid, false);           /* original ghost */
        gaussCurve(ctx, XL, Y, s * 1.7, 1 - Math.abs(s) * 0.18, col.s2, true);
        ctx.fillStyle = col.muted; ctx.font = C.font(11); ctx.textAlign = "center";
        ctx.fillText("feature value", (m + half - m * 0.6) / 2, f.h - 12);
        if (Math.abs(s) > 0.04) {
          ctx.strokeStyle = col.s2; ctx.lineWidth = 1.6;
          var ax0 = XL(0), ax1 = XL(s * 1.7);
          var ay = Y(1.04);
          ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ax1, ay); ctx.stroke();
          ctx.beginPath();
          var dirn = s > 0 ? 1 : -1;
          ctx.moveTo(ax1, ay); ctx.lineTo(ax1 - 6 * dirn, ay - 4); ctx.lineTo(ax1 - 6 * dirn, ay + 4);
          ctx.closePath(); ctx.fillStyle = col.s2; ctx.fill();
        }

        /* right: weight histograms */
        var rng2 = C.rng(5);
        var bars = 15;
        for (var i = 0; i < bars; i++) {
          var x0 = -3 + (i / (bars - 1)) * 6;
          var ref = Math.exp(-x0 * x0 / 2.4);
          var cli = Math.exp(-Math.pow(x0 - wShift * 2.2, 2) / 2.4);
          var bw = (half - m * 1.6) / bars * 0.72;
          /* reference: outline */
          ctx.strokeStyle = col.muted; ctx.lineWidth = 1.2;
          ctx.strokeRect(XR(x0) - bw / 2, Y(ref), bw, Y0 - Y(ref));
          /* client: filled */
          ctx.fillStyle = col.s1; ctx.globalAlpha = 0.55;
          ctx.fillRect(XR(x0) - bw / 2, Y(cli), bw, Y0 - Y(cli));
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = col.muted; ctx.font = C.font(11); ctx.textAlign = "center";
        ctx.fillText("weight value", half + m * 0.6 + (half - m * 1.6) / 2, f.h - 12);
        ctx.textAlign = "left";
        ctx.fillStyle = col.muted;
        ctx.strokeStyle = col.muted;
        ctx.strokeRect(half + m * 0.6, 34, 10, 8);
        ctx.fillText("global reference", half + m * 0.6 + 16, 42);
        ctx.fillStyle = col.s1; ctx.globalAlpha = 0.55;
        ctx.fillRect(half + m * 0.6 + 130, 34, 10, 8);
        ctx.globalAlpha = 1;
        ctx.fillStyle = col.ink2;
        ctx.fillText("this client", half + m * 0.6 + 146, 42);

        /* readout */
        var ks = Math.min(0.99, Math.abs(wShift) * 0.9);
        ksEl.textContent = ks.toFixed(2);
        dirEl.innerHTML = ks < 0.05 ? ""
          : (wShift > 0 ? '→ assigned to <strong>S⁺</strong>' : '→ assigned to <strong>S⁻</strong>');
      }

      var loop = C.raf(canvas, function () {
        var d = tgt - cur;
        if (Math.abs(d) > 0.003) { cur += d * 0.18; draw(); }
        else { cur = tgt; draw(); loop.stop(); }
      });
      slider.addEventListener("input", function () {
        tgt = +slider.value / 100;
        if (C.reducedMotion) { cur = tgt; draw(); } else loop.start();
      });
      draw();
      C.onThemeChange(draw);
      window.addEventListener("resize", draw);
    })();

    /* ==============================================================
       MATH 6.1 — γ tripwire
    ============================================================== */
    (function gammaWidget() {
      var svg = document.getElementById("gamma-svg");
      if (!svg) return;
      var slider = document.getElementById("gamma-slider");
      var valEl = document.getElementById("gamma-val");
      var verdict = document.getElementById("gamma-verdict");
      var rng = C.rng(4242);
      var R = 12, trueDrift = [4, 9];
      var loss = [];
      var base = 0.32;
      for (var r = 0; r < R; r++) {
        var v = base + rng.gauss() * 0.022;
        if (trueDrift.indexOf(r) >= 0) v += 0.2;
        if (r === 6) v += 0.055;                 /* noise bump */
        loss.push(v);
      }

      function draw() {
        var col = C.colors();
        var gamma = +slider.value / 100;
        valEl.textContent = gamma.toFixed(2);
        svg.innerHTML = "";
        var W = 640, H = 260, m = { l: 46, t: 20, r: 14, b: 42 };
        var iw = W - m.l - m.r, ih = H - m.t - m.b;
        function X(i) { return m.l + (i / (R - 1)) * iw; }
        function Y(v2) { return m.t + ih - ((v2 - 0.22) / 0.42) * ih; }

        /* the γ allowance: light band + a step line at L(c−1)+γ */
        var cw2 = iw / (R - 1);
        for (var i2 = 1; i2 < R; i2++) {
          var y0 = Y(loss[i2 - 1] + gamma);
          C.svg("rect", { x: X(i2) - cw2 / 2, y: y0,
            width: cw2, height: Math.max(0, Y(loss[i2 - 1]) - y0),
            fill: col.s1, opacity: 0.05 }, svg);
          C.svg("line", { x1: X(i2) - cw2 / 2, x2: X(i2) + cw2 / 2, y1: y0, y2: y0,
            stroke: col.s1, "stroke-width": 1.5, "stroke-dasharray": "4 3", opacity: 0.65 }, svg);
        }
        /* mark the true drift rounds from the top */
        trueDrift.forEach(function (td) {
          C.svg("line", { x1: X(td), x2: X(td), y1: m.t, y2: m.t + ih, stroke: col.crit,
            "stroke-width": 1, "stroke-dasharray": "3 4", opacity: 0.45 }, svg);
          C.svg("text", { x: X(td), y: m.t + 10, "text-anchor": "middle", "font-size": 10.5,
            fill: col.crit, "font-family": "inherit" }, svg).textContent = "true drift";
        });

        var path = loss.map(function (v2, i3) { return (i3 ? "L" : "M") + X(i3) + " " + Y(v2); }).join(" ");
        C.svg("path", { d: path, fill: "none", stroke: col.s3, "stroke-width": 2 }, svg);

        var caught = 0, falseAlarms = 0, missed = 0;
        for (var i = 1; i < R; i++) {
          var fired = loss[i] > loss[i - 1] + gamma;
          var isTrue = trueDrift.indexOf(i) >= 0;
          C.svg("circle", { cx: X(i), cy: Y(loss[i]), r: 3.5, fill: col.s3 }, svg);
          if (fired) {
            var good = isTrue;
            C.svg("circle", { cx: X(i), cy: Y(loss[i]), r: 8, fill: "none",
              stroke: good ? col.good : col.warn, "stroke-width": 2.5 }, svg);
            C.svg("text", { x: X(i), y: Y(loss[i]) - 14, "text-anchor": "middle", "font-size": 11,
              fill: good ? col.good : col.warn, "font-family": "inherit" }, svg)
              .textContent = good ? "F = True ✓" : "false alarm";
            if (good) caught++; else falseAlarms++;
          } else if (isTrue) {
            missed++;
            C.svg("text", { x: X(i), y: Y(loss[i]) - 14, "text-anchor": "middle", "font-size": 11,
              fill: col.crit, "font-family": "inherit" }, svg).textContent = "missed";
          }
        }
        for (var xr = 0; xr < R; xr++) {
          C.svg("text", { x: X(xr), y: H - m.b + 16, "text-anchor": "middle", "font-size": 10.5,
            fill: col.muted, "font-family": "inherit" }, svg).textContent = xr + 1;
        }
        C.svg("text", { x: m.l + iw / 2, y: H - 4, "text-anchor": "middle", "font-size": 12,
          fill: col.ink2, "font-family": "inherit" }, svg).textContent = "communication round · shaded band = L₍ᶜ₋₁₎ + γ allowance";

        verdict.innerHTML =
          missed ? '<strong style="color:' + col.crit + '">γ too high — real drift slips through</strong>' :
          falseAlarms ? '<strong style="color:' + col.warn + '">γ too low — noise trips the wire</strong>' :
          '<strong style="color:' + col.good + '">both drifts caught, zero false alarms</strong>';
      }
      slider.addEventListener("input", draw);
      draw();
      C.onThemeChange(draw);
    })();

    /* ==============================================================
       MATH 6.2 — KS test on weights
    ============================================================== */
    (function ksWidget() {
      var svg = document.getElementById("ks-svg");
      if (!svg) return;
      var slider = document.getElementById("ks-slider");
      var dEl = document.getElementById("ks-d");
      var gEl = document.getElementById("ks-group");

      function Phi(x) {  /* standard normal CDF approximation */
        var t = 1 / (1 + 0.2316419 * Math.abs(x));
        var d = 0.3989423 * Math.exp(-x * x / 2);
        var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return x > 0 ? 1 - p : p;
      }

      function draw() {
        var col = C.colors();
        var mu = (+slider.value / 100) * 1.5;
        svg.innerHTML = "";
        var W = 640, H = 280, m = { l: 52, t: 18, r: 16, b: 44 };
        var iw = W - m.l - m.r, ih = H - m.t - m.b;
        function X(x) { return m.l + ((x + 3.6) / 7.2) * iw; }
        function Y(p) { return m.t + ih - p * ih; }

        for (var gy = 0; gy <= 4; gy++) {
          C.svg("line", { x1: m.l, x2: W - m.r, y1: Y(gy / 4), y2: Y(gy / 4),
            stroke: col.grid, "stroke-width": 1 }, svg);
          C.svg("text", { x: m.l - 8, y: Y(gy / 4) + 4, "text-anchor": "end", "font-size": 10.5,
            fill: col.muted, "font-family": "inherit" }, svg).textContent = (gy / 4).toFixed(2);
        }

        /* find max gap */
        var maxD = 0, maxX = 0, sign = 1;
        for (var i = 0; i <= 200; i++) {
          var x = -3.6 + (i / 200) * 7.2;
          var d0 = Phi(x) - Phi(x - mu);
          if (Math.abs(d0) > Math.abs(maxD)) { maxD = d0; maxX = x; }
        }
        sign = mu >= 0 ? 1 : -1;

        function cdfPath(shift) {
          var p = "";
          for (var i2 = 0; i2 <= 100; i2++) {
            var x2 = -3.6 + (i2 / 100) * 7.2;
            p += (i2 ? "L" : "M") + X(x2).toFixed(1) + " " + Y(Phi(x2 - shift)).toFixed(1);
          }
          return p;
        }
        C.svg("path", { d: cdfPath(0), fill: "none", stroke: col.muted, "stroke-width": 2,
          "stroke-dasharray": "5 4" }, svg);
        C.svg("path", { d: cdfPath(mu), fill: "none", stroke: col.s1, "stroke-width": 2.2 }, svg);

        /* D arrow at max gap */
        if (Math.abs(mu) > 0.03) {
          var y1 = Y(Phi(maxX)), y2 = Y(Phi(maxX - mu));
          C.svg("line", { x1: X(maxX), x2: X(maxX), y1: y1, y2: y2, stroke: col.crit,
            "stroke-width": 2.5 }, svg);
          [ [y1, y2 > y1 ? 5 : -5], [y2, y2 > y1 ? -5 : 5] ].forEach(function (a) {
            C.svg("line", { x1: X(maxX) - 5, x2: X(maxX) + 5, y1: a[0], y2: a[0],
              stroke: col.crit, "stroke-width": 2.5 }, svg);
          });
          C.svg("text", { x: X(maxX) + 10, y: (y1 + y2) / 2 + 4, "font-size": 13,
            fill: col.crit, "font-family": "inherit" }, svg)
            .textContent = "D = " + Math.abs(maxD).toFixed(2);
        }

        C.svg("text", { x: m.l + 8, y: m.t + 14, "font-size": 11.5, fill: col.muted,
          "font-family": "inherit" }, svg).textContent = "dashed: reference weights Wₖ (global model)";
        C.svg("text", { x: m.l + 8, y: m.t + 30, "font-size": 11.5, fill: col.s1,
          "font-family": "inherit" }, svg).textContent = "solid: drifted client's weights Wᵢ";
        C.svg("text", { x: m.l + iw / 2, y: H - 6, "text-anchor": "middle", "font-size": 12,
          fill: col.ink2, "font-family": "inherit" }, svg)
          .textContent = "cumulative fraction of weight values ≤ x";

        dEl.textContent = Math.abs(maxD).toFixed(2);
        gEl.innerHTML = Math.abs(mu) < 0.03 ? "—" : (sign > 0 ? "S⁺" : "S⁻");
        gEl.style.color = Math.abs(mu) < 0.03 ? "" : (sign > 0 ? C.colors().s2 : C.colors().s6);
      }
      slider.addEventListener("input", draw);
      draw();
      C.onThemeChange(draw);
    })();

    /* ==============================================================
       MATH 6.3 — eigen-projection + k-means, stepped
    ============================================================== */
    (function eigWidget() {
      var canvas = document.getElementById("eig-canvas");
      if (!canvas) return;
      var rng = C.rng(31415);
      var step = 0, t = 1;

      /* two elongated clusters of "flattened weights" */
      var pts = [];
      for (var i = 0; i < 26; i++) {
        var cl = i < 13 ? 0 : 1;
        var cx = cl ? 1.15 : -1.15, cy = cl ? 0.5 : -0.5;
        var along = rng.gauss() * 0.9;
        pts.push({
          x: cx + along * 0.82 + rng.gauss() * 0.16,
          y: cy + along * 0.38 + rng.gauss() * 0.16,
          cl: cl
        });
      }
      /* PCA on the cloud */
      var mx = 0, my = 0;
      pts.forEach(function (p) { mx += p.x; my += p.y; });
      mx /= pts.length; my /= pts.length;
      var sxx = 0, sxy = 0, syy = 0;
      pts.forEach(function (p) {
        sxx += (p.x - mx) * (p.x - mx); sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) * (p.y - my);
      });
      var tr = sxx + syy, det = sxx * syy - sxy * sxy;
      var l1 = tr / 2 + Math.sqrt(tr * tr / 4 - det), l2 = tr / 2 - Math.sqrt(tr * tr / 4 - det);
      var e1 = [sxy, l1 - sxx]; var n1 = Math.hypot(e1[0], e1[1]); e1 = [e1[0] / n1, e1[1] / n1];
      var varExp = l1 / (l1 + l2);

      /* projection coordinate for each point */
      pts.forEach(function (p) { p.proj = (p.x - mx) * e1[0] + (p.y - my) * e1[1]; });

      /* k-means (k=2) on proj, recorded per iteration for the animation */
      var kmIters = [];
      (function () {
        var c0 = -0.4, c1 = 0.42, prev = null;
        for (var it = 0; it < 5; it++) {
          var assign = pts.map(function (p) { return Math.abs(p.proj - c0) < Math.abs(p.proj - c1) ? 0 : 1; });
          kmIters.push({ c: [c0, c1], assign: assign.slice() });
          var s0 = 0, n0 = 0, s1 = 0, nn1 = 0;
          assign.forEach(function (a, i2) {
            if (a === 0) { s0 += pts[i2].proj; n0++; } else { s1 += pts[i2].proj; nn1++; }
          });
          c0 = n0 ? s0 / n0 : c0; c1 = nn1 ? s1 / nn1 : c1;
          if (prev && prev.join() === assign.join()) break;
          prev = assign;
        }
      })();
      var kmFrame = kmIters.length - 1;

      function draw() {
        var f = C.fitCanvas(canvas, Math.max(280, Math.min(360, canvas.clientWidth * 0.5)));
        var ctx = f.ctx, col = C.colors();
        ctx.clearRect(0, 0, f.w, f.h);
        var cx = f.w / 2, cy = f.h / 2;
        var S = Math.min(f.w, f.h) * 0.19;
        function X(x) { return cx + x * S; }
        function Y(y) { return cy - y * S; }

        var k = C.ease(t);
        var msgs = [
          "Each dot is one drifted client's flattened weight vector (thousands of dimensions, sketched in 2-D).",
          "eig(SᵀS): the eigenvectors point along the directions where clients actually differ. The leading axis explains " + (varExp * 100).toFixed(0) + "% of the variance here (the paper keeps enough for 95%).",
          "Projecting onto the leading eigenvectors compresses each client to a handful of coordinates — differences survive, noise doesn't.",
          "k-means in the projected space finds the groups: clients drifting the same way land in the same cohort."
        ];

        /* points, possibly collapsing to the axis */
        pts.forEach(function (p, i2) {
          var px, py;
          if (step < 2) { px = p.x; py = p.y; }
          else {
            var qx = mx + p.proj * e1[0], qy = my + p.proj * e1[1];
            px = step === 2 ? C.lerp(p.x, qx, k) : qx;
            py = step === 2 ? C.lerp(p.y, qy, k) : qy;
          }
          var color = col.muted;
          if (step === 3) {
            var a = kmIters[Math.min(kmFrame, kmIters.length - 1)].assign[i2];
            color = a === 0 ? col.s2 : col.s6;
          }
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.88;
          ctx.beginPath();
          ctx.arc(X(px), Y(py), 5, 0, 7);
          ctx.fill();
          ctx.globalAlpha = 1;
        });

        /* eigen axes */
        if (step >= 1) {
          var a1 = step === 1 ? k : 1;
          ctx.strokeStyle = col.s1; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(X(mx - e1[0] * 2.6 * a1), Y(my - e1[1] * 2.6 * a1));
          ctx.lineTo(X(mx + e1[0] * 2.6 * a1), Y(my + e1[1] * 2.6 * a1));
          ctx.stroke();
          ctx.fillStyle = col.s1; ctx.font = C.font(11.5);
          ctx.textAlign = "left";
          ctx.fillText("v₁ (" + (varExp * 100).toFixed(0) + "% var.)", X(mx + e1[0] * 2.6) + 8, Y(my + e1[1] * 2.6));
          /* minor axis, faint */
          ctx.strokeStyle = col.grid;
          ctx.beginPath();
          ctx.moveTo(X(mx + e1[1] * 1.1 * a1), Y(my - e1[0] * 1.1 * a1));
          ctx.lineTo(X(mx - e1[1] * 1.1 * a1), Y(my + e1[0] * 1.1 * a1));
          ctx.stroke();
        }

        /* k-means centroids */
        if (step === 3) {
          var fr = kmIters[Math.min(kmFrame, kmIters.length - 1)];
          fr.c.forEach(function (cc, ci) {
            var qx = mx + cc * e1[0], qy = my + cc * e1[1];
            ctx.strokeStyle = ci === 0 ? col.s2 : col.s6;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(X(qx) - 7, Y(qy) - 7); ctx.lineTo(X(qx) + 7, Y(qy) + 7);
            ctx.moveTo(X(qx) - 7, Y(qy) + 7); ctx.lineTo(X(qx) + 7, Y(qy) - 7);
            ctx.stroke();
          });
          ctx.fillStyle = col.ink2; ctx.font = C.font(12);
          ctx.textAlign = "center";
          ctx.fillText("cohort H₁", X(mx - 1.3), Y(my - 1.2));
          ctx.fillText("cohort H₂", X(mx + 1.5), Y(my + 1.35));
        }

        /* caption */
        ctx.fillStyle = col.ink2; ctx.font = C.font(12);
        ctx.textAlign = "left";
        wrapText(ctx, msgs[step], 14, f.h - 40, f.w - 28, 16);
      }

      function wrapText(ctx, text, x, y, maxW, lh) {
        var words = text.split(" "), line = "", yy = y;
        words.forEach(function (w) {
          var test = line + w + " ";
          if (ctx.measureText(test).width > maxW && line) {
            ctx.fillText(line, x, yy); line = w + " "; yy += lh;
          } else line = test;
        });
        ctx.fillText(line, x, yy);
      }

      var kmTimer = null;
      var loop = C.raf(canvas, function () {
        if (t < 1) { t = Math.min(1, t + 0.03); draw(); }
        else loop.stop();
      });
      C.tabs(document.getElementById("eig-steps"), function (s) {
        step = +s; t = C.reducedMotion ? 1 : 0;
        if (kmTimer) { clearInterval(kmTimer); kmTimer = null; }
        if (step === 3 && !C.reducedMotion) {
          kmFrame = 0;
          kmTimer = setInterval(function () {
            kmFrame++;
            draw();
            if (kmFrame >= kmIters.length - 1) { clearInterval(kmTimer); kmTimer = null; }
          }, 600);
        } else kmFrame = kmIters.length - 1;
        loop.start(); draw();
      });
      /* select the first step visually */
      document.querySelector("#eig-steps button[data-step='0']").setAttribute("aria-selected", "true");
      draw();
      C.onThemeChange(draw);
      window.addEventListener("resize", draw);
    })();

    /* ==============================================================
       RESULTS 7.1 — cohort heatmap (CLMA vs FedDrift)
    ============================================================== */
    (function cohortMap() {
      var svg = document.getElementById("cohort-svg");
      if (!svg) return;
      var note = document.getElementById("cohort-note");
      var algo = "clma", drift = "cov";

      /* cohort id per (client, round). ids mimic the paper's random labels */
      function cohortData(algo2, drift2) {
        var base = 7;
        var grid = [];
        for (var c = 0; c < 10; c++) {
          grid.push(new Array(10).fill(base));
        }
        if (algo2 === "clma") {
          /* every drift event spawns direction-specific cohorts */
          var ids = drift2 === "cov"
            ? [[21, 35], [12, 44], [3, 28], [41, 18]]
            : [[26, 9], [48, 31], [15, 39], [5, 24]];
          [3, 5, 7, 9].forEach(function (r, ri) {
            for (var c2 = 0; c2 < 8; c2++) {
              var g = c2 < 4 ? 0 : 1;
              for (var rr = r; rr <= 10; rr++) grid[c2][rr - 1] = ids[ri][g];
            }
          });
        } else {
          /* FedDrift: one blob of "drifted" after round 3 */
          for (var c3 = 0; c3 < 8; c3++) {
            for (var rr2 = 3; rr2 <= 10; rr2++) grid[c3][rr2 - 1] = 21;
          }
        }
        return grid;
      }

      function draw() {
        var col = C.colors();
        var grid = cohortData(algo, drift);
        svg.innerHTML = "";
        var W = 760, H = 330, m = { l: 86, t: 14, r: 130, b: 40 };
        svg.setAttribute("viewBox", "0 0 " + W + " " + H);
        var cw = (W - m.l - m.r) / 10, ch = (H - m.t - m.b) / 10;

        /* stable id -> color slot mapping by order of first appearance */
        var order = [];
        grid.forEach(function (row) { row.forEach(function (id) {
          if (order.indexOf(id) < 0) order.push(id);
        }); });
        function colorFor(id) { return col.series[order.indexOf(id) % col.series.length]; }

        for (var c = 0; c < 10; c++) {
          C.svg("text", { x: m.l - 10, y: m.t + c * ch + ch / 2 + 4, "text-anchor": "end",
            "font-size": 11.5, fill: col.muted, "font-family": "inherit" }, svg)
            .textContent = "Client " + (c + 1);
          for (var r = 0; r < 10; r++) {
            var id = grid[c][r];
            var cell = C.svg("rect", { x: m.l + r * cw + 1.5, y: m.t + c * ch + 1.5,
              width: cw - 3, height: ch - 3, rx: 3, fill: colorFor(id),
              opacity: id === 7 ? 0.35 : 0.9, stroke: col.border, "stroke-width": 1 }, svg);
            if (!C.reducedMotion) {
              cell.style.opacity = 0;
              cell.style.transition = "opacity 0.4s ease " + (r * 40 + c * 12) + "ms";
              requestAnimationFrame(function (cl2) {
                return function () { cl2.style.opacity = ""; };
              }(cell));
              cell.style.opacity = "";
              cell.setAttribute("opacity", id === 7 ? 0.35 : 0.9);
            }
            (function (cc, rr, ii) {
              cell.addEventListener("mousemove", function (evt) {
                C.tooltip.show('<span class="tt-title">Round ' + (rr + 1) + " · Client " + (cc + 1) +
                  "</span><br>Cohort " + ii + (ii === 7 ? " (initial cohort)" : ""), evt.clientX, evt.clientY);
              });
              cell.addEventListener("mouseleave", C.tooltip.hide);
            })(c, r, id);
          }
        }
        for (var r2 = 0; r2 < 10; r2++) {
          C.svg("text", { x: m.l + r2 * cw + cw / 2, y: H - m.b + 18, "text-anchor": "middle",
            "font-size": 11.5, fill: col.muted, "font-family": "inherit" }, svg).textContent = r2 + 1;
        }
        C.svg("text", { x: m.l + (W - m.l - m.r) / 2, y: H - 4, "text-anchor": "middle",
          "font-size": 12, fill: col.ink2, "font-family": "inherit" }, svg)
          .textContent = "Communication round";

        /* right legend: cohort ids in first-appearance order */
        var ly = m.t + 8;
        C.svg("text", { x: W - m.r + 14, y: ly, "font-size": 11.5, fill: col.ink2,
          "font-family": "inherit" }, svg).textContent = "Cohort IDs";
        order.forEach(function (id, i2) {
          ly += 20;
          C.svg("rect", { x: W - m.r + 14, y: ly - 10, width: 12, height: 12, rx: 3,
            fill: colorFor(id), opacity: id === 7 ? 0.35 : 0.9 }, svg);
          C.svg("text", { x: W - m.r + 32, y: ly, "font-size": 11.5, fill: col.muted,
            "font-family": "inherit" }, svg).textContent = id + (id === 7 ? " (initial)" : "");
        });

        note.textContent = algo === "clma"
          ? "CLMA: every drift event spawns direction-specific cohorts — clients 1–4 and 5–8 drift differently and are never lumped together. The two clean clients keep the original global model."
          : "FedDrift: after the first drift at round 3 it separates drifted (one cluster) from non-drifted — but never distinguishes the different drifts among clients 1–8, and later drift events at rounds 5, 7, 9 go unresolved.";
      }

      C.tabs(document.getElementById("cohort-algo-tabs"), function (k) { algo = k; draw(); });
      C.tabs(document.getElementById("cohort-drift-tabs"), function (k) { drift = k; draw(); });
      draw();
      C.onThemeChange(draw);
    })();

    /* ==============================================================
       RESULTS 7.2 — F1 line charts
    ============================================================== */
    (function f1Charts() {
      var el = document.getElementById("f1-chart");
      if (!el) return;
      var note = document.getElementById("f1-note");
      var chart = new C.LineChart(el, { ariaLabel: "F1 score per communication round for CLMA, FedDrift and FedAvg." });
      var view = "drifted", drift = "cov";

      var ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      var MARKS = [{ x: 3, label: "drift" }, { x: 5, label: "drift" }, { x: 7, label: "drift" }, { x: 9, label: "drift" }];

      var DATA = {
        drifted: {
          cov: [
            { name: "CLMA (ours)", color: "s1", values: [0.93, 0.95, 0.58, 0.90, 0.62, 0.92, 0.88, 0.94, 0.90, 0.95] },
            { name: "FedDrift", color: "s2", values: [0.92, 0.94, 0.55, 0.78, 0.60, 0.84, 0.86, 0.92, 0.88, 0.93] },
            { name: "FedAvg", color: "s3", values: [0.92, 0.94, 0.48, 0.70, 0.52, 0.75, 0.80, 0.86, 0.84, 0.90] }
          ],
          con: [
            { name: "CLMA (ours)", color: "s1", values: [0.93, 0.95, 0.52, 0.88, 0.58, 0.90, 0.86, 0.93, 0.89, 0.94] },
            { name: "FedDrift", color: "s2", values: [0.92, 0.94, 0.50, 0.74, 0.55, 0.80, 0.83, 0.90, 0.86, 0.92] },
            { name: "FedAvg", color: "s3", values: [0.91, 0.93, 0.42, 0.65, 0.48, 0.71, 0.77, 0.83, 0.81, 0.88] }
          ]
        },
        clean: {
          cov: [
            { name: "CLMA (ours)", color: "s1", values: [0.94, 0.95, 0.95, 0.94, 0.95, 0.95, 0.94, 0.95, 0.95, 0.95] },
            { name: "FedDrift", color: "s2", values: [0.94, 0.95, 0.94, 0.93, 0.94, 0.94, 0.94, 0.94, 0.94, 0.95] },
            { name: "FedAvg", color: "s3", values: [0.94, 0.95, 0.94, 0.72, 0.90, 0.70, 0.88, 0.75, 0.90, 0.78] }
          ],
          con: [
            { name: "CLMA (ours)", color: "s1", values: [0.94, 0.95, 0.94, 0.94, 0.95, 0.94, 0.94, 0.95, 0.94, 0.95] },
            { name: "FedDrift", color: "s2", values: [0.93, 0.95, 0.94, 0.92, 0.94, 0.93, 0.94, 0.94, 0.93, 0.94] },
            { name: "FedAvg", color: "s3", values: [0.93, 0.94, 0.93, 0.68, 0.88, 0.66, 0.85, 0.72, 0.87, 0.75] }
          ]
        },
        infer: {
          cov: [
            { name: "Covariate drift", color: "s1", values: [0.94, 0.94, 0.55, 0.85, 0.92, 0.93, 0.94, 0.94, 0.94] },
            { name: "Concept drift", color: "s2", values: [0.93, 0.94, 0.48, 0.82, 0.90, 0.92, 0.93, 0.93, 0.93] }
          ]
        }
      };
      DATA.infer.con = DATA.infer.cov;

      var NOTES = {
        drifted: "A drifted client. Everyone falls at rounds 3 and 5 — the difference is the bounce-back. By round 4 CLMA has quarantined and re-cohorted the client; by rounds 7 and 9 all methods have partially learned the recurring pattern, but CLMA stays on top.",
        clean: "A client that never drifted. CLMA and FedDrift protect it by quarantining drifted peers. FedAvg blends the drifted weights into everyone's model — the poison shows up one round after each drift event.",
        infer: "CLMA after deployment (Algorithm 4): the fielded model self-monitors its loss on live data, raises the flag at round 3, and the server-side re-cohorting restores performance within about a round — no retraining fleet-wide."
      };

      function render() {
        var isInfer = view === "infer";
        var driftTabs = document.getElementById("f1-drift-tabs");
        driftTabs.style.visibility = isInfer ? "hidden" : "visible";
        chart.update({
          xLabel: "Round",
          yLabel: "F1 score",
          x: isInfer ? ROUNDS.slice(0, 9) : ROUNDS,
          series: DATA[view][drift],
          markers: isInfer ? [{ x: 3, label: "drift" }] : MARKS
        });
        note.textContent = NOTES[view];
      }

      C.tabs(document.getElementById("f1-view-tabs"), function (k) { view = k; render(); });
      C.tabs(document.getElementById("f1-drift-tabs"), function (k) { drift = k; render(); });
      render();
    })();

  });
})();
