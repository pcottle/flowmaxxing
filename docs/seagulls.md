# How to Build the Seagulls 🐦

A recipe, written for another AI coding model, for recreating the flock of cute
seagulls that wheel over the beach in this project. It covers three things:

1. **What they look like** — the geometry that makes a gull out of ~14 triangles.
2. **How they flap and bank** — the per-frame animation.
3. **How they move around the world** — the flocking, following, and day/night behavior.

Everything lives in one self-contained class: `sources/Game/View/Seagulls.js`.
It's built on [Three.js](https://threejs.org/) and uses `InstancedMesh` so the
whole flock is only **three draw calls** no matter how many birds are on screen.

The aesthetic to aim for: **toon / Wind Waker**. Flat, unlit white darts with
black wingtips, seen from a distance, reading instantly as "seagull" through
silhouette and motion rather than detail. Don't model feathers. Model a feeling.

---

## 1. Visual design — a gull is three pieces

Each bird is assembled from **three separate instanced meshes** that share one
material: a **body**, a **right wing**, and a **left wing**. They're kept apart
so the wings can rotate independently for flapping while the body stays rigid.

### The body — a white cone "dart"

```js
// Body: white dart, nose pointing along +z
this.bodyGeometry = new THREE.ConeGeometry(0.16, 0.7, 5)
this.bodyGeometry.rotateX(Math.PI * 0.5)   // lay the cone down so it points forward (+z)
```

- A 5-sided cone, radius `0.16`, length `0.7`. Low poly on purpose — the facets
  catch light like a paper bird.
- It's rotated so the **nose points along +z**, which becomes the bird's
  "forward." Every heading calculation later assumes forward = +z.
- A per-vertex `color` attribute is added and **filled with pure white** (`1,1,1`).
  Vertex colors (not the material color) let the wings be part-black while the
  body stays white, all under one material.

### The wings — swept strips with a hard black tip

The right wing is a flat strip built from **four triangles (two quads)** laid out
in the XZ-ish plane, sweeping outward from the body (+x) and tapering back (−z).
The trick that sells it is the **hard color seam**: the inner half is white, the
outer half is near-black, and the two halves *do not* share vertices — the middle
points are duplicated so the color snaps from white to black with no gradient.

```js
const white = [1, 1, 1]
const black = [0.05, 0.05, 0.08]   // near-black with a faint blue bias

// wing profile points, from root (near body) to tip (far, swept back):
const v0 = [0.02, 0,     0.18]   // inner leading edge
const v1 = [0.02, 0,    -0.17]   // inner trailing edge
const m0 = [0.52, 0.035, 0.02]   // mid leading  (slightly raised → dihedral)
const m1 = [0.52, 0.035,-0.2]    // mid trailing
const t0 = [0.78, 0.06, -0.06]   // tip leading  (raised more)
const t1 = [0.78, 0.06, -0.22]   // tip trailing

const wingPositions = [
    ...v0, ...v1, ...m0,     // inner quad  ┐ white
    ...v1, ...m1, ...m0,     //             ┘
    ...m0, ...m1, ...t0,     // outer quad  ┐ black
    ...m1, ...t1, ...t0      //             ┘
]
const wingColors = [
    ...white, ...white, ...white,
    ...white, ...white, ...white,
    ...black, ...black, ...black,   // note: m0/m1 appear again here as BLACK,
    ...black, ...black, ...black    // so the seam is crisp, not blended
]
```

Key shaping details, all of which matter for the "cute" read:

- **Sweep**: x goes `0.02 → 0.52 → 0.78`, so the wing reaches out and the tip is
  furthest from the body.
- **Rake**: z drifts negative toward the tip, so the wing sweeps *backward* like a
  gull in a glide, not straight out like a plane.
- **Dihedral**: y rises `0 → 0.035 → 0.06` from root to tip, giving a gentle
  upward "V." This is what makes the silhouette read as a soaring bird.
- **Black wingtips**: the classic herring-gull marking, and the single most
  important detail for legibility at distance.

The **left wing is a mirror**, made by cloning the right geometry and scaling it
by −1 on x:

```js
this.wingGeometryMirror = this.wingGeometry.clone()
this.wingGeometryMirror.scale(-1, 1, 1)
```

> ⚠️ Mirror the *geometry*, don't just use a negative-scale instance matrix. A
> negative scale flips triangle winding order, which breaks lighting/culling.
> Pre-mirroring the geometry keeps the winding correct.

