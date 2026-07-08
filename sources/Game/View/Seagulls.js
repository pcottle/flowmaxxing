import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class Seagulls
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene

        this.capacity = 20
        this.count = 14
        this.gullScale = 1
        this.followRate = 0.8
        this.excitedDrop = 0.55
        this.bankGain = 1.6
        this.orbitSpeedScale = 1
        this.flapSpeedScale = 1
        this.excitementOverride = - 1
        this.cryIntervalMin = 7
        this.cryVolume = 0.035

        this.anchor = new THREE.Vector3(0, 16, 0)
        // Spawn greeting: the flock starts swirling tight and low, with an
        // early cry, then relaxes to flow-driven after a few seconds
        this.excitement = 0.9
        this.greetDuration = 7
        this.cryTimer = 1.5
        this.dummy = new THREE.Object3D()
        this.dummy.rotation.reorder('YXZ')
        this.wingDummy = new THREE.Object3D()
        this.flapQuaternion = new THREE.Quaternion()
        this.flapAxis = new THREE.Vector3(0, 0, 1)

        this.setGeometries()
        this.setMaterial()
        this.setMeshes()
        this.setFlock()
        this.setDebug()
    }

    setGeometries()
    {
        // Body: white dart, nose along +z
        this.bodyGeometry = new THREE.ConeGeometry(0.16, 0.7, 5)
        this.bodyGeometry.rotateX(Math.PI * 0.5)

        const bodyColors = new Float32Array(this.bodyGeometry.attributes.position.count * 3)
        bodyColors.fill(1)
        this.bodyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(bodyColors, 3))

        // Right wing: swept tapered strip in two quads so the black tip has a
        // hard seam (duplicated mid vertices, no color interpolation across it)
        const white = [1, 1, 1]
        const black = [0.05, 0.05, 0.08]
        const v0 = [0.02, 0, 0.18]
        const v1 = [0.02, 0, - 0.17]
        const m0 = [0.52, 0.035, 0.02]
        const m1 = [0.52, 0.035, - 0.2]
        const t0 = [0.78, 0.06, - 0.06]
        const t1 = [0.78, 0.06, - 0.22]

        const wingPositions = [
            ...v0, ...v1, ...m0,
            ...v1, ...m1, ...m0,
            ...m0, ...m1, ...t0,
            ...m1, ...t1, ...t0
        ]
        const wingColors = [
            ...white, ...white, ...white,
            ...white, ...white, ...white,
            ...black, ...black, ...black,
            ...black, ...black, ...black
        ]

        this.wingGeometry = new THREE.BufferGeometry()
        this.wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wingPositions, 3))
        this.wingGeometry.setAttribute('color', new THREE.Float32BufferAttribute(wingColors, 3))

        // Left wing: pre-mirrored clone (negative-scale instance matrices
        // would flip winding)
        this.wingGeometryMirror = this.wingGeometry.clone()
        this.wingGeometryMirror.scale(- 1, 1, 1)
    }

    setMaterial()
    {
        this.material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide
        })
    }

    setMeshes()
    {
        this.body = new THREE.InstancedMesh(this.bodyGeometry, this.material, this.capacity)
        this.wingRight = new THREE.InstancedMesh(this.wingGeometry, this.material, this.capacity)
        this.wingLeft = new THREE.InstancedMesh(this.wingGeometryMirror, this.material, this.capacity)

        for(const mesh of [this.body, this.wingRight, this.wingLeft])
        {
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
            mesh.frustumCulled = false
            mesh.count = this.count
            this.scene.add(mesh)
        }
    }

    setFlock()
    {
        this.gulls = []

        for(let i = 0; i < this.capacity; i++)
        {
            this.gulls.push({
                theta: Math.random() * Math.PI * 2,
                dir: Math.random() < 0.25 ? - 1 : 1,
                radiusBase: 8 + Math.random() * 7,
                radius: 11,
                radiusJitterPhase: Math.random() * Math.PI * 2,
                altitudeBase: 8 + Math.random() * 7,
                altitude: 11,
                speedBase: 0.25 + Math.random() * 0.2,
                respondRate: 0.5 + Math.random(),
                flapPhase: Math.random() * Math.PI * 2,
                flapSpeed: 1.6 + Math.random() * 0.9,
                glideTimer: 0,
                nextGlideIn: 4 + Math.random() * 5,
                bobPhase: Math.random() * Math.PI * 2,
                roll: 0,
                prevX: 0,
                prevY: 18,
                prevZ: 0
            })
        }
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/seagulls')

        folder.add(this, 'count').min(0).max(this.capacity).step(1).onChange(() =>
        {
            for(const mesh of [this.body, this.wingRight, this.wingLeft])
                mesh.count = this.count
        })
        folder.add(this, 'gullScale').min(0.3).max(3).step(0.1)
        folder.add(this, 'followRate').min(0).max(3).step(0.05)
        folder.add(this, 'excitedDrop').min(0).max(0.9).step(0.05)
        folder.add(this, 'orbitSpeedScale').min(0.2).max(3).step(0.1)
        folder.add(this, 'flapSpeedScale').min(0.2).max(3).step(0.1)
        folder.add(this, 'bankGain').min(0).max(4).step(0.1)
        folder.add(this, 'excitementOverride').min(- 1).max(1).step(0.05)
        folder.add(this, 'cryIntervalMin').min(1).max(30).step(1)
        folder.add({ cryNow: () => { this.cry() } }, 'cryNow')
    }

    cry()
    {
        const audio = this.view.audio

        if(!audio)
            return

        // Two quick descending chirps; short decays read as a distant bird
        const frequency = 1650 + Math.random() * 350
        audio.playChime(frequency, this.cryVolume, 0.35, 0)
        audio.playChime(frequency * 0.78, this.cryVolume * 0.8, 0.45, 0.13)

        if(Math.random() < 0.4)
            audio.playChime(frequency * 0.88, this.cryVolume * 0.6, 0.3, 0.28)
    }

    updateTint()
    {
        // Gulls glow flat white by day and fall to cool silhouettes at night
        // (mirrors getTimeOfDayColor in spirit; MeshBasicMaterial is unlit)
        const sunY = this.state.sun.position.y
        const day = THREE.MathUtils.smoothstep(sunY, - 0.2, 0.25)
        const golden = Math.max(0, 1 - Math.abs(sunY - 0.06) * 7) * 0.35

        this.material.color.setRGB(
            0.3 + 0.7 * day + golden * 0.2,
            0.33 + 0.67 * day + golden * 0.06,
            0.44 + 0.56 * day - golden * 0.08
        )
    }

    update()
    {
        const delta = this.time.delta
        const elapsed = this.time.elapsed
        const playerState = this.state.player

        // Gulls roost at night: shrink away as the sun sets, skip all work
        // while they're gone
        const dayFactor = THREE.MathUtils.smoothstep(this.state.sun.position.y, - 0.02, 0.12)
        const flockVisible = dayFactor > 0.01

        this.body.visible = flockVisible
        this.wingRight.visible = flockVisible
        this.wingLeft.visible = flockVisible

        if(!flockVisible)
            return

        const scale = this.gullScale * dayFactor

        // Flock anchor trails the player; slower vertically so dives/launches
        // don't yank the whole flock
        const followXZ = Math.min(1, this.followRate * delta)
        const followY = Math.min(1, this.followRate * 0.6 * delta)
        this.anchor.x += (playerState.position.current[0] - this.anchor.x) * followXZ
        this.anchor.z += (playerState.position.current[2] - this.anchor.z) * followXZ
        this.anchor.y += (Math.max(playerState.position.current[1], 2) - this.anchor.y) * followY

        // Excitement eases toward flow so the swirl builds over seconds;
        // the spawn greeting holds it high, releasing over the last stretch
        const greeting = 1 - THREE.MathUtils.smoothstep(elapsed, this.greetDuration * 0.6, this.greetDuration)
        let flowTarget = this.excitementOverride >= 0 ? this.excitementOverride : playerState.flow
        flowTarget = Math.max(flowTarget, greeting * 0.9)
        this.excitement += (flowTarget - this.excitement) * Math.min(1, 1.2 * delta)
        const excitement = this.excitement

        for(let i = 0; i < this.count; i++)
        {
            const gull = this.gulls[i]

            // Orbit targets tighten and drop as the flock gets excited
            const radiusTarget = gull.radiusBase * (1 - 0.45 * excitement * (this.excitedDrop / 0.55))
                + Math.sin(elapsed * 0.13 + gull.radiusJitterPhase) * 2
            const altitudeTarget = gull.altitudeBase * (1 - this.excitedDrop * excitement)
                + Math.sin(elapsed * 0.21 + gull.bobPhase) * 1.5

            const respond = Math.min(1, gull.respondRate * delta)
            gull.radius += (radiusTarget - gull.radius) * respond
            gull.altitude += (altitudeTarget - gull.altitude) * respond

            gull.theta += gull.dir * gull.speedBase * this.orbitSpeedScale * (1 + excitement * 0.9) * delta

            const x = this.anchor.x + Math.sin(gull.theta) * gull.radius
            const z = this.anchor.z + Math.cos(gull.theta) * gull.radius
            const y = this.anchor.y + gull.altitude + Math.sin(elapsed * 0.6 + gull.bobPhase) * 1.2

            // Heading from actual motion (finite difference) so banking stays
            // honest while the anchor drags the orbit around
            const dx = x - gull.prevX
            const dy = y - gull.prevY
            const dz = z - gull.prevZ
            const horizontalSpeed = Math.hypot(dx, dz)

            const yaw = horizontalSpeed > 0.0001 ? Math.atan2(dx, dz) : gull.theta
            const pitch = THREE.MathUtils.clamp(- Math.atan2(dy, Math.max(horizontalSpeed, 0.001)), - 0.5, 0.5)
            const rollTarget = THREE.MathUtils.clamp(
                gull.dir * (horizontalSpeed / Math.max(delta, 0.001)) / Math.max(gull.radius, 4) * this.bankGain,
                - 0.9,
                0.9
            )
            gull.roll += (rollTarget - gull.roll) * Math.min(1, 4 * delta)

            gull.prevX = x
            gull.prevY = y
            gull.prevZ = z

            this.dummy.position.set(x, y, z)
            this.dummy.rotation.set(pitch, yaw, gull.roll)
            this.dummy.scale.setScalar(scale)
            this.dummy.updateMatrix()
            this.body.setMatrixAt(i, this.dummy.matrix)

            // Glide: freeze the flap at a raised dihedral now and then
            gull.nextGlideIn -= delta

            if(gull.glideTimer > 0)
            {
                gull.glideTimer -= delta
            }
            else if(gull.nextGlideIn <= 0)
            {
                gull.glideTimer = 1 + Math.random() * 2
                gull.nextGlideIn = (4 + Math.random() * 5) * (1 + excitement * 1.5)
            }

            const flapAngle = gull.glideTimer > 0
                ? 0.3
                : Math.sin(elapsed * gull.flapSpeed * this.flapSpeedScale * (1 + excitement * 0.35) + gull.flapPhase) * 0.85

            // Wings rotate about the body's forward axis, opposite signs per side
            for(const [mesh, sign] of [[this.wingRight, - 1], [this.wingLeft, 1]])
            {
                this.flapQuaternion.setFromAxisAngle(this.flapAxis, sign * flapAngle)
                this.wingDummy.position.copy(this.dummy.position)
                this.wingDummy.quaternion.copy(this.dummy.quaternion).multiply(this.flapQuaternion)
                this.wingDummy.scale.setScalar(scale)
                this.wingDummy.updateMatrix()
                mesh.setMatrixAt(i, this.wingDummy.matrix)
            }
        }

        this.body.instanceMatrix.needsUpdate = true
        this.wingRight.instanceMatrix.needsUpdate = true
        this.wingLeft.instanceMatrix.needsUpdate = true

        this.updateTint()

        // Occasional cries, more frequent when the flock is excited
        this.cryTimer -= delta

        if(this.cryTimer <= 0)
        {
            this.cryTimer = THREE.MathUtils.lerp(18, this.cryIntervalMin, excitement) + Math.random() * 12
            this.cry()
        }
    }
}
