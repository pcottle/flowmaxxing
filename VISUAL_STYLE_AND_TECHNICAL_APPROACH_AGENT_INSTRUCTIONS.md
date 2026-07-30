# Visual Style and Technical Approach — Agent Instructions

> **Audience:** AI coding agents and engineers asked to reproduce, extend, or port the graphics language of this project.
>
> **Purpose:** This is an implementation manual, not merely an art-direction mood board. It explains what the look is, why the current system produces it, how data moves from simulation to GPU, which compromises are intentional, how to build new effects that belong, and how to avoid common visual and performance failures.

---

## 0. Mission in one paragraph

Build a welcoming, stylized, endlessly traversable coastal world using inexpensive geometry, strong silhouettes, limited color bands, procedural motion, and many small reactive details. Do **not** chase photorealism. The signature comes from a coherent stack: low-poly/faceted forms; hard, posterized shader decisions; a sky-controlled palette and fog; a continuous CPU-generated terrain corridor; GPU animation for dense or repeating effects; sparse event-driven “magic”; and a strict separation between gameplay state and rendering. Every new visual should share the same sun, time, wind, weather, fog, terrain, and shoreline data rather than inventing a private version of the world.

---

## 1. Non-negotiable visual principles

### 1.1 Shape language

1. Favor **large readable masses** over surface detail.
2. Favor **silhouettes** over textures. A prop should read at a distance when filled with one color.
3. Use intentionally simple geometry: wedges, low-segment cylinders, planes, ribbons, faceted rocks, triangular grass, point sprites, and billboards.
4. Let irregular triangulation and face normals provide detail instead of normal maps.
5. Round forms may exist, but render them as graphic discs, stepped rings, or low-poly volumes—not physically perfect spheres.
6. Use exaggeration where readability needs it: oversized moon disc, broad foam, thick prop outlines, large particle glyphs, and amplified crests.
7. Preserve empty space. The beach, ocean, sky, and distant mountains are the major composition; decorations are punctuation.

### 1.2 Color language

1. Use a small number of semantic palettes: sand, vegetation, rock, shallow water, deep water, foam, sky low/high, sun, night low/high, ink, and magical accents.
2. Blend palettes by **biome weight**, but posterize or threshold material transitions where possible.
3. Treat time of day as a global tinting system, not a separate texture set.
4. Golden hour warms base colors; night cools and partially desaturates them.
5. Preserve a few saturated accents against broad natural fields: sunset orange, aurora green/magenta, lantern amber, rainbow bands.
6. Avoid full-spectrum random colors. Even stars are biased toward blue-white and warm-white with rare gold/red accents.
7. Foam and sparkle highlights should remain nearly flat white after lighting. This is a graphic signature.

### 1.3 Edge and shading language

1. Prefer `step`, narrow `smoothstep`, quantization, and discrete bands to long photoreal gradients.
2. Use directional sun shading, but keep it simple and art-directable.
3. Add selective white reflection/glint rather than a full PBR response.
4. Use inverted-hull outlines on closed props; do not indiscriminately outline every object.
5. Fog distant shapes into the **actual sky color behind their screen pixel**, not a single constant fog color.
6. Stable spatial breakup is preferable to boiling noise. Animate the position of a graphic boundary; do not regenerate its identity every frame.

### 1.4 Motion language

1. The world should “breathe”: slow cloud drift, wind sway, water travel, star twinkle, fire flicker, intermittent wildlife, and weather transitions.
2. Different layers need different timescales. Ambient drift is slow; impacts and spray are short; rare spectacles last tens of seconds.
3. Use phase, seed, speed, and density attributes so repeated elements do not pulse in unison.
4. Ease weather and rare-event activity in and out. Binary visibility is acceptable only for genuinely crisp graphic masks.
5. Motion must be causally legible: waves travel shoreward, foam follows their phase, grass bends from wind and player proximity, wakes align with heading, rain slants with wind.

---

## 2. Current technical stack and conventions

- **Runtime:** browser, ES modules, Vite.
- **Renderer:** Three.js `WebGLRenderer`, antialiasing enabled, device pixel ratio clamped by viewport state.
- **Shaders:** `THREE.ShaderMaterial` with GLSL files imported through `vite-plugin-glsl`.
- **UI:** React is present, but the graphics runtime is imperative Three.js.
- **Procedural generation:** seeded random and simplex noise; expensive terrain generation is delegated to a worker.
- **Math/state:** Three.js types on the view side; `gl-matrix` appears in simulation code.
- **Debugging:** `lil-gui` and optional renderer statistics.
- **Coordinate convention:** Y is up; the journey proceeds along Z; coastline X varies with Z; the open ocean is on the positive-X side.
- **Code style:** one class per subsystem, braces on their own lines, minimal semicolons, explicit `setX()` construction methods, and singleton access for `Game`, `State`, and `View`.

Do not introduce a second renderer, a second animation loop, a general-purpose postprocessing framework, a PBR asset pipeline, or a new global state store merely to add one effect.

---

## 3. Architecture: simulation owns truth, view owns presentation

The project has three important layers:

1. **Game/orchestration** owns startup and the frame lifecycle.
2. **State** owns time, viewport, player, controls, sun, day cycle, weather, wind, terrain generation, chunks, waves, and gameplay entities.
3. **View** owns Three.js scenes, cameras, materials, geometry, render targets, particles, and audio/visual presentation.

The view is assembled as many focused subsystems. Construction order is meaningful: renderer and sky exist before consumers need the sky texture; terrain state exists before view terrain binds its data; shared effects such as particles are available to gameplay decorations. Each subsystem normally:

```js
export default class NewEffect
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.time = this.state.time

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        this.setDebug()
    }

    resize()
    {
        // Update screen-dependent uniforms or render targets.
    }

    update()
    {
        // Copy state into stable uniforms; do not recreate GPU resources.
    }
}
```

