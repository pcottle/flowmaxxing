import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import Debug from '@/Debug/Debug.js'
import State from '@/State/State.js'
import PlayerMaterial from './Materials/PlayerMaterial.js'

export default class Player
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene

        this.baseHeight = 0.25
        this.bobAmplitude = 0.06
        this.bobFrequency = 1.8
        this.breathAmplitude = 0.015
        this.leanMax = 1.4
        this.leanLerpRate = 8
        this.lean = 0
        this.idleSpinSpeed = 0.6
        this.speedSpinSpeed = 8
        this.stretch = 0
        this.stretchDecayRate = 8
        this.rollDuration = 0.45
        this.rollProgress = 1
        this.rollDirection = 1
        this.rollAxis = new THREE.Vector3()
        this.rollQuaternion = new THREE.Quaternion()
        this.diveLean = 0.5
        this.flowGlow = 0.4

        this.setGroup()
        this.setHelper()
        this.setDebug()

        const playerState = this.state.player

        playerState.events.on('jump', () =>
        {
            this.stretch = 0.25
        })

        playerState.events.on('dash', () =>
        {
            this.stretch = 0.18
        })

        playerState.events.on('land', (impactSpeed) =>
        {
            this.stretch = - 0.3 * Math.min(impactSpeed / 12, 1)
        })

        playerState.events.on('roll', (direction) =>
        {
            this.rollDirection = direction
            this.rollProgress = 0
            this.stretch = 0.18
        })

        playerState.events.on('bounce', () =>
        {
            this.stretch = 0.2
        })

        playerState.events.on('bump', (bumpSpeed) =>
        {
            this.stretch = - 0.25 * Math.min(bumpSpeed / 20, 1)
        })

        playerState.events.on('splash', (impactSpeed) =>
        {
            this.stretch = - 0.25 * Math.min(impactSpeed / 12, 1)
        })
    }

    setGroup()
    {
        this.group = new THREE.Group()
        this.scene.add(this.group)
    }

    setHelper()
    {
        // Tilt node: faces movement direction and leans, so the idle spin
        // on the mesh below never changes the lean direction
        this.tilt = new THREE.Group()
        this.tilt.rotation.reorder('YXZ')
        this.group.add(this.tilt)

        this.helper = new THREE.Mesh()
        this.helper.material = new PlayerMaterial()
        this.baseColor = new THREE.Color('#fff8d6')
        this.helper.material.uniforms.uColor.value = this.baseColor.clone()
        this.helper.material.uniforms.uSunPosition.value = new THREE.Vector3(- 0.5, - 0.5, - 0.5)

        // Faceted cone: non-indexed with recomputed normals for flat sides
        let geometry = new THREE.ConeGeometry(0.7, 1.8, 8, 1)
        geometry = geometry.toNonIndexed()
        geometry.computeVertexNormals()
        geometry.translate(0, 0.9, 0)
        this.helper.geometry = geometry
        this.tilt.add(this.helper)

        this.ribbonAnchor = new THREE.Object3D()
        this.tilt.add(this.ribbonAnchor)

        // const arrow = new THREE.Mesh(
        //     new THREE.ConeGeometry(0.2, 0.2, 4),
        //     new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: false })
        // )
        // arrow.rotation.x = - Math.PI * 0.5
        // arrow.position.y = 1.5
        // arrow.position.z = - 0.5
        // this.helper.add(arrow)

        // // Axis helper
        // this.axisHelper = new THREE.AxesHelper(3)
        // this.group.add(this.axisHelper)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        // Sphere
        const playerFolder = this.debug.ui.getFolder('view/player')

        playerFolder.addColor(this, 'baseColor')
        playerFolder.add(this, 'rollDuration').min(0.1).max(2).step(0.05)
        playerFolder.add(this, 'diveLean').min(0).max(1.5).step(0.05)
        playerFolder.add(this, 'flowGlow').min(0).max(1).step(0.05)
        playerFolder.add(this, 'baseHeight').min(0).max(2).step(0.05)
        playerFolder.add(this, 'bobAmplitude').min(0).max(0.3).step(0.005)
        playerFolder.add(this, 'bobFrequency').min(0).max(10).step(0.1)
        playerFolder.add(this, 'leanMax').min(0).max(Math.PI * 0.5).step(0.01)
        playerFolder.add(this, 'idleSpinSpeed').min(0).max(3).step(0.05)
        playerFolder.add(this, 'speedSpinSpeed').min(0).max(30).step(0.5)
    }

    getRibbonAnchor(target, upOffset, backOffset)
    {
        this.ribbonAnchor.position.set(0, upOffset, backOffset)
        this.ribbonAnchor.updateWorldMatrix(true, false)
        return this.ribbonAnchor.getWorldPosition(target)
    }


    update()
    {
        const playerState = this.state.player
        const sunState = this.state.sun

        this.group.position.set(
            playerState.position.current[0],
            playerState.position.current[1],
            playerState.position.current[2]
        )

        // Helper
        this.tilt.rotation.y = playerState.rotation
        this.helper.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)

        // Hover height plus idle bob and breathing
        this.tilt.position.y = this.baseHeight + this.bobAmplitude * Math.sin(this.time.elapsed * this.bobFrequency)

        // Spin around own axis: slow idle spin blending into a fast drill at speed
        const speedNorm = Math.min(playerState.horizontalSpeed / 30, 1)
        const spinSpeed = this.idleSpinSpeed * (1 - speedNorm) + this.speedSpinSpeed * speedNorm
        this.helper.rotation.y += spinSpeed * this.time.delta

        // Lean into movement (eased so it stays mostly upright until fast),
        // pitching further forward while dive bombing
        let leanTarget = - this.leanMax * Math.pow(speedNorm, 1.5)

        if(playerState.diving && !playerState.grounded)
            leanTarget -= this.diveLean

        this.lean += (leanTarget - this.lean) * (1 - Math.exp(- this.leanLerpRate * this.time.delta))
        this.tilt.rotation.x = this.lean

        // Rebuild the full euler pose every frame: premultiplying the roll
        // quaternion below writes back into the euler, so a stale z (or a
        // partially-decomposed pose) would corrupt the next frame
        this.tilt.rotation.z = 0

        // Barrel roll: one eased corkscrew 360 around the world-space travel
        // axis (composed over the euler pose — the body z axis points nearly
        // up in the drill pose, so tilt.rotation.z would read as a yaw spin)
        if(this.rollProgress < 1)
        {
            this.rollProgress = Math.min(this.rollProgress + this.time.delta / this.rollDuration, 1)
            const t = this.rollProgress
            const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(- 2 * t + 2, 3) / 2

            this.rollAxis.set(- Math.sin(playerState.rotation), 0, - Math.cos(playerState.rotation))
            this.rollQuaternion.setFromAxisAngle(this.rollAxis, - this.rollDirection * Math.PI * 2 * eased)
            this.tilt.quaternion.premultiply(this.rollQuaternion)
        }

        // Flow glow: the wisp brightens as flow builds
        this.helper.material.uniforms.uColor.value.copy(this.baseColor).multiplyScalar(1 + playerState.flow * this.flowGlow)

        // Squash and stretch (decays back to rest)
        this.stretch *= Math.exp(- this.stretchDecayRate * this.time.delta)
        const breath = this.breathAmplitude * Math.sin(this.time.elapsed * 1.1)
        this.tilt.scale.set(
            1 - this.stretch * 0.5,
            1 + this.stretch + breath,
            1 - this.stretch * 0.5
        )
    }
}
