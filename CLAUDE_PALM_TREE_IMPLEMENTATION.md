# CLAUDE — How to Implement the Palm Tree

> A focused companion to
> [`CLAUDE_VISUAL_STYLE_AND_TECHNICAL_APPROACH_AGENT_INSTRUCTIONS.md`](./CLAUDE_VISUAL_STYLE_AND_TECHNICAL_APPROACH_AGENT_INSTRUCTIONS.md).
> That doc covers the whole world; this one is a deep, self-contained walkthrough of a
> single prop — the leaning beach **palm tree** — from raw geometry to wind, ink outline,
> and deterministic scattering. If you understand the palm, you understand the entire
> prop system, because conifers and boulders are the same machinery with different knobs.

**Files involved**

| File | Role |
| --- | --- |
| `sources/Game/View/PropsGeometry.js` | `buildPalm()` — constructs the mesh (trunk + fronds), bakes `color` + `sway`. |
| `sources/Game/View/Props.js` | wires the palm layer's config, materials, and wind uniforms. |
| `sources/Game/View/PropsLayer.js` | generic instanced-mesh scatterer (placement, collisions, outline). |
| `sources/Game/View/Materials/PropsMaterial.js` | the surface `ShaderMaterial`. |
| `sources/Game/View/Materials/PropsOutlineMaterial.js` | the inverted-hull ink outline material. |
| `sources/Game/View/Materials/shaders/props/{vertex,fragment}.glsl` | surface shading + wind. |
| `sources/Game/View/Materials/shaders/propsOutline/{vertex,fragment}.glsl` | outline + frond collapse. |

---

## 1. Anatomy & design intent

A palm is deliberately cheap and stylized:

- **A bent 5-sided cylinder trunk** — pentagonal cross-section reads as chunky/low-poly,
  and a quadratic bend leans it **seaward** so a beach lined with palms all curve toward
  the water (a Wind-Waker framing trick).
- **Two layers of drooping plane fronds** — a long outer skirt and a shorter inner crown,
  rotated so they interleave into a full canopy from one draw call.
- **No textures.** Color is baked per-vertex (dark trunk → green fronds with a lighter tip).
- **A `sway` attribute per vertex** (0 at the root, ~1 at the frond tips) that the shader
  uses to bend only the canopy in the wind while the trunk base stays planted.
- **A shared ink outline** via the inverted-hull technique — with a special "collapse"
  rule so the open frond planes don't balloon into visible shells.

Everything obeys the project's rules: flat faceted shading, `getSunShade` blue-tinted
shadows, screen-space sky fog, per-vertex color, procedural wind. See the main style guide
§1 and §4.

---

## 2. Geometry: `buildPalm()`

Full source (`PropsGeometry.js`):

