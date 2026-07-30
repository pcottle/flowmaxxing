# CLAUDE — Visual Style & Technical Approach (Agent Instructions)

> **Audience:** other AI coding agents (and humans) who want to reproduce, extend, or
> learn from the look of **WaitingFor.AI** — an infinite, procedurally-generated
> "Wind Waker on a beach" world built in Three.js + raw WebGL/GLSL.
>
> **What this document is:** a distilled, opinionated field guide to *how the look is
> actually achieved in this repo*. It names the exact techniques, the exact files, the
> exact magic numbers, and — most importantly — the **design rules** that make everything
> read as one coherent, hand-painted world. If you internalize the "Ten Rules" in §1 and
> the shared shader vocabulary in §4, you can add a new effect that looks like it belongs.
>
> **Golden rule for agents:** *match the surrounding code.* This project has a very
> specific, self-consistent style. A new material that reaches for `MeshStandardMaterial`,
> PBR lighting, `outputColorSpace`, or tone mapping will look **wrong** next to everything
> else here, no matter how "correct" it is. When in doubt, copy an existing sibling
> material and modify it.

---

## Table of contents

1. [The Ten Rules of the look](#1-the-ten-rules-of-the-look)
2. [Tech stack & project architecture](#2-tech-stack--project-architecture)
3. [The rendering pipeline (and what is *deliberately* off)](#3-the-rendering-pipeline-and-what-is-deliberately-off)
4. [The shared shader vocabulary (GLSL partials)](#4-the-shared-shader-vocabulary-glsl-partials)
5. [Color & palette philosophy](#5-color--palette-philosophy)
6. [The data-texture terrain technique](#6-the-data-texture-terrain-technique)
7. [Toon water](#7-toon-water)
8. [The sky / atmosphere / fog system (the keystone)](#8-the-sky--atmosphere--fog-system-the-keystone)
9. [Celestial & weather VFX](#9-celestial--weather-vfx)
10. [Day-cycle & the single sun driver](#10-day-cycle--the-single-sun-driver)
11. [Grass: an infinite billboard field](#11-grass-an-infinite-billboard-field)
12. [Props & the ink-outline (inverted hull)](#12-props--the-ink-outline-inverted-hull)
13. [Particles, sparkles, fireflies: SDF glyphs in points](#13-particles-sparkles-fireflies-sdf-glyphs-in-points)
14. [Fire, glow, lanterns](#14-fire-glow-lanterns)
15. [Creatures: procedural animation over rigs](#15-creatures-procedural-animation-over-rigs)
16. [Player, ribbon, cyclones](#16-player-ribbon-cyclones)
17. [Performance techniques](#17-performance-techniques)
18. [Headless testing of a graphics project](#18-headless-testing-of-a-graphics-project)
19. [Cookbook: add a new toon material](#19-cookbook-add-a-new-toon-material)
20. [Pitfalls & gotchas](#20-pitfalls--gotchas)
21. [Quick-reference tables](#21-quick-reference-tables)

---

## 1. The Ten Rules of the look

These are the invariants. Almost every material in the repo obeys most of them.

1. **No PBR, no lighting rig, no tone mapping.** Everything is a raw
   `THREE.ShaderMaterial` or an unlit `MeshBasicMaterial`. There is exactly one
   directional concept — `uSunPosition` (a unit vector) — and lighting is faked by hand.

2. **WYSIWYG color.** Color management, sRGB output encoding, and tone mapping are all
   left **off** (see §3). A hex color you type into a uniform is written to the screen
   *unchanged*. Author colors to look right directly; never assume a linear workflow.

3. **Half-Lambert with a *cool tinted* shadow.** Shading is `dot(N, -sun)*0.5+0.5` (never
   clamped to black), and the shaded side is tinted toward `base * vec3(0.0, 0.5, 0.7)`.
   **Shadows are blue-green, not dark.** This one choice does most of the "toon" work.

4. **Posterize gradients into flat bands.** Use `step()` and *ultra-narrow* `smoothstep()`
   (0.01–0.05 wide) to turn smooth math into hard, poster-like edges: toon foam, sun halo,
   cloud rims, moon, rainbow, cyclones, flames. Smooth is the exception, not the default.

5. **Flat / faceted geometry.** Author low-poly, then `geometry.toNonIndexed()` +
   `computeVertexNormals()` so every triangle is a flat facet. Shade **per-vertex** where
   you can (grass, props emit only `vColor`; the fragment shader is a one-liner).

6. **One coherent atmosphere via a screen-space sky-fog.** The sky is rendered to a small
   texture; every world material fades to *that texture, sampled at the fragment's screen
   position* (`getFogColor`). Distance objects melt into the *actual* sky behind them —
   automatically reactive to time of day, storms, and aurora.

7. **`uSunPosition.y` drives the whole world.** One scalar (sun height) fans out to sky,
   fog, golden-hour grade, night desaturation, moon/star/aurora visibility, foam glint,
   ribbon brightness. Wire new effects to it so they stay in sync.

8. **Procedural animation over rigs.** No skeletal animation anywhere. Motion is sines,
   noise-texture scrolling, finite-difference banking, verlet rope, and CPU pools. Ambient
   life (gulls, fish, crabs, grass, flames) is all hand-rolled math.

9. **Additive blending is reserved for *light*.** Sparkles, fireflies, embers, campfire
   glow, sun shafts. Solid shapes (flames, foam, particles) stay opaque / alpha-cutout to
   preserve the flat gouache-sprite feel.

10. **Determinism & rarity.** Procedural placement is seeded so nothing pops when chunks
    re-LOD. Special moments (rainbow, aurora, lightning) are gated, rare, and eased in/out
    with envelopes so they feel earned.

Frame-rate independence is a silent 11th rule: **all easing is
`value += (target - value) * (1 - exp(-rate * dt))`**, never a fixed `lerp(a, b, 0.1)`.

---

## 2. Tech stack & project architecture

**Dependencies that matter:**

| Package | Role |
| --- | --- |
| `three@0.149` | renderer + math. Pinned deliberately (see §3 on color management). |
| `vite@4` + `vite-plugin-glsl` | dev server/build; lets shaders live in `.glsl` files with `#include`. |
| `@vitejs/plugin-react` + `react@19` | the 2D UI overlay only (HUD, touch controls, emoji picker). The 3D world is 100% imperative Three.js — React never touches the canvas. |
| `simplex-noise`, `seedrandom`, `gl-matrix` | procedural terrain, deterministic placement, fast CPU vector math. |
| `firebase` | multiplayer ghost presence (not visual). |

**GLSL tooling.** `vite-plugin-glsl` is what makes the shader code readable. Shaders are
authored as real files and composed with a C-like include:

```glsl
#include ../partials/getSunShade.glsl;
```

Materials import the compiled strings:

```js
import vertexShader from './shaders/water/vertex.glsl'
import fragmentShader from './shaders/water/fragment.glsl'
```

`vite.config.js` also aliases `@` → `./sources/Game` and enables `glsl({ watch: true })`
for hot-reload of shaders.

**Architecture: a strict `State` ↔ `View` split** (inherited from Bruno Simon's
[infinite-world](https://github.com/brunosimon/infinite-world), which this is a fork of).

```
sources/Game/
  Game.js                  // top-level singleton, owns State + View + Debug
  State/                   // SIMULATION — no THREE objects. gl-matrix only.
    State.js               //   singleton; update() ticks every subsystem in order
    Player.js, Camera.js   //   physics, camera rig (pure math)
    Sun.js, DayCycle.js    //   the clock and the sun's spherical position
    Weather.js, WaveSets.js//   rain/lightning scheduling, breaking-wave phase
    Chunks.js, Terrains.js //   which terrain tiles exist & their LODs
  View/                    // RENDERING — everything THREE lives here
    View.js                //   singleton; owns the one Scene; update() order matters
    Renderer.js, Camera.js //   the WebGLRenderer + the PerspectiveCamera
    Sky.js, Water.js, ...   //   one class per visual system
    Materials/*.js          //   ShaderMaterial factories (uniforms live here)
    Materials/shaders/**    //   the GLSL
  Workers/
    Terrain.js             //   heightfield + normals baked off-thread (Web Worker)
```

**Why the split matters for you:** if you add gameplay-affecting motion, it belongs in
`State/` (deterministic, testable headlessly — see §18). If you add *pixels*, it belongs
in `View/`. The View reads State each frame; State never imports THREE.

**Singletons.** `Game`, `State`, `View`, `Debug` are singletons via a
`static getInstance()` pattern. New systems fetch what they need in their constructor:

```js
this.state = State.getInstance()
this.view  = View.getInstance()
this.scene = this.view.scene
```

**Debug.** `lil-gui` + `stats.js`, gated behind `Debug.active` (URL hash `#debug`).
Every tunable magic number in this doc is typically exposed as a GUI slider — that is how
the palettes were tuned. When you add a material, add its key uniforms to a debug folder.

---

## 3. The rendering pipeline (and what is *deliberately* off)

`sources/Game/View/Renderer.js` is short and the most important thing about it is what it
**doesn't** do.

```js
this.clearColor = '#222222'
this.instance = new THREE.WebGLRenderer({ alpha: false, antialias: true })
this.instance.setClearColor(this.clearColor, 1)
this.instance.setSize(this.viewport.width, this.viewport.height)
this.instance.setPixelRatio(this.viewport.clampedPixelRatio)   // capped at 2

// ALL of this is commented out — on purpose:
// this.instance.physicallyCorrectLights = true
// this.instance.outputEncoding = THREE.sRGBEncoding
// this.instance.toneMapping = THREE.ReinhardToneMapping
// this.instance.toneMappingExposure = 1.3
// this.instance.shadowMap.enabled = false
```

Key facts and *why*:

- **No `outputEncoding` / `outputColorSpace`, no tone mapping, no `ColorManagement`.**
  On three `r149`, `THREE.ColorManagement` is not force-enabled and output stays linear/raw.
  The net effect: **colors round-trip unchanged** from your uniform to the framebuffer.
  This is the technical basis of Rule #2. If a future agent "modernizes" the renderer by
  adding `outputColorSpace = SRGBColorSpace` or a tone mapper, **every hand-tuned palette in
  the project will shift** (wash out / desaturate). Don't, unless you re-grade everything.

- **`antialias: true` is the *only* AA.** There is no `EffectComposer`, no post pass, no
  FXAA/SMAA/TAA. Hardware MSAA keeps the hard toon edges (foam, cloud rims, wet-sand line)
  crisp without shimmer. Because there's no post stack, effects that *look* like post
  (sun shafts) are done as additive fullscreen quads drawn last (§9).

- **`alpha: false`** — opaque backbuffer; the sky plane covers every pixel each frame, so
  the `#222222` clear color is essentially never seen.

- **`setPixelRatio(min(devicePixelRatio, 2))`** — DPR capped at 2 (`Viewport.js`) so retina
  phones don't quadruple fragment cost for no visible gain.

- **The render loop is a single `renderer.render(scene, camera)`** (`Renderer.update()`).
  All off-screen rendering (the sky RT §8, the noise RT §4-ish) is done by *other* systems
  that borrow the renderer, `setRenderTarget(target)`, render, then `setRenderTarget(null)`.

**Camera** (`View/Camera.js`): `PerspectiveCamera(45, aspect, 0.1, 5000)`, euler order
`YXZ`. FOV lerps `45° → 63°` with speed (`baseFov 45 + speedFov 18`) for a rush feel, using
the `1 - exp(-rate·dt)` easing. `far = 5000` because the sky dome/stars sit at ~1000. The
render camera's *transform* is copied every frame from the pure-math `State/Camera` rig
(third-person spring orbit at distance 15, φ ≈ 0.45π).

---

## 4. The shared shader vocabulary (GLSL partials)

`sources/Game/View/Materials/shaders/partials/` is the heart of the coherent look. These
tiny functions are `#include`d into terrain, water, grass, props, player, etc., so every
surface is lit and graded by the *same* math. **Learn these first.** Reuse counts across
shaders: `getSunShade` (6 files), `getFogColor` (5), `getTimeOfDayColor` (5).

**`getSunShade.glsl` — half-Lambert (never black):**
```glsl
float getSunShade(vec3 normal)
{
    float sunShade = dot(normal, - uSunPosition);
    return sunShade * 0.5 + 0.5;          // remap [-1,1] → [0,1]; back-facing stays lit
}
```

**`getSunShadeColor.glsl` — the blue-green shadow (the signature move):**
```glsl
vec3 getSunShadeColor(vec3 baseColor, float sunShade)
{
    vec3 shadeColor = baseColor * vec3(0.0, 0.5, 0.7);   // cool-tinted, not just darker
    return mix(baseColor, shadeColor, sunShade);
}
```

**`getTimeOfDayColor.glsl` — one global grade keyed to sun height:**
```glsl
float golden = smoothstep(0.35, 0.05, abs(sunY)) * smoothstep(-0.15, 0.05, sunY);
vec3 color = mix(baseColor, vec3(0.70, 0.52, 0.22), golden * 0.7);  // warm ochre at dawn/dusk
float night = smoothstep(0.05, -0.25, sunY);
color = mix(color, vec3(0.12, 0.18, 0.24), night * 0.5);            // cool slate at night
```

**`getSunReflection.glsl` / `getSunReflectionColor.glsl` — fresnel glint to pure white:**
```glsl
float fresnel = uFresnelOffset + uFresnelScale * (1.0 + dot(viewDirection, worldNormal));
float sunReflection = pow(fresnel * sunViewStrength, uFresnelPower);
// ...
return mix(baseColor, vec3(1.0), clamp(sunReflection, 0.0, 1.0));   // hard white highlight
```

**`getFogColor.glsl` — screen-space sky fog (see §8):**
```glsl
vec3 getFogColor(vec3 baseColor, float depth, vec2 screenUv)
{
    float uFogIntensity = 0.0025;
    vec3 fogColor = texture2D(uFogTexture, screenUv).rgb;              // the sky, behind this pixel
    float fogIntensity = 1.0 - exp(- uFogIntensity * uFogIntensity * depth * depth);
    return mix(baseColor, fogColor, fogIntensity);                    // exp-squared falloff
}
```

**Utility partials:** `inverseLerp`, `remap`, `getRotatePivot2d` (2D rotation about a pivot,
used for grass billboarding), `getGrassAttenuation` (distance fade), `getWaveBump`
(breaking-wave gaussian), and Perlin noise (`perlin2d`, `perlin3dPeriodic`, `perlin4d`).

**The canonical surface chain** (terrain, grass, props all do this, in this order):

```glsl
color = getTimeOfDayColor(color);                     // 1. global time-of-day grade
color = getSunShadeColor(color, getSunShade(normal)); // 2. blue half-lambert
color = getSunReflectionColor(color, getSunReflection(...)); // 3. optional white glint
color = getFogColor(color, depth, screenUv);          // 4. melt into the sky at distance
```

If you write a new opaque surface material, run this chain and it will instantly belong.

---

## 5. Color & palette philosophy

- **Saturated but not neon.** Sky zenith `#2e89ff`, minty horizon `#f0fff9`, dawn `#ff7038`,
  sun halo `#ffa54a`. Water deep `#1e4f9c`, shallow `#3ba7c0`, foam `#e8f0ee`.
- **Rainbows/auroras are pastel** — nothing fully saturated. Rainbow bands are e.g.
  `(0.61,0.5,0.9)` violet … `(0.98,0.55,0.55)` red. This restraint is what reads as
  "hand-painted" rather than "RGB test pattern."
- **Shadows shift cool, highlights shift warm/white.** Never neutral-grey shading.
- **Biomes via weighted 3-color palettes.** Terrain/grass sand/grass/rock each have 3
  variants (`uSandColors[3]`, etc.) blended by biome weights read from a 1-D "corridor
  texture" (R=shoreX, G=volcanic, B=savanna). One texture fetch → smooth biome transitions.
- **Author in the color you'll see** (Rule #2). Test at multiple times of day, because
  `getTimeOfDayColor` + `getSunShadeColor` will push your base color around a lot.

---

## 6. The data-texture terrain technique

This is one of the most reusable ideas in the repo: **bake expensive per-vertex data on a
worker into an RGBA float texture, then read it in the vertex shader.**

`Workers/Terrain.js` runs off-thread. For each terrain tile it computes an FBM heightfield
with zone-based profiles (ocean depth, beach, hills, ridged mountains, terraced cliffs,
offshore sea-stacks, sculpted "dune-melody" moguls), then packs, per texel:

```js
texture[i + 0] = normal.x
texture[i + 1] = normal.y
texture[i + 2] = normal.z
texture[i + 3] = position.y   // elevation
```

The `TerrainMaterial` vertex shader samples that texture and reconstructs the surface:

```glsl
vec4 terrainData = texture2D(uTexture, uv);
vec3 normal    = terrainData.rgb;   // precomputed geometric normal
float elevation = terrainData.a;
```

Why this is powerful:

- **Normals are exact and cheap** — computed by finite differences on the worker (with a
  one-texel overflow border for accuracy at tile seams), not derived in-shader.
- **Grass and terrain share the same data** — grass reads the *four* surrounding terrain
  tiles' textures (`uTerrainA…D`) to place blades exactly on the ground with matching
  normals, so blades never float or sink.
- **LOD stability** — structural elevation (terraces, moguls, stacks) is computed *before*
  the LOD-varying detail octave, so band positions never shift between LODs.

The terrain fragment shader then does the toon coloring: posterized biome blend, a
**hard "wet sand" toon edge** produced by interpolating a smooth `vWetness` varying and
`step()`-ing it in the fragment (stepping in the vertex shader would smear across the
triangle), plus a golden-hour wet-sand gloss specular. This "smooth varying, hard `step()`
in the fragment" trick is the general recipe for crisp toon edges on interpolated data.

---

## 7. Toon water

`WaterMaterial` + `shaders/water/*` is a masterclass in the style. Highlights:

**Flat-shaded facets from derivatives.** No per-vertex normals; the fragment recovers a
per-triangle normal from screen-space derivatives — that's the faceted low-poly water look:
```glsl
vec3 faceNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
```
(Requires `extensions: { derivatives: true }` on the material.)

**Posterized depth color** — 4 discrete bands, not a gradient:
```glsl
float depthBlend = smoothstep(0.0, uOceanRampWidth, d);
depthBlend = floor(depthBlend * 4.0 + 0.5) / 4.0;      // quantize to 4 steps
vec3 color = mix(uShallowColor, uDeepColor, depthBlend);
```

**All foam is stable in space; only the *lines* move.** Foam is a chain of `max()`'d
`step()` masks — shore edge band, an outline ring (double-line look), drifting contour
rings, whitewater bores after a break, crest-slope foam, player ripples, a directional
swim-wake "V", and rain splash rings. Every breakup pattern is a *static* hash keyed to
world-Z cells; animation only translates or expands the lines. This is why the foam looks
drawn rather than noisy. Foam is applied **last, after lighting, as flat unshaded white** —
the toon signature.

**Faceted glint:** per-facet sun shade multiplies the color `mix(1.12, 0.82, facetShade)`,
and a sharp `pow(reflect·view, 30)` glint is `step()`-ed into hard white chips.

Vertical motion is layered sines in the vertex shader plus CPU-driven "wave sets"
(`State/WaveSets`) that push localized gaussian breaking bumps (`getWaveBump`) up the beach
*in sync* with the terrain's wet-sand uprush — the water and the sand agree on where a wave
is because both read the same `uWaveTexture` / phase uniforms.

---

## 8. The sky / atmosphere / fog system (the keystone)

If you learn one system, learn this. It unifies the whole frame and is the source of the
"everything melts into the sky" atmosphere.

**Render the sky dome to a small texture, then reuse it three ways.** `Sky.js`:

```js
this.customRender.resolutionRatio = 0.35    // 35% res: cheap, but toon cloud edges survive upscale
this.customRender.renderTarget = new THREE.WebGLRenderTarget(w * 0.35, h * 0.35, { generateMipmaps: false })
this.customRender.texture = this.customRender.renderTarget.texture
```

- The **sky sphere, clouds, and aurora** are added to `customRender.scene` (a *separate*
  scene), not the main scene. They render into this 35%-res target every frame with a clone
  of the main camera (orientation + projection copied; position ignored, the dome is at ∞).
- Because clouds/aurora live in that texture, they **tint the fog for free** and occlude
  each other correctly (aurora `renderOrder 1`, clouds `renderOrder 2`).

**Reuse #1 — the visible background:** a full-screen `2×2` plane
(`SkyBackgroundMaterial`, `depthTest/Write:false`, `frustumCulled:false`) blits that texture
behind everything.

**Reuse #2 — the fog color, per pixel, in screen space:** the texture is wired into every
world material's `uFogTexture`. `getFogColor` (§4) samples it at the fragment's screen UV,
so a distant hill fades into the *exact sky pixel behind it* — blue by day, orange at dawn,
dark at night, grey in a storm, greenish under an aurora. No fog color constant exists.

**Reuse #3 — sun shafts** ray-march this same texture toward the sun (§9).

**Update order is load-bearing** (`View.update()`):
1. `camera.update()` — pose must be current.
2. `sky.update()` — re-render the dome into the fog target *for this camera orientation*.
3. world/entities update (they now sample a correctly-aligned fog texture).
4. `renderer.update()` — the single main-scene draw, last.

**The sky sphere gradient** (`skySphere/vertex.glsl`) is a per-vertex two-color vertical
gradient (`mix(high, low, horizonIntensity)` where `horizonIntensity = pow(1 - y, 10)` — the
`pow 10` compresses the bright horizon into a thin punchy band), blended day↔night by
`abs(progress-0.5)`, plus an additive directional **dawn wash** placed at the sun's azimuth.
The **toon sun halo** is in the fragment shader — a smooth radial glow posterized into two
hard rings via two 0.03-wide `smoothstep`s (`0.72→0.75` and `1.1→1.15`).

---

## 9. Celestial & weather VFX

All of these apply the same posterization playbook (`step` / narrow `smoothstep`), and all
are gated/tinted by `uSunPosition.y` and weather. Files in
`View/Materials/shaders/{clouds,moon,stars,aurora,rainbow,sunShafts,rain}/`.

- **Clouds** — 2-octave FBM through a **0.015-wide** `smoothstep` → chunky puffs with
  near-hard rims; a second vertically-offset sample fakes a lit top vs. shaded underside
  (two-tone flat shading); a `step(0.5, sunGlow)` binary rim for the sun-lit edge. Planar
  projection `direction.xz / (direction.y + 0.6)` keeps overhead puffs stable.
- **Sun disc** — just a white `MeshBasicMaterial` circle; the *glow* is the baked sky-halo.
- **Sun shafts** — a fullscreen **additive** quad (`renderOrder 999`, `depthTest:false`)
  that marches 20 taps of the sky texture toward the sun; bright warm texels add light,
  cloud texels carve gaps (crepuscular rays for free). Output posterized into 3 hard bands.
  Gated to low-but-up sun, facing the sun, not raining.
- **Moon** — everything is `step()`: hard disc, a bitten-out circle for the crescent phase,
  a darker rim band at the terminator, two stepped halo rings. Positioned opposite the sun.
- **Stars** — 1000 `THREE.Points`; size distribution `pow(rand*0.9, 10)+0.1` (mostly tiny,
  rare big); restrained palette (65% blue-white, 30% warm-white, 5% gold/red — full-hue
  confetti "reads as fairy lights, not stars"); only ~30% twinkle; shrink near the sun.
- **Aurora** — sparse bright curtain pillars + dark gaps (a faint veil "just reads as grey
  haze"), height-mapped color ramp pink→green→emerald→magenta, **NormalBlending not
  additive** (additive over the bright night-blue horizon washes all hues to cyan).
- **Rainbow** — 6 flat `step()` bands of *pastel* RGB; triggered only when rain stops while
  the sun is up (`sun.y > 0.05`) — a reward. Timeline: fade-in 2s, hold 18s, fade-out 4s.
- **Rain** — 500 world-anchored `THREE.Points` that wrap in a box around the player;
  screen-aligned hard rectangular streaks via two `step()`s; drops pop in one-by-one as
  intensity rises (`if(aPhase > uIntensity) cull`). Intensity is a smoothstep envelope;
  lightning is a double-spike `exp` decay driving `uFlash` in the sky/cloud shaders; thunder
  is scheduled on the *game clock*, never `setTimeout`, so pauses stay coherent.

---

## 10. Day-cycle & the single sun driver

`State/DayCycle.js` is the master clock; `State/Sun.js` converts its `progress` into a unit
sun direction consumed everywhere as `uSunPosition`.

```js
// DayCycle: progress ∈ [0,1)  →  0 = midday, 0.25 = sunset, 0.5 = midnight, 0.75 = sunrise
this.duration = 360                 // seconds per day
this.goldenHourStretch = 0.6        // sine time-warp: dawn/dusk linger, noon/midnight rush
this.progress = (linear + (0.6 / (Math.PI*4)) * Math.sin(Math.PI*4 * linear)) % 1
```

```js
// Sun: shallow oblique arc, never straight overhead → flatter, more stylized light
const angle = -(progress + 0.25) * Math.PI * 2
this.phi   = (Math.sin(angle) * 0.3 + 0.5) * Math.PI   // elevation rides 0.2π–0.8π
this.theta = (Math.cos(angle) * 0.3 + 0.5) * Math.PI   // azimuth swings ±0.3π
position.y = Math.cos(this.phi)                          // THE universal driver
```

`uSunPosition.y` then drives: sky day/night mix, `getTimeOfDayColor` golden/night grades,
`nightness` (moon/stars/aurora fade-in), cloud lighting, wet-sand gloss, ribbon brightness,
sun-shaft gate. **Wire any new time-sensitive effect to `uSunPosition.y`** so it stays
consistent with the rest of the world instead of inventing its own clock.

---

## 11. Grass: an infinite billboard field

`Grass.js` + `shaders/grass/*`. A single static geometry of **40,000 one-triangle blades**
(not `InstancedMesh`), drawn as a fixed grid **centered on the player that wraps infinitely**
in the vertex shader:

```glsl
newCenter -= uPlayerPosition.xz;
newCenter.x = mod(newCenter.x + halfSize, uGrassDistance) - halfSize;  // recycle across the player
```

Each blade **yaws to face the camera** about its center pivot (`getRotatePivot2d` +
`atan(center - cameraPosition)`), reads the ground normal/elevation from the terrain data
textures (§6), and is **collapsed to a point** (`mix(center, position, scale)`) as it fades
by distance/slope/biome — so culled blades shrink instead of popping. Wind is the shared
noise-texture scroll, applied only to the **tip** vertex (`tipness = step(2, mod(gl_VertexID+1, 3))`),
plus a player push-away. **All shading is per-vertex**; the fragment shader is literally
`gl_FragColor = vec4(vColor, 1.0);`.

---

## 12. Props & the ink-outline (inverted hull)

`PropsGeometry.js` builds low-poly, vertex-colored, faceted palms/conifers/boulders, each
vertex tagged with a `sway` attribute (0 root → 1 tip) for stiff, tip-only wind.
`PropsLayer.js` places them as `InstancedMesh`es with **deterministic** `seedrandom`
placement (`seed + layer + world-row`, always drawing a fixed 8 randoms per candidate so
skips don't shift the stream) — props never pop or move when chunks re-LOD.

**The ink outline** is the classic **inverted-hull** technique, done efficiently:

```js
// A second InstancedMesh, same geometry, SHARING the prop's instanceMatrix buffer:
this.outlineMesh = new THREE.InstancedMesh(geometry, outlineMaterial, capacity)
this.outlineMesh.instanceMatrix = this.mesh.instanceMatrix     // zero extra CPU upkeep
```

```glsl
// PropsOutlineMaterial is side: THREE.BackSide. Vertex shader inflates along the normal:
vec3 displaced = position + normal * uThickness;               // object-space → scales per instance
```

Only **back faces** are drawn, so the inflated shell shows only where it pokes past the
prop's silhouette → a uniform dark rim (`#1c1713`). Two refinements:

1. **Wind sync** — the outline re-runs the prop's *exact* wind sway so the ink tracks it.
2. **Open-strip collapse** — inverted hulls artifact on single-sided geometry (palm
   fronds), so `if(sway > uSwayCollapse) gl_Position = vec4(2.0);` degenerates those
   triangles offscreen. Solid props use `swayCollapse = 999` (never collapse).

The outline fragment shader fogs the ink (`getFogColor`) so distant outlines melt into haze
rather than staying harsh black dots.

---

## 13. Particles, sparkles, fireflies: SDF glyphs in points

All three are `THREE.Points` clouds that draw **hand-written signed-distance glyphs in
`gl_PointCoord`** — no textures. All size by `viewportHeight * pixelRatio / -viewPosition.z`
for perspective, and clip dead points by writing `gl_Position = vec4(2.0, 2.0, 2.0, 1.0)`.

- **Particles** (`Particles.js`) — a **512-point ring buffer** shared by every emitter
  (jump/land/roll/splash/spray/wind-curl). Type is a float attribute branched with `step()`;
  motion blends drift / ballistic-gravity / straight models; rotation is screen-aligned to
  velocity. Glyphs are hard-edged (only the in/out is a short temporal fade): wind streaks,
  spray/sand puffs, and the signature **Wind-Waker spiral curl** (`step(fract(theta/2π + r*6 - t), 0.24)`).
- **Sparkles** (`Sparkles.js`) — 48 additive points on the wet-sand band; pop size is
  **quantized to 3 steps** (`floor(scale*3+0.5)/3`); glyph is a hard **4-point star** — the
  treasure "ting." Gated to golden hour + dim moonlit night, killed by rain.
- **Fireflies** (`Fireflies.js`) — 80 additive warm points, night-only, crisp core dot +
  dim halo + breathing flicker. The *same material* is reused for campfire embers.

---

## 14. Fire, glow, lanterns

- **Flame** (`FlameMaterial.js` + `shaders/flame/*`) — **three fixed crossed cutout planes**
  merged into one buffer (volumetric from any angle, one draw call, no billboarding).
  **Opaque with `discard`** for the silhouette (additive is reserved for glow/embers). The
  fragment is a signed-distance **teardrop** with animated "billow" bumps (the bumps
  translate; the silhouette formula never morphs) and **3 hard color bands** via `step`
  (`#d84c15` → `#ff9b2f` → `#ffe28a`), plus swirling WW spiral curls.
- **Campfire glow** (`CampfireGlowMaterial`) — a ground disc, additive, **two flat stepped
  rings** whose radius breathes (`d *= 1 + 0.06*sin(t)`). Deliberately no gradient.
- **Lanterns** (`Lanterns.js`) — sky-lantern `THREE.Points` released from fires at night;
  a paper-lantern glyph (plump ellipse body, bright low core, dim cap) built from
  `smoothstep` bands; slow rise + pendulum sway on the CPU.

---

## 15. Creatures: procedural animation over rigs

Seagulls, fish, crabs, and ghost-players all use **unlit `MeshBasicMaterial` with
`vertexColors: true`** — pure flat low-poly, day/night faked by driving `material.color` on
the CPU. **No skeletal animation anywhere.**

- **Seagulls** — code-authored geometry (5-sided cone body; each wing a swept 2-quad strip
  with a hard white→black seam made by *duplicating* mid-vertices so color can't
  interpolate across it). Three `InstancedMesh`es (body + 2 wings), pre-mirrored left wing
  (negative scale would flip winding). Flight is honest procedural physics: orbit a
  player-following anchor, **bank from finite-difference of actual motion**, sine wing-flap
  with occasional frozen glides.
- **Fish** — 4-sided cone darts, vertex-painted dark back over pale belly by `y > 0`;
  ballistic jump arc, `sin()` body wiggle, spray particles on entry/exit.
- **Crabs** — one merged vertex-colored body; **all locomotion faked on the whole body**
  (waddle bob, hop, roll wobble — no leg animation); a small pause/scuttle/flee state
  machine; runs sideways.
- **Ghosts** (other players) — the same faceted 8-sided cone as the player, translucent;
  idle spin, squash-and-stretch hop; emoji reactions are **billboard `THREE.Sprite`s** with
  per-emoji `CanvasTexture`s drawn via 2D-canvas `fillText`.

The lesson: *character comes from motion math on the transform, not from shaders or rigs.*

---

## 16. Player, ribbon, cyclones

- **Player wisp** — a faceted 8-sided `ConeGeometry(0.7, 1.8, 8).toNonIndexed()` +
  `computeVertexNormals()`. Its shader is the minimal toon surface: flat `uColor` +
  `getSunShade`/`getSunShadeColor`, nothing else. All expressiveness is **procedural
  rigging on the transform**: idle bob/breathe, speed-blended spin, lean-into-travel,
  eased 360° **barrel roll** (quaternion premultiply), and **squash-and-stretch** on
  jump/land/bounce (decays exponentially). A "flow glow" brightens `uColor` as flow builds.
- **Ribbon/scarf** — a CPU **verlet-ish rope** (28 samples, distance-constrained, 2
  relaxation passes, flutter + gravity droop, pushed outside the player's body cylinder),
  rebuilt each frame into a tapered triangle strip. Shader is the simplest in the repo:
  flat color × a day/night brightness lerp.
- **Cyclones** — two nested open tapered-cylinder shells, counter-spun on the CPU, with the
  hard-stepped **diagonal band** language: `step(0.55, fract(vUv.x*3 - vUv.y*5 + t*speed))`
  tapering/dissolving toward the top.

---

## 17. Performance techniques

- **Cap DPR at 2** (`Viewport.clampedPixelRatio`).
- **Render the sky at 0.35× resolution** and reuse it as background + fog + shaft source —
  one cheap dome render does three jobs.
- **Bake terrain height/normals on a Web Worker** into float textures; the main thread only
  uploads and samples them (§6).
- **Deterministic instanced placement** so chunks re-LOD without re-randomizing (no popping,
  and cache-friendly).
- **Ring-buffer / fixed-pool particles** (512 particles, 24 embers, 20 lanterns, 48
  sparkles, 80 fireflies) — allocate once, recycle forever, cull by writing offscreen NDC.
- **Shader prewarm at load** (`View.prewarmShaders()`): temporarily make every hidden object
  visible, call `renderer.compile(scene, camera)` once, then restore visibility — trades a
  longer load for zero first-appearance hitches (fireflies, shafts, flames, cyclones).
- **Per-vertex shading** for dense meshes (grass, props) so the fragment shader is trivial.
- **Share instanceMatrix buffers** between a mesh and its outline (§12).
- **`generateMipmaps: false`** on render targets sampled ~1:1; `RepeatWrapping` + *periodic*
  Perlin for the tiling noise grain.

---

## 18. Headless testing of a graphics project

You can't screenshot in CI easily, but you *can* test the deterministic `State/` layer.
`tests/headless/*.mjs` run the **real State layer with the real terrain worker executed
synchronously in-process**, under a fixed timestep, with tiny browser-global stubs:

```js
globalThis.window = { addEventListener(){}, innerWidth:1280, innerHeight:720, devicePixelRatio:2 }
globalThis.document = { addEventListener(){}, pointerLockElement:null }
Debug.instance = { active:false }
Game.instance  = { seed:'p', debug:Debug.instance }
const state = new State()
state.time.update = function(){ this.delta = 1/60; this.elapsed += 1/60 }   // fixed step
```

This is why State never imports THREE: it stays headlessly testable. When you add
gameplay/physics, keep it in `State/` and add a fixed-step verification like
`verify.mjs`/`cyclones.mjs`. Pure-visual changes are verified by running the app
(`npm run dev`) and eyeballing at several times of day (`#debug` GUI has sunrise/midday/
sunset/midnight jump buttons).

---

## 19. Cookbook: add a new toon material

A step-by-step that keeps you inside the style.

1. **Copy a sibling.** For an opaque surface, start from `PropsMaterial` + `props/*.glsl`.
   For a light/glow, start from `SparklesMaterial` or `CampfireGlowMaterial`. For a sky
   element, start from `CloudsMaterial`.

2. **Make a factory** in `Materials/YourMaterial.js` that returns a `THREE.ShaderMaterial`,
   importing `.glsl` files. Put every tunable as a uniform here. If it's transparent glow,
   `transparent:true, depthWrite:false, blending: THREE.AdditiveBlending`. If it needs flat
   facets from derivatives, add `extensions: { derivatives: true }`.

3. **Author colors WYSIWYG** (Rule #2) — the hex you type is what ships.

4. **Run the surface chain** (§4) for anything lit:
   `getTimeOfDayColor → getSunShadeColor(getSunShade) → [getSunReflectionColor] → getFogColor`.
   Wire `uSunPosition`, `uFogTexture` (from `view.sky.customRender.texture`), and — if you
   want time reactivity — read `uSunPosition.y`.

5. **Posterize** any gradient you introduce with `step()` or a 0.01–0.05-wide `smoothstep()`
   (Rule #4). Ask: "would this look drawn, or rendered?"

6. **Animate procedurally** with `uTime` (sines, noise-texture scroll) or CPU pools; ease
   with `1 - exp(-rate·dt)`.

7. **Register the View system:** construct it in `View.js` in dependency order (after
   `camera`, `renderer`, `noises`, `sky`), tick it in `View.update()` *before*
   `renderer.update()`, and fan out `resize()` if it owns a render target.

8. **Expose debug uniforms** in a `lil-gui` folder so the numbers can be tuned live.

9. **Feed the fog:** set `material.uniforms.uFogTexture.value = this.view.sky.customRender.texture`
   at setup, and sample it in screen space so your object melts into the horizon.

---

## 20. Pitfalls & gotchas

- **Don't enable color management / tone mapping** to "fix" colors — it re-grades the entire
  project (Rule #2 / §3). If you truly need it, you must re-tune every palette.
- **Don't reach for `MeshStandardMaterial` / lights.** There are no lights in the scene; a
  PBR material will render black or wrong. Use a `ShaderMaterial` or unlit `MeshBasic`.
- **Step in the fragment, interpolate in the vertex.** For hard toon edges on per-vertex
  data (wet sand, foam), pass a *smooth* varying and `step()` it in the fragment. `step()`
  in the vertex shader smears across the triangle.
- **Inverted-hull outlines need closed geometry.** Open strips (planes) balloon into visible
  shells — collapse those triangles (`sway`/`swayCollapse` trick) or skip them.
- **Additive over bright backgrounds washes to white/cyan.** The aurora uses NormalBlending
  for exactly this reason. Pick blending by what's *behind* the effect.
- **Keep the sky update before its consumers.** If you re-render the fog target after world
  materials sample it, fog will lag the camera by a frame and smear.
- **Never `setTimeout` for game events.** Schedule on the game clock (`state.time`) so pause
  and variable frame-rate stay coherent (see `Weather.js` thunder).
- **Keep placement deterministic.** If new instanced scatter uses `Math.random()` per frame,
  props will shimmer/pop as chunks rebuild. Seed it and draw a fixed number of randoms.
- **Three is pinned to r149.** APIs like `outputColorSpace` vs `outputEncoding` differ across
  versions; don't bump three casually — the color pipeline assumptions depend on it.

---

## 21. Quick-reference tables

**Renderer / camera**

| Setting | Value | Note |
| --- | --- | --- |
| WebGLRenderer | `alpha:false, antialias:true` | MSAA is the only AA; no post stack. |
| Clear color | `#222222` | almost never visible (sky plane covers all). |
| Color mgmt / tone mapping | **off** | WYSIWYG colors. Do not enable. |
| Pixel ratio | `min(DPR, 2)` | perf cap. |
| Camera | `PerspectiveCamera(45→63, aspect, 0.1, 5000)`, `YXZ` | FOV widens with speed. |
| Sky render target | `0.35×` resolution, no mipmaps | background + fog + shafts. |
| Fog falloff | `1 - exp(-(0.0025·depth)²)` | screen-space sample of sky texture. |

**Core palette**

| Element | Colors |
| --- | --- |
| Sky day | zenith `#2e89ff`, horizon `#f0fff9` |
| Sky night | zenith `#001624`, horizon `#004794` |
| Dawn / sun halo | `#ff7038` / `#ffa54a` |
| Water | deep `#1e4f9c`, shallow `#3ba7c0`, foam `#e8f0ee` |
| Shadow tint (multiply) | `vec3(0.0, 0.5, 0.7)` |
| Golden grade / night grade | `vec3(0.70,0.52,0.22)` / `vec3(0.12,0.18,0.24)` |
| Ink outline | `#1c1713` |
| Flame bands | `#d84c15` → `#ff9b2f` → `#ffe28a` |

**Posterization cheatsheet**

| Look | Technique |
| --- | --- |
| Hard edge | `step(threshold, x)` |
| Near-hard edge | `smoothstep(a, a+0.02, x)` (0.01–0.05 wide) |
| N flat bands | `floor(x * N + 0.5) / N` |
| Two-band glow | `smoothstep(0.72,0.75,g)*0.3 + smoothstep(1.1,1.15,g)*0.7` |
| Toon shadow | `mix(c, c*vec3(0,0.5,0.7), dot(N,-sun)*0.5+0.5)` |
| Flat facets | `toNonIndexed()` + `computeVertexNormals()`, or `cross(dFdx,dFdy)` |

**Where things live**

| System | Files |
| --- | --- |
| Shared shading | `View/Materials/shaders/partials/*` |
| Renderer / camera | `View/Renderer.js`, `View/Camera.js`, `State/Camera*.js` |
| Sky / fog / celestial | `View/Sky.js`, `SunShafts.js`, `Rainbow.js`, `shaders/{skySphere,skyBackground,clouds,moon,stars,aurora,rainbow,sunShafts}/*` |
| Clock / weather | `State/DayCycle.js`, `State/Sun.js`, `State/Weather.js`, `State/WaveSets.js` |
| Terrain | `Workers/Terrain.js`, `View/Terrain*.js`, `Materials/TerrainMaterial.js`, `shaders/terrain/*` |
| Water | `View/Water.js`, `Materials/WaterMaterial.js`, `shaders/water/*` |
| Grass | `View/Grass.js`, `Materials/GrassMaterial.js`, `shaders/grass/*` |
| Props + outline | `View/Props*.js`, `Materials/Props{,Outline}Material.js`, `shaders/{props,propsOutline}/*` |
| Particles/light | `View/{Particles,Sparkles,Fireflies,Campfires,Lanterns}.js` + matching shaders |
| Creatures | `View/{Seagulls,Fish,Crabs,Ghosts}.js` |
| Player/ribbon/cyclone | `View/{Player,Ribbon,Cyclones}.js`, `shaders/{player,ribbon,cyclone}/*` |

---

*Written for AI agents extending WaitingFor.AI. The style is intentional and
self-consistent — when adding to it, imitate a neighbor, posterize your gradients, tint your
shadows blue, and let everything fade into the sky.*
