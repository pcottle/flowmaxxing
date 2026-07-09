import * as THREE from 'three'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class Crabs
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
        this.count = 6
        this.crabScale = 1
        this.fleeRadius = 4.5
        this.fleeSpeed = 4
        this.scuttleSpeedScale = 1
        this.bandInner = 5 // meters from the shoreline (dry side)
        this.bandOuter = 14

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
        // One merged vertex-colored crab, nose along +z, reads at 5-15m:
        // flat red shell, claw nubs, angled leg plates, tiny eyes
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

        const shell = new THREE.SphereGeometry(0.11, 7, 4)
        shell.scale(1.45, 0.55, 1)
        paint(shell, 0.82, 0.22, 0.16)

        // Paler belly rows
        const shellPositions = shell.attributes.position
        const shellColors = shell.attributes.color

        for(let i = 0; i < shellPositions.count; i++)
        {
            if(shellPositions.getY(i) < 0)
                shellColors.setXYZ(i, 0.9, 0.55, 0.4)
        }

        const clawLeft = paint(new THREE.BoxGeometry(0.07, 0.05, 0.09), 0.82, 0.22, 0.16)
        clawLeft.translate(- 0.11, 0, 0.13)
        const clawRight = paint(new THREE.BoxGeometry(0.07, 0.05, 0.09), 0.82, 0.22, 0.16)
        clawRight.translate(0.11, 0, 0.13)

        const legsLeft = paint(new THREE.BoxGeometry(0.26, 0.03, 0.16), 0.6, 0.15, 0.1)
        legsLeft.rotateZ(0.5)
        legsLeft.translate(- 0.13, - 0.02, 0)
        const legsRight = paint(new THREE.BoxGeometry(0.26, 0.03, 0.16), 0.6, 0.15, 0.1)
        legsRight.rotateZ(- 0.5)
        legsRight.translate(0.13, - 0.02, 0)

        const eyeLeft = paint(new THREE.BoxGeometry(0.025, 0.025, 0.025), 0.05, 0.05, 0.06)
        eyeLeft.translate(- 0.045, 0.09, 0.13)
        const eyeRight = paint(new THREE.BoxGeometry(0.025, 0.025, 0.025), 0.05, 0.05, 0.06)
        eyeRight.translate(0.045, 0.09, 0.13)

        this.geometry = mergeBufferGeometries([shell, clawLeft, clawRight, legsLeft, legsRight, eyeLeft, eyeRight])
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
        this.mesh.count = this.count

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
        {
            this.pool.push({
                x: 0,
                z: 1e9, // forces immediate re-place near the player
                y: null,
                shore: 0,
                yaw: Math.random() * Math.PI * 2,
                mode: 'pause',
                timer: Math.random() * 2,
                moveAngle: 0,
                speed: 0,
                hopT: 0,
                bobPhase: Math.random() * Math.PI * 2,
                scale: 0.85 + Math.random() * 0.4
            })
        }
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/crabs')

        folder.add(this, 'count').min(0).max(this.capacity).step(1).onChange(() => { this.mesh.count = this.count })
        folder.add(this, 'crabScale').min(0.3).max(3).step(0.1)
        folder.add(this, 'fleeRadius').min(1).max(10).step(0.5)
        folder.add(this, 'fleeSpeed').min(1).max(10).step(0.5)
        folder.add(this, 'scuttleSpeedScale').min(0.2).max(3).step(0.1)
        folder.add(this, 'bandInner').min(2).max(30).step(1)
        folder.add(this, 'bandOuter').min(4).max(30).step(1)
        folder.add({ scatterNow: () => { this.scatterNow() } }, 'scatterNow')
    }

    scatterNow()
    {
        const playerState = this.state.player

        for(const crab of this.pool)
        {
            crab.mode = 'flee'
            crab.timer = 0.6 + Math.random() * 0.4
            crab.moveAngle = Math.atan2(crab.x - playerState.position.current[0], crab.z - playerState.position.current[2])
            crab.speed = this.fleeSpeed + Math.random() * 1.5
            crab.hopT = 0.35
        }
    }

    replaceCrab(crab, playerZ)
    {
        crab.z = playerZ - 25 - Math.random() * 40
        crab.shore = this.state.terrains.getShoreX(crab.z)
        crab.x = crab.shore - this.bandInner - Math.random() * (this.bandOuter - this.bandInner)
        crab.y = null
        crab.mode = 'pause'
        crab.timer = Math.random() * 2
        crab.yaw = Math.random() * Math.PI * 2
    }

    update()
    {
        const delta = this.time.delta
        const elapsed = this.time.elapsed
        const playerState = this.state.player
        const playerX = playerState.position.current[0]
        const playerZ = playerState.position.current[2]

        for(let i = 0; i < this.count; i++)
        {
            const crab = this.pool[i]

            if(Math.abs(crab.z - playerZ) > 70)
                this.replaceCrab(crab, playerZ)

            // Flee overrides everything while the player is close
            const dx = crab.x - playerX
            const dz = crab.z - playerZ

            if(crab.mode !== 'flee' && dx * dx + dz * dz < this.fleeRadius * this.fleeRadius)
            {
                crab.mode = 'flee'
                crab.timer = 0.6 + Math.random() * 0.4
                crab.moveAngle = Math.atan2(dx, dz)
                // Crabs run sideways: keep the body perpendicular to the escape
                crab.yaw = crab.moveAngle + (Math.random() < 0.5 ? 1 : - 1) * Math.PI * 0.5
                crab.speed = this.fleeSpeed + Math.random() * 1.5
                crab.hopT = 0.35
            }

            crab.timer -= delta

            if(crab.timer <= 0)
            {
                if(crab.mode === 'pause')
                {
                    crab.mode = 'scuttle'
                    crab.timer = 0.35 + Math.random() * 0.55
                    crab.speed = (0.9 + Math.random() * 0.9) * this.scuttleSpeedScale

                    // Sideways relative to the body, steered back into the band
                    let side = Math.random() < 0.5 ? 1 : - 1
                    const bandCenter = crab.shore - (this.bandInner + this.bandOuter) * 0.5
                    const towardBand = Math.sign(bandCenter - crab.x)

                    if(Math.abs(crab.x - bandCenter) > (this.bandOuter - this.bandInner) * 0.4)
                        side = Math.sign(Math.sin(crab.yaw + side * Math.PI * 0.5)) === towardBand ? side : - side

                    crab.moveAngle = crab.yaw + side * Math.PI * 0.5
                }
                else
                {
                    crab.mode = 'pause'
                    crab.timer = 0.8 + Math.random() * 1.8
                }
            }

            const moving = crab.mode !== 'pause'

            if(moving)
            {
                crab.x += Math.sin(crab.moveAngle) * crab.speed * delta
                crab.z += Math.cos(crab.moveAngle) * crab.speed * delta

                crab.shore = this.state.terrains.getShoreX(crab.z)
                crab.x = Math.min(Math.max(crab.x, crab.shore - this.bandOuter - 2), crab.shore - this.bandInner + 1)

                const elevation = this.state.chunks.getElevationForPosition(crab.x, crab.z)

                if(elevation !== false && Number.isFinite(elevation) && elevation > 0.05)
                    crab.y = elevation
            }
            else if(crab.y === null)
            {
                // Waiting for ground under a fresh placement
                const elevation = this.state.chunks.getElevationForPosition(crab.x, crab.z)

                if(elevation !== false && Number.isFinite(elevation) && elevation > 0.05)
                    crab.y = elevation
            }

            if(crab.y === null)
            {
                this.dummy.position.set(0, - 100, 0)
                this.dummy.scale.setScalar(0)
                this.dummy.rotation.set(0, 0, 0)
                this.dummy.updateMatrix()
                this.mesh.setMatrixAt(i, this.dummy.matrix)
                continue
            }

            // Waddle, hop, wobble — all faked on the body, no leg animation
            crab.hopT = Math.max(0, crab.hopT - delta)
            const bob = moving ? Math.abs(Math.sin(elapsed * 14 + crab.bobPhase)) * 0.03 : 0
            const hop = crab.hopT > 0 ? Math.sin((1 - crab.hopT / 0.35) * Math.PI) * 0.18 : 0
            const roll = moving ? Math.sin(elapsed * 14 + crab.bobPhase) * 0.1 : 0
            const yawWobble = moving ? Math.sin(elapsed * 9 + crab.bobPhase) * 0.12 : 0

            this.dummy.position.set(crab.x, crab.y + 0.05 + bob + hop, crab.z)
            this.dummy.rotation.set(0, crab.yaw + yawWobble, roll)
            this.dummy.scale.setScalar(crab.scale * this.crabScale)
            this.dummy.updateMatrix()
            this.mesh.setMatrixAt(i, this.dummy.matrix)
        }

        this.mesh.instanceMatrix.needsUpdate = true

        // Same day/night dimming as the fish
        const day = THREE.MathUtils.smoothstep(this.state.sun.position.y, - 0.2, 0.25)
        this.material.color.setRGB(
            0.35 + 0.65 * day,
            0.38 + 0.62 * day,
            0.48 + 0.52 * day
        )
    }
}
