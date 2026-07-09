import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import FirefliesMaterial from './Materials/FirefliesMaterial.js'

export default class Fireflies
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

        this.count = 80
        this.bandNear = 25 // meters inland of the shoreline
        this.bandFar = 70
        this.heightMin = 0.3
        this.heightMax = 2
        this.windowZ = 45
        this.nightOverride = - 1

        this.resampleCursor = 0
        this.frameIndex = 0

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
        {
            this.pool.push({
                x: 0,
                z: 1e9, // wraps into place on the first frames
                groundY: 0,
                hasGround: false,
                baseHeight: this.heightMin + Math.random() * (this.heightMax - this.heightMin),
                wp1: Math.random() * Math.PI * 2,
                wp2: Math.random() * Math.PI * 2,
                wp3: Math.random() * Math.PI * 2
            })
        }
    }

    setGeometry()
    {
        const positions = new Float32Array(this.count * 3)
        const phases = new Float32Array(this.count)
        const flickerSpeeds = new Float32Array(this.count)
        const sizes = new Float32Array(this.count)
        const densities = new Float32Array(this.count)

        for(let i = 0; i < this.count; i++)
        {
            phases[i] = Math.random() * Math.PI * 2
            flickerSpeeds[i] = 1.5 + Math.random() * 2.5
            sizes[i] = 0.7 + Math.random() * 0.6
            densities[i] = i / this.count
        }

        this.geometry = new THREE.BufferGeometry()
        this.positionAttribute = new THREE.Float32BufferAttribute(positions, 3)
        this.positionAttribute.setUsage(THREE.DynamicDrawUsage)
        this.geometry.setAttribute('position', this.positionAttribute)
        this.geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))
        this.geometry.setAttribute('aFlickerSpeed', new THREE.Float32BufferAttribute(flickerSpeeds, 1))
        this.geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
        this.geometry.setAttribute('aDensity', new THREE.Float32BufferAttribute(densities, 1))
    }

    setMaterial()
    {
        this.material = new FirefliesMaterial()
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

        const folder = this.debug.ui.getFolder('view/fireflies')

        folder.add(this.material.uniforms.uDensity, 'value').min(0).max(1).step(0.05).name('uDensity')
        folder.add(this.material.uniforms.uSize, 'value').min(0.05).max(2).step(0.05).name('uSize')
        folder.add(this.material.uniforms.uOpacity, 'value').min(0).max(1).step(0.05).name('uOpacity')
        folder.addColor(this.material.uniforms.uColor, 'value').name('uColor')
        folder.add(this, 'bandNear').min(10).max(60).step(1)
        folder.add(this, 'bandFar').min(30).max(120).step(1)
        folder.add(this, 'nightOverride').min(- 1).max(1).step(0.05)
    }

    respawn(firefly, z)
    {
        firefly.z = z
        const shore = this.state.terrains.getShoreX(z)
        firefly.x = shore - this.bandNear - Math.random() * (this.bandFar - this.bandNear)

        const elevation = this.state.chunks.getElevationForPosition(firefly.x, firefly.z)

        if(elevation !== false && Number.isFinite(elevation))
        {
            firefly.groundY = elevation
            firefly.hasGround = true
        }
        else
        {
            firefly.groundY = this.state.player.position.current[1]
            firefly.hasGround = false
        }
    }

    update()
    {
        const delta = this.time.delta
        const elapsed = this.time.elapsed
        const playerState = this.state.player
        const playerZ = playerState.position.current[2]

        // Night creatures that ground during rain — the inverse gulls
        const sunY = this.state.sun.position.y
        const nightFactor = this.nightOverride >= 0
            ? this.nightOverride
            : 1 - THREE.MathUtils.smoothstep(sunY, - 0.02, 0.12)
        const presence = nightFactor * (1 - this.state.weather.rainIntensity)

        this.points.visible = presence > 0.01
        this.material.uniforms.uNight.value = presence

        if(!this.points.visible)
            return

        this.material.uniforms.uTime.value = elapsed
        this.frameIndex++

        // Round-robin ground re-sampling: 8 fireflies per frame
        for(let k = 0; k < 8; k++)
        {
            const i = (this.frameIndex * 8 + k) % this.count
            const firefly = this.pool[i]
            const elevation = this.state.chunks.getElevationForPosition(firefly.x, firefly.z)

            if(elevation !== false && Number.isFinite(elevation))
            {
                if(firefly.hasGround)
                    firefly.groundY += (elevation - firefly.groundY) * 0.3
                else
                    firefly.groundY = elevation

                firefly.hasGround = true
            }
        }

        for(let i = 0; i < this.count; i++)
        {
            const firefly = this.pool[i]

            // Wrap the field along the corridor, exact shore check on re-entry
            if(Math.abs(firefly.z - playerZ) > this.windowZ)
            {
                const wrapped = Math.abs(firefly.z - playerZ) > this.windowZ * 2
                    ? playerZ + (Math.random() - 0.5) * this.windowZ * 2
                    : firefly.z - Math.sign(firefly.z - playerZ) * this.windowZ * 2
                this.respawn(firefly, wrapped)
            }

            // Gentle drift
            firefly.x += Math.sin(elapsed * 0.31 + firefly.wp1) * 0.35 * delta
            firefly.z += Math.cos(elapsed * 0.27 + firefly.wp2) * 0.35 * delta

            const y = firefly.groundY + firefly.baseHeight + Math.sin(elapsed * 0.5 + firefly.wp3) * 0.25

            this.positionAttribute.setXYZ(i, firefly.x, y, firefly.z)
        }

        this.positionAttribute.needsUpdate = true
    }

    resize()
    {
        this.material.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio
    }
}