### Rules for agents

- Put gameplay decisions and durable world truth in `sources/Game/State`.
- Put meshes, points, render targets, shader materials, and render-only interpolation in `sources/Game/View`.
- Make one owner responsible for every GPU resource and event subscription.
- Cache references in constructors; avoid repeated singleton lookup inside hot loops.
- Wire `resize()` and `update()` into `View` when required.
- Dispose replaced geometries, materials, textures, and render targets.
- Use events to create/destroy render counterparts when state chunks/entities appear or disappear.
- Do not make a shader independently guess data already calculated by the CPU. Upload it.

---

## 4. Frame lifecycle and the shared visual clock

`View.update()` updates camera and visual systems in a deliberate sequence, then renders once. New effects should update uniforms before `Renderer.update()`.

Use the project time source, not scattered `Date.now()` calls. Distinguish:

- **elapsed time:** shader animation, phase, periodic noise;
- **delta time:** easing, integration, cooldowns, CPU motion;
- **day-cycle progress:** sun/sky/weather composition;
- **wind time:** coherent scrolling wind field;
- **event start time:** reproducible local progress for a particle/event slot.

Typical uniform update:

```js
this.material.uniforms.uTime.value = this.state.time.elapsed
this.material.uniforms.uSunPosition.value.copy(this.state.sun.position)
this.material.uniforms.uWindStrength.value = this.state.wind.strength
```

Prefer mutating existing vectors/colors with `.copy()` or `.set()` to allocating new objects each frame.

---

## 5. Shader-material pattern

Every custom material is a small factory in `View/Materials` and has a paired vertex/fragment shader directory.

```js
import * as THREE from 'three'
import vertexShader from './shaders/newEffect/vertex.glsl'
import fragmentShader from './shaders/newEffect/fragment.glsl'

export default function NewEffectMaterial()
{
    return new THREE.ShaderMaterial({
        uniforms:
        {
            uTime: { value: 0 },
            uSunPosition: { value: new THREE.Vector3() },
            uColor: { value: new THREE.Color('#ffffff') }
        },
        transparent: true,
        depthWrite: false,
        vertexShader,
        fragmentShader
    })
}
```

### Material-state decisions

- **Opaque terrain/props:** keep normal depth test/write.
- **Transparent particles/billboards:** usually `transparent: true`, `depthWrite: false`.
- **Light emission/glow:** additive blending, sparingly.
- **Colored translucent veil over bright sky:** normal alpha blending; additive blending will wash hues toward white/cyan.
- **Double-sided thin sheets:** `THREE.DoubleSide`.
- **Sky interior:** `THREE.BackSide`.
- **Inverted-hull outline:** `THREE.BackSide` after normal inflation.
- **Full-screen overlays:** disable depth test/write and use clip-space vertices.
- **Derivative face normals:** request derivatives where the Three.js/WebGL version requires it.

### Uniform discipline

- Give every uniform a valid type-compatible initial value.
- Treat uniforms as the public tuning API of an effect.
- Use semantic names and units (`uFallSpeed`, `uRippleRadius`, `uCoverage`).
- Keep the same concept identically named across materials (`uTime`, `uSunPosition`, `uFogTexture`).
- Prefer one shared texture carrying coherent spatial data over dozens of unrelated scalar uniforms.
- If using fixed-size GLSL arrays, keep JS and GLSL counts synchronized and choose a conservative constant.

### Shared shader partials

Reusable GLSL functions live in `shaders/partials`. Existing concepts include inverse lerp/remap, Perlin noise, time-of-day color, sun shade/reflection, fog, grass attenuation, 2D pivot rotation, and breaking-wave shape. If two materials must agree visually or spatially, extract or reuse one function instead of copying almost-the-same math.

---

## 6. The core rendering trick: sky texture as atmosphere bus

The sky is not only scenery. It is a low-resolution, screen-space source of atmospheric color for the whole scene.

### Pipeline

1. Render a sky sphere, clouds, and aurora into a separate scene and `WebGLRenderTarget`.
2. Use a cloned camera kept in sync with the main camera.
3. Render this target at a fraction of viewport resolution (currently roughly one third).
4. Draw its texture on a full-screen plane behind the main scene.
5. Pass the same texture into terrain, props, and other fogged materials.
6. In each material, derive screen UV from clip position and sample the texture.
7. Mix surface color toward sampled sky using exponential-squared depth fog.

Representative math:

```glsl
vec2 screenUv = (clipPosition.xy / clipPosition.w) * 0.5 + 0.5;
vec3 fogColor = texture2D(uFogTexture, screenUv).rgb;
float fogAmount = 1.0 - exp(-density * density * depth * depth);
color = mix(color, fogColor, fogAmount);
```

### Why this is powerful

- Distant geometry automatically matches sky gradients.
- Clouds and aurora influence haze without adding volumetric fog.
- Sunset and storms propagate through the world through one texture.
- A deliberately low-resolution target is inexpensive and aesthetically forgiving.

### Rules

- Preserve clip position and positive view depth as varyings.
- Sample after local lighting and before final output.
- Fog outlines too, so distant ink does not remain as harsh black specks.
- Do not fog full-screen sky layers back into themselves.
- Resize the target when the viewport changes.
- Keep render-target cameras synchronized in projection, rotation, and relevant transforms.

---

## 7. Sky, celestial bodies, and weather

### 7.1 Sky sphere

Use an inside-facing sphere. Compute vertical day/night gradients in the vertex or fragment stage, blend dawn by sun angle/elevation, then add a posterized sun halo. Stormness desaturates toward cool luma and lightning briefly lifts toward white.

The desired result is not a physically based atmosphere. It is a controllable gradient backdrop with hard graphic solar accents.

