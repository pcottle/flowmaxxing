# Building the Toon Beach — A From-Scratch Three.js Implementation Guide

This guide tells you, an AI coding agent, how to build the **initial beach vibe** of
*WaitingFor.AI* on a clean slate: an endless, procedurally generated coastline in a
**Wind Waker / toon cel-shaded** style, with **breaking waves and foam**, **swaying
palm trees with ink outlines**, and a full **day-to-night cycle** whose light and color
wash over everything.

You do **not** need the original repo to follow this. Every number, color, and shader
here is faithful to the real project (which is a fork of Bruno Simon's *infinite-world*).
The gameplay, multiplayer, audio, weather, and the full quad-tree LOD engine are
deliberately **out of scope** — this guide reproduces the *look and feel*, not the game.
Where the real project uses a heavier mechanism (a Web Worker terrain, a 1-D shore data
texture, a CPU wave simulation shared across systems), this guide gives you a simpler,
self-contained equivalent that produces the same picture, and calls out the difference so
you know what you traded away.

Build it in the phases below **in order**. Each phase ends at a runnable checkpoint so you
can see the vibe accrete: flat sky → lit terrain → moving water → palms → day/night.

---

## Table of contents

0. [The mental model (read this first)](#0-the-mental-model)
1. [Project setup](#1-project-setup)
2. [The game loop: State / View split](#2-the-game-loop)
3. [The toon shading kit (shared GLSL partials)](#3-the-toon-shading-kit)
4. [Sky, sun, and the day cycle](#4-sky-sun-and-the-day-cycle)
5. [The beach terrain](#5-the-beach-terrain)
6. [The ocean: waves and foam](#6-the-ocean)
7. [Palm trees and props](#7-palm-trees-and-props)
8. [The camera](#8-the-camera)
9. [Wiring it together + tuning reference](#9-wiring--tuning)
10. [Optional extras (clouds, stars, grass, mobile)](#10-optional-extras)

---

## 0. The mental model

Five ideas carry the entire aesthetic. Keep them in mind and every shader below will make
sense.

**A. Everything is authored in linear 0–1 RGB and stays flat-lit.** There are no textures,
no PBR, no image maps. Surfaces get a single flat base color (per-vertex for props/terrain,
per-uniform for water) and then one cheap shade term. The "toon" feeling is **flat color +
a strongly-tinted shadow + hard `step()` edges**, not stepped lighting ramps.

**B. One shade model, shared everywhere.** A half-Lambert term `dot(normal,-sun)*0.5+0.5`
drives a `mix` from the base color toward `baseColor * vec3(0.0, 0.5, 0.7)` — a cyan/teal
shadow that kills red, halves green, keeps blue. That teal shadow is the single most
recognizable part of the look.

**C. The sun vector is the master clock.** A day-cycle scalar `progress ∈ [0,1)` produces a
unit **sun direction** `uSunPosition`. Its `.y` (sun height) drives *all* time-of-day color:
warm amber at golden hour, cold blue at night. Every material calls the same
`getTimeOfDayColor()` partial, so the whole world shifts hue together.

**D. Fog is a screenshot of the sky.** The sky is rendered once per frame into a small
offscreen texture. Every other material samples *that texture at its own screen-space UV*
as its fog color. So distant terrain, water, and ink outlines dissolve into the exact sky
gradient (and clouds, and sunset band) behind them — for free, with zero color bookkeeping.

**E. The world is a treadmill.** Nothing is truly infinite. The terrain, water, and sky
recenter on the moving focus point every frame (or when it crosses a grid cell), and their
geometry is a pure function of world XZ. You glide; the world is regenerated under you.

Coordinate convention (matches the original): **forward is −Z**, the **ocean is toward +X**
(right), the **land/hills are toward −X** (left), and **sea level is `y = 0`**.

---

## 1. Project setup

Use Vite + Three.js `0.149` + `vite-plugin-glsl` (so shaders can `#include` partials) +
`simplex-noise` (terrain height). Node 18+.

```
beach/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.js
    ├── Game.js
    ├── State/
    │   ├── State.js
    │   ├── Time.js
    │   ├── DayCycle.js
    │   ├── Sun.js
    │   └── Focus.js
    └── View/
        ├── View.js
        ├── Renderer.js
        ├── Camera.js
        ├── Noises.js
        ├── Sky.js
        ├── Terrain.js
        ├── Water.js
        ├── Props.js
        └── materials/
            ├── SkySphereMaterial.js
            ├── SkyBackgroundMaterial.js
            ├── TerrainMaterial.js
            ├── WaterMaterial.js
            ├── PropsMaterial.js
            ├── PropsOutlineMaterial.js
            └── shaders/
                ├── partials/ …
                ├── skySphere/ …
                ├── skyBackground/ …
                ├── terrain/ …
                ├── water/ …
                ├── props/ …
                └── propsOutline/ …
```

**package.json**

```json
{
  "name": "toon-beach",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": {
    "seedrandom": "^3.0.5",
    "simplex-noise": "^4.0.0",
    "three": "^0.149.0"
  },
  "devDependencies": {
    "vite": "^4.1.0",
    "vite-plugin-glsl": "^1.1.2"
  }
}
```

**vite.config.js**

```js
import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  base: './',
  plugins: [glsl({ watch: true })],
  server: { host: true, open: true }
})
```

`vite-plugin-glsl` resolves `#include ../partials/foo.glsl;` inside `.glsl` files at build
time (note the trailing `;` the original uses is harmless — the plugin strips the line).

**index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Toon Beach</title>
    <style>
      html, body { margin: 0; height: 100%; background: #222; overflow: hidden; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
```

**src/main.js**

```js
import Game from './Game.js'
new Game()
```

Checkpoint: `npm install && npm run dev` should open a black page. Now we give it a world.

---

## 2. The game loop

The architecture separates **State** (headless simulation — time, sun, day cycle, the moving
focus point; no Three.js) from **View** (everything that touches Three.js — meshes,
materials, the renderer). Each frame: `state.update()` then `view.update()`. This split is
what lets the sun/day math be shared cleanly into every material, and keeps the door open
for a worker or a fixed-timestep sim later.

Both `State` and `View` are singletons reachable via `getInstance()` so any subsystem can
read the shared clock and sun without prop-drilling.

**src/Game.js**

```js
import State from './State/State.js'
import View from './View/View.js'

export default class Game {
  static instance
  static getInstance() { return Game.instance }

  constructor() {
    if (Game.instance) return Game.instance
    Game.instance = this
    window.game = this

    this.seed = 'beach'
    this.state = new State()
    this.view = new View()

    window.addEventListener('resize', () => this.resize())
    this.update()
  }

  update() {
    this.state.update()
    this.view.update()
    window.requestAnimationFrame(() => this.update())
  }

  resize() {
    this.state.resize()
    this.view.resize()
  }
}
```

**src/State/Time.js** — a real-wall-clock timer. `delta` is clamped so a stalled/hidden tab
doesn't produce a huge jump when it resumes.

```js
export default class Time {
  constructor() {
    this.start = Date.now() / 1000
    this.current = this.start
    this.elapsed = 0
    this.delta = 16 / 1000
  }
  update() {
    const current = Date.now() / 1000
    this.delta = Math.min(current - this.current, 60 / 1000)
    this.elapsed += this.delta
    this.current = current
  }
}
```

**src/State/Focus.js** — this is your stand-in for "the player." It is a point that drifts
forward (−Z) at a gentle glide speed so the world scrolls and feels alive. Water, terrain,
sky, and props all follow it; the camera frames it. Expose `position` as a 3-element array
`[x,y,z]` to mirror the original's `player.position.current`.

```js
export default class Focus {
  constructor() {
    this.position = [0, 0, 0]      // [x, y, z], world units
    this.glideSpeed = 6            // metres/second down the coast (−Z)
  }
  update(delta) {
    this.position[2] -= this.glideSpeed * delta   // forward is −Z
    // y is only used for the sky group offset; keep it near sea level
    this.position[1] = 0
  }
}
```

**src/State/State.js**

```js
import Time from './Time.js'
import DayCycle from './DayCycle.js'
import Sun from './Sun.js'
import Focus from './Focus.js'

export default class State {
  static instance
  static getInstance() { return State.instance }

  constructor() {
    if (State.instance) return State.instance
    State.instance = this

    this.time = new Time()
    this.day = new DayCycle()
    this.sun = new Sun()
    this.focus = new Focus()
  }

  resize() {}

  update() {
    this.time.update()
    this.day.update()
    this.sun.update()
    this.focus.update(this.time.delta)
  }
}
```

`DayCycle` and `Sun` are written in Phase 4. **View** and its subsystems come online phase
by phase; start with a minimal `View` that only has a renderer + camera, and add fields as
you build them.

**src/View/Renderer.js**

```js
import * as THREE from 'three'
import State from '../State/State.js'
import View from './View.js'

export default class Renderer {
  constructor() {
    this.state = State.getInstance()
    this.view = View.getInstance()

    this.clearColor = '#222222'   // matches the CSS background so first paint is seamless
    this.instance = new THREE.WebGLRenderer({ alpha: false, antialias: true })
    this.instance.setClearColor(this.clearColor, 1)
    this.instance.setSize(window.innerWidth, window.innerHeight)
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    document.body.appendChild(this.instance.domElement)
  }

  resize() {
    this.instance.setSize(window.innerWidth, window.innerHeight)
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  }

  update() {
    this.instance.render(this.view.scene, this.view.camera.instance)
  }
}
```

Note: the renderer uses **default (linear) output** — no `sRGBEncoding`, no tone mapping.
The colors below are hand-tuned for that. If you enable color management you must re-tune
every palette, so leave it off to match the vibe.

**src/View/View.js** (grow this as you add subsystems)

```js
import * as THREE from 'three'
import Camera from './Camera.js'
import Renderer from './Renderer.js'
// import Noises from './Noises.js'
// import Sky from './Sky.js'
// import Terrain from './Terrain.js'
// import Water from './Water.js'
// import Props from './Props.js'

export default class View {
  static instance
  static getInstance() { return View.instance }

  constructor() {
    if (View.instance) return View.instance
    View.instance = this

    this.scene = new THREE.Scene()
    this.camera = new Camera()
    this.renderer = new Renderer()
    // this.noises = new Noises()
    // this.sky = new Sky()
    // this.terrain = new Terrain()
    // this.water = new Water()
    // this.props = new Props()
  }

  resize() {
    this.camera.resize()
    this.renderer.resize()
    // this.sky.resize()
  }

  update() {
    this.camera.update()
    // this.sky.update()
    // this.terrain.update()
    // this.water.update()
    // this.props.update()
    this.renderer.update()   // renderer LAST
  }
}
```

The camera is defined in Phase 8, but stub a trivial one now so the loop runs: a
`PerspectiveCamera(45, aspect, 0.1, 5000)` at `(0, 20, 40)` looking at the origin, with
`resize()`/`update()` no-ops. Checkpoint: you should see a `#222` frame that survives
resize.

---

## 3. The toon shading kit

These small GLSL partials live in `src/View/materials/shaders/partials/` and are `#include`d
by every world material. **Copy them verbatim** — they are the shared vocabulary of the
look. Each material declares the `uniform`s a partial needs (e.g. `uSunPosition`,
`uFogTexture`).

**partials/inverseLerp.glsl**

```glsl
float inverseLerp(float v, float minValue, float maxValue)
{
    return (v - minValue) / (maxValue - minValue);
}
```

**partials/remap.glsl**

```glsl
float remap(float v, float inMin, float inMax, float outMin, float outMax)
{
    float t = inverseLerp(v, inMin, inMax);
    return mix(outMin, outMax, t);
}
```

**partials/getSunShade.glsl** — half-Lambert. `sunShade = 1` means facing *away* from the
sun (in shadow), `0` means fully lit. Note it uses `-uSunPosition` as the light direction
(the sun *position* points from the scene toward the sun; light travels the other way).

```glsl
float getSunShade(vec3 normal)
{
    float sunShade = dot(normal, - uSunPosition);
    sunShade = sunShade * 0.5 + 0.5;

    return sunShade;
}
```

**partials/getSunShadeColor.glsl** — the entire cel tint. This one function is the soul of
the aesthetic.

```glsl
vec3 getSunShadeColor(vec3 baseColor, float sunShade)
{
    vec3 shadeColor = baseColor * vec3(0.0, 0.5, 0.7);
    return mix(baseColor, shadeColor, sunShade);
}
```

**partials/getSunReflection.glsl** — a fresnel-modulated specular strength (used by terrain
and water for glints).

```glsl
float getSunReflection(vec3 viewDirection, vec3 worldNormal, vec3 viewNormal)
{
    vec3 sunViewReflection = reflect(uSunPosition, viewNormal);
    float sunViewStrength = max(0.2, dot(sunViewReflection, viewDirection));

    float fresnel = uFresnelOffset + uFresnelScale * (1.0 + dot(viewDirection, worldNormal));
    float sunReflection = fresnel * sunViewStrength;
    sunReflection = pow(sunReflection, uFresnelPower);

    return sunReflection;
}
```

**partials/getSunReflectionColor.glsl**

```glsl
vec3 getSunReflectionColor(vec3 baseColor, float sunReflection)
{
    return mix(baseColor, vec3(1.0, 1.0, 1.0), clamp(sunReflection, 0.0, 1.0));
}
```

**partials/getTimeOfDayColor.glsl** — the global time-of-day wash, keyed purely on sun
height `uSunPosition.y`. Warm amber near the horizon on the day side; cold desaturated blue
at night. Apply this to a base color **before** `getSunShade`.

```glsl
vec3 getTimeOfDayColor(vec3 baseColor)
{
    float sunY = uSunPosition.y;

    // Golden hour: sun near the horizon on the day side
    float golden = smoothstep(0.35, 0.05, abs(sunY)) * smoothstep(- 0.15, 0.05, sunY);
    vec3 color = mix(baseColor, vec3(0.70, 0.52, 0.22), golden * 0.7);

    // Night: cooler and desaturated (sun shading darkens further)
    float night = smoothstep(0.05, - 0.25, sunY);
    color = mix(color, vec3(0.12, 0.18, 0.24), night * 0.5);

    return color;
}
```

**partials/getFogColor.glsl** — depth fog whose *color is sampled from the sky render
target* at the fragment's own screen UV. This is idea **D**. `depth` is view-space depth
(`-viewPosition.z`); `screenUv` is `(clip.xy / clip.w) * 0.5 + 0.5`.

```glsl
vec3 getFogColor(vec3 baseColor, float depth, vec2 screenUv)
{
    float uFogIntensity = 0.0025;
    vec3 fogColor = texture2D(uFogTexture, screenUv).rgb;

    float fogIntensity = 1.0 - exp(- uFogIntensity * uFogIntensity * depth * depth);
    return mix(baseColor, fogColor, fogIntensity);
}
```

**partials/getWaveBump.glsl** — an asymmetric gaussian used by the ocean for breaking waves:
a bump with a steeper shoreward face than back face, plus its analytic slope (used to mask
crest foam).

```glsl
// Breaking-wave bump: asymmetric gaussian with a steep shoreward face.
// d = shore distance, front/amplitude/width/d0 describe the wave's current state.
// slope = dHeight/dDistance (for normals and crest-foam masks).
float getWaveBump(float d, float front, float amplitude, float width, float d0, out float slope)
{
    float dj = d - front;
    float w = width * mix(0.5, 1.0, front / d0);
    float wSide = w * mix(0.55, 1.45, smoothstep(- w, w, dj));
    float rel = dj / wSide;
    float height = amplitude * exp(- rel * rel);
    slope = - 2.0 * dj / (wSide * wSide) * height;

    return height;
}
```

That's the whole kit. Nothing here is stepped or quantized — the crisp toon edges come
later from `step()` on *masks* (wet sand, foam), not from banding the light.

---

## 4. Sky, sun, and the day cycle

This phase gives you a full day→night sky and, crucially, the **sky render target** that
feeds fog into everything else. Build this before terrain/water so their fog works from the
first frame.

### 4.1 The day cycle

**src/State/DayCycle.js** — a single scalar `progress ∈ [0,1)`. Phase map: **`0 = midday`,
`0.25 = sunset`, `0.5 = midnight`, `0.75 = sunrise`.** A full day is **360 real seconds**
(~6 min). A sine warp makes dawn/dusk linger and noon/midnight pass quickly, without
breaking monotonicity (the warp is zero at every quarter point, so the key moments land
exactly).

```js
import State from './State.js'

export default class DayCycle {
  constructor() {
    this.state = State.getInstance()

    // Random start: midday, sunrise, or sunset
    const starts = [0, 0.75, 0.25]
    this.timeProgress = starts[Math.floor(Math.random() * 3)]
    this.progress = this.timeProgress
    this.duration = 360           // seconds for a full cycle
    this.goldenHourStretch = 0.6  // 0 = linear time; <1 keeps progress monotonic
  }

  update() {
    const delta = this.state.time.delta
    this.timeProgress += delta / this.duration

    const linear = this.timeProgress % 1
    // sin(4π·p) is 0 at every quarter → dawn/dusk linger, noon/midnight rush
    this.progress = (linear
      + (this.goldenHourStretch / (Math.PI * 4)) * Math.sin(Math.PI * 4 * linear)) % 1
  }

  jumpTo(progress) {           // handy for debugging a specific time
    this.timeProgress = progress
    this.progress = progress
  }
}
```

### 4.2 The sun direction

**src/State/Sun.js** — turns `progress` into a **unit** sun direction. The arc is
deliberately shallow (amplitude `0.3`, bias `0.5`) so the sun never reaches the zenith or
pole; it traces a tilted path. `position.y` is the master "sun height" everything keys on.

```js
import State from './State.js'

export default class Sun {
  constructor() {
    this.state = State.getInstance()
    this.position = { x: 0, y: 0, z: 0 }
  }

  update() {
    const progress = this.state.day.progress

    const angle = - (progress + 0.25) * Math.PI * 2
    this.phi   = (Math.sin(angle) * 0.3 + 0.5) * Math.PI   // elevation angle
    this.theta = (Math.cos(angle) * 0.3 + 0.5) * Math.PI   // azimuth angle

    const sinPhiRadius = Math.sin(this.phi)
    this.position.x = sinPhiRadius * Math.sin(this.theta)
    this.position.y = Math.cos(this.phi)                    // + = day, − = night
    this.position.z = sinPhiRadius * Math.cos(this.theta)
  }
}
```

### 4.3 The sky dome shader

The sky is a `BackSide` sphere (radius 10) whose colors are computed **in the vertex
shader** and stored in `vColor`; the fragment shader just adds the posterized sun halo. It's
rendered into an offscreen target, then blitted to the screen by a fullscreen quad.

**materials/shaders/skySphere/vertex.glsl**

```glsl
#define M_PI 3.1415926535897932384626433832795

uniform vec3 uSunPosition;
uniform float uAtmosphereElevation;
uniform float uAtmospherePower;
uniform vec3 uColorDayCycleLow;
uniform vec3 uColorDayCycleHigh;
uniform vec3 uColorNightLow;
uniform vec3 uColorNightHigh;
uniform float uDawnAngleAmplitude;
uniform float uDawnElevationAmplitude;
uniform vec3 uColorDawn;
uniform float uDayCycleProgress;

varying vec3 vColor;
varying vec3 vSpherePosition;

vec3 blendAdd(vec3 base, vec3 blend) { return min(base + blend, vec3(1.0)); }
vec3 blendAdd(vec3 base, vec3 blend, float opacity) {
    return (blendAdd(base, blend) * opacity + base * (1.0 - opacity));
}

void main()
{
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    vec3 normalizedPosition = normalize(position);

    // Vertical gradient key: 0 at zenith → 1 at horizon
    float horizonIntensity = (uv.y - 0.5) / uAtmosphereElevation;
    horizonIntensity = pow(1.0 - horizonIntensity, uAtmospherePower);

    vec3 colorDayCycle = mix(uColorDayCycleHigh, uColorDayCycleLow, horizonIntensity);
    vec3 colorNight    = mix(uColorNightHigh,    uColorNightLow,    horizonIntensity);

    // Day↔night blend: triangular over phase (1 at midday, 0 at midnight)
    float dayIntensity = abs(uDayCycleProgress - 0.5) * 2.0;
    vec3 color = mix(colorNight, colorDayCycle, dayIntensity);

    // Dawn/dusk band: additive hot-orange near the sun's azimuth, low on the horizon,
    // gated to the two twilight phases (peaks at progress 0.25 and 0.75)
    float dawnAngleIntensity = dot(normalize(uSunPosition.xz), normalize(normalizedPosition.xz));
    dawnAngleIntensity = smoothstep(0.0, 1.0, (dawnAngleIntensity - (1.0 - uDawnAngleAmplitude)) / uDawnAngleAmplitude);
    float dawnElevationIntensity = 1.0 - min(1.0, (uv.y - 0.5) / uDawnElevationAmplitude);
    float dawnDayCycleIntensity = cos(uDayCycleProgress * 4.0 * M_PI + M_PI) * 0.5 + 0.5;
    float dawnIntensity = clamp(dawnAngleIntensity * dawnElevationIntensity * dawnDayCycleIntensity, 0.0, 1.0);
    color = blendAdd(color, uColorDawn, dawnIntensity);

    vColor = color;
    vSpherePosition = position;
}
```

**materials/shaders/skySphere/fragment.glsl** — adds the stepped ("posterized") toon sun
halo: two hard rings around the sun direction.

```glsl
uniform vec3 uSunPosition;
uniform float uSunAmplitude;
uniform float uSunMultiplier;
uniform vec3 uColorSun;

varying vec3 vColor;
varying vec3 vSpherePosition;

vec3 blendAdd(vec3 base, vec3 blend, float opacity) {
    return (min(base + blend, vec3(1.0)) * opacity + base * (1.0 - opacity));
}

void main()
{
    vec3 color = vColor;

    float distanceToSun = distance(normalize(vSpherePosition), uSunPosition);
    float glow = smoothstep(0.0, 1.0, clamp(1.0 - distanceToSun / uSunAmplitude, 0.0, 1.0)) * uSunMultiplier;
    glow += pow(max(0.0, 1.0 + 0.05 - distanceToSun * 2.5), 2.0);

    float halo = smoothstep(0.72, 0.75, glow) * 0.3 + smoothstep(1.1, 1.15, glow) * 0.7;
    color = blendAdd(color, uColorSun, clamp(halo, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
}
```

**materials/SkySphereMaterial.js**

```js
import * as THREE from 'three'
import vertexShader from './shaders/skySphere/vertex.glsl'
import fragmentShader from './shaders/skySphere/fragment.glsl'

export default function SkySphereMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uSunPosition:            { value: new THREE.Vector3() },
      uDayCycleProgress:       { value: 0 },
      uAtmosphereElevation:    { value: 0.5 },
      uAtmospherePower:        { value: 10 },
      uColorDayCycleLow:       { value: new THREE.Color('#f0fff9') },
      uColorDayCycleHigh:      { value: new THREE.Color('#2e89ff') },
      uColorNightLow:          { value: new THREE.Color('#004794') },
      uColorNightHigh:         { value: new THREE.Color('#001624') },
      uColorSun:               { value: new THREE.Color('#ffa54a') },
      uColorDawn:              { value: new THREE.Color('#ff7038') },
      uDawnAngleAmplitude:     { value: 1 },
      uDawnElevationAmplitude: { value: 0.2 },
      uSunAmplitude:           { value: 0.75 },
      uSunMultiplier:          { value: 1 }
    },
    vertexShader, fragmentShader
  })
}
```

The six sky colors **are** the palette of the whole piece; memorize them:

| Role | Hex | Note |
|---|---|---|
| Day zenith | `#2e89ff` | vivid blue |
| Day horizon | `#f0fff9` | pale mint-white |
| Night zenith | `#001624` | near-black navy |
| Night horizon | `#004794` | deep blue |
| Dawn/dusk band | `#ff7038` | hot orange-red |
| Sun halo | `#ffa54a` | warm orange |

### 4.4 The fullscreen blit

**materials/shaders/skyBackground/vertex.glsl**

```glsl
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
```

**materials/shaders/skyBackground/fragment.glsl**

```glsl
uniform sampler2D uTexture;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTexture, vUv); }
```

**materials/SkyBackgroundMaterial.js**

```js
import * as THREE from 'three'
import vertexShader from './shaders/skyBackground/vertex.glsl'
import fragmentShader from './shaders/skyBackground/fragment.glsl'

export default function SkyBackgroundMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTexture: { value: null } },
    depthTest: false, depthWrite: false,
    vertexShader, fragmentShader
  })
}
```

### 4.5 Sky.js — render target + follow

The sky renders its own dome into a `WebGLRenderTarget` at **0.35× resolution** (cheap; the
hard toon edges survive the upscale). That target's texture becomes both the background quad
and the **`uFogTexture`** every other material reads. The dome group follows the focus point
so the horizon is always centered on you.

**src/View/Sky.js**

```js
import * as THREE from 'three'
import State from '../State/State.js'
import View from './View.js'
import SkySphereMaterial from './materials/SkySphereMaterial.js'
import SkyBackgroundMaterial from './materials/SkyBackgroundMaterial.js'

export default class Sky {
  constructor() {
    this.state = State.getInstance()
    this.view = View.getInstance()
    this.renderer = this.view.renderer

    this.group = new THREE.Group()
    this.view.scene.add(this.group)

    this.setRenderTarget()
    this.setBackground()
    this.setSphere()
    this.setSunDisc()
  }

  setRenderTarget() {
    this.rt = {}
    this.rt.scene = new THREE.Scene()
    this.rt.camera = this.view.camera.instance.clone()
    this.rt.ratio = 0.35
    this.rt.target = new THREE.WebGLRenderTarget(
      window.innerWidth * this.rt.ratio,
      window.innerHeight * this.rt.ratio,
      { generateMipmaps: false }
    )
    this.texture = this.rt.target.texture   // <-- this is uFogTexture for the world
  }

  setBackground() {
    this.background = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), SkyBackgroundMaterial())
    this.background.material.uniforms.uTexture.value = this.texture
    this.background.frustumCulled = false
    this.group.add(this.background)   // drawn in the MAIN scene, behind everything
  }

  setSphere() {
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 128, 64), SkySphereMaterial())
    this.rt.scene.add(this.sphere)    // drawn into the render target, NOT the main scene
  }

  // A plain white disc that sits in the far distance, occluded by nothing.
  setSunDisc() {
    this.sunDistance = 950
    const geo = new THREE.CircleGeometry(0.02 * this.sunDistance, 32)
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false })
    this.sunDisc = new THREE.Mesh(geo, mat)
    this.group.add(this.sunDisc)
  }

  update() {
    const sun = this.state.sun
    const day = this.state.day
    const focus = this.state.focus

    this.group.position.set(focus.position[0], focus.position[1], focus.position[2])

    this.sphere.material.uniforms.uSunPosition.value.set(sun.position.x, sun.position.y, sun.position.z)
    this.sphere.material.uniforms.uDayCycleProgress.value = day.progress

    this.sunDisc.position.set(sun.position.x * this.sunDistance, sun.position.y * this.sunDistance, sun.position.z * this.sunDistance)
    this.sunDisc.lookAt(focus.position[0], focus.position[1], focus.position[2])

    // Render the dome into the target using a camera that matches the main camera's
    // orientation (but stays at the group origin), then restore the default target.
    const src = this.view.camera.instance
    this.rt.camera.quaternion.copy(src.quaternion)
    this.rt.camera.fov = src.fov
    this.rt.camera.aspect = src.aspect
    this.rt.camera.updateProjectionMatrix()

    this.renderer.instance.setRenderTarget(this.rt.target)
    this.renderer.instance.render(this.rt.scene, this.rt.camera)
    this.renderer.instance.setRenderTarget(null)
  }

  resize() {
    this.rt.target.setSize(window.innerWidth * this.rt.ratio, window.innerHeight * this.rt.ratio)
  }
}
```

Wire `Sky` into `View` (`this.sky = new Sky()` after the camera; call `this.sky.update()`
first in `update()`, before the renderer; call `this.sky.resize()` in `resize()`).

> **Ordering subtlety:** the sky's background quad lives in the *main* scene and must draw
> behind the world. Because it uses `depthTest:false/depthWrite:false` and is added first,
> it paints first and everything else draws over it. The dome itself is in a *separate*
> scene rendered only into the target.

Checkpoint: you should see a blue sky with a soft horizon and a bright sun disc, slowly
shifting toward orange then dark-blue over ~6 minutes. Call `game.state.day.jumpTo(0.25)`
in the console to snap to sunset and confirm the dawn band and warm tint appear.

---

## 5. The beach terrain

### 5.1 How the original does it (and what we simplify)

The real project generates terrain in a **Web Worker** as tiles in a quad-tree LOD, using a
"corridor profile": a meandering shoreline in X, and cross-shore zones (ocean ramp → dry
beach → hills → mountains → highland) blended with FBM detail, plus biomes, coves, terraces,
and sea stacks. Normals and a per-vertex `(normal, elevation)` data texture are computed in
the worker and sampled by the shader.

For the **initial vibe** we keep the *cross-shore profile* and the *toon terrain material*
exactly, but:

- Compute height on the **main thread** from a pure function `h(x,z)` (fast enough; only
  recomputed when you cross a grid cell).
- Use **one recentering tile** that follows the focus point, instead of a chunk quad-tree.
- Use a **straight shoreline** at `x = 0` (mention the meander as a tuning knob).
- Pass elevation via world Y and normals via the geometry's `normal` attribute, instead of a
  data texture.

The picture is the same; you've traded infinite-LOD scalability for ~50 lines of code.

### 5.2 The height function

Cross-shore, measured from the shoreline at `x = 0`: `inland = -x` (toward −X hills),
`seaward = x` (toward +X ocean). Sea level is 0.

```js
// src/View/terrainHeight.js
import { createNoise2D } from 'simplex-noise'
import seedrandom from 'seedrandom'   // seedrandom('seed') returns a () => number rng

// simplex-noise v4 takes a random source, so the height field is stable per seed
const noise2D = createNoise2D(seedrandom('beach-terrain'))

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Cross-shore profile constants (from the original's "corridor")
export const SHORE_X = 0
export const OCEAN_RAMP_WIDTH = 90
export const OCEAN_DEPTH = 9
export const BEACH_WIDTH = 14
export const BEACH_TOP_HEIGHT = 2.2
export const HILLS_WIDTH = 70
export const HILLS_HEIGHT = 9
export const MOUNTAIN_START = 110
export const MOUNTAIN_FULL = 230
export const MOUNTAIN_HEIGHT = 40

// Fractal Brownian motion detail
function fbm(x, z, freq = 0.0035, octaves = 4, lacunarity = 2.05, persistence = 0.35) {
  let sum = 0, amp = 1, norm = 0, f = freq
  for (let i = 0; i < octaves; i++) {
    sum += noise2D(x * f + i * 19.7, z * f - i * 7.3) * amp
    norm += amp
    amp *= persistence
    f *= lacunarity
  }
  return sum / norm
}

export function getElevation(x, z) {
  const inland = SHORE_X - x     // + toward hills (−X)
  const seaward = -inland        // + toward ocean (+X)

  const tOcean = smoothstep(0, OCEAN_RAMP_WIDTH, seaward)
  const tDry   = smoothstep(-6, BEACH_WIDTH, inland)
  const tHills = smoothstep(BEACH_WIDTH, BEACH_WIDTH + HILLS_WIDTH, inland)
  const tMount = smoothstep(MOUNTAIN_START, MOUNTAIN_FULL, inland)

  let elevation =
      - OCEAN_DEPTH * tOcean
      + BEACH_TOP_HEIGHT * tDry
      + HILLS_HEIGHT * tHills
      + MOUNTAIN_HEIGHT * Math.pow(tMount, 1.6)

  // Ridged relief on the mountains only
  if (tMount > 0) {
    const r = 1 - Math.abs(noise2D(x * 0.01 + 40, z * 0.01 - 25))
    elevation += tMount * Math.pow(r, 2.0) * 18
  }

  // Zone-scaled FBM detail: smooth beach, rolling hills, rough mountains
  const detailAmp = 30 * (0.012 + 0.15 * tHills + 0.2 * tMount)
  elevation += fbm(x, z) * detailAmp

  return elevation
}
```

> **Meandering shoreline (optional):** replace `SHORE_X` with
> `shoreX(z) = Math.sin(z * 0.0009) * 120` and use it in `inland`/`seaward`. Then place
> palms relative to `shoreX(z)` too (Phase 7). A curving coastline reads far more natural,
> but a straight one is fine to start.

### 5.3 The toon terrain material

Base color is built **in the vertex shader** by blending sand → grass → rock → snow bands by
elevation and slope, plus an animated wet-sand strip and a dashed foam line at the waterline.
The **hard toon wet edge** is produced by interpolating a smooth `wetness` varying and then
`step(0.35, wetness)` in the *fragment* shader (stepping in the vertex would smear across the
triangle). All shading (sun shade, fresnel glint, fog) is per-fragment.

**materials/shaders/terrain/vertex.glsl**

```glsl
uniform vec3 uSunPosition;
uniform float uBeachEnd;
uniform float uMountainStart;
uniform float uMountainFull;
uniform float uTime;
uniform vec3 uSandColor;
uniform vec3 uGrassColor;
uniform vec3 uRockColor;
uniform sampler2D uFogTexture;

varying vec3 vColor;
varying vec3 vWetColor;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vWetness;
varying float vViewDepth;
varying vec4 vClipPosition;

#include ../partials/inverseLerp.glsl
#include ../partials/remap.glsl
#include ../partials/getTimeOfDayColor.glsl;

void main()
{
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    float depth = - viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;

    // The tile is unrotated with uniform scale, so the object-space normal IS the
    // world normal, and object y IS world elevation.
    vec3 normal = normalize(normal);
    float elevation = modelPosition.y;
    float slope = 1.0 - abs(dot(vec3(0.0, 1.0, 0.0), normal));

    float beachEnd = max(uBeachEnd, 1.3);
    float mountainFull = max(uMountainFull, uMountainStart + 0.1);

    vec3 sandColor      = uSandColor;
    vec3 wetSandColor   = sandColor * 0.62;
    vec3 grassDefault   = uGrassColor;
    vec3 grassShaded    = uGrassColor / 1.3;
    vec3 rockColor      = uRockColor;
    vec3 alpineColor    = vec3(0.38, 0.48, 0.36);
    vec3 snowColor      = vec3(0.90, 0.92, 0.86);

    // Grass sits on flat ground; falls off on slopes
    float grassSlope = smoothstep(0.5, 0.4, slope);
    vec3 grassColor  = mix(grassShaded, grassDefault, grassSlope);

    vec3 beachColor  = mix(wetSandColor, sandColor, smoothstep(0.0, beachEnd, elevation));
    float grassBlend = smoothstep(1.2, beachEnd + 2.0, elevation);
    float alpineBlend = smoothstep(uMountainStart, mountainFull, elevation);
    float snowBlend  = smoothstep(mountainFull - 1.0, mountainFull + 9.0, elevation);
    float rockBlend  = smoothstep(0.18, 0.55, slope) * (1.0 - snowBlend * 0.55);
    float snowCoverage = snowBlend * (1.0 - smoothstep(0.45, 0.75, slope) * 0.65);

    vec3 color = mix(beachColor, grassColor, grassBlend);
    color = mix(color, alpineColor, alpineBlend * (1.0 - snowCoverage));
    color = mix(color, rockColor, rockBlend);
    color = mix(color, snowColor, snowCoverage);

    // Animated waterline: wet sand + a dashed foam line. `waveEdge` is a slow lap that
    // rises/falls with time and along-shore position (sea level = 0).
    float flatness = 1.0 - smoothstep(0.25, 0.5, slope);
    float waveEdge = 0.15 + sin(uTime * 0.6 + modelPosition.z * 0.02) * 0.25;
    float wetness  = (1.0 - smoothstep(waveEdge, waveEdge + 0.6, elevation)) * flatness;
    vec3  wetColor = mix(color, wetSandColor * 0.75, 0.5);

    float foamBand = 1.0 - step(0.16, abs(elevation - waveEdge));
    float foamRand = fract(sin(floor(modelPosition.z / 3.0) * 127.1) * 43758.5453);
    float foam = foamBand * step(foamRand, 0.45);
    color = mix(color, vec3(0.95, 0.97, 0.96), foam * flatness * 0.55);

    color = getTimeOfDayColor(color);
    wetColor = getTimeOfDayColor(wetColor);

    vColor = color;
    vWetColor = wetColor;
    vNormal = normal;
    vWorldPosition = modelPosition.xyz;
    vWetness = wetness;
    vViewDepth = depth;
    vClipPosition = gl_Position;
}
```

**materials/shaders/terrain/fragment.glsl**

```glsl
uniform vec3 uSunPosition;
uniform float uFresnelOffset;
uniform float uFresnelScale;
uniform float uFresnelPower;
uniform sampler2D uFogTexture;

varying vec3 vColor;
varying vec3 vWetColor;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vWetness;
varying float vViewDepth;
varying vec4 vClipPosition;

#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;
#include ../partials/getSunReflection.glsl;
#include ../partials/getSunReflectionColor.glsl;
#include ../partials/getFogColor.glsl;

void main()
{
    vec3 normal = normalize(vNormal);

    // Hard toon wet edge
    float wet = step(0.35, vWetness);
    vec3 color = mix(vColor, vWetColor, wet);

    color = getSunShadeColor(color, getSunShade(normal));

    vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
    vec3 viewNormal = normalize((viewMatrix * vec4(normal, 0.0)).xyz);
    color = getSunReflectionColor(color, getSunReflection(viewDirection, normal, viewNormal));

    // Wet-sand gloss: grazing specular, strongest at golden hour
    float sunLow = smoothstep(0.4, 0.06, uSunPosition.y) * smoothstep(- 0.1, 0.02, uSunPosition.y);
    float wetSpec = pow(max(0.0, dot(reflect(uSunPosition, viewNormal), viewDirection)), 10.0)
                  * (1.0 + dot(viewDirection, normal));
    float gloss = clamp(wetSpec * 1.4 * wet * sunLow, 0.0, 1.0);
    color = mix(color, vec3(1.0, 0.95, 0.85), gloss);

    vec2 screenUv = (vClipPosition.xy / vClipPosition.w) * 0.5 + 0.5;
    color = getFogColor(color, vViewDepth, screenUv);

    gl_FragColor = vec4(color, 1.0);
}
```

**materials/TerrainMaterial.js**

```js
import * as THREE from 'three'
import vertexShader from './shaders/terrain/vertex.glsl'
import fragmentShader from './shaders/terrain/fragment.glsl'

export default function TerrainMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPosition:   { value: new THREE.Vector3() },
      uFogTexture:    { value: null },
      uTime:          { value: 0 },
      uBeachEnd:      { value: 3 },
      uMountainStart: { value: 14 },
      uMountainFull:  { value: 30 },
      uSandColor:     { value: new THREE.Color(0.93, 0.83, 0.60) },
      uGrassColor:    { value: new THREE.Color(0.30, 0.64, 0.26) },
      uRockColor:     { value: new THREE.Color(0.42, 0.42, 0.40) },
      uFresnelOffset: { value: 0 },
      uFresnelScale:  { value: 0.5 },
      uFresnelPower:  { value: 2 }
    },
    extensions: { derivatives: true },
    vertexShader, fragmentShader
  })
}
```

> Colors are **linear 0–1**. This single-biome "golden" palette
> (`sand [0.93,0.83,0.60]`, `grass [0.30,0.64,0.26]`, `rock [0.42,0.42,0.40]`) is the
> flagship look. The original also ships "volcanic" (near-black sand) and "savanna" (dry
> gold grass) biomes selected along the coast — a later extension, not needed for the vibe.

### 5.4 Terrain.js — the recentering tile

A single `PlaneGeometry` grid, rotated flat, whose vertices are rewritten from `getElevation`
whenever the focus crosses a snap grid. Recompute normals after moving vertices.

**src/View/Terrain.js**

```js
import * as THREE from 'three'
import State from '../State/State.js'
import View from './View.js'
import TerrainMaterial from './materials/TerrainMaterial.js'
import { getElevation } from './terrainHeight.js'

export default class Terrain {
  constructor() {
    this.state = State.getInstance()
    this.view = View.getInstance()

    this.size = 512        // metres per side
    this.segments = 200    // ~2.5 m per quad
    this.snap = 16         // rebuild when focus moves this far
    this.center = [Infinity, Infinity]

    this.geometry = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments)
    this.geometry.rotateX(-Math.PI / 2)   // lay flat: plane XY → world XZ

    this.material = TerrainMaterial()
    this.material.uniforms.uFogTexture.value = this.view.sky.texture

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.frustumCulled = false
    this.view.scene.add(this.mesh)

    this.rebuild(0, 0)
  }

  rebuild(cx, cz) {
    const pos = this.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx
      const z = pos.getZ(i) + cz
      pos.setY(i, getElevation(x, z))
    }
    pos.needsUpdate = true
    this.geometry.computeVertexNormals()
    this.mesh.position.set(cx, 0, cz)
    this.center = [cx, cz]
  }

  update() {
    const f = this.state.focus.position
    const cx = Math.round(f[0] / this.snap) * this.snap
    const cz = Math.round(f[2] / this.snap) * this.snap
    if (cx !== this.center[0] || cz !== this.center[1]) this.rebuild(cx, cz)

    this.material.uniforms.uSunPosition.value.set(
      this.state.sun.position.x, this.state.sun.position.y, this.state.sun.position.z)
    this.material.uniforms.uTime.value = this.state.time.elapsed
  }

  resize() {}
}
```

> **Why world-space vertices matter:** because `getElevation(worldX, worldZ)` is a pure
> function, moving the tile and rewriting its Y from world coordinates makes the coastline
> feel *stationary* while you glide over it — the treadmill (idea E). Recomputing 40k
> heights only on a 16 m grid-cross (not every frame) keeps it cheap. For real infinite
> range at scale, promote this to a worker + tile grid; the shader stays identical.

Wire `Terrain` into `View` (construct **after** `Sky`, since it reads `sky.texture`).
Checkpoint: a sandy beach sloping down into a dark trench (the future ocean bed) on the +X
side and rising into green hills / grey rock on the −X side, all cel-shaded with teal
shadows, drifting as you glide. The waterline should show a faint wet band and dashed foam.

---

## 6. The ocean

### 6.1 What the original does (and our simplification)

The real ocean is driven by a **CPU wave simulation** (`WaveSets`) whose phase is shared with
the terrain and particles so foam, uprush, and breaking all stay in lockstep, and it samples
a 1-D shore data texture so waves follow a meandering coast. For the initial vibe we compute
the **same breaking-wave math directly in the vertex shader** from `uTime` against a straight
shore at `x = 0` — no CPU sim, no data textures, no cross-system sync. The waves still shoal,
break, and throw foam; you just can't (yet) read their exact state on the CPU.

### 6.2 Ocean geometry — a graded, jittered grid

Not a uniform plane: a hand-built grid that is **dense in the shore band** (where waves
break) and coarse elsewhere, with deterministic per-vertex jitter for a low-poly irregular
surface. Plane-local X is shore-normal, Z is along-shore; `y = 0` (displaced in the shader).

**src/View/Water.js** (geometry builder + class)

```js
import * as THREE from 'three'
import State from '../State/State.js'
import View from './View.js'
import WaterMaterial from './materials/WaterMaterial.js'

// Deterministic hash in [0,1)
const hash = (iX, iZ, salt) => {
  const v = Math.sin(iX * 127.1 + iZ * 311.7 + salt * 74.7) * 43758.5453
  return v - Math.floor(v)
}

function buildOceanGeometry() {
  // Non-uniform X columns: coarse deep water, dense shore band, coarse behind
  const xs = []
  for (let x = -1000; x < -600; x += 20) xs.push(x)
  for (let x = -600; x <  -200; x +=  4) xs.push(x)   // breaking-wave band
  for (let x = -200; x <= 1000; x += 20) xs.push(x)
  const zStep = 14, zMin = -1000, zMax = 1000
  const zs = []
  for (let z = zMin; z <= zMax; z += zStep) zs.push(z)

  const cols = xs.length, rows = zs.length
  const positions = new Float32Array(cols * rows * 3)
  for (let iZ = 0; iZ < rows; iZ++) {
    for (let iX = 0; iX < cols; iX++) {
      let x = xs[iX], z = zs[iZ]
      const spacingX = (iX > 0 ? Math.abs(xs[iX] - xs[iX - 1]) : 20)
      const edge = iX === 0 || iX === cols - 1 || iZ === 0 || iZ === rows - 1
      if (!edge) {
        x += (hash(iX, iZ, 1) - 0.5) * 0.7 * spacingX
        z += (hash(iX, iZ, 2) - 0.5) * 0.7 * zStep
      }
      const o = (iZ * cols + iX) * 3
      positions[o] = x; positions[o + 1] = 0; positions[o + 2] = z
    }
  }

  const indices = []
  for (let iZ = 0; iZ < rows - 1; iZ++) {
    for (let iX = 0; iX < cols - 1; iX++) {
      const a = iZ * cols + iX, b = a + 1, c = a + cols, d = c + 1
      indices.push(a, d, b, a, c, d)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(indices)
  return geo
}

export default class Water {
  constructor() {
    this.state = State.getInstance()
    this.view = View.getInstance()

    this.oceanOffset = 400   // biases the plane so open water fills the +X horizon
    this.material = WaterMaterial()
    this.material.uniforms.uFogTexture.value = this.view.sky.texture

    this.mesh = new THREE.Mesh(buildOceanGeometry(), this.material)
    this.mesh.frustumCulled = false
    this.view.scene.add(this.mesh)
  }

  update() {
    const focusZ = this.state.focus.position[2]
    // Follow the shore in X (straight here = 0) and the focus in Z
    this.mesh.position.set(0 + this.oceanOffset, 0, focusZ)

    this.material.uniforms.uTime.value = this.state.time.elapsed
    this.material.uniforms.uSunPosition.value.set(
      this.state.sun.position.x, this.state.sun.position.y, this.state.sun.position.z)
    // The plane rides +400 in X, so shoreX in the shader is at local x = -oceanOffset
    this.material.uniforms.uShoreX.value = -this.oceanOffset
  }

  resize() {}
}
```

### 6.3 Water vertex shader — ambient swell + breaking waves

Two layers: three traveling sines (ambient swell) that flatten toward shore, plus two
breaking-wave sets computed in-shader with `getWaveBump`. The fragment shader derives a flat
face normal from screen-space derivatives (the low-poly signature), so we pass world position
and a crest-slope, not a normal.

**materials/shaders/water/vertex.glsl**

```glsl
uniform float uTime;
uniform float uShoreX;

varying vec3 vWorldPosition;
varying float vShoreDistance;
varying float vCrestSlope;
varying float vViewDepth;
varying vec4 vClipPosition;

#include ../partials/getWaveBump.glsl

void main()
{
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);

    float shoreDistance = modelPosition.x - uShoreX;
    float attenuation = smoothstep(-2.0, 40.0, shoreDistance);   // flatten toward shore

    // Ambient swell: 3 sines traveling in −X, phase varies along Z
    float k1 = 6.2831 / 30.0;
    float k2 = 6.2831 / 13.0;
    float k3 = 6.2831 / 5.5;
    float p1 = modelPosition.x * k1 + uTime * 1.0 + sin(modelPosition.z * 0.05) * 2.0;
    float p2 = modelPosition.x * k2 + uTime * 1.6 + modelPosition.z * 0.08;
    float p3 = modelPosition.x * k3 + uTime * 2.4 - modelPosition.z * 0.13;
    modelPosition.y += (sin(p1) * 0.22 + sin(p2) * 0.12 + sin(p3) * 0.05) * attenuation;

    // Breaking-wave sets (in-shader replacement for the CPU WaveSets)
    float setAtt = smoothstep(0.0, 6.0, shoreDistance);   // survive to break at d≈6
    const float D0 = 130.0, DBreak = 6.0, pBreak = 0.62, width = 9.0;
    float crest = 0.0;

    // helper inlined twice with different period/offset/amplitude
    // set 0
    {
        float period = 11.0, offset = 0.0, baseAmp = 0.75;
        float ph = fract((uTime + offset) / period);
        float frontD = ph < pBreak ? DBreak + (D0 - DBreak) * (1.0 - ph / pBreak) * (1.0 - ph / pBreak) : 0.0;
        float amp = baseAmp * (0.35 + 0.65 * (1.0 - smoothstep(15.0, D0, frontD)));
        amp *= 1.0 - smoothstep(pBreak, pBreak + 0.06, ph);
        float jitter = sin(modelPosition.z * 0.012) * 7.0;
        float slope; float h = getWaveBump(shoreDistance - jitter, frontD, amp, width, D0, slope) * setAtt;
        modelPosition.y += h; crest += max(0.0, slope) * setAtt;
    }
    // set 1
    {
        float period = 16.5, offset = 7.3, baseAmp = 0.5;
        float ph = fract((uTime + offset) / period);
        float frontD = ph < pBreak ? DBreak + (D0 - DBreak) * (1.0 - ph / pBreak) * (1.0 - ph / pBreak) : 0.0;
        float amp = baseAmp * (0.35 + 0.65 * (1.0 - smoothstep(15.0, D0, frontD)));
        amp *= 1.0 - smoothstep(pBreak, pBreak + 0.06, ph);
        float jitter = sin(modelPosition.z * 0.012 + 2.0) * 7.0;
        float slope; float h = getWaveBump(shoreDistance - jitter, frontD, amp, width, D0, slope) * setAtt;
        modelPosition.y += h; crest += max(0.0, slope) * setAtt;
    }

    vCrestSlope = crest;
    vWorldPosition = modelPosition.xyz;
    vShoreDistance = shoreDistance;

    vec4 viewPosition = viewMatrix * modelPosition;
    vViewDepth = - viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;
    vClipPosition = gl_Position;
}
```

### 6.4 Water fragment shader — toon depth bands + foam

Depth is **posterized into 4 bands** (`floor(x*4+0.5)/4`) mixing shallow→deep color with
depth-varying alpha. Foam is a chain of `max()`ed white masks: a scalloped shore edge, a
double outline line, three drifting contour rings (with stochastic dashes), a whitewater bore
behind each break, and crest foam on steep wave faces. Foam is composited **last, flat and
unshaded** — that's the toon signature. The face normal comes from `dFdx/dFdy` so you need
`extensions: { derivatives: true }`.

**materials/shaders/water/fragment.glsl**

```glsl
uniform float uTime;
uniform vec3 uSunPosition;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uFoamColor;
uniform float uOceanRampWidth;
uniform float uFoamEdgeWidth;
uniform float uFoamLineWidth;
uniform float uFoamGap;
uniform float uRingPeriod;
uniform float uRingMaxD;
uniform float uDashLength;
uniform sampler2D uFogTexture;

varying vec3 vWorldPosition;
varying float vShoreDistance;
varying float vCrestSlope;
varying float vViewDepth;
varying vec4 vClipPosition;

#include ../partials/getTimeOfDayColor.glsl;
#include ../partials/getFogColor.glsl;

void main()
{
    // Flat/faceted normal from screen-space derivatives
    vec3 faceNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    faceNormal *= sign(faceNormal.y);

    float d = vShoreDistance;

    // Posterized depth color + depth-varying alpha (4 bands)
    float depthBlend = smoothstep(0.0, uOceanRampWidth, d);
    depthBlend = floor(depthBlend * 4.0 + 0.5) / 4.0;
    vec3 color = mix(uShallowColor, uDeepColor, depthBlend);
    float alpha = mix(0.62, 0.94, depthBlend);

    // Static scallop (irregular edge shared by several foam bands)
    float scallop = sin(vWorldPosition.z * 0.35) * 1.1 + sin(vWorldPosition.z * 0.11 + 2.7) * 1.8;

    // Shore edge band + double outline line
    float edgeWidth = uFoamEdgeWidth + scallop + sin(uTime * 0.6 + vWorldPosition.z * 0.02) * 0.9;
    float foam = step(d, edgeWidth);
    foam = max(foam, step(abs(d - edgeWidth - uFoamGap), uFoamLineWidth));

    // Three drifting contour rings, spawned offshore, dashed stochastically
    for (int k = 0; k < 3; k++) {
        float phase = fract(uTime / uRingPeriod + float(k) / 3.0);
        float ringD = mix(uRingMaxD, uFoamEdgeWidth, phase);
        float onRing = step(abs(d - ringD + scallop * 0.6), uFoamLineWidth);
        float gen  = floor(uTime / uRingPeriod + float(k) / 3.0);
        float cell = floor(vWorldPosition.z / uDashLength) + float(k) * 61.0 + gen * 17.0;
        float h = fract(sin(cell * 127.1) * 43758.5453);
        float coverage = smoothstep(0.0, 0.4, phase) * 0.85;
        foam = max(foam, onRing * step(h, coverage));
    }

    // Crest foam on steep wave faces
    foam = max(foam, step(0.075 + scallop * 0.004, vCrestSlope));

    // Fade the water to nothing right at the sand (no hard edge)
    alpha *= smoothstep(-3.0, 1.5, d);

    color = getTimeOfDayColor(color);

    // Per-facet sun shade + stepped glint "chips"
    float facetShade = dot(faceNormal, - uSunPosition) * 0.5 + 0.5;
    color *= mix(1.12, 0.82, facetShade);
    vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
    float glint = pow(max(0.0, dot(reflect(normalize(uSunPosition), faceNormal), viewDirection)), 30.0);
    color = mix(color, vec3(1.0), step(0.45, glint) * 0.85);

    // Foam composited last: flat, unshaded, tinted only by time of day
    color = mix(color, getTimeOfDayColor(uFoamColor), foam);
    alpha = mix(alpha, 0.97 * smoothstep(-3.0, 1.5, d), foam);

    vec2 screenUv = (vClipPosition.xy / vClipPosition.w) * 0.5 + 0.5;
    color = getFogColor(color, vViewDepth, screenUv);

    gl_FragColor = vec4(color, alpha);
}
```

**materials/WaterMaterial.js**

```js
import * as THREE from 'three'
import vertexShader from './shaders/water/vertex.glsl'
import fragmentShader from './shaders/water/fragment.glsl'

export default function WaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    extensions: { derivatives: true },
    uniforms: {
      uTime:           { value: 0 },
      uShoreX:         { value: 0 },
      uSunPosition:    { value: new THREE.Vector3() },
      uFogTexture:     { value: null },
      uDeepColor:      { value: new THREE.Color('#1e4f9c') },
      uShallowColor:   { value: new THREE.Color('#3ba7c0') },
      uFoamColor:      { value: new THREE.Color('#e8f0ee') },
      uOceanRampWidth: { value: 90 },
      uFoamEdgeWidth:  { value: 1.6 },
      uFoamLineWidth:  { value: 0.55 },
      uFoamGap:        { value: 2.4 },
      uRingPeriod:     { value: 7 },
      uRingMaxD:       { value: 32 },
      uDashLength:     { value: 6 }
    },
    vertexShader, fragmentShader
  })
}
```

Wire `Water` into `View` after `Terrain`. Checkpoint: the +X trench now fills with layered
blue-banded water, a white foam line laps the shore, contour rings drift in, and waves visibly
swell and break near the beach — all tinting with the time of day. If foam looks like solid
sheets, confirm `extensions.derivatives` is set and your GPU supports `OES_standard_derivatives`
(Three r149 on WebGL1) — on WebGL2 it's built in.

> **The original's extras (deferred):** player wading ripples, a directional swim wake with a
> 12-ring churn buffer, and rain splash rings. All are `max()`ed into the same `foam` term and
> gated by uniforms that are 0 here. Add them once you have a controllable character.

---

## 7. Palm trees and props

Palms are **fully procedural geometry** (no models), scattered as a single `InstancedMesh`
along the beach, with a second `BackSide` `InstancedMesh` sharing the same instance matrices
for the **inverted-hull ink outline**. Wind sway is a noise-texture scroll in the vertex
shader, scaled by a per-vertex `sway` attribute (0 at root → 1 at frond tips). Every prop
geometry carries `position`, `normal`, a vertex `color`, and that `sway` float.

### 7.1 A noise texture for wind

The original renders a Perlin RGB texture on the GPU; a CPU `DataTexture` is simpler and
identical in effect. Its `.xy` channels drive the horizontal sway offset.

**src/View/Noises.js**

```js
import * as THREE from 'three'
import { createNoise2D } from 'simplex-noise'

export default class Noises {
  constructor(size = 128) {
    const n1 = createNoise2D(), n2 = createNoise2D()
    const data = new Uint8Array(size * size * 4)
    for (let i = 0; i < size * size; i++) {
      const x = (i % size) / size * 8, y = Math.floor(i / size) / size * 8
      data[i * 4 + 0] = (n1(x, y) * 0.5 + 0.5) * 255
      data[i * 4 + 1] = (n2(x, y) * 0.5 + 0.5) * 255
      data[i * 4 + 2] = 128
      data[i * 4 + 3] = 255
    }
    this.texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping
    this.texture.needsUpdate = true
  }
}
```

Add `this.noises = new Noises()` to `View` **before** `Props`.

### 7.2 Procedural palm geometry

A leaning trunk (quadratic bend toward +X seaward) plus two layers of drooping, tapering
frond strips fanned around the crown. Merge parts and `computeVertexNormals()` for faceted
normals. You'll need `BufferGeometryUtils.mergeBufferGeometries`.

**src/View/buildPalm.js**

```js
import * as THREE from 'three'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Attach a `sway` attribute + vertex colors to one part, then return it.
function paint(geo, swayFn, colorFn) {
  const pos = geo.attributes.position
  const sway = new Float32Array(pos.count)
  const color = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    sway[i] = swayFn(x, y, z)
    const c = colorFn(x, y, z)
    color[i * 3] = c[0]; color[i * 3 + 1] = c[1]; color[i * 3 + 2] = c[2]
  }
  geo.setAttribute('sway', new THREE.BufferAttribute(sway, 1))
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3))
  return geo
}

export function buildPalm() {
  const parts = []
  const trunkHeight = 6
  const lean = 1.8   // +X seaward bend at the crown

  // Trunk: tapered open cylinder, bent by t²·lean
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, trunkHeight, 5, 6, true)
  trunk.translate(0, trunkHeight * 0.5, 0)
  {
    const p = trunk.attributes.position
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / trunkHeight
      p.setX(i, p.getX(i) + t * t * lean)
    }
  }
  parts.push(paint(trunk,
    (x, y) => Math.pow(y / trunkHeight, 2) * 0.25,             // stiff sway
    (x, y) => [0.36 + y * 0.008, 0.27 + y * 0.006, 0.19]))     // brown, lighter up top

  // Fronds: two layers of drooping, tapering strips
  const frondLayers = [
    { count: 9, length: 2.6, width: 1.4, droop: 1.1, yOffset: -0.1,  angleOffset: 0    },
    { count: 7, length: 1.7, width: 1.1, droop: 0.5, yOffset: 0.18, angleOffset: 0.38 }
  ]
  for (const L of frondLayers) {
    for (let f = 0; f < L.count; f++) {
      const frond = new THREE.PlaneGeometry(L.length, L.width, 4, 1)
      frond.rotateX(-Math.PI * 0.5)              // lay flat
      frond.translate(L.length * 0.5, 0, 0)      // root at origin, extends +X
      const p = frond.attributes.position
      for (let i = 0; i < p.count; i++) {
        const t = p.getX(i) / L.length
        p.setY(i, p.getY(i) - Math.pow(t, 1.7) * L.droop)   // tips sag
        p.setZ(i, p.getZ(i) * (1 - t * 0.7))                // taper to a blade
      }
      frond.rotateY((f / L.count) * Math.PI * 2 + f * 0.35 + L.angleOffset)
      frond.translate(lean, trunkHeight + L.yOffset, 0)
      parts.push(paint(frond,
        (x) => 0.3 + (x / L.length) * 0.7,                  // flexy tips
        (x) => { const t = x / L.length;
          return [0.20 + t * 0.12, 0.38 + t * 0.14, 0.16 + t * 0.06] }))  // green, bright tips
    }
  }

  const geo = mergeBufferGeometries(parts, false)
  geo.computeVertexNormals()
  return geo
}
```

### 7.3 Prop and outline materials

**materials/shaders/props/vertex.glsl** — lighting is done here (fragment is trivial). Note
the same partial chain as everything else: time-of-day → sun shade → fog.

```glsl
uniform vec3 uSunPosition;
uniform sampler2D uFogTexture;
uniform sampler2D uNoiseTexture;
uniform float uWindTime;
uniform float uWindStrength;

attribute float sway;
varying vec3 vColor;

#include ../partials/inverseLerp.glsl
#include ../partials/remap.glsl
#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;
#include ../partials/getFogColor.glsl;
#include ../partials/getTimeOfDayColor.glsl;

void main()
{
    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec4 originPosition = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // Wind sway: scroll the noise texture by the instance origin, offset by sway
    vec2 noiseUv = originPosition.xz * 0.02 + uWindTime * 0.05;
    vec4 noiseColor = texture2D(uNoiseTexture, noiseUv);
    float windAmplitude = mix(0.03, 0.4, uWindStrength) * sway;
    worldPosition.x += (noiseColor.x - 0.5) * windAmplitude;
    worldPosition.z += (noiseColor.y - 0.5) * windAmplitude;

    vec4 viewPosition = viewMatrix * worldPosition;
    float depth = - viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;

    vec3 worldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);

    vec3 outputColor = color;
    #ifdef USE_INSTANCING_COLOR
        outputColor *= instanceColor;   // per-tree brightness tint
    #endif
    outputColor = getTimeOfDayColor(outputColor);
    outputColor = getSunShadeColor(outputColor, getSunShade(worldNormal));

    vec2 screenUv = (gl_Position.xy / gl_Position.w * 0.5) + 0.5;
    outputColor = getFogColor(outputColor, depth, screenUv);

    vColor = outputColor;
}
```

**materials/shaders/props/fragment.glsl**

```glsl
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }
```

**materials/PropsMaterial.js**

```js
import * as THREE from 'three'
import vertexShader from './shaders/props/vertex.glsl'
import fragmentShader from './shaders/props/fragment.glsl'

export default function PropsMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPosition:  { value: new THREE.Vector3(-0.5, -0.5, -0.5) },
      uFogTexture:   { value: null },
      uNoiseTexture: { value: null },
      uWindTime:     { value: 0 },
      uWindStrength: { value: 0 }
    },
    vertexColors: true,
    side: THREE.DoubleSide,
    vertexShader, fragmentShader
  })
}
```

The **ink outline** is a classic inverted hull: render the same geometry `BackSide`, inflated
along its normal in object space (so thickness scales with the instance), in a flat fogged
ink color `#1c1713`. Open frond strips have no back face and artifact, so any vertex with
`sway > uSwayCollapse` is sent off-screen (degenerate triangle).

**materials/shaders/propsOutline/vertex.glsl**

```glsl
uniform sampler2D uNoiseTexture;
uniform float uWindTime;
uniform float uWindStrength;
uniform float uThickness;
uniform float uSwayCollapse;

attribute float sway;
varying float vViewDepth;
varying vec4 vClipPosition;

void main()
{
    vec3 displaced = position + normal * uThickness;   // inflate in object space
    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(displaced, 1.0);
    vec4 originPosition = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // Same wind as the prop so the shell tracks it exactly
    vec2 noiseUv = originPosition.xz * 0.02 + uWindTime * 0.05;
    vec4 noiseColor = texture2D(uNoiseTexture, noiseUv);
    float windAmplitude = mix(0.03, 0.4, uWindStrength) * sway;
    worldPosition.x += (noiseColor.x - 0.5) * windAmplitude;
    worldPosition.z += (noiseColor.y - 0.5) * windAmplitude;

    vec4 viewPosition = viewMatrix * worldPosition;
    vViewDepth = - viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;
    vClipPosition = gl_Position;

    if (sway > uSwayCollapse) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // collapse open strips
}
```

**materials/shaders/propsOutline/fragment.glsl**

```glsl
uniform vec3 uColor;
uniform sampler2D uFogTexture;
varying float vViewDepth;
varying vec4 vClipPosition;

#include ../partials/getFogColor.glsl;

void main()
{
    vec2 screenUv = (vClipPosition.xy / vClipPosition.w) * 0.5 + 0.5;
    gl_FragColor = vec4(getFogColor(uColor, vViewDepth, screenUv), 1.0);   // ink melts into haze
}
```

**materials/PropsOutlineMaterial.js**

```js
import * as THREE from 'three'
import vertexShader from './shaders/propsOutline/vertex.glsl'
import fragmentShader from './shaders/propsOutline/fragment.glsl'

export default function PropsOutlineMaterial({ thickness = 0.05, swayCollapse = 0.28 } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uThickness:    { value: thickness },
      uSwayCollapse: { value: swayCollapse },   // palm fronds collapse above this
      uColor:        { value: new THREE.Color('#1c1713') },
      uFogTexture:   { value: null },
      uNoiseTexture: { value: null },
      uWindTime:     { value: 0 },
      uWindStrength: { value: 0 }
    },
    vertexShader, fragmentShader
  })
}
```

### 7.4 Props.js — scatter, instancing, wind

Deterministic per-row scatter along the beach: for each along-shore row, seed a PRNG, decide
whether to place a palm, put it a few metres inland of the shore at ground height, with small
random yaw/tilt/scale and a per-instance brightness tint. Rebuild when the focus moves a row.
The outline mesh **shares the same `instanceMatrix` object** — zero extra transform work.

**src/View/Props.js**

```js
import * as THREE from 'three'
import seedrandom from 'seedrandom'
import State from '../State/State.js'
import View from './View.js'
import PropsMaterial from './materials/PropsMaterial.js'
import PropsOutlineMaterial from './materials/PropsOutlineMaterial.js'
import { buildPalm } from './buildPalm.js'
import { getElevation, SHORE_X } from './terrainHeight.js'

export default class Props {
  constructor() {
    this.state = State.getInstance()
    this.view = View.getInstance()

    this.capacity = 48
    this.rowSize = 24        // metres between candidate rows
    this.probability = 0.7   // chance a row gets a palm
    this.radius = 192        // spawn window ahead/behind in Z
    this.inlandMin = 6
    this.inlandMax = 18
    this.lastZ = Infinity

    const geo = buildPalm()
    this.material = PropsMaterial()
    this.material.uniforms.uFogTexture.value = this.view.sky.texture
    this.material.uniforms.uNoiseTexture.value = this.view.noises.texture

    this.outlineMaterial = PropsOutlineMaterial({ thickness: 0.05, swayCollapse: 0.28 })
    this.outlineMaterial.uniforms.uFogTexture.value = this.view.sky.texture
    this.outlineMaterial.uniforms.uNoiseTexture.value = this.view.noises.texture

    this.mesh = new THREE.InstancedMesh(geo, this.material, this.capacity)
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3)

    this.outlineMesh = new THREE.InstancedMesh(geo, this.outlineMaterial, this.capacity)
    this.outlineMesh.frustumCulled = false
    this.outlineMesh.instanceMatrix = this.mesh.instanceMatrix   // SHARE the matrices

    this.view.scene.add(this.outlineMesh, this.mesh)   // outline first so it draws behind
    this.dummy = new THREE.Object3D()
    this.rebuild()
  }

  rebuild() {
    const seed = 'beach'
    const focusZ = this.state.focus.position[2]
    const rowMin = Math.floor((focusZ - this.radius) / this.rowSize)
    const rowMax = Math.floor((focusZ + this.radius) / this.rowSize)

    let index = 0
    for (let row = rowMin; row <= rowMax && index < this.capacity; row++) {
      const rng = seedrandom(`${seed}:palm:${row}`)
      const r = Array.from({ length: 8 }, () => rng())   // fixed draw count = stable placement
      if (r[0] > this.probability) continue

      const z = (row + r[1]) * this.rowSize
      const inland = this.inlandMin + r[2] * (this.inlandMax - this.inlandMin)
      const x = SHORE_X - inland
      const y = getElevation(x, z)
      if (y < 0.8 || y > 6) continue    // keep palms on the dry beach band

      this.dummy.position.set(x, y - 0.15, z)
      this.dummy.rotation.set(0, (r[4] - 0.5) * 0.8, -r[5] * 0.15)   // small yaw + slight tilt
      const s = 0.75 + r[6] * 0.5
      this.dummy.scale.set(s, s, s)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(index, this.dummy.matrix)
      this.mesh.setColorAt(index, new THREE.Color().setScalar(0.9 + r[7] * 0.2))
      index++
    }

    this.mesh.count = index
    this.outlineMesh.count = index
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    this.lastZ = focusZ
  }

  update() {
    const focusZ = this.state.focus.position[2]
    if (Math.abs(focusZ - this.lastZ) > this.rowSize) this.rebuild()

    // Simple wind: gentle drift, no gusts (add gusts later)
    const t = this.state.time.elapsed
    const windStrength = 0.4 + 0.2 * Math.sin(t * 0.11) + 0.2 * Math.sin(t * 0.043 + 2)
    const windTime = t * (0.5 + windStrength)
    const sun = this.state.sun.position

    for (const m of [this.material, this.outlineMaterial]) {
      m.uniforms.uWindTime.value = windTime
      m.uniforms.uWindStrength.value = Math.max(0, Math.min(1, windStrength))
    }
    this.material.uniforms.uSunPosition.value.set(sun.x, sun.y, sun.z)
  }

  resize() {}
}
```

> `seedrandom` is already in the deps (Phase 1). The **fixed 8-value draw** per row is
> deliberate: it keeps a palm at the same spot every
> time you pass, even though placement is regenerated on the treadmill.

Wire `Props` into `View` last. Checkpoint: leaning palms with drooping fronds line the dry
sand, each wrapped in a soft dark ink outline, swaying gently, tinted by the sun. Frond tips
should move more than trunks; outlines should fade into the haze at distance.

> **More props (deferred):** the original also builds conifers (3 stacked open cones on a
> stubby trunk, inland) and noise-displaced icosahedron boulders, plus a 40k-blade grass
> field — all through the same instanced-layer + shared-outline pattern. Palms alone carry
> the beach vibe; add the rest as `buildConifer`/`buildBoulder` layers when you want variety.

---

## 8. The camera

A gentle third-person orbit that frames the drifting focus point and looks down the coast
(−Z). Distance 15, a fairly low angle (`phi ≈ 0.45π`, ~81° from vertical), springs toward its
ideal position. Optional pointer-drag to orbit. This both frames the scene and *is* the follow
target for water/terrain/sky.

**src/View/Camera.js**

```js
import * as THREE from 'three'
import State from '../State/State.js'
import View from './View.js'

export default class Camera {
  constructor() {
    this.state = State.getInstance()
    this.view = View.getInstance()

    this.instance = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 5000)
    this.instance.rotation.reorder('YXZ')
    this.view.scene.add(this.instance)

    this.distance = 15
    this.phi = Math.PI * 0.45     // near-horizontal, looking slightly down
    this.theta = 0                // face down the beach (−Z)
    this.aboveOffset = 2
    this.springRate = 6
    this.position = new THREE.Vector3()
    this.initialised = false

    this._bindDrag()
  }

  _bindDrag() {
    let dragging = false, lastX = 0, lastY = 0
    const el = () => this.view.renderer.instance.domElement
    addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY })
    addEventListener('pointerup',   () => { dragging = false })
    addEventListener('pointermove', (e) => {
      if (!dragging) return
      this.theta -= (e.clientX - lastX) / window.innerWidth * 2
      this.phi   -= (e.clientY - lastY) / window.innerHeight * 2
      this.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi))
      lastX = e.clientX; lastY = e.clientY
    })
  }

  update() {
    const f = this.state.focus.position
    const focus = new THREE.Vector3(f[0], f[1], f[2])

    const sinPhi = Math.sin(this.phi) * this.distance
    const desired = new THREE.Vector3(
      sinPhi * Math.sin(this.theta),
      Math.cos(this.phi) * this.distance,
      sinPhi * Math.cos(this.theta)
    ).add(focus)

    if (this.initialised) {
      const t = 1 - Math.exp(-this.springRate * this.state.time.delta)
      this.position.lerp(desired, t)
    } else {
      this.position.copy(desired); this.initialised = true
    }

    this.instance.position.copy(this.position)
    this.instance.lookAt(focus.x, focus.y + this.aboveOffset, focus.z)
  }

  resize() {
    this.instance.aspect = window.innerWidth / window.innerHeight
    this.instance.updateProjectionMatrix()
  }
}
```

Checkpoint: you glide down an endless coastline, palms sliding past, waves breaking to your
right, the sky slowly turning. Drag to look around.

> The original adds speed-based FOV widening (`45 → 63°`), auto-turn toward travel direction,
> and terrain collision so the camera never clips underground (`if (pos.y < ground+1) pos.y =
> ground+1`). The collision one is worth adding early if your camera dips below hills — sample
> `getElevation(pos.x, pos.z)` and clamp.

---

## 9. Wiring & tuning

### 9.1 Per-frame uniform broadcast

There is **no global uniform bus** — each View subsystem copies the shared state into its own
material each frame. The two universal inputs are **`uSunPosition`** (the unit sun vector) and
**`uFogTexture`** (the sky render target, set once at construction). Make sure every world
material gets `uSunPosition` updated in its `update()` and `uFogTexture` wired at init, exactly
as shown in each phase. Update order in `View.update()` must be:

```
camera → sky (renders the fog target) → terrain → water → props → renderer
```

The sky must render its target **before** anyone samples it that frame; the renderer draws the
main scene **last**.

### 9.2 The complete color & constant reference

| System | Constant | Value |
|---|---|---|
| Day cycle | full-day duration | `360` s |
| Day cycle | golden-hour stretch | `0.6` |
| Sun | arc amplitude / bias / phase offset | `0.3` / `0.5` / `+0.25` |
| Shade | shadow tint multiplier | `vec3(0.0, 0.5, 0.7)` |
| Time of day | golden tint (×0.7) | `vec3(0.70, 0.52, 0.22)` |
| Time of day | night tint (×0.5) | `vec3(0.12, 0.18, 0.24)` |
| Fog | intensity (`1−exp(−(k·depth)²)`) | `k = 0.0025` |
| Sky | day zenith / horizon | `#2e89ff` / `#f0fff9` |
| Sky | night zenith / horizon | `#001624` / `#004794` |
| Sky | dawn band / sun halo | `#ff7038` / `#ffa54a` |
| Terrain | sand / grass / rock | `[0.93,0.83,0.60]` / `[0.30,0.64,0.26]` / `[0.42,0.42,0.40]` |
| Terrain | fresnel offset / scale / power | `0` / `0.5` / `2` |
| Water | deep / shallow / foam | `#1e4f9c` / `#3ba7c0` / `#e8f0ee` |
| Water | ocean ramp width | `90` |
| Water | ambient wave amplitudes | `0.22 / 0.12 / 0.05` |
| Water | wave sets (period, offset, amp) | `(11, 0, 0.75)` & `(16.5, 7.3, 0.5)` |
| Palm | trunk radii / height / lean | `0.14`→`0.24` / `6` / `1.8` |
| Palm | trunk / frond color | `[0.36,0.27,0.19]` / `[0.20,0.38,0.16]`→tip |
| Props | outline color / thickness | `#1c1713` / `0.05` |
| Props | wind amplitude range | `0.03 → 0.4` |
| Camera | distance / phi / spring | `15` / `0.45π` / `6` |

### 9.3 Common failure modes

- **Everything is black / NaN water:** a `#include` path is wrong, or `extensions.derivatives`
  is missing. Check the shader compile log in the console.
- **No fog / distant objects are the wrong color:** `uFogTexture` wasn't wired, or the sky
  renders *after* the consumer in the frame. Sky must update first.
- **Palms all identical / popping:** you didn't use a *fixed* per-row draw count, so skipping a
  candidate shifted the RNG stream. Always draw all 8 values before any early-out.
- **Shadows look grey, not teal:** you applied `getSunShade` to the base *before*
  `getTimeOfDayColor`, or forgot `getSunShadeColor`. Order is time-of-day → sun shade.
- **Water plane visible seam / edge:** raise `oceanOffset` or the plane extents so the graded
  grid always covers the visible shore.

---

## 10. Optional extras

These push past the "initial vibe" but are cheap wins, each self-contained:

- **Toon clouds** — a `BackSide` sphere (radius 9.5) rendered *into the sky target* (so they
  tint the fog for free), with 2-octave value-noise FBM and a near-`step` `smoothstep(cov,
  cov+0.015, fbm)` for hard puff edges; two-tone body vs. underside, day/night mixed by
  `uSunPosition.y`, plus a hard sun rim. Put it in `Sky.rt.scene` with `renderOrder`.
- **Stars & moon** — 1000 `Points` on a radius-1000 sphere with muted blue/gold HSL colors and
  a twinkle; a crescent moon disc opposite the sun that fades in with
  `nightness = clamp((-sunY-0.05)*5, 0, 1)`. Both live in the sky group.
- **Grass** — a single mesh of ~40k 3-vertex blades that follows the focus, reusing the exact
  props partial chain (`getTimeOfDayColor → getSunShade → fresnel`) with a vertical 2-band
  gradient (`base/1.3 → base`) and the same noise-scroll wind.
- **Weather** — a `rainIntensity ∈ [0,1]` that desaturates the sky toward cool grey, hides the
  sun/moon discs, drives rain splash rings in the water foam, and adds gusts to the wind.
- **A real character** — replace `Focus` with momentum-based movement; then the deferred water
  ripple/wake uniforms and the camera's speed-FOV/auto-turn come alive.

---

## Appendix: build order checklist

1. Scaffolding (Phase 1) → black canvas that resizes.
2. State/View loop + stub camera (Phase 2) → `#222` frame.
3. Toon partials (Phase 3) → no visual change; files in place.
4. Sky + day cycle (Phase 4) → animated day→night sky + sun.
5. Terrain (Phase 5) → cel-shaded beach that drifts.
6. Water (Phase 6) → banded, foaming, breaking ocean.
7. Palms (Phase 7) → outlined, swaying palm trees.
8. Camera (Phase 8) → gliding third-person coastline.
9. Wiring/tuning (Phase 9) → verify uniform broadcast + order.
10. Extras (Phase 10) → clouds, stars, grass, weather as desired.

Build in this order and you'll have a coherent, tunable, genuinely pretty toon beach — the
same vibe as *WaitingFor.AI*, from a clean slate.
