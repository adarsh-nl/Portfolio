# Components breakdown

Inventory of every reusable piece on the fault-injector page, what it owns, and
where to change it. Companion to `README.md`, which covers how each figure maps
to its measurement.

Namespace is `window.FI`, CSS prefix is `fi-`, matching the one-prefix-per-page
convention used by `projects/clma/` and `projects/uxv/`.

---

## Layer 1: runtime (`fi-core.js`)

Page-agnostic infrastructure, plus the data. Roughly the clma core with the
scene state and the measured data added.

| Component | Owns | Notes |
|---|---|---|
| `FI.colors()` | Theme-aware palette | Reads every `--viz-*` custom property at draw time and caches. A `MutationObserver` on `html[data-theme]` clears the cache and fires all registered redraws. JS never hard-codes a colour. Exposes `.agent[0..5]` (slot 0 is always the ego) and `.ramp[0..4]` (intensity, low to high). |
| `FI.onThemeChange(fn)` | Redraw registration | Every widget registers through `register()` in `fi-widgets.js`, which also wires resize. |
| `FI.raf(el, fn)` | Per-widget animation loop | Auto-pauses when the widget scrolls off screen (IntersectionObserver) or the tab is hidden. Falls back to `setTimeout` if rAF is throttled to a halt. Returns `{start, stop, running}`. |
| `FI.__frame(t)` | Test hook | Force-renders one frame of every registered loop. Needed to verify rendering in a hidden or offscreen pane where IntersectionObserver never fires. Returns the loop count. |
| `FI.rng(seed)` | Deterministic PRNG | mulberry32, plus `.gauss()` and `.range(lo,hi)`. Every scene and every injector derives its stream from the world seed, so nothing is irreproducible. |
| `FI.fitCanvas(c, h)` | HiDPI sizing | Sets the backing store to CSS size times DPR and returns a context scaled to CSS pixels. |
| `FI.scene` | **Shared scene state** | `{agents, seed}` plus `on(fn)` subscribers. `bindControls()` wires every `.fi-scene-bar` on the page to it and keeps them mutually in sync, so the agent count can be exposed in more than one place without drift. |
| `FI.DATA` | **All measured numbers** | Single source of truth. Model provenance, tier names, seven injector records, and the not-injected list. See README for the shape and for how to add a second baseline. |
| `FI.PARAMS` | Injector parameters | The physical tier values the visuals use (σ, Δt, p, keep fraction, fog mean intensity and relocation fraction, snow removal/attenuation/addition). Separate from `FI.DATA` because some of these are rendering parameters rather than measurements; the README says which. |
| `FI.tierControl(host, inj, cb)` | Severity slider | Builds a four-stop range (clean plus the three measured tiers) with a clickable, labelled tick under each stop carrying `aria-current`, updates the live value in the label, and highlights the matching row in that injector's numbers table. Discrete on purpose: a measurement exists only at those four points. |
| `FI.numbersTable(host, inj)` | Measured-degradation panel | Generates the captioned table from `FI.DATA`. Handles a null `d50` by printing "n/a" plus a footnote rather than a fabricated value. |
| `FI.real` | Optional real-data layer | Fetches `real/manifest.json`, silent on absence. `has(key)` / `get(key, tier)`. |
| `FI.tooltip`, `FI.tabs`, `FI.svg`, `FI.fmt`, `FI.clamp/lerp/ease` | Small shared utilities | `FI.fmt.d` is the signed three-decimal delta formatter used everywhere a Δ is printed. |
| Page furniture | Scrollspy, scroll reveal, KaTeX, copy buttons | Scrollspy also scrolls the sticky nav so the active chip stays visible on narrow screens. |

---

## Layer 2: the world (`fi-scene.js`)

The simulation. No DOM, no widgets, no measurements. Could be lifted into
another page unchanged.

### World construction

| Component | Role |
|---|---|
| `FI.WORLD` | Constants: bin count, range, road geometry, view box, agent poses, traffic. |
| `FI.buildScene(seed, n)` | Builds everything for one configuration. Casts static geometry once per agent, calibrates the clean intensity mean to the measured 0.94, returns the scene object. |
| `scene.compose(out, timeFor, skip)` | The single entry point every widget uses. `timeFor(i)` lets one agent contribute a stale frame (CommLatency); `skip(i)` lets an agent contribute nothing (AgentDrop, MissingModality). |
| `scene.vehicles(t)` | Live boxes for the moving vehicles at time `t`. Used for live and stale outlines. |
| `scene.dynamicInto(out, i, t, id)` | Per-frame vehicle returns for one agent, respecting static occlusion and vehicle-on-vehicle occlusion. |
| `scene.meanIntensity`, `scene.countByAgent` | Readout helpers. |
| `FI.castSeg`, `FI.raySeg`, `FI.boxCorners` | Low-level ray casting, exported because the hero figure builds its own miniature world. |