### 7.2 Sun and moon

The sun can be a distant billboard/disc while its normalized direction also drives every material. Keep the visible disc aligned with the state sun.

The moon is a shader-drawn graphic:

- a hard circular body;
- a second offset circle cuts out the phase;
- a narrow terminator/rim color;
- two stepped halo rings outside the body;
- alpha multiplied by nightness;
- discard nearly invisible pixels.

This same “large carrier quad/disc, shader draws crisp glyph” recipe is appropriate for magical signs, distant planets, badges, and other graphic celestial elements.

### 7.3 Stars

Use one `THREE.Points` geometry with per-star attributes:

- position on a sphere;
- size;
- restricted color;
- twinkle phase;
- twinkle speed;
- twinkle strength.

Make stars smaller near the sun direction and clip sub-pixel points in the vertex shader. Twinkle should be subtle for most stars; a minority may pulse visibly. Avoid fragment-level expensive star shapes unless the point sprites truly need them.

### 7.4 Clouds

Clouds live on an inner sphere in the sky render target. Build coverage from a few low-cost noise octaves, drift UV/domain coordinates slowly, and threshold/posterize the density into broad forms. Drive:

- coverage;
- softness;
- scale;
- 2D drift;
- opacity;
- stormness;
- lightning flash;
- sun direction/color.

Cloud animation should translate stable masses. Excessive evolving high-frequency noise causes texture boil and breaks the painted style.

### 7.5 Aurora

Use a back-sided spherical layer and normal alpha blending. In angular coordinates:

1. combine sparse noise bands for curtain rays;
2. slant the domain with height for folded curtains;
3. threshold strongly to retain dark gaps;
4. gate to a vertical band with a crisp lower hem and wispy crown;
5. multiply by a large-scale swell;
6. color by height: hot fringe, green body, teal middle, magenta crown;
7. add only slight hue drift;
8. control everything with an eased activity scalar.

Schedule aurora as a rare clear-night event, with randomized interval and duration. The scarcity is part of the effect.

### 7.6 Shooting stars and rare sky events

A simple distant plane can become a shooting star. Randomize a start/end direction, align the plane to its travel vector, and animate opacity with a brief attack/release. Do not maintain a costly always-on simulation for rare events.

### 7.7 Sun shafts

The shaft pass uses the existing sky target rather than a new occlusion scene:

1. project sun position to screen UV;
2. march a fixed number of taps from each pixel toward the sun;
3. measure warm bright texels;
4. let cloud texels carve gaps;
5. apply radial falloff around the sun;
6. posterize accumulated illumination into three hard bands;
7. render additively as a full-screen plane;
8. gate by sun visibility, day/weather, and on-screen position.

Keep tap count fixed and modest (the project uses 20). This is an intentionally stylized approximation, not full volumetric scattering.

---

## 8. Day cycle: one sun direction, many coordinated consequences

All visible systems should derive day/night behavior from the same sun state. Useful scalar gates:

```glsl
float dayness = smoothstep(-0.2, 0.2, uSunPosition.y);
float nightness = smoothstep(0.05, -0.25, uSunPosition.y);
float golden = smoothstep(0.35, 0.05, abs(uSunPosition.y))
             * smoothstep(-0.15, 0.05, uSunPosition.y);
```

Use these to coordinate:

- sky gradient and dawn;
- sun/moon/stars;
- terrain, vegetation, props, ribbons, and particle tint;
- lanterns, fireflies, campfires, and sparkles;
- aurora eligibility;
- sun shafts and rainbow visibility;
- ambient audio if appropriate.

Do not author separate arbitrary “night” timers for individual effects. One world should have one night.

---

## 9. Infinite terrain and coastal corridor

### 9.1 Spatial model

The world is an endless corridor along Z. A shared procedural profile provides, for each Z sample:

- shoreline X;
- biome weights;
- headland/cove information;
- terrain shaping controls.

The profile combines seeded noise with authored bands: ocean depth, beach, hills, mountains, highlands, coves/headlands, terraces, and sea stacks. Biomes change **amplitudes, widths, heights, and palettes**, while frequencies remain shared to prevent phase-sweep artifacts at blends.

### 9.2 Quadtree chunks and LOD

Terrain is divided into large main chunks around the player. Each chunk recursively splits toward the player to a minimum size. Parent/child readiness is staged so a visible parent remains until children are ready, preventing holes during asynchronous generation.

Implementation requirements:

- Split based on distance relative to chunk size.
- Track all four cardinal neighbors.
- Generate skirts or neighbor-aware edges to conceal differing LOD resolutions.
- Do not remove a parent until all replacement children are ready.
- When merging, create the parent and wait before destroying children.
- Only recompute chunk topology when the player crosses a meaningful grid boundary.
- Keep the active world bounded around the player even though the path is infinite.

### 9.3 Worker generation

Terrain height and normal generation is CPU-heavy and belongs in a Web Worker. Pass serializable parameters and transferable buffers. The main thread should create/update `BufferGeometry` only when a worker result arrives.

Most important: worker and main thread must share the same corridor algorithm, seed, offsets, and conventions. Never rewrite shoreline noise independently in a shader or view class.

### 9.4 Terrain data texture

Encode generated normal in RGB and elevation in A of a texture sampled by terrain and grass shaders. This lets:

- the terrain vertex shader classify materials by elevation/slope;
- grass vertices land exactly on terrain;
- grass reject steep, beach, and alpine regions;
- multiple visuals agree without duplicating terrain generation.

Choose float/half-float formats and filtering based on required precision and target support. Keep texture dimensions and UV mapping explicit in uniforms.

### 9.5 Corridor data texture

A one-dimensional lookup over a Z window packages shared profile values. In the current convention:

- R: shoreline X;
- G: volcanic weight;
- B: savanna weight;
- A: headland factor.

