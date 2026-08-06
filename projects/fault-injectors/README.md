# Collaborative Perception, interactive benchmark page

Interactive project page for **Collaborative Perception**, a fault injection
benchmark for cooperative LiDAR perception.
Adarsh Nanjaiya Latha, University of Twente. **Work in progress, unpublished.**

Live at `/Portfolio/projects/fault-injectors/`. The directory name is kept
descriptive rather than matching the title, since the title is a working one
and may change; the URL should not.

Seven fault injectors for cooperative LiDAR perception, three severity tiers
each, with a live synthetic bird's-eye-view scene per injector. Written to work
on a laptop with no dataset and no cluster access, and to accept exported
cluster frames later as an optional extra layer.

This file explains **how each visualization maps to the underlying
measurement**, so the page can be extended when the other two baselines finish.
For the component inventory see `COMPONENTS.md`.

## Stack, and why there is no build step

Same as `projects/clma/` and `projects/uxv/`: the portfolio is a Franklin.jl
static site on GitHub Pages, so this page is plain HTML, CSS and vanilla JS
(ES2017). No framework, no bundler, no CDN, no external libraries. Everything
renders with hand-rolled Canvas 2D and SVG. KaTeX, the site header, the theme
toggle, fonts and analytics are reused from the site. Deploying is committing
these files.

```
projects/fault-injectors/
├── index.html        # all markup and all prose
├── fi.css            # design tokens + page styles
├── fi-core.js        # shared runtime, and FI.DATA (all measured numbers)
├── fi-scene.js       # the synthetic world, its LiDAR model, the injectors, the renderer
├── fi-widgets.js     # every interactive figure
├── real/             # optional, empty by default (see "Real data" below)
└── README.md         # this file
```

One deviation from the clma page: it opts into dark unless the visitor has
explicitly chosen light (`localStorage.theme === "light"`). The site's own theme
toggle still works in both directions. The dark steps are the ones that were
tuned; light is fully supported and verified.

## Where the numbers live

**All measured values are in one place: `FI.DATA` in `fi-core.js`.** Nothing is
hard-coded in the markup. The severity controls, the per-injector tables, the
ranking chart, the contrast figure and the snow mechanism chart are all
generated from it, so changing a number there changes it everywhere.

Current contents: CoBEVT on V2XSet at the checkpoint's shipped Perfect setting.
Values are deltas against that model's own clean baseline.

| Injector | Parameter tiers | ΔAP@0.5 | ΔAP@0.7 |
|---|---|---|---|
| PoseError | σ = 0.2 / 0.4 / 0.6 m and degrees | −0.015 / −0.073 / −0.162 | −0.064 / −0.197 / −0.303 |
| CommLatency | 100 / 200 / 300 ms | −0.014 / −0.117 / −0.247 | −0.068 / −0.190 / −0.266 |
| AgentDrop | p = 0.25 / 0.50 / 0.75 | −0.024 / −0.052 / −0.087 | −0.030 / −0.069 / −0.113 |
| MissingModality | p = 0.25 / 0.50 / 0.75 | −0.032 / −0.069 / −0.116 | −0.034 / −0.075 / −0.124 |
| PointsReduce | keep 30 / 20 / 10 % | −0.138 / −0.203 / −0.336 | −0.170 / −0.238 / −0.355 |
| LidarFog | severity 1 / 2 / 3 | −0.693 / −0.840 / −0.849 | −0.551 / −0.658 / −0.660 |
| LidarSnow | severity 1 / 2 / 3 | not recorded | −0.394 / −0.404 / −0.448 |

Two side measurements are also carried, and both are wired to a visual:
LidarFog mean intensity (0.94 clean, then 0.80 / 0.66 / 0.51) and LidarSnow
removal fraction (0.399 / 0.323 / 0.290).

`LidarSnow.d50` is `null`, not zero. Anything that consumes `d50` must handle
null; the ranking chart renders it as "not recorded" and sorts it last, and the
numbers table prints "n/a" with a footnote. Follow that pattern rather than
inventing a value.

### Adding the other two baselines

The intended shape, once their runs land:

