/* ==================================================================
   uxv-arch.js — the interactive UxV Ecosystem Architecture explorer.

   The paper's Fig. 1 rebuilt as a living diagram: every module is
   clickable (description + concrete example from the paper in the
   side panel), and two flow animations show a mission command
   descending the stack and sensor data ascending it — each block
   illuminating as information passes through, so the *reason* for
   the layering is visible, not asserted.
================================================================== */
(function () {
  "use strict";
  var U = window.UXV;

  document.addEventListener("DOMContentLoaded", function () {
    var svg = document.getElementById("arch-svg");
    if (!svg) return;
    var panel = document.getElementById("arch-panel");

    var W = 640, H = 600;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    /* ------------------------------------------------------------
       Module registry: geometry + copy. Layers are drawn as tinted
       bands; modules as rounded rects inside them.
    ------------------------------------------------------------ */

    var LAYERS = [
      { id: "L4", label: "Layer 4 · Mission & Human Interface", y: 8, h: 86, tint: "s5" },
      { id: "L3", label: "Layer 3 · Collaborative Intelligence", y: 106, h: 208, tint: "s1" },
      { id: "L2", label: "Layer 2 · Ecosystem Fabric", y: 326, h: 86, tint: "s6" },
      { id: "L1", label: "Layer 1 · Heterogeneous Assets", y: 424, h: 168, tint: "s3" }
    ];

    var MODULES = {
      "mission-interface": {
        layer: "L4", x: 30, y: 34, w: 270, h: 50, name: "Mission Interface",
        desc: "The human operator specifies the mission in a standardized format — objectives, constraints, rules of engagement. Strategic command and control, not micromanagement.",
        ex: "MISSION: Secure Facility. OBJECTIVE 1: Establish Perimeter. OBJECTIVE 2: Investigate Anomaly at (lat, lon)."
      },
      "cop": {
        layer: "L4", x: 340, y: 34, w: 270, h: 50, name: "Integrated Common Operating Picture",
        desc: "A multimodal live visualization of the Distributed World Model: one unified, real-time understanding of the operational environment for the operator to monitor.",
        ex: "The operator watches the fused picture — not fifteen separate video feeds."
      },
      "dwm": {
        layer: "L3", x: 30, y: 132, w: 270, h: 172, name: "Distributed World Model",
        container: true,
        desc: "The cornerstone of the architecture: a logically centralized but physically distributed representation of shared reality — a multi-layered knowledge base spanning geometry, objects, semantics and mission intelligence.",
        ex: "Every vehicle contributes to it and reads from it; no single machine owns it."
      },
      "fusion-engine": {
        layer: "L3", x: 42, y: 160, w: 246, h: 40, name: "Spatio-Temporal Fusion Engine",
        desc: "Collects observations from all vehicles, performs data association (is this the same object?) and state fusion into unified tracks.",
        ex: "A USV's radar and a UAV's camera both detect a boat → one object ID with a better position and velocity estimate than either could produce alone."
      },
      "env-map": {
        layer: "L3", x: 42, y: 208, w: 246, h: 40, name: "Environment Map",
        desc: "Three stacked layers: geometric (terrain, obstacles), object (state of all dynamic entities), and semantic — space annotated with mission meaning.",
        ex: "Semantic annotations like No-Fly Zone, Area Already Searched, Objective 1 complete."
      },
      "kgraph": {
        layer: "L3", x: 42, y: 256, w: 246, h: 40, name: "Knowledge Graph",
        desc: "Models relationships between entities, objects and environment, enabling complex high-level reasoning and prediction.",
        ex: "UGV-2 —escorting→ civilian-1;  UAV-3 —performing→ Objective-1."
      },
      "task-engine": {
        layer: "L3", x: 340, y: 132, w: 270, h: 172, name: "Collaborative Task Engine",
        container: true,
        desc: "The decentralized decision-making and task-allocation engine of the swarm. Receives a mission of multiple objectives from the Mission Layer and turns it into coordinated action.",
        ex: "Runs distributed across whichever nodes have spare compute — no mission server to destroy."
      },
      "decomp": {
        layer: "L3", x: 352, y: 160, w: 246, h: 40, name: "Mission & Objective Decomposition",
        desc: "Breaks a complex mission into objectives, and each objective into small manageable tasks.",
        ex: "Evacuate Area → search grid A, search grid B, guide to exit 1, …"
      },
      "alloc": {
        layer: "L3", x: 352, y: 208, w: 246, h: 40, name: "Distributed Task Allocation",
        desc: "Assigns each task to the most suitable vehicle across all swarms — via market-based auctions (bids reflect capability and energy/time cost) or priority rules.",
        ex: "An aerial-imagery task draws low-cost bids from UAVs and prohibitively high bids from UGVs — allocation happens naturally."
      },
      "retask": {
        layer: "L3", x: 352, y: 256, w: 246, h: 40, name: "Dynamic Re-tasking",
        desc: "Continuously monitors the world model and task progress; reallocates tasks in response to environment changes, failures, or new higher-priority objectives.",
        ex: "A UGV dies mid-rescue → its civilian is re-auctioned to the next-best vehicle within seconds."
      },
      "bus": {
        layer: "L2", x: 30, y: 352, w: 270, h: 50, name: "Decentralized Communication Bus",
        desc: "Publish–subscribe messaging: producers and consumers never couple directly, with typed channels per kind of information — plus Delay-Tolerant Networking (store-and-forward) for communication-denied environments.",
        ex: "A UAV that went out of range automatically uploads its collected data to the world model the moment it reconnects."
      },
      "directory": {
        layer: "L2", x: 340, y: 352, w: 270, h: 50, name: "Service Directory (DHT)",
        desc: "The fleet's yellow pages, kept as a distributed hash table. On joining, each vehicle's Gateway registers its services against a service ontology; anyone can query for a needed capability.",
        ex: "A UGV finds a chemical spill → queries for chem-sensing → discovers a specialized UAV nearby."
      },
      "gateway": {
        layer: "L1", name: "Gateway",
        desc: "The vehicle's interface to the ecosystem. Three jobs: semantic translation of local data into the Canonical Data Model; task marshalling (abstract tasks → executable primitives); and service broadcasting of the vehicle's capabilities.",
        ex: "The Gateway is what makes a DJI drone and a Clearpath rover speak the same language."
      },
      "lic": {
        layer: "L1", name: "Local Intelligence Core",
        desc: "Owns the vehicle's safety and primitive execution: state estimation (e.g. Kalman filtering), local perception, collision avoidance, fail-safes. Autonomy survives even if the ecosystem vanishes.",
        ex: "A UGV's LIC prevents it from driving off a cliff — no network required."
      },
      "pal": {
        layer: "L1", name: "Platform Abstraction Layer",
        desc: "A standardized software interface separating the intelligence core from platform-specific hardware, so autonomy software is portable across different UxV systems.",
        ex: "Write the survey behavior once; run it on any airframe that implements the PAL."
      }
    };

    var VEHICLES = [
      { id: "uav", label: "UAV", d: "air", x: 30 },
      { id: "ugv", label: "UGV", d: "ground", x: 232 },
      { id: "usv", label: "USV", d: "sea", x: 434 }
    ];
    var VW = 176;

    /* ------------------------------------------------------------
       Build
    ------------------------------------------------------------ */

    var rects = {};        /* module id -> rect element */
    var centers = {};      /* module id -> {x, y} for flow endpoints */
    var flowLayer = null;
    var selectedId = null;

    function build() {
      svg.innerHTML = "";
      var C = U.colors();

      LAYERS.forEach(function (L) {
        U.svg("rect", { x: 8, y: L.y, width: W - 16, height: L.h, rx: 10,
          fill: C[L.tint], "fill-opacity": 0.06, stroke: C[L.tint], "stroke-opacity": 0.35 }, svg);
        U.svg("text", { x: 20, y: L.y + 18, "font-size": 11.5, fill: C.ink2,
          "font-family": "inherit", "font-weight": "bold" }, svg).textContent = L.label;
      });

      /* connective spine between layers */
      [[100, 106], [314, 326], [412, 424]].forEach(function (p) {
        [160, W - 160].forEach(function (x) {
          U.svg("line", { x1: x, y1: p[0] - 6, x2: x, y2: p[1] + 4, stroke: C.axis,
            "stroke-width": 1.5, "stroke-dasharray": "3 3" }, svg);
        });
      });

      function moduleRect(id, x, y, w, h, name, sub) {
        var m = MODULES[id];
        var g = U.svg("g", { "class": "arch-module", role: "button", tabindex: 0,
          "aria-label": name }, svg);
        var isContainer = m && m.container;
        var r = U.svg("rect", { x: x, y: y, width: w, height: h, rx: 7,
          fill: C.surface, stroke: sub ? C.axis : C.ink2, "stroke-width": 1,
          "fill-opacity": sub ? 0.9 : (isContainer ? 0.35 : 0.65) }, g);
        U.svg("text", {
          x: x + w / 2,
          y: isContainer ? y + 18 : y + h / 2 + 4,
          "text-anchor": "middle", "font-size": sub ? 10.5 : 11.5, fill: C.ink,
          "font-family": "inherit", "font-weight": sub ? "normal" : "bold"
        }, g).textContent = name;
        rects[id] = r;
        function choose() { select(id, r); }
        g.addEventListener("click", choose);
        g.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); }
        });
        return r;
      }

      /* L4 + L3 + L2 modules from geometry in the registry */
      ["mission-interface", "cop", "dwm", "task-engine"].forEach(function (id) {
        var m = MODULES[id];
        rects[id] = moduleRect(id, m.x, m.y, m.w, m.h, m.name, false);
        centers[id] = { x: m.x + m.w / 2, y: m.y + m.h / 2 };
      });
      ["fusion-engine", "env-map", "kgraph", "decomp", "alloc", "retask", "bus", "directory"].forEach(function (id) {
        var m = MODULES[id];
        var isSub = ["fusion-engine", "env-map", "kgraph", "decomp", "alloc", "retask"].indexOf(id) >= 0;
        rects[id] = moduleRect(id, m.x, m.y, m.w, m.h, m.name.replace(" & Objective", "").replace("Spatio-Temporal ", ""), isSub);
        centers[id] = { x: m.x + m.w / 2, y: m.y + m.h / 2 };
      });

      /* L1 vehicle stacks */
      VEHICLES.forEach(function (v) {
        var vx = v.x, vy = 448, col = C[v.d];
        U.svg("rect", { x: vx, y: vy, width: VW, height: 132, rx: 8,
          fill: col, "fill-opacity": 0.07, stroke: col, "stroke-opacity": 0.6 }, svg);
        U.svg("text", { x: vx + VW / 2, y: vy + 18, "text-anchor": "middle", "font-size": 12,
          fill: col, "font-family": "inherit", "font-weight": "bold" }, svg).textContent = v.label;
        ["gateway", "lic", "pal"].forEach(function (part, i) {
          var m = MODULES[part];
          var py = vy + 28 + i * 34;
          var g = U.svg("g", { "class": "arch-module", role: "button", tabindex: 0,
            "aria-label": v.label + " " + m.name }, svg);
          var r = U.svg("rect", { x: vx + 10, y: py, width: VW - 20, height: 28, rx: 6,
            fill: C.surface, "fill-opacity": 0.9, stroke: C.axis }, g);
          U.svg("text", { x: vx + VW / 2, y: py + 18, "text-anchor": "middle", "font-size": 10.5,
            fill: C.ink, "font-family": "inherit" }, g).textContent =
            part === "gateway" ? "Gateway" : part === "lic" ? "Local Intelligence Core" : "Platform Abstraction";
          rects[v.id + "-" + part] = r;
          centers[v.id + "-" + part] = { x: vx + VW / 2, y: py + 14 };
          function choose() { select(part, r); }
          g.addEventListener("click", choose);
          g.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); }
          });
        });
      });

      flowLayer = U.svg("g", { style: "pointer-events:none" }, svg);

      /* restore selection highlight after rebuild */
      if (selectedId && rects[selectedId]) highlight(rects[selectedId]);
    }

    function layerTag(layerId) {
      var L = LAYERS.filter(function (l) { return l.id === layerId; })[0];
      return L ? L.label : "";
    }

    var highlighted = null;
    function highlight(rect) {
      var C = U.colors();
      if (highlighted) { highlighted.setAttribute("stroke-width", 1); }
      highlighted = rect;
      if (rect) { rect.setAttribute("stroke", C.s1); rect.setAttribute("stroke-width", 2.5); }
    }

    function select(id, rect) {
      var m = MODULES[id];
      if (!m) return;
      selectedId = id;
      highlight(rect);
      panel.innerHTML =
        '<span class="arch-layer-tag">' + layerTag(m.layer) + "</span>" +
        "<h4>" + m.name + "</h4>" +
        "<p>" + m.desc + "</p>" +
        '<p class="arch-example">' + m.ex + "</p>";
    }

    function resetPanel() {
      panel.innerHTML =
        '<span class="arch-layer-tag">Explore</span>' +
        "<h4>Click any module</h4>" +
        "<p>Every box in the diagram is a component of the proposed architecture. Click one to see what it does and the paper's concrete example of it in action.</p>" +
        '<p class="arch-example">Then press the flow buttons under the diagram to watch a command descend from operator to vehicles — and sensed reality climb back up.</p>';
    }

    /* ------------------------------------------------------------
       Flow animations. A flow is a list of stages; each stage moves
       pulses between module centers and lights the target block.
    ------------------------------------------------------------ */

    var FLOW_DOWN = [
      { from: ["mission-interface"], to: ["decomp"], note: "mission arrives" },
      { from: ["decomp"], to: ["alloc"], split: 3, note: "…split into tasks" },
      { from: ["alloc"], to: ["bus"], split: 3, note: "tasks announced" },
      { from: ["bus"], to: ["uav-gateway", "ugv-gateway", "usv-gateway"], note: "delivered via pub-sub" },
      { from: ["uav-gateway", "ugv-gateway", "usv-gateway"], to: ["uav-lic", "ugv-lic", "usv-lic"], note: "marshalled into primitives" }
    ];
    var FLOW_UP = [
      { from: ["uav-lic", "ugv-lic", "usv-lic"], to: ["uav-gateway", "ugv-gateway", "usv-gateway"], note: "observations" },
      { from: ["uav-gateway", "ugv-gateway", "usv-gateway"], to: ["bus"], note: "translated to the common model" },
      { from: ["bus"], to: ["fusion-engine"], split: 3, note: "association + fusion" },
      { from: ["fusion-engine"], to: ["env-map"], note: "map layers update" },
      { from: ["env-map"], to: ["kgraph"], note: "relations inferred" },
      { from: ["kgraph"], to: ["cop"], note: "one shared picture" }
    ];

    var flow = null;   /* {stages, stage, t0} */
    var STAGE_MS = 1000;

    function startFlow(stages) {
      flow = { stages: stages, start: performance.now() };
      loop.start();
    }

    document.getElementById("arch-flow-down").addEventListener("click", function () {
      startFlow(FLOW_DOWN);
    });
    document.getElementById("arch-flow-up").addEventListener("click", function () {
      startFlow(FLOW_UP);
    });

    var loop = U.raf(svg, function (now) {
      if (!flowLayer) return;
      flowLayer.innerHTML = "";
      if (!flow) return;
      var C = U.colors();
      var elapsed = now - flow.start;
      var si = Math.floor(elapsed / STAGE_MS);
      if (si >= flow.stages.length) {
        if (elapsed > flow.stages.length * STAGE_MS + 400) flow = null;
        return;
      }
      var st = flow.stages[si];
      var u = U.ease(U.clamp((elapsed - si * STAGE_MS) / (STAGE_MS * 0.9), 0, 1));

      /* pair up from/to (broadcast if counts differ) */
      var pairs = [];
      if (st.from.length === st.to.length) {
        st.from.forEach(function (f, i) { pairs.push([f, st.to[i]]); });
      } else if (st.from.length === 1) {
        st.to.forEach(function (tId) { pairs.push([st.from[0], tId]); });
      } else {
        st.from.forEach(function (f) { pairs.push([f, st.to[0]]); });
      }

      pairs.forEach(function (pr, pi) {
        var a = centers[pr[0]], b = centers[pr[1]];
        if (!a || !b) return;
        U.svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: C.s1,
          "stroke-opacity": 0.25, "stroke-dasharray": "3 4" }, flowLayer);
        var n = st.split || 1;
        for (var k = 0; k < n; k++) {
          var uu = U.clamp(u - k * 0.1, 0, 1);
          if (uu <= 0) continue;
          U.svg("circle", {
            cx: U.lerp(a.x, b.x, uu), cy: U.lerp(a.y, b.y, uu),
            r: 4, fill: C.s1
          }, flowLayer);
        }
        /* light the destination as pulses arrive */
        var destRect = rects[pr[1]];
        if (destRect && u > 0.85) {
          destRect.setAttribute("stroke", C.s1);
          destRect.setAttribute("stroke-width", 2.5);
          setTimeout(function () {
            if (destRect !== highlighted) {
              destRect.setAttribute("stroke-width", 1);
              destRect.setAttribute("stroke", U.colors().axis);
            }
          }, 700);
        }
        void pi;
      });

      /* stage note */
      U.svg("text", { x: W / 2, y: H - 4, "text-anchor": "middle", "font-size": 11.5,
        fill: C.s1, "font-family": "inherit", "font-weight": "bold" }, flowLayer)
        .textContent = st.note;
    });

    build();
    resetPanel();
    U.onThemeChange(build);
    loop.start();
  });
})();
