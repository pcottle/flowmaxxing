import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import SparklesMaterial from './Materials/SparklesMaterial.js'

export default class Sparkles
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

        this.count = 48
        this.windowZ = 40
        this.bandInland = 6 // meters inland of the shoreline
        this.bandSeaward = 2
        this.presenceOverride = - 1

        this.frameIndex = 0
        this.positionsDirty = false

        this.setPool()
        this.setGeometry()
        this.setMaterial()
        this.setPoints()
        this.setDebug()
    }

    setPool()
    {
        this.pool = []

        for(let i = 0; i < this.count; i++)
            this.pool.push({ x: 0, y: - 1000, z: 1e9, valid: false })
    }

    setGeometry()
    {
        const positions = new Float32Array(this.count * 3)
        const phases = new Float32Array(this.count)
        const popSpeeds = new Float32Array(this.count)
        const sizes = new Float32Array(this.count)
        const angles = new Float32Array(this.count)
        const densities = new Float32Array(this.count)

        for(let i = 0; i < this.count; i++)
        {
            positions[i * 3 + 1] = - 1000
            phases[i] = Math.random()
            popSpeeds[i] = 0.12 + Math.random() * 0.23
            sizes[i] = 0.7 + Math.random() * 0.6
            angles[i] = Math.random() < 0.5 ? 0 : Math.PI * 0.25
            densities[i] = i / this.count
        }

        this.geometry = new THREE.BufferGeometry()
        this.positionAttribute = new THREE.Float32BufferAttribute(positions, 3)
        this.positionAttribute.setUsage(THREE.DynamicDrawUsage)
        this.geometry.setAttribute('position', this.positionAttribute)
        this.geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))
        this.geometry.setAttribute('aPopSpeed', new THREE.Float32BufferAttribute(popSpeeds, 1))
        this.geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
        this.geometry.setAttribute('aAngle', new THREE.Float32BufferAttribute(angles, 1))
        this.geometry.setAttribute('aDensity', new THREE.Float32BufferAttribute(densities, 1))
    }

    setMaterial()
    {
        this.material = new SparklesMaterial()
        this.material.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio
    }

    setPoints()
    {
        this.points = new THREE.Points(this.geometry, this.material)
        this.points.frustumCulled = false
        this.points.visible = false
        this.scene.add(this.points)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/sparkles')

        folder.add(this.material.uniforms.uDensity, 'value').min(0).max(1).step(0.05).name('uDensity')
        folder.add(this.material.uniforms.uSize, 'value').min(0.05).max(1.5).step(0.05).name('uSize')
        folder.add(this.material.uniforms.uOpacity, 'value').min(0).max(1).step(0.05).name('uOpacity')
        folder.addColor(this.material.uniforms.uColor, 'value').name('uColor')
        folder.add(this, 'bandInland').min(2).max(12).step(0.5)
        folder.add(this, 'presenceOverride').min(- 1).max(1).step(0.05)
    }

    getWetLine()
    {
        return Math.max(this.state.waveSets.wetLineE, this.state.weather.rainIntensity * 2.5)
    }

    // A sparkle only lives on the wet band: accepted by elevation vs the wet
    // line (the visual wetness rule), not just the x band — rain pushes the
    // line up the beach and the sparkles follow
    respawn(sparkle, z)
    {
        sparkle.z = z
        sparkle.valid = false
        sparkle.y = - 1000

        const shore = this.state.terrains.getShoreX(z)
        const wetLine = this.getWetLine()

        for(let attempt = 0; attempt < 3; attempt++)
        {
            const x = shore + this.bandSeaward - Math.random() * (this.bandInland + this.bandSeaward)
            const elevation = this.state.chunks.getElevationForPosition(x, z)

            if(elevation !== false && Number.isFinite(elevation)
                && elevation > 0.03 && elevation < wetLine + 0.4)
            {
                sparkle.x = x
                sparkle.y = elevation + 0.04
                sparkle.valid = true
                break
            }
        }
    }

    writePoint(i)
    {
        const sparkle = this.pool[i]
        this.positionAttribute.setXYZ(i, sparkle.x, sparkle.y, sparkle.z)
        this.positionsDirty = true
    }

    update()
    {
        const playerZ = this.state.player.position.current[2]
        const sunY = this.state.sun.position.y

        // Golden hour is the star window (mirrors the terrain wet gloss),
        // moonlight keeps a dim version alive at night; rain occludes both —
        // but the post-rain wet band sparkling in daylight comes free from
        // the wet-line placement
        const golden = THREE.MathUtils.smoothstep(sunY, - 0.02, 0.08)
            * (1 - THREE.MathUtils.smoothstep(sunY, 0.25, 0.45))
        const nightness = Math.min(Math.max((- sunY - 0.05) * 5, 0), 1)
        const presence = this.presenceOverride >= 0
            ? this.presenceOverride
            : Math.max(golden, nightness * 0.35) * (1 - this.state.weather.rainIntensity)

        this.points.visible = presence > 0.01
        this.material.uniforms.uPresence.value = presence

        if(!this.points.visible)
            return

        this.material.uniforms.uTime.value = this.time.elapsed
        this.frameIndex++

        // Round-robin re-validation so sparkles retreat with the wet line
        for(let k = 0; k < 6; k++)
        {
            const i = (this.frameIndex * 6 + k) % this.count
            this.respawn(this.pool[i], this.pool[i].z === 1e9 ? playerZ + (Math.random() - 0.5) * this.windowZ * 2 : this.pool[i].z)
            this.writePoint(i)
        }

        // Wrap the field along the corridor
        for(let i = 0; i < this.count; i++)
        {
            const sparkle = this.pool[i]

            if(Math.abs(sparkle.z - playerZ) > this.windowZ)
            {
                const wrapped = Math.abs(sparkle.z - playerZ) > this.windowZ * 2
                    ? playerZ + (Math.random() - 0.5) * this.windowZ * 2
                    : sparkle.z - Math.sign(sparkle.z - playerZ) * this.windowZ * 2
                this.respawn(sparkle, wrapped)
                this.writePoint(i)
            }
        }

        if(this.positionsDirty)
        {
            this.positionAttribute.needsUpdate = true
            this.positionsDirty = false
        }
    }

    resize()
    {
        this.material.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio
    }
}
