import EventsEmitter from 'events'

import { vec3 } from 'gl-matrix'

import Game from '@/Game.js'
import State from '@/State/State.js'
import Camera from './Camera.js'

export default class Player
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.time = this.state.time
        this.controls = this.state.controls

        this.events = new EventsEmitter()

        this.rotation = 0
        this.inputSpeed = 18
        this.inputBoostSpeed = 30
        this.speed = 0
        this.horizontalSpeed = 0

        // Momentum
        this.accelerationRate = 4
        this.dampingRate = 1.5
        this.airControlRatio = 0.35
        this.rotationLerpRate = 7

        // Jump / gravity
        this.gravityRising = 28
        this.gravityFalling = 18
        this.glideGravityRatio = 0.5
        this.jumpVelocity = 10
        this.jumpCutRatio = 0.45
        this.doubleJumpRatio = 0.85
        this.coyoteTime = 0.12
        this.grounded = true
        this.airTime = 0
        this.jumpCount = 0
        this.jumpKeyReleased = true

        this.velocity = vec3.create()

        this.position = {}
        this.position.current = vec3.fromValues(10, 0, 1)
        this.position.previous = vec3.clone(this.position.current)
        this.position.delta = vec3.create()

        this.camera = new Camera(this)

        this.controls.events.on('jumpDown', () =>
        {
            if(this.camera.mode !== Camera.MODE_FLY)
                this.jump()
        })

        this.controls.events.on('jumpUp', () =>
        {
            this.jumpKeyReleased = true

            // Variable jump height: releasing early cuts the ascent
            if(!this.grounded && this.velocity[1] > 0)
                this.velocity[1] *= this.jumpCutRatio
        })

        this.setDebug()
    }

    jump()
    {
        const canGroundJump = this.grounded || (this.jumpCount === 0 && this.airTime < this.coyoteTime)

        if(canGroundJump)
        {
            this.velocity[1] = this.jumpVelocity
            this.grounded = false
            this.jumpCount = 1
            this.jumpKeyReleased = false
            this.events.emit('jump', this.jumpCount)
        }
        else if(this.jumpCount === 1 && this.jumpKeyReleased)
        {
            this.velocity[1] = this.jumpVelocity * this.doubleJumpRatio
            this.jumpCount = 2
            this.jumpKeyReleased = false
            this.events.emit('jump', this.jumpCount)
        }
    }

    update()
    {
        const delta = this.time.delta

        /**
         * Horizontal velocity
         */
        let hasInput = false
        let inputRotation = 0

        if(this.camera.mode !== Camera.MODE_FLY && (this.controls.keys.down.forward || this.controls.keys.down.backward || this.controls.keys.down.strafeLeft || this.controls.keys.down.strafeRight))
        {
            hasInput = true
            inputRotation = this.camera.thirdPerson.theta

            if(this.controls.keys.down.forward)
            {
                if(this.controls.keys.down.strafeLeft)
                    inputRotation += Math.PI * 0.25
                else if(this.controls.keys.down.strafeRight)
                    inputRotation -= Math.PI * 0.25
            }
            else if(this.controls.keys.down.backward)
            {
                if(this.controls.keys.down.strafeLeft)
                    inputRotation += Math.PI * 0.75
                else if(this.controls.keys.down.strafeRight)
                    inputRotation -= Math.PI * 0.75
                else
                    inputRotation -= Math.PI
            }
            else if(this.controls.keys.down.strafeLeft)
            {
                inputRotation += Math.PI * 0.5
            }
            else if(this.controls.keys.down.strafeRight)
            {
                inputRotation -= Math.PI * 0.5
            }
        }

        if(hasInput)
        {
            const maxSpeed = this.controls.keys.down.boost ? this.inputBoostSpeed : this.inputSpeed
            const targetX = - Math.sin(inputRotation) * maxSpeed
            const targetZ = - Math.cos(inputRotation) * maxSpeed

            const control = this.grounded ? 1 : this.airControlRatio
            const ratio = 1 - Math.exp(- this.accelerationRate * control * delta)
            this.velocity[0] += (targetX - this.velocity[0]) * ratio
            this.velocity[2] += (targetZ - this.velocity[2]) * ratio
        }
        else
        {
            const damping = Math.exp(- this.dampingRate * delta)
            this.velocity[0] *= damping
            this.velocity[2] *= damping
        }

        this.position.current[0] += this.velocity[0] * delta
        this.position.current[2] += this.velocity[2] * delta

        /**
         * Facing (smoothed toward movement direction)
         */
        this.horizontalSpeed = Math.hypot(this.velocity[0], this.velocity[2])

        if(this.horizontalSpeed > 0.5)
        {
            const targetRotation = Math.atan2(- this.velocity[0], - this.velocity[2])
            let rotationDelta = targetRotation - this.rotation
            rotationDelta = ((rotationDelta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
            this.rotation += rotationDelta * (1 - Math.exp(- this.rotationLerpRate * delta))
        }

        /**
         * Vertical / elevation
         */
        const chunks = this.state.chunks
        const elevation = chunks.getElevationForPosition(this.position.current[0], this.position.current[2])

        if(elevation === false)
        {
            // Chunk not ready yet, hold in place
            this.velocity[1] = 0
            this.grounded = true
            this.airTime = 0
            this.jumpCount = 0
        }
        else if(this.grounded)
        {
            this.position.current[1] = elevation
            this.airTime = 0
            this.jumpCount = 0
        }
        else
        {
            this.airTime += delta

            let gravity = this.velocity[1] > 0 ? this.gravityRising : this.gravityFalling

            // Glide while holding jump on the way down
            if(this.velocity[1] < 0 && this.controls.keys.down.jump)
                gravity *= this.glideGravityRatio

            this.velocity[1] -= gravity * delta
            this.position.current[1] += this.velocity[1] * delta

            if(this.position.current[1] <= elevation)
            {
                const impactSpeed = - this.velocity[1]
                this.position.current[1] = elevation
                this.velocity[1] = 0
                this.grounded = true
                this.events.emit('land', impactSpeed)
            }
        }

        /**
         * Deltas and readouts
         */
        vec3.sub(this.position.delta, this.position.current, this.position.previous)
        vec3.copy(this.position.previous, this.position.current)

        this.speed = vec3.len(this.position.delta)

        // Update view (last, so the camera sees the final position)
        this.camera.update()
    }

    setDebug()
    {
        const debug = this.game.debug

        if(!debug.active)
            return

        const folder = debug.ui.getFolder('state/player')

        folder.add(this, 'inputSpeed').min(0).max(50).step(0.1)
        folder.add(this, 'inputBoostSpeed').min(0).max(100).step(0.1)
        folder.add(this, 'accelerationRate').min(0).max(20).step(0.1)
        folder.add(this, 'dampingRate').min(0).max(10).step(0.05)
        folder.add(this, 'airControlRatio').min(0).max(1).step(0.01)
        folder.add(this, 'rotationLerpRate').min(0).max(30).step(0.1)
        folder.add(this, 'gravityRising').min(0).max(80).step(0.5)
        folder.add(this, 'gravityFalling').min(0).max(80).step(0.5)
        folder.add(this, 'glideGravityRatio').min(0).max(1).step(0.01)
        folder.add(this, 'jumpVelocity').min(0).max(30).step(0.1)
        folder.add(this, 'jumpCutRatio').min(0).max(1).step(0.01)
        folder.add(this, 'doubleJumpRatio').min(0).max(1).step(0.01)
        folder.add(this, 'coyoteTime').min(0).max(0.5).step(0.01)
    }
}