### Point cloud

A cloud is parallel typed arrays, `{n, cap, x, y, i, a, s}`: position,
intensity, owning agent, and per-point status. Status codes are `FI.ST`
(`CLEAN`, `ATTEN`, `ADDED`, `MOVED`) and they are what the status and intensity
colourings read. `FI.makeCloud`, `FI.ensureCloud`, `FI.pushPoint` manage them;
widgets allocate once and reuse, so a redraw allocates nothing.

### Injectors (`FI.faults`)

| Function | Shape |
|---|---|
| `poseOffsets(scene, sev, seed)` | Samples one pose error per collaborator. Separate from the transform so the widget can print the sampled values. |
| `pose(clean, out, scene, offs)` | Transforms about each collaborator's own sensor origin. |
| `bernoulli(scene, p, seed)` | One trial per non-ego agent. Shared by AgentDrop and MissingModality, which is what lets the contrast figure use an identical draw. |
| `reduce(clean, out, keep, seed)` | Uniform subsample. |
| `fog(clean, out, scene, sev, seed, phase)` | Intensity gain toward the measured tier mean, plus relocation of a fraction of returns toward their own sensor. `phase` animates the relocation. |
| `snow(clean, out, scene, sev, seed)` | Removal, attenuation, and added near-sensor scatter. Attaches `out.stats` with removed / attenuated / added counts for the readout. |

CommLatency has no entry here on purpose: it is not a point transform, it is a
different sampling time, so it lives in `scene.compose`.

### Renderer

| Function | Role |
|---|---|
| `FI.view(canvas, h, zoom)` | Contain-fit onto `WORLD.VIEW` (96 by 72 m, 4:3). Returns `sx/sy/m` forward and `wx/wy` inverse. The inverse is what lets background geometry be drawn out to whatever the canvas actually shows, so roads always run off the edges. |
| `FI.drawWorld(v, scene)` | Truth underlay: grid, road surface, lane lines, buildings, parked cars. Deliberately faint so the points stay the subject. |
| `FI.drawPoints(v, cloud, mode, opts)` | Three colourings: `"agent"` (the default, and the reason cooperative faults are legible), `"intensity"` (LidarFog), `"status"` (LidarSnow). Batches by colour. |
| `FI.drawAgents(v, scene, opts)` | Chevron glyphs, ego larger and outlined. `opts.off[i]` desaturates and crosses out. |
| `FI.drawBox`, `FI.drawScaleBar`, `FI.drawCaption` | Vehicle outlines, the 20 m scale bar every BEV carries, in-canvas captions for the animated figures. |

---

## Layer 3: figures (`fi-widgets.js`)

Each figure is an isolated IIFE that registers a repaint and owns its own state.
Shared scaffolding at the top of the file:

| Helper | Role |
|---|---|
| `S` and `rebuild()` | The one built scene. Rebuilt on any `FI.scene` change, then everything repaints. |
| `register(fn)` | Adds a repaint to the redraw list and wires it to theme change. Resize is debounced globally. |
| `bevH(canvas, lo, hi, ratio)` | Canvas height. Default ratio 0.75 matches the view aspect, so the contain fit wastes almost nothing at any width. |
| `playButton(btn, loop, opts)` | Play/pause bound to a loop, with pressed state and label. |
| `drawGraph(canvas, states, counts, opts)` | **The fusion-graph strip.** Ego node plus one node per collaborator, one edge each. Three node states: `present` (filled), `dropped` (dashed, crossed out, no edge), `empty` (hollow, edge intact, "0 pts"). Shared by AgentDrop, MissingModality and the contrast figure, and the difference between those states is the entire teaching point of section 04. |

### The figures