1. Promote `FI.DATA.model` to `FI.DATA.models`, an array of
   `{key, name, dataset, setting, note}`.
2. Change each injector's `d50` / `d70` from an array to an object keyed by
   model, `{cobevt: [...], other: [...]}`.
3. Add a model selector next to the existing tier and metric selectors in the
   ranking figure, and read `inj.d70[model]` throughout.

Three places read the arrays directly and would need the indirection:
`FI.numbersTable` and `FI.tierControl` in `fi-core.js`, and the `ranking` and
`contrast` widgets in `fi-widgets.js`. Nothing else touches them.

**Do not average deltas across models.** Each model has a different clean
baseline, so a mean delta describes nothing. Show them as separate series. The
page says so in section 10, and that claim should stay true.

## How each visualization maps to its measurement

The general rule: the **picture** shows the mechanism, the **numbers panel**
next to it shows the measurement, and the two are never conflated. Visual
severity on screen is not proportional to AP cost, and the page says so.

### Hero, "the thing worth protecting"

Not tied to a measurement. It establishes what cooperative perception buys, by
ray casting two visibility polygons against real geometry and showing that the
ego's polygon has a hole exactly where the collaborator's does not. The corner
building is sized so the ego's sight line to the cross-street car stays blocked
over the car's whole travel while the collaborator's stays clear; if you move
that geometry, re-check both sight lines.

### Section 01, the clean frame

The reference all seven are compared against. Renders `S.compose()` with no
fault, and reports the per-agent point counts that every other figure's counts
should be read against.

### PoseError

- **Mechanism shown:** clean cloud faded, faulty cloud solid, displacement
  vectors between corresponding points.
- **Why it grows with range:** `FI.faults.pose` transforms each collaborator's
  points about *that collaborator's own sensor origin*, not the world origin.
  This is the physically correct thing and it is what makes the far end of a
  cloud land worst. Do not simplify it to a global transform.
- **Honest exaggeration:** the displacement magnifier defaults to 3x because a
  sub-metre offset is a few screen pixels at these scales. The readout always
  reports the true, unmagnified mean and worst displacement. The magnifier is
  labelled in the control and in section 10.
- **Maps to:** the AP@0.5 versus AP@0.7 gap. A misplacement fault keeps the
  detections and moves them, so the strict threshold punishes it far harder.
  The prose next to the figure makes that argument from the table.

### CommLatency

- **Mechanism shown:** the only figure that must animate. `S.compose` takes a
  per-agent time function, so collaborators contribute the world as it was
  `Δt` ago while the ego contributes now.
- **Why static structure does not move:** the scene splits static returns
  (precomputed once per agent) from dynamic returns (recomputed per frame from
  the moving vehicles). Only the dynamic half goes stale, which is what actually
  happens.
- **Maps to:** the lag is annotated in **metres**, `v × Δt`, because that is the
  unit the detector experiences. The readout tabulates it per vehicle.
- `draw(tms)` advances the clock; `draw()` repaints the current instant. Every
  control calls `draw()` so a change is never waiting on the next frame.

### AgentDrop

- **Mechanism shown:** BEV plus a fusion-graph strip. A dropped agent's colour
  vanishes from the scene *and* its node leaves the graph, crossed out, edge
  gone.
- **The agent-count nuance:** the callout under the figure computes
  `p^k` live, where `k` is the current collaborator count. At two agents and
  p = 0.75 that is 75 % of frames collapsing to single-agent perception; at six
  agents it is 24 %. Dragging the shared agent-count control makes the point
  quantitatively rather than rhetorically.
- **Maps to:** the mildest severe tier in the suite, 0.113 AP@0.7, which is the
  first half of the page's headline claim.

### MissingModality

- **Mechanism shown:** deliberately two panels, because the BEV alone is
  indistinguishable from AgentDrop. Left panel identical, right panel is the
  graph where the node is **hollow but present**, edge intact, labelled 0 pts.
- **Maps to:** the fact that it degrades slightly worse than AgentDrop at every
  tier on both thresholds, with identical surviving point clouds. The
  explanation on the page is that an empty agent still consumes fusion
  attention. That is the interpretation, and it is stated as one.
