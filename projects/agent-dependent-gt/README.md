# Agent-Dependent Ground Truth, interactive paper page

Project page for the WACV 2027 (Datasets Track) paper *Agent-Dependent Ground
Truth Biases Robustness Evaluation in Collaborative Perception*.

Live at `/Portfolio/projects/agent-dependent-gt/`.

## Stack

Same as `projects/clma/`, `projects/uxv/` and `projects/fault-injectors/`: plain
HTML, CSS and vanilla JS (ES2017), no build step, no CDN. KaTeX, the site
header, footer, theme toggle, fonts and analytics are reused from the site.
Deploying is committing these files. Like the companion fault-injector page it
opens in dark unless the visitor has chosen light; light is fully supported.

```
projects/agent-dependent-gt/
├── index.html         # all markup and prose (readable without JS)
├── adgt.css           # design tokens (--ag-*) and page styles
├── adgt-data.js       # AG.PAPER (metadata, links, BibTeX) and AG.DATA (every number)
├── adgt-core.js       # runtime: colours, loops, tooltips, segmented controls,
│                      #   reveals, sticky nav, KaTeX, BibTeX copy, links
├── adgt-scene.js      # the three bird's-eye-view canvases
├── adgt-widgets.js    # charts, protocol diagram, tables, injector grid
└── README.md
```

Social card: `assets/og/agent-dependent-gt.png`, rendered from the hero figure
(state b) at 1200 x 630.

## Updating content

**Links.** `AG.PAPER.links` in `adgt-data.js`. `paper` and `code` are `null`
until public; the hero buttons render as dashed "soon" pills and the resources
list says "link added at publication". Setting a URL turns both into real links;
nothing else needs to change.

**Authors and BibTeX.** Adarsh Nanjaiya Latha, Alessandro Chiumento, Jan
Laarhuis, Ozlem Durmaz Incel. Kept in four places: `AG.PAPER.authors` and
`AG.PAPER.bibtex`, the static author line and `<pre id="bibtex">` in
`index.html`, and the JSON-LD `author` array. The Research page
(`cv/index.html`) carries the same BibTeX in its Publications entry.

**Submission values.** Every number comes from the submitted version. The hero
notice (`.ag-notice`) and the note under the BibTeX say so; update `AG.DATA`
and the prose numbers against the camera-ready, then reword or drop both notes.

**Numbers.** Every measured value is in `AG.DATA`, each with its source
(Sec. / Tab. / Fig.). Charts and tables read only from there. A few headline
numbers also appear in prose in `index.html` (13.1%, 25.5%, 0.0145, ...);
search for them if a value changes.

## What each figure shows, and how honest it is

The rule throughout: a figure is labelled **schematic**, **synthetic** or
**measured**, and only measured figures carry the paper's numbers.

| Figure | Label | What is real |
|---|---|---|
| Hero, "three answer keys" | schematic | The paper's Fig. 1 counts: references 29 / 22 / 29, TP / FP / FN 21/4/8, 17/5/5, 18/4/11. Positions are redrawn. The per-object split of hits between ego-visible and collaborator-only objects in state (a) is illustrative; totals match. |
| Recall as blocks | paper counts | Same counts as fractions. Recall and precision are computed from them. |
| Reference builder | synthetic | The set algebra: the reference is Eq. (1) then Eq. (2), each U_j is Eq. (5). Geometry is procedural; visibility is ray-cast with a 50 m illustrative range. The shrinkage stat says "toy" and cites the measured 13.1%. |
| Radius drift | synthetic | The mechanism of Sec. 3.3. The live % and r are computed from the toy street and are labelled as such; the measured 25.5%, r = 0.59 and r = 0.25 sit in a separate stat row. |
| Protocol diagram | text from the paper | Sec. 4.1–4.4, including the RNG snapshot guard and the ego-only fault convention. |
| Models table | measured | Tab. 2, Sec. 4.3 noise floors and wrapper inertness. |
| Shrinkage | measured | Sec. 5.1. |
| Corrected cost | measured | Tab. 3 values, floor multiples and the scene-bootstrap intervals. The AP@0.5 mild interval is not reported and is shown as such. |
| Injector grid | paper | Sec. 4.1. Tiers only for the seven exercised injectors; the rest live in supplementary Tab. 5 and are not reproduced. |
| Ranking | measured | Sec. 5.3 means. Per-model values are only in the paper's Fig. 3 and are not transcribed. |
| IoU asymmetry, snow | measured | Secs. 5.4–5.5 values stated in the text. CoBEVT and V2X-ViT snow AP values exist only in Fig. 4 and are not transcribed. |

Not shown on purpose: the per-stratum bars of Fig. 2 and per-model bars of
Fig. 3, whose values are only in plots.

## Motion and accessibility

- One reveal (opacity + 14 px rise), used on section heads and figures only.
- The hero auto-cycles a → b → c once in view and stops on any interaction;
  the radius street plays; the protocol diagram sends pulses along the edges
  entering each stage. All three are off under `prefers-reduced-motion`.
- Canvas loops pause offscreen and in hidden tabs (`AG.loop`).
  `AG.__frame()` forces one frame of every loop for testing in a hidden pane.
- Segmented controls are buttons with `aria-pressed` or `role=tab` +
  `aria-selected`, arrow-key navigable. Chart marks are focusable with
  `aria-label`s and hover/focus tooltips. Live regions announce state changes.

## Before committing

```
python3 tools/check_site.py
```