Upload `zMin` and `zRange`; sample with:

```glsl
float corridorUv = clamp((worldZ - uCorridorZMin) / uCorridorZRange, 0.0, 1.0);
vec4 corridor = texture2D(uCorridorTexture, vec2(corridorUv, 0.5));
```

The implicit golden weight is `1 - volcanic - savanna`. Terrain and grass use identical weights and palette arrays. Water may consume a narrower shoreline texture when only X is needed.

Refresh moving-window textures only after the player moves enough, a wave phase changes, or a slow heartbeat catches debug changes. Do not upload every frame without cause.

---

## 10. Terrain shading recipe

The terrain shader is deliberately classification-heavy and texture-light.

### Inputs

- generated normal and elevation texture;
- world position;
- sun direction;
- fog/sky texture;
- corridor profile/biome weights;
- arrays of sand/grass/rock colors;
- shoreline wave texture and CPU wave phases;
- grass draw distance and player position.

### Classification sequence

1. Compute slope: `1 - abs(dot(up, normal))`.
2. Blend biome palette by corridor weights.
3. Build wet sand from the active sand palette.
4. Blend wet beach to dry sand by elevation.
5. Blend grass above beach.
6. Blend alpine/rock by mountain elevation and slope.
7. Add snow above mountain-full elevation, reduced on very steep faces.
8. Force offshore elevated geometry to rock so sea stacks do not become grassy/sandy islands by accident.
9. Match the terrain under distant/attenuated grass to the darker grass base.
10. Apply waterline wetness and sparse foam.
11. Apply time-of-day tint.
12. Interpolate normals and masks to fragment stage.
13. In fragment stage, threshold wetness for a crisp edge, apply sun shade/reflection, selective wet gloss, and fog.

### Crucial detail: where to threshold

If a graphic boundary must cut cleanly *inside* triangles, send a smooth scalar varying and call `step()` in the fragment shader. Thresholding only at vertices smears or triangulates the edge unpredictably.

### Terrain palette guidance

- Sand: warm, pale, slightly desaturated.
- Grass: medium green with enough value separation from sand.
- Rock: neutral/cool and darker than sand.
- Volcanic: near-black warm/cool rock and restrained vegetation.
- Savanna: warm sand and yellow-green vegetation.
- Snow: slightly green/cream, not monitor-white.

---

## 11. Water: geometry, synchronization, foam, and interaction

Water is one of the strongest style carriers. Reproduce it as a coordinated system, not a stock ocean material.

### 11.1 Geometry

Use a large player-following plane biased toward the ocean side. Build an irregular graded grid:

- denser columns in the breaking-wave/shore band;
- coarser columns in distant open water;
- moderate row spacing along Z;
- deterministic jitter on interior vertices;
- fixed outer boundary vertices;
- indexed triangles.

This spends vertices where wave fronts need shape while maintaining faceted low-poly detail offshore. Mark the mesh `frustumCulled = false` if it follows the player and shader displacement makes its static bounds unreliable.

### 11.2 Vertex displacement

Combine:

1. three ambient sine components with different wavelengths, speeds, and Z modulation;
2. attenuation near shore;
3. two CPU-phased breaking-wave Gaussian-like bumps;
4. per-Z front jitter sampled from a data texture.

Breaking wave sets must use the same phase and shape parameters as terrain uprush. Shared math belongs in a GLSL partial such as `getWaveBump`.

### 11.3 Faceted shading

In the fragment shader derive a face normal from screen-space derivatives:

```glsl
vec3 faceNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
faceNormal *= sign(faceNormal.y);
```

This makes each irregular triangle a visible color facet even though the mesh does not carry flat normals after GPU displacement.

### 11.4 Color

- Blend shallow to deep by shore distance.
- Quantize the blend into a small number of steps.
- Increase opacity with depth.
- Apply time-of-day tint.
- Apply per-facet sun shade.
- Convert very strong specular response into a hard white “chip” with `step`, not a smooth PBR sparkle.
- Fog last.

### 11.5 Foam construction

Build one scalar `foam` with `max()` across graphic masks:

- solid scalloped shore-edge band;
- thin second outline ring;
- several offshore contour rings traveling shoreward;
- dashed whitewater bores after breaking sets;
- crest mask derived from positive shoreward wave slope;
- player breathing ripple and spreading rings;
- directional V wake;
- history-based churn rings;
- hashed rain splash rings.

Apply foam after water lighting so it remains flat, nearly unshaded white.

### 11.6 Stable dashes and scallops

Hash world-space cells, ring generations, or trail-drop IDs. The random pattern must stay attached to space/event identity. Animate only phase, ring radius, or front distance. If the hash includes raw elapsed time, the marks flicker incoherently.

A cheap stable hash is adequate:

```glsl
float h = fract(sin(cell * 127.1) * 43758.5453);
float visibleDash = step(h, coverage);
```

### 11.7 Player wake

Upload smoothed heading, strength, and a small fixed trail array. The analytic V wake uses along/across projections relative to heading. Trail entries contain position, spawn time, and alive flag. Old rings expand and lose dashes through stochastic dropout rather than smooth translucent fading.

### 11.8 Shore synchronization

This is non-negotiable:

- water samples the exact procedural shoreline generated for terrain;
- wave phase is computed once in state;
- water vertex bump, water foam bore, and terrain uprush consume that phase;
- wave jitter textures are shared;
- wet line recedes slowly after a wave;
- fresh-wave strength darkens new wet sand more strongly.

Independent water and beach animations will visibly slide apart and destroy the illusion.

---

## 12. Grass and vegetation

### 12.1 Dense grass strategy

Create many simple triangular blades/tufts in one geometry or instanced/draw-efficient structure. In the vertex shader:

