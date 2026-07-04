import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import ParticlesMaterial from './Materials/ParticlesMaterial.js'

export default class Particles
{
    constructor()
    {
        this.game = Game.getInstance()
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.viewport = this.state.viewport
        this.scene = this.view.scene

        this.count = 256
        this.index = 0
        this.lastWispTime = 0
        this.wispInterval = 0.07
        this.wispSpeedThreshold = 4

        this.setGeometry()
        this.setMaterial()
        this.setPoints()
        this.setDebug()

        const playerState = this.state.player

        playerState.events.on('jump', () =>
        {
            this.spawnBurst(8, playerState.position.current, { speed: 1.5, up: 1.2, size: 8, lifetime: 0.9 })
        })

        playerState.events.on('land', (impactSpeed) =>
        {
            const intensity = Math.min(impactSpeed / 12, 1)
            this.spawnBurst(
                6 + Math.round(intensity * 12),
                playerState.position.current,
                { speed: 1 + intensity * 3, up: 0.4, size: 6 + intensity * 8, lifetime: 1.1 }
            )
        })
    }

    setGeometry()
    {
        const positions = new Float32Array(this.count * 3)
        const velocities = new Float32Array(this.count * 3)
        const spawnTimes = new Float32Array(this.count)
        const lifetimes = new Float32Array(this.count)
        const sizes = new Float32Array(this.count)

        spawnTimes.fill(- 9999)
        lifetimes.fill(1)

        this.geometry = new THREE.BufferGeometry()
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        this.geometry.setAttribute('aVelocity', new THREE.Float32BufferAttribute(velocities, 3))
        this.geometry.setAttribute('aSpawnTime', new THREE.Float32BufferAttribute(spawnTimes, 1))
        this.geometry.setAttribute('aLifetime', new THREE.Float32BufferAttribute(lifetimes, 1))
        this.geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
    }

    setMaterial()
    {
        this.material = new ParticlesMaterial()
        this.material.uniforms.uColor.value.set('#d6cfb4')
        this.material.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio
    }

    setPoints()
    {
        this.points = new THREE.Points(this.geometry, this.material)
        this.points.frustumCulled = false
        this.scene.add(this.points)
    }

    spawnBurst(burstCount, origin, options)
    {
        const positions = this.geometry.attributes.position
        const velocities = this.geometry.attributes.aVelocity
        const spawnTimes = this.geometry.attributes.aSpawnTime
        const lifetimes = this.geometry.attributes.aLifetime
        const sizes = this.geometry.attributes.aSize

        for(let i = 0; i < burstCount; i++)
        {
            const angle = Math.random() * Math.PI * 2
            const radial = options.speed * (0.5 + Math.random() * 0.5)

            positions.setXYZ(this.index, origin[0], origin[1] + 0.1, origin[2])
            velocities.setXYZ(
                this.index,
                Math.sin(angle) * radial,
                options.up * (0.5 + Math.random()),
                Math.cos(angle) * radial
            )
            spawnTimes.setX(this.index, this.time.elapsed)
            lifetimes.setX(this.index, options.lifetime * (0.7 + Math.random() * 0.6))
            sizes.setX(this.index, options.size * (0.7 + Math.random() * 0.6))

            this.index = (this.index + 1) % this.count
        }

        positions.needsUpdate = true
        velocities.needsUpdate = true
        spawnTimes.needsUpdate = true
        lifetimes.needsUpdate = true
        sizes.needsUpdate = true
    }

    update()
    {
        const playerState = this.state.player
        const sunState = this.state.sun

        this.material.uniforms.uTime.value = this.time.elapsed
        this.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)

        // Walk wisps
        if(
            playerState.grounded
            && playerState.horizontalSpeed > this.wispSpeedThreshold
            && this.time.elapsed - this.lastWispTime > this.wispInterval
        )
        {
            this.lastWispTime = this.time.elapsed
            this.spawnBurst(1, playerState.position.current, {
                speed: 0.4,
                up: 0.6,
                size: 4 + playerState.horizontalSpeed * 0.15,
                lifetime: 0.7
            })
        }
    }

    resize()
    {
        this.material.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/particles')

        folder.addColor(this.material.uniforms.uColor, 'value').name('uColor')
        folder.add(this.material.uniforms.uOpacity, 'value').min(0).max(1).step(0.01).name('uOpacity')
        folder.add(this, 'wispInterval').min(0.02).max(0.5).step(0.01)
        folder.add(this, 'wispSpeedThreshold').min(0).max(30).step(0.5)
    }
}
