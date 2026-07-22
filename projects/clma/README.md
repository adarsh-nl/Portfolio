# Collaborative Drift Compensation — interactive project page

Interactive project page for **Adarsh N. L., Madapu Amarlingam, Divyasheel Sharma,
"Collaborative Drift Compensation," CODS-COMAD 2024**
([doi:10.1145/3703323.3703341](https://doi.org/10.1145/3703323.3703341)).

Live at `/Portfolio/projects/clma/`. Linked from the Research page entry
(`[project page]`).

## Stack — and why there is no build step

The portfolio is a Franklin.jl static site served by GitHub Pages, so this page
is **plain HTML + CSS + vanilla JS** (ES2017): no framework, no bundler, no CDN.
Everything renders with hand-rolled SVG and Canvas 2D. KaTeX is reused from the
site's vendored copy (`/libs/katex`), as are the site header, theme toggle,
fonts, and analytics. Deploying = committing these four files.

```
projects/clma/
├── index.html        # all markup: 9 story sections + widget scaffolds
├── clma.css          # page styles + the visualization design tokens
├── clma-core.js      # shared runtime (see below)
├── clma-widgets.js   # every interactive figure except the simulator
├── clma-sim.js       # the CLMA algorithm simulator (section 05)
└── README.md         # this file
```

## Architecture

### clma-core.js — the shared runtime

| Facility | What it does |
|---|---|
| `CLMA.colors()` | Reads the `--viz-*` CSS custom properties at draw time, so every canvas/SVG is automatically correct in both themes. A `MutationObserver` on `html[data-theme]` invalidates the cache and re-fires every registered redraw. |
| `CLMA.raf(el, fn)` | Per-widget animation loop. Pauses automatically when the widget scrolls off screen (IntersectionObserver) or the tab is hidden; falls back to `setTimeout` if rAF is throttled to a halt (webviews, power saving). |
| `CLMA.rng(seed)` | Deterministic mulberry32 PRNG (+ gaussians) so simulations are reproducible and back-steppable. |
| `CLMA.tooltip` | One shared, keyboard-safe tooltip node for all charts/heatmaps. |
| `CLMA.LineChart` | Small SVG line-chart component: series toggle legend, hover crosshair + tooltip, event markers, draw-in animation (skipped under reduced motion). |
| `CLMA.tabs` | Accessible `role=tab` group wiring. |
| Page furniture | Scrollspy for the sticky section nav, scroll-reveal (with a fallback if IntersectionObserver never fires), KaTeX auto-render, BibTeX copy. |

### Design tokens

All visualization colors live in `clma.css` as `--viz-*` variables — a validated
colorblind-safe categorical palette (separate light/dark steps), plus
ink/grid/axis/surface tokens matched to the site's existing light and dark
themes. JS never hard-codes a color; canvases repaint on theme flip.

Series are assigned in fixed order: CLMA = blue, FedDrift = orange,
FedAvg = aqua; drift flags always use the reserved critical red. Cohorts take
palette slots in order of first appearance, so the same cohort keeps its color
across rounds and views.

## How each visualization teaches the research

1. **Hero network** — ambient 12-second preview of the whole paper: federated
   rounds, two clients drift (red pulse), they get re-cohorted (recolored).
2. **FL primer** (§01) — the four phases of a round (broadcast → local train →
   upload → aggregate), steppable, so a reader who has never seen FL learns the
   protocol CLMA sits on — and that *only weights travel*.
3. **Drift playground** (§02) — the paper's two drift types made tactile:
   covariate slider moves P(x) (the points), concept slider moves P(y|x) (the
   answer key), the frozen model's F1 collapses live. Uses the PRONTO story
   (air/water flow, Normal vs Slugging).
4. **Stagger grid** (§02) — the core premise from FedDrift that motivates CLMA:
   drift is staggered in *time* (rounds 3/5/7/9) and *space* (different clients,
   different directions).
5. **Prior-work demos** (§03) — each baseline fails in a runnable way:
   FedAvg poisoning (drag a drifted client, watch the average leave the healthy
   ones), CDA-FedAvg's probabilistic gate missing real drifts, FedConD's
   knife-edge significance level, and the crux: **FedDrift's scalar-loss
   collision** — two different drifts, identical loss, indistinguishable.
6. **Insight demo** (§04) — the paper's central claim (weights are a function of
   the data; the shared global model is a free reference): shift a client's
   data, watch its weight histogram shift *in a matching direction*, with the
   KS statistic and S⁺/S⁻ assignment updating.
7. **CLMA simulator** (§05) — the whole of Algorithms 1–3 as a precomputed,
   deterministic run over 10 clients × 10 rounds: loss tripwire, drift flags,
   quarantine set W̄, signed-KS split, eigen-projection inset, k-means, new
   cohorts. Play / pause / step forward / **step back** / speed, with the
   paper's pseudocode alongside and the executing line highlighted. γ, the
   number of drifted clients, and the drift mix are user-tunable — setting γ
   too high visibly lets drift slip through, which is the point of §06.1.
8. **Math widgets** (§06) — γ tripwire trade-off (false alarms vs misses), the
   KS statistic as the max CDF gap with its *sign* carrying direction, and
   eigen-projection → k-means as a 4-step animation.
9. **Results** (§07) — cohort-assignment heatmaps (CLMA resolves
   direction-specific cohorts; FedDrift only drifted/not-drifted) and F1 line
   charts in three views (drifted client, non-drifted client = the FedAvg
   poisoning story, and post-deployment inference = Algorithm 4). Charts are
   labelled as illustrative reconstructions of the paper's figures.

## Accessibility

- Every control is a real `<button>`, `<input type=range>`, or `<select>`;
  tab groups use `role=tab` / `aria-selected`.
- Every canvas/SVG has `role="img"` with a prose `aria-label` describing what
  the interaction demonstrates; the simulator log is `aria-live`.
- `prefers-reduced-motion`: ambient loops stop (hero renders a meaningful
  static frame), tweens become instant state changes, chart draw-in and scroll
  reveals are disabled — every widget remains fully usable via its step
  controls.
- Color is never the only channel: drift = ring + log text, cohorts have
  IDs in legends/tooltips, chart series are toggleable and hover-labelled.
- Keyboard: native focus order, visible focus, skip link inherited from the
  site shell.

## Performance

- Zero dependencies; three small JS files, one CSS file. No images, no fonts
  beyond the site's existing ones.
- Animation loops run only while their widget is on screen and the tab is
  visible (IntersectionObserver + visibilitychange), so idle cost is ~0.
- Canvases are DPR-aware (`CLMA.fitCanvas`) for crisp HiDPI rendering.
- The simulator precomputes its entire history at reset; playback and
  back-stepping are pointer moves plus cheap tweens — no re-simulation.

## Notes

- Chart values are qualitative reconstructions of Figs. 2–6 (the paper's
  measured curves are in the PDF); the page says so under the results section.
- The page reuses the site's `site.js` for the theme toggle and BibTeX copy
  affordances, keeping behavior identical across the portfolio.