1. map each blade to the correct terrain data texture quadrant;
2. sample elevation and normal;
3. place blade base at terrain height;
4. compute distance, slope, and elevation/biome attenuation;
5. collapse the blade to its center where grass should not exist;
6. identify tip vertices;
7. sway tips with a scrolling shared noise texture;
8. push tips away from the player within a radius;
9. darken the root and brighten the tip;
10. blend the same corridor biome colors as terrain;
11. apply time-of-day, sun shade, and restrained reflection.

Collapsing rejected geometry in the vertex shader avoids expensive CPU rebuilding as the player moves.

### 12.2 Wind coherence

Grass and props sample the same noise texture/domain and wind time. Props use lower amplitude and per-vertex `sway` weights so trunks stay planted while fronds/tips move.

### 12.3 Player interaction

Calculate horizontal vector from player to blade center. Use a smooth radius gate and tipness multiplier to bend away and slightly downward. Attenuate when the player is substantially above the ground so jumping/flying does not flatten vegetation below.

### 12.4 Prop outlines

For closed geometry:

1. draw the normal colored prop;
2. draw a second instance mesh with vertices inflated along normals;
3. render back faces only in a dark ink color;
4. apply identical instance transforms and wind sway;
5. fog the outline.

Do not apply inverted hulls to open strips such as palm fronds; they create broken silhouettes. The current pattern collapses selected high-sway/open triangles in the outline shader.

---

## 13. Procedural props and authored low-poly geometry

Prefer code-generated geometry and composable primitives where it preserves the style and avoids asset overhead. Useful rules:

- Assign vertex colors by semantic face/part.
- Use flat faces and limited radial segments.
- Randomize scale, yaw, lean, and palette within narrow ranges.
- Seed placement by chunk/world coordinates so revisiting an area reproduces it.
- Merge or instance repeated geometry.
- Store per-vertex sway weights for foliage.
- Give collision state only to forms that affect gameplay; decorative micro-detail stays view-only.
- Keep prop density sensitive to terrain slope, elevation, biome, shoreline, and landmarks.
- Reserve outline thickness proportional to the prop’s visual scale.

A procedural prop should have a recognizable silhouette before color and animation are applied.

---

## 14. Particle systems: pooled, attributed, and shader-shaped

The project uses GPU point sprites for wind streaks, spray puffs, sand puffs, curls, sparks, rain, stars, fireflies, lanterns, and sparkles.

### 14.1 Pool architecture

Preallocate typed arrays and `BufferAttribute`s for the maximum count. Reuse slots in a ring:

- base position;
- velocity;
- spawn time;
- lifetime;
- size;
- rotation;
- stretch;
- type;
- phase/speed/density where relevant.

On spawn, write one slot and mark only the affected attributes `needsUpdate`. The vertex shader computes age and clips dead or not-yet-born points by moving them outside clip space. Avoid creating and removing Three.js objects for individual particles.

### 14.2 Motion

Choose motion by type using numeric attributes and branchless masks where convenient:

- wind streak: damped drift plus gentle rise;
- spray/sand: ballistic velocity plus gravity;
- curl: steady drift;
- firefly: CPU/base wandering or shader-local phase;
- rain: wrap within a player-centered volume;
- lantern: slow upward drift and flicker.

### 14.3 Graphic fragment shapes

Use `gl_PointCoord` to draw recognizable hard-edged glyphs:

- curved brush stroke with taper;
- crisp puff disc;
- spiral plus tail;
- warm core plus dim halo;
- plump lantern body, cap, base, and internal flame;
- narrow rain streak.

A useful point-glyph sequence:

1. recenter `gl_PointCoord` around zero;
2. rotate into travel direction;
3. stretch local axes;
4. compute signed/implicit shape distances;
5. threshold shape into hard alpha;
6. add a small halo only for luminous effects;
7. multiply by short temporal fade and global opacity;
8. discard near-zero alpha if it helps fill cost.

### 14.4 Screen-size scaling

Perspective points use:

```glsl
gl_PointSize = worldSize * viewportScale / -viewPosition.z;
```

Update `viewportScale` on resize. Clip sub-pixel or inactive points early.

### 14.5 Density gates

Give each point a stable random density attribute. Compare it with a uniform threshold in the vertex shader. This makes particles join/leave one at a time as density changes without rebuilding buffers.

---

## 15. Fire, lanterns, fireflies, and glow hierarchy

### 15.1 Campfire flame

Use crossed or camera-readable planes and an opaque cutout shader:

- teardrop silhouette;
- drifting billow bumps on the edge;
- several nested hard color bands (outer orange-red, middle orange, cream core);
- animated sideways sway increasing with height;
- phase per plane/instance;
- optional spiral glyph clipped inside the flame.

Reserve additive blending for a separate glow disc and embers. The flame body itself should remain saturated and opaque; making everything additive washes out the banding.

### 15.2 Intensity composition

Drive flame height/visibility from nightness, rain damping, and local flicker. Use a minimum denominator before dividing shader coordinates by intensity.

### 15.3 Fireflies

Use warm point sprites with a crisp center, small dim halo, per-point phase, per-point flicker speed, density gate, night gate, and global opacity. Spawn them in plausible low vegetation zones, not uniformly across the world.

### 15.4 Lanterns

Draw the paper body as a point glyph with a brighter low internal flame, dim cap/base, subtle halo, and per-point alpha/flicker. Released/dead lantern slots can be parked far below the scene or clipped in the vertex shader.

### 15.5 Additive budget

Additive blending is for energy: glow discs, embers, firefly halos, sparkles, sun shafts. It should not be the default for all transparency. Too many additive layers flatten depth and turn the carefully controlled palette white.

---

## 16. Rain, storms, cyclones, rainbows, and conditional spectacle

### Rain

