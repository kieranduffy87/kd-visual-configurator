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
| World | Field · Sea · Studio · Void · Strata · Flux · Prism |
| Landscape | Dunes · Ridges · Canyons · Mesa · Terraces · Archipelago · Drift · Swell · Crystal, plus relief, detail and a seed |
| Surface | Solid · Contour · Grid · Points |
| Subject | KD mark · Sphere · Torus · Monolith · none, in glass, brand, matte or metal |
| Colourway | Electric · Paper · Signal · Ink · Blueprint · Nocturne · Mono · Arctic · Coral · Teal |
| Light | Studio · Contrast · Ambient · Noir moods; key and rim colour (Auto · Neutral · Ice · Electric · Amber · Coral · Teal · Violet); direction, height and power |
| Camera | Hero · Low · Aerial · Horizon · Detail · Plan — or drag the canvas — plus depth of field |
| Format | 16:9 · 3:2 · 1:1 · 4:5 · 9:16 |
| Type layer | Stack · Centre · Cover · Split · Corner · Clean, with eyebrow, headline, subhead, mark and scrim |

Eleven **recipes** in the top bar (Brand hero, Report cover, Social square, Story,
Deck divider, Pattern plate, Canyon hero, Archipelago, Studio still, Void
object, Crystal field) set a whole look in one click. **Shuffle** randomises inside the guardrails.

## Worlds

The landscape is one world of seven. Panels follow the world: Landscape and
Surface only appear for the two with terrain, Form only for the material
studies.

- **Field** — open landscape running to the horizon.
- **Sea** — the same land, half drowned. The terrain keeps its raw heights here
  instead of being levelled, so `y = 0` is a real waterline; the water plane
  sits just above the lowest ground with ripples in the vertex shader.
- **Studio** — a seamless cyclorama. It's the heightfield trick again, but the
  profile is a radial cove rather than noise: flat underfoot, then a wide
  radius sweeping up in every direction, so there's no visible seam from any
  camera angle.
- **Void** — a polished floor and nothing else, where the environment does all
  the work.

Three of them are material studies rather than places — no ground, no horizon,
the form fills the frame:

- **Strata** — stacked, extruded metal plates. Each outline is a closed loop of
  noise sampled around a circle. The radius wanders rather than tapering,
  because a monotonic taper reads as a wedding cake; wandering reads as a
  milled block that's been eroded.
- **Flux** — liquid chrome: a sphere displaced by 3D noise on the CPU so the
  normals can be recomputed properly. Only two octaves, deliberately — a mirror
  amplifies every wrinkle, and the fine octaves that read as detail on a matte
  surface read as crushed foil on chrome.
- **Prism** — a single continuous tube following a closed noise curve in
  dispersive glass. One form on purpose: three's transmission samples the
  opaque buffer, so glass never refracts glass and a cluster would go flat
  wherever the pieces overlap.

The material studies live or die on the environment. They switch on **strip
lights** — bands of brightness across elevation, plus a few vertical louvres.
A smooth environment gives chrome nothing to streak and glass nothing to
refract; the bands are what make metal read as metal. They're scaled by the
same visibility scalar as the softbox, so they stay a reflection feature
rather than painting a white arc across the sky.

Worlds carry their own camera scale, because the presets are framed for a
96-unit landscape and a studio subject is a couple of units tall. They also
carry their own environment strength: the empty worlds switch on broad studio
panels in the sky, since a tight softbox reads as a hot dot in a mirror rather
than an area light.

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
js/scene.js         three.js stage: worlds, terrain, subject, lights, sky and environment
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
- One GLSL function (`Stage.SKY_GLSL`) describes the sky, and both the visible
  backdrop and the reflection probe evaluate it, so what you see is what glass
  and metal reflect. The probe renders to a half-float target rather than a
  canvas specifically so the sun can carry values far above 1 — that headroom
  is what gives specular highlights their punch, and an 8-bit canvas can't
  hold it.

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
