/* ==================================================================
   clma-sim.js — the CLMA step-by-step simulator (section 05).

   Design: the whole run is PRE-COMPUTED into a list of step
   snapshots (deterministic, seeded), so play / pause / step-forward /
   step-BACK / speed are all just moves of an index into history.
   The canvas tweens client positions toward each snapshot's layout,
   so stepping in either direction stays smooth.

   Each snapshot: { round, key, label, algo, line, log[],
                    clients[{cohort,loss,prevLoss,flag,quar,sign,fp}],
                    cohortList[] }
================================================================== */
(function () {
  "use strict";
  var C = window.CLMA;

  document.addEventListener("DOMContentLoaded", function () {
    var canvas = document.getElementById("sim-canvas");
    if (!canvas) return;

    var N = 10, ROUNDS = 10, DRIFT_ROUNDS = [3, 5, 7, 9];

    /* fingerprint offsets per drift type (the "direction" of drift) */
    var TYPE_FP = {
      covP: [1.25, 0.35], covM: [-1.2, 0.45],
      conA: [0.65, -1.15], conB: [-0.55, -1.2]
    };
    var TYPE_LABEL = {
      covP: "covariate (mean +)", covM: "covariate (mean −)",
      conA: "concept (boundary A)", conB: "concept (boundary B)"
    };

    /* ---------------- history generation ------------------------ */

    var history = [], cursor = 0;

    function generate(params) {
      var rng = C.rng(1234 + Math.round(params.gamma * 100) * 7 + params.nDrift * 131);
      history = [];
      var clients = [];
      for (var i = 0; i < N; i++) {
        clients.push({
          id: i, cohort: 0, loss: 0.9, prevLoss: Infinity, flag: false,
          quar: false, sign: 0, fp: [rng.gauss() * 0.12, rng.gauss() * 0.12],
          type: null, pendingType: null, adapted: true
        });
      }
      var cohortList = [{ id: 7, label: "initial" }];   /* random-looking ids like the paper */
      var idPool = [21, 35, 12, 44, 3, 28, 41, 18, 26, 9, 48, 31, 15, 39, 5, 24];
      var idIdx = 0;

      function snap(round, key, label, algo, line, log) {
        history.push({
          round: round, key: key, label: label, algo: algo, line: line,
          log: log || [],
          clients: clients.map(function (c) {
            return { id: c.id, cohort: c.cohort, loss: c.loss, flag: c.flag,
                     quar: c.quar, sign: c.sign, fp: c.fp.slice(), type: c.type };
          }),
          cohorts: cohortList.slice()
        });
      }

      function driftTypeFor(ci, ri) {
        var g = ci < Math.ceil(params.nDrift / 2) ? 0 : 1;
        if (params.mix === "cov") return g ? "covM" : "covP";
        if (params.mix === "con") return g ? "conB" : "conA";
        return (ri % 2)
          ? (g ? "conB" : "conA")
          : (g ? "covM" : "covP");
      }

      for (var r = 1; r <= ROUNDS; r++) {
        var driftNow = DRIFT_ROUNDS.indexOf(r) >= 0;
        var ri = DRIFT_ROUNDS.indexOf(r);

        /* --- broadcast --- */
        snap(r, "broadcast", "The server sends each cohort's model to its member clients.",
          "a1", r === 1 ? "a1-init" : "a1-train", [
            { t: "round", txt: "— Round " + r + " —" }
          ]);

        /* --- local training (drift lands here, inside the data) --- */
        clients.forEach(function (c) {
          c.prevLoss = c.loss;
          var drifted = driftNow && c.id < params.nDrift;
          if (drifted) {
            c.type = driftTypeFor(c.id, ri);
            var off = TYPE_FP[c.type];
            c.fp = [off[0] + rng.gauss() * 0.13, off[1] + rng.gauss() * 0.13];
            c.adapted = false;
          }
          /* loss: healthy ≈ 0.9 F1 → shown as loss ≈ 0.25; drift adds a jump */
          var base = 0.25 + rng.gauss() * 0.012;
          c.loss = c.adapted ? base : base + 0.24 + rng.gauss() * 0.02;
          c.flag = false;
        });
        snap(r, "train", "Each client runs local gradient descent on its fresh private data" +
          (driftNow ? " — but for the drifted clients, the data has changed under them." : "."),
          "a2", "a2-train");

        /* --- detect --- */
        var flagged = [];
        clients.forEach(function (c) {
          if (c.prevLoss !== Infinity && c.loss > c.prevLoss + params.gamma) {
            c.flag = true;
            flagged.push(c);
          }
          if (!c.adapted && !c.flag) c.missed = true; else c.missed = false;
        });
        var missedCount = clients.filter(function (c) { return c.missed; }).length;
        var detectLog = [];
        if (flagged.length) detectLog.push({ t: "drift", txt: flagged.length + " client(s) raise the drift flag (Lc > Lc−1 + γ)" });
        if (missedCount) detectLog.push({ t: "drift", txt: missedCount + " drifted client(s) NOT caught — γ too high" });
        if (!flagged.length && !missedCount) detectLog.push({ txt: "no drift detected — losses within γ of last round" });
        snap(r, "detect", flagged.length
          ? flagged.length + " client(s) tripped the loss tripwire: Lc > Lc−1 + γ. They set F = True."
          : (missedCount ? "Drift happened, but the loss jump stayed under γ — the tripwire stays silent. Try a lower γ."
            : "All losses within tolerance; no flags raised."),
          "a2", "a2-detect", detectLog);

        /* --- upload --- */
        snap(r, "upload", "Clients return only their weights Wₙ and the boolean flag F. No data, no statistics, nothing else.",
          "a2", "a2-return");

        /* --- aggregate (per cohort, flagged clients excluded next) --- */
        snap(r, "aggregate", "The server aggregates weights within each cohort and sends each cohort its own updated model.",
          "a1", r === 1 ? "a1-agg1" : "a1-agg");

        if (flagged.length) {
          /* --- quarantine --- */
          flagged.forEach(function (c) { c.quar = true; });
          snap(r, "quarantine", "Flagged clients are pulled out of their cohorts into the quarantine set W̄ — their weights must not poison their old peers.",
            "a1", "a1-quar", [{ t: "drift", txt: "quarantined: " + flagged.map(function (c) { return "C" + (c.id + 1); }).join(", ") }]);

          /* --- KS test --- */
          flagged.forEach(function (c) { c.sign = c.fp[0] >= 0 ? 1 : -1; });
          snap(r, "kstest", "KS test of each quarantined client's weights against the previous global model: the SIGN of the statistic splits them into S⁺ and S⁻ by drift direction.",
            "a3", "a3-ks", [{ txt: "S⁺ = {" + flagged.filter(function (c) { return c.sign > 0; }).map(function (c) { return "C" + (c.id + 1); }).join(",") +
              "}  S⁻ = {" + flagged.filter(function (c) { return c.sign < 0; }).map(function (c) { return "C" + (c.id + 1); }).join(",") + "}" }]);

          /* --- project --- */
          snap(r, "project", "Flattened weights are projected onto the top eigenvectors (95% variance kept) — clients become low-dimensional points.",
            "a3", "a3-eig");

          /* --- cluster --- */
          snap(r, "cluster", "k-means inside S⁺ and S⁻ groups clients whose weights moved the same way.",
            "a3", "a3-cluster");

          /* --- new cohorts --- */
          var byType = {};
          flagged.forEach(function (c) {
            if (!byType[c.type]) byType[c.type] = [];
            byType[c.type].push(c);
          });
          var newLog = [];
          Object.keys(byType).forEach(function (ty) {
            var cid = idPool[idIdx++ % idPool.length];
            cohortList.push({ id: cid, label: TYPE_LABEL[ty] });
            var cIdx = cohortList.length - 1;
            byType[ty].forEach(function (c) {
              c.cohort = cIdx; c.quar = false; c.sign = 0; c.adapted = true; c.flag = false;
            });
            newLog.push({ t: "cohort", txt: "new cohort " + cid + " (" + TYPE_LABEL[ty] + "): " +
              byType[ty].map(function (c) { return "C" + (c.id + 1); }).join(", ") });
          });
          snap(r, "cohort", "Each cluster becomes a NEW cohort that continues federated learning among clients with the same drift — collaborative adaptation begins immediately.",
            "a1", "a1-union", newLog);
        }
      }
      snap(ROUNDS, "done", "Run complete. Every drift event was resolved into direction-specific cohorts; clean clients were never disturbed. Change γ or the drift mix and run it again.",
        "a1", "a1-end", [{ t: "round", txt: "— run complete —" }]);
    }

    /* ---------------- rendering --------------------------------- */

    var vis = [];      /* per-client render state: x, y (tweened) */
    for (var i = 0; i < N; i++) vis.push({ x: 0, y: 0, init: false });

    function targetLayout(s, f) {
      /* returns [{x,y}] for the snapshot given canvas frame f */
      var cx = f.w * 0.40, cy = f.h * 0.42;
      var rx = Math.min(f.w * 0.30, 205), ry = f.h * 0.30;
      var quarY = f.h - 34;

      /* group ring order by cohort so cohorts sit together */
      var order = s.clients.slice().sort(function (a, b) {
        return (a.cohort - b.cohort) || (a.id - b.id);
      });
      var out = new Array(N);
      var ringCount = order.filter(function (c) { return !c.quar; }).length;
      var k = 0;
      order.forEach(function (c) {
        if (c.quar) return;
        var a = (k / Math.max(1, ringCount)) * Math.PI * 2 - Math.PI / 2;
        out[c.id] = { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
        k++;
      });
      /* quarantined clients: bottom strip, S− left / S+ right once signed */
      var quar = order.filter(function (c) { return c.quar; });
      quar.forEach(function (c, qi) {
        var slot = qi - (quar.length - 1) / 2;
        var xb = cx + slot * 34;
        if (c.sign) xb = cx + c.sign * (40 + Math.abs(slot) * 30);
        out[c.id] = { x: xb, y: quarY };
      });
      return out;
    }

    function draw() {
      var s = history[cursor];
      if (!s) return;
      var f = C.fitCanvas(canvas, Math.max(330, Math.min(430, canvas.clientWidth * 0.78)));
      var ctx = f.ctx, col = C.colors();
      ctx.clearRect(0, 0, f.w, f.h);
      var cx = f.w * 0.40, cy = f.h * 0.42;
      var tgt = targetLayout(s, f);

      /* tween positions */
      var settled = true;
      s.clients.forEach(function (c) {
        var v = vis[c.id], t = tgt[c.id];
        if (!v.init || C.reducedMotion) { v.x = t.x; v.y = t.y; v.init = true; }
        else {
          var dx = t.x - v.x, dy = t.y - v.y;
          if (Math.abs(dx) + Math.abs(dy) > 0.7) settled = false;
          v.x += dx * 0.14; v.y += dy * 0.14;
        }
      });

      /* quarantine strip */
      var anyQuar = s.clients.some(function (c) { return c.quar; });
      if (anyQuar) {
        ctx.strokeStyle = col.crit;
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        ctx.strokeRect(f.w * 0.08, f.h - 58, f.w * 0.64, 48);
        ctx.setLineDash([]);
        ctx.fillStyle = col.crit;
        ctx.font = C.font(10.5);
        ctx.textAlign = "left";
        ctx.fillText("quarantine set W̄", f.w * 0.08 + 8, f.h - 15);
        var signed = s.clients.some(function (c) { return c.quar && c.sign; });
        if (signed) {
          ctx.fillStyle = col.s6; ctx.textAlign = "center";
          ctx.fillText("S⁻", cx - 100, f.h - 62);
          ctx.fillStyle = col.s2;
          ctx.fillText("S⁺", cx + 100, f.h - 62);
        }
      }

      /* links server ↔ ring clients */
      s.clients.forEach(function (c) {
        if (c.quar) return;
        var v = vis[c.id];
        ctx.strokeStyle = col.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(v.x, v.y);
        ctx.stroke();
      });

      /* packets on broadcast/upload */
      if (s.key === "broadcast" || s.key === "upload") {
        var down = s.key === "broadcast";
        var pk = C.reducedMotion ? 0.6 : (0.15 + 0.7 * ((performance.now() / 900) % 1));
        s.clients.forEach(function (c) {
          if (c.quar) return;
          var v = vis[c.id];
          var kk = down ? pk : 1 - pk;
          ctx.fillStyle = col.series[c.cohort % 8];
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.arc(C.lerp(cx, v.x, kk), C.lerp(cy, v.y, kk), 3, 0, 7);
          ctx.fill();
          ctx.globalAlpha = 1;
        });
      }

      /* clients */
      s.clients.forEach(function (c) {
        var v = vis[c.id];
        var cc = col.series[c.cohort % 8];
        /* training pulse */
        if (s.key === "train" && !C.reducedMotion) {
          var pu = 0.5 + 0.5 * Math.sin(performance.now() / 180 + c.id);
          ctx.strokeStyle = cc;
          ctx.globalAlpha = 0.35 * pu;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(v.x, v.y, 13, 0, 7); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        /* drift flag ring */
        if (c.flag) {
          ctx.strokeStyle = col.crit;
          ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.arc(v.x, v.y, 12, 0, 7); ctx.stroke();
        }
        ctx.fillStyle = cc;
        ctx.beginPath(); ctx.arc(v.x, v.y, 8.5, 0, 7); ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = C.font(8.5, true);
        ctx.textAlign = "center";
        ctx.fillText(c.id + 1, v.x, v.y + 3);
        /* loss bar */
        var lw = 24, lv = C.clamp((c.loss - 0.2) / 0.4, 0, 1);
        ctx.fillStyle = col.grid;
        ctx.fillRect(v.x - lw / 2, v.y + 13, lw, 3);
        ctx.fillStyle = lv > 0.5 ? col.crit : col.good;
        ctx.fillRect(v.x - lw / 2, v.y + 13, lw * lv, 3);
      });

      /* server */
      ctx.fillStyle = col.surface2;
      ctx.strokeStyle = (s.key === "aggregate" || s.key === "cohort") ? col.s1 : col.axis;
      ctx.lineWidth = 1.6;
      var sw = 56, sh = 34;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - sw / 2, cy - sh / 2, sw, sh, 7);
      else ctx.rect(cx - sw / 2, cy - sh / 2, sw, sh);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = col.ink2;
      ctx.font = C.font(11);
      ctx.textAlign = "center";
      ctx.fillText("server", cx, cy + 4);

      /* inset: projection / clustering panel */
      var ix = f.w * 0.72, iy = 14, iw2 = f.w * 0.26, ih2 = f.h * 0.44;
      if (s.key === "project" || s.key === "cluster" || s.key === "kstest") {
        ctx.fillStyle = col.surface2;
        ctx.strokeStyle = col.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(ix, iy, iw2, ih2, 8); else ctx.rect(ix, iy, iw2, ih2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = col.muted;
        ctx.font = C.font(10);
        ctx.textAlign = "center";
        ctx.fillText(s.key === "kstest" ? "signed KS statistic" : "eigen-projected weights",
          ix + iw2 / 2, iy + 14);
        /* axes */
        ctx.strokeStyle = col.grid;
        ctx.beginPath();
        ctx.moveTo(ix + iw2 / 2, iy + 20); ctx.lineTo(ix + iw2 / 2, iy + ih2 - 8);
        ctx.moveTo(ix + 8, iy + ih2 / 2 + 6); ctx.lineTo(ix + iw2 - 8, iy + ih2 / 2 + 6);
        ctx.stroke();
        s.clients.forEach(function (c) {
          if (!c.quar) return;
          var px = ix + iw2 / 2 + c.fp[0] * (iw2 * 0.34);
          var py = iy + ih2 / 2 + 6 - c.fp[1] * (ih2 * 0.3);
          var dotCol = col.muted;
          if (s.key === "kstest") dotCol = c.sign > 0 ? col.s2 : col.s6;
          if (s.key === "cluster" && c.type) {
            var order2 = ["covP", "covM", "conA", "conB"];
            dotCol = col.series[(1 + order2.indexOf(c.type)) % 8];
          }
          ctx.fillStyle = dotCol;
          ctx.globalAlpha = 0.92;
          ctx.beginPath(); ctx.arc(px, py, 4.5, 0, 7); ctx.fill();
          ctx.globalAlpha = 1;
        });
      }

      /* cohort legend, bottom-right */
      ctx.textAlign = "left";
      ctx.font = C.font(10.5);
      var ly = f.h - 14 - (s.cohorts.length - 1) * 15;
      s.cohorts.forEach(function (co, ci) {
        ctx.fillStyle = col.series[ci % 8];
        ctx.beginPath(); ctx.arc(f.w * 0.78, ly - 3, 4.5, 0, 7); ctx.fill();
        ctx.fillStyle = col.ink2;
        ctx.fillText("cohort " + co.id + (ci === 0 ? " (initial)" : ""), f.w * 0.78 + 10, ly);
        ly += 15;
      });

      return settled;
    }

    /* ---------------- UI wiring --------------------------------- */

    var playing = false, last = 0, acc = 0;
    var playBtn = document.getElementById("sim-play");
    var roundEl = document.getElementById("sim-round");
    var logEl = document.getElementById("sim-log");
    var stageEl = document.getElementById("sim-stage-label");
    var codeTabs = { a1: document.getElementById("algo-a1"),
                     a2: document.getElementById("algo-a2"),
                     a3: document.getElementById("algo-a3") };
    var codeTabBtns = document.getElementById("w-sim").querySelectorAll(".clma-code-tabs button");

    function showAlgo(which) {
      Object.keys(codeTabs).forEach(function (k) { codeTabs[k].hidden = k !== which; });
      codeTabBtns.forEach(function (b) {
        b.setAttribute("aria-selected", b.dataset.algo === which ? "true" : "false");
      });
    }
    codeTabBtns.forEach(function (b) {
      b.addEventListener("click", function () { showAlgo(b.dataset.algo); });
    });

    function applyStep() {
      var s = history[cursor];
      if (!s) return;
      roundEl.textContent = "Round " + s.round + " / " + ROUNDS;
      stageEl.textContent = s.label;
      /* pseudocode highlight */
      showAlgo(s.algo);
      document.querySelectorAll(".clma-code span").forEach(function (sp) {
        sp.classList.toggle("is-live", sp.dataset.l === s.line);
      });
      /* log: rebuild up to cursor (keeps back-stepping consistent) */
      var html = "";
      for (var i = 0; i <= cursor; i++) {
        (history[i].log || []).forEach(function (l) {
          html += '<div class="' + (l.t ? "log-" + l.t : "") + '">' + l.txt + "</div>";
        });
      }
      logEl.innerHTML = html;
      logEl.scrollTop = logEl.scrollHeight;
      draw();
    }

    function syncPlayBtn() {
      playBtn.classList.toggle("is-playing", playing);
      playBtn.innerHTML = playing ? "&#10074;&#10074;" : "&#9654;";
      playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    }

    var loop = C.raf(canvas, function (now) {
      if (!last) last = now;
      var dt = now - last; last = now;
      if (playing) {
        var speed = +document.getElementById("sim-speed").value;
        acc += dt * speed;
        var stepDur = history[cursor] && (history[cursor].key === "train" ? 1500 : 1250);
        if (acc > stepDur) {
          acc = 0;
          if (cursor < history.length - 1) { cursor++; applyStep(); }
          else { playing = false; syncPlayBtn(); }
        }
      }
      draw();   /* keep tweens + pulses moving even when paused */
    });

    function params() {
      return {
        gamma: +document.getElementById("sim-gamma").value / 100,
        nDrift: +document.getElementById("sim-ndrift").value,
        mix: document.getElementById("sim-mix").value
      };
    }

    function reset() {
      playing = false; syncPlayBtn();
      generate(params());
      cursor = 0; acc = 0;
      vis.forEach(function (v) { v.init = false; });
      applyStep();
      loop.start();
    }

    playBtn.addEventListener("click", function () {
      if (cursor >= history.length - 1) { cursor = 0; vis.forEach(function (v) { v.init = false; }); }
      playing = !playing;
      if (C.reducedMotion && playing) { playing = false; if (cursor < history.length - 1) { cursor++; applyStep(); } }
      last = 0; acc = 0;
      syncPlayBtn();
      loop.start();
    });
    document.getElementById("sim-fwd").addEventListener("click", function () {
      playing = false; syncPlayBtn();
      if (cursor < history.length - 1) { cursor++; applyStep(); }
    });
    document.getElementById("sim-back").addEventListener("click", function () {
      playing = false; syncPlayBtn();
      if (cursor > 0) { cursor--; applyStep(); }
    });
    document.getElementById("sim-reset").addEventListener("click", reset);

    document.getElementById("sim-gamma").addEventListener("input", function () {
      document.getElementById("sim-gamma-val").textContent = (+this.value / 100).toFixed(2);
      reset();
    });
    document.getElementById("sim-ndrift").addEventListener("input", function () {
      document.getElementById("sim-ndrift-val").textContent = this.value;
      reset();
    });
    document.getElementById("sim-mix").addEventListener("change", reset);

    reset();
    C.onThemeChange(draw);
    window.addEventListener("resize", draw);
  });
})();
