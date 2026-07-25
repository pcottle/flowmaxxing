import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import CycloneMaterial from './Materials/CycloneMaterial.js'

export default class Cyclones
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene

        this.fadeNear = 65
        this.fadeFar = 85
        this.dormantHeight = 1.6
        this.dormantScale = 0.7
        this.outerSpin = 4
        this.innerSpin = - 6
        this.curlTimer = 0

        this.dormantColor = new THREE.Color('#c8f5e6')
        this.awakenedColor = new THREE.Color('#eafff4')
        this.futureWispColor = new THREE.Color('#74d7ff')
        this.activeWispColor = new THREE.Color('#fff0a6')
        this.collectedWispColor = new THREE.Color('#b6ff7a')

        this.pool = []

        this.setGeometries()
        this.setDebug()

        // Pre-build one pooled entry so the cyclone shaders compile during the
        // load-time renderer.compile() pre-warm instead of mid-run
        this.createEntry()
    }

    setGeometries()
    {
        // Open-ended tapered shells, unit height with the base at y=0 so the
        // y-scale sets the cyclone height
        this.outerGeometry = new THREE.CylinderGeometry(2.6, 1.1, 1, 20, 1, true)
        this.outerGeometry.translate(0, 0.5, 0)
        this.innerGeometry = new THREE.CylinderGeometry(1.7, 0.7, 1, 20, 1, true)
        this.innerGeometry.translate(0, 0.5, 0)

        this.wispGeometry = new THREE.IcosahedronGeometry(0.42, 1).toNonIndexed()
        this.wispRingGeometry = new THREE.TorusGeometry(0.72, 0.055, 5, 20).toNonIndexed()
        this.wispRingGeometry.rotateX(Math.PI * 0.5)
    }

    createEntry()
    {
        const outerMaterial = new CycloneMaterial()
        const innerMaterial = new CycloneMaterial()
        innerMaterial.uniforms.uScrollSpeed.value = 1.3

        const group = new THREE.Group()
        const outer = new THREE.Mesh(this.outerGeometry, outerMaterial)
        const inner = new THREE.Mesh(this.innerGeometry, innerMaterial)
        outer.frustumCulled = false
        inner.frustumCulled = false
        group.add(outer)
        group.add(inner)
        group.visible = false
        this.scene.add(group)

        const wisps = []

        for(let i = 0; i < 3; i++)
        {
            const wispGroup = new THREE.Group()
            const orbMaterial = new THREE.MeshBasicMaterial({
                color: this.futureWispColor,
                transparent: true,
                opacity: 0,
                depthWrite: false
            })
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: this.futureWispColor,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                side: THREE.DoubleSide
            })
            const orb = new THREE.Mesh(this.wispGeometry, orbMaterial)
            const ring = new THREE.Mesh(this.wispRingGeometry, ringMaterial)
            wispGroup.add(orb)
            wispGroup.add(ring)
            wispGroup.visible = false
            wispGroup.frustumCulled = false
            this.scene.add(wispGroup)
            wisps.push({ group: wispGroup, orb, ring, orbMaterial, ringMaterial })
        }

        const entry = { group, outer, inner, outerMaterial, innerMaterial, wisps }
        this.pool.push(entry)

        return entry
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/cyclones')

        folder.add(this, 'outerSpin').min(- 12).max(12).step(0.5)
        folder.add(this, 'innerSpin').min(- 12).max(12).step(0.5)
        folder.add(this, 'fadeNear').min(20).max(140).step(5)
        folder.add(this, 'fadeFar').min(30).max(180).step(5)
        folder.add(this, 'dormantHeight').min(0.5).max(4).step(0.1)
    }

    update()
    {
        const cyclonesState = this.state.cyclones
        const playerState = this.state.player
        const playerX = playerState.position.current[0]
        const playerZ = playerState.position.current[2]
        const elapsed = this.time.elapsed
        const delta = this.time.delta

        this.curlTimer -= delta
        const spawnCurls = this.curlTimer <= 0

        if(spawnCurls)
            this.curlTimer = 0.5

        let index = 0

        for(const cyclone of cyclonesState.cyclones.values())
        {
            if(!cyclone.built)
                continue

            const entry = this.pool[index] ?? this.createEntry()
            index++

            const distance = Math.hypot(
                cyclone.position[0] - playerX,
                cyclone.position[2] - playerZ
            )
            const fade = 1 - THREE.MathUtils.smoothstep(distance, this.fadeNear, this.fadeFar)

            if(fade <= 0.01 || cyclone.phase === 'spent')
            {
                entry.group.visible = false

                for(const wispView of entry.wisps)
                    wispView.group.visible = false

                continue
            }

            entry.group.visible = true
            entry.group.position.set(cyclone.position[0], cyclone.position[1], cyclone.position[2])

            // Launch pulse: quick swell that settles back over ~0.4s
            const sinceLaunch = elapsed - cyclone.lastLaunchTime
            const launchPulse = sinceLaunch < 0.4 ? 1 + 0.35 * (1 - sinceLaunch / 0.4) : 1

            // Awakening grows the ground swirl into the full launch column.
            const sinceAwaken = elapsed - cyclone.lastAwakenTime
            const awakenRatio = cyclone.phase === 'awakened'
                ? THREE.MathUtils.smoothstep(sinceAwaken, 0, 0.45)
                : 0
            const height = THREE.MathUtils.lerp(this.dormantHeight, cyclonesState.height, awakenRatio)
            const baseScale = THREE.MathUtils.lerp(this.dormantScale, 1, awakenRatio)

            const breathe = 1 + 0.06 * Math.sin(elapsed * 1.8 + (typeof cyclone.k === 'number' ? cyclone.k : 0))
            entry.group.scale.set(breathe * launchPulse * baseScale, height, breathe * launchPulse * baseScale)

            entry.outer.rotation.y += this.outerSpin * delta
            entry.inner.rotation.y += this.innerSpin * delta

            entry.outerMaterial.uniforms.uTime.value = elapsed
            entry.innerMaterial.uniforms.uTime.value = elapsed
            entry.outerMaterial.uniforms.uColor.value.copy(cyclone.phase === 'awakened' ? this.awakenedColor : this.dormantColor)
            entry.innerMaterial.uniforms.uColor.value.copy(cyclone.phase === 'awakened' ? this.awakenedColor : this.dormantColor)
            entry.outerMaterial.uniforms.uOpacity.value = fade * (cyclone.phase === 'awakened' ? 1 : 0.65)
            entry.innerMaterial.uniforms.uOpacity.value = fade * (cyclone.phase === 'awakened' ? 0.8 : 0.5)

            for(let i = 0; i < entry.wisps.length; i++)
            {
                const wispView = entry.wisps[i]
                const wisp = cyclone.wisps[i]
                const collectAge = elapsed - wisp.collectTime
                const collecting = cyclone.phase === 'collecting'
                const collectFlash = wisp.collected && collectAge < 0.45

                if(!collecting || (wisp.collected && !collectFlash))
                {
                    wispView.group.visible = false
                    continue
                }

                const active = i === cyclone.nextWisp
                const color = collectFlash
                    ? this.collectedWispColor
                    : active
                        ? this.activeWispColor
                        : this.futureWispColor
                const opacity = fade * (active || collectFlash ? 0.95 : 0.28)
                const bob = Math.sin(elapsed * 3 + i * 1.7) * 0.16
                const pulse = active ? 1 + 0.12 * Math.sin(elapsed * 6) : 0.8
                const collectScale = collectFlash ? 1 + collectAge * 4 : 1

                wispView.group.visible = true
                wispView.group.position.set(wisp.position[0], wisp.position[1] + bob, wisp.position[2])
                wispView.group.scale.setScalar(pulse * collectScale)
                wispView.group.rotation.y += delta * (active ? 2.8 : 1.2)
                wispView.ring.rotation.z += delta * (active ? 2 : 0.8)
                wispView.orbMaterial.color.copy(color)
                wispView.ringMaterial.color.copy(color)
                wispView.orbMaterial.opacity = opacity * (collectFlash ? 1 - collectAge / 0.45 : 1)
                wispView.ringMaterial.opacity = opacity * 0.8 * (collectFlash ? 1 - collectAge / 0.45 : 1)
            }

            // WW curl glyphs drifting out of the base for nearby cyclones
            if(spawnCurls && distance < cyclonesState.revealDistance)
            {
                const awakened = cyclone.phase === 'awakened'

                this.view.particles.spawnCurlBurst(awakened ? 2 : 1, cyclone.position, {
                    spread: Math.PI * 2,
                    radius: awakened ? 2.2 : 0.8,
                    speed: awakened ? 1.2 : 0.6,
                    up: awakened ? 2.5 : 1,
                    size: awakened ? 2 : 1.2,
                    lifetime: 1.2
                })
            }
        }

        // Hide unused pooled entries
        for(let i = index; i < this.pool.length; i++)
        {
            this.pool[i].group.visible = false

            for(const wispView of this.pool[i].wisps)
                wispView.group.visible = false
        }
    }
}