### The material — one flat, unlit material for everything

```js
this.material = new THREE.MeshBasicMaterial({
    vertexColors: true,      // body white, wingtips black, all from vertex colors
    side: THREE.DoubleSide   // wings are paper-thin; visible from above and below
})
```

`MeshBasicMaterial` is **unlit** — it ignores scene lighting entirely. That's
deliberate for the toon look and for performance. Since there's no lighting to
darken the birds at night, the code fakes it by tinting the material color over
the day (see §3, "Day tint").

### Instancing — the whole flock in three draws

```js
this.capacity = 20   // max birds ever
this.count = 14      // birds actually shown

this.body      = new THREE.InstancedMesh(this.bodyGeometry,       this.material, this.capacity)
this.wingRight = new THREE.InstancedMesh(this.wingGeometry,       this.material, this.capacity)
this.wingLeft  = new THREE.InstancedMesh(this.wingGeometryMirror, this.material, this.capacity)

for(const mesh of [this.body, this.wingRight, this.wingLeft]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage) // matrices change every frame
    mesh.frustumCulled = false                            // flock wraps around the camera
    mesh.count = this.count
    scene.add(mesh)
}
```

Each bird is one "instance" index shared across the three meshes: body `i`, right
wing `i`, and left wing `i` are all placed at the same spot each frame. Allocate
`capacity` but only render `count`, so the flock size can be tuned live without
reallocating buffers.

---

## 2. Animation — flapping, gliding, and banking

All animation is procedural (no keyframes, no skeletons). Every frame, for each
bird, you compute a fresh transform and write it into the three instance
matrices. Three helpers drive it:

- a **`dummy`** `Object3D` (rotation order `'YXZ'`) used to build the body matrix,
- a **`wingDummy`** used to build each wing matrix,
- a **`flapQuaternion`** + **`flapAxis = (0,0,1)`** for rotating wings about the
  body's forward axis.

### Wing flap — a sine wave with occasional glides

Each gull has a `flapPhase` (random start) and `flapSpeed` (`1.6–2.5`). The wing
angle is just a sine:

```js
flapAngle = Math.sin(elapsed * flapSpeed * (1 + excitement * 0.35) + flapPhase) * 0.85
```

- Amplitude `0.85` rad (~49°) up and down.
- Speeding up slightly with **excitement** (see §3) so an excited flock beats faster.
- Per-bird phase means they're **not synchronized** — the flock shimmers.

Then, now and then, a bird **glides**: it freezes its wings at a raised dihedral
(`0.3` rad) for a second or two instead of flapping. Each gull runs its own timer:

```js
gull.nextGlideIn -= delta
if(gull.glideTimer > 0)      gull.glideTimer -= delta          // currently gliding
else if(gull.nextGlideIn <= 0) {
    gull.glideTimer  = 1 + Math.random() * 2                   // glide for 1–3 s
    gull.nextGlideIn = (4 + Math.random() * 5) * (1 + excitement * 1.5) // then flap a while
}
flapAngle = gull.glideTimer > 0 ? 0.3 : /* the sine above */
```

Excited flocks glide *less often* (the interval stretches), so calm = lazy soaring,
excited = busy flapping.

### Applying the flap to the wings

The wings inherit the body's full orientation, then each rotates about the
forward (z) axis by `±flapAngle` — opposite signs so they beat symmetrically:

```js
for(const [mesh, sign] of [[this.wingRight, -1], [this.wingLeft, 1]]) {
    this.flapQuaternion.setFromAxisAngle(this.flapAxis, sign * flapAngle)
    this.wingDummy.position.copy(this.dummy.position)
    this.wingDummy.quaternion.copy(this.dummy.quaternion).multiply(this.flapQuaternion)
    this.wingDummy.scale.setScalar(scale)
    this.wingDummy.updateMatrix()
    mesh.setMatrixAt(i, this.wingDummy.matrix)
}
```

### Banking — orientation from actual motion

The body's orientation isn't set arbitrarily; it's derived from how the bird
*actually moved* this frame (finite difference between this position and the
previous one). This keeps banking honest even as the whole flock is dragged
around by the player.

