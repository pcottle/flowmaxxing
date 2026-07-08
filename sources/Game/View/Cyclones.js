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

        this.fadeNear = 200
        this.fadeFar = 260
        this.outerSpin = 4
        this.innerSpin = - 6
        this.curlTimer = 0

        this.pool = []

        this.setGeometries()
        this.setDebug()
    }

    setGeometries()
    {
        // Open-ended tapered shells, unit height with the base at y=0 so the
        // y-scale sets the cyclone height
        this.outerGeometry = new THREE.CylinderGeometry(2.6, 1.1, 1, 20, 1, true)
        this.outerGeometry.translate(0, 0.5, 0)
        this.innerGeometry = new THREE.CylinderGeometry(1.7, 0.7, 1, 20, 1, true)
        this.innerGeometry.translate(0, 0.5, 0)
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

        const entry = { group, outer, inner, outerMaterial, innerMaterial }
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
        folder.add(this, 'fadeNear').min(50).max(400).step(10)
        folder.add(this, 'fadeFar').min(60).max(500).step(10)
    }

    update()
    {
        const cyclonesState = this.state.cyclones
        const playerState = this.state.player
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

            const distance = Math.abs(cyclone.position[2] - playerZ)
            const fade = 1 - THREE.MathUtils.smoothstep(distance, this.fadeNear, this.fadeFar)

            if(fade <= 0.01)
            {
                entry.group.visible = false
                continue
            }

            entry.group.visible = true
            entry.group.position.set(cyclone.position[0], cyclone.position[1], cyclone.position[2])

            // Launch pulse: quick swell that settles back over ~0.4s
            const sinceLaunch = elapsed - cyclone.lastLaunchTime
            const pulse = sinceLaunch < 0.4 ? 1 + 0.35 * (1 - sinceLaunch / 0.4) : 1

            const breathe = 1 + 0.06 * Math.sin(elapsed * 1.8 + (typeof cyclone.k === 'number' ? cyclone.k : 0))
            entry.group.scale.set(breathe * pulse, cyclonesState.height, breathe * pulse)

            entry.outer.rotation.y += this.outerSpin * delta
            entry.inner.rotation.y += this.innerSpin * delta

            entry.outerMaterial.uniforms.uTime.value = elapsed
            entry.innerMaterial.uniforms.uTime.value = elapsed
            entry.outerMaterial.uniforms.uOpacity.value = fade
            entry.innerMaterial.uniforms.uOpacity.value = fade * 0.8

            // WW curl glyphs drifting out of the base for nearby cyclones
            if(spawnCurls && distance < 120)
            {
                this.view.particles.spawnCurlBurst(2, cyclone.position, {
                    spread: Math.PI * 2,
                    radius: 2.2,
                    speed: 1.2,
                    up: 2.5,
                    size: 2,
                    lifetime: 1.2
                })
            }
        }

        // Hide unused pooled entries
        for(let i = index; i < this.pool.length; i++)
            this.pool[i].group.visible = false
    }
}
