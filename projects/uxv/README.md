# The UxV Ecosystem — interactive project page

Interactive explainer for:

> A. Nanjaiya Latha, S. N. Anbalagan, A. Chiumento, J. Laarhuis.
> *"Where Do We Go from Here? Charting the Future of Unmanned Vehicles."*
> Proc. 16th IFIP WMNC, Leuven, Belgium, 2025, pp. 176–181.
> doi:10.23919/WMNC67099.2025.11299247

Zero-build vanilla HTML/CSS/JS, matching the site's Franklin theme
(Computer Modern serif, light default, `html[data-theme=dark]` toggle).
No frameworks, no bundler, no external libraries.

## Files

| File | Role |
| --- | --- |
| `index.html` | Page structure and all copy. Ten sections, sticky in-page nav. |
| `uxv.css` | Design system: theme-aware CSS variables (`--viz-*`), widget cards, controls, grids. Canvas/SVG code reads colors via `getComputedStyle`, so dark mode repaints live. |
| `uxv-core.js` | Shared runtime (`window.UXV`): theme palette + change hooks, per-widget rAF loops auto-paused offscreen (IntersectionObserver), deterministic PRNG, HiDPI canvas sizing, shared vehicle glyphs, tooltip, tab wiring, scrollspy, scroll-reveal, BibTeX copy. `UXV.__frame(t)` is a testing hook that force-renders one frame of every loop. |
| `uxv-widgets.js` | All section widgets except the two below. |
| `uxv-arch.js` | §05 architecture explorer. |
| `uxv-sim.js` | The wildfire mission engine, used by §02 (race) and §07 (sandbox). |

## How each visualization teaches the paper

- **Hero** — sky/land/water bands with UAV/UGV/USV particles; cross-domain
  links flicker between them with traveling pulses. The paper's thesis
  (domains discovering each other) as an ambient image.
- **§01 Market slider + application matrix** — the \$29.3B→\$46B forecast is
  *dragged through*, not read; Table I becomes a clickable platform×sector
  grid so the visitor samples today's siloed landscape.
- **§02 Wildfire race** — the paper's first scenario as a controlled
  experiment: two identical worlds (same seed, same fleet, same fire), one
  siloed, one ecosystem. The only independent variable is whether UAV
  sightings become UGV tasks — so the rescue-count gap *is* the thesis.
- **§02 Maritime storyboard** — the second scenario; each step adds a domain
  and the time-to-neutralization bar shrinks: complement/compound effects
  quantified.
- **§03 Fusion pyramid** — the paper's three-level fusion hierarchy. Each
  level runs a live computation: noisy fixes → Kalman-style state (L1), two
  viewpoints → associated + fused track (L2), facts → knowledge-graph
  relations (L3). Makes "what/where vs. why/so-what" concrete.
- **§04 Prior-work table** — Table II with a working sketch of each row's
  ceiling: Stolfi's static zones lose the crossing target; JAUS delivers
  packets under a pulsing "but what does it MEAN"; Wu compresses the mission
  to a 2×2 game; Xu's pair lands perfectly while a third party sails past.
- **§05 Architecture explorer** — Fig. 1 rebuilt: every module clickable
  (description + the paper's own example), plus two flow animations (command
  descending, sensing ascending) where each block lights as data passes.
- **§06 Mechanisms** — one widget per moving part: DTN buffering ("lost: 0,
  always"), DHT service lookup (chemical-spill story), product-of-Gaussians
  track fusion (toggle sensors, watch the ellipse balloon), auction-based
  allocation with kill-and-re-auction.
- **§07 Simulator** — all mechanisms composed: publish → auction → escort →
  ferry → re-task, with jamming and click-to-kill. The event log narrates the
  architecture doing its job.
- **§08–10** — challenges cards, future-work roadmap tabs, takeaways,
  resources + BibTeX.

## Conventions

- Domain colors are fixed everywhere: UAV blue (`--viz-air`), UGV orange
  (`--viz-ground`), USV teal (`--viz-sea`).
- All randomness is seeded (`UXV.rng`) so the race is a fair experiment and
  replays are reproducible.
- Accessibility: keyboard-focusable SVG modules and table rows, `role=tab`
  groups, aria-labels on every canvas/SVG, `prefers-reduced-motion` collapses
  reveals and loops to static frames, `<noscript>` fallback.
- Animations only run while their widget is on screen and the tab is
  visible (battery-friendly), via `UXV.raf`.

## Local preview

Serve the *parent* of the repo so `/Portfolio/...` paths resolve, e.g.:

```bash
python3 -m http.server 8931 --directory ~/Desktop
```

then open `http://localhost:8931/Portfolio/projects/uxv/`.

The scenario dynamics are conceptual reconstructions built to teach the
paper's ideas — the paper is a vision/position paper; nothing here is
experimental data.