```js
export const buildPalm = () =>
{
    const parts = []

    // --- TRUNK ---------------------------------------------------------------
    // Bent toward +X (seaward). Instances must keep yaw small to preserve the lean.
    const trunkHeight = 6
    const lean = 1.8
    const trunk = new THREE.CylinderGeometry(0.14, 0.24, trunkHeight, 5, 6, true)
    //                                        ^topR ^botR  ^height  ^5 sides ^6 rings ^open-ended
    trunk.translate(0, trunkHeight * 0.5, 0)   // move base to y=0 (cylinders are centered)

    {
        // Quadratic lean: displacement grows with t² up the trunk, so the base is
        // vertical and the crown swings out — an eased curve, not a straight tilt.
        const positions = trunk.attributes.position
        for(let i = 0; i < positions.count; i++)
        {
            const t = positions.getY(i) / trunkHeight     // 0 at base → 1 at top
            positions.setX(i, positions.getX(i) + t * t * lean)
        }
    }

    parts.push(addAttributes(
        trunk,
        (x, y) => [0.36 + y * 0.008, 0.27 + y * 0.006, 0.19],   // brown, subtly lighter up high
        (x, y) => Math.pow(y / trunkHeight, 2) * 0.25           // sway: stiff, only the upper trunk moves a little
    ))

    // --- FRONDS --------------------------------------------------------------
    // Two layers: a long drooping outer skirt and a shorter, flatter inner crown
    // rotated between the outer fronds so they overlap into a full canopy.
    const frondLayers = [
        { count: 9, length: 2.6, width: 1.4, droop: 1.1, yOffset: - 0.1, angleOffset: 0 },
        { count: 7, length: 1.7, width: 1.1, droop: 0.5, yOffset: 0.18, angleOffset: 0.38 }
    ]

    for(const layer of frondLayers)
    {
        for(let f = 0; f < layer.count; f++)
        {
            // A flat blade lying in the XZ plane, pivot at the trunk (one end)
            const frond = new THREE.PlaneGeometry(layer.length, layer.width, 4, 1)
            frond.rotateX(- Math.PI * 0.5)              // stand the plane flat (horizontal)
            frond.translate(layer.length * 0.5, 0, 0)   // shift so x=0 is the attached end

            // Shape the blade: droop the far end downward (t^1.7) and taper its
            // width toward the tip (×(1 - t*0.7)) → a leaf, not a rectangle.
            const positions = frond.attributes.position
            for(let i = 0; i < positions.count; i++)
            {
                const t = positions.getX(i) / layer.length          // 0 root → 1 tip
                positions.setY(i, positions.getY(i) - Math.pow(t, 1.7) * layer.droop)
                positions.setZ(i, positions.getZ(i) * (1 - t * 0.7))
            }

            const withAttributes = addAttributes(
                frond,
                (x) => {                                            // green, lighter toward the tip
                    const t = x / layer.length
                    return [0.20 + t * 0.12, 0.38 + t * 0.14, 0.16 + t * 0.06]
                },
                (x) => 0.3 + (x / layer.length) * 0.7               // sway: 0.3 at root → 1.0 at tip
            )

            // Fan the fronds around the trunk (+ a little irregular jitter per index),
            // then lift them to the crown and push out to match the leaned trunk top.
            withAttributes.rotateY((f / layer.count) * Math.PI * 2 + f * 0.35 + layer.angleOffset)
            withAttributes.translate(lean, trunkHeight + layer.yOffset, 0)
            parts.push(withAttributes)
        }
    }

    const merged = mergeBufferGeometries(parts)   // trunk + 16 fronds → ONE geometry
    merged.computeVertexNormals()                 // faceted normals for flat toon shading
    return merged
}
```

### Why each choice matters

