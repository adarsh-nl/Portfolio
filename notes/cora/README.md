# CoRA — unofficial interactive explainer

Interactive explainer for a paper **by other authors** that I liked:

> Gong Chen, Chaokun Zhang, Pengcheng Lv, Xiaohui Xie.
> *"CoRA: A Collaborative Robust Architecture with Hybrid Fusion for
> Efficient Perception."* arXiv:2512.13191, Dec 2025.

This page is not affiliated with or endorsed by the authors; it says so
prominently in its hero. Charted numbers are transcribed from the paper's
Tables 1–4; scenario animations are conceptual reconstructions.

Zero-build vanilla HTML/CSS/JS matching the site's Franklin theme, using the
same design system as `projects/uxv/` (prefix `cora-`, namespace
`window.CORA`).

## Files

| File | Role |
| --- | --- |
| `index.html` | Page structure and copy. Nine sections, sticky in-page nav, attribution banner. |
| `cora.css` | Derived from `projects/uxv/uxv.css` (prefix renamed) + CoRA-specific additions (attribution box, comm bars, ablation controls, chart legend). |
| `cora-core.js` | Derived from `uxv-core.js`: theme palette, offscreen-paused rAF loops, seeded PRNG, HiDPI canvas, tooltip, tabs, scrollspy, `CORA.__frame(t)` test hook. |
| `cora-widgets.js` | Hero, occlusion playground, misalignment demo, Fig-1 bubble chart, paradigm comparison, architecture explorer, CIT walkthrough, LC pipeline, PAC walkthrough. |
| `cora-charts.js` | LineChart component + everything built from the paper's tables (results, latency, ablation, scalability). |

## How each visualization teaches the paper

- **Hero** — the whole premise in one loop: a truck occludes a car from the
  ego; the collaborator's V2X message reveals it.
- **§01 Occlusion playground** — raycast LiDAR against a draggable occluder;
  toggling the collaborator turns hidden hazards visible. Why collaborative
  perception exists.
- **§02 Misalignment playground** — σt/σr sliders warp the collaborator's
  feature blobs off the true boxes; "ghost" labels appear and an alignment
  score decays. The paper's failure mode, felt by hand.
- **§02 Fig-1 bubble chart** — accuracy vs. communication volume from real
  Table-1 numbers; flipping ideal → 0.6/0.6 noise animates the crash of
  efficient methods below the single-agent line.
- **§03 Paradigm comparison** — the central insight as an experiment: the
  same pose error hits intermediate fusion (blended blobs; "attempt
  correction" fails) and late fusion (intact boxes; correction snaps them
  home). Complementary weaknesses, demonstrated not asserted.
- **§04 Architecture explorer** — Fig. 2 rebuilt: clickable modules with the
  paper's own examples, and a nine-stage "trace one perception cycle"
  animation through both branches to the fused output.
- **§05 CIT walkthrough** — the receiver-centric protocol computed live on a
  BEV grid: confidence maps → demand (1−σ(conf)) → per-pixel winner-take-all
  → exclusive sparse request masks → sparse transmission. Side panel: comm
  volume vs. fleet size, sender-centric (linear) vs. CIT (near-constant).
- **§05 LC pipeline** — animated strip of the fusion path (confidence
  weighting → attention → CSSM → gate) with the training-only dense teacher
  (L_align) hovering above.
- **§06 PAC walkthrough** — displaced collaborator boxes → cross-agent
  attention matches → predicted offset field Δp → deformable snap-back, with
  a live mean-IoU readout.
- **§07 Results** — Table 1 as a line chart (dataset / metric tabs, method
  toggles, single-agent dashed baseline), Table 2 latency chart, Table 3
  ablation as clickable configurations (the ideal-vs-noisy split shows the
  feature branch buys performance and PAC buys robustness), and a Fig-5-style
  scalability widget whose endpoints match the reported 1.4×/22× compute and
  1.72×/4.72× memory growth.

## Conventions

- Ego is always blue (`--viz-s1`), collaborators orange/teal, corrections
  magenta/violet, ground truth muted dashes.
- Accessibility: aria-labels on every canvas/SVG, keyboard-focusable modules,
  `prefers-reduced-motion` support, `<noscript>` fallback.
- Local preview: serve the repo's parent directory
  (`python3 -m http.server 8931 --directory ~/Desktop`), open
  `http://localhost:8931/Portfolio/notes/cora/`.
