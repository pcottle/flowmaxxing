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

        this.count = 384
        this.index = 0
        this.setGeometry()
        this.setMaterial()
        this.setPoints()
        this.setDebug()

        const playerState = this.state.player

        playerState.events.on('jump', () =>
        {
            this.spawnWindMarks(14, playerState.position.current, {
                angle: this.getTravelAngle(playerState),
                spread: Math.PI * 0.85,
                radius: 0.45,
                speed: 3.5,
                up: 1.9,
                size: 15,
                stretch: 1.7,
                lifetime: 0.55
            })
        })

        playerState.events.on('land', (impactSpeed) =>
        {
            const intensity = Math.min(impactSpeed / 12, 1)
            this.spawnWindMarks(
                10 + Math.round(intensity * 14),
                playerState.position.current,
                {
                    angle: this.getTravelAngle(playerState),
                    spread: Math.PI * 1.15,
                    radius: 0.55,
                    speed: 2.8 + intensity * 4.2,
                    up: 0.45,
                    size: 13 + intensity * 9,
                    stretch: 2,
                    lifetime: 0.62
                }
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
        const rotations = new Float32Array(this.count)
        const stretches = new Float32Array(this.count)

        spawnTimes.fill(- 9999)
        lifetimes.fill(1)
        stretches.fill(1)

        this.geometry = new THREE.BufferGeometry()
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        this.geometry.setAttribute('aVelocity', new THREE.Float32BufferAttribute(velocities, 3))
        this.geometry.setAttribute('aSpawnTime', new THREE.Float32BufferAttribute(spawnTimes, 1))
        this.geometry.setAttribute('aLifetime', new THREE.Float32BufferAttribute(lifetimes, 1))
        this.geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
        this.geometry.setAttribute('aRotation', new THREE.Float32BufferAttribute(rotations, 1))
        this.geometry.setAttribute('aStretch', new THREE.Float32BufferAttribute(stretches, 1))
    }

    setMaterial()
    {
        this.material = new ParticlesMaterial()
        this.material.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio
    }

    setPoints()
    {
        this.points = new THREE.Points(this.geometry, this.material)
        this.points.frustumCulled = false
        this.scene.add(this.points)
    }

    getTravelAngle(playerState)
    {
        const velocityX = playerState.velocity[0]
        const velocityZ = playerState.velocity[2]
        const speed = Math.hypot(velocityX, velocityZ)

        if(speed > 0.25)
            return Math.atan2(velocityX / speed, velocityZ / speed)

        return playerState.rotation + Math.PI
    }

    spawnWindMarks(burstCount, origin, options)
    {
        const positions = this.geometry.attributes.position
        const velocities = this.geometry.attributes.aVelocity
        const spawnTimes = this.geometry.attributes.aSpawnTime
        const lifetimes = this.geometry.attributes.aLifetime
        const sizes = this.geometry.attributes.aSize
        const rotations = this.geometry.attributes.aRotation
        const stretches = this.geometry.attributes.aStretch

        for(let i = 0; i < burstCount; i++)
        {
            const baseAngle = options.angle ?? Math.random() * Math.PI * 2
            const spread = options.spread ?? Math.PI * 2
            const angle = baseAngle + (Math.random() - 0.5) * spread
            const radius = (options.radius ?? 0) * (0.65 + Math.random() * 0.55)
            const radial = options.speed * (0.5 + Math.random() * 0.5)

            positions.setXYZ(
                this.index,
                origin[0] + Math.sin(angle) * radius,
                origin[1] + 0.18 + Math.random() * 0.28,
                origin[2] + Math.cos(angle) * radius
            )
            velocities.setXYZ(
                this.index,
                Math.sin(angle) * radial,
                options.up * (0.5 + Math.random()),
                Math.cos(angle) * radial
            )
            spawnTimes.setX(this.index, this.time.elapsed)
            lifetimes.setX(this.index, options.lifetime * (0.7 + Math.random() * 0.6))
            sizes.setX(this.index, options.size * (0.7 + Math.random() * 0.6))
            rotations.setX(this.index, angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.8)
            stretches.setX(this.index, options.stretch * (0.75 + Math.random() * 0.5))

            this.index = (this.index + 1) % this.count
        }

        positions.needsUpdate = true
        velocities.needsUpdate = true
        spawnTimes.needsUpdate = true
        lifetimes.needsUpdate = true
        sizes.needsUpdate = true
        rotations.needsUpdate = true
        stretches.needsUpdate = true
    }

    update()
    {
        const playerState = this.state.player
        const sunState = this.state.sun

        this.material.uniforms.uTime.value = this.time.elapsed
        this.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
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
        folder.addColor(this.material.uniforms.uHighlightColor, 'value').name('uHighlightColor')
        folder.add(this.material.uniforms.uOpacity, 'value').min(0).max(1).step(0.01).name('uOpacity')
    }
}
