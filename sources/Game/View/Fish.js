import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class Fish
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene

        this.capacity = 10
        this.intervalMin = 3
        this.intervalMax = 7
        this.schoolMax = 3
        // Close enough to the surf line to actually read from the beach —
        // at the old 22-85m a 0.45m dart was an invisible speck
        this.offshoreMin = 8
        this.offshoreMax = 30
        this.windowZ = 90
        this.gravity = 14
        this.peakMin = 1.5
        this.peakMax = 3.5
        this.fishScale = 1.8
        this.splashVolume = 0.35

        this.spawnTimer = 3
        this.dummy = new THREE.Object3D()
        this.dummy.rotation.reorder('YXZ')

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        this.setPool()
        this.setDebug()
    }

    setGeometry()
    {
        // Little dart, nose along +z; dark back over pale belly
        this.geometry = new THREE.ConeGeometry(0.1, 0.45, 4)
        this.geometry.rotateX(Math.PI * 0.5)

        const positions = this.geometry.attributes.position
        const colors = new Float32Array(positions.count * 3)
        const back = new THREE.Color('#4e7f96')
        const belly = new THREE.Color('#cfeef5')

        for(let i = 0; i < positions.count; i++)
        {
            const color = positions.getY(i) > 0 ? back : belly
            colors[i * 3    ] = color.r
            colors[i * 3 + 1] = color.g
            colors[i * 3 + 2] = color.b
        }

        this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    }

    setMaterial()
    {
        this.material = new THREE.MeshBasicMaterial({ vertexColors: true })
    }

    setMesh()
    {
        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity)
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.mesh.frustumCulled = false

        // Park all instances at zero scale until a fish goes live
        this.dummy.scale.setScalar(0)
        this.dummy.updateMatrix()

        for(let i = 0; i < this.capacity; i++)
            this.mesh.setMatrixAt(i, this.dummy.matrix)

        this.scene.add(this.mesh)
    }

    setPool()
    {
        this.pool = []

        for(let i = 0; i < this.capacity; i++)
            this.pool.push({ active: false, delay: 0 })
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/fish')

        folder.add(this, 'intervalMin').min(1).max(30).step(0.5)
        folder.add(this, 'intervalMax').min(1).max(60).step(0.5)
        folder.add(this, 'schoolMax').min(1).max(3).step(1)
        folder.add(this, 'offshoreMin').min(5).max(150).step(1)
        folder.add(this, 'offshoreMax').min(10).max(250).step(1)
        folder.add(this, 'gravity').min(4).max(30).step(0.5)
        folder.add(this, 'peakMin').min(0.3).max(5).step(0.1)
        folder.add(this, 'peakMax').min(0.5).max(8).step(0.1)
        folder.add(this, 'fishScale').min(0.3).max(4).step(0.1)
        folder.add(this, 'splashVolume').min(0).max(1).step(0.05)
        folder.add({ jumpNow: () => { this.spawnSchool(true) } }, 'jumpNow')
    }

    spawnSchool(nearPlayer = false)
    {
        const playerZ = this.state.player.position.current[2]
        const schoolZ = nearPlayer
            ? playerZ - 20
            : playerZ + (Math.random() - 0.5) * this.windowZ
        const schoolSize = 1 + Math.floor(Math.random() * this.schoolMax)
        let started = 0

        for(const fish of this.pool)
        {
            if(fish.active)
                continue

            const z = schoolZ + (Math.random() - 0.5) * 12
            const x = this.state.terrains.getShoreX(z)
                + this.offshoreMin + Math.random() * (this.offshoreMax - this.offshoreMin)
            const peak = this.peakMin + Math.random() * (this.peakMax - this.peakMin)
            const heading = Math.random() * Math.PI * 2
            const speed = 2 + Math.random() * 2.5

            fish.active = true
            fish.delay = started * (0.12 + Math.random() * 0.15)
            fish.x = x
            fish.y = 0
            fish.z = z
            fish.prevY = 0
            fish.vx = Math.sin(heading) * speed
            fish.vy = Math.sqrt(2 * this.gravity * peak)
            fish.vz = Math.cos(heading) * speed - 1 // slight down-corridor bias
            fish.wigglePhase = Math.random() * Math.PI * 2
            fish.scale = (0.9 + Math.random() * 0.4) * this.fishScale
            fish.splashed = false

            started++

            if(started >= schoolSize)
                break
        }
    }

    update()
    {
        const delta = this.time.delta
        const elapsed = this.time.elapsed
        const playerState = this.state.player
        const playerX = playerState.position.current[0]
        const playerZ = playerState.position.current[2]

        this.spawnTimer -= delta

        if(this.spawnTimer <= 0)
        {
            this.spawnTimer = this.intervalMin + Math.random() * (this.intervalMax - this.intervalMin)
            this.spawnSchool()
        }

        for(let i = 0; i < this.capacity; i++)
        {
            const fish = this.pool[i]

            if(!fish.active)
                continue

            if(fish.delay > 0)
            {
                fish.delay -= delta
                continue
            }

            if(!fish.splashed)
            {
                // Exit spray the moment the fish goes live at the surface
                fish.splashed = true
                this.view.particles.spawnSpray(2, [fish.x, 0.2, fish.z])
            }

            fish.prevY = fish.y
            fish.vy -= this.gravity * delta
            fish.x += fish.vx * delta
            fish.y += fish.vy * delta
            fish.z += fish.vz * delta

            // Re-entry: sign crossing, not proximity, so clamped deltas can't tunnel
            if(fish.prevY > 0 && fish.y <= 0)
            {
                this.view.particles.spawnSpray(3, [fish.x, 0.2, fish.z])

                const distance = Math.hypot(fish.x - playerX, fish.z - playerZ)
                const intensity = this.splashVolume * Math.max(0, 1 - distance / 110)

                if(intensity > 0.04)
                    this.view.audio.playSplash(intensity)

                this.deactivate(i)
                continue
            }

            if(fish.y < - 2 || Math.abs(fish.z - playerZ) > 140)
            {
                this.deactivate(i)
                continue
            }

            const horizontalSpeed = Math.hypot(fish.vx, fish.vz)

            this.dummy.position.set(fish.x, fish.y, fish.z)
            this.dummy.rotation.set(
                THREE.MathUtils.clamp(- Math.atan2(fish.vy, horizontalSpeed), - 1.2, 1.2),
                Math.atan2(fish.vx, fish.vz),
                Math.sin(elapsed * 20 + fish.wigglePhase) * 0.25
            )
            this.dummy.scale.setScalar(fish.scale)
            this.dummy.updateMatrix()
            this.mesh.setMatrixAt(i, this.dummy.matrix)
        }

        this.mesh.instanceMatrix.needsUpdate = true

        // Same day/night tint approach as the gulls
        const sunY = this.state.sun.position.y
        const day = THREE.MathUtils.smoothstep(sunY, - 0.2, 0.25)
        this.material.color.setRGB(
            0.35 + 0.65 * day,
            0.38 + 0.62 * day,
            0.48 + 0.52 * day
        )
    }

    deactivate(index)
    {
        this.pool[index].active = false
        this.dummy.scale.setScalar(0)
        this.dummy.updateMatrix()
        this.mesh.setMatrixAt(index, this.dummy.matrix)
    }
}