- Use one fixed point field centered on/following the player.
- Wrap drops through a box volume in the vertex shader.
- Slant fall direction from shared wind.
- Scale visible density/alpha with eased weather intensity.
- Feed the same rain intensity to water splash masks and flame damping.
- Keep depth write disabled.

### Storms and lightning

Weather state should provide smoothly changing stormness, rain intensity, and a short flash value. Sky sphere and clouds both consume flash so lightning feels like one atmospheric event. Do not add unrelated per-material random flashes.

### Cyclones

A cyclone can be a low-segment spiral/tapered mesh or stacked ribbons with shader-scrolling bands. Use transparent double-sided material, time-based scroll, pale weather-aware color, and a state-driven opacity. Keep collision/gameplay in state and spectacle in view.

### Rainbows

A large arch sheet can be drawn entirely from UV-space radial bands. Use hard color bands, normal alpha transparency, double-sided rendering, weather/sun visibility gate, and a vertical fade at the legs so the arch does not hard-clip into terrain. Rainbows should be conditional and infrequent enough to feel rewarding.

### General rare-event rule

Every spectacle needs:

- eligibility conditions;
- randomized next-time window;
- duration range;
- eased activity envelope;
- deterministic update path;
- graceful behavior when weather/time changes mid-event;
- no first-appearance shader compilation hitch.

---

## 17. Shader prewarming and first-use smoothness

Three.js compiles a shader program on its first visible render. Effects initially hidden—fireflies, sparkles, sun shafts, flames, cyclones, aurora-like events—can otherwise hitch the first time they appear.

At load:

1. traverse the scene;
2. remember invisible objects;
3. temporarily reveal them;
4. call `renderer.compile(scene, camera)`;
5. restore visibility.

When adding a hidden effect, ensure its mesh and material exist before prewarm. Lazy creation at first event defeats this optimization. If an effect has expensive geometry, preallocate/pool it too.

---

## 18. Performance budget and scaling strategy

### 18.1 Spend detail asymmetrically

- Dense mesh only in the near shoreline/wave band.
- Quadtree LOD for terrain.
- Low-resolution sky render target.
- Points for thousands of tiny luminous objects.
- Instancing/merged geometry for props.
- Vertex collapse/density gates rather than CPU rebuilds.
- Fixed small loops in shaders.
- Moving-window data textures instead of whole-world textures.

### 18.2 Avoid per-frame work

Do not per frame:

- allocate vectors/colors/arrays in large loops;
- recreate geometry or materials;
- compile shaders;
- upload unchanged textures;
- query object hierarchy repeatedly;
- update every `BufferAttribute` if only one slot changed;
- run terrain noise on the main thread;
- toggle thousands of individual object visibilities.

### 18.3 Transparency cautions

Transparent full-screen and particle effects cost fill rate. Keep them spatially limited, discard empty pixels, reduce render-target resolution, and avoid overlapping huge mostly-empty quads. `depthWrite: false` prevents bad occlusion but does not make blending order irrelevant.

### 18.4 Pixel ratio and resize

Use a clamped device pixel ratio. On resize update:

- renderer size/pixel ratio;
- camera projection;
- sky render target;
- point-size scale uniforms;
- full-screen aspect uniforms;
- any screen-space line thickness assumptions.

### 18.5 Determinism

Seed world layout, biome/profile offsets, prop placement, and stable visual hashes. Purely decorative event timing may use controlled randomness, but it should not cause spatial popping when chunks recycle.

---

## 19. Debug controls and art iteration

Expose high-value art parameters through the existing debug UI:

- colors/palette;
- coverage, intensity, opacity;
- distances and widths;
- wind strength/speed;
- wave amplitude/front/foam widths;
- outline thickness;
- particle size/density/lifetime;
- event interval/duration;
- fog density or render-target scale where safe.

Good debug controls modify uniforms or state values live. They should not force geometry recreation unless topology truly changes. If geometry must be rebuilt:

1. construct the replacement;
2. swap it onto the mesh;
3. dispose the old geometry;
4. preserve material and uniforms;
5. avoid rebuilding continuously while a slider drags if debouncing is possible.

Keep temporary debug colors, forced weather, and wireframes out of production defaults.

---

## 20. Recipe: adding a new coherent environmental effect

### Step 1 — write the visual contract

State in plain language:

- silhouette;
- palette;
- hard versus soft edges;
- motion source;
- time/weather/biome eligibility;
- player interaction;
- expected count and screen coverage;
- whether it emits light or only appears bright;
- which existing world data it must share.

### Step 2 — choose the cheapest representation

Ask in order:

1. Can a point glyph do it?
2. Can a billboard/plane shader do it?
3. Can an instanced low-poly mesh do it?
4. Does it need bespoke geometry?
5. Does it really need a render target or extra pass?

### Step 3 — place truth in State

If the effect affects gameplay, persistence, spawning, collisions, or shared weather timing, add state first. If it is decorative interpolation only, keep it in View.

### Step 4 — define material API

Create a material wrapper with semantic uniform defaults. Reuse partials and shared textures. Decide depth/blending/side explicitly.

### Step 5 — create persistent GPU resources

Allocate geometry, typed arrays, textures, and meshes in construction. Attach them before prewarming. Avoid first-event creation.

### Step 6 — bind shared world inputs

At minimum consider sun, time, fog texture, wind, player position, viewport scale, corridor data, terrain texture, waves, rain, and biome palette.

### Step 7 — implement update/resize

Mutate uniforms and only changed buffer regions. Clamp/ease state values. Follow camera/player if the effect is a bounded local volume.

### Step 8 — integrate lifecycle

Add construction and `update()`/`resize()` calls to `View`. Add disposal when the owning subsystem can be destroyed. Subscribe/unsubscribe to chunk/entity events.

### Step 9 — validate visual belonging

