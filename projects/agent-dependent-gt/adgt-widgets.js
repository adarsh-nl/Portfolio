/* ==================================================================
   adgt-widgets.js: the evidence figures.

   #w-units     recall as blocks: the paper's Fig. 1 counts as fractions
   #w-flow      the dual-scoring protocol (Sec. 4.4), steppable
   #w-models    Tab. 2 and Sec. 4.3: baselines, reproduction, noise floor
   #w-shrink    Sec. 5.1: how much of the reference disappears
   #w-corrected Tab. 3: as-is vs fixed, with scene-bootstrap intervals
   #w-suite     Sec. 4.1: the fourteen injectors
   #w-ranking   Sec. 5.3 / Fig. 3: severe-tier ranking of seven faults
   #w-findings  Secs. 5.4 and 5.5: strict-IoU asymmetry, snow inversion

   Every number is read from AG.DATA (adgt-data.js).
================================================================== */
(function () {
  "use strict";
  var AG = window.AG, D = AG.DATA, F = AG.fmt, S = AG.svg;

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function txt(parent, x, y, s, attrs) {
    var a = { x: x, y: y };
    if (attrs) for (var k in attrs) a[k] = attrs[k];
    var t = S("text", a, parent);
    t.textContent = s;
    return t;
  }

  /* ================================================================
     Recall as blocks
  ================================================================ */
  AG.ready(function () {
    var root = document.getElementById("w-units");
    if (!root) return;
    var s = D.fig1.states;
    var rowA = root.querySelector("[data-row=a]");
    var rowD = root.querySelector("[data-row=d]");
    var scoring = "b";

    /* 22 the ego sees (17 hit, 5 missed after the drop), 7 only the
       collaborator sees. With both agents: 21 hits, 8 misses. */
    function cellsFor(state) {
      var out = [];
      var i;
      if (state === "a") {
        for (i = 0; i < 29; i++) out.push({ cls: i < 21 ? "" : "fn", u: i >= 22 });
        /* order: first the 22, then the 7; place hits so the 7 hold 4 hits */
        out = [];
        for (i = 0; i < 22; i++) out.push({ cls: i < 17 ? "" : "fn", u: false });
        for (i = 0; i < 7; i++) out.push({ cls: i < 4 ? "" : "fn", u: true });
      } else if (state === "b") {
        for (i = 0; i < 22; i++) out.push({ cls: i < 17 ? "" : "fn", u: false });
        for (i = 0; i < 7; i++) out.push({ cls: "gone", u: true });
      } else {
        for (i = 0; i < 22; i++) out.push({ cls: i < 17 ? "" : "fn", u: false });
        for (i = 0; i < 7; i++) out.push({ cls: i < 1 ? "" : "fn", u: true });
      }
      return out;
    }
    function build(row, state) {
      var box = row.querySelector(".ag-units-cells");
      if (!box.children.length) for (var i = 0; i < 29; i++) box.appendChild(document.createElement("i"));
      cellsFor(state).forEach(function (c, i) {
        box.children[i].className = c.cls + (c.u ? " u" : "");
      });
      var st = s[state];
      row.querySelector(".ag-frac").innerHTML =
        "recall = <b>" + st.tp + " / " + st.ref + " = " + (st.tp / st.ref).toFixed(3) + "</b> &nbsp; precision = " +
        st.tp + " / " + (st.tp + st.fp) + " = " + (st.tp / (st.tp + st.fp)).toFixed(3);
      box.setAttribute("aria-label", st.label + ": " + st.ref + " objects in the reference, " + st.tp +
        " detected, " + st.fn + " missed; " + st.fp + " false positives.");
    }
    build(rowA, "a");
    build(rowD, scoring);
    var note = root.querySelector(".ag-units-note");
    function setNote() {
      note.innerHTML = scoring === "b"
        ? "Scored against the union, the drop looks <b>almost free on recall</b> (0.724 → 0.773: it went <i>up</i>), because the denominator lost the seven objects the collaborator was supplying."
        : "Scored against the fixed reference, the same detections show the loss: recall <b>0.724 → 0.621</b>. The one detection of a hidden object counts as correct again.";
    }
    setNote();
    AG.seg(root.querySelector(".ag-seg"), function (v) { scoring = v; build(rowD, v); setNote(); });
  });

  /* ================================================================
     Dual-scoring protocol: a steppable system diagram
  ================================================================ */
  var NODES = [
    { id: "scene", t: "Scene s", sub: "agents 𝒜(s), ego e", stage: 0,
      h: "Scene and agents",
      p: "One test frame from OPV2V or V2XSet. Agents beyond the communication radius R of the ego are discarded first, Eq. (1): 70 m in OpenCOOD and DSRC, a configuration key in HEAL.",
      io: "in: scene s · out: 𝒜<sub>R</sub>(s)" },
    { id: "inject", t: "Fault injector", sub: "collaborators only", stage: 1,
      h: "Fault-injection layer",
      p: "Perturbs what a collaborator contributes. Faults are applied to collaborators and not to the ego, so a link fault is a failure in received information. In DSRC the corruption hooks sit in the shared loader with no ego guard. Agent dropout is the only exercised fault that changes the participating set 𝒜′.",
      io: "in: 𝒜<sub>R</sub>(s) · out: perturbed inputs, 𝒜′ ⊆ 𝒜<sub>R</sub>(s)" },
    { id: "model", t: "Released model", sub: "official code + checkpoint", stage: 2,
      h: "Model at its shipped setting",
      p: "The authors' reference implementation, wrapped but not retrained or altered. Each baseline is checked against its released benchmark number before any fault is injected (Tab. 2). With no fault active the wrapper changes AP by at most 1.86 × 10⁻⁵.",
      io: "in: perturbed inputs · out: one forward pass" },
    { id: "det", t: "Detections", sub: "𝒟(𝒜′)", stage: 3,
      h: "One set of detections",
      p: "Both scorings below use the detections from this single forward pass. Only the reference argument differs, so the difference between them isolates the effect of the moving target.",
      io: "out: 3D boxes, scored at IoU 0.5 and 0.7" },
    { id: "union", t: "Union reference", sub: "𝒢(𝒜′), Eq. (2)", stage: 4, union: true,
      h: "Standard: rebuild the reference from 𝒜′",
      p: "The reference is the union of objects annotated by the participating agents, deduplicated by first occurrence. Drop an agent and every object only it annotated, 𝒰ⱼ, leaves the answer key.",
      io: "AP(𝒟(𝒜′), 𝒢(𝒜′)), Eq. (3)" },
    { id: "fixed", t: "Fixed reference", sub: "held at the clean scene", stage: 4,
      h: "Fixed: hold the unperturbed object set",
      p: "A second access to the unperturbed sample gives the reference before the fault. For stochastic pose or delay settings that access would consume the global random state and silently change later frames, so the state is snapshotted and restored around the lookup. The guard is verified on V2X-ViT, whose released configuration enables pose noise and asynchrony.",
      io: "AP(𝒟(𝒜′), 𝒢<sub>fix</sub>), Eq. (4), with 𝒢<sub>fix</sub> = 𝒢(𝒜<sub>R</sub>(s))" },
    { id: "apu", t: "AP as reported", sub: "Eq. (3)", stage: 5,
      h: "What the standard protocol reports",
      p: "Average Precision against the moving reference. This is the number in published agent-count experiments.",
      io: "scalar per cell" },
    { id: "apf", t: "AP, fixed target", sub: "Eq. (4)", stage: 5,
      h: "What the loss actually costs",
      p: "Average Precision against the reference held at the unperturbed scene.",
      io: "scalar per cell" },
    { id: "out", t: "ΔAP and |𝒢|", sub: "recorded per cell", stage: 6,
      h: "Record the difference and one integer",
      p: "The gap between the two scorings is the part of the reported degradation caused by the evaluation moving its own target. The number of reference objects is recorded for every cell, which the standard protocol does not do and without which a grid cannot be corrected later.",
      io: "per cell: AP as-is, AP fixed, Δ, |𝒢|" }
  ];
  var EDGES = [["scene", "inject"], ["inject", "model"], ["model", "det"], ["det", "union"], ["det", "fixed"],
    ["union", "apu"], ["fixed", "apf"], ["apu", "out"], ["apf", "out"]];

  function flowLayout(wide) {
    if (wide) {
      var Wn = 128, Hn = 50, y0 = 94, yu = 34, yf = 154;
      return { vb: [0, 0, 1000, 210], w: Wn, h: Hn, pos: {
        scene: [10, y0], inject: [158, y0], model: [306, y0], det: [454, y0],
        union: [602, yu], fixed: [602, yf], apu: [750, yu], apf: [750, yf], out: [880, y0] }, dir: "h", outW: 112 };
    }
    var w = 150, h = 50;
    return { vb: [0, 0, 340, 556], w: w, h: h, pos: {
      scene: [95, 0], inject: [95, 76], model: [95, 152], det: [95, 228],
      union: [8, 318], fixed: [182, 318], apu: [8, 408], apf: [182, 408], out: [95, 498] }, dir: "v", outW: 150 };
  }

  AG.ready(function () {
    var root = document.getElementById("w-flow");
    if (!root) return;
    var host = root.querySelector(".ag-flow");
    var detail = root.querySelector(".ag-detail");
    var stepOut = root.querySelector(".ag-flow-step");
    var stage = 6, sel = "det", running = false, timer = 0, pulses = [];
    var nodeEls = {}, edgeEls = [], svg = null, L = null;

    function build() {
      var wide = host.clientWidth > 860;
      L = flowLayout(wide);
      clear(host);
      svg = S("svg", { viewBox: L.vb.join(" "), role: "group", "aria-label": "Dual-scoring protocol diagram" }, host);
      svg.style.maxWidth = wide ? "" : "400px";
      svg.style.margin = "0 auto";
      var defs = S("defs", null, svg);
      var mk = S("marker", { id: "ag-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
      S("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--ag-axis)" }, mk);
      edgeEls = EDGES.map(function (e) {
        var a = box(e[0]), b = box(e[1]);
        var d;
        if (L.dir === "h") {
          var x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
          d = "M" + x1 + "," + y1 + " C" + mx + "," + y1 + " " + mx + "," + y2 + " " + (x2 - 2) + "," + y2;
        } else {
          var X1 = a.x + a.w / 2, Y1 = a.y + a.h, X2 = b.x + b.w / 2, Y2 = b.y, my = (Y1 + Y2) / 2;
          d = "M" + X1 + "," + Y1 + " C" + X1 + "," + my + " " + X2 + "," + my + " " + X2 + "," + (Y2 - 2);
        }
        var p = S("path", { d: d, class: "ag-edge", "marker-end": "url(#ag-arrow)" }, svg);
        p._from = e[0]; p._to = e[1];
        return p;
      });
      NODES.forEach(function (n) {
        var b = box(n.id);
        var g = S("g", { class: "ag-node" + (n.union ? " is-union" : ""), tabindex: 0, role: "button",
          "aria-label": n.t + ". " + n.h }, svg);
        S("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 9 }, g);
        txt(g, b.x + b.w / 2, b.y + 21, n.t, { "text-anchor": "middle" });
        txt(g, b.x + b.w / 2, b.y + 37, n.sub, { "text-anchor": "middle", class: "ag-node-sub" });
        g.addEventListener("click", function () { select(n.id); });
        g.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(n.id); }
        });
        nodeEls[n.id] = g;
      });
      paint();
    }
    function box(id) {
      var p = L.pos[id];
      return { x: p[0], y: p[1], w: id === "out" ? L.outW : L.w, h: L.h };
    }
    function node(id) { return NODES.filter(function (n) { return n.id === id; })[0]; }

    function paint() {
      NODES.forEach(function (n) {
        var g = nodeEls[n.id];
        if (!g) return;
        g.classList.toggle("is-lit", n.stage <= stage);
        g.classList.toggle("is-sel", n.id === sel);
        g.setAttribute("aria-pressed", n.id === sel ? "true" : "false");
      });
      edgeEls.forEach(function (p) {
        p.classList.toggle("is-lit", node(p._to).stage <= stage);
      });
      var n = node(sel);
      detail.innerHTML = "<h4>" + n.h + "</h4><p>" + n.p + '</p><p class="ag-io">' + n.io + "</p>";
      stepOut.textContent = "Stage " + (stage + 1) + " of 7";
    }
    function select(id) { sel = id; stopRun(); paint(); }

    function stageNodes(k) { return NODES.filter(function (n) { return n.stage === k; }); }
    function setStage(k) {
      stage = AG.clamp(k, 0, 6);
      var ns = stageNodes(stage);
      sel = ns[ns.length > 1 ? (stage === 4 ? 1 : 0) : 0].id;
      paint();
      spawnPulses(stage);
    }

    /* pulses travel along the edges entering the current stage */
    function spawnPulses(k) {
      if (AG.reducedMotion || !svg) return;
      edgeEls.forEach(function (p) {
        if (node(p._to).stage !== k) return;
        var c = S("circle", { r: 4, class: "ag-pulse" }, svg);
        pulses.push({ el: c, path: p, t: 0, len: p.getTotalLength() });
      });
      loop.start();
    }
    var loop = AG.loop(host, function (now, dt) {
      pulses = pulses.filter(function (q) {
        q.t += dt / 0.7;
        if (q.t >= 1) { q.el.remove(); return false; }
        var pt = q.path.getPointAtLength(AG.ease(q.t) * q.len);
        q.el.setAttribute("cx", pt.x); q.el.setAttribute("cy", pt.y);
        q.el.setAttribute("opacity", q.t > 0.85 ? (1 - q.t) / 0.15 : 1);
        return true;
      });
      if (running) {
        timer += dt;
        if (timer > 1.1) {
          timer = 0;
          if (stage < 6) setStage(stage + 1); else stopRun();
        }
      }
      if (!pulses.length && !running) loop.stop();
    });

    function stopRun() {
      running = false;
      var b = root.querySelector("[data-act=run]");
      b.setAttribute("aria-pressed", "false");
      b.textContent = "Run the protocol";
    }
    root.querySelector("[data-act=run]").addEventListener("click", function () {
      if (running) { stopRun(); return; }
      running = true; timer = 0;
      this.setAttribute("aria-pressed", "true");
      this.textContent = "Pause";
      setStage(0);
      if (AG.reducedMotion) { stopRun(); setStage(6); }
    });
    root.querySelector("[data-act=back]").addEventListener("click", function () { stopRun(); setStage(stage - 1); });
    root.querySelector("[data-act=fwd]").addEventListener("click", function () { stopRun(); setStage(stage + 1); });

    build();
    AG.onResize(host, build);
  });

  /* ================================================================
     Tab. 1: the three codebases
  ================================================================ */
  AG.ready(function () {
    var tb = document.querySelector(".ag-codebases");
    if (!tb) return;
    D.codebases.forEach(function (c) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td><b>" + c.name + "</b></td><td>" + c.union + "</td><td>" + c.radius + "</td><td>" + c.note + "</td>";
      tb.appendChild(tr);
    });
  });

  /* ================================================================
     Models at released settings
  ================================================================ */
  AG.ready(function () {
    var root = document.getElementById("w-models");
    if (!root) return;
    var tbody = root.querySelector("tbody");
    var info = root.querySelector(".ag-models-detail");
    var LBL = { exact: "reproduced", near: "near", reference: "reference only" };
    D.models.forEach(function (m, i) {
      var tr = document.createElement("tr");
      tr.tabIndex = 0;
      var diff = m.clean - m.bench;
      tr.innerHTML = "<td><b>" + m.name + "</b></td><td>" + m.data + " <span class='ag-src'>(" +
        D.datasets[m.data].toLocaleString("en") + " frames)</span></td><td>" + m.setting + "</td>" +
        "<td class='num'>" + m.clean.toFixed(4) + "</td><td class='num'>" + m.bench.toFixed(4) + "</td>" +
        "<td class='num'>" + F.d(diff, 4) + "</td>" +
        "<td><span class='ag-pill ag-pill-" + m.verdict + "'>" + LBL[m.verdict] + "</span></td>";
      function show() {
        Array.prototype.forEach.call(tbody.children, function (r) { r.classList.remove("is-sel"); });
        tr.classList.add("is-sel");
        var fl = m.floor70 === 0 ? "repeats bit-exactly (no measurable floor)" :
          "within-session spread " + F.sci(m.floor50) + " AP@0.5 and " + F.sci(m.floor70) + " AP@0.7";
        var inert = m.inert === null ? "no contemporaneous unwrapped run, reported as missing" :
          m.inert === 0 ? "exactly zero" : F.sci(m.inert) + " AP@0.5";
        info.innerHTML = "<b>" + m.name + ".</b> " + m.detail + " <br><span class='ag-src'>Noise floor:</span> " + fl +
          ". <span class='ag-src'>Wrapper, no fault active:</span> " + inert + ".";
      }
      tr.addEventListener("click", show);
      tr.addEventListener("focus", show);
      tbody.appendChild(tr);
      if (i === 0) show();
    });
  });

  /* ================================================================
     Generic horizontal bar chart (SVG)
  ================================================================ */
  function hbars(host, rows, opts) {
    clear(host);
    var w = Math.max(280, host.clientWidth);
    var narrow = w < 520;
    var labW = opts.labW ? opts.labW(narrow) : (narrow ? 92 : 132);
    var rowH = narrow ? 30 : 34, padT = opts.padT || 8, padB = 28;
    var h = padT + rows.length * rowH + padB;
    var svg = S("svg", { viewBox: "0 0 " + w + " " + h, class: "ag-chart", role: "img", "aria-label": opts.aria }, host);
    var x0 = labW, x1 = w - (narrow ? 48 : 64);
    var dom = opts.domain;
    var X = function (v) { return x0 + (v - dom[0]) / (dom[1] - dom[0]) * (x1 - x0); };
    opts.ticks.forEach(function (tv) {
      S("line", { x1: X(tv), x2: X(tv), y1: padT - 4, y2: h - padB + 2, class: "ag-gridline" }, svg);
      txt(svg, X(tv), h - padB + 16, opts.tickFmt(tv), { "text-anchor": "middle", class: "ag-muted", "font-size": 11 });
    });
    var zero = X(Math.max(dom[0], Math.min(dom[1], 0)));
    rows.forEach(function (r, i) {
      var y = padT + i * rowH;
      txt(svg, labW - 10, y + rowH / 2 + 4, r.label, { "text-anchor": "end", "font-size": narrow ? 11 : 12 });
      var xa = X(Math.min(0, r.value)), xb = X(Math.max(0, r.value));
      var g = S("g", { tabindex: 0, role: "img", "aria-label": r.aria || (r.label + ": " + opts.valFmt(r.value)) }, svg);
      var rect = S("rect", { x: zero, y: y + 6, width: 0, height: rowH - 12, rx: 2, fill: r.color, class: "ag-bar" }, g);
      if (r.hatch) rect.setAttribute("fill", "url(#" + r.hatch + ")");
      if (r.dim) g.classList.add("is-dim");
      var tx = r.value < 0 ? xa - 6 : xb + 6;
      txt(g, tx, y + rowH / 2 + 4, opts.valFmt(r.value), { "text-anchor": r.value < 0 ? "end" : "start", class: "ag-val", "font-size": 12 });
      if (r.tip) AG.tip(g, function () { return r.tip; });
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          rect.setAttribute("x", xa);
          rect.setAttribute("width", Math.max(1, xb - xa));
        });
      });
      r._g = g;
    });
    S("line", { x1: zero, x2: zero, y1: padT - 4, y2: h - padB + 2, class: "ag-zero" }, svg);
    return svg;
  }

  /* ================================================================
     Reference shrinkage (Sec. 5.1)
  ================================================================ */
  AG.ready(function () {
    var root = document.getElementById("w-shrink");
    if (!root) return;
    var host = root.querySelector(".ag-chart-host");
    var cap = root.querySelector(".ag-shrink-cap");
    var mode = "p";
    function render() {
      var C = AG.colors();
      var src = mode === "p" ? D.shrinkByP : D.shrinkByStratum;
      var rows = src.map(function (r) {
        return { label: r.label, value: r.value, color: C.fn,
          tip: "<b>" + r.label + "</b><br>reference set shrinks by " + F.pct(r.value) };
      });
      hbars(host, rows, { domain: [0, 0.18], ticks: [0, 0.05, 0.1, 0.15], tickFmt: function (v) { return Math.round(v * 100) + "%"; },
        valFmt: function (v) { return F.pct(v); },
        aria: mode === "p" ? "Reference-set shrinkage by agent-drop probability: 1.8, 4.6, 7.9 percent, and 13.1 percent with every collaborator dropped." :
          "Reference-set shrinkage with every collaborator dropped, by scene agent count: 13.9, 12.8, 9.8 and 15.7 percent." });
      cap.innerHTML = mode === "p"
        ? "Fraction of ground-truth objects that leave the union reference as collaborators are dropped, pooled over the 400-frame stratified V2XSet sample. It is a property of the scene and the agent set, so it is <b>model-independent</b>."
        : "With every collaborator dropped, every stratum loses reference objects, but not monotonically: three-agent scenes lose less than two-agent scenes and four-agent scenes the least. The paper reports these values <b>without fitting a trend</b>.";
    }
    AG.seg(root.querySelector(".ag-seg"), function (v) { mode = v; render(); });
    render();
    AG.onTheme(render);
    AG.onResize(host, render);
  });

  /* ================================================================
     Corrected cost (Tab. 3)
  ================================================================ */
  AG.ready(function () {
    var root = document.getElementById("w-corrected");
    if (!root) return;
    var host = root.querySelector(".ag-chart-host");
    var host2 = root.querySelector(".ag-chart-host-2");
    var read = root.querySelector(".ag-corr-read");
    var metric = "70";

    function render() {
      var C = AG.colors();
      clear(host); clear(host2);
      var rows = D.corrected;
      var w = Math.max(280, host.clientWidth), narrow = w < 520;
      var labW = narrow ? 70 : 96, rowH = 46, padT = 22, padB = 26;
      var h = padT + rows.length * rowH + padB;
      var key = metric === "70" ? "ap70" : "ap50";
      var lo = Infinity, hi = -Infinity;
      rows.forEach(function (r) { lo = Math.min(lo, r[key][1]); hi = Math.max(hi, r[key][0]); });
      var pad = (hi - lo) * 0.12;
      var dom = [lo - pad, hi + pad];
      var x0 = labW, x1 = w - 18;
      var X = function (v) { return x0 + (v - dom[0]) / (dom[1] - dom[0]) * (x1 - x0); };
      var svg = S("svg", { viewBox: "0 0 " + w + " " + h, class: "ag-chart", role: "img",
        "aria-label": "CoBEVT agent drop, AP@0." + (metric === "70" ? "7" : "5") + " as-is versus fixed reference at three severity tiers." }, host);
      var step = metric === "70" ? 0.02 : 0.02;
      for (var t = Math.ceil(dom[0] / step) * step; t <= dom[1]; t += step) {
        S("line", { x1: X(t), x2: X(t), y1: padT - 6, y2: h - padB + 2, class: "ag-gridline" }, svg);
        txt(svg, X(t), h - padB + 16, t.toFixed(2), { "text-anchor": "middle", class: "ag-muted", "font-size": 11 });
      }
      txt(svg, x0, 12, "AP@0." + (metric === "70" ? "7" : "5") + " (axis zoomed, not from zero)", { class: "ag-muted", "font-size": 11 });
      rows.forEach(function (r, i) {
        var y = padT + i * rowH + rowH / 2;
        txt(svg, labW - 12, y + 4, r.tier, { "text-anchor": "end" });
        var a = r[key][0], b = r[key][1];
        var g = S("g", { tabindex: 0, role: "img", "aria-label": r.tier + ": as-is " + a.toFixed(4) + ", fixed " + b.toFixed(4) }, svg);
        S("line", { x1: X(b), x2: X(a), y1: y, y2: y, stroke: C.fn, "stroke-width": 3, "stroke-linecap": "round", opacity: 0.55 }, g);
        S("circle", { cx: X(a), cy: y, r: 6.5, fill: C.surface, stroke: C.tp, "stroke-width": 2.2 }, g);
        S("circle", { cx: X(b), cy: y, r: 6.5, fill: C.fn }, g);
        txt(g, X(a) + 11, y - 9, a.toFixed(4), { "font-size": 11, class: "ag-val" });
        txt(g, X(b) - 11, y - 9, b.toFixed(4), { "font-size": 11, class: "ag-val", "text-anchor": "end" });
        AG.tip(g, function () {
          return "<b>" + r.tier + "</b><br>as-is " + a.toFixed(4) + " → fixed " + b.toFixed(4) +
            "<br>Δ = " + F.d(metric === "70" ? r.d70 : r.d50, 4);
        });
      });

      /* forest plot of the differences with 95% scene-bootstrap intervals */
      var dKey = metric === "70" ? "d70" : "d50", ciKey = metric === "70" ? "ci70" : "ci50";
      var h2 = padT + rows.length * 40 + padB;
      var dom2 = metric === "70" ? [-0.026, 0.006] : [-0.042, 0.006];
      var X2 = function (v) { return x0 + (v - dom2[0]) / (dom2[1] - dom2[0]) * (x1 - x0); };
      var s2 = S("svg", { viewBox: "0 0 " + w + " " + h2, class: "ag-chart", role: "img",
        "aria-label": "Difference between fixed and as-is AP with 95 percent scene-bootstrap intervals." }, host2);
      txt(s2, x0, 12, "Δ = fixed − as-is, with 95% scene-bootstrap interval", { class: "ag-muted", "font-size": 11 });
      [-0.04, -0.03, -0.02, -0.01, 0].forEach(function (t) {
        if (t < dom2[0]) return;
        S("line", { x1: X2(t), x2: X2(t), y1: padT - 6, y2: h2 - padB + 2, class: t === 0 ? "ag-zero" : "ag-gridline" }, s2);
        txt(s2, X2(t), h2 - padB + 16, F.f(t, 2), { "text-anchor": "middle", class: "ag-muted", "font-size": 11 });
      });
      rows.forEach(function (r, i) {
        var y = padT + i * 40 + 20;
        txt(s2, labW - 12, y + 4, r.tier, { "text-anchor": "end" });
        var d = r[dKey], ci = r[ciKey];
        var g = S("g", { tabindex: 0, role: "img" }, s2);
        if (ci) {
          var excl = ci[1] < 0;
          S("line", { x1: X2(ci[0]), x2: X2(ci[1]), y1: y, y2: y, stroke: excl ? C.fn : C.ink2, "stroke-width": 2 }, g);
          [ci[0], ci[1]].forEach(function (c) {
            S("line", { x1: X2(c), x2: X2(c), y1: y - 5, y2: y + 5, stroke: excl ? C.fn : C.ink2, "stroke-width": 2 }, g);
          });
        } else {
          txt(g, X2(d) + 12, y + 4, "interval not reported", { "font-size": 11, class: "ag-muted" });
        }
        S("circle", { cx: X2(d), cy: y, r: 5, fill: C.fn }, g);
        var lbl = r.tier + ": Δ " + F.d(d, 4) + (ci ? ", 95% interval [" + F.d(ci[0], 4) + ", " + F.d(ci[1], 4) + "]" +
          (ci[1] < 0 ? ", excludes zero" : ", includes zero") : ", interval not reported");
        g.setAttribute("aria-label", lbl);
        AG.tip(g, function () {
          return "<b>" + r.tier + "</b><br>Δ " + F.d(d, 4) + (ci ? "<br>95% CI [" + F.d(ci[0], 4) + ", " + F.d(ci[1], 4) + "]" : "") +
            (metric === "70" ? "<br>" + r.floorX + "× CoBEVT's within-session floor" : "");
        });
      });

      read.innerHTML = metric === "70"
        ? "At AP@0.7 every Δ is <b>71, 138 and 181 times</b> CoBEVT's within-session determinism floor of " + F.sci(D.cobevtFloor70) +
          ", so it is not rerun noise. Resampling the 19 test scenarios, every interval still <b>includes zero</b>: the sign is consistent across tiers, but at this scene count the effect is not separable from zero."
        : "At AP@0.5 the decreases are larger, because at the looser threshold more restored objects can be matched to existing detections. The moderate and severe intervals <b>exclude zero</b>.";
    }
    AG.seg(root.querySelector(".ag-seg"), function (v) { metric = v; render(); });
    render();
    AG.onTheme(render);
    AG.onResize(host, render);
  });

  /* ================================================================
     The injector suite + severe-tier ranking
  ================================================================ */
  AG.ready(function () {
    var root = document.getElementById("w-suite");
    if (!root) return;
    var grid = root.querySelector(".ag-inj-grid");
    var info = root.querySelector(".ag-inj-detail");
    var filter = "all";
    var btns = D.injectors.map(function (inj) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ag-inj" + (inj.run ? "" : " is-idle") + (inj.moves ? " is-moves" : "");
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = inj.name + "<small>" + inj.family + (inj.run ? " · exercised" : " · released") + "</small>";
      b.addEventListener("click", function () {
        btns.forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
        info.innerHTML = "<b>" + inj.family + " · " + inj.name + ".</b> " +
          (inj.run ? "Exercised here at " + inj.tiers + ". " :
            "Released but not exercised: all four evaluated models are LiDAR-only. Its parameterisation is in the supplementary material. ") +
          (inj.moves ? "<b>Changes who participates, so the union reference moves with the fault.</b>" :
            "Leaves the participating agent set intact, so the reference does not move: predictions degrade, the target stays put.");
      });
      grid.appendChild(b);
      return b;
    });
    function apply() {
      D.injectors.forEach(function (inj, i) {
        var show = filter === "all" || (filter === "run" && inj.run) || (filter === "moves" && inj.moves);
        btns[i].classList.toggle("is-dim", !show);
      });
    }
    AG.seg(root.querySelector(".ag-seg"), function (v) { filter = v; apply(); });
    btns[2].click();
  });

  AG.ready(function () {
    var root = document.getElementById("w-ranking");
    if (!root) return;
    var host = root.querySelector(".ag-chart-host");
    var hl = false;
    function render() {
      var C = AG.colors();
      var rows = D.ranking.map(function (r) {
        return { label: r.name + (r.movesRef ? " †" : ""), value: r.value,
          color: r.band === "data" ? C.ink2 : C.s3,
          dim: hl && !r.movesRef,
          tip: "<b>" + r.name + "</b><br>mean relative AP@0.7 drop, severe tier: " + F.f(r.value, 3) +
            (r.movesRef ? "<br>two-agent stratum only; its reference moves with the fault" : "") };
      });
      var svg = hbars(host, rows, { domain: [-1, 0], ticks: [-1, -0.75, -0.5, -0.25, 0],
        tickFmt: function (v) { return F.f(v, 2); }, valFmt: function (v) { return F.f(v, 3); },
        labW: function (n) { return n ? 112 : 140; },
        aria: "Mean relative AP@0.7 drop across models at the severe tier. Corrupted data: fog −0.874, snow −0.627, point reduction −0.509, pose error −0.404, latency −0.371. Lost collaborators: modality dropout −0.126, agent dropout −0.082." });
      /* band separator between corrupted data and lost collaborators */
      var vb = svg.getAttribute("viewBox").split(" ").map(Number);
      var rowH = vb[2] < 520 ? 30 : 34, y = 8 + 5 * rowH;
      S("line", { x1: 0, x2: vb[2], y1: y, y2: y, stroke: C.axis, "stroke-dasharray": "4 4" }, svg);
      var xl = (vb[2] < 520 ? 112 : 140) + 4;
      txt(svg, xl, y - 6, "↑ corrupted data", { class: "ag-muted", "font-size": 10.5 });
      txt(svg, xl, y + 14, "↓ lost collaborators", { class: "ag-muted", "font-size": 10.5 });
    }
    var tg = root.querySelector("[data-act=moves]");
    tg.addEventListener("click", function () {
      hl = !hl;
      tg.setAttribute("aria-pressed", hl ? "true" : "false");
      render();
    });
    render();
    AG.onTheme(render);
    AG.onResize(host, render);
  });

  /* ================================================================
     Secondary findings: strict-IoU asymmetry and the snow inversion
  ================================================================ */
  AG.ready(function () {
    var root = document.getElementById("w-findings");
    if (!root) return;
    var host = root.querySelector(".ag-chart-host");
    var cap = root.querySelector(".ag-findings-cap");
    var view = "iou";

    function iou() {
      var C = AG.colors();
      var rows = D.iouRatio.map(function (r) {
        return { label: r.model + (r.partial ? " *" : ""), value: r.value, color: r.partial ? C.out : C.s1,
          tip: "<b>" + r.model + "</b><br>AP@0.7 drop ÷ AP@0.5 drop = " + r.value.toFixed(2) + (r.note ? "<br>" + r.note : "") };
      });
      hbars(host, rows, { domain: [0, 4.4], ticks: [0, 1, 2, 3, 4], tickFmt: function (v) { return v + "×"; },
        valFmt: function (v) { return v.toFixed(2) + "×"; },
        aria: "Ratio of AP@0.7 to AP@0.5 degradation under pose error, mean over tiers: CoBEVT 3.82, Where2comm 2.90, V2X-ViT 1.79, CoSDH 2.30 over two tiers." });
      cap.innerHTML = "Pose error costs more at the strict IoU threshold for every model, but by how much is model-specific: the largest and smallest ratios differ by more than a factor of two. For CoBEVT the ratio falls from 5.61 (mild) to 2.41 (severe). V2X-ViT degrades far less under pose error, which the paper <b>cannot explain</b>: it is the only model trained under injected pose noise, but Where2comm also ships with localisation error enabled and still drops like CoBEVT. * CoSDH over its moderate and severe tiers only.";
    }

    function snow() {
      var C = AG.colors();
      clear(host);
      var w = Math.max(280, host.clientWidth), narrow = w < 560;
      var panels = [
        { title: "Fraction of points removed (CoBEVT run)", vals: D.snow.removedCoBEVT, col: C.ink2, dom: [0.27, 0.42], fmt: function (v) { return v.toFixed(3); } },
        { title: "Where2comm AP@0.7", vals: D.snow.apWhere2comm, col: C.fn, dom: [0.19, 0.25], fmt: function (v) { return v.toFixed(4); } },
        { title: "CoSDH AP@0.7 (OPV2V)", vals: D.snow.apCoSDH, col: C.s1, dom: [0.48, 0.68], fmt: function (v) { return v.toFixed(4); } }
      ];
      var pw = narrow ? w : w / 3, ph = 150, cols = narrow ? 1 : 3;
      var h = narrow ? ph * 3 + 10 : ph;
      var svg = S("svg", { viewBox: "0 0 " + w + " " + h, class: "ag-chart", role: "img",
        "aria-label": "Snow injector. Fraction of points removed falls with severity: 0.399, 0.323, 0.290. Where2comm AP@0.7: 0.2228, 0.2342, 0.2075, non-monotone. CoSDH AP@0.7: 0.6474, 0.6044, 0.5238, monotone." }, host);
      panels.forEach(function (p, i) {
        var ox = cols === 3 ? i * pw : 0, oy = cols === 3 ? 0 : i * (ph + 5);
        var l = ox + 26, r = ox + pw - 26, top = oy + 40, bot = oy + ph - 26;
        txt(svg, ox + 8, oy + 13, p.title, { "font-size": 11.5, class: "ag-val" });
        var Y = function (v) { return bot - (v - p.dom[0]) / (p.dom[1] - p.dom[0]) * (bot - top); };
        var X = function (k) { return l + k * (r - l) / 2; };
        S("line", { x1: l, x2: r, y1: bot, y2: bot, class: "ag-axis-line" }, svg);
        ["Mild", "Mod.", "Severe"].forEach(function (n, k) {
          txt(svg, X(k), bot + 15, n, { "text-anchor": "middle", class: "ag-muted", "font-size": 10.5 });
        });
        var d = p.vals.map(function (v, k) { return (k ? "L" : "M") + X(k) + "," + Y(v); }).join(" ");
        S("path", { d: d, fill: "none", stroke: p.col, "stroke-width": 2 }, svg);
        p.vals.forEach(function (v, k) {
          var g = S("g", { tabindex: 0, role: "img", "aria-label": p.title + ", " + ["mild", "moderate", "severe"][k] + ": " + p.fmt(v) }, svg);
          S("circle", { cx: X(k), cy: Y(v), r: 4.5, fill: p.col }, g);
          txt(g, X(k), Y(v) - 9, p.fmt(v), { "text-anchor": "middle", "font-size": 10.5, class: "ag-val" });
        });
      });
      cap.innerHTML = "Snow removes the <b>most</b> points at the <b>mildest</b> severity, on both datasets and for every model, because the corruption runs before any model sees the sample. AP nevertheless falls monotonically on three of four models. Where2comm is the exception (mild worse than moderate). A pre-registered density explanation predicted CoSDH would invert more, since its demand mask thresholds on point density; it stays monotone, which weakens that explanation. Each panel's vertical axis is zoomed independently; compare shapes, not heights. CoBEVT and V2X-ViT AP values are in the paper's Fig. 4.";
    }

    function render() { if (view === "iou") iou(); else snow(); }
    AG.seg(root.querySelector(".ag-seg"), function (v) { view = v; render(); });
    render();
    AG.onTheme(render);
    AG.onResize(host, render);
  });
})();
