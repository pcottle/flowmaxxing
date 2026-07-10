import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import RainbowMaterial from './Materials/RainbowMaterial.js'

export default class Rainbow
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.scene = this.view.scene

        this.baseDistance = 140
        this.distance = 900
        this.baseHeight = 45
        this.maxVisibility = 0.7
        this.fadeInDuration = 2
        this.holdDuration = 18
        this.fadeOutDuration = 4
        this.startTime = - Infinity
        this.direction = new THREE.Vector3(0, 0, - 1)

        this.setMesh()
        this.setDebug()

        // A rainbow rewards a rain that ends while the sun is up
        this.state.weather.events.on('rainStop', () =>
        {
            if(this.state.sun.position.y > 0.05)
                this.show()
        })
    }

    setMesh()
    {
        this.material = new RainbowMaterial()
        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(240, 120),
            this.material
        )
        this.mesh.visible = false
        this.scene.add(this.mesh)
    }

    show()
    {
        this.startTime = this.state.time.elapsed

        // Spawn where the player is looking (captured once, then
        // world-anchored) so the reward is actually seen
        this.view.camera.instance.getWorldDirection(this.direction)
        this.direction.y = 0

        if(this.direction.lengthSq() < 0.0001)
            this.direction.set(0, 0, - 1)

        this.direction.normalize()
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        this.debug.ui.addQuickAction('🌈 rainbow', () => { this.show() })

        const folder = this.debug.ui.getFolder('view/rainbow')
        folder.add(this, 'distance').min(50).max(1200).step(5)
        folder.add(this, 'maxVisibility').min(0).max(1).step(0.05)
        folder.add(this, 'holdDuration').min(2).max(60).step(1)
    }

    update()
    {
        const time = this.state.time
        const age = time.elapsed - this.startTime
        const totalDuration = this.fadeInDuration + this.holdDuration + this.fadeOutDuration

        if(age < 0 || age > totalDuration)
        {
            this.mesh.visible = false
            return
        }

        const fadeIn = Math.min(age / this.fadeInDuration, 1)
        const fadeOut = Math.min((totalDuration - age) / this.fadeOutDuration, 1)
        this.material.uniforms.uVisibility.value = this.maxVisibility * Math.min(fadeIn, fadeOut)
        this.mesh.visible = true

        // Stand in the direction captured at spawn, facing the player;
        // plane bottom near the ground, arc apex well up in the sky
        const playerState = this.state.player
        const distanceScale = this.distance / this.baseDistance
        const height = this.baseHeight * distanceScale

        this.mesh.scale.set(distanceScale, distanceScale, 1)

        this.mesh.position.set(
            playerState.position.current[0] + this.direction.x * this.distance,
            playerState.position.current[1] + height,
            playerState.position.current[2] + this.direction.z * this.distance
        )
        this.mesh.lookAt(
            playerState.position.current[0],
            playerState.position.current[1] + height,
            playerState.position.current[2]
        )
    }
}