- **The contrast figure** draws both graphs from the **same Bernoulli draw** at
  the same p, so the only difference in the whole comparison is graph
  membership. It prints the gap, which is 0.011 AP@0.7 at the severe tier.

### PointsReduce

- **Mechanism shown:** uniform random subsampling, live surviving count, and a
  per-agent bar breakdown.
- Point size grows slightly once thinning starts so sparse regions stay legible
  instead of vanishing into the background. That is a rendering choice, not a
  claim about the data.
- **Maps to:** the mild tier already costs more than any severe tier of
  AgentDrop, MissingModality, or CommLatency at 200 ms. The prose makes that
  comparison explicitly.

### LidarFog

- **Mechanism shown:** two coupled effects, both visible.
  1. Points are coloured by **intensity** rather than by owner, on a viridis
     ramp, so the whole distribution shifts hue. The gain is set so the rendered
     mean intensity lands on the measured tier value; the readout prints the
     achieved mean next to the target, and they agree to two decimals.
  2. A fraction of returns are **relocated** toward their own sensor, animated,
     because fog backscatters and the pulse returns early.
- **Calibration:** the synthetic clean intensity distribution is scaled once at
  scene build time so its mean is exactly 0.94, the measured clean value. This
  is why the fog readout is directly comparable to the benchmark number.
- **The histogram** under the BEV draws the clean distribution as a dashed
  outline and the faulted one as filled bars, so the shift is measurable rather
  than impressionistic.
- **Maps to:** the headline finding. Near-total collapse at the mild tier
  already, and severities 2 and 3 barely add. The saturation shape is called out
  because it changes what a mitigation would have to do.

### LidarSnow

- **Mechanism shown:** per-point status colouring. Blue unchanged, yellow
  attenuated, red added scatter. The red halos around each sensor grow with
  severity while the blue structure thins only slightly.
- **The mechanism chart** is the point of the section: removal fraction on the
  left axis falling (0.399, 0.323, 0.290) against AP@0.7 lost on the right axis
  rising (0.394, 0.404, 0.448). Two lines going opposite directions. If removal
  drove the damage they would move together.
- **Injector parameters:** removal probabilities are the *measured* fractions.
  The added-scatter fraction (0.12 / 0.30 / 0.58) and attenuation probability
  (0.26 / 0.42 / 0.58) are chosen so the visual mechanism reads correctly; they
  are not measured quantities. If the real per-tier scatter counts become
  available, put them in `FI.PARAMS.snow.add` and the figure updates.
- The readout prints removed and added counts live, so the reader can verify
  the crossover themselves.

### Ranking

Reads `FI.DATA` directly, sorts by `|Δ|` at the selected tier, and colours by
family: teal for the two faults that take a collaborator away, red for the five
that corrupt what a collaborator sends. That colouring is the argument. Rows
link to their sections. Bars are on a fixed 0.70 full scale so tier switches
are comparable.

## The synthetic scene

`fi-scene.js`. Everything is procedurally generated from a seed; no dataset is
touched.

**Geometry.** A four-way intersection. The horizontal road has its centreline
at y = 4 with half width 8, lanes at y = 0 and y = 8; the vertical road is at
x = 16 with half width 8, lanes at x = 12 and x = 20. The ego sits at the origin
in the eastbound lane, which is why the origin is a sensible place for it. Two
buildings per corner block, parked cars hugging the inside of each curb, four
vehicles driving the lanes at 7 to 9 m/s and wrapping.

**Sensing.** Each agent casts 720 azimuth bins to 44 m against real segment
geometry, so occlusion is genuine: an agent cannot see through a building, and
each agent's shadows are its own. Buildings and parked cars occlude. Road edges
do not occlude but do return points, and they are visibility-tested against the
occluder depth buffer so a curb behind a building is correctly absent.

**Why it is fast.** Static geometry is cast once per agent at build time into a
depth buffer and a point list. Per frame, only the moving vehicles are cast, and
only into the azimuth window each vehicle subtends, tested against the static
depth buffer and against each other. A five-collaborator scene is roughly 3,000
to 4,500 points and redraws well inside a frame.

