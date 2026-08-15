# KD Visual Configurator

A browser tool for generating on-brand 3D key visuals. Pick a landscape, a
colourway, a camera and a type layout, then export a PNG in whatever format
you need — no 3D artist, no render queue.

Built after Tobias Anderssohn's Visual Configurator demo, in KD branding.

## Why it exists

The usual objection to 3D brand visuals is that they don't scale: every new
asset needs someone in Cinema 4D. This flips it. The scene is built once, the
brand rules are baked into the options, and the team self-serves everything
after that. Nothing selectable is off-brand — the whole permitted design space
lives in [js/brand.js](js/brand.js).

## Running it

Static files, no build step. Serve the folder:

```bash
python3 -m http.server 8552 --directory /Users/kieranduffy/Downloads/kd-visual-configurator
```

There's also a `kd-visual-configurator` entry in `Downloads/.claude/launch.json`
on port 8552.

## What you can change

| Group | Options |
| --- | --- |
| Landscape | Dunes · Ridges · Canyons · Mesa · Terraces · Archipelago · Drift · Swell · Crystal, plus relief, detail and a seed |
| Surface | Solid · Contour · Grid · Points |
| Subject | KD mark · Sphere · Torus · Monolith · none, in glass, brand, matte or metal |
| Colourway | Electric · Paper · Signal · Ink · Blueprint · Nocturne · Mono · Arctic · Coral · Teal |
| Light | Studio · Contrast · Ambient · Noir moods; key and rim colour (Auto · Neutral · Ice · Electric · Amber · Coral · Teal · Violet); direction, height and power |
| Camera | Hero · Low · Aerial · Horizon · Detail · Plan — or drag the canvas — plus depth of field |
| Format | 16:9 · 3:2 · 1:1 · 4:5 · 9:16 |
| Type layer | Stack · Centre · Cover · Split · Corner · Clean, with eyebrow, headline, subhead, mark and scrim |

Nine **recipes** in the top bar (Brand hero, Report cover, Social square, Story,
Deck divider, Pattern plate, Canyon hero, Archipelago, Crystal field) set a
whole look in one click. **Shuffle** randomises inside the guardrails.

## Rendering

The preview runs in real time while you work. Once the scene has been still for
about a second it starts accumulating jittered samples into the same frame and
converges on exactly what the export will produce — a thin blue progress line
along the top of the frame shows it settling. Any input drops straight back to
real time.

Each sample jitters three things at once:

- the camera by a sub-pixel offset, which supersamples the whole frame;
- the key light across a small disc, which turns its hard shadow edge into a
  real penumbra (the mood's softness sets the disc size);
- the eye across a lens disc while the focal plane is held on the subject,
  which is the depth of field.

**Quality** picks how many passes the export uses — Draft 24, Standard 64,
Fine 160. A 2000px Fine render takes a second or two; progress shows on the
frame.

## Sharing and exporting

- **Export PNG** writes the composite at 1200, 2000 or 3000px on the long edge.
- **Copy image** puts the same PNG on the clipboard.
- **Copy link** — the full state is encoded in the URL hash, so a link reopens
  the exact visual, seed and copy included.

Keyboard: `R` shuffle · `N` new landscape · `G` guides · `E` export.

## How it fits together

```
index.html          layout and import map
css/tokens.css      copied from kd-design-system — the single source of truth
css/kd.css          KD component classes
css/app.css         tool chrome only
js/brand.js         every selectable option, the recipes, share-link codec
js/noise.js         deterministic value-noise fbm — a seed always rebuilds the same terrain
js/scene.js         three.js stage: terrain, subject, lights, procedural environment
js/overlay.js       the type layer, drawn in canvas 2D
js/ui.js            data-driven control builder
js/app.js           state, render loop, export
vendor/             three.js r184, vendored so the tool works offline
```

Details worth knowing:

- The type layer is drawn with the **same function** for the preview and the
  export, just at a different pixel size. The preview is the artwork.
- The terrain is levelled so its centre always sits at `y = 0`. That keeps the
  subject and every camera preset framed the same no matter which landscape,
  relief or seed is chosen.
- Terrain quality comes from three things working together, and they're tuned
  as a set: **derivative-damped octaves** (each octave is attenuated where the
  surface is already steep, which flattens valley floors and sharpens crests),
  **domain warping** (the sample point is pushed around by a second noise
  field so shapes meander instead of looking grid-aligned), and a **feature
  size matched to the camera** — roughly 9 world units against an 18-unit
  camera distance, so a dozen forms are in frame rather than two. Change the
  noise frequencies and the relief mapping in `_buildTerrain` together, or the
  landscapes go flat.
- Shading adds a slope tint (`slope` in each colourway) and a cheap
  vertex-level ambient occlusion measured against a ring of neighbours. That
  AO pass is what stops large faces reading as flat plastic.
- `drawOverlay()` deliberately does **not** clear its canvas — the export
  composites it straight on top of the rendered 3D. Whoever draws the preview
  clears first. Putting a `clearRect` back in silently wipes the 3D out of
  every export and leaves type on black.
- Accumulation buffers hold linear light; the final blit does the sRGB encode.
  Don't let three encode as well or everything comes out washed out.

## Local development

`_dev-server.py` is `http.server` plus `Cache-Control: no-store`, because
browsers keep ES modules in a per-document module map and will happily reuse a
stale `js/*.js` after an edit — a reload then appears to change nothing. If a
preview still looks stale despite that, load the `kd-visual-configurator-alt`
entry on port 8553: a different origin sidesteps the cache entirely.

## Brand notes

Tokens are copied from `kd-design-system`, which stays the source of truth — if
a token changes there, re-copy `css/tokens.css` and `css/kd.css` rather than
editing them here. Coral and Teal are expressive accents and are marked
playground-only in the UI, matching the design system's guidance.
