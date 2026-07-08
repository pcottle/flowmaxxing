import { vec3, quat2, mat4 } from 'gl-matrix'

import State from '@/State/State.js'

export default class CameraThirdPerson
{
    constructor(player)
    {
        this.state = State.getInstance()
        this.viewport = this.state.viewport
        this.controls = this.state.controls

        this.player = player

        this.active = false
        this.gameUp = vec3.fromValues(0, 1, 0)
        this.position = vec3.create()
        this.quaternion = quat2.create()
        this.distance = 15
        this.phi = Math.PI * 0.45
        this.theta = 0 // face down the beach corridor (-Z)
        this.aboveOffset = 2
        this.phiLimits = { min: 0.1, max: Math.PI - 0.1 }
        this.springRate = 6
        this.positionInitialised = false
        this.autoTurnRate = 1.2

        // Transient look-down after a bounce pad launch so the pads below
        // stay in view; decays back so it never fights pointer control.
        // Bound lazily: bouncePads is constructed after the player's camera
        this.bounceTilt = 0
        this.bounceTiltMax = 0.3
        this.bounceTiltDecayRate = 0.9
        this.padEventsBound = false
    }

    activate()
    {
        this.active = true
        this.positionInitialised = false
    }

    deactivate()
    {
        this.active = false
    }

    update()
    {
        if(!this.padEventsBound && this.state.bouncePads)
        {
            this.padEventsBound = true

            this.state.bouncePads.events.on('padBounce', ({ index }) =>
            {
                const amount = index === 0 ? 0.24 : 0.08
                this.bounceTilt = Math.min(this.bounceTilt + amount, this.bounceTiltMax)
            })
        }

        this.bounceTilt *= Math.exp(- this.bounceTiltDecayRate * this.state.time.delta)

        if(!this.active)
            return

        // Phi and theta
        if(this.controls.pointer.down || this.viewport.pointerLock.active)
        {
            const normalisedPointer = this.viewport.normalise(this.controls.pointer.delta)
            this.phi -= normalisedPointer.y * 2
            this.theta -= normalisedPointer.x * 2

            if(this.phi < this.phiLimits.min)
                this.phi = this.phiLimits.min
            if(this.phi > this.phiLimits.max)
                this.phi = this.phiLimits.max
        }
        else if(this.player.horizontalSpeed > 2)
        {
            // Drift the camera to look where the player is going
            let angleDelta = this.player.rotation - this.theta
            angleDelta = ((angleDelta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI

            // Ignore near-opposite headings (e.g. walking backward) to avoid spinning
            if(Math.abs(angleDelta) < Math.PI * 0.65)
            {
                const time = this.state.time
                const strength = Math.min(this.player.horizontalSpeed / 30, 1)
                this.theta += angleDelta * (1 - Math.exp(- this.autoTurnRate * (0.4 + strength) * time.delta))
            }
        }


        // Position (springs toward the ideal orbit position)
        const phi = Math.max(this.phiLimits.min, this.phi - this.bounceTilt)
        const sinPhiRadius = Math.sin(phi) * this.distance
        const sphericalPosition = vec3.fromValues(
            sinPhiRadius * Math.sin(this.theta),
            Math.cos(phi) * this.distance,
            sinPhiRadius * Math.cos(this.theta)
        )
        const desiredPosition = vec3.create()
        vec3.add(desiredPosition, this.player.position.current, sphericalPosition)

        if(this.positionInitialised)
        {
            const time = this.state.time
            vec3.lerp(this.position, this.position, desiredPosition, 1 - Math.exp(- this.springRate * time.delta))
        }
        else
        {
            vec3.copy(this.position, desiredPosition)
            this.positionInitialised = true
        }

        // Target
        const target = vec3.fromValues(
            this.player.position.current[0],
            this.player.position.current[1] + this.aboveOffset,
            this.player.position.current[2]
        )

        // Quaternion
        const toTargetMatrix = mat4.create()
        mat4.targetTo(toTargetMatrix, this.position, target, this.gameUp)
        quat2.fromMat4(this.quaternion, toTargetMatrix)
        
        // Clamp to ground
        const chunks = this.state.chunks
        const elevation = chunks.getElevationForPosition(this.position[0], this.position[2])

        if(elevation && this.position[1] < elevation + 1)
            this.position[1] = elevation + 1
    }
}