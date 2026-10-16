/* ==================================================================
   adgt-scene.js: the bird's-eye-view figures.

   1. Hero "answer key" (#w-hero): a schematic redrawing of the paper's
      Fig. 1. Object positions are illustrative; every count shown
      (29 / 22 / 29 references, TP / FP / FN) is the paper's.
   2. Reference builder (#w-builder): a synthetic intersection where the
      ground truth is assembled exactly as in Eqs. (1), (2), (5) and (6):
      radius filter on agents, then the union of what each surviving
      agent can see. Visibility is ray-cast against buildings and other
      vehicles, so an agent never annotates its own box.
   3. Radius drift (#w-radius): the same assembly over time on a
      synthetic street with no fault injected, to show the reference
      moving as agents cross the communication radius (Sec. 3.3).

   Nothing here runs a detector. Figures 2 and 3 compute only set
   membership, which is the quantity the paper is about.
================================================================== */
(function () {
  "use strict";
  var AG = window.AG;
  var D = AG.DATA;

  /* ================================================================
     Geometry
  ================================================================ */

  function boxCorners(x, y, l, w, h) {
    var c = Math.cos(h), s = Math.sin(h), hl = l / 2, hw = w / 2;
    return [
      [x + c * hl - s * hw, y + s * hl + c * hw],
      [x - c * hl - s * hw, y - s * hl + c * hw],
      [x - c * hl + s * hw, y - s * hl - c * hw],
      [x + c * hl + s * hw, y + s * hl - c * hw]
    ];
  }

  /* does segment p->q cross segment a->b (proper intersection) */
  function crosses(px, py, qx, qy, ax, ay, bx, by) {
    var d1x = qx - px, d1y = qy - py, d2x = bx - ax, d2y = by - ay;
    var den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-9) return false;
    var t = ((ax - px) * d2y - (ay - py) * d2x) / den;
    var u = ((ax - px) * d1y - (ay - py) * d1x) / den;
    return t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1;
  }

  /* distance along ray (ox,oy)+t(dx,dy) to segment, or Infinity */
  function rayHit(ox, oy, dx, dy, ax, ay, bx, by) {
    var ex = bx - ax, ey = by - ay;
    var den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) return Infinity;
    var t = ((ax - ox) * ey - (ay - oy) * ex) / den;
    var u = ((ax - ox) * dy - (ay - oy) * dx) / den;
    return t > 0 && u >= 0 && u <= 1 ? t : Infinity;
  }

  function rectSegs(r, out) {
    var x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3];
    out.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
  }

  function polySegs(c, out, tag) {
    for (var i = 0; i < 4; i++) {
      var a = c[i], b = c[(i + 1) % 4];
      var s = [a[0], a[1], b[0], b[1]];
      s.tag = tag;
      out.push(s);
    }
  }

  /* ================================================================
     Visibility: which objects can agent `a` annotate?
     Visible if the object is within range and at least one of its
     centre and four corners has a clear line of sight past buildings
     and every other vehicle. An agent never annotates itself.
  ================================================================ */

  function visibleSet(agent, objs, buildSegs, range) {
    var out = [];
    var occ = [];
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (o.id === agent.selfId) continue;
      var dx = o.x - agent.x, dy = o.y - agent.y;
      if (dx * dx + dy * dy > range * range) continue;
      occ.push(o);
    }
    for (var k = 0; k < objs.length; k++) {
      var t = objs[k];
      if (t.id === agent.selfId) continue;
      var ddx = t.x - agent.x, ddy = t.y - agent.y;
      if (ddx * ddx + ddy * ddy > range * range) continue;
      var pts = [[t.x, t.y]].concat(t.c);
      var seen = false;
      for (var p = 0; p < pts.length && !seen; p++) {
        var px = pts[p][0], py = pts[p][1];
        /* pull corner samples slightly inside the box */
        if (p > 0) { px = px * 0.8 + t.x * 0.2; py = py * 0.8 + t.y * 0.2; }
        var blocked = false;
        for (var s = 0; s < buildSegs.length && !blocked; s++) {
          var g = buildSegs[s];
          if (crosses(agent.x, agent.y, px, py, g[0], g[1], g[2], g[3])) blocked = true;
        }
        for (var m = 0; m < occ.length && !blocked; m++) {
          var q = occ[m];
          if (q === t) continue;
          /* quick reject: occluder must be closer than target */
          var qx = q.x - agent.x, qy = q.y - agent.y;
          if (qx * qx + qy * qy > ddx * ddx + ddy * ddy + 9) continue;
          var c = q.c;
          for (var e = 0; e < 4 && !blocked; e++) {
            var a1 = c[e], b1 = c[(e + 1) % 4];
            if (crosses(agent.x, agent.y, px, py, a1[0], a1[1], b1[0], b1[1])) blocked = true;
          }
        }
        if (!blocked) seen = true;
      }
      if (seen) out.push(t.id);
    }
    return out;
  }

  /* sightline polygon by ray casting (for drawing only) */
  function sightPoly(agent, segs, range, n) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var dx = Math.cos(a), dy = Math.sin(a), best = range;
      for (var s = 0; s < segs.length; s++) {
        var g = segs[s];
        if (g.tag === agent.selfId) continue;
        var h = rayHit(agent.x, agent.y, dx, dy, g[0], g[1], g[2], g[3]);
        if (h < best) best = h;
      }
      pts.push(agent.x + dx * best, agent.y + dy * best);
    }
    return pts;
  }

  /* ================================================================
     Drawing helpers (world metres -> canvas pixels, y up)
  ================================================================ */

  function makeView(w, h, box, pad) {
    pad = pad || 8;
    var sx = (w - 2 * pad) / (box[2] - box[0]);
    var sy = (h - 2 * pad) / (box[3] - box[1]);
    var s = Math.min(sx, sy);
    var ox = (w - s * (box[2] - box[0])) / 2 - box[0] * s;
    var oy = (h + s * (box[3] - box[1])) / 2 + box[1] * s;
    return {
      s: s,
      x: function (X) { return ox + X * s; },
      y: function (Y) { return oy - Y * s; },
      ix: function (px) { return (px - ox) / s; },
      iy: function (py) { return (oy - py) / s; }
    };
  }

  function pathPoly(ctx, v, c) {
    ctx.beginPath();
    ctx.moveTo(v.x(c[0][0]), v.y(c[0][1]));
    for (var i = 1; i < c.length; i++) ctx.lineTo(v.x(c[i][0]), v.y(c[i][1]));
    ctx.closePath();
  }

  function withAlpha(color, a) {
    if (!color) return "rgba(0,0,0," + a + ")";
    if (color[0] === "#") {
      var n = parseInt(color.slice(1), 16);
      return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
    }
    return color;
  }
  AG.withAlpha = withAlpha;

  function drawAgentMark(ctx, v, ag, color, opts) {
    opts = opts || {};
    var c = boxCorners(ag.x, ag.y, ag.l || 4.8, ag.w || 2.1, ag.h || 0);
    pathPoly(ctx, v, c);
    if (!opts.off && !opts.ring) { ctx.fillStyle = color; ctx.fill(); }
    ctx.lineWidth = opts.off ? 1.5 : opts.ring ? 2 : 1;
    ctx.setLineDash(opts.off ? [3, 3] : []);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.setLineDash([]);
    if (opts.label) {
      ctx.font = AG.font(opts.fs || 11, true);
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(opts.label, v.x(ag.x), v.y(ag.y) - Math.max(7, v.s * 1.6));
    }
    if (opts.off) {
      var X = v.x(ag.x), Y = v.y(ag.y), r = Math.max(4, v.s * 1.4);
      ctx.beginPath();
      ctx.moveTo(X - r, Y - r); ctx.lineTo(X + r, Y + r);
      ctx.moveTo(X + r, Y - r); ctx.lineTo(X - r, Y + r);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }

  /* ================================================================
     1. HERO: the moving answer key (schematic of Fig. 1)
  ================================================================ */

  function heroScene() {
    var L = 3.5;               /* lane width */
    var lanes = [-1.5 * L, -0.5 * L, 0.5 * L, 1.5 * L];
    var park = 8.8;
    var ego = { x: 6, y: lanes[1], h: 0, l: 4.8, w: 2.1 };
    var collab = { x: 82, y: lanes[3], h: Math.PI, l: 4.8, w: 2.1 };
    var bus = { x: 28, y: lanes[1], l: 12, w: 2.8, h: 0 };

    /* E: visible to the ego (22). U: only the collaborator (7).
       tpA/tpB: detected with both agents / after the drop. */
    var objs = [];
    function add(x, y, set, tpA, tpB, extra) {
      var o = { x: x, y: y, set: set, tpA: tpA, tpB: tpB, l: 4.6, w: 2.0, h: 0 };
      if (extra) for (var k in extra) o[k] = extra[k];
      objs.push(o);
    }
    /* 22 ego-visible: 17 detected, 5 missed, unchanged by the drop */
    [15, 27, 39, 51].forEach(function (x) { add(x, lanes[3], "E", true, true); });
    add(63, lanes[3], "E", false, false);
    add(collab.x, collab.y, "E", true, true, { isCollab: true, h: Math.PI });
    [14, 25, 36].forEach(function (x) { add(x, lanes[2], "E", true, true); });
    add(14, lanes[1], "E", true, true);
    add(bus.x, bus.y, "E", true, true, { l: bus.l, w: bus.w });
    [12, 24].forEach(function (x) { add(x, lanes[0], "E", true, true); });
    add(35, lanes[0], "E", false, false);
    [10, 22, 34].forEach(function (x) { add(x, park, "E", true, true); });
    [46, 58].forEach(function (x) { add(x, park, "E", false, false); });
    [16, 30].forEach(function (x) { add(x, -park, "E", true, true); });
    add(42, -park, "E", false, false);
    /* 7 only the collaborator sees: six in the bus's shadow, plus the ego */
    add(40, lanes[1], "U", true, true, { keyDet: true });
    add(52, lanes[1], "U", true, false);
    add(58, lanes[2], "U", true, false);
    add(50, lanes[0], "U", true, false);
    add(64, lanes[1], "U", false, false);
    add(72, lanes[0], "U", false, false);
    add(ego.x, ego.y, "U", false, false, { isEgo: true });

    var fps = [[20, -5.6], [31, 3.6], [55, -7.4], [69, 7.6]];

    objs.forEach(function (o) { o.c = boxCorners(o.x, o.y, o.l, o.w, o.h); });

    /* the bus shadow seen from the ego, clipped to the road box */
    var bc = boxCorners(bus.x, bus.y, bus.l, bus.w, 0);
    var top = bc[1], bot = bc[2];       /* near-side corners (x min) */
    var far = 92;
    function ext(p) {
      var dx = p[0] - ego.x, dy = p[1] - ego.y, k = (far - ego.x) / dx;
      return [far, ego.y + dy * k];
    }
    var shadow = [top, ext(top), ext(bot), bot];

    return { L: L, lanes: lanes, park: park, ego: ego, collab: collab, objs: objs, fps: fps,
             shadow: shadow, box: [-2, -12, 90, 11.5] };
  }

  /* style of one object in one state */
  function heroStyle(o, st) {
    if (st === "b" && o.set === "U") return "out";
    var det = st === "a" ? o.tpA : o.tpB;
    return det ? "tp" : "fn";
  }

  AG.ready(function () {
    var root = document.getElementById("w-hero");
    if (!root) return;
    var canvas = root.querySelector("canvas");
    var sc = heroScene();
    var state = "a", from = "a", k = 1, auto = !AG.reducedMotion, autoT = 0, playing = auto;
    var playBtn = root.querySelector("[data-act=play]");
    var cap = root.querySelector(".ag-hero-caption");
    var tally = root.querySelector(".ag-tally");
    var cells = root.querySelector(".ag-refbar-cells");
    var refNum = root.querySelector(".ag-refbar-num");

    /* reference bar: 22 ego-visible objects, then the 7 */
    var order = sc.objs.filter(function (o) { return o.set === "E"; })
      .sort(function (a, b) { return (b.tpA ? 1 : 0) - (a.tpA ? 1 : 0); })
      .concat(sc.objs.filter(function (o) { return o.set === "U"; })
        .sort(function (a, b) { return (b.keyDet ? 1 : 0) - (a.keyDet ? 1 : 0); }));
    var cellEls = order.map(function () {
      var i = document.createElement("i");
      cells.appendChild(i);
      return i;
    });

    var CAPS = {
      a: "<b>(a) Both agents present.</b> The reference is the union of what both annotate: 29 objects. The seven inside the shaded shadow are visible only to the collaborator, and one of them is the ego vehicle itself.",
      b: "<b>(b) Collaborator dropped, union reference.</b> The pipeline rebuilds the reference from the ego alone, so those seven leave the answer key (29 → 22). A detection the ego still makes for one of them now counts as a false positive.",
      c: "<b>(c) Collaborator dropped, fixed reference.</b> Same detections, reference held at (a). The seven return: six are misses, and the false positive of (b) is correct again. Recall falls from 0.77 to 0.62."
    };

    var seg = AG.seg(root.querySelector(".ag-seg"), function (v) {
      stopAuto();
      go(v);
    });

    function go(v) {
      if (v === state) return;
      from = state; state = v; k = AG.reducedMotion ? 1 : 0;
      seg.set(v, true);
      updateText();
      if (!loop.wanted) loop.start();
      if (k === 1) draw();
    }

    function updateText() {
      var s = D.fig1.states[state];
      tally.innerHTML =
        '<span><b>' + s.ref + '</b> in reference</span>' +
        '<span><i class="ag-swatch" style="background:var(--ag-tp)"></i><b>' + s.tp + '</b> TP</span>' +
        '<span><i class="ag-swatch" style="background:var(--ag-fp)"></i><b>' + s.fp + '</b> FP</span>' +
        '<span><i class="ag-swatch" style="background:var(--ag-fn)"></i><b>' + s.fn + '</b> FN</span>' +
        '<span>recall <b>' + (s.tp / s.ref).toFixed(2) + '</b></span>' +
        '<span>precision <b>' + (s.tp / (s.tp + s.fp)).toFixed(2) + '</b></span>';
      cap.innerHTML = CAPS[state];
      refNum.textContent = s.ref;
      order.forEach(function (o, i) {
        var st = heroStyle(o, state);
        cellEls[i].className = st === "out" ? "gone" : st === "fn" ? "fn" : "";
      });
    }

    function stopAuto() {
      auto = false; playing = false;
      if (playBtn) { playBtn.setAttribute("aria-pressed", "false"); playBtn.textContent = "Play"; }
    }
    if (playBtn) {
      playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
      playBtn.textContent = playing ? "Pause" : "Play";
      playBtn.addEventListener("click", function () {
        playing = !playing; auto = playing; autoT = 0;
        playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
        playBtn.textContent = playing ? "Pause" : "Play";
        if (playing) { loop.start(); }
      });
    }

    function styleColor(C, st) { return st === "tp" ? C.tp : st === "fn" ? C.fn : C.out; }

    function drawObj(ctx, v, o, st, alpha, C) {
      if (alpha <= 0.01) return;
      ctx.globalAlpha = alpha;
      pathPoly(ctx, v, o.c);
      if (st === "out") {
        ctx.setLineDash([3, 2.5]);
        ctx.strokeStyle = C.out;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = styleColor(C, st);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function draw() {
      var C = AG.colors();
      var f = AG.fitCanvas(canvas, function (w) { return Math.max(w < 520 ? 140 : 190, Math.round(w * 0.3)); });
      var ctx = f.ctx;
      var v = makeView(f.w, f.h, sc.box, 6);
      var e = AG.ease(k);
      ctx.clearRect(0, 0, f.w, f.h);

      /* road */
      ctx.fillStyle = C.road;
      ctx.fillRect(v.x(sc.box[0]), v.y(7), (sc.box[2] - sc.box[0]) * v.s, 14 * v.s);
      ctx.strokeStyle = C.roadline;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      [-sc.L, sc.L].forEach(function (y) {
        ctx.beginPath(); ctx.moveTo(v.x(sc.box[0]), v.y(y)); ctx.lineTo(v.x(sc.box[2]), v.y(y)); ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(v.x(sc.box[0]), v.y(0)); ctx.lineTo(v.x(sc.box[2]), v.y(0)); ctx.stroke();

      /* the ego's shadow: inside the collaborator's sightlines */
      var shadeA = function (s) { return s === "b" ? 0.35 : 1; };
      ctx.globalAlpha = AG.lerp(shadeA(from), shadeA(state), e);
      pathPoly(ctx, v, sc.shadow);
      ctx.fillStyle = C.uniq;
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = withAlpha(C.fn, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(v.x(sc.shadow[0][0]), v.y(sc.shadow[0][1])); ctx.lineTo(v.x(sc.shadow[1][0]), v.y(sc.shadow[1][1]));
      ctx.moveTo(v.x(sc.shadow[3][0]), v.y(sc.shadow[3][1])); ctx.lineTo(v.x(sc.shadow[2][0]), v.y(sc.shadow[2][1]));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      /* objects, crossfaded between states */
      sc.objs.forEach(function (o) {
        var a = heroStyle(o, from), b = heroStyle(o, state);
        if (a === b) drawObj(ctx, v, o, b, 1, C);
        else { drawObj(ctx, v, o, a, 1 - e, C); drawObj(ctx, v, o, b, e, C); }
      });

      /* detections: dotted boxes around detected objects, and FPs */
      function detAlpha(o, s) {
        var d = s === "a" ? o.tpA : o.tpB;
        return d ? 1 : 0;
      }
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1.1;
      sc.objs.forEach(function (o) {
        var al = AG.lerp(detAlpha(o, from), detAlpha(o, state), e);
        if (al < 0.02) return;
        ctx.globalAlpha = al;
        var c = boxCorners(o.x + 0.5, o.y + 0.25, o.l + 0.8, o.w + 0.7, o.h);
        pathPoly(ctx, v, c);
        ctx.strokeStyle = C.ink2;
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      var cross = function (x, y, col, al) {
        if (al < 0.02) return;
        ctx.globalAlpha = al;
        var X = v.x(x), Y = v.y(y), r = Math.max(3.5, v.s * 1.1);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(X - r, Y - r); ctx.lineTo(X + r, Y + r);
        ctx.moveTo(X + r, Y - r); ctx.lineTo(X - r, Y + r);
        ctx.stroke();
        ctx.globalAlpha = 1;
      };
      sc.fps.forEach(function (p) { cross(p[0], p[1], C.fp, 1); });
      var key = sc.objs.filter(function (o) { return o.keyDet; })[0];
      var keyFP = function (s) { return s === "b" ? 1 : 0; };
      cross(key.x, key.y, C.fp, AG.lerp(keyFP(from), keyFP(state), e));

      /* agents */
      var collabOff = function (s) { return s !== "a"; };
      var off = e > 0.5 ? collabOff(state) : collabOff(from);
      var fs = f.w < 520 ? 10 : 11;
      drawAgentMark(ctx, v, sc.ego, C.s1, { label: "ego", fs: fs, ring: true });
      drawAgentMark(ctx, v, sc.collab, C.s2, { label: off ? "collaborator (dropped)" : "collaborator", off: off, fs: fs });

      /* key annotation for the reclassified detection */
      var note = state === "b" ? "correct detection, scored FP" : state === "c" ? "same detection, now correct" : "";
      if (note && f.w > 420) {
        ctx.globalAlpha = e;
        var col = state === "b" ? C.fp : C.tp;
        var ly = -10.7;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(v.x(key.x), v.y(key.y - 1.2));
        ctx.lineTo(v.x(key.x), v.y(ly + 0.6));
        ctx.stroke();
        ctx.font = AG.font(fs);
        ctx.fillStyle = col;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(note, v.x(key.x) + 5, v.y(ly));
        ctx.globalAlpha = 1;
      }

      /* scale bar */
      var X0 = v.x(sc.box[2] - 22), Yb = f.h - 9;
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X0, Yb); ctx.lineTo(X0 + 20 * v.s, Yb); ctx.stroke();
      ctx.font = AG.font(10);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("20 m", X0 + 10 * v.s, Yb - 2);
    }

    var loop = AG.loop(canvas, function (t, dt) {
      if (k < 1) { k = Math.min(1, k + dt / 0.9); draw(); }
      if (auto && playing) {
        autoT += dt;
        if (autoT > 3.6) {
          autoT = 0;
          go(state === "a" ? "b" : state === "b" ? "c" : "a");
        }
      }
      if (k >= 1 && !(auto && playing)) loop.stop();
    });

    updateText();
    draw();
    if (auto) loop.start();
    AG.onTheme(draw);
    AG.onResize(canvas, draw);
    AG.onReducedMotion(function (rm) { if (rm) stopAuto(); });
    root.addEventListener("pointerdown", function (e) {
      if (e.target.closest("[data-act=play]")) return;
      if (e.target.closest(".ag-seg")) stopAuto();
    });
  });

  /* ================================================================
     2. REFERENCE BUILDER: Eqs. (1), (2), (5), (6) on a synthetic scene
  ================================================================ */

  var RANGE_SENSE = 50;   /* illustrative sensing range for this toy */
  var NAMES = ["ego", "C1", "C2", "C3", "C4"];

  function builderScene(seed) {
    var r = AG.rng(seed);
    var L = 3.5;
    var buildings = [];
    var xs = [[-104, -78], [-62, 2], [18, 62], [78, 104]];
    xs.forEach(function (xr) {
      buildings.push([xr[0], 11, xr[1], 46]);
      buildings.push([xr[0], -46, xr[1], -11]);
    });
    /* split some blocks with small gaps for variety */
    buildings = buildings.concat([]);

    var agents = [
      { x: -30, y: -0.5 * L, h: 0 },
      { x: 26, y: 0.5 * L, h: Math.PI },
      { x: 8.25, y: 30, h: Math.PI / 2 },
      { x: -68.25, y: -30, h: Math.PI / 2 },
      { x: 56, y: -1.5 * L, h: 0 }
    ];

    var objs = [];
    function free(x, y) {
      for (var i = 0; i < objs.length; i++) {
        if (Math.abs(objs[i].x - x) < 7.5 && Math.abs(objs[i].y - y) < 2.6) return false;
        if (Math.abs(objs[i].y - y) < 7.5 && Math.abs(objs[i].x - x) < 2.6 && objs[i].vert) return false;
      }
      return true;
    }
    agents.forEach(function (a, i) {
      var o = { id: i, x: a.x, y: a.y, h: a.h, l: 4.8, w: 2.1, agent: i, vert: Math.abs(Math.sin(a.h)) > 0.5 };
      objs.push(o);
      a.selfId = i;
    });
    var id = agents.length, tries = 0;
    function place(n, gen) {
      var made = 0;
      while (made < n && tries++ < 4000) {
        var p = gen();
        if (free(p.x, p.y)) {
          var big = r() < 0.12;
          objs.push({ id: id++, x: p.x, y: p.y, h: p.h, l: big ? 9 : 4.6, w: big ? 2.6 : 2.0, vert: p.vert });
          made++;
        }
      }
    }
    var lanes = [-1.5 * L, -0.5 * L, 0.5 * L, 1.5 * L];
    place(22, function () {
      var y = lanes[Math.floor(r() * 4)];
      return { x: r.range(-100, 100), y: y, h: y > 0 ? Math.PI : 0 };
    });
    place(8, function () {
      var top = r() < 0.5;
      return { x: r.range(-100, 100), y: top ? 8.9 : -8.9, h: 0 };
    });
    [[-70, -71.75, -68.25], [10, 8.25, 11.75], [70, 68.25, 71.75]].forEach(function (c) {
      place(5, function () {
        var x = r() < 0.5 ? c[1] : c[2];
        var y = r.range(-44, 44);
        if (Math.abs(y) < 10) y += y < 0 ? -10 : 10;
        return { x: x, y: y, h: Math.PI / 2, vert: true };
      });
    });
    objs.forEach(function (o) { o.c = boxCorners(o.x, o.y, o.l, o.w, o.h); });

    var bsegs = [];
    buildings.forEach(function (b) { rectSegs(b, bsegs); });
    var allSegs = bsegs.slice();
    objs.forEach(function (o) { polySegs(o.c, allSegs, o.id); });

    agents.forEach(function (a) {
      a.vis = visibleSet(a, objs, bsegs, RANGE_SENSE);
      a.poly = sightPoly(a, allSegs, RANGE_SENSE, 360);
      a.dist = Math.hypot(a.x - agents[0].x, a.y - agents[0].y);
    });

    return { agents: agents, objs: objs, buildings: buildings, L: L, box: [-100, -45, 100, 45] };
  }

  AG.ready(function () {
    var root = document.getElementById("w-builder");
    if (!root) return;
    var canvas = root.querySelector("canvas");
    var seed = 11;
    var sc = builderScene(seed);
    var on = [true, true, true, true, true];
    var R = D.radius.R;
    var mode = "union";
    var hot = -1;
    var rIn = root.querySelector("#builder-r");
    var rOut = root.querySelector("#builder-r-out");
    var chips = root.querySelector(".ag-agents");
    var statsEl = root.querySelector(".ag-stats");
    var eqLive = {
      1: root.querySelector("[data-eq='1'] .ag-eq-live"),
      2: root.querySelector("[data-eq='2'] .ag-eq-live"),
      5: root.querySelector("[data-eq='5'] .ag-eq-live"),
      6: root.querySelector("[data-eq='6'] .ag-eq-live")
    };
    var statusEl = root.querySelector(".ag-builder-status");
    var res = null;

    /* chips */
    var chipEls = sc.agents.map(function (a, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ag-agent";
      b.style.setProperty("--c", "var(--ag-s" + (i + 1) + ")");
      b.setAttribute("aria-pressed", "true");
      b.innerHTML = '<i></i><span>' + NAMES[i] + '</span><span class="ag-agent-u"></span>';
      if (i === 0) { b.disabled = true; b.title = "The ego is always present"; }
      b.addEventListener("click", function () { toggle(i); });
      b.addEventListener("pointerenter", function () { hot = i; draw(); });
      b.addEventListener("pointerleave", function () { hot = -1; draw(); });
      b.addEventListener("focus", function () { hot = i; draw(); });
      b.addEventListener("blur", function () { hot = -1; draw(); });
      chips.appendChild(b);
      return b;
    });

    function toggle(i) {
      if (i === 0) return;
      on[i] = !on[i];
      compute(); draw();
    }

    function compute() {
      var inR = sc.agents.map(function (a, i) { return i === 0 || a.dist <= R; });
      var part = inR.map(function (x, i) { return x && on[i]; });
      var seenBy = {}, seenFix = {};
      sc.objs.forEach(function (o) { seenBy[o.id] = []; seenFix[o.id] = []; });
      sc.agents.forEach(function (a, i) {
        a.vis.forEach(function (id) {
          if (part[i]) seenBy[id].push(i);
          if (inR[i]) seenFix[id].push(i);
        });
      });
      var G = 0, Gfix = 0, U = [0, 0, 0, 0, 0];
      sc.objs.forEach(function (o) {
        if (seenBy[o.id].length) G++;
        if (seenFix[o.id].length) Gfix++;
        if (seenBy[o.id].length === 1) U[seenBy[o.id][0]]++;
      });
      res = { inR: inR, part: part, seenBy: seenBy, seenFix: seenFix, G: G, Gfix: Gfix, U: U };
      render();
    }

    function setsStr(arr) {
      return "{" + arr.map(function (x, i) { return x ? (i === 0 ? "e" : String(i)) : null; })
        .filter(function (x) { return x !== null; }).join(", ") + "}";
    }

    function render() {
      var nR = res.inR.filter(Boolean).length, nP = res.part.filter(Boolean).length;
      chipEls.forEach(function (b, i) {
        b.setAttribute("aria-pressed", on[i] ? "true" : "false");
        b.classList.toggle("is-out", !res.inR[i]);
        var u = b.querySelector(".ag-agent-u");
        u.textContent = !res.inR[i] ? "beyond R" : res.part[i] ? "|U| = " + res.U[i] : "dropped";
        b.setAttribute("aria-label", NAMES[i] + (i === 0 ? ", ego, always present" :
          !res.inR[i] ? ", beyond the radius, filtered out" :
          on[i] ? ", participating, contributes " + res.U[i] + " objects no other agent sees. Press to drop." :
          ", dropped. Press to restore."));
      });
      var shrink = res.Gfix ? 1 - res.G / res.Gfix : 0;
      statsEl.innerHTML =
        stat("Agents within R", nR, false, "of " + sc.agents.length + " in the scene") +
        stat("Participating", String(nP)) +
        stat("Union reference", String(res.G), res.G !== res.Gfix) +
        stat("Fixed reference", String(res.Gfix)) +
        stat("Shrinkage", AG.fmt.pct(shrink), shrink > 0, "toy scene; measured on V2XSet with every collaborator dropped: " + AG.fmt.pct(D.shrinkByP[3].value));
      eqLive[1].innerHTML = "here: 𝒜<sub>R</sub>(s) = <b>" + setsStr(res.inR) + "</b> at R = " + R + " m";
      eqLive[2].innerHTML = "here: |𝒢(𝒜′)| = <b>" + res.G + "</b> objects, from 𝒜′ = <b>" + setsStr(res.part) + "</b>";
      var j = hot > 0 && res.part[hot] ? hot : firstCollab();
      if (j > 0) {
        var without = res.G - res.U[j];
        eqLive[5].innerHTML = "here: |𝒰<sub>" + j + "</sub>(𝒜′)| = <b>" + res.U[j] + "</b> objects only " + NAMES[j] + " annotates";
        eqLive[6].innerHTML = "here: <b>" + res.G + "</b> = " + without + " + " + res.U[j] + " (drop " + NAMES[j] + " and the reference loses " + res.U[j] + ")";
      } else {
        eqLive[5].innerHTML = "here: no collaborator is participating";
        eqLive[6].innerHTML = "here: the reference is what the ego alone annotates";
      }
      root.querySelectorAll(".ag-eq").forEach(function (e) {
        e.classList.toggle("is-hot", hot > 0 && (e.dataset.eq === "5" || e.dataset.eq === "6"));
      });
      statusEl.textContent = "Reference has " + res.G + " objects with " + nP + " participating agents; fixed reference has " + res.Gfix + ".";
    }
    function firstCollab() {
      for (var i = 1; i < 5; i++) if (res.part[i]) return i;
      return -1;
    }
    function stat(label, val, changed, sub) {
      return '<div><span class="ag-stat-label">' + label + '</span><span class="ag-stat-value' +
        (changed ? " is-changed" : "") + '">' + val + "</span>" +
        (sub ? '<span class="ag-stat-sub">' + sub + "</span>" : "") + "</div>";
    }

    var view = null;
    function draw() {
      if (!res) return;
      var C = AG.colors();
      var f = AG.fitCanvas(canvas, function (w) { return Math.round(Math.min(520, Math.max(260, w * 0.46))); });
      var ctx = f.ctx;
      var v = view = makeView(f.w, f.h, sc.box, 4);
      ctx.clearRect(0, 0, f.w, f.h);

      /* roads (everything not a building) */
      ctx.fillStyle = C.road;
      ctx.fillRect(v.x(sc.box[0]), v.y(sc.box[3]), (sc.box[2] - sc.box[0]) * v.s, (sc.box[3] - sc.box[1]) * v.s);
      ctx.fillStyle = C.build;
      ctx.strokeStyle = C.buildline;
      ctx.lineWidth = 1;
      sc.buildings.forEach(function (b) {
        ctx.fillRect(v.x(b[0]), v.y(b[3]), (b[2] - b[0]) * v.s, (b[3] - b[1]) * v.s);
        ctx.strokeRect(v.x(b[0]), v.y(b[3]), (b[2] - b[0]) * v.s, (b[3] - b[1]) * v.s);
      });

      /* sightlines of participating agents */
      sc.agents.forEach(function (a, i) {
        if (!res.part[i]) return;
        var p = a.poly;
        ctx.beginPath();
        ctx.moveTo(v.x(p[0]), v.y(p[1]));
        for (var q = 2; q < p.length; q += 2) ctx.lineTo(v.x(p[q]), v.y(p[q + 1]));
        ctx.closePath();
        ctx.fillStyle = withAlpha(C.agent[i], hot === i ? 0.24 : hot >= 0 ? 0.05 : 0.11);
        ctx.fill();
        if (hot === i) { ctx.strokeStyle = withAlpha(C.agent[i], 0.6); ctx.lineWidth = 1; ctx.stroke(); }
      });

      /* communication radius around the ego */
      var eg = sc.agents[0];
      ctx.beginPath();
      ctx.arc(v.x(eg.x), v.y(eg.y), R * v.s, 0, Math.PI * 2);
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = C.ink2;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = AG.font(f.w < 520 ? 10 : 11);
      ctx.fillStyle = C.ink2;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      var la = -Math.PI / 4;
      ctx.fillText("R = " + R + " m", v.x(eg.x + Math.cos(la) * R) + 4, v.y(eg.y + Math.sin(la) * R) + 14);

      /* objects */
      sc.objs.forEach(function (o) {
        if (o.agent !== undefined && o.agent !== 0 && false) return;
        var by = res.seenBy[o.id], fix = res.seenFix[o.id];
        var inG = by.length > 0;
        var lostFromUnion = !inG && fix.length > 0;
        var isUniq = by.length === 1;
        var dim = hot >= 0 && !(isUniq && by[0] === hot);
        pathPoly(ctx, v, o.c);
        if (o.agent !== undefined) {
          /* agents are drawn below; their boxes are objects too */
        } else if (inG) {
          ctx.globalAlpha = dim ? 0.35 : 1;
          ctx.fillStyle = isUniq ? C.agent[by[0]] : C.ink2;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.setLineDash([2.5, 2]);
          ctx.lineWidth = lostFromUnion && mode === "fixed" ? 2 : 1;
          ctx.strokeStyle = lostFromUnion && mode === "fixed" ? C.fn : C.out;
          ctx.globalAlpha = dim ? 0.4 : 1;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        if (hot >= 0 && isUniq && by[0] === hot) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = C.ink;
          ctx.stroke();
        }
      });

      /* agents: filled in their colour; a ring shows whether their own
         box is in the reference (annotated by someone else) */
      sc.agents.forEach(function (a, i) {
        var o = sc.objs[i];
        var inG = res.seenBy[o.id].length > 0;
        var lbl = NAMES[i] + (!res.inR[i] ? " (beyond R)" : !on[i] ? " (dropped)" : "");
        drawAgentMark(ctx, v, { x: a.x, y: a.y, h: a.h, l: 4.8, w: 2.1 }, C.agent[i],
          { label: lbl, off: !res.part[i], fs: f.w < 520 ? 10 : 11 });
        if (res.part[i]) {
          ctx.beginPath();
          ctx.arc(v.x(a.x), v.y(a.y), Math.max(7, v.s * 3.6), 0, Math.PI * 2);
          ctx.lineWidth = 1.2;
          ctx.setLineDash(inG ? [] : [2, 2]);
          ctx.strokeStyle = inG ? C.ink2 : C.out;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    }

    /* canvas: click an agent to toggle it; hover an object for its observers */
    function pick(e) {
      if (!view) return null;
      var r = canvas.getBoundingClientRect();
      var X = view.ix(e.clientX - r.left), Y = view.iy(e.clientY - r.top);
      var best = null, bd = 16;
      sc.objs.forEach(function (o) {
        var d = (o.x - X) * (o.x - X) + (o.y - Y) * (o.y - Y);
        if (d < bd) { bd = d; best = o; }
      });
      return best;
    }
    canvas.addEventListener("click", function (e) {
      var o = pick(e);
      if (o && o.agent !== undefined) toggle(o.agent);
    });
    canvas.addEventListener("pointermove", function (e) {
      var o = pick(e);
      if (!o) { AG.tooltip.hide(); canvas.style.cursor = ""; return; }
      var by = res.seenBy[o.id].map(function (i) { return NAMES[i]; });
      var head = o.agent !== undefined ? "<b>" + NAMES[o.agent] + "</b>, a connected vehicle" : "<b>Object " + o.id + "</b>";
      var body = by.length ? "In the reference. Annotated by " + by.join(", ") + "." :
        res.seenFix[o.id].length ? "Not in the union reference: only dropped agents saw it. Still in the fixed reference." :
        "Not in any reference: no agent within R sees it.";
      if (o.agent === 0) body += " The ego cannot annotate itself.";
      if (o.agent !== undefined && o.agent > 0) body += " Click to " + (on[o.agent] ? "drop" : "restore") + " it.";
      canvas.style.cursor = o.agent !== undefined && o.agent > 0 ? "pointer" : "";
      AG.tooltip.show(head + "<br>" + body, e.clientX, e.clientY);
    });
    canvas.addEventListener("pointerleave", AG.tooltip.hide);

    rIn.value = R;
    rIn.addEventListener("input", function () {
      R = parseInt(rIn.value, 10);
      rOut.textContent = R + " m";
      compute(); draw();
    });
    rOut.textContent = R + " m";
    AG.seg(root.querySelector("[data-ctl=mode]"), function (v) { mode = v; draw(); });
    root.querySelector("[data-act=reset]").addEventListener("click", function () {
      on = [true, true, true, true, true];
      R = D.radius.R; rIn.value = R; rOut.textContent = R + " m";
      compute(); draw();
    });
    root.querySelector("[data-act=drop-all]").addEventListener("click", function () {
      on = [true, false, false, false, false];
      compute(); draw();
    });
    root.querySelector("[data-act=reseed]").addEventListener("click", function () {
      seed = (seed * 48271 + 7) % 2147483647;
      sc = builderScene(seed);
      compute(); draw();
    });

    compute();
    draw();
    AG.onTheme(draw);
    AG.onResize(canvas, draw);
  });

  /* ================================================================
     3. RADIUS DRIFT: no fault, the reference still moves (Sec. 3.3)
  ================================================================ */

  var LOOP = 400;          /* world length along the street, metres */
  var T = 60;              /* timeline length, seconds */
  var HZ = 5;              /* timeline sampling rate */

  function driftWorld(seed) {
    var r = AG.rng(seed);
    var L = 3.5, lanes = [-1.5 * L, -0.5 * L, 0.5 * L, 1.5 * L];
    var blocks = [];
    for (var x = 0; x < LOOP; x += 40) {
      blocks.push({ x0: x + 4, x1: x + 32, top: true });
      blocks.push({ x0: x + 10, x1: x + 36, top: false });
    }
    /* Collaborators drive in the ego's direction at varying speed, so
       their offset from the ego swings back and forth across the radius.
       Offsets are periodic over T so the loop is seamless. */
    var agents = [
      { x0: 0, y: lanes[1], v: 11 },
      { y: lanes[0], base: 34, amp: 46, k: 1, ph: 0.4 },
      { y: lanes[1], base: -46, amp: 32, k: 2, ph: 1.9 },
      { y: lanes[0], base: 58, amp: 22, k: 1, ph: 3.6 },
      { y: lanes[1], base: -22, amp: 44, k: 3, ph: 5.0 }
    ];
    var objs = [];
    agents.forEach(function (a, i) {
      objs.push({ id: i, x0: a.x0 || 0, y: a.y, v: a.v || 0, agent: i, l: 4.8, w: 2.1, rel: i ? a : null });
    });
    var id = agents.length;
    for (var k = 0; k < 34; k++) {
      var parked = k < 12;
      var y = parked ? (r() < 0.5 ? 8.9 : -8.9) : lanes[Math.floor(r() * 4)];
      var v = parked ? 0 : (y > 0 ? -1 : 1) * r.range(7, 14);
      var big = !parked && r() < 0.15;
      objs.push({ id: id++, x0: r.range(0, LOOP), y: y, v: v, l: big ? 10 : 4.6, w: big ? 2.6 : 2.0 });
    }
    return { agents: agents, objs: objs, blocks: blocks, lanes: lanes };
  }

  function wrapRel(x) {
    x = ((x % LOOP) + LOOP) % LOOP;
    return x > LOOP / 2 ? x - LOOP : x;
  }

  /* positions relative to the ego at time t */
  function driftFrame(w, t) {
    var ex = w.agents[0].x0 + w.agents[0].v * t;
    var objs = w.objs.map(function (o) {
      var x = o.rel ? o.rel.base + o.rel.amp * Math.sin(2 * Math.PI * o.rel.k * t / T + o.rel.ph)
                    : wrapRel(o.x0 + o.v * t - ex);
      var h = o.v < 0 ? Math.PI : 0;
      return { id: o.id, x: x, y: o.y, l: o.l, w: o.w, h: h, agent: o.agent, c: boxCorners(x, o.y, o.l, o.w, h) };
    });
    var agents = w.agents.map(function (a, i) {
      var o = objs[i];
      return { x: o.x, y: o.y, h: o.h, selfId: i, dist: Math.abs(o.x - 0) + 0 * o.y };
    });
    agents.forEach(function (a) { a.dist = Math.hypot(a.x - agents[0].x, a.y - agents[0].y); });
    var bsegs = [];
    var rects = [];
    w.blocks.forEach(function (b) {
      var x0 = wrapRel(b.x0 - ex), x1 = x0 + (b.x1 - b.x0);
      var r = b.top ? [x0, 11, x1, 40] : [x0, -40, x1, -11];
      rects.push(r);
      if (Math.abs(x0) < 120) rectSegs(r, bsegs);
    });
    return { objs: objs, agents: agents, rects: rects, bsegs: bsegs, ex: ex };
  }

  AG.ready(function () {
    var root = document.getElementById("w-radius");
    if (!root) return;
    var canvas = root.querySelector("canvas.ag-bev");
    var tl = root.querySelector("canvas.ag-timeline");
    var world = driftWorld(5);
    var N = T * HZ;
    var R = D.radius.R;
    var t = 0, speed = 1, playing = !AG.reducedMotion;
    var rIn = root.querySelector("#radius-r");
    var rOut = root.querySelector("#radius-r-out");
    var playBtn = root.querySelector("[data-act=play]");
    var readout = root.querySelector(".ag-radius-read");
    var toyStats = root.querySelector(".ag-radius-toy");

    /* visibility per sample does not depend on R, so compute it once */
    var samples = [];
    for (var i = 0; i < N; i++) {
      var fr = driftFrame(world, i / HZ);
      samples.push({
        dist: fr.agents.map(function (a) { return a.dist; }),
        vis: fr.agents.map(function (a) { return visibleSet(a, fr.objs, fr.bsegs, RANGE_SENSE); })
      });
    }
    var series = null;
    function computeSeries() {
      series = samples.map(function (s) {
        var seen = {}, nA = 0, lost = 0;
        s.dist.forEach(function (d, i) {
          if (i === 0 || d <= R) { nA++; s.vis[i].forEach(function (id) { seen[id] = 1; }); }
          else lost++;
        });
        return { nA: nA, G: Object.keys(seen).length, lost: lost };
      });
      var lostFrac = series.filter(function (s) { return s.lost > 0; }).length / series.length;
      var xs = series.map(function (s) { return s.nA; }), ys = series.map(function (s) { return s.G; });
      var r = pearson(xs, ys);
      toyStats.innerHTML = "In this toy street at R = " + R + " m: <b>" + AG.fmt.pct(lostFrac, 0) +
        "</b> of samples have at least one collaborator beyond R, and agents-within-R correlates with reference size at <b>r = " +
        (isNaN(r) ? "n/a" : r.toFixed(2)) + "</b>.";
    }
    function pearson(x, y) {
      var n = x.length, mx = 0, my = 0;
      for (var i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
      mx /= n; my /= n;
      var sxy = 0, sxx = 0, syy = 0;
      for (var j = 0; j < n; j++) {
        sxy += (x[j] - mx) * (y[j] - my); sxx += (x[j] - mx) * (x[j] - mx); syy += (y[j] - my) * (y[j] - my);
      }
      return sxy / Math.sqrt(sxx * syy);
    }

    function draw() {
      var C = AG.colors();
      var f = AG.fitCanvas(canvas, function (w) { return Math.max(170, Math.round(w * 0.3)); });
      var ctx = f.ctx;
      var half = f.w < 560 ? 85 : 120;
      var v = makeView(f.w, f.h, [-half, -16, half, 16], 4);
      var fr = driftFrame(world, t);
      var idx = Math.min(N - 1, Math.floor(t * HZ));
      var s = samples[idx];
      var inR = fr.agents.map(function (a, i) { return i === 0 || a.dist <= R; });
      var seen = {};
      s.vis.forEach(function (vis, i) { if (inR[i]) vis.forEach(function (id) { seen[id] = (seen[id] || 0) + 1; }); });

      ctx.clearRect(0, 0, f.w, f.h);
      ctx.fillStyle = C.road;
      ctx.fillRect(0, 0, f.w, f.h);
      ctx.fillStyle = C.build;
      ctx.strokeStyle = C.buildline;
      fr.rects.forEach(function (r) {
        if (r[2] < -half - 5 || r[0] > half + 5) return;
        ctx.fillRect(v.x(r[0]), v.y(r[3]), (r[2] - r[0]) * v.s, (r[3] - r[1]) * v.s);
        ctx.strokeRect(v.x(r[0]), v.y(r[3]), (r[2] - r[0]) * v.s, (r[3] - r[1]) * v.s);
      });
      ctx.strokeStyle = C.roadline;
      ctx.setLineDash([6, 6]);
      [-3.5, 3.5].forEach(function (y) {
        ctx.beginPath(); ctx.moveTo(0, v.y(y)); ctx.lineTo(f.w, v.y(y)); ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(0, v.y(0)); ctx.lineTo(f.w, v.y(0)); ctx.stroke();

      /* radius interval along the street (a circle seen edge-on) */
      ctx.fillStyle = withAlpha(C.s1, 0.06);
      ctx.fillRect(v.x(-R), 0, 2 * R * v.s, f.h);
      ctx.strokeStyle = C.ink2;
      ctx.setLineDash([5, 4]);
      [-R, R].forEach(function (x) {
        ctx.beginPath(); ctx.moveTo(v.x(x), 0); ctx.lineTo(v.x(x), f.h); ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.font = AG.font(10);
      ctx.fillStyle = C.ink2;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("−R", v.x(-R), 3);
      ctx.fillText("+R", v.x(R), 3);

      fr.objs.forEach(function (o) {
        if (o.x < -half - 10 || o.x > half + 10) return;
        if (o.agent !== undefined) return;
        pathPoly(ctx, v, o.c);
        if (seen[o.id]) { ctx.fillStyle = C.ink2; ctx.fill(); }
        else { ctx.setLineDash([2.5, 2]); ctx.strokeStyle = C.out; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
      });
      fr.agents.forEach(function (a, i) {
        var X = a.x;
        var lbl = i === 0 ? "ego" : NAMES[i] + (inR[i] ? "" : " (beyond R)");
        if (X < -half) {
          drawEdge(ctx, v, -half, a.y, C.agent[i], NAMES[i] + " ← " + Math.round(a.dist) + " m", "left", f);
          return;
        }
        if (X > half) {
          drawEdge(ctx, v, half, a.y, C.agent[i], NAMES[i] + " → " + Math.round(a.dist) + " m", "right", f);
          return;
        }
        drawAgentMark(ctx, v, { x: X, y: a.y, h: a.h }, C.agent[i], { label: lbl, off: !inR[i], fs: 10 });
      });

      var cur = series[idx];
      readout.innerHTML = "t = " + t.toFixed(1) + " s &nbsp;·&nbsp; agents within R: <b>" + cur.nA +
        "</b> of 5 &nbsp;·&nbsp; reference: <b>" + cur.G + "</b> objects";
      drawTimeline();
    }

    function drawEdge(ctx, v, x, y, col, txt, side, f) {
      var X = side === "left" ? 6 : f.w - 6, Y = v.y(y);
      ctx.fillStyle = col;
      ctx.beginPath();
      if (side === "left") { ctx.moveTo(X, Y); ctx.lineTo(X + 7, Y - 5); ctx.lineTo(X + 7, Y + 5); }
      else { ctx.moveTo(X, Y); ctx.lineTo(X - 7, Y - 5); ctx.lineTo(X - 7, Y + 5); }
      ctx.fill();
      ctx.font = AG.font(10);
      ctx.textAlign = side === "left" ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillText(txt, side === "left" ? X + 10 : X - 10, Y);
    }

    var tlView = null;
    function drawTimeline() {
      var C = AG.colors();
      var f = AG.fitCanvas(tl, 120);
      var ctx = f.ctx;
      var padL = 34, padR = 34, padT = 10, padB = 20;
      var W = f.w - padL - padR, H = f.h - padT - padB;
      var gMin = Infinity, gMax = -Infinity;
      series.forEach(function (s) { gMin = Math.min(gMin, s.G); gMax = Math.max(gMax, s.G); });
      gMin = Math.max(0, gMin - 2); gMax += 2;
      tlView = { padL: padL, W: W };
      ctx.clearRect(0, 0, f.w, f.h);
      var X = function (i) { return padL + (i / (N - 1)) * W; };
      var YG = function (g) { return padT + H - ((g - gMin) / (gMax - gMin)) * H; };
      var YA = function (a) { return padT + H - ((a - 0.5) / 5) * H; };

      /* shade samples that lost an agent to the radius */
      ctx.fillStyle = C.uniq;
      series.forEach(function (s, i) {
        if (s.lost) ctx.fillRect(Math.floor(X(i) - W / (N - 1) / 2), padT, Math.ceil(W / (N - 1)) + 1, H);
      });
      ctx.strokeStyle = C.grid;
      ctx.beginPath(); ctx.moveTo(padL, padT + H); ctx.lineTo(padL + W, padT + H); ctx.stroke();

      /* agents within R: step line */
      ctx.strokeStyle = C.s1;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      series.forEach(function (s, i) {
        var y = YA(s.nA);
        if (i === 0) ctx.moveTo(X(i), y);
        else { ctx.lineTo(X(i), YA(series[i - 1].nA)); ctx.lineTo(X(i), y); }
      });
      ctx.stroke();
      /* reference size */
      ctx.strokeStyle = C.fn;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      series.forEach(function (s, i) { if (i === 0) ctx.moveTo(X(i), YG(s.G)); else ctx.lineTo(X(i), YG(s.G)); });
      ctx.stroke();

      ctx.font = AG.font(10);
      ctx.fillStyle = C.s1;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      [1, 3, 5].forEach(function (a) { ctx.fillText(String(a), padL - 6, YA(a)); });
      ctx.fillStyle = C.fn;
      ctx.textAlign = "left";
      [gMin, Math.round((gMin + gMax) / 2), gMax].forEach(function (g) { ctx.fillText(String(g), padL + W + 6, YG(g)); });
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (var s = 0; s <= T; s += 10) ctx.fillText(s + " s", X(s * HZ * (N - 1) / N), padT + H + 5);

      /* playhead */
      var px = padL + (t / T) * W;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, padT - 2); ctx.lineTo(px, padT + H); ctx.stroke();
    }

    function setPlaying(p) {
      playing = p;
      playBtn.setAttribute("aria-pressed", p ? "true" : "false");
      playBtn.textContent = p ? "Pause" : "Play";
      if (p) loop.start(); else loop.stop();
    }
    var loop = AG.loop(canvas, function (now, dt) {
      t += dt * speed;
      if (t >= T) t -= T;
      draw();
    });
    playBtn.addEventListener("click", function () { setPlaying(!playing); });
    root.querySelector("[data-act=back]").addEventListener("click", function () {
      setPlaying(false); t = Math.max(0, t - 1 / HZ); draw();
    });
    root.querySelector("[data-act=fwd]").addEventListener("click", function () {
      setPlaying(false); t = Math.min(T - 1e-3, t + 1 / HZ); draw();
    });
    root.querySelector("[data-act=restart]").addEventListener("click", function () { t = 0; draw(); });
    AG.seg(root.querySelector("[data-ctl=speed]"), function (v) { speed = parseFloat(v); });
    rIn.value = R;
    rOut.textContent = R + " m";
    rIn.addEventListener("input", function () {
      R = parseInt(rIn.value, 10);
      rOut.textContent = R + " m";
      computeSeries(); draw();
    });
    function scrub(e) {
      if (!tlView) return;
      var r = tl.getBoundingClientRect();
      var k = AG.clamp((e.clientX - r.left - tlView.padL) / tlView.W, 0, 0.9999);
      t = k * T;
      draw();
    }
    var dragging = false;
    tl.addEventListener("pointerdown", function (e) { dragging = true; setPlaying(false); scrub(e); tl.setPointerCapture(e.pointerId); });
    tl.addEventListener("pointermove", function (e) { if (dragging) scrub(e); });
    tl.addEventListener("pointerup", function () { dragging = false; });
    tl.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { setPlaying(false); t = Math.min(T - 1e-3, t + 1); draw(); e.preventDefault(); }
      if (e.key === "ArrowLeft") { setPlaying(false); t = Math.max(0, t - 1); draw(); e.preventDefault(); }
    });

    computeSeries();
    draw();
    setPlaying(playing);
    AG.onTheme(draw);
    AG.onResize(canvas, draw);
    AG.onReducedMotion(function (rm) { if (rm) setPlaying(false); });
  });
})();
