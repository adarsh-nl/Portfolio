/* ==================================================================
   adgt-data.js: the single source of truth for this page.

   PAPER   publication metadata, links and the BibTeX entry
   DATA    every measured number the page shows, each with the place in
           the paper it comes from (Sec. / Tab. / Fig.)

   Nothing numeric is hard-coded in index.html or in the widgets. To
   update a value, change it here. Fields set to null are deliberately
   unknown (for example links that are not public yet); the page renders
   them as "not yet available" instead of inventing a value.
================================================================== */
(function () {
  "use strict";
  var AG = (window.AG = window.AG || {});

  AG.PAPER = {
    title: "Agent-Dependent Ground Truth Biases Robustness Evaluation in Collaborative Perception",
    venue: "WACV 2027",
    venueLong: "IEEE/CVF Winter Conference on Applications of Computer Vision (WACV 2027)",
    track: "Datasets Track",
    status: "Accepted",
    venueUrl: "https://wacv.thecvf.com/",

    authors: [
      { name: "Adarsh Nanjaiya Latha", url: "/Portfolio/" },
      { name: "Alessandro Chiumento" },
      { name: "Jan Laarhuis" },
      { name: "Ozlem Durmaz Incel" }
    ],
    affiliations: ["University of Twente, The Netherlands"],

    /* Every value on the page comes from the submitted version and may
       change in the camera-ready. Update AG.DATA when it is out. */
    valuesFrom: "submission",

    /* Public links. null means "not public yet". */
    links: {
      paper: null,          /* camera-ready PDF or CVF open access page */
      code: "https://github.com/adarsh-nl/CoopFaultBench",  /* fault-injection suite + scoring protocol */
      supplementary: null,  /* fault grid, per-cell reference counts */
      companion: "/Portfolio/projects/fault-injectors/"
    },

    /* Pages and DOI are added once the proceedings are out. */
    bibtex: [
      "@inproceedings{nanjaiyalatha2027agentgt,",
      "  title     = {Agent-Dependent Ground Truth Biases Robustness Evaluation",
      "               in Collaborative Perception},",
      "  author    = {Nanjaiya Latha, Adarsh and Chiumento, Alessandro and",
      "               Laarhuis, Jan and Durmaz Incel, Ozlem},",
      "  booktitle = {Proceedings of the IEEE/CVF Winter Conference on",
      "               Applications of Computer Vision (WACV)},",
      "  year      = {2027}",
      "}"
    ].join("\n")
  };

  AG.DATA = {
    /* ---------------------------------------------------------------
       Fig. 1: one V2XSet frame (scenario 2021_08_22_07_52_02, five
       CAVs; ego and one collaborator shown). Counts are the paper's.
    --------------------------------------------------------------- */
    fig1: {
      scenario: "2021_08_22_07_52_02",
      cavs: 5,
      states: {
        a: { ref: 29, tp: 21, fp: 4, fn: 8,  label: "Both agents present" },
        b: { ref: 22, tp: 17, fp: 5, fn: 5,  label: "Collaborator dropped, union reference" },
        c: { ref: 29, tp: 18, fp: 4, fn: 11, label: "Collaborator dropped, fixed reference" }
      },
      uniqueToCollaborator: 7,
      egoBoxInEgoFrame: [0.51, 0.0]      /* metres, Sec. 3.2 */
    },

    /* ---------------------------------------------------------------
       Sec. 3.3: the radius filter in the clean condition
    --------------------------------------------------------------- */
    radius: {
      R: 70,                     /* metres, OpenCOOD and DSRC */
      sampleFrames: 400,
      framesLosingAgent: 0.255,  /* fraction of clean frames */
      rPooled: 0.59,
      rWithinStratum: 0.25
    },

    /* Tab. 1: ground-truth assembly, all in base_postprocessor.py */
    codebases: [
      { key: "opencood", name: "OpenCOOD", union: "L63-89", radius: "const. 70 m",
        note: "Skips out-of-range agents while iterating the per-agent annotation list." },
      { key: "dsrc", name: "DSRC", union: "L59-85", radius: "const. 70 m",
        note: "The assembly function is byte-identical to OpenCOOD's." },
      { key: "heal", name: "HEAL", union: "L71-101", radius: "config key",
        note: "Uses a pose-clean transformation matrix, exposes the radius as a configuration key, removes out-of-range agents from the agent dictionary and filters by range after assembly. RCP-Bench is built on HEAL and inherits this construction." }
    ],
    dedupIdiom: "[ids.index(x) for x in set(ids)]",

    /* ---------------------------------------------------------------
       Tab. 2 and Sec. 4.3: models at released settings
    --------------------------------------------------------------- */
    models: [
      { key: "cobevt", name: "CoBEVT", data: "V2XSet", setting: "Perfect",
        clean: 0.6603, bench: 0.6600, verdict: "exact",
        detail: "Within 0.0003 AP@0.7 and 0.0002 AP@0.5 of the OpenCOOD V2XSet table.",
        floor50: 6.4e-5, floor70: 8.0e-5, inert: 1.86e-5 },
      { key: "v2xvit", name: "V2X-ViT", data: "V2XSet", setting: "Noisy",
        clean: 0.6164, bench: 0.6140, verdict: "near",
        detail: "+0.0024 AP@0.7 and +0.0049 AP@0.5, above its own determinism floor: a near reproduction.",
        floor50: 4.3e-5, floor70: 7.7e-5, inert: 0 },
      { key: "where2comm", name: "Where2comm", data: "V2XSet", setting: "Noisy",
        clean: 0.5340, bench: 0.5340, verdict: "exact",
        detail: "Within 0.0003 AP@0.5 and under 0.0001 AP@0.7. No author V2XSet number or checkpoint exists, so it is graded against the OpenCOOD table.",
        floor50: 0, floor70: 0, inert: 0 },
      { key: "cosdh", name: "CoSDH", data: "OPV2V", setting: "Released",
        clean: 0.9289, bench: 0.9299, verdict: "reference",
        detail: "Its released checkpoints were retrained and differ from the published run, so the benchmark column is a reference point, not a reproduction target.",
        floor50: 0, floor70: 0, inert: null }
    ],

    datasets: { V2XSet: 2834, OPV2V: 2170 },   /* test-split frames */

    grid: {
      cells: 109,
      perV2XSetModel: 31,
      cosdhCells: 16,
      agentDropFrameEvals: 25506,
      frameEvals: 221764
    },

    /* ---------------------------------------------------------------
       Sec. 5.1: reference-set shrinkage, 400-frame stratified sample
    --------------------------------------------------------------- */
    shrinkByP: [
      { label: "p = 0.25", value: 0.018 },
      { label: "p = 0.50", value: 0.046 },
      { label: "p = 0.75", value: 0.079 },
      { label: "all dropped", value: 0.131 }
    ],
    shrinkByStratum: [
      { label: "2 agents", value: 0.139 },
      { label: "3 agents", value: 0.128 },
      { label: "4 agents", value: 0.098 },
      { label: "5 agents", value: 0.157 }
    ],

    /* ---------------------------------------------------------------
       Tab. 3: CoBEVT agent drop, as-is vs fixed reference, pooled over
       the 400-frame sample. ci70 / ci50 are 95% scene-bootstrap
       intervals of the difference (19 scenarios, 1,000 replicates).
       The AP@0.5 mild-tier interval is not reported in the paper.
    --------------------------------------------------------------- */
    corrected: [
      { tier: "Mild",     ap70: [0.6225, 0.6169], ap50: [0.8169, 0.8079],
        d70: -0.0057, d50: -0.0090, floorX: 71,
        ci70: [-0.0096, 0.0026], ci50: null },
      { tier: "Moderate", ap70: [0.5890, 0.5779], ap50: [0.7908, 0.7723],
        d70: -0.0110, d50: -0.0185, floorX: 138,
        ci70: [-0.0198, 0.0009], ci50: [-0.0302, -0.0032] },
      { tier: "Severe",   ap70: [0.5432, 0.5287], ap50: [0.7553, 0.7296],
        d70: -0.0145, d50: -0.0257, floorX: 181,
        ci70: [-0.0238, 0.0032], ci50: [-0.0397, -0.0044] }
    ],
    cobevtFloor70: 8.0e-5,
    halfRule: { shrink: 0.018, apChange: 0.0091 },
    precisionAt4: { moderateGain: 0.0007, severeGain: 0.0047, precisionFrom: 0.721, precisionTo: 0.754 },
    perStratumCleanSpread: 0.102,  /* "up to 10.2 AP@0.7" within one model */

    /* ---------------------------------------------------------------
       Sec. 4.1: the fourteen injectors. Severity parameters are given
       only for the seven exercised here; the rest are parameterised in
       the supplementary material (Tab. 5) and not reproduced.
    --------------------------------------------------------------- */
    injectors: [
      { name: "Pose error", family: "Cooperative", run: true, moves: false,
        tiers: "σ = 0.2, 0.4, 0.6 (m and °)" },
      { name: "Communication latency", family: "Cooperative", run: true, moves: false,
        tiers: "100, 200, 300 ms" },
      { name: "Agent dropout", family: "Cooperative", run: true, moves: true,
        tiers: "p = 0.25, 0.50, 0.75" },
      { name: "Modality dropout", family: "Cooperative", run: true, moves: false,
        tiers: "p = 0.25, 0.50, 0.75" },
      { name: "Fog", family: "LiDAR", run: true, moves: false, tiers: "severity 1, 2, 3" },
      { name: "Snow", family: "LiDAR", run: true, moves: false, tiers: "severity 1, 2, 3" },
      { name: "Point reduction", family: "LiDAR", run: true, moves: false,
        tiers: "keep 30%, 20%, 10% of returns" },
      { name: "Beam reduction", family: "LiDAR", run: false, moves: false, tiers: null },
      { name: "Brightness", family: "Camera", run: false, moves: false, tiers: null },
      { name: "Darkness", family: "Camera", run: false, moves: false, tiers: null },
      { name: "Fog", family: "Camera", run: false, moves: false, tiers: null },
      { name: "Snow", family: "Camera", run: false, moves: false, tiers: null },
      { name: "Sensor occlusion", family: "Camera", run: false, moves: false, tiers: null },
      { name: "Stream desynchronisation", family: "Cross-modal", run: false, moves: false, tiers: null }
    ],

    /* Sec. 5.3 / Fig. 3: mean relative AP@0.7 drop across models, severe tier */
    ranking: [
      { name: "LiDAR fog",        value: -0.874, band: "data" },
      { name: "LiDAR snow",       value: -0.627, band: "data" },
      { name: "Point reduction",  value: -0.509, band: "data" },
      { name: "Pose error",       value: -0.404, band: "data" },
      { name: "Comm. latency",    value: -0.371, band: "data" },
      { name: "Modality dropout", value: -0.126, band: "lost" },
      { name: "Agent dropout",    value: -0.082, band: "lost", movesRef: true }
    ],

    /* Sec. 5.4: AP@0.7 drop / AP@0.5 drop under pose error, mean over tiers */
    iouRatio: [
      { model: "CoBEVT", value: 3.82, note: "5.61 at mild, falling to 2.41 at severe" },
      { model: "Where2comm", value: 2.90, note: "" },
      { model: "V2X-ViT", value: 1.79, note: "the only model trained under injected pose noise" },
      { model: "CoSDH", value: 2.30, note: "moderate and severe tiers only; the mild ratio of 10.89 rests on a −0.012 AP@0.5 drop", partial: true }
    ],

    /* Sec. 5.5 / Fig. 4: the snow corruption plane inverts */
    snow: {
      removedCoBEVT: [0.3991, 0.3227, 0.2900],
      apWhere2comm: [0.2228, 0.2342, 0.2075],
      apCoSDH: [0.6474, 0.6044, 0.5238]
    }
  };
})();
