/* ==================================================================
   uxv-sim.js — the wildfire mission engine.

   One engine, two widgets:
   · §02 "race": two locked-parameter instances side by side (siloed
     vs ecosystem) on the same seed — a controlled experiment the
     visitor runs with one button.
   · §07 "simulator": one full instance with sliders, mode switch,
     comm jamming (DTN buffering) and click-to-kill vehicles
     (dynamic re-tasking), narrated by an event log.

   The ecosystem loop implemented here is the paper's architecture
   in miniature: UAV discoveries are *published* to a shared world
   model, rescue tasks are *auctioned* to UGVs by cost, a USV serves
   as a mobile ferry point, jamming exercises DTN store-and-forward,
   and vehicle failures trigger re-auctions. Siloed mode disables
   exactly one thing — cross-domain information flow — so every
   performance gap on screen is attributable to it.
================================================================== */
(function () {
  "use strict";
  var U = window.UXV;

  var GW = 44, GH = 26;          /* grid cells */
  var RIVER_ROWS = 3;            /* bottom rows are water */
  var BURN_LIFE = 70;            /* ticks a cell burns before burnt-out */

  /* ----------------------------------------------------------------
     Mission instance
  ---------------------------------------------------------------- */
  function createMission(opts) {
    var M = {
      mode: opts.mode || "eco",       /* "eco" | "silo" */
      nUAV: opts.nUAV != null ? opts.nUAV : 3,
      nUGV: opts.nUGV != null ? opts.nUGV : 3,
      nCiv: opts.nCiv != null ? opts.nCiv : 10,
      fireRate: opts.fireRate != null ? opts.fireRate : 0.4,
      jammed: false,
      log: opts.log || function () {},
      seed: 1
    };

    M.reset = function (seed) {
      M.seed = seed;
      var r = U.rng(seed);
      M.tickN = 0;
      M.explored = new Uint8Array(GW * GH);
      M.fire = new Int16Array(GW * GH);      /* 0 none, >0 burning age, -1 burnt */
      M.buffer = [];                         /* DTN-buffered discoveries */
      M.bufferFire = [];

      /* exit zone: left edge, above the river */
      M.exit = { x: 1.2, y: (GH - RIVER_ROWS) / 2 };

      /* fire ignition: right half of the forest */
      var fx = 26 + Math.floor(r() * (GW - 28)), fy = 2 + Math.floor(r() * (GH - RIVER_ROWS - 4));
      M.fire[fy * GW + fx] = 1;

      /* civilians scattered in the forest, away from the exit */
      M.civs = [];
      for (var i = 0; i < M.nCiv; i++) {
        var cx, cy, tries = 0;
        do {
          cx = 6 + r() * (GW - 9);
          cy = 1.5 + r() * (GH - RIVER_ROWS - 3);
          tries++;
        } while (tries < 30 && (U.dist(cx, cy, fx, fy) < 6 || U.dist(cx, cy, M.exit.x, M.exit.y) < 7));
        M.civs.push({ id: i + 1, x: cx, y: cy, state: "hidden", by: null, escort: null });
      }

      /* fleet */
      M.uavs = [];
      for (i = 0; i < M.nUAV; i++) {
        M.uavs.push({ id: i + 1, x: 2 + r() * 4, y: 2 + i * 3, wp: null, sweepRow: null, dir: 1, dead: false });
      }
      M.ugvs = [];
      for (i = 0; i < M.nUGV; i++) {
        M.ugvs.push({ id: i + 1, x: 2, y: M.exit.y - 3 + i * 3, task: null, carrying: null, wp: null, dead: false });
      }
      M.usv = { id: 1, x: GW * 0.3, y: GH - RIVER_ROWS / 2 - 0.5, dir: 1, dead: false };
      M.rescued = 0; M.lost = 0;
      M.done = false;
      M.rng = r;
    };

    function forestCell(x, y) {
      return x >= 0 && x < GW && y >= 0 && y < GH - RIVER_ROWS;
    }
    function idx(x, y) { return (y | 0) * GW + (x | 0); }

    M.foundCount = function () {
      return M.civs.filter(function (c) { return c.state !== "hidden"; }).length;
    };
    M.mappedPct = function () {
      var tot = GW * (GH - RIVER_ROWS), n = 0;
      for (var i = 0; i < GW * GH; i++) if (M.explored[i] && (i / GW | 0) < GH - RIVER_ROWS) n++;
      return Math.round(100 * n / tot);
    };
    M.burnedPct = function () {
      var tot = GW * (GH - RIVER_ROWS), n = 0;
      for (var i = 0; i < tot * 1; i++) if (M.fire[i] !== 0) n++;
      return Math.round(100 * n / tot);
    };

    function reveal(x, y, rad) {
      for (var dy = -rad; dy <= rad; dy++) for (var dx = -rad; dx <= rad; dx++) {
        var nx = (x | 0) + dx, ny = (y | 0) + dy;
        if (nx >= 0 && nx < GW && ny >= 0 && ny < GH && dx * dx + dy * dy <= rad * rad) {
          M.explored[ny * GW + nx] = 1;
        }
      }
    }

    function publish(civ, byWhom) {
      civ.state = "found";
      civ.by = byWhom;
      M.log("good", byWhom + " located civ-" + civ.id + " → published to DWM");
    }

    function discover(civ, byWhom, isUAV) {
      if (civ.state !== "hidden") return;
      if (isUAV) {
        if (M.mode === "silo") {
          /* the UAV sees the civilian, but there is no channel to share it */
          civ.seenByAir = true;
          return;
        }
        if (M.jammed) {
          civ.state = "buffered";
          M.buffer.push(civ);
          M.log("uav", byWhom + " sees civ-" + civ.id + " — comms jammed, buffering (DTN)");
          return;
        }
        publish(civ, byWhom);
      } else {
        civ.state = "found";
        civ.by = byWhom;
        M.log("ugv", byWhom + " found civ-" + civ.id + " on the ground");
      }
    }

    /* auction one civilian to the cheapest UGV */
    function auction(civ) {
      var alive = M.ugvs.filter(function (g) { return !g.dead; });
      if (!alive.length) return false;
      var bids = alive.map(function (g) {
        var queue = g.task ? 1 : 0;
        return { g: g, bid: U.dist(g.x, g.y, civ.x, civ.y) + queue * 26 };
      }).sort(function (a, b) { return a.bid - b.bid; });
      var win = bids[0];
      if (win.g.task) return false;    /* everyone busy; retry next tick */
      win.g.task = civ;
      civ.state = "assigned";
      var msg = "AUCTION civ-" + civ.id + " → UGV-" + win.g.id + " (bid " + win.bid.toFixed(1);
      if (bids[1]) msg += " beats " + bids[1].bid.toFixed(1);
      M.log("ugv", msg + ")");
      return true;
    }

    function dropTask(g, reason) {
      if (g.task) {
        var civ = g.task;
        civ.state = "found";
        if (g.carrying === civ) { civ.x = g.x; civ.y = g.y; }
        g.task = null;
        g.carrying = null;
        M.log("crit", "UGV-" + g.id + " " + reason + " — civ-" + civ.id + " re-auctioned");
      } else {
        M.log("crit", (reason.indexOf("UAV") === 0 ? "" : "UGV-" + g.id + " ") + reason);
      }
    }

    M.setJam = function (on) {
      if (on === M.jammed) return;
      M.jammed = on;
      if (on) M.log("crit", "COMMS JAMMED — UAV observations will buffer on board");
      else {
        M.log("good", "Comms restored — DTN flushing " + M.buffer.length + " buffered observation(s) to DWM");
        M.buffer.forEach(function (civ) { if (civ.state === "buffered") publish(civ, "DTN"); });
        M.buffer = [];
      }
    };

    M.killAt = function (cx, cy) {   /* cx, cy in cell units */
      var best = null, bd = 2.6;
      M.uavs.concat(M.ugvs).concat([M.usv]).forEach(function (v) {
        if (v.dead) return;
        var d = U.dist(v.x, v.y, cx, cy);
        if (d < bd) { bd = d; best = v; }
      });
      if (!best) return false;
      best.dead = true;
      if (M.ugvs.indexOf(best) >= 0) dropTask(best, "disabled");
      else if (best === M.usv) M.log("crit", "USV disabled — ferry point lost, rescues fall back to the exit");
      else M.log("crit", "UAV-" + best.id + " disabled — search coverage reduced");
      return true;
    };

    function moveToward(v, tx, ty, speed) {
      var d = U.dist(v.x, v.y, tx, ty);
      if (d < 0.15) return true;
      v.x += (tx - v.x) / d * Math.min(speed, d);
      v.y += (ty - v.y) / d * Math.min(speed, d);
      return U.dist(v.x, v.y, tx, ty) < 0.2;
    }

    M.tick = function () {
      if (M.done) return;
      M.tickN++;

      /* ---- fire spread ---- */
      if (M.tickN % 2 === 0) {
        var igniting = [];
        for (var y = 0; y < GH - RIVER_ROWS; y++) for (var x = 0; x < GW; x++) {
          var f = M.fire[y * GW + x];
          if (f > 0) {
            M.fire[y * GW + x] = f + 1 > BURN_LIFE ? -1 : f + 1;
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
              var nx = x + d[0], ny = y + d[1];
              if (forestCell(nx, ny) && M.fire[ny * GW + nx] === 0 &&
                  M.rng() < 0.011 * M.fireRate * 2.2) {
                igniting.push(ny * GW + nx);
              }
            });
          }
        }
        igniting.forEach(function (i) { M.fire[i] = 1; });
      }

      /* civilians caught by fire */
      M.civs.forEach(function (c) {
        if (c.state === "rescued" || c.state === "lost" || c.escorted) return;
        var f = M.fire[idx(c.x, c.y)];
        if (f !== 0) {
          c.state = "lost";
          M.lost++;
          M.log("crit", "civ-" + c.id + " lost to the fire");
          M.ugvs.forEach(function (g) { if (g.task === c) { g.task = null; g.carrying = null; } });
        }
      });

      /* ---- UAVs: lawnmower sweep, reveal, discover ---- */
      var aliveUAVs = M.uavs.filter(function (v) { return !v.dead; });
      aliveUAVs.forEach(function (v, i) {
        var bandH = (GH - RIVER_ROWS) / Math.max(1, aliveUAVs.length);
        var y0 = i * bandH;
        if (v.sweepRow === null || v.sweepRow < y0 || v.sweepRow > y0 + bandH) {
          v.sweepRow = y0 + 1;
          v.dir = 1;
        }
        var tx = v.dir > 0 ? GW - 1.5 : 1.5;
        if (moveToward(v, tx, v.sweepRow, 0.55)) {
          v.dir *= -1;
          v.sweepRow += bandH / 3.2;
          if (v.sweepRow > y0 + bandH - 0.5) v.sweepRow = y0 + 1;
        }
        reveal(v.x, v.y, 3);
        M.civs.forEach(function (c) {
          if (U.dist(v.x, v.y, c.x, c.y) < 3) discover(c, "UAV-" + v.id, true);
        });
      });

      /* ---- assignment (ecosystem only) ---- */
      if (M.mode === "eco") {
        M.civs.forEach(function (c) {
          if (c.state === "found") auction(c);
        });
      }

      /* ---- UGVs ---- */
      M.ugvs.forEach(function (g) {
        if (g.dead) return;
        reveal(g.x, g.y, 2);
        /* ground discovery (both modes) */
        M.civs.forEach(function (c) {
          if (U.dist(g.x, g.y, c.x, c.y) < 1.8) discover(c, "UGV-" + g.id, false);
        });
        /* siloed: self-assign only what this UGV itself can see */
        if (M.mode === "silo" && !g.task) {
          var near = M.civs.filter(function (c) { return c.state === "found"; })
            .sort(function (a, b) { return U.dist(g.x, g.y, a.x, a.y) - U.dist(g.x, g.y, b.x, b.y); })[0];
          if (near) { g.task = near; near.state = "assigned"; }
        }
        if (g.task) {
          var c = g.task;
          if (!g.carrying) {
            if (moveToward(g, c.x, c.y, 0.3)) {
              g.carrying = c;
              c.escorted = true;
              M.log("ugv", "UGV-" + g.id + " escorting civ-" + c.id);
            }
          } else {
            /* nearest rescue point: exit, or the USV ferry in eco mode */
            var tgt = M.exit;
            if (M.mode === "eco" && !M.usv.dead) {
              var dUsv = U.dist(g.x, g.y, M.usv.x, M.usv.y - 1.2);
              if (dUsv < U.dist(g.x, g.y, M.exit.x, M.exit.y)) tgt = { x: M.usv.x, y: M.usv.y - 1.2 };
            }
            c.x = g.x; c.y = g.y;
            if (moveToward(g, tgt.x, tgt.y, 0.26)) {
              c.state = "rescued";
              c.escorted = false;
              M.rescued++;
              M.log("good", "civ-" + c.id + " safe" + (tgt === M.exit ? " at the exit" : " — ferried by USV") +
                " (" + M.rescued + "/" + M.nCiv + ")");
              g.task = null;
              g.carrying = null;
            }
          }
        } else {
          /* wander-search */
          if (!g.wp || moveToward(g, g.wp.x, g.wp.y, 0.3)) {
            g.wp = { x: 2 + M.rng() * (GW - 4), y: 1 + M.rng() * (GH - RIVER_ROWS - 2) };
          }
        }
      });

      /* ---- USV: patrol the river ---- */
      if (!M.usv.dead) {
        M.usv.x += M.usv.dir * 0.22;
        if (M.usv.x > GW - 3) M.usv.dir = -1;
        if (M.usv.x < 3) M.usv.dir = 1;
      }

      /* ---- end condition ---- */
      var open = M.civs.some(function (c) {
        return c.state !== "rescued" && c.state !== "lost";
      });
      if (!open) {
        M.done = true;
        M.log("t", "Mission complete at t=" + M.tickN + ": " + M.rescued + " rescued, " + M.lost + " lost.");
      }
    };

    /* --------------------------------------------------------------
       Rendering
    -------------------------------------------------------------- */
    M.draw = function (canvas, t, showLinks) {
      var f = U.fitCanvas(canvas, Math.round((canvas.clientWidth || 400) * GH / GW));
      var ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      var cs = w / GW;
      ctx.clearRect(0, 0, w, h);

      /* terrain */
      for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
        var px = x * cs, py = y * cs;
        if (y >= GH - RIVER_ROWS) {
          ctx.fillStyle = C.sea;
          ctx.globalAlpha = 0.22;
          ctx.fillRect(px, py, cs + 0.5, cs + 0.5);
          ctx.globalAlpha = 1;
          continue;
        }
        var fi = M.fire[y * GW + x];
        if (fi > 0) {
          ctx.fillStyle = (x + y + ((t * 6) | 0)) % 2 ? C.fire : C.s4;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(px, py, cs + 0.5, cs + 0.5);
          ctx.globalAlpha = 1;
        } else if (fi === -1) {
          ctx.fillStyle = C.ink;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(px, py, cs + 0.5, cs + 0.5);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = C.s7;
          ctx.globalAlpha = M.explored[y * GW + x] ? 0.16 : 0.05;
          ctx.fillRect(px, py, cs + 0.5, cs + 0.5);
          ctx.globalAlpha = 1;
        }
      }

      /* exit */
      ctx.strokeStyle = C.good;
      ctx.lineWidth = 2;
      ctx.strokeRect(0.2 * cs, (M.exit.y - 1.6) * cs, 2 * cs, 3.2 * cs);
      ctx.lineWidth = 1;
      ctx.fillStyle = C.good;
      ctx.font = U.font(Math.max(9, cs * 1.1), true);
      ctx.textAlign = "left";
      ctx.save();
      ctx.translate(0.9 * cs, (M.exit.y + 2.6) * cs);
      ctx.fillText("EXIT", 0, 0);
      ctx.restore();

      /* civilians */
      M.civs.forEach(function (c) {
        var px = c.x * cs, py = c.y * cs;
        if (c.state === "hidden" || c.state === "buffered") {
          if (M.explored[idx(c.x, c.y)]) { /* revealed terrain but not spotted: nothing */ }
          if (c.state === "buffered") {
            ctx.strokeStyle = C.warn;
            ctx.setLineDash([2, 2]);
            ctx.beginPath(); ctx.arc(px, py, cs * 0.55, 0, 6.29); ctx.stroke();
            ctx.setLineDash([]);
          }
          return;
        }
        if (c.state === "lost") {
          ctx.strokeStyle = C.ink2;
          ctx.beginPath();
          ctx.moveTo(px - 3, py - 3); ctx.lineTo(px + 3, py + 3);
          ctx.moveTo(px + 3, py - 3); ctx.lineTo(px - 3, py + 3);
          ctx.stroke();
          return;
        }
        if (c.state === "rescued") return;
        ctx.fillStyle = C.s4;
        ctx.beginPath(); ctx.arc(px, py, cs * 0.36, 0, 6.29); ctx.fill();
        if (c.state === "assigned") {
          ctx.strokeStyle = C.s4;
          ctx.beginPath();
          ctx.arc(px, py, cs * 0.6 + Math.sin(t * 5) * 1.5, 0, 6.29);
          ctx.stroke();
        }
      });

      /* comm links: UAVs publishing into the shared model */
      if (showLinks && M.mode === "eco" && !M.jammed) {
        ctx.strokeStyle = C.s1;
        ctx.globalAlpha = 0.18;
        M.uavs.forEach(function (v) {
          if (v.dead) return;
          M.ugvs.forEach(function (g) {
            if (g.dead) return;
            ctx.beginPath();
            ctx.moveTo(v.x * cs, v.y * cs);
            ctx.lineTo(g.x * cs, g.y * cs);
            ctx.stroke();
          });
        });
        ctx.globalAlpha = 1;
      }

      /* fleet */
      M.uavs.forEach(function (v) {
        U.glyph.uav(ctx, v.x * cs, v.y * cs, cs * 0.55, v.dir > 0 ? 0 : Math.PI, v.dead ? C.muted : C.air);
        if (v.dead) cross(ctx, v.x * cs, v.y * cs, C.crit);
        else if (M.jammed && M.mode === "eco") {
          ctx.fillStyle = C.warn;
          ctx.font = U.font(9, true);
          ctx.textAlign = "center";
          ctx.fillText("buffering", v.x * cs, v.y * cs - cs * 0.9);
        }
      });
      M.ugvs.forEach(function (g) {
        U.glyph.ugv(ctx, g.x * cs, g.y * cs, cs * 0.48, 0, g.dead ? C.muted : C.ground);
        if (g.dead) cross(ctx, g.x * cs, g.y * cs, C.crit);
        if (g.carrying) {
          ctx.fillStyle = C.s4;
          ctx.beginPath(); ctx.arc(g.x * cs, (g.y - 0.8) * cs, cs * 0.3, 0, 6.29); ctx.fill();
        }
      });
      if (M.usv) {
        U.glyph.usv(ctx, M.usv.x * cs, M.usv.y * cs, cs * 0.55, 0, M.usv.dead ? C.muted : C.sea);
        if (M.usv.dead) cross(ctx, M.usv.x * cs, M.usv.y * cs, C.crit);
      }

      function cross(ctx2, px, py, col) {
        ctx2.strokeStyle = col;
        ctx2.lineWidth = 2;
        ctx2.beginPath();
        ctx2.moveTo(px - 5, py - 5); ctx2.lineTo(px + 5, py + 5);
        ctx2.moveTo(px + 5, py - 5); ctx2.lineTo(px - 5, py + 5);
        ctx2.stroke();
        ctx2.lineWidth = 1;
      }
      return { cellSize: cs };
    };

    M.reset(opts.seed || 20250717);
    return M;
  }

  /* ================================================================
     §02 — the race
  ================================================================ */
  document.addEventListener("DOMContentLoaded", function () {
    var cSilo = document.getElementById("race-silo");
    if (!cSilo) return;
    var cEco = document.getElementById("race-eco");
    var playBtn = document.getElementById("race-play");
    var resetBtn = document.getElementById("race-reset");
    var reseedBtn = document.getElementById("race-reseed");
    var verdict = document.getElementById("race-verdict");
    var seed = 20250717;
    var LIMIT = 850;

    var silo = createMission({ mode: "silo", nCiv: 8, nUAV: 3, nUGV: 3, fireRate: 0.32, seed: seed });
    var eco = createMission({ mode: "eco", nCiv: 8, nUAV: 3, nUGV: 3, fireRate: 0.32, seed: seed });
    var playing = false, acc = 0, lastT = 0;

    function stats() {
      document.getElementById("race-silo-rescued").textContent = silo.rescued + "/8";
      document.getElementById("race-silo-found").textContent = silo.foundCount();
      document.getElementById("race-silo-burn").textContent = silo.burnedPct() + "%";
      document.getElementById("race-eco-rescued").textContent = eco.rescued + "/8";
      document.getElementById("race-eco-found").textContent = eco.foundCount();
      document.getElementById("race-eco-burn").textContent = eco.burnedPct() + "%";
    }

    function maybeVerdict() {
      var over = (silo.done && eco.done) || silo.tickN >= LIMIT;
      if (!over) return;
      playing = false;
      playBtn.classList.remove("is-playing");
      playBtn.innerHTML = "&#9654;";
      verdict.innerHTML = "<strong>Ecosystem: " + eco.rescued + "/8 rescued · Siloed: " + silo.rescued +
        "/8.</strong> Identical vehicles, identical fire, identical time. The entire difference is that on the right, a UAV sighting becomes a UGV task.";
    }

    function step() {
      if (silo.tickN < LIMIT) { silo.tick(); }
      if (eco.tickN < LIMIT) { eco.tick(); }
      stats();
      maybeVerdict();
    }

    playBtn.addEventListener("click", function () {
      playing = !playing;
      playBtn.classList.toggle("is-playing", playing);
      playBtn.innerHTML = playing ? "&#9646;&#9646;" : "&#9654;";
    });
    function doReset(newSeed) {
      if (newSeed) seed = (seed * 16807 + 11) % 2147483647;
      silo.reset(seed);
      eco.reset(seed);
      playing = false;
      playBtn.classList.remove("is-playing");
      playBtn.innerHTML = "&#9654;";
      verdict.textContent = "Same hardware. The only variable is whether information crosses the domain boundary.";
      stats();
    }
    resetBtn.addEventListener("click", function () { doReset(false); });
    reseedBtn.addEventListener("click", function () { doReset(true); });

    var loop = U.raf(cSilo, function (tm) {
      var t = tm / 1000;
      var dt = lastT ? Math.min(t - lastT, 0.1) : 0;
      lastT = t;
      if (playing) {
        acc += dt;
        while (acc > 1 / 14) { acc -= 1 / 14; step(); }
      }
      silo.draw(cSilo, t, false);
      eco.draw(cEco, t, true);
    });
    loop.start();
    stats();
  });

  /* ================================================================
     §07 — the full simulator
  ================================================================ */
  document.addEventListener("DOMContentLoaded", function () {
    var canvas = document.getElementById("sim-canvas");
    if (!canvas) return;
    var logEl = document.getElementById("sim-log");
    var playBtn = document.getElementById("sim-play");
    var stepBtn = document.getElementById("sim-step");
    var resetBtn = document.getElementById("sim-reset");
    var speedSel = document.getElementById("sim-speed");
    var jamBtn = document.getElementById("sim-jam");
    var uavIn = document.getElementById("sim-uavs");
    var uavVal = document.getElementById("sim-uavs-val");
    var fireIn = document.getElementById("sim-fire");
    var seed = 99123;

    var lines = 0;
    function log(kind, msg) {
      lines++;
      if (lines > 400) { logEl.innerHTML = ""; lines = 0; }
      var span = document.createElement("div");
      span.innerHTML = '<span class="log-t">t=' + String(sim ? sim.tickN : 0).padStart(3, "0") + "</span> " +
        '<span class="log-' + kind + '">' + msg + "</span>";
      logEl.appendChild(span);
      logEl.scrollTop = logEl.scrollHeight;
    }

    var sim = createMission({
      mode: "eco", nCiv: 10, nUAV: +uavIn.value, nUGV: 3,
      fireRate: +fireIn.value / 100, seed: seed, log: log
    });
    log("t", "Ecosystem mode. Press play — or sabotage something first.");

    var playing = false, acc = 0, lastT = 0;

    function metrics() {
      document.getElementById("m-rescued").textContent = sim.rescued + " / " + sim.nCiv;
      document.getElementById("m-found").textContent = sim.foundCount();
      document.getElementById("m-mapped").textContent = sim.mappedPct() + "%";
      document.getElementById("m-burned").textContent = sim.burnedPct() + "%";
    }

    function rebuild() {
      var mode = sim.mode;
      sim = createMission({
        mode: mode, nCiv: 10, nUAV: +uavIn.value, nUGV: 3,
        fireRate: +fireIn.value / 100, seed: seed, log: log
      });
      logEl.innerHTML = "";
      lines = 0;
      log("t", (mode === "eco" ? "Ecosystem" : "Siloed") + " mode · " + uavIn.value + " UAVs · fire rate " + fireIn.value + "%");
      jamBtn.setAttribute("aria-pressed", "false");
      metrics();
    }

    playBtn.addEventListener("click", function () {
      playing = !playing;
      playBtn.classList.toggle("is-playing", playing);
      playBtn.innerHTML = playing ? "&#9646;&#9646;" : "&#9654;";
    });
    stepBtn.addEventListener("click", function () { sim.tick(); metrics(); });
    resetBtn.addEventListener("click", rebuild);
    uavIn.addEventListener("input", function () { uavVal.textContent = uavIn.value; });
    uavIn.addEventListener("change", rebuild);
    fireIn.addEventListener("change", rebuild);

    jamBtn.addEventListener("click", function () {
      var on = jamBtn.getAttribute("aria-pressed") !== "true";
      jamBtn.setAttribute("aria-pressed", String(on));
      sim.setJam(on);
    });

    U.tabs(document.getElementById("sim-mode-tabs"), function (key) {
      sim.mode = key;
      rebuild();
    });

    canvas.addEventListener("click", function (evt) {
      var rect = canvas.getBoundingClientRect();
      var cs = rect.width / GW;
      var cx = (evt.clientX - rect.left) / cs;
      var cy = (evt.clientY - rect.top) / cs;
      sim.killAt(cx, cy);
    });

    var loop = U.raf(canvas, function (tm) {
      var t = tm / 1000;
      var dt = lastT ? Math.min(t - lastT, 0.1) : 0;
      lastT = t;
      if (playing && !sim.done) {
        acc += dt * (+speedSel.value);
        while (acc > 1 / 12) { acc -= 1 / 12; sim.tick(); }
        metrics();
      }
      sim.draw(canvas, t, true);
    });
    loop.start();
    metrics();
  });
})();
