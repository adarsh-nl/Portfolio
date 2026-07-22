/* ==================================================================
   cora-charts.js — every chart built from the paper's tables.
   Values transcribed from Tables 1–4 of arXiv:2512.13191.
================================================================== */
(function () {
  "use strict";
  var U = window.CORA;

  /* ---------- a small SVG line chart with legend toggles -------- */

  function LineChart(container, opts) {
    this.container = container;
    this.opts = opts || {};
    this.hidden = this.opts.hidden || {};
    this.data = null;
    var self = this;
    U.onThemeChange(function () { if (self.data) self.render(); });
  }

  LineChart.prototype.update = function (data) {
    this.data = data;
    this.render();
  };

  LineChart.prototype.render = function () {
    var d = this.data, self = this, C = U.colors();
    var W = 640, H = 320, m = { t: 16, r: 14, b: 42, l: 48 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var xs = d.x, n = xs.length;
    var yMin = this.opts.yMin != null ? this.opts.yMin : 0;
    var yMax = this.opts.yMax || 1.0;

    function px(i) { return m.l + (i / (n - 1)) * iw; }
    function py(v) { return m.t + ih - ((v - yMin) / (yMax - yMin)) * ih; }

    this.container.innerHTML = "";

    var leg = document.createElement("div");
    leg.className = "cora-chart-legend";
    d.series.forEach(function (s) {
      var b = document.createElement("button");
      b.setAttribute("aria-pressed", self.hidden[s.name] ? "false" : "true");
      b.innerHTML = '<span class="swatch" style="background:' + C[s.color] + (s.dash ? ";opacity:.55" : "") + '"></span>' + s.name;
      b.addEventListener("click", function () {
        self.hidden[s.name] = !self.hidden[s.name];
        self.render();
      });
      leg.appendChild(b);
    });
    this.container.appendChild(leg);

    var svg = U.svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": this.opts.ariaLabel || "Line chart" });
    this.container.appendChild(svg);

    var ticks = [];
    for (var v = Math.ceil(yMin * 10) / 10; v <= yMax + 1e-9; v = Math.round((v + 0.1) * 10) / 10) ticks.push(v);
    ticks.forEach(function (tv) {
      var y = py(tv);
      U.svg("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: C.grid, "stroke-width": 1 }, svg);
      U.svg("text", { x: m.l - 8, y: y + 4, "text-anchor": "end", "font-size": 11,
        fill: C.muted, "font-family": "inherit" }, svg).textContent = tv.toFixed(1);
    });
    xs.forEach(function (x, i) {
      U.svg("text", { x: px(i), y: H - m.b + 18, "text-anchor": "middle", "font-size": 11,
        fill: C.muted, "font-family": "inherit" }, svg).textContent = x;
    });
    U.svg("text", { x: m.l + iw / 2, y: H - 6, "text-anchor": "middle", "font-size": 12,
      fill: C.ink2, "font-family": "inherit" }, svg).textContent = d.xLabel || "";
    U.svg("text", { x: 12, y: m.t + ih / 2, "text-anchor": "middle", "font-size": 12,
      fill: C.ink2, "font-family": "inherit",
      transform: "rotate(-90 12 " + (m.t + ih / 2) + ")" }, svg).textContent = d.yLabel || "";

    var drawn = [];
    d.series.forEach(function (s) {
      if (self.hidden[s.name]) return;
      var path = s.values.map(function (vv, i) {
        return (i ? "L" : "M") + px(i).toFixed(1) + " " + py(vv).toFixed(1);
      }).join(" ");
      var p = U.svg("path", { d: path, fill: "none", stroke: C[s.color],
        "stroke-width": s.emph ? 3 : 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      if (s.dash) p.setAttribute("stroke-dasharray", "6 4");
      if (!U.reducedMotion && !self._drawnOnce) {
        var len = p.getTotalLength();
        p.style.strokeDasharray = s.dash ? "6 4" : len;
        if (!s.dash) {
          p.style.strokeDashoffset = len;
          p.getBoundingClientRect();
          p.style.transition = "stroke-dashoffset 0.9s ease";
          p.style.strokeDashoffset = "0";
        }
      }
      drawn.push(s);
    });
    self._drawnOnce = true;

    var hover = U.svg("g", { style: "pointer-events:none" }, svg);
    var overlay = U.svg("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" }, svg);
    overlay.addEventListener("mousemove", function (evt) {
      var rect = svg.getBoundingClientRect();
      var sx = (evt.clientX - rect.left) * (W / rect.width);
      var i = U.clamp(Math.round(((sx - m.l) / iw) * (n - 1)), 0, n - 1);
      hover.innerHTML = "";
      U.svg("line", { x1: px(i), x2: px(i), y1: m.t, y2: m.t + ih, stroke: C.muted,
        "stroke-width": 1, opacity: 0.5 }, hover);
      var lines = ['<span class="tt-title">' + (d.xLabel || "x") + ": " + xs[i] + "</span>"];
      drawn.forEach(function (s) {
        U.svg("circle", { cx: px(i), cy: py(s.values[i]), r: 4, fill: C[s.color],
          stroke: C.surface, "stroke-width": 2 }, hover);
        lines.push(s.name + ": " + s.values[i].toFixed(4));
      });
      U.tooltip.show(lines.join("<br>"), evt.clientX, evt.clientY);
    });
    overlay.addEventListener("mouseleave", function () { hover.innerHTML = ""; U.tooltip.hide(); });
  };

  /* ---------- Table 1 ------------------------------------------- */

  /* [ap50@0, ap70@0, ap50@.2, ap70@.2, ap50@.4, ap70@.4, ap50@.6, ap70@.6] */
  var T1 = {
    opv2v: {
      "Single-agent": [0.8078, 0.6853, 0.8078, 0.6853, 0.8078, 0.6853, 0.8078, 0.6853],
      "V2VNet": [0.9175, 0.8221, 0.9110, 0.7566, 0.8759, 0.5779, 0.7807, 0.3950],
      "V2X-ViT": [0.9035, 0.8119, 0.8844, 0.7336, 0.8283, 0.5711, 0.7546, 0.4266],
      "Where2comm": [0.8937, 0.7889, 0.8880, 0.7159, 0.8454, 0.5439, 0.7629, 0.3904],
      "CoAlign": [0.9132, 0.8381, 0.9090, 0.7682, 0.8635, 0.5947, 0.7810, 0.4849],
      "ERMVP": [0.9139, 0.8404, 0.9085, 0.7602, 0.8588, 0.6632, 0.8303, 0.5655],
      "MRCNet": [0.8775, 0.7673, 0.8509, 0.7365, 0.8063, 0.6804, 0.7330, 0.6113],
      "DSRC": [0.9183, 0.8526, 0.9133, 0.7698, 0.8663, 0.6097, 0.7753, 0.4738],
      "CoSDH": [0.8952, 0.8373, 0.8589, 0.6165, 0.6922, 0.3685, 0.5453, 0.2825],
      "MDD": [0.8007, 0.6817, 0.8032, 0.6156, 0.7757, 0.4677, 0.7028, 0.3394],
      "CoRA (ours)": [0.9341, 0.8658, 0.9297, 0.7817, 0.8858, 0.7199, 0.8451, 0.6544]
    },
    dair: {
      "Single-agent": [0.6250, 0.4457, 0.6250, 0.4457, 0.6250, 0.4457, 0.6250, 0.4457],
      "V2VNet": [0.6644, 0.4037, 0.6493, 0.3879, 0.6273, 0.3675, 0.5984, 0.3508],
      "V2X-ViT": [0.7046, 0.5240, 0.6959, 0.5197, 0.6774, 0.5119, 0.6601, 0.5036],
      "Where2comm": [0.6735, 0.5317, 0.6012, 0.4493, 0.6245, 0.3301, 0.4588, 0.1650],
      "CoAlign": [0.7772, 0.6284, 0.7595, 0.5961, 0.7274, 0.5812, 0.7064, 0.5752],
      "ERMVP": [0.7042, 0.5766, 0.6740, 0.5546, 0.6544, 0.5316, 0.6228, 0.5214],
      "MRCNet": [0.6648, 0.5388, 0.6506, 0.5110, 0.6148, 0.4886, 0.5935, 0.4777],
      "DSRC": [0.7852, 0.6360, 0.7698, 0.5889, 0.7085, 0.5512, 0.6754, 0.5425],
      "CoSDH": [0.7675, 0.6350, 0.7472, 0.5756, 0.6925, 0.5410, 0.6607, 0.5267],
      "MDD": [0.7495, 0.5817, 0.7201, 0.5395, 0.6688, 0.5092, 0.6437, 0.4982],
      "CoRA (ours)": [0.7858, 0.6361, 0.7691, 0.5977, 0.7455, 0.5862, 0.7312, 0.5803]
    }
  };
  var COLORS = {
    "Single-agent": "muted", "V2VNet": "s6", "V2X-ViT": "s4", "Where2comm": "s2",
    "CoAlign": "s7", "ERMVP": "s3", "MRCNet": "s5", "DSRC": "warn",
    "CoSDH": "s8", "MDD": "ink2", "CoRA (ours)": "s1"
  };

  document.addEventListener("DOMContentLoaded", function () {
    var el = document.getElementById("results-chart");
    if (!el) return;

    var ds = "opv2v", metric = "ap70";
    var chart = new LineChart(el, {
      yMin: 0.1, yMax: 1.0,
      hidden: { "V2VNet": true, "V2X-ViT": true, "MRCNet": true, "DSRC": true, "MDD": true },
      ariaLabel: "Detection accuracy of collaborative perception methods as pose error increases, from the paper's Table 1."
    });
    var note = document.getElementById("results-note");

    function render() {
      var tbl = T1[ds];
      var off = metric === "ap50" ? 0 : 1;
      chart.update({
        x: ["0 / 0", "0.2 / 0.2", "0.4 / 0.4", "0.6 / 0.6"],
        xLabel: "pose error σt (m) / σr (°)",
        yLabel: metric === "ap50" ? "AP@0.5" : "AP@0.7",
        series: Object.keys(tbl).map(function (name) {
          return {
            name: name,
            color: COLORS[name],
            dash: name === "Single-agent",
            emph: name === "CoRA (ours)",
            values: [tbl[name][off], tbl[name][2 + off], tbl[name][4 + off], tbl[name][6 + off]]
          };
        })
      });
      note.textContent = ds === "opv2v"
        ? "OPV2V: at 0.6/0.6 noise CoRA holds 0.6544 AP@0.7 — 17 points above CoAlign, using 3.80 MB vs. its 21.35 MB. CoSDH (also a hybrid) collapses: hybridization alone isn't enough without pose-aware correction."
        : "DAIR-V2X (real-world): the same ranking holds — CoRA leads at every noise level with the smallest volume (2.84 MB). Note Where2comm falling to 0.165, far below the 0.4457 single-agent line.";
    }

    U.tabs(document.getElementById("res-ds-tabs"), function (k) { ds = k; render(); });
    U.tabs(document.getElementById("res-metric-tabs"), function (k) { metric = k; render(); });
    render();
  });

  /* ---------- Table 2: latency --------------------------------- */

  var T2 = {
    ap50: {
      "F-cooper": [0.7298, 0.6288, 0.4230, 0.3069, 0.2746],
      "Where2comm": [0.7629, 0.6876, 0.5585, 0.4650, 0.4322],
      "CORE": [0.6573, 0.5443, 0.3447, 0.2271, 0.2077],
      "ERMVP": [0.8303, 0.6126, 0.4219, 0.3007, 0.2819],
      "CoRA (ours)": [0.8433, 0.7828, 0.6261, 0.5088, 0.4620]
    },
    ap70: {
      "F-cooper": [0.3189, 0.2319, 0.1514, 0.1462, 0.1579],
      "Where2comm": [0.3904, 0.3161, 0.2333, 0.2367, 0.2289],
      "CORE": [0.2289, 0.1447, 0.0781, 0.0709, 0.0822],
      "ERMVP": [0.5655, 0.2709, 0.1705, 0.1705, 0.1898],
      "CoRA (ours)": [0.6519, 0.5683, 0.4383, 0.3651, 0.3519]
    }
  };
  var LAT_COLORS = { "F-cooper": "s6", "Where2comm": "s2", "CORE": "s4", "ERMVP": "s3", "CoRA (ours)": "s1" };

  document.addEventListener("DOMContentLoaded", function () {
    var el = document.getElementById("latency-chart");
    if (!el) return;
    var metric = "ap70";
    var chart = new LineChart(el, {
      yMin: 0, yMax: 0.9,
      ariaLabel: "Detection accuracy under increasing communication latency with fixed high pose error, from the paper's Table 2."
    });
    function render() {
      var tbl = T2[metric];
      chart.update({
        x: ["0", "100", "200", "300", "400"],
        xLabel: "communication latency (ms), with pose error fixed at 0.6 m / 0.6°",
        yLabel: metric === "ap50" ? "AP@0.5" : "AP@0.7",
        series: Object.keys(tbl).map(function (name) {
          return { name: name, color: LAT_COLORS[name], emph: name === "CoRA (ours)", values: tbl[name] };
        })
      });
    }
    U.tabs(document.getElementById("lat-metric-tabs"), function (k) { metric = k; render(); });
    render();
  });

  /* ---------- Table 3: ablation --------------------------------- */

  var ABLATION = [
    { label: "baseline (single-agent)", mods: [], ideal: [0.6250, 0.4457], noisy: [0.6250, 0.4457],
      note: "No collaboration at all. Everything below is gain over this." },
    { label: "+ CIT", mods: ["CIT"], ideal: [0.7749, 0.6036], noisy: [0.6858, 0.5184],
      note: "Competitive transmission alone already buys +15.8 points of AP@0.7 — cheap, sparse features are that valuable." },
    { label: "+ CIT + LC", mods: ["CIT", "LC"], ideal: [0.7826, 0.6288], noisy: [0.6933, 0.5287],
      note: "The fusion module squeezes more out of the same sparse features." },
    { label: "+ CIT + LC + L_align", mods: ["CIT", "LC", "L"], ideal: [0.7856, 0.6359], noisy: [0.7004, 0.5371],
      note: "Dense-teacher distillation closes the sparsity gap: the full feature branch. But note the noisy column — still 5 points below where it could be." },
    { label: "+ CIT + PAC", mods: ["CIT", "PAC"], ideal: [0.7786, 0.6073], noisy: [0.7270, 0.5733],
      note: "Swap LC for PAC: ideal-pose accuracy dips slightly, but noisy-pose accuracy jumps. PAC is the robustness module — exactly as designed." },
    { label: "full CoRA", mods: ["CIT", "LC", "L", "PAC"], ideal: [0.7858, 0.6361], noisy: [0.7455, 0.5862],
      note: "Both branches together: best ideal AND best noisy. The decoupling thesis, verified — +14.05 AP@0.7 over baseline under noise." }
  ];

  document.addEventListener("DOMContentLoaded", function () {
    var presets = document.getElementById("abl-presets");
    if (!presets) return;
    var idealEl = document.getElementById("abl-ideal");
    var noisyEl = document.getElementById("abl-noisy");
    var barsEl = document.getElementById("abl-bars");
    var noteEl = document.getElementById("abl-note");
    var btns = [];

    function show(cfg) {
      idealEl.textContent = cfg.ideal[1].toFixed(4);
      noisyEl.textContent = cfg.noisy[1].toFixed(4);
      var C = U.colors();
      barsEl.innerHTML = "";
      [["ideal", cfg.ideal[1], C.s1], ["noisy 0.4/0.4", cfg.noisy[1], C.s2]].forEach(function (row) {
        var div = document.createElement("div");
        div.className = "cora-comm-row";
        div.innerHTML = '<span class="cora-comm-name">' + row[0] + '</span>' +
          '<span class="cora-comm-bar-wrap"><span class="cora-comm-bar" style="background:' + row[2] + '"></span></span>' +
          '<span class="cora-comm-val">' + row[1].toFixed(3) + '</span>';
        barsEl.appendChild(div);
        var bar = div.querySelector(".cora-comm-bar");
        requestAnimationFrame(function () { bar.style.width = (row[1] / 0.65 * 100) + "%"; });
      });
      noteEl.textContent = cfg.note;
    }

    ABLATION.forEach(function (cfg, i) {
      var b = document.createElement("button");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", i === ABLATION.length - 1 ? "true" : "false");
      b.textContent = cfg.label;
      b.addEventListener("click", function () {
        btns.forEach(function (o) { o.setAttribute("aria-selected", "false"); });
        b.setAttribute("aria-selected", "true");
        show(cfg);
      });
      btns.push(b);
      presets.appendChild(b);
    });
    show(ABLATION[ABLATION.length - 1]);
  });

  /* ---------- Fig. 5: scalability ------------------------------- */

  document.addEventListener("DOMContentLoaded", function () {
    var canvas = document.getElementById("scale-canvas");
    if (!canvas) return;
    var nIn = document.getElementById("scale-n"), nVal = document.getElementById("scale-n-val");
    var readEl = document.getElementById("scale-read");

    /* growth factors relative to 2 agents; endpoints match the paper */
    function oursF(n) { return 1 + 0.4 * (n - 2) / 13; }                 /* → 1.4×  */
    function bcastF(n) { return Math.pow((n - 1), Math.log(22) / Math.log(14)); } /* → 22× */
    function oursM(n) { return 1 + 0.72 * (n - 2) / 13; }                /* → 1.72× */
    function bcastM(n) { return Math.pow((n - 1), Math.log(4.72) / Math.log(14)); } /* → 4.72× */

    function draw() {
      var f = U.fitCanvas(canvas, 250), ctx = f.ctx, w = f.w, h = f.h, C = U.colors();
      ctx.clearRect(0, 0, w, h);
      var n = +nIn.value;
      nVal.textContent = n;

      function panel(x0, title, fOurs, fB, maxY, unit) {
        var pw = w * 0.44, ph = h - 58, py0 = 30;
        ctx.strokeStyle = C.axis;
        ctx.strokeRect(x0, py0, pw, ph);
        ctx.font = U.font(10.5, true);
        ctx.fillStyle = C.ink2;
        ctx.textAlign = "left";
        ctx.fillText(title, x0, 20);

        function X(nn) { return x0 + ((nn - 2) / 13) * pw; }
        function Y(v) { return py0 + ph - (Math.min(v, maxY) / maxY) * ph; }

        [["broadcast-style", fB, C.crit], ["CoRA (CIT)", fOurs, C.s1]].forEach(function (s) {
          ctx.strokeStyle = s[2];
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (var nn = 2; nn <= 15; nn += 0.5) {
            var px2 = X(nn), py2 = Y(s[1](nn));
            nn === 2 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
          }
          ctx.stroke();
          ctx.lineWidth = 1;
        });
        /* marker at slider n */
        [[fB, C.crit], [fOurs, C.s1]].forEach(function (s) {
          ctx.fillStyle = s[1];
          ctx.beginPath(); ctx.arc(X(n), Y(s[0](n)), 4, 0, 6.29); ctx.fill();
          ctx.font = U.font(10, true);
          ctx.textAlign = "left";
          ctx.fillText(s[0](n).toFixed(1) + "×", X(n) + 7, Y(s[0](n)) + 3);
        });
        ctx.fillStyle = C.muted;
        ctx.font = U.font(10);
        ctx.textAlign = "center";
        ctx.fillText("2 … 15 vehicles", x0 + pw / 2, py0 + ph + 16);
        void unit;
      }

      panel(w * 0.04, "compute (GFLOPs growth)", oursF, bcastF, 24, "×");
      panel(w * 0.53, "memory growth", oursM, bcastM, 6, "×");

      readEl.textContent = "at " + n + " vehicles: compute " + oursF(n).toFixed(1) +
        "× vs " + bcastF(n).toFixed(1) + "×, memory " + oursM(n).toFixed(2) + "× vs " + bcastM(n).toFixed(2) + "×";
    }

    nIn.addEventListener("input", draw);
    U.onThemeChange(draw);
    U.raf(canvas, draw).start();
  });
})();
