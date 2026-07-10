import * as THREE from 'three'
import seedrandom from 'seedrandom'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import FlameMaterial from './Materials/FlameMaterial.js'
import CampfireGlowMaterial from './Materials/CampfireGlowMaterial.js'
import FirefliesMaterial from './Materials/FirefliesMaterial.js'

export default class Campfires
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene
        this.viewport = this.state.viewport

        // A fire roughly every ~430m — rare enough to feel like a discovery,
        // common enough to actually meet one on a night run
        this.interval = 320
        this.firstOffset = 120
        this.keepDistance = 320
        this.skipRatio = 0.25
        this.bandInner = 8 // meters inland of the shoreline (dry sand)
        this.bandOuter = 13

        this.flameScale = 1
        this.glowRadius = 1.7
        this.glowOpacity = 0.5
        this.rainDampen = 0.85
        this.nightOverride = - 1

        // Shared color objects: one debug picker drives every fire instance
        this.colorOuter = new THREE.Color('#d1571a')
        this.colorMid = new THREE.Color('#f2a238')
        this.colorCore = new THREE.Color('#ffd75e')
        this.glowColor = new THREE.Color('#ff9b3c')

        this.fires = new Map()
        this.groupPool = []
        this.debugCount = 0

        // Published for the audio crackle
        this.presence = 0
        this.nearestDistance = Infinity

        this.setLogGeometry()
        this.setFlameGeometry()
        this.setGlowGeometry()
        this.setEmbers()
        this.setDebug()
    }

    setLogGeometry()
    {
        // Driftwood tepee + stone ring, merged and vertex-colored — visible
        // by day as an unlit pile, the flames only grow out of it at night
        const paint = (geometry, r, g, b) =>
        {
            const colors = new Float32Array(geometry.attributes.position.count * 3)

            for(let i = 0; i < geometry.attributes.position.count; i++)
            {
                colors[i * 3    ] = r
                colors[i * 3 + 1] = g
                colors[i * 3 + 2] = b
            }

            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

            return geometry
        }

        const parts = []

        for(let i = 0; i < 3; i++)
        {
            const log = paint(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 5), 0.30, 0.20, 0.13)
            log.rotateZ(1.15)
            log.rotateY(i * 2.1)
            log.translate(0, 0.22, 0)
            parts.push(log)
        }

        for(let i = 0; i < 4; i++)
        {
            const angle = i * Math.PI * 0.5 + 0.4
            const stone = paint(new THREE.BoxGeometry(0.22, 0.13, 0.17), 0.42, 0.40, 0.38)
            stone.rotateY(angle + 0.7)
            stone.translate(Math.cos(angle) * 0.62, 0.06, Math.sin(angle) * 0.62)
            parts.push(stone)
        }

        this.logGeometry = mergeBufferGeometries(parts)

        // Char the heart of the pile
        const positions = this.logGeometry.attributes.position
        const colors = this.logGeometry.attributes.color

        for(let i = 0; i < positions.count; i++)
        {
            const distance = Math.hypot(positions.getX(i), positions.getZ(i))

            if(distance < 0.25)
                colors.setXYZ(i, 0.08, 0.07, 0.07)
        }

        this.logMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })
    }

    setFlameGeometry()
    {
        // Three fixed crossed cutout planes, one merged buffer: volumetric
        // from every angle, one draw call, no per-frame billboarding
        const parts = []

        for(let i = 0; i < 3; i++)
        {
            const plane = new THREE.PlaneGeometry(1.15, 1.5)
            plane.translate(0, 0.75, 0)
            plane.rotateY(i * Math.PI / 3)

            const phases = new Float32Array(plane.attributes.position.count)
            phases.fill(i * 2.1)
            plane.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))

            parts.push(plane)
        }

        this.flameGeometry = mergeBufferGeometries(parts)
    }

    setGlowGeometry()
    {
        this.glowGeometry = new THREE.CircleGeometry(1, 24)
        this.glowGeometry.rotateX(- Math.PI * 0.5)
    }

    setEmbers()
    {
        // Shared Points pool across all live fires, reusing the fireflies
        // shader (warm additive dot + flicker) — just smaller and orange
        this.emberPerFire = 6
        this.emberFireSlots = 4
        this.emberCapacity = this.emberPerFire * this.emberFireSlots

        const positions = new Float32Array(this.emberCapacity * 3)
        const phases = new Float32Array(this.emberCapacity)
        const flickerSpeeds = new Float32Array(this.emberCapacity)
        const sizes = new Float32Array(this.emberCapacity)
        const densities = new Float32Array(this.emberCapacity)

        this.emberSlots = []

        for(let i = 0; i < this.emberCapacity; i++)
        {
            positions[i * 3 + 1] = - 1000
            phases[i] = Math.random() * Math.PI * 2
            flickerSpeeds[i] = 2 + Math.random() * 3
            sizes[i] = 0.3 + Math.random() * 0.25
            densities[i] = (i % this.emberPerFire) / this.emberPerFire

            this.emberSlots.push({
                phase: Math.random() * 10,
                lifetime: 1.4 + Math.random(),
                riseSpeed: 0.8 + Math.random() * 0.5,
                wobble: Math.random() * Math.PI * 2
            })
        }

        this.emberGeometry = new THREE.BufferGeometry()
        this.emberPositionAttribute = new THREE.Float32BufferAttribute(positions, 3)
        this.emberPositionAttribute.setUsage(THREE.DynamicDrawUsage)
        this.emberGeometry.setAttribute('position', this.emberPositionAttribute)
        this.emberGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))
        this.emberGeometry.setAttribute('aFlickerSpeed', new THREE.Float32BufferAttribute(flickerSpeeds, 1))
        this.emberGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
        this.emberGeometry.setAttribute('aDensity', new THREE.Float32BufferAttribute(densities, 1))

        this.emberMaterial = new FirefliesMaterial()
        this.emberMaterial.uniforms.uColor.value.set('#ffb46a')
        this.emberMaterial.uniforms.uSize.value = 0.12
        this.emberMaterial.uniforms.uDensity.value = 1
        this.emberMaterial.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio

        this.emberPoints = new THREE.Points(this.emberGeometry, this.emberMaterial)
        this.emberPoints.frustumCulled = false
        this.emberPoints.visible = false
        this.scene.add(this.emberPoints)
    }

    buildGroup()
    {
        const group = new THREE.Group()

        const logs = new THREE.Mesh(this.logGeometry, this.logMaterial)
        group.add(logs)

        const flameMaterial = new FlameMaterial()
        flameMaterial.uniforms.uColorOuter.value = this.colorOuter
        flameMaterial.uniforms.uColorMid.value = this.colorMid
        flameMaterial.uniforms.uColorCore.value = this.colorCore

        const flame = new THREE.Mesh(this.flameGeometry, flameMaterial)
        flame.position.y = 0.15
        group.add(flame)

        const glowMaterial = new CampfireGlowMaterial()
        glowMaterial.uniforms.uColor.value = this.glowColor

        const glow = new THREE.Mesh(this.glowGeometry, glowMaterial)
        glow.position.y = 0.04
        group.add(glow)

        group.userData.logs = logs
        group.userData.flame = flame
        group.userData.flameMaterial = flameMaterial
        group.userData.glow = glow
        group.userData.glowMaterial = glowMaterial

        return group
    }

    createFire(k, forcedZ = null)
    {
        const random = new seedrandom(`campfire:${k}`)
        const z = forcedZ ?? (- (this.firstOffset + k * this.interval) + (random() - 0.5) * this.interval * 0.3)

        if(forcedZ === null && random() < this.skipRatio)
        {
            this.fires.set(k, { skip: true, z })
            return
        }

        const x = this.state.terrains.getShoreX(z) - this.bandInner - random() * (this.bandOuter - this.bandInner)
        const yaw = random() * Math.PI * 2
        const sizeJitter = 0.85 + random() * 0.3
        const seed = random() * 100

        const group = this.groupPool.pop() ?? this.buildGroup()
        group.visible = false // until the ground resolves
        group.rotation.y = yaw
        group.userData.flameMaterial.uniforms.uSeed.value = seed
        group.userData.glowMaterial.uniforms.uSeed.value = seed
        this.scene.add(group)

        this.fires.set(k, { skip: false, z, x, y: null, yaw, sizeJitter, seed, group })
    }

    releaseFire(fire)
    {
        if(fire.group)
        {
            this.scene.remove(fire.group)
            this.groupPool.push(fire.group)
        }
    }

    regenerate()
    {
        for(const fire of this.fires.values())
            this.releaseFire(fire)

        this.fires.clear()
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/campfires')

        folder.add(this, 'interval').min(200).max(1500).step(10).onChange(() => { this.regenerate() })
        folder.add(this, 'skipRatio').min(0).max(0.9).step(0.05).onChange(() => { this.regenerate() })
        folder.add(this, 'bandInner').min(4).max(16).step(0.5).onChange(() => { this.regenerate() })
        folder.add(this, 'bandOuter').min(6).max(20).step(0.5).onChange(() => { this.regenerate() })
        folder.add(this, 'flameScale').min(0.4).max(2.5).step(0.05)
        folder.add(this, 'glowRadius').min(0.5).max(4).step(0.1)
        folder.add(this, 'glowOpacity').min(0).max(1).step(0.05)
        folder.add(this.emberMaterial.uniforms.uDensity, 'value').min(0).max(1).step(0.05).name('emberDensity')
        folder.add(this, 'rainDampen').min(0).max(1).step(0.05)
        folder.add(this, 'nightOverride').min(- 1).max(1).step(0.05)
        folder.addColor(this, 'colorOuter')
        folder.addColor(this, 'colorMid')
        folder.addColor(this, 'colorCore')
        folder.addColor(this, 'glowColor')
        folder.add({ spawnHere: () =>
        {
            this.createFire(`debug:${this.debugCount++}`, this.state.player.position.current[2] - 25)
        } }, 'spawnHere')
    }

    update()
    {
        const elapsed = this.time.elapsed
        const playerState = this.state.player
        const playerX = playerState.position.current[0]
        const playerZ = playerState.position.current[2]

        // Spawn window (canonical landmark pattern)
        const kMin = Math.max(0, Math.ceil((- playerZ - this.keepDistance - this.firstOffset) / this.interval))
        const kMax = Math.floor((- playerZ + this.keepDistance - this.firstOffset) / this.interval)

        for(let k = kMin; k <= kMax; k++)
        {
            if(!this.fires.has(k))
                this.createFire(k)
        }

        // Presence: fires come alive at night, rain damps them down
        const sunY = this.state.sun.position.y
        const nightFactor = this.nightOverride >= 0
            ? this.nightOverride
            : 1 - THREE.MathUtils.smoothstep(sunY, - 0.02, 0.12)
        const rainIntensity = this.state.weather.rainIntensity
        const presence = nightFactor * (1 - this.rainDampen * rainIntensity)
        this.presence = presence

        // Logs are day props: tint like the crabs
        const day = THREE.MathUtils.smoothstep(sunY, - 0.2, 0.25)
        const tint = 0.35 + 0.65 * day
        this.logMaterial.color.setRGB(tint, tint, tint * 1.08)

        this.nearestDistance = Infinity

        const liveFires = []

        for(const [k, fire] of this.fires)
        {
            if(Math.abs(fire.z - playerZ) > this.keepDistance)
            {
                this.releaseFire(fire)
                this.fires.delete(k)
                continue
            }

            if(fire.skip)
                continue

            // Ground guard: park until the chunk under it exists
            if(fire.y === null)
            {
                const elevation = this.state.chunks.getElevationForPosition(fire.x, fire.z)

                if(elevation !== false && Number.isFinite(elevation) && elevation > 0.05)
                {
                    fire.y = elevation
                    fire.group.position.set(fire.x, fire.y, fire.z)
                    fire.group.scale.setScalar(fire.sizeJitter)
                    fire.group.visible = true
                }
                else
                {
                    continue
                }
            }

            this.nearestDistance = Math.min(this.nearestDistance, Math.hypot(fire.x - playerX, fire.z - playerZ))

            // Deterministic flicker — despawn/respawn is idempotent
            const flicker = 0.88 + 0.08 * Math.sin(elapsed * 2.1 + fire.seed)
                                 + 0.04 * Math.sin(elapsed * 5.3 + fire.seed * 1.7)
            const intensity = presence * flicker

            const flame = fire.group.userData.flame
            const glow = fire.group.userData.glow

            flame.visible = intensity > 0.05
            glow.visible = intensity > 0.05

            if(flame.visible)
            {
                const flameUniforms = fire.group.userData.flameMaterial.uniforms
                flameUniforms.uTime.value = elapsed
                flameUniforms.uIntensity.value = intensity
                flame.scale.setScalar(this.flameScale)

                const glowUniforms = fire.group.userData.glowMaterial.uniforms
                glowUniforms.uTime.value = elapsed
                glowUniforms.uOpacity.value = this.glowOpacity * intensity
                glow.scale.setScalar(this.glowRadius / Math.max(fire.sizeJitter, 0.01))

                if(liveFires.length < this.emberFireSlots)
                    liveFires.push(fire)
            }
        }

        // Embers: assign the shared slots to the nearest live fires
        this.emberPoints.visible = liveFires.length > 0 && presence > 0.01

        if(this.emberPoints.visible)
        {
            this.emberMaterial.uniforms.uTime.value = elapsed
            this.emberMaterial.uniforms.uNight.value = presence

            for(let f = 0; f < this.emberFireSlots; f++)
            {
                const fire = liveFires[f]

                for(let e = 0; e < this.emberPerFire; e++)
                {
                    const i = f * this.emberPerFire + e

                    // Rain thins the sparks
                    if(!fire || e >= this.emberPerFire * (1 - rainIntensity))
                    {
                        this.emberPositionAttribute.setY(i, - 1000)
                        continue
                    }

                    const slot = this.emberSlots[i]
                    const age = (elapsed * slot.riseSpeed + slot.phase) % slot.lifetime
                    const ageNorm = age / slot.lifetime

                    this.emberPositionAttribute.setXYZ(
                        i,
                        fire.x + Math.sin(elapsed * 3 + slot.wobble) * 0.12 * ageNorm,
                        fire.y + 0.35 + age * slot.riseSpeed,
                        fire.z + Math.cos(elapsed * 2.6 + slot.wobble) * 0.12 * ageNorm
                    )
                }
            }

            this.emberPositionAttribute.needsUpdate = true
        }
    }

    resize()
    {
        this.emberMaterial.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio
    }
}