Check at noon, golden hour, night, rain, lightning, multiple biomes, near camera, horizon, stationary player, fast movement, and viewport resize.

### Step 10 — profile and prewarm

Confirm no first-use hitch, runaway draw calls, per-frame allocations, unexpected overdraw, or texture uploads.

---

## 21. Recipe: a new point-sprite glyph

1. Create one `BufferGeometry` with `position` plus stable per-point attributes.
2. Allocate typed arrays to maximum count.
3. Set unused spawn times/positions so they clip.
4. Create a `ShaderMaterial` with transparency and `depthWrite: false`.
5. In vertex shader calculate motion from base attributes and shared time.
6. Calculate perspective point size.
7. Move inactive points outside clip space.
8. Pass phase/type/progress to fragment shader.
9. In fragment shader transform `gl_PointCoord` into local glyph coordinates.
10. Use distance functions and thresholds for a crisp form.
11. Use additive blending only if it is actually luminous.
12. Update size scale on resize.
13. Recycle slots; do not instantiate one object per particle.

---

## 22. Recipe: a new outlined procedural prop

1. Design a strong low-poly closed silhouette.
2. Add vertex colors and normals.
3. Add a normalized `sway` attribute: zero at anchor, one near flexible tips.
4. Instance repeated props.
5. In the main shader apply instance transform, shared wind noise, time-of-day, sun shade, and fog.
6. Create an outline material using back faces and normal inflation.
7. Repeat **exactly the same wind displacement** in the outline vertex shader.
8. Fog outline color using clip-space sky sample.
9. Exclude open-strip triangles from inverted hull rendering.
10. Tune thickness at near and middle distance; verify it does not become black noise at the horizon.

---

## 23. Recipe: a new biome

1. Extend shared corridor biome weights; ensure weights remain normalized and blend smoothly.
2. Give it a wide enough Z interval to read as a region rather than color noise.
3. Reuse noise frequencies across biome boundaries.
4. Override only structural amplitudes/distances/heights where possible.
5. Define coordinated sand, grass, and rock colors.
6. Upload the new weight. If texture channels are exhausted, deliberately redesign packing—do not silently overload an unrelated channel.
7. Extend terrain palette arrays and grass palette arrays together.
8. Make prop/animal/event placement consume the same biome weight.
9. Test transitions from both neighboring biomes.
10. Check sea stacks, cliffs, beach width, grass elevation, waterline, fog, and nighttime palette.

---

## 24. Recipe: a new full-screen atmospheric pass

Before adding one, prove the sky target cannot already provide the result. If a pass is warranted:

1. Render one clip-space plane with depth disabled.
2. Reuse an existing render target if semantically correct.
3. Use fixed small sample loops.
4. Gate aggressively so alpha is zero when irrelevant.
5. Add radial/spatial bounds to prevent screen-wide wash.
6. Posterize the result to match the graphic style.
7. Update aspect and screen position on resize/frame.
8. Validate behind UI and at device pixel ratio extremes.
9. Measure fill-rate cost on small/mobile hardware.
10. Ensure the material is present during shader prewarm.

---

## 25. Common failure modes and corrections

### “It looks too realistic / generic Three.js”

**Symptoms:** smooth PBR gradients, glossy plastic, detailed photo textures, soft noise everywhere.

**Fix:** reduce material model, quantize transitions, expose facets, use hard masks, simplify palette, strengthen silhouette and graphic white accents.

### “It looks cheap instead of stylized”

**Symptoms:** arbitrary low polygon count, mismatched colors, jagged accidental edges, unrelated effects.

**Fix:** make simplification intentional. Coordinate sun/fog/palette, use stable art-directed thresholds, concentrate geometry where silhouettes need it, and remove noisy detail.

### “The effect boils or sparkles incorrectly”

**Cause:** animated time is part of the spatial hash/noise identity.

**Fix:** keep breakup static in world/event coordinates; animate phase/front/position only.

### “The shoreline slides apart”

**Cause:** terrain, water, and foam each approximate shore/waves separately.

**Fix:** share corridor and wave textures, CPU phase, and common shape math.

### “Transparent effects disappear or sort badly”

**Fix:** verify `transparent`, depth write/test, render order, side, and blending. Split opaque cutout body from additive glow when appropriate.

### “Outlines detach in wind”

**Cause:** main and outline shaders use different displacement.

**Fix:** use identical noise coordinates, wind time, amplitude, and sway weights.

### “Distant outlines remain black”

**Fix:** sample sky fog in outline shader using clip position/view depth.

### “Particles pop all at once when density changes”

**Fix:** stable per-particle density thresholds.

### “Hidden effect freezes the first time it appears”

**Fix:** instantiate it at load and include it in prewarming.

### “Frame time spikes while traveling”

**Fix:** worker terrain, stage chunk swaps, recycle resources, throttle topology checks and data-texture refresh, preallocate pools.

### “Night effects disagree”

**Fix:** derive all nightness gates from the shared sun/day cycle.

### “Colors wash to white”

**Fix:** reduce additive layers; use normal blending for colored transparent surfaces such as aurora; lower halo intensity.

### “Grass floats or grows underwater/on cliffs”

**Fix:** sample the exact terrain data texture and apply elevation, slope, distance, and biome attenuation in the vertex shader.

---

## 26. GLSL portability and correctness checklist

- Target the GLSL version generated/expected by the current Three.js stack.
- Avoid reserved identifiers (for example, `patch` is reserved in GLSL ES 3.0).
- Use compile-time constant loop bounds in WebGL-friendly shaders.
- Initialize every `out`/varying on every live path.
- Guard divisions with small nonzero minima.
- Normalize vectors where assumptions require it.
- Be explicit about world, view, model, and instance spaces.
- For instanced normals, verify transforms; nonuniform scale may require special handling.
- Remember texture color data versus numeric data may need different color-space treatment.
- Keep shader include paths consistent with `vite-plugin-glsl`.
- Test derivatives and float texture support on target devices.
- Do not use dynamic uniform array lengths.
- Keep point-size hardware limits in mind.
- Clip inactive vertices deliberately rather than leaving NaNs.
- Avoid high-frequency procedural detail that aliases at distance.