| Figure | Canvas ids | State it owns |
|---|---|---|
| Hero occlusion | `hero-bev` | Its own miniature world and ray casting; three stages, looped or stepped. |
| Clean frame | `bev-clean` | None; renders `S` unfaulted and reports per-agent counts. |
| PoseError | `bev-pose` | Severity, displacement magnifier. |
| CommLatency | `bev-latency` | Severity, clock, play state. `draw(tms)` advances, `draw()` repaints now. |
| AgentDrop | `bev-drop`, `graph-drop` | Severity, resample counter. Computes the `p^k` nuance live. |
| MissingModality | `bev-modality`, `graph-modality` | Severity, resample counter. |
| Contrast | `graph-cmp-drop`, `graph-cmp-modality` | Tier only; both graphs share one Bernoulli draw. |
| PointsReduce | `bev-points` | Severity. |
| LidarFog | `bev-fog`, `fog-hist` | Severity, relocation phase, play state. |
| LidarSnow | `bev-snow` | Severity, resample counter. |
| Snow mechanism | `#snow-mech` (SVG) | Tier-indexed, dual-axis, generated from `FI.DATA`. |
| Ranking | `#rank-chart` | Tier and metric selectors; sorts and colours by family. |
| Not injected | `#not-injected` | Cards generated from `FI.DATA.notInjected`. |
| Real-data toggles | `.fi-real-host[data-inj]` | Hidden unless the manifest lists that injector. |

---

## Layer 4: styles (`fi.css`)

### Design tokens

All visualization colour is `--viz-*` custom properties with separate light and
dark steps. Dark is the tuned set. Groups:

- **Agent slots** `--viz-s1` to `--viz-s6`. Slot 1 is the ego and is always
  blue. The other five are the collaborator colours in fixed assignment order.
- **Semantic** `--viz-crit` (corrupted-data family, added scatter),
  `--viz-good`, `--viz-warn` (stale frames, attenuated points).
- **Ink and surface** `--viz-ink`, `--viz-ink2`, `--viz-muted`, `--viz-grid`,
  `--viz-axis`, `--viz-surface`, `--viz-surface2`, `--viz-surface3`,
  `--viz-border`, `--viz-halo`.
- **BEV furniture** `--viz-road`, `--viz-roadline`, `--viz-build`,
  `--viz-buildline`, `--viz-ghost`.
- **Intensity ramp** `--viz-i0` to `--viz-i4`, viridis steps, low to high.

The ranking chart's two-colour family split reuses `--viz-s3` and `--viz-crit`
rather than introducing a new pair, so the "agent loss versus corruption"
distinction reads consistently with the rest of the page.

### Layout

| Class | Role |
|---|---|
| `.fi-section` | 5 em rhythm, scroll margin under the sticky nav. |
| `.fi-wide` | Escape hatch from the site's 760 px column to 1020 px above 1060 px viewport. |
| `.fi-panel-grid` | Canvas plus side panel, 1.7 to 0.95; stacks under 820 px. |
| `.fi-two` | Two equal panels, for the MissingModality split and the contrast graphs. |
| `.fi-toc` | Sticky chip nav, horizontally scrollable, auto-centres the active chip. |

### Component styles

`.fi-widget` (card), `.fi-sev` and `.fi-sev-ticks` (four-stop slider),
`.fi-nums` (measured table, with `.is-active` row highlight driven by the
slider), `.fi-stat` (large readout), `.fi-mini` (small table), `.fi-bars`,
`.fi-legend`, `.fi-chip`, `.fi-cmp-row` (contrast), `.fi-rank-row` (ranking),
`.fi-cards`, `.fi-callout`, `.fi-one-line`, `.fi-punch`, `.fi-scene-bar`,
`.fi-tooltip`, `.fi-real-box`.

The reduced-motion block disables scroll reveal and every decorative
transition; the figures keep their step and scrub controls, so nothing becomes
unusable.

---

## Adding an eighth injector

1. Append a record to `FI.DATA.injectors` with `key`, `name`, `num`, `one`,
   `param`, `units`, `d50`, `d70`, and optionally `extra`.
2. Add its physical parameters to `FI.PARAMS`.
3. If it is a point transform, add a function to `FI.faults`. If it changes
   *when* or *whether* an agent contributes, extend `scene.compose` instead.
4. Add a section to `index.html` following the existing pattern: `fi-kicker`,
   `fi-h2`, `fi-one-line`, prose, a `figure.fi-widget.fi-wide` containing a
   canvas plus a `.fi-panel-side` holding `.fi-sev-host[data-inj]`, a readout
   div, `.fi-nums[data-inj]` and `.fi-real-host[data-inj]`.
5. Add the widget IIFE, ending with `register(draw); draw();`.
6. Add a TOC entry.

The ranking chart, the not-injected list and the real-data toggles all pick it
up with no further work, because they iterate `FI.DATA`.

Give it its own visual signature. Seven renderers rather than one generic one is
a deliberate choice: a fault that looks like every other fault teaches nothing.
