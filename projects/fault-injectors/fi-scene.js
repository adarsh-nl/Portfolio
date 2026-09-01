/* ==================================================================
   fi-scene.js: the synthetic BEV world, its LiDAR model, the fault
   injectors, and the top-down renderer.

   Nothing here reads a dataset. The scene is a procedurally generated
   intersection: a shared static world (buildings, parked cars, road
   edges) plus moving vehicles, sensed by 2 to 6 agents that each cast
   their own rays and therefore each have their own occlusions. Points
   carry the id of the agent that owns them, which is the whole reason
   cooperative faults are legible at all.

   Physical faithfulness that matters for the story:
     - occlusion is real (ray casting against real geometry), so a
       collaborator genuinely sees what the ego cannot;
     - a pose error rotates and translates a collaborator's cloud about
       that collaborator's own sensor origin, not about the world origin;
     - latency means the collaborator's dynamic returns come from an
       earlier world state while its static returns do not move;
     - intensity falls with range, so the fog colormap shifts for a
       physical reason rather than a decorative one.

   Exports on window.FI: WORLD constants, buildScene, faults, view/draw
   helpers, and the low-level ray casting used by the hero figure.
================================================================== */
(function () {
  "use strict";
  var FI = (window.FI = window.FI || {});

  /* ---------- world constants (metres) ------------------------- */

  var NB = 720;                       /* azimuth bins per agent */
  var STEP = (Math.PI * 2) / NB;
  var RANGE = 44;                     /* max sensing range */
  var CLEAN_MEAN_I = 0.94;            /* measured clean mean intensity */

  /* horizontal road: centreline y = 4, half width 8, lanes y = 0 and 8
     vertical road:   centreline x = 16, half width 8, lanes x = 12 and 20
     the ego sits at the origin, in the eastbound lane. */
  var RD = { ay: 4, ah: 8, bx: 16, bh: 8 };
  var CURB = { s: RD.ay - RD.ah, n: RD.ay + RD.ah, w: RD.bx - RD.bh, e: RD.bx + RD.bh };

  /* The view box the BEV canvases fit. Its aspect (4:3) is deliberately
     close to the aspect the canvases are sized at, so the "contain" fit
     below wastes very little of the canvas. */
  var VIEW = { cx: 4, cy: 4, w: 96, h: 72 };

  var CAR = { l: 4.7, w: 2.0 };

  /* Fixed agent poses. Raising the agent count appends, it never
     reshuffles, so the scene stays comparable as you drag the control. */
  var POSES = [
    { x: 0,   y: 0,  h: 0,               label: "ego" },
    { x: 30,  y: 8,  h: Math.PI,         label: "A1" },
    { x: 12,  y: 28, h: -Math.PI / 2,    label: "A2" },
    { x: -26, y: 8,  h: Math.PI,         label: "A3" },
    { x: 20,  y: -20, h: Math.PI / 2,    label: "A4" },
    { x: -34, y: 0,  h: 0,               label: "A5" }
  ];

  /* Moving vehicles: constant speed along a lane, wrapping. */
  var TRAFFIC = [
    { axis: "x", lane: 0,  dir: 1,  speed: 9.0, s0: -28, id: 0 },
    { axis: "x", lane: 8,  dir: -1, speed: 7.5, s0: 14,  id: 1 },
    { axis: "y", lane: 20, dir: 1,  speed: 7.0, s0: -30, id: 2 },
    { axis: "y", lane: 12, dir: -1, speed: 8.0, s0: 24,  id: 3 }
  ];
  var TRACK_LO = -46, TRACK_HI = 50;

  FI.WORLD = { NB: NB, RANGE: RANGE, RD: RD, CURB: CURB, VIEW: VIEW,
               CAR: CAR, POSES: POSES, TRAFFIC: TRAFFIC, CLEAN_MEAN_I: CLEAN_MEAN_I };

  /* ---------- geometry ----------------------------------------- */

  function wrap(s) {
    var span = TRACK_HI - TRACK_LO;
    return TRACK_LO + ((((s - TRACK_LO) % span) + span) % span);
  }

  /* Rectangle centred at (cx,cy), length l along heading h, width w. */
  function boxCorners(cx, cy, l, w, h) {
    var c = Math.cos(h), s = Math.sin(h);
    var hl = l / 2, hw = w / 2;
    var pts = [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]];
    return pts.map(function (p) {
      return [cx + p[0] * c - p[1] * s, cy + p[0] * s + p[1] * c];
    });
  }
  FI.boxCorners = boxCorners;

  function boxSegs(corners, out, kind) {
    for (var i = 0; i < 4; i++) {
      var a = corners[i], b = corners[(i + 1) % 4];
      out.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], k: kind });
    }
    return out;
  }

  /* Ray/segment intersection. Returns t along the unit ray, or -1. */
  function raySeg(ax, ay, dx, dy, x1, y1, x2, y2) {
    var ex = x2 - x1, ey = y2 - y1;
    var den = dx * ey - dy * ex;
    if (den > -1e-9 && den < 1e-9) return -1;
    var qx = x1 - ax, qy = y1 - ay;
    var t = (qx * ey - qy * ex) / den;
    if (t <= 0) return -1;
    var u = (qx * dy - qy * dx) / den;
    if (u < 0 || u > 1) return -1;
    return t;
  }
  FI.raySeg = raySeg;

  /* Cast one segment into an agent's depth buffer, touching only the
     azimuth bins the segment actually subtends. owner, when given,
     records which object won each bin. */
  function castSeg(ax, ay, seg, depth, owner, ownerId) {
    var a1 = Math.atan2(seg.y1 - ay, seg.x1 - ax);
    var a2 = Math.atan2(seg.y2 - ay, seg.x2 - ax);
    var d = a2 - a1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    var lo = Math.min(a1, a1 + d), hi = Math.max(a1, a1 + d);
    var i0 = Math.ceil(lo / STEP), i1 = Math.floor(hi / STEP);
    for (var i = i0; i <= i1; i++) {
      var th = i * STEP;
      var t = raySeg(ax, ay, Math.cos(th), Math.sin(th), seg.x1, seg.y1, seg.x2, seg.y2);
      if (t <= 0 || t > RANGE) continue;
      var b = ((i % NB) + NB) % NB;
      if (t < depth[b]) {
        depth[b] = t;
        if (owner) owner[b] = ownerId;
      }
    }
  }
  FI.castSeg = castSeg;

  /* ---------- point clouds ------------------------------------- */

  function makeCloud(cap) {
    return {
      n: 0, cap: cap,
      x: new Float32Array(cap), y: new Float32Array(cap),
      i: new Float32Array(cap), a: new Uint8Array(cap), s: new Uint8Array(cap)
    };
  }
  FI.makeCloud = makeCloud;

  function ensure(c, cap) {
    if (c.cap >= cap) return c;
    var n = makeCloud(Math.ceil(cap * 1.4));
    n.x.set(c.x); n.y.set(c.y); n.i.set(c.i); n.a.set(c.a); n.s.set(c.s);
    n.n = c.n;
    c.cap = n.cap; c.x = n.x; c.y = n.y; c.i = n.i; c.a = n.a; c.s = n.s;
    return c;
  }
  FI.ensureCloud = ensure;

  function push(c, x, y, i, a, s) {
    if (c.n >= c.cap) ensure(c, c.n + 1);
    var k = c.n++;
    c.x[k] = x; c.y[k] = y; c.i[k] = i; c.a[k] = a; c.s[k] = s;
  }
  FI.pushPoint = push;

  /* status codes carried per point */
  var ST = { CLEAN: 0, ATTEN: 1, ADDED: 2, MOVED: 3 };
  FI.ST = ST;

  /* ---------- scene construction ------------------------------- */

  /* Static geometry: buildings and parked cars occlude, road edges do
     not (they are ground level) but still return points. */
  function buildStatic(seed) {
    var rnd = FI.rng(seed);
    var buildings = [], parked = [], occ = [], curbs = [];

    var blocks = [
      { x0: -40, x1: 3,  y0: -32, y1: -8 },
      { x0: -40, x1: 3,  y0: 16,  y1: 40 },
      { x0: 28,  x1: 48, y0: -32, y1: -8 },
      { x0: 28,  x1: 48, y0: 16,  y1: 40 }
    ];
    blocks.forEach(function (bk) {
      var count = 2;
      for (var i = 0; i < count; i++) {
        var w = rnd.range(11, 19), h = rnd.range(9, 15);
        var cx = rnd.range(bk.x0 + w / 2, bk.x1 - w / 2);
        var cy = rnd.range(bk.y0 + h / 2, bk.y1 - h / 2);
        /* keep the two buildings in a block from overlapping */
        var clash = buildings.some(function (b) {
          return Math.abs(b.cx - cx) < (b.w + w) / 2 + 1.5 &&
                 Math.abs(b.cy - cy) < (b.h + h) / 2 + 1.5;
        });
        if (clash) { cx = bk.x0 + w / 2 + (i * (bk.x1 - bk.x0 - w)) ; cy = bk.y0 + h / 2 + i * 14; }
        var b = { cx: cx, cy: cy, w: w, h: h };
        buildings.push(b);
        boxSegs(boxCorners(cx, cy, w, h, 0), occ, "b");
      }
    });

    /* parked cars hugging the inside of each curb */
    var strips = [
      { axis: "x", at: CURB.s + 2,  from: -38, to: 4,  h: 0 },
      { axis: "x", at: CURB.n - 2,  from: 26,  to: 46, h: Math.PI },
      { axis: "y", at: CURB.w + 2,  from: -30, to: -8, h: Math.PI / 2 },
      { axis: "y", at: CURB.e - 2,  from: 18,  to: 38, h: -Math.PI / 2 }
    ];
    strips.forEach(function (st) {
      var s = st.from;
      while (s < st.to - CAR.l) {
        s += rnd.range(1.5, 9);
        if (s > st.to - CAR.l) break;
        var cx = st.axis === "x" ? s : st.at;
        var cy = st.axis === "x" ? st.at : s;
        var c = { cx: cx, cy: cy, h: st.h };
        parked.push(c);
        boxSegs(boxCorners(cx, cy, CAR.l, CAR.w, st.h), occ, "p");
        s += CAR.l;
      }
    });

    /* Road edges, sampled later into ground returns. They run out past
       any agent's sensing range so the road never just stops. */
    curbs.push({ x1: -84, y1: CURB.s, x2: CURB.w, y2: CURB.s });
    curbs.push({ x1: CURB.e, y1: CURB.s, x2: 84, y2: CURB.s });
    curbs.push({ x1: -84, y1: CURB.n, x2: CURB.w, y2: CURB.n });
    curbs.push({ x1: CURB.e, y1: CURB.n, x2: 84, y2: CURB.n });
    curbs.push({ x1: CURB.w, y1: -72, x2: CURB.w, y2: CURB.s });
    curbs.push({ x1: CURB.w, y1: CURB.n, x2: CURB.w, y2: 80 });
    curbs.push({ x1: CURB.e, y1: -72, x2: CURB.e, y2: CURB.s });
    curbs.push({ x1: CURB.e, y1: CURB.n, x2: CURB.e, y2: 80 });

    /* curb sample points, shared by every agent */
    var curbPts = [];
    curbs.forEach(function (c) {
      var dx = c.x2 - c.x1, dy = c.y2 - c.y1;
      var len = Math.hypot(dx, dy), n = Math.floor(len / 0.65);
      for (var i = 0; i <= n; i++) {
        var u = i / n;
        curbPts.push([c.x1 + dx * u, c.y1 + dy * u]);
      }
    });

    return { buildings: buildings, parked: parked, occ: occ, curbs: curbs, curbPts: curbPts };
  }

  function vehiclePose(v, t) {
    var s = wrap(v.s0 + v.dir * v.speed * t);
    if (v.axis === "x") return { x: s, y: v.lane, h: v.dir > 0 ? 0 : Math.PI, v: v.speed };
    return { x: v.lane, y: s, h: v.dir > 0 ? Math.PI / 2 : -Math.PI / 2, v: v.speed };
  }

  /* Build everything for a given seed and agent count. Ray casting for
     the static world happens once here; per-frame work is only the
     moving vehicles. */
  FI.buildScene = function (seed, nAgents) {
    var st = buildStatic(seed);
    var rnd = FI.rng(seed ^ 0x9e37);
    var agents = POSES.slice(0, nAgents).map(function (p, i) {
      return { x: p.x, y: p.y, h: p.h, label: i === 0 ? "ego" : p.label, idx: i };
    });

    var depths = [], staticPts = [];

    agents.forEach(function (ag, ai) {
      var depth = new Float32Array(NB);
      depth.fill(RANGE + 1);
      st.occ.forEach(function (s) { castSeg(ag.x, ag.y, s, depth, null, 0); });
      depths.push(depth);

      /* surface returns, one per bin that hit something */
      var px = [], py = [], pi = [];
      for (var b = 0; b < NB; b++) {
        var r = depth[b];
        if (r > RANGE) continue;
        var th = b * STEP;
        var rr = r + rnd.gauss() * 0.025;
        px.push(ag.x + Math.cos(th) * rr);
        py.push(ag.y + Math.sin(th) * rr);
        pi.push(0.99 * (1 - 0.13 * (rr / RANGE)) + rnd.gauss() * 0.02);
      }
      /* ground returns along the road edges, hidden where occluded */
      st.curbPts.forEach(function (p) {
        var dx = p[0] - ag.x, dy = p[1] - ag.y;
        var r = Math.hypot(dx, dy);
        if (r > RANGE || r < 0.8) return;
        var b = ((Math.round(Math.atan2(dy, dx) / STEP) % NB) + NB) % NB;
        if (r > depths[ai][b] - 0.25) return;
        var rr = r + rnd.gauss() * 0.03;
        var th = Math.atan2(dy, dx);
        px.push(ag.x + Math.cos(th) * rr);
        py.push(ag.y + Math.sin(th) * rr);
        pi.push(0.90 * (1 - 0.13 * (rr / RANGE)) + rnd.gauss() * 0.03);
      });

      staticPts.push({
        n: px.length,
        x: Float32Array.from(px), y: Float32Array.from(py), i: Float32Array.from(pi)
      });
    });

    /* Calibrate the synthetic intensity distribution so its clean mean
       matches the measured clean mean (0.94). The fog readout is then
       directly comparable to the number the benchmark reports. */
    var sum = 0, cnt = 0;
    staticPts.forEach(function (sp) {
      for (var k = 0; k < sp.n; k++) { sum += sp.i[k]; cnt++; }
    });
    var k0 = cnt ? (CLEAN_MEAN_I * cnt) / sum : 1;
    staticPts.forEach(function (sp) {
      for (var k = 0; k < sp.n; k++) sp.i[k] = Math.min(1, sp.i[k] * k0);
    });

    var scene = {
      seed: seed, nAgents: nAgents,
      st: st, agents: agents, depths: depths, staticPts: staticPts,
      iGain: k0,
      _tmpD: new Float32Array(NB), _tmpO: new Int8Array(NB),
      _rnd: FI.rng(seed ^ 0x5151)
    };

    /* Live boxes for the moving vehicles at time t. */
    scene.vehicles = function (t) {
      return TRAFFIC.map(function (v) {
        var p = vehiclePose(v, t);
        return { id: v.id, x: p.x, y: p.y, h: p.h, speed: v.speed,
                 corners: boxCorners(p.x, p.y, CAR.l, CAR.w, p.h) };
      });
    };

    /* Dynamic returns for one agent at one time, respecting both static
       occlusion and vehicle-on-vehicle occlusion. */
    scene.dynamicInto = function (out, ai, t, agentId) {
      var ag = scene.agents[ai];
      var d = scene._tmpD, o = scene._tmpO;
      d.set(scene.depths[ai]);
      o.fill(-1);
      var segs = [];
      scene.vehicles(t).forEach(function (v) {
        segs.length = 0;
        boxSegs(v.corners, segs, "v");
        for (var s = 0; s < segs.length; s++) castSeg(ag.x, ag.y, segs[s], d, o, v.id);
      });
      var rnd = scene._rnd;
      for (var b = 0; b < NB; b++) {
        if (o[b] < 0) continue;
        var r = d[b] + rnd.gauss() * 0.02;
        var th = b * STEP;
        var inten = Math.min(1, (1.0 * (1 - 0.13 * (r / RANGE)) + rnd.gauss() * 0.02) * scene.iGain);
        push(out, ag.x + Math.cos(th) * r, ag.y + Math.sin(th) * r, inten, agentId, ST.CLEAN);
      }
    };

    /* Compose the whole cooperative cloud. timeFor(agentIndex) lets a
       collaborator contribute a stale frame (CommLatency); skip(i) lets
       an agent contribute nothing (AgentDrop, MissingModality). */
    scene.compose = function (out, timeFor, skip) {
      out.n = 0;
      for (var ai = 0; ai < scene.agents.length; ai++) {
        if (skip && skip(ai)) continue;
        var sp = scene.staticPts[ai];
        ensure(out, out.n + sp.n + 400);
        for (var k = 0; k < sp.n; k++) {
          var j = out.n++;
          out.x[j] = sp.x[k]; out.y[j] = sp.y[k]; out.i[j] = sp.i[k];
          out.a[j] = ai; out.s[j] = ST.CLEAN;
        }
        scene.dynamicInto(out, ai, timeFor ? timeFor(ai) : 0, ai);
      }
      return out;
    };

    scene.meanIntensity = function (c) {
      var s = 0, n = 0;
      for (var k = 0; k < c.n; k++) { if (c.s[k] === 3) continue; s += c.i[k]; n++; }
      return n ? s / n : 0;
    };

    scene.countByAgent = function (c) {
      var out = new Array(scene.agents.length).fill(0);
      for (var k = 0; k < c.n; k++) out[c.a[k]]++;
      return out;
    };

    return scene;
  };

  /* ==================================================================
     FAULT INJECTORS
     Each takes a clean cloud and writes a faulted cloud into `out`.
     Severity is the tier index: 0 clean, 1 mild, 2 moderate, 3 severe.
  ================================================================== */

  var P = {
    pose:    { sigT: [0, 0.2, 0.4, 0.6], sigR: [0, 0.2, 0.4, 0.6] },   /* m and degrees */
    latency: { dt:   [0, 0.10, 0.20, 0.30] },                          /* seconds */
    drop:    { p:    [0, 0.25, 0.50, 0.75] },
    points:  { keep: [1, 0.30, 0.20, 0.10] },
    fog:     { meanI: [0.94, 0.80, 0.66, 0.51], reloc: [0, 0.10, 0.22, 0.35] },
    snow:    { rem: [0, 0.399, 0.323, 0.290], att: [0, 0.26, 0.42, 0.58],
               add: [0, 0.12, 0.30, 0.58] }
  };
  FI.PARAMS = P;

  FI.faults = {};

  /* --- PoseError -------------------------------------------------
     Each collaborator gets one sampled pose error per severity and
     seed. The transform is about that collaborator's own sensor
     origin, which is what makes the ghosting grow with range. */
  FI.faults.poseOffsets = function (scene, sev, seed) {
    var rnd = FI.rng((seed ^ 0xB105) >>> 0);
    var offs = [{ dx: 0, dy: 0, dh: 0 }];
    for (var i = 1; i < scene.agents.length; i++) {
      offs.push({
        dx: rnd.gauss() * P.pose.sigT[sev],
        dy: rnd.gauss() * P.pose.sigT[sev],
        dh: rnd.gauss() * P.pose.sigR[sev] * Math.PI / 180
      });
    }
    return offs;
  };

  FI.faults.pose = function (clean, out, scene, offs) {
    ensure(out, clean.n);
    out.n = clean.n;
    for (var k = 0; k < clean.n; k++) {
      var a = clean.a[k], o = offs[a];
      out.i[k] = clean.i[k]; out.a[k] = a; out.s[k] = clean.s[k];
      if (a === 0 || (!o.dx && !o.dy && !o.dh)) {
        out.x[k] = clean.x[k]; out.y[k] = clean.y[k];
        continue;
      }
      var ag = scene.agents[a];
      var rx = clean.x[k] - ag.x, ry = clean.y[k] - ag.y;
      var c = Math.cos(o.dh), s = Math.sin(o.dh);
      out.x[k] = ag.x + rx * c - ry * s + o.dx;
      out.y[k] = ag.y + rx * s + ry * c + o.dy;
    }
    return out;
  };

  /* --- AgentDrop and MissingModality -----------------------------
     Identical Bernoulli trial per non-ego agent. The difference is not
     in the points, it is in the fusion graph: a dropped agent leaves
     the graph, an empty one stays in it. */
  FI.faults.bernoulli = function (scene, p, seed) {
    var rnd = FI.rng((seed ^ 0x2C0FFEE) >>> 0);
    var out = [false];
    for (var i = 1; i < scene.agents.length; i++) out.push(rnd() < p);
    return out;
  };

  /* --- PointsReduce ---------------------------------------------- */
  FI.faults.reduce = function (clean, out, keep, seed) {
    var rnd = FI.rng((seed ^ 0x7EE1) >>> 0);
    ensure(out, clean.n);
    out.n = 0;
    for (var k = 0; k < clean.n; k++) {
      if (rnd() > keep) continue;
      var j = out.n++;
      out.x[j] = clean.x[k]; out.y[j] = clean.y[k]; out.i[j] = clean.i[k];
      out.a[j] = clean.a[k]; out.s[j] = clean.s[k];
    }
    return out;
  };

  /* --- LidarFog --------------------------------------------------
     Two coupled effects. Return energy is absorbed, so every point's
     intensity falls toward the measured tier mean. And a fraction of
     returns are relocated: fog backscatters, so the pulse comes back
     early and the point lands short of the true surface. `phase` in
     [0,1] animates the relocation for the widget. */
  FI.faults.fog = function (clean, out, scene, sev, seed, phase) {
    var rnd = FI.rng((seed ^ 0xF06) >>> 0);
    var gain = P.fog.meanI[sev] / P.fog.meanI[0];
    var relocP = P.fog.reloc[sev];
    var ph = phase === undefined ? 1 : phase;
    ensure(out, clean.n);
    out.n = clean.n;
    for (var k = 0; k < clean.n; k++) {
      var a = clean.a[k];
      out.a[k] = a;
      out.i[k] = Math.max(0.02, Math.min(1, clean.i[k] * gain + rnd.gauss() * 0.045 * sev));
      var moved = sev > 0 && rnd() < relocP;
      if (!moved) {
        out.x[k] = clean.x[k]; out.y[k] = clean.y[k]; out.s[k] = clean.s[k];
        continue;
      }
      var ag = scene.agents[a];
      var dx = clean.x[k] - ag.x, dy = clean.y[k] - ag.y;
      var f = 0.22 + rnd() * 0.55;              /* early return, short of truth */
      var u = 1 + (f - 1) * ph;
      out.x[k] = ag.x + dx * u;
      out.y[k] = ag.y + dy * u;
      out.s[k] = ST.MOVED;
    }
    return out;
  };

  /* --- LidarSnow -------------------------------------------------
     Flakes both block returns and create them. Removal is sampled at
     the measured per-tier fraction, which falls as severity rises;
     added scatter rises. Status per point drives the colouring:
     clean, attenuated, added. */
  FI.faults.snow = function (clean, out, scene, sev, seed) {
    var rnd = FI.rng((seed ^ 0x5A0) >>> 0);
    var pr = P.snow.rem[sev], pa = P.snow.att[sev], addF = P.snow.add[sev];
    ensure(out, clean.n + Math.ceil(clean.n * addF) + 16);
    out.n = 0;
    var removed = 0, atten = 0;
    for (var k = 0; k < clean.n; k++) {
      if (sev > 0 && rnd() < pr) { removed++; continue; }
      var j = out.n++;
      out.x[j] = clean.x[k]; out.y[j] = clean.y[k]; out.a[j] = clean.a[k];
      if (sev > 0 && rnd() < pa) {
        out.i[j] = clean.i[k] * (0.30 + rnd() * 0.30);
        out.s[j] = ST.ATTEN; atten++;
      } else {
        out.i[j] = clean.i[k];
        out.s[j] = ST.CLEAN;
      }
    }
    var added = 0;
    if (sev > 0) {
      var perAgent = Math.round((clean.n * addF) / Math.max(1, scene.agents.length));
      for (var ai = 0; ai < scene.agents.length; ai++) {
        var ag = scene.agents[ai];
        for (var m = 0; m < perAgent; m++) {
          var th = rnd() * Math.PI * 2;
          var r = 1.5 + Math.pow(rnd(), 1.6) * 16;
          push(out, ag.x + Math.cos(th) * r, ag.y + Math.sin(th) * r,
               0.10 + rnd() * 0.25, ai, ST.ADDED);
          added++;
        }
      }
    }
    out.stats = { removed: removed, atten: atten, added: added, base: clean.n };
    return out;
  };

  /* ==================================================================
     RENDERER
  ================================================================== */

  FI.view = function (canvas, cssH, zoom) {
    var f = FI.fitCanvas(canvas, cssH);
    var z = zoom || 1;
    var scale = Math.min(f.w / VIEW.w, f.h / VIEW.h) * z;
    var ox = f.w / 2 - VIEW.cx * scale;
    var oy = f.h / 2 + VIEW.cy * scale;
    return {
      ctx: f.ctx, w: f.w, h: f.h, scale: scale,
      sx: function (x) { return ox + x * scale; },
      sy: function (y) { return oy - y * scale; },
      m: function (d) { return d * scale; },
      /* inverse, so background geometry can be drawn out to whatever the
         canvas actually shows rather than to a hard-coded world range */
      wx: function (px) { return (px - ox) / scale; },
      wy: function (py) { return (oy - py) / scale; }
    };
  };

  /* Truth underlay: the world the point clouds are trying to describe.
     Deliberately faint, so the points stay the subject. */
  FI.drawWorld = function (v, scene, opts) {
    var ctx = v.ctx, C = FI.colors();
    opts = opts || {};
    ctx.clearRect(0, 0, v.w, v.h);

    ctx.fillStyle = C.surface2;
    ctx.fillRect(0, 0, v.w, v.h);

    /* everything below is drawn out to whatever the canvas shows, so the
       roads always run off the edges instead of stopping in mid-air */
    var x0 = v.wx(0), x1 = v.wx(v.w), y0 = v.wy(v.h), y1 = v.wy(0);

    /* 10 m grid */
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var g = Math.ceil(x0 / 10) * 10; g <= x1; g += 10) {
      ctx.moveTo(v.sx(g), 0); ctx.lineTo(v.sx(g), v.h);
    }
    for (g = Math.ceil(y0 / 10) * 10; g <= y1; g += 10) {
      ctx.moveTo(0, v.sy(g)); ctx.lineTo(v.w, v.sy(g));
    }
    ctx.stroke();

    /* road surface */
    ctx.fillStyle = C.road;
    ctx.fillRect(0, v.sy(CURB.n), v.w, v.m(CURB.n - CURB.s));
    ctx.fillRect(v.sx(CURB.w), 0, v.m(CURB.e - CURB.w), v.h);

    /* lane centre lines */
    ctx.strokeStyle = C.roadline;
    ctx.lineWidth = 1;
    ctx.setLineDash([v.m(1.6), v.m(1.6)]);
    ctx.beginPath();
    ctx.moveTo(0, v.sy(RD.ay)); ctx.lineTo(v.w, v.sy(RD.ay));
    ctx.moveTo(v.sx(RD.bx), 0); ctx.lineTo(v.sx(RD.bx), v.h);
    ctx.stroke();
    ctx.setLineDash([]);

    /* buildings */
    ctx.fillStyle = C.build;
    ctx.strokeStyle = C.buildline;
    ctx.lineWidth = 1;
    scene.st.buildings.forEach(function (b) {
      ctx.beginPath();
      ctx.rect(v.sx(b.cx - b.w / 2), v.sy(b.cy + b.h / 2), v.m(b.w), v.m(b.h));
      ctx.fill(); ctx.stroke();
    });

    /* parked cars */
    if (opts.parked !== false) {
      ctx.strokeStyle = C.buildline;
      scene.st.parked.forEach(function (c) {
        var cn = boxCorners(c.cx, c.cy, CAR.l, CAR.w, c.h);
        ctx.beginPath();
        cn.forEach(function (p, i) {
          var X = v.sx(p[0]), Y = v.sy(p[1]);
          if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        });
        ctx.closePath();
        ctx.stroke();
      });
    }
  };

  /* Point cloud. mode: "agent" | "intensity" | "status". */
  FI.drawPoints = function (v, cloud, mode, opts) {
    var ctx = v.ctx, C = FI.colors();
    opts = opts || {};
    var sz = opts.size || 1.9;
    var half = sz / 2;
    ctx.globalAlpha = opts.alpha === undefined ? 1 : opts.alpha;

    function pass(test, color) {
      ctx.fillStyle = color;
      for (var k = 0; k < cloud.n; k++) {
        if (!test(k)) continue;
        ctx.fillRect(v.sx(cloud.x[k]) - half, v.sy(cloud.y[k]) - half, sz, sz);
      }
    }

    if (mode === "intensity") {
      var ramp = C.ramp;
      for (var b = 0; b < ramp.length; b++) {
        (function (bi) {
          pass(function (k) {
            var q = Math.min(ramp.length - 1, Math.floor(cloud.i[k] * ramp.length));
            return q === bi;
          }, ramp[bi]);
        })(b);
      }
    } else if (mode === "status") {
      pass(function (k) { return cloud.s[k] === ST.CLEAN; }, C.s1);
      pass(function (k) { return cloud.s[k] === ST.ATTEN; }, C.s4);
      pass(function (k) { return cloud.s[k] === ST.ADDED; }, C.crit);
    } else {
      var only = opts.only;
      for (var a = 0; a < 6; a++) {
        if (only !== undefined && only !== a) continue;
        (function (ai) {
          pass(function (k) { return cloud.a[k] === ai; }, C.agent[ai]);
        })(a);
      }
    }
    ctx.globalAlpha = 1;
  };

  /* Vehicle boxes. style: "live" | "ghost" | "hidden" */
  FI.drawBox = function (v, corners, color, style, dash) {
    var ctx = v.ctx;
    ctx.beginPath();
    corners.forEach(function (p, i) {
      var X = v.sx(p[0]), Y = v.sy(p[1]);
      if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    });
    ctx.closePath();
    if (style === "fill") { ctx.fillStyle = color; ctx.fill(); }
    ctx.strokeStyle = color;
    ctx.lineWidth = style === "ghost" ? 1 : 1.6;
    if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  /* Agent glyph: a chevron pointing along heading, ego larger. */
  FI.drawAgents = function (v, scene, opts) {
    var ctx = v.ctx, C = FI.colors();
    opts = opts || {};
    scene.agents.forEach(function (ag, i) {
      var col = C.agent[i];
      var off = opts.off && opts.off[i];
      var X = v.sx(ag.x), Y = v.sy(ag.y);
      var L = v.m(i === 0 ? 5.6 : 4.8), W = v.m(i === 0 ? 2.6 : 2.2);

      ctx.save();
      ctx.translate(X, Y);
      ctx.rotate(-ag.h);
      ctx.globalAlpha = off ? 0.28 : 1;
      ctx.beginPath();
      ctx.moveTo(L / 2, 0);
      ctx.lineTo(-L / 2, -W / 2);
      ctx.lineTo(-L / 3, 0);
      ctx.lineTo(-L / 2, W / 2);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      if (i === 0) {
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();

      if (off) {
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1.6;
        var r = v.m(2.6);
        ctx.beginPath();
        ctx.moveTo(X - r, Y - r); ctx.lineTo(X + r, Y + r);
        ctx.moveTo(X + r, Y - r); ctx.lineTo(X - r, Y + r);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (opts.labels !== false) {
        ctx.fillStyle = off ? C.muted : col;
        ctx.font = FI.font(11, i === 0);
        ctx.textAlign = "center";
        ctx.fillText(ag.label, X, Y - v.m(3.4));
      }
    });
  };

  /* Small scale bar so distances on the canvas stay readable. */
  FI.drawScaleBar = function (v, metres) {
    var ctx = v.ctx, C = FI.colors();
    var m = metres || 20;
    var x0 = 14, y0 = v.h - 16, L = v.m(m);
    ctx.strokeStyle = C.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + L, y0);
    ctx.moveTo(x0, y0 - 3); ctx.lineTo(x0, y0 + 3);
    ctx.moveTo(x0 + L, y0 - 3); ctx.lineTo(x0 + L, y0 + 3);
    ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.font = FI.font(10);
    ctx.textAlign = "left";
    ctx.fillText(m + " m", x0 + L + 6, y0 + 3.5);
  };

  /* Caption drawn inside the canvas, used for the animated figures. */
  FI.drawCaption = function (v, lines, align) {
    var ctx = v.ctx, C = FI.colors();
    ctx.font = FI.font(12);
    ctx.textAlign = align === "right" ? "right" : "left";
    var x = align === "right" ? v.w - 14 : 14;
    lines.forEach(function (ln, i) {
      ctx.fillStyle = ln.color || C.ink2;
      ctx.fillText(ln.text, x, 20 + i * 16);
    });
  };
})();