**Agent poses are fixed and appended, never reshuffled**, so raising the agent
count adds an agent rather than rebuilding the scene. The ego is always agent 0
and always blue.

**Determinism.** The scene is fully determined by `(seed, agentCount)`. Every
injector derives its own PRNG stream from the world seed, so a configuration
renders identically on every machine and every reload. The resample buttons
advance the fault seed only, leaving the world alone.

### What is faithful and what is not

Faithful, because the argument depends on it: occlusion, the pose transform
about the collaborator's own origin, the static/dynamic split under latency,
intensity falling with range, the injector tier parameters, and the clean mean
intensity calibrated to 0.94.

Not faithful, and it does not need to be: the world is one synthetic
intersection rather than a dataset distribution, and point counts are chosen for
on-screen legibility rather than to match a real sensor's return count.

Deliberately exaggerated and labelled: the PoseError displacement magnifier.

Section 10 of the page states all of this to the reader.

## Real data, dropped in later

The page fetches `real/manifest.json` at load. If it is absent or malformed,
nothing happens and no error appears; the page is complete without it. If it is
present, every injector listed in it grows a toggle that shows the exported
asset beside the synthetic scene.

```json
{
  "fog": {
    "3": { "type": "video",
           "src": "/Portfolio/projects/fault-injectors/real/fog_s3.mp4",
           "poster": "/Portfolio/projects/fault-injectors/real/fog_s3.jpg",
           "caption": "OPV2V frame 001820, LidarFog severity 3, CoBEVT." }
  },
  "snow": {
    "1": { "type": "image",
           "src": "/Portfolio/projects/fault-injectors/real/snow_s1.png",
           "alt": "Real snow-injected frame",
           "caption": "V2XSet, LidarSnow severity 1." }
  }
}
```

Top-level keys are the injector keys used throughout (`pose`, `latency`, `drop`,
`modality`, `points`, `fog`, `snow`). Second-level keys are the severity tier as
a string, `"1"` to `"3"`. `type` is `"video"` or `"image"`. Anything not listed
keeps the synthetic scene. When the toggle is opened it picks the asset matching
the current severity slider, falling back to tier 3.

Export hint: whatever you render on the cluster, keep the ego blue and give each
collaborator a stable colour, so the exported frame and the synthetic scene read
with the same legend.

## Accessibility

- Every control is a real `<button>`, `<input type=range>` or `<select>`; every
  one is focusable and named. Tab groups use `role=tab` and `aria-selected`.
- Every canvas has `role="img"` and a prose `aria-label` that describes what the
  interaction demonstrates, not just what is drawn. Every data table has a
  `<caption>`.
- Severity sliders are keyboard operable as ranges, and each of the four stops is
  additionally a clickable, labelled button carrying `aria-current`.
- `prefers-reduced-motion`: no loop autostarts, scroll reveals and chart draw-in
  are disabled, and each animated figure has a meaningful static equivalent. The
  hero renders the fused frame with step buttons, CommLatency renders a still
  instant with a time scrubber, LidarFog renders full relocation.
- Colour is never the only channel: dropped agents get a cross as well as
  desaturation, empty nodes are hollow as well as labelled "0 pts", and every
  status legend is textual.

## Performance

- Zero dependencies. Three JS files, one CSS file, no images, no extra fonts.
- Animation loops run only while their widget is on screen and the tab is
  visible, so idle cost is near zero.
- Canvases are DPR-aware. Point drawing batches by colour, so a full redraw is a
  handful of `fillStyle` changes and a tight `fillRect` loop.
- Rebuilding the scene (agent count or seed change) recasts static geometry
  once, then every widget repaints from cached point lists.

## Verified

Checked in-browser at 1440 and 375 wide, in both themes: no console errors, no
horizontal overflow, every canvas rendering content, all severity sliders
driving both the visual and the readout, agent count propagating to every
figure, theme flip repainting all canvases, and the three distinctive fault
signatures confirmed by pixel histogram (fog hue shift, snow status crossover,
agent colour disappearing on drop).

## Caveats

The numbers are current as of the CoBEVT run and are work in progress. Nothing
on the page has been peer reviewed, and the page says so.