---

## 27. Visual QA matrix

Test every meaningful new visual in this matrix.

| Axis | Cases |
|---|---|
| Time | dawn, noon, golden hour, dusk, deep night |
| Weather | clear, overcast, rain onset, heavy rain, lightning, clearing |
| Biome | golden, volcanic, savanna, both transition zones |
| Camera | near ground, normal third person, fly/debug, horizon view |
| Motion | idle, walking, fast travel, jumping, entering/leaving water |
| Terrain | flat beach, steep slope, cliff, sea stack, LOD seam |
| Screen | narrow mobile, wide desktop, low/high DPR, resize while running |
| Lifecycle | initial load, first rare event, long session, chunk recycle |
| Performance | particle peak, rain + fire + water, many props, shader prewarm |

Questions to answer:

- Does it read from silhouette alone?
- Does it share the world’s palette and sun?
- Does fog integrate it at distance?
- Are hard edges intentional and stable?
- Is motion coherent with wind/weather/player?
- Does it remain legible without becoming visual noise?
- Does it compile and appear without a hitch?
- Does it allocate or upload unnecessarily each frame?

---

## 28. Testing and diagnostics for agents

At minimum after graphics changes:

1. Run the production build to catch GLSL import/compile bundling problems.
2. Run any headless verification suite available in the repository.
3. Start the app and inspect browser console for WebGL warnings.
4. Capture screenshots at representative time/weather states when the change is perceptible.
5. Compare before/after composition, not only the isolated object.
6. Inspect draw calls, triangles, points, programs, and texture memory via project stats/debug panels.
7. Force hidden/rare effects through debug controls.
8. Resize repeatedly.
9. Travel far enough to recycle chunks and corridor texture windows.
10. Leave it running long enough to expose particle-slot, event-scheduling, or float-time issues.

For shader debugging, temporarily output one scalar at a time:

```glsl
gl_FragColor = vec4(vec3(mask), 1.0);
```

Useful debug outputs are shore distance, biome weights, slope, elevation, wetness, face normal remapped to 0–1, fog amount, nightness, event activity, and particle progress. Remove diagnostic output before committing.

---

## 29. File-placement guide

Use these locations consistently:

```text
sources/Game/State/NewEffect.js
    Durable effect logic, scheduling, world truth, collisions, gameplay.

sources/Game/View/NewEffect.js
    Geometry, mesh/points, texture ownership, uniform updates, presentation.

sources/Game/View/Materials/NewEffectMaterial.js
    ShaderMaterial factory and uniform defaults.

sources/Game/View/Materials/shaders/newEffect/vertex.glsl
sources/Game/View/Materials/shaders/newEffect/fragment.glsl
    GPU behavior and drawing.

sources/Game/View/Materials/shaders/partials/sharedFunction.glsl
    Math that multiple shaders must share exactly.

sources/Game/Workers/...
    Expensive procedural CPU work that would stall the main thread.
```

Avoid giant “effects utility” files that hide ownership. Reuse small shader partials and explicit shared state/data textures instead.

---

## 30. A compact style constitution

When forced to choose, choose:

- **readability** over realism;
- **silhouette** over texture;
- **facets** over smoothness;
- **bands** over continuous gradients;
- **stable marks** over boiling noise;
- **one shared world signal** over duplicated approximations;
- **GPU animation** over CPU updates for dense repeated visuals;
- **pooled resources** over transient objects;
- **rare spectacle** over constant spectacle;
- **coherent atmosphere** over isolated effects;
- **measured simplicity** over framework expansion.

---

## 31. Definition of done for another AI agent

A graphics task is complete only when all applicable statements are true:

- [ ] The effect has a written visual contract and belongs to the established shape/color/motion language.
- [ ] State and view responsibilities are correctly separated.
- [ ] It consumes shared time, sun, wind, weather, fog, terrain, shoreline, and biome data where relevant.
- [ ] Its geometry representation is the cheapest one that preserves the silhouette.
- [ ] Shader uniforms are semantic, initialized, and updated without per-frame allocation.
- [ ] Transparency, depth, side, blending, and render order are intentional.
- [ ] Graphic breakup is stable in world/event space.
- [ ] Terrain/water/shore interactions use shared data rather than duplicated noise.
- [ ] Dense elements are instanced, merged, pooled, or point-based.
- [ ] Hidden materials are compiled during prewarm.
- [ ] Resize behavior is implemented.
- [ ] Replaced resources are disposed and event listeners have a clear owner.
- [ ] Production build passes.
- [ ] Headless checks pass or any unrelated/environment limitation is documented.
- [ ] Visual QA covers time, weather, biome, camera, motion, and viewport cases.
- [ ] A perceptible web change has screenshots or equivalent visual evidence.
- [ ] No debug overrides or shader diagnostic colors remain.

---

## 32. Final instruction to implementing agents

Do not copy only the obvious surface features—the cel shading, low polygons, or bright water. The quality comes from **coordination**. Sky becomes fog. Sun becomes palette, shade, stars, moon, fireflies, and shafts. Wind becomes grass, props, rain, particles, and water character. The corridor becomes terrain, shoreline, water, vegetation, biomes, props, and encounters. Wave phase becomes geometry, foam, uprush, and wet sand. Player motion becomes push, ripple, wake, spray, footprints, and wildlife reaction.

That reuse of a few meaningful signals creates a world that feels authored and alive while remaining technically economical. Preserve that principle above all others.