```js
const dx = x - gull.prevX, dy = y - gull.prevY, dz = z - gull.prevZ
const horizontalSpeed = Math.hypot(dx, dz)

const yaw   = Math.atan2(dx, dz)                                  // face the direction of travel
const pitch = clamp(-Math.atan2(dy, horizontalSpeed), -0.5, 0.5) // nose up/down with climb/dive
const rollTarget = clamp(
    gull.dir * (horizontalSpeed / delta) / gull.radius * this.bankGain,
    -0.9, 0.9
)                                                                // bank into the turn
gull.roll += (rollTarget - gull.roll) * Math.min(1, 4 * delta)   // ease toward it (no snapping)

this.dummy.position.set(x, y, z)
this.dummy.rotation.set(pitch, yaw, gull.roll)   // YXZ order
```

- **Yaw** points the nose along the velocity vector.
- **Pitch** tilts up when climbing, down when diving (clamped to ±0.5 rad).
- **Roll** banks into the turn — faster/tighter turns bank harder. `gull.dir`
  (+1 or −1) is the orbit direction, so clockwise and counter-clockwise birds
  bank opposite ways. Roll is *eased* toward its target, never snapped, so banking
  looks weighty.

Remember to stash `prevX/prevY/prevZ` each frame for the next difference, and set
`instanceMatrix.needsUpdate = true` on all three meshes after the loop.

---

## 3. Movement — how the flock wheels, follows, and comes and goes

### Orbiting an anchor

The flock circles a shared **anchor** point. Each gull has its own orbit:

- `theta` — current angle around the anchor (advances each frame).
- `dir` — turn direction, +1 or −1 (about a quarter go the other way, so the
  flock isn't a single tidy carousel).
- `radius` — horizontal distance from the anchor (`~8–15`, with slow sinusoidal
  jitter so orbits breathe).
- `altitude` — height above the anchor (`~8–15`, also gently bobbing).
- `speedBase` — angular speed (`0.25–0.45`).

Position each frame:

```js
gull.theta += gull.dir * gull.speedBase * (1 + excitement * 0.9) * delta

const x = anchor.x + Math.sin(gull.theta) * gull.radius
const z = anchor.z + Math.cos(gull.theta) * gull.radius
const y = anchor.y + gull.altitude + Math.sin(elapsed * 0.6 + gull.bobPhase) * 1.2  // gentle bob
```

Radius and altitude aren't set directly — each frame they **ease toward a target**
(`radiusTarget`, `altitudeTarget`) at a per-gull `respondRate`, so the flock
reshapes smoothly rather than teleporting.

### The anchor follows the player

The anchor chases the player's position with simple exponential smoothing, and
**slower on the vertical axis** so the player's dives and jumps don't yank the
whole flock up and down:

```js
const followXZ = Math.min(1, this.followRate * delta)
const followY  = Math.min(1, this.followRate * 0.6 * delta)
anchor.x += (player.x - anchor.x) * followXZ
anchor.z += (player.z - anchor.z) * followXZ
anchor.y += (Math.max(player.y, 2) - anchor.y) * followY   // never dip below y=2
```

Because the anchor lags the player, the birds get *dragged*, which is exactly
what produces the honest banking in §2.

### Excitement — the flock reacts to "flow"

`excitement` (0→1) is the master mood knob. It eases toward the player's **flow**
value (the game's momentum/style meter), so as the player builds flow the flock
gradually winds up. Excitement makes the flock:

- orbit **faster** (`1 + excitement * 0.9`),
- pull **tighter and lower** (radius and altitude targets shrink),
- **flap faster** and **glide less**,
- **cry more often**.

```js
this.excitement += (flowTarget - this.excitement) * Math.min(1, 1.2 * delta)
```

**Spawn greeting:** excitement starts high (`0.9`) and there's a `greeting` term
that holds it up for the first several seconds, so when the world loads the flock
swirls in tight and eager, then relaxes to flow-driven behavior. A nice touch of
personality on arrival.

### Day / night presence and the "day-shift" behavior

These are **beach birds on a day shift.** Two factors gate whether they're
present at all, multiplied into a single `presence` (0→1) that also scales their
size, so they **shrink to nothing** rather than pop out:

```js
const dayFactor   = smoothstep(sun.position.y, -0.02, 0.12)          // gone at night
const inland      = shoreX(player.z) - player.x
const beachFactor = 1 - smoothstep(inland, 25, 60)                   // gone if player heads inland
const presence    = dayFactor * beachFactor
const scale       = this.gullScale * presence
```

When `presence` is ~0 the meshes are hidden and **all per-frame work is skipped**
(early `return`) — no wasted computation while the flock is away.

**Daily follow budget:** there's also a charming bit of behavior where the flock
only follows the player for a limited total distance (`dailyFollowDistance`,
default 600 units) each day. Once the player has wandered that far, the gulls
give up and stay dismissed **until the next sunrise**, when it resets. Track
accumulated horizontal distance travelled and flip a `dismissedUntilSunrise`
flag; reset it when a night→day transition is detected.

### Day tint (faking light on an unlit material)

Since `MeshBasicMaterial` is unlit, the material color is animated by hand so the
gulls glow **flat white by day** and fall to **cool blue-grey silhouettes at
night**, with a warm nudge at golden hour:

```js
const sunY   = sun.position.y
const day    = smoothstep(sunY, -0.2, 0.25)
const golden = Math.max(0, 1 - Math.abs(sunY - 0.06) * 7) * 0.35   // peaks near the horizon

material.color.setRGB(
    0.3  + 0.7  * day + golden * 0.2,
    0.33 + 0.67 * day + golden * 0.06,
    0.44 + 0.56 * day - golden * 0.08
)
```

### Cries — procedural gull calls

Occasionally a gull cries: **two quick descending chirps** (plus a third 40% of
the time) synthesized as short-decay chimes through the game's Web Audio system —
no samples. Short decays read as a distant bird. The interval between cries
shrinks as excitement rises:

```js
// frequency ~1650–2000 Hz, then a descending echo at 0.78× and sometimes 0.88×
audio.playChime(frequency,        volume,       0.35, 0)
audio.playChime(frequency * 0.78, volume * 0.8, 0.45, 0.13)
if(Math.random() < 0.4)
    audio.playChime(frequency * 0.88, volume * 0.6, 0.3, 0.28)

// next cry: 7 s (excited) up to ~18 s (calm), plus a random 0–12 s
this.cryTimer = lerp(18, this.cryIntervalMin, excitement) + Math.random() * 12
```

---

## 4. Per-gull state, at a glance

When you spawn the flock, give each bird this bag of randomized state so no two
move alike:

| Field | Purpose | Typical range |
| --- | --- | --- |
| `theta` | current orbit angle | `0…2π` (random start) |
| `dir` | orbit direction | `+1`, or `−1` for ~25% |
| `radiusBase` / `radius` | orbit radius target / current | `8–15` |
| `radiusJitterPhase` | phase for slow radius breathing | `0…2π` |
| `altitudeBase` / `altitude` | height target / current | `8–15` |
| `speedBase` | angular orbit speed | `0.25–0.45` |
| `respondRate` | how fast radius/altitude ease to target | `0.5–1.5` |
| `flapPhase` / `flapSpeed` | wing sine offset / rate | phase `0…2π`, speed `1.6–2.5` |
| `glideTimer` / `nextGlideIn` | glide state machine | seconds |
| `bobPhase` | phase for vertical bob | `0…2π` |
| `roll` | current bank angle (eased) | starts `0` |
| `prevX/Y/Z` | last frame's position (for finite-difference heading) | — |

---

## 5. Build order (a checklist for the implementing model)

1. **Geometry** — cone body pointing +z with a white vertex-color attribute;
   right wing as a swept, raked, slightly-dihedral 4-triangle strip with a hard
   white→black seam; left wing as a −x mirror of the geometry.
2. **Material** — one `MeshBasicMaterial`, `vertexColors: true`, `DoubleSide`.
3. **Meshes** — three `InstancedMesh`es (body, right, left), `DynamicDrawUsage`,
   `frustumCulled = false`, capacity ≥ count.
4. **Flock state** — build `count` gulls with the randomized fields above.
5. **Per-frame update**, in order:
   - compute `dayFactor`, `beachFactor`, `presence`; hide + early-return if gone.
   - ease the anchor toward the player (slower on Y).
   - ease `excitement` toward flow (held high by the spawn greeting early on).
   - for each gull: ease radius/altitude, advance `theta`, compute x/y/z, derive
     yaw/pitch/roll from motion, write the body matrix; run the glide state
     machine, compute the flap angle, write both wing matrices.
   - flag all three `instanceMatrix.needsUpdate = true`.
   - update the day tint; tick the cry timer.

Nail the silhouette (swept wings, black tips, gentle V), let no two birds be
synchronized, keep every motion *eased* rather than snapped, and let the flock
react to the player's flow — and you'll have a flock that feels alive and,
crucially, **cute**. 🐦