- **`CylinderGeometry(0.14, 0.24, 6, 5, 6, true)`** — 5 radial segments = pentagon (chunky,
  low-poly); wider at the base (0.24) than the top (0.14); `openEnded = true` so there are
  no end caps to waste triangles (they're never seen).
- **`t * t * lean`** — a *quadratic* bend. Linear would look like a snapped pole; squaring
  keeps the base vertical and accelerates the curve near the crown, reading as organic weight.
  `lean = 1.8` world units of horizontal offset at the top.
- **Fronds are `PlaneGeometry`** with 4 length-segments so the `Math.pow(t, 1.7)` droop
  curve is smooth. `rotateX(-π/2)` + `translate(length*0.5)` puts the pivot at the attached
  end so rotation fans them around the trunk.
- **Two layers, offset counts/angles** (9 outer + 7 inner, `angleOffset 0.38`) — the inner
  crown sits *between* the outer fronds, filling gaps into a dense canopy without doubling
  the frond count in one ring.
- **`translate(lean, trunkHeight + yOffset, 0)`** — the canopy is moved to `x = lean` so it
  sits on top of the *leaned* trunk, not the original vertical axis.
- **One merged geometry + `computeVertexNormals()`** — the entire palm is a single buffer
  (one instanced draw call), and recomputing normals after merge gives the hard, faceted
  facets the toon look depends on.

---

## 3. The `addAttributes` helper (color + sway baking)

Every prop part is funneled through this so it carries the two custom attributes the shader
needs. This is the general pattern for baking per-vertex data cheaply:

```js
const addAttributes = (geometry, color, swayGetter) =>
{
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry  // flat facets
    const positions = nonIndexed.attributes.position
    const count = positions.count

    const colors = new Float32Array(count * 3)
    const sway = new Float32Array(count)

    for(let i = 0; i < count; i++)
    {
        const y = positions.getY(i)
        // `color` may be a constant [r,g,b] or a function of (x,y,z)
        const c = typeof color === 'function' ? color(positions.getX(i), y, positions.getZ(i)) : color
        colors[i * 3]     = c[0]
        colors[i * 3 + 1] = c[1]
        colors[i * 3 + 2] = c[2]
        sway[i] = swayGetter ? swayGetter(positions.getX(i), y, positions.getZ(i)) : 0
    }

    nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    nonIndexed.setAttribute('sway',  new THREE.BufferAttribute(sway, 1))
    return nonIndexed
}
```

- **`toNonIndexed()` first** — indexed geometry shares vertices between triangles, which
  would smooth normals and bleed colors across facets. Un-indexing gives every triangle its
  own 3 vertices → crisp flat shading and hard color boundaries.
- **`color` as a function of position** — this is how the trunk gets a subtle vertical
  gradient and the fronds brighten toward the tip, all baked, zero runtime cost.
- **`sway` is the wind mask.** Root vertices get ~0 (planted), frond tips get ~1 (whip in
  the wind). The trunk's `sway = pow(y/height, 2) * 0.25` keeps it nearly rigid.

---

## 4. Surface material & shading (`props/*.glsl`)

`PropsMaterial` is a `ShaderMaterial` with `vertexColors: true` and `side: THREE.DoubleSide`
(fronds are single-sided planes and must show from both faces). Uniforms: `uSunPosition`,
`uFogTexture`, `uNoiseTexture`, `uWindTime`, `uWindStrength`.

**All shading is per-vertex** — the fragment shader is one line. Vertex shader
(`props/vertex.glsl`), abbreviated:

```glsl
attribute float sway;
varying vec3 vColor;

void main()
{
    vec4 worldPosition  = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec4 originPosition = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // Wind sway: scroll a tiling noise texture by world XZ + time, bend by `sway`.
    // Stiffer than grass (amplitude 0.03→0.4) and only the tips (high sway) move much.
    vec2 noiseUv = originPosition.xz * 0.02 + uWindTime * 0.05;
    vec4 noiseColor = texture2D(uNoiseTexture, noiseUv);
    float windAmplitude = mix(0.03, 0.4, uWindStrength) * sway;
    worldPosition.x += (noiseColor.x - 0.5) * windAmplitude;
    worldPosition.z += (noiseColor.y - 0.5) * windAmplitude;

    vec4 viewPosition = viewMatrix * worldPosition;
    float depth = - viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;

    vec3 worldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);

    vec3 outputColor = color;                 // the baked vertex color
    #ifdef USE_INSTANCING_COLOR
        outputColor *= instanceColor;         // per-instance tint (see §5)
    #endif

    // The canonical toon surface chain:
    outputColor = getTimeOfDayColor(outputColor);                     // golden/night grade
    outputColor = getSunShadeColor(outputColor, getSunShade(worldNormal)); // blue half-lambert
    vec2 screenUv = (gl_Position.xy / gl_Position.w * 0.5) + 0.5;
    outputColor = getFogColor(outputColor, depth, screenUv);          // melt into the sky

    vColor = outputColor;
}
```

```glsl
// props/fragment.glsl — everything already computed per-vertex
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }
```

Notes:

- **Wind pivots around the instance origin** (`originPosition.xz`), so every palm in a clump
  samples the same noise cell and sways coherently, and the `sway` attribute means the trunk
  base barely moves while the canopy swings.
- The wind idiom is identical to grass (main style guide §11) but stiffer — palms are wood,
  not blades.
- The material shares one `uNoiseTexture` (a 128×128 tiling Perlin render target from
  `View/Noises`) across all prop families.

---

## 5. The ink outline (inverted hull + frond collapse)

This is the signature toon rim. `Props.js` gives the palm its own outline material because
palms need the frond-collapse behavior that solid props don't:

```js
this.outlineMaterials = {
    palm:    new PropsOutlineMaterial({ thickness: 0.05, swayCollapse: 0.28 }),
    conifer: new PropsOutlineMaterial({ thickness: 0.05 }),   // swayCollapse defaults to 999
    boulder: new PropsOutlineMaterial({ thickness: 0.05 })
}
```

`PropsOutlineMaterial` is `side: THREE.BackSide`, ink color `#1c1713`. `PropsLayer` builds a
**second `InstancedMesh` with the same geometry that shares the surface mesh's instance
matrix buffer** — so the outline tracks every instance for free:

```js
this.outlineMesh = new THREE.InstancedMesh(options.geometry, options.outlineMaterial, options.capacity)
this.outlineMesh.instanceMatrix = this.mesh.instanceMatrix   // SHARED — zero extra CPU upkeep
```

Outline vertex shader (`propsOutline/vertex.glsl`):

```glsl
uniform float uThickness;
uniform float uSwayCollapse;
attribute float sway;

void main()
{
    // Inverted hull: push each vertex OUT along its normal in object space, so the
    // shell thickness scales with each instance's matrix.
    vec3 displaced = position + normal * uThickness;
    vec4 worldPosition  = modelMatrix * instanceMatrix * vec4(displaced, 1.0);
    vec4 originPosition = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // Re-run the EXACT same wind sway as the surface so the ink tracks the sway.
    vec2 noiseUv = originPosition.xz * 0.02 + uWindTime * 0.05;
    vec4 noiseColor = texture2D(uNoiseTexture, noiseUv);
    float windAmplitude = mix(0.03, 0.4, uWindStrength) * sway;
    worldPosition.x += (noiseColor.x - 0.5) * windAmplitude;
    worldPosition.z += (noiseColor.y - 0.5) * windAmplitude;

    vec4 viewPosition = viewMatrix * worldPosition;
    vViewDepth = - viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;
    vClipPosition = gl_Position;

    // Collapse open-strip parts (the palm fronds). Inverted hulls artifact on
    // single-sided geometry, so degenerate those triangles to a point offscreen.
    if(sway > uSwayCollapse)
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
```

**How the inverted hull makes a line:** only *back* faces are drawn (`BackSide`). On a
closed volume (the trunk), the inflated shell is hidden behind the front faces everywhere
*except* where it pokes past the silhouette — producing a uniform dark rim of width
`uThickness`. Because the displacement is in **object space**, the rim scales naturally with
each instance's scale.

**Why the frond collapse is needed:** a `PlaneGeometry` frond is an open surface — inflating
it along its normals balloons it into a visible double-sided shell instead of a clean edge.
So the palm sets `swayCollapse = 0.28`: any vertex with `sway > 0.28` (i.e. everything on the
fronds, which start at 0.3) is thrown offscreen in the *outline* pass. Result: **the trunk
gets a crisp ink outline; the fronds are simply not outlined.** Solid props (conifer,
boulder) leave `swayCollapse = 999` so nothing collapses.

Outline fragment shader just fogs the ink so distant palms' outlines melt into haze rather
than staying as harsh black dots:

```glsl
vec2 screenUv = (vClipPosition.xy / vClipPosition.w) * 0.5 + 0.5;
gl_FragColor = vec4(getFogColor(uColor, vViewDepth, screenUv), 1.0);
```

---

## 6. Placement & instancing (`PropsLayer` config)

The palm layer's knobs (`Props.js`):

```js
this.palms = new PropsLayer({
    name: 'palm',
    geometry: buildPalm(),
    material: this.material,
    outlineMaterial: this.outlineMaterials.palm,
    capacity: 48,           // max simultaneous palms (instanced mesh size)
    rowSize: 24,            // world-Z band per placement row
    perRow: 1,              // candidate palms per row (sparse)
    probability: 0.7,       // 70% of candidates actually spawn
    inlandMin: 6,           // placed 6–18 units inland from the shoreline...
    inlandMax: 18,
    minElevation: 0.8,      // ...but only on dry sand (just above the waterline)
    maxElevation: 6,        // ...and not up the hills
    radius: 192,            // rebuild window around the player
    biomeDensity: (weights) => 1 - weights[1] * 0.95,   // avoid the volcanic biome
    composeTransform: (dummy, r, x, y, z) =>
    {
        dummy.position.set(x, y - 0.15, z)               // sink slightly into the sand
        dummy.rotation.set(0, (r[4] - 0.5) * 0.8, - r[5] * 0.15)  // SMALL yaw + tiny tilt
        const scale = 0.75 + r[6] * 0.5                  // 0.75–1.25× size variety
        dummy.scale.set(scale, scale, scale)
    },
    collision: (dummy) => ({ radius: 0.4 * dummy.scale.x, height: 6 * dummy.scale.y }),
    tint: (color, r) => color.setScalar(0.9 + r[7] * 0.2) // subtle per-tree brightness jitter
})
```

**Deterministic placement** (`PropsLayer.rebuild()`): for each world row it seeds an RNG with
`` `${seed}:props:palm:${row}` `` and **always draws a fixed 8 randoms per candidate**
(`r[0..7]`), even when it skips one — so the stream never shifts and the same palms appear at
the same spots on every visit, independent of chunk LOD. `x` is derived from
`terrains.getShoreX(z) - inland` so palms follow the meandering shoreline, and `y` comes from
the same interpolated worker elevations the player physics uses, so they sit exactly on the
visible ground. The layer only rebuilds when the player moves more than `rowSize`, or retries
shortly if a needed chunk isn't baked yet.

**⚠️ Keep yaw small.** The lean is *baked into the geometry* pointing +X (seaward). The
placement uses only `(r[4] - 0.5) * 0.8` rad of yaw (≈ ±23°) so palms always lean roughly
toward the water. A full `0..2π` yaw (as conifers use) would send some palms leaning inland
and break the beach silhouette.

---

## 7. Per-frame wiring (`Props.update()`)

Each frame the palm's materials get the current sun and wind, and every layer updates
(rebuilding only if the player crossed a row):

```js
this.material.uniforms.uSunPosition.value.set(sun.position.x, sun.position.y, sun.position.z)
this.material.uniforms.uWindTime.value = wind.windTime
this.material.uniforms.uWindStrength.value = wind.strength

for(const outlineMaterial of Object.values(this.outlineMaterials))
{
    outlineMaterial.uniforms.uWindTime.value   = wind.windTime      // keep outline sway in lockstep
    outlineMaterial.uniforms.uWindStrength.value = wind.strength
}

for(const layer of this.layers) layer.update()
```

The outline **must** receive the same `uWindTime`/`uWindStrength` as the surface, or the ink
rim would drift off the swaying trunk.

---

## 8. Reproduce it from scratch — the recipe

1. **Trunk:** open-ended `CylinderGeometry` with ~5 radial segments; move base to `y=0`;
   displace `x += (y/H)² * lean` for an eased seaward bend.
2. **Fronds:** for two layers (long+droopy, short+flat), make N `PlaneGeometry` blades;
   stand them flat (`rotateX(-π/2)`), pivot at one end, droop the tip (`y -= t^1.7 * droop`)
   and taper the width (`z *= 1 - t*0.7`); `rotateY` to fan around the trunk with a per-index
   jitter and a layer `angleOffset`; translate up to the (leaned) crown.
3. **Bake attributes** on every part: `toNonIndexed()`, then a `color` (trunk brown gradient,
   frond green brightening to the tip) and a `sway` (trunk `(y/H)²*0.25`, frond `0.3 + t*0.7`).
4. **Merge** all parts into one geometry and `computeVertexNormals()` for facets.
5. **Surface material:** `ShaderMaterial`, `vertexColors`, `DoubleSide`; noise-scroll wind
   scaled by `sway`; run `getTimeOfDayColor → getSunShadeColor(getSunShade) → getFogColor`
   per vertex; fragment just outputs `vColor`.
6. **Outline:** a second instanced mesh sharing the instance matrix, `BackSide`,
   `position + normal * thickness`, same wind; collapse verts with `sway > 0.28` so the open
   fronds aren't outlined; fog the ink.
7. **Scatter:** deterministic per-row seeded RNG, fixed 8 draws per candidate, place along the
   shoreline on dry sand, small yaw to preserve the lean, per-instance scale + tint, rebuild
   on player movement.

---

## 9. Pitfalls specific to the palm

- **Don't randomize full yaw.** The lean is baked seaward; large yaw breaks the look
  (see §6). This is why palms use `composeTransform` yaw of ±0.4 rad, not `r*2π`.
- **Fronds must be `DoubleSide`** or they vanish when viewed from below/behind.
- **Fronds must NOT get an inverted-hull outline** — collapse them via `swayCollapse`
  (0.28) or they balloon into visible dark shells (open-geometry artifact).
- **`toNonIndexed()` before baking color/normals**, or colors bleed and normals smooth,
  killing the faceted toon look.
- **Recompute normals after the lean displacement and after merge**, not before, or the
  shading won't match the bent geometry.
- **Keep the outline's wind uniforms synced** with the surface every frame, or the ink
  detaches from the tree.
- **`sway` ranges must line up with `swayCollapse`.** Fronds start at `sway = 0.3`; the
  collapse threshold is `0.28`. If you lower frond sway below the threshold, the fronds will
  suddenly get outlined again.

---

*Companion to the main visual style guide. The palm is the canonical example of the prop
pipeline: bake geometry + color + sway once, shade flat per-vertex, outline with a shared
inverted hull, and scatter deterministically along the shore.*
