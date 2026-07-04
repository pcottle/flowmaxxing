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

        this.bobAmplitude = 0.06
        this.bobFrequency = 1.8
        this.breathAmplitude = 0.015
        this.leanMax = 0.25
        this.leanLerpRate = 8
        this.lean = 0
        this.stretch = 0
        this.stretchDecayRate = 8

        this.setGroup()
        this.setHelper()
        this.setDebug()

        const playerState = this.state.player

        playerState.events.on('jump', () =>
        {
            this.stretch = 0.25
        })

        playerState.events.on('land', (impactSpeed) =>
        {
            this.stretch = - 0.3 * Math.min(impactSpeed / 12, 1)
        })
    }

    setGroup()
    {
        this.group = new THREE.Group()
        this.scene.add(this.group)
    }

    setHelper()
    {
        this.helper = new THREE.Mesh()
        this.helper.material = new PlayerMaterial()
        this.helper.material.uniforms.uColor.value = new THREE.Color('#fff8d6')
        this.helper.material.uniforms.uSunPosition.value = new THREE.Vector3(- 0.5, - 0.5, - 0.5)

        this.helper.geometry = new THREE.CapsuleGeometry(0.5, 0.8, 3, 16),
        this.helper.geometry.translate(0, 0.9, 0)
        this.helper.rotation.reorder('YXZ')
        this.group.add(this.helper)

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

        playerFolder.addColor(this.helper.material.uniforms.uColor, 'value')
        playerFolder.add(this, 'bobAmplitude').min(0).max(0.3).step(0.005)
        playerFolder.add(this, 'bobFrequency').min(0).max(10).step(0.1)
        playerFolder.add(this, 'leanMax').min(0).max(1).step(0.01)
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
        this.helper.rotation.y = playerState.rotation
        this.helper.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)

        // Idle bob and breathing
        this.helper.position.y = this.bobAmplitude * Math.sin(this.time.elapsed * this.bobFrequency)

        // Lean into movement
        const speedNorm = Math.min(playerState.horizontalSpeed / 30, 1)
        const leanTarget = - this.leanMax * speedNorm
        this.lean += (leanTarget - this.lean) * (1 - Math.exp(- this.leanLerpRate * this.time.delta))
        this.helper.rotation.x = this.lean

        // Squash and stretch (decays back to rest)
        this.stretch *= Math.exp(- this.stretchDecayRate * this.time.delta)
        const breath = this.breathAmplitude * Math.sin(this.time.elapsed * 1.1)
        this.helper.scale.set(
            1 - this.stretch * 0.5,
            1 + this.stretch + breath,
            1 - this.stretch * 0.5
        )
    }
}
