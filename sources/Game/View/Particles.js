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

        this.count = 512 // spray shares the ring buffer with jump/land bursts
        this.index = 0
        this.sprayTimer = 0
        this.curlTimer = 1.5
        this.jumpStreakSize = 1
        this.jumpCurlSize = 2
        this.jumpStreakCount = 10
        this.jumpCurlCount = 4
        this.landStreakSize = 1
        this.landStreakCount = 6
        this.trickStreakSize = 1 // roll / bounce / bump bursts
        this.setGeometry()
        this.setMaterial()
        this.setPoints()
        this.setDebug()

        const playerState = this.state.player

        playerState.events.on('jump', () =>
        {
            this.spawnWindMarks(this.jumpStreakCount, playerState.position.current, {
                angle: this.getTravelAngle(playerState),
                spread: Math.PI * 0.85,
                radius: 0.45,
                speed: 3.5,
                up: 1.9,
                size: this.jumpStreakSize,
                stretch: 1.7,
                lifetime: 0.55
            })
            this.spawnCurlBurst(this.jumpCurlCount, playerState.position.current, {
                angle: this.getTravelAngle(playerState),
                spread: Math.PI * 2,
                radius: 0.7,
                speed: 2.6,
                up: 1.5,
                size: this.jumpCurlSize,
                lifetime: 0.85
            })
        })

        playerState.events.on('land', (impactSpeed) =>
        {
            const intensity = Math.min(impactSpeed / 12, 1)
            this.spawnWindMarks(
                Math.round(this.landStreakCount * (1 + intensity * 1.4)),
                playerState.position.current,
                {
                    angle: this.getTravelAngle(playerState),
                    spread: Math.PI * 1.15,
                    radius: 0.55,
                    speed: 2.8 + intensity * 4.2,
                    up: 0.45,
                    size: this.landStreakSize * (1 + intensity * 0.7),
                    stretch: 2,
                    lifetime: 0.62
                }
            )
        })

        playerState.events.on('roll', (direction) =>
        {
            // Streaks flung out the side the player rolls toward
            this.spawnWindMarks(10, playerState.position.current, {
                angle: this.getTravelAngle(playerState) + direction * Math.PI * 0.5,
                spread: Math.PI * 0.5,
                radius: 0.5,
                speed: 4.5,
                up: 1.2,
                size: this.trickStreakSize * 1.3,
                stretch: 2.2,
                lifetime: 0.5
            })
        })

        playerState.events.on('splash', (impactSpeed) =>
        {
            const intensity = Math.min(impactSpeed / 12, 1)
            this.spawnSpray(8 + Math.round(intensity * 10), playerState.position.current)
        })

        playerState.events.on('bump', (bumpSpeed) =>
        {
            // Puff back against the travel direction
            const intensity = Math.min(bumpSpeed / 20, 1)
            this.spawnWindMarks(5 + Math.round(intensity * 5), playerState.position.current, {
                angle: this.getTravelAngle(playerState) + Math.PI,
                spread: Math.PI * 0.7,
                radius: 0.4,
                speed: 2 + intensity * 2.5,
                up: 1,
                size: this.trickStreakSize * (1 + intensity * 0.5),
                stretch: 1.5,
                lifetime: 0.45
            })
        })

        playerState.events.on('bounce', (impactSpeed) =>
        {
            const intensity = Math.min(impactSpeed / 12, 1)
            this.spawnWindMarks(6 + Math.round(intensity * 6), playerState.position.current, {
                angle: this.getTravelAngle(playerState),
                spread: Math.PI * 0.9,
                radius: 0.4,
                speed: 2.2 + intensity * 3,
                up: 1.4,
                size: this.trickStreakSize * (1 + intensity * 0.55),
                stretch: 1.8,
                lifetime: 0.5
            })
        })

        this.state.cyclones.events.on('cycloneLaunch', ({ position }) =>
        {
            // Big spiral send-off spinning up out of the column
            this.spawnCurlBurst(10, position, {
                angle: 0,
                spread: Math.PI * 2,
                radius: 1.5,
                speed: 3,
                up: 4,
                size: this.jumpCurlSize * 1.2,
                lifetime: 1
            })
            this.spawnWindMarks(12, position, {
                angle: 0,
                spread: Math.PI * 2,
                radius: 1.2,
                speed: 5,
                up: 2.5,
                size: this.jumpStreakSize,
                stretch: 2,
                lifetime: 0.6
            })
        })

        this.state.obstacleCourses.events.on('ringCollect', ({ position, direction }) =>
        {
            this.spawnWindMarks(16, position, {
                angle: Math.atan2(direction[0], direction[2]),
                spread: Math.PI * 1.4,
                radius: 1.1,
                speed: 4.4,
                up: 1.3,
                size: this.trickStreakSize * 1.45,
                stretch: 2.1,
                lifetime: 0.5
            })

            this.spawnCurlBurst(5, position, {
                angle: Math.atan2(direction[0], direction[2]),
                spread: Math.PI * 2,
                radius: 1.2,
                speed: 2.8,
                up: 1.1,
                size: this.jumpCurlSize * 0.9,
                lifetime: 0.75
            })
        })

        this.state.obstacleCourses.events.on('courseComplete', ({ perfect }) =>
        {
            if(!perfect)
                return

            this.spawnCurlBurst(8, playerState.position.current, {
                angle: this.getTravelAngle(playerState),
                spread: Math.PI * 2,
                radius: 1.2,
                speed: 3,
                up: 2,
                size: this.jumpCurlSize,
                lifetime: 0.9
            })
        })

        this.state.bouncePads.events.on('padBounce', ({ position, perfect }) =>
        {
            this.spawnWindMarks(12, position, {
                angle: 0,
                spread: Math.PI * 2,
                radius: 2,
                speed: 3.5,
                up: 2.2,
                size: this.trickStreakSize * 1.3,
                stretch: 1.8,
                lifetime: 0.5
            })

            if(perfect)
                this.spawnCurlBurst(6, position, {
                    angle: 0,
                    spread: Math.PI * 2,
                    radius: 1.4,
                    speed: 2.6,
                    up: 2,
                    size: this.jumpCurlSize,
                    lifetime: 0.8
                })
        })

        this.state.bouncePads.events.on('prizeCollect', ({ position }) =>
        {
            this.spawnWindMarks(24, position, {
                angle: 0,
                spread: Math.PI * 2,
                radius: 1.5,
                speed: 5,
                up: 2.8,
                size: this.trickStreakSize * 1.6,
                stretch: 2.1,
                lifetime: 0.6
            })

            this.spawnCurlBurst(10, position, {
                angle: 0,
                spread: Math.PI * 2,
                radius: 1.4,
                speed: 3.2,
                up: 2.4,
                size: this.jumpCurlSize * 1.1,
                lifetime: 0.9
            })
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
        const types = new Float32Array(this.count) // 0 = wind streak, 1 = spray puff

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
        this.geometry.setAttribute('aType', new THREE.Float32BufferAttribute(types, 1))
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
            this.geometry.attributes.aType.setX(this.index, 0)

            this.index = (this.index + 1) % this.count
        }

        positions.needsUpdate = true
        velocities.needsUpdate = true
        spawnTimes.needsUpdate = true
        lifetimes.needsUpdate = true
        sizes.needsUpdate = true
        rotations.needsUpdate = true
        stretches.needsUpdate = true
        this.geometry.attributes.aType.needsUpdate = true
    }

    // White ballistic puffs at a breaking wave front
    spawnSpray(burstCount, origin)
    {
        const positions = this.geometry.attributes.position
        const velocities = this.geometry.attributes.aVelocity
        const spawnTimes = this.geometry.attributes.aSpawnTime
        const lifetimes = this.geometry.attributes.aLifetime
        const sizes = this.geometry.attributes.aSize
        const rotations = this.geometry.attributes.aRotation
        const stretches = this.geometry.attributes.aStretch
        const types = this.geometry.attributes.aType

        for(let i = 0; i < burstCount; i++)
        {
            positions.setXYZ(
                this.index,
                origin[0] + (Math.random() - 0.5) * 3,
                origin[1] + Math.random() * 0.4,
                origin[2] + (Math.random() - 0.5) * 6
            )
            velocities.setXYZ(
                this.index,
                - 1.5 - Math.random() * 2, // shoreward (-X)
                2.2 + Math.random() * 2.2,
                (Math.random() - 0.5) * 1.5
            )
            spawnTimes.setX(this.index, this.time.elapsed)
            lifetimes.setX(this.index, 0.9 * (0.7 + Math.random() * 0.6))
            sizes.setX(this.index, 3.2 * (0.7 + Math.random() * 0.6))
            rotations.setX(this.index, Math.random() * Math.PI * 2)
            stretches.setX(this.index, 1)
            types.setX(this.index, 1)

            this.index = (this.index + 1) % this.count
        }

        positions.needsUpdate = true
        velocities.needsUpdate = true
        spawnTimes.needsUpdate = true
        lifetimes.needsUpdate = true
        sizes.needsUpdate = true
        rotations.needsUpdate = true
        stretches.needsUpdate = true
        types.needsUpdate = true
    }

    // Small wind curls flung outward from a trick — same spiral glyph as the
    // ambient curls, but short-lived punctuation marks around the player
    spawnCurlBurst(burstCount, origin, options)
    {
        const positions = this.geometry.attributes.position
        const velocities = this.geometry.attributes.aVelocity
        const spawnTimes = this.geometry.attributes.aSpawnTime
        const lifetimes = this.geometry.attributes.aLifetime
        const sizes = this.geometry.attributes.aSize
        const rotations = this.geometry.attributes.aRotation
        const stretches = this.geometry.attributes.aStretch
        const types = this.geometry.attributes.aType

        for(let i = 0; i < burstCount; i++)
        {
            const baseAngle = options.angle ?? Math.random() * Math.PI * 2
            const spread = options.spread ?? Math.PI * 2
            const angle = baseAngle + (i / burstCount + (Math.random() - 0.5) * 0.25) * spread
            const radius = (options.radius ?? 0.5) * (0.7 + Math.random() * 0.6)
            const radial = options.speed * (0.6 + Math.random() * 0.5)

            positions.setXYZ(
                this.index,
                origin[0] + Math.sin(angle) * radius,
                origin[1] + 0.5 + Math.random() * 0.8,
                origin[2] + Math.cos(angle) * radius
            )
            velocities.setXYZ(
                this.index,
                Math.sin(angle) * radial,
                options.up * (0.5 + Math.random()),
                Math.cos(angle) * radial
            )
            spawnTimes.setX(this.index, this.time.elapsed)
            lifetimes.setX(this.index, options.lifetime * (0.75 + Math.random() * 0.5))
            sizes.setX(this.index, options.size * (0.8 + Math.random() * 0.4))
            rotations.setX(this.index, angle)
            stretches.setX(this.index, 1.25)
            types.setX(this.index, 2)

            this.index = (this.index + 1) % this.count
        }

        positions.needsUpdate = true
        velocities.needsUpdate = true
        spawnTimes.needsUpdate = true
        lifetimes.needsUpdate = true
        sizes.needsUpdate = true
        rotations.needsUpdate = true
        stretches.needsUpdate = true
        types.needsUpdate = true
    }

    // Ambient Wind Waker wind curl: a white spiral glyph drifting down-beach
    spawnCurl(origin)
    {
        const positions = this.geometry.attributes.position
        const velocities = this.geometry.attributes.aVelocity
        const spawnTimes = this.geometry.attributes.aSpawnTime
        const lifetimes = this.geometry.attributes.aLifetime
        const sizes = this.geometry.attributes.aSize
        const rotations = this.geometry.attributes.aRotation
        const stretches = this.geometry.attributes.aStretch
        const types = this.geometry.attributes.aType

        positions.setXYZ(this.index, origin[0], origin[1], origin[2])
        velocities.setXYZ(
            this.index,
            (Math.random() - 0.5) * 1.5,
            (Math.random() - 0.3) * 0.4,
            - 4 - Math.random() * 4 // down-beach (-Z) wind
        )
        spawnTimes.setX(this.index, this.time.elapsed)
        lifetimes.setX(this.index, 3.2 + Math.random() * 1.6)
        sizes.setX(this.index, 22 + Math.random() * 10)
        rotations.setX(this.index, 0)
        stretches.setX(this.index, 1.25)
        types.setX(this.index, 2)

        this.index = (this.index + 1) % this.count

        positions.needsUpdate = true
        velocities.needsUpdate = true
        spawnTimes.needsUpdate = true
        lifetimes.needsUpdate = true
        sizes.needsUpdate = true
        rotations.needsUpdate = true
        stretches.needsUpdate = true
        types.needsUpdate = true
    }

    update()
    {
        const playerState = this.state.player
        const sunState = this.state.sun

        this.material.uniforms.uTime.value = this.time.elapsed
        this.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)

        // Sea spray while a set wave shoals in close to shore
        const waveSets = this.state.waveSets
        this.sprayTimer -= this.time.delta

        if(waveSets && this.sprayTimer <= 0)
        {
            const terrains = this.state.terrains
            const playerZ = playerState.position.current[2]

            for(let i = 0; i < waveSets.sets.length; i++)
            {
                const set = waveSets.sets[i]

                if(set.frontD > 8 && set.frontD < 30 && set.amplitude > 0.45)
                {
                    this.sprayTimer = 0.12

                    for(let burst = 0; burst < 2; burst++)
                    {
                        const z = playerZ + (Math.random() - 0.5) * 120
                        const x = terrains.getShoreX(z) + set.frontD + waveSets.getFrontJitter(z, i)
                        this.spawnSpray(6, [x, 0.6 + set.amplitude, z])
                    }
                }
            }
        }

        // Ambient wind curls drifting down the corridor, stronger wind = more
        this.curlTimer -= this.time.delta

        if(this.curlTimer <= 0)
        {
            const windStrength = this.state.wind ? this.state.wind.strength : 0.5
            this.curlTimer = 3.0 - windStrength * 1.5 + Math.random() * 1.5

            const curlCount = 1 + Math.round(Math.random() * windStrength)

            for(let i = 0; i < curlCount; i++)
            {
                const playerPosition = playerState.position.current
                const angle = Math.random() * Math.PI * 2
                const radius = 20 + Math.random() * 40
                const x = playerPosition[0] + Math.sin(angle) * radius
                const z = playerPosition[2] + Math.cos(angle) * radius + 20 // bias upwind (+Z) so curls drift across the view
                const groundY = this.state.chunks.getElevationForPosition(x, z)
                const y = (groundY === false ? playerPosition[1] : Math.max(groundY, 0)) + 1.5 + Math.random() * 6

                this.spawnCurl([x, y, z])
            }
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
        folder.addColor(this.material.uniforms.uHighlightColor, 'value').name('uHighlightColor')
        folder.add(this.material.uniforms.uOpacity, 'value').min(0).max(1).step(0.01).name('uOpacity')
        folder.add(this, 'jumpStreakSize').min(0.5).max(20).step(0.5)
        folder.add(this, 'jumpCurlSize').min(0.5).max(20).step(0.5)
        folder.add(this, 'jumpStreakCount').min(0).max(30).step(1)
        folder.add(this, 'jumpCurlCount').min(0).max(12).step(1)
        folder.add(this, 'landStreakSize').min(0.5).max(20).step(0.5)
        folder.add(this, 'landStreakCount').min(0).max(30).step(1)
        folder.add(this, 'trickStreakSize').min(0.5).max(20).step(0.5)
    }
}
