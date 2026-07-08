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
        this.speed = 0
        this.horizontalSpeed = 0

        // Momentum
        this.accelerationRate = 4
        this.brakingRate = 9
        this.dampingRate = 1.5
        this.airControlRatio = 0.35
        this.rotationLerpRate = 7

        // Dash
        this.dashImpulse = 18
        this.dashMaxSpeed = 42
        this.dashSustainSpeed = 14
        this.dashDuration = 0.16
        this.dashCooldown = 0.55
        this.dashTimer = 0
        this.dashCooldownTimer = 0

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

        // While flying off a bounce pad or ring reward, the air jump can use
        // that stronger launch power. Cleared on landing.
        this.padJumpVelocity = 0

        // Terrain momentum: carry the vertical velocity implied by ground-following
        // so crests launch the player instead of tracking them onto the backslope.
        // The terrain sampler is faceted (piecewise-planar triangles), so the carried
        // velocity is smoothed and the detach check needs a tolerance to avoid
        // micro-launching on every facet edge
        this.groundVy = 0
        this.groundVySmoothing = 0.06
        this.groundStickTolerance = 3
        this.launchMaxVy = 14
        this.uphillJumpCarry = 0.5
        this.landEventMinAirTime = 0.12
        this.skiFactor = 0.8
        this.skiMaxSpeed = 50
        this.overspeedDecayRate = 0.8
        this.landingCarryRatio = 0.35

        // Prop collisions (trees, rocks): simple horizontal circle push-out
        this.bodyRadius = 0.6
        this.bumpMinSpeed = 4
        this.bumpCooldownTimer = 0

        // Tricks
        this.rollLift = 2
        this.diveGravityRatio = 2.2
        this.bounceRatio = 0.5
        this.bounceMinImpact = 4
        this.carveSteerBoost = 2.5
        this.carveOverspeedKeep = 0.3
        this.diving = false
        this.carving = false

        // Flow: builds from tricks, decays when slow, raises max speed and
        // feeds the audio/visual layers
        this.flow = 0
        this.flowSpeedBonus = 0.25
        this.flowDecayRate = 0.02
        this.flowDecaySlowRate = 0.15
        this.flowGlideGain = 0.04

        // Soft barriers (steep mountain wall, deep water)
        // Min sits above the mound-side grades (~0.4) so beach parkour stays full speed
        this.slopeGradeMin = 0.35
        this.slopeGradeMax = 0.75
        this.slopeSpeedFloor = 0.08
        this.slopeBlockGrade = 0.95
        this.slopeWallSpeedRatio = 0.18
        this.slopeSlideRate = 0.55
        this.slopeProbeDistance = 1.5
        this.wadingDepth = 2
        this.wadingSpeedRatio = 0.35

        // Swimming: once the seabed is deeper than swimDepth the player floats
        // up to the surface (buoyancy) and moves at a crawl — the ocean is a
        // soft barrier, not a walkable floor
        this.swimDepth = 1.3
        this.floatDraft = 0.55
        this.swimSpeedRatio = 0.25
        this.buoyancyRate = 5
        this.swimming = false

        this.velocity = vec3.create()

        // Spawn mid-beach on first update (terrains is constructed after player)
        this.spawned = false

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

        this.controls.events.on('boostDown', () =>
        {
            if(this.camera.mode !== Camera.MODE_FLY)
                this.dash()
        })

        this.setDebug()
    }

    getInputRotation()
    {
        if(this.camera.mode === Camera.MODE_FLY)
            return false

        if(!this.controls.keys.down.forward && !this.controls.keys.down.backward && !this.controls.keys.down.strafeLeft && !this.controls.keys.down.strafeRight)
            return false

        let inputRotation = this.camera.thirdPerson.theta

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

        return inputRotation
    }

    dash()
    {
        if(this.dashCooldownTimer > 0)
            return

        const inputRotation = this.getInputRotation()
        const dashRotation = inputRotation === false ? this.rotation : inputRotation
        const directionX = - Math.sin(dashRotation)
        const directionZ = - Math.cos(dashRotation)

        this.velocity[0] += directionX * this.dashImpulse
        this.velocity[2] += directionZ * this.dashImpulse

        const horizontalSpeed = Math.hypot(this.velocity[0], this.velocity[2])

        if(horizontalSpeed > this.dashMaxSpeed)
        {
            const ratio = this.dashMaxSpeed / horizontalSpeed
            this.velocity[0] *= ratio
            this.velocity[2] *= ratio
        }

        this.dashTimer = this.dashDuration
        this.dashCooldownTimer = this.dashCooldown

        // Barrel roll: aerial dash with a single strafe key becomes a roll dodge
        const strafeLeft = this.controls.keys.down.strafeLeft
        const strafeRight = this.controls.keys.down.strafeRight

        if(!this.grounded && (strafeLeft !== strafeRight))
        {
            this.velocity[1] = Math.max(this.velocity[1], this.rollLift)
            this.addFlow(0.2)
            this.events.emit('roll', strafeRight ? 1 : - 1)
        }
        else
        {
            this.addFlow(0.05)
            this.events.emit('dash')
        }
    }

    addFlow(amount)
    {
        this.flow = Math.min(Math.max(this.flow + amount, 0), 1)
    }

    jump()
    {
        const canGroundJump = this.grounded || (this.jumpCount === 0 && this.airTime < this.coyoteTime)

        if(canGroundJump)
        {
            // Running up a slope adds carried momentum to the jump
            this.velocity[1] = this.jumpVelocity + Math.max(0, this.groundVy) * this.uphillJumpCarry
            this.grounded = false
            this.jumpCount = 1
            this.jumpKeyReleased = false
            this.events.emit('jump', this.jumpCount)
        }
        else if(this.jumpCount <= 1 && this.jumpKeyReleased)
        {
            // jumpCount 0 here means airborne from a crest launch, not a jump:
            // still grant the one air jump
            this.velocity[1] = Math.max(this.jumpVelocity * this.doubleJumpRatio, this.padJumpVelocity)
            this.padJumpVelocity = 0
            this.jumpCount = 2
            this.jumpKeyReleased = false
            this.events.emit('jump', this.jumpCount)
        }
    }

    refillJumpFromRing(direction, jumpVelocity = 0)
    {
        if(!this.grounded)
        {
            this.jumpCount = Math.min(this.jumpCount, 1)
            this.padJumpVelocity = Math.max(this.padJumpVelocity, jumpVelocity)

            if(this.velocity[1] < 1.5)
                this.velocity[1] = 1.5
        }

        if(direction)
        {
            const horizontalSpeed = Math.hypot(this.velocity[0], this.velocity[2])
            const minCarrySpeed = this.inputSpeed * 0.85

            if(horizontalSpeed < minCarrySpeed)
            {
                this.velocity[0] = direction[0] * minCarrySpeed
                this.velocity[2] = direction[2] * minCarrySpeed
            }
        }

        this.addFlow(0.08)
        this.events.emit('ringRefill')
    }

    launchFromPad(verticalVelocity)
    {
        this.grounded = false
        this.swimming = false
        this.diving = false
        this.airTime = 0
        this.jumpCount = Math.min(this.jumpCount, 1)
        this.velocity[1] = verticalVelocity
        this.padJumpVelocity = verticalVelocity
    }

    getTerrainGradient(sample)
    {
        if(sample === false || !sample.normal)
            return false

        const normal = sample.normal
        const normalY = Math.max(0.001, Math.abs(normal[1]))

        return {
            x: - normal[0] / normalY,
            z: - normal[2] / normalY
        }
    }

    getTerrainGradeInDirection(sample, directionX, directionZ)
    {
        const gradient = this.getTerrainGradient(sample)

        if(gradient === false)
            return 0

        return gradient.x * directionX + gradient.z * directionZ
    }

    applySteepSlopeLimit(delta, sample)
    {
        if(!this.grounded || this.swimming)
            return

        const gradient = this.getTerrainGradient(sample)

        if(gradient === false)
            return

        const slopeGrade = Math.hypot(gradient.x, gradient.z)

        if(slopeGrade <= this.slopeBlockGrade)
            return

        const uphillX = gradient.x / slopeGrade
        const uphillZ = gradient.z / slopeGrade
        const uphillSpeed = this.velocity[0] * uphillX + this.velocity[2] * uphillZ

        if(uphillSpeed > 0)
        {
            const bleed = uphillSpeed * (1 - this.slopeWallSpeedRatio)
            this.velocity[0] -= uphillX * bleed
            this.velocity[2] -= uphillZ * bleed
        }

        const slide = Math.min((slopeGrade - this.slopeBlockGrade) / this.slopeBlockGrade, 1)
            * this.gravityFalling
            * this.slopeSlideRate
            * delta

        this.velocity[0] -= uphillX * slide
        this.velocity[2] -= uphillZ * slide
    }

    update()
    {
        const delta = this.time.delta
        const chunks = this.state.chunks

        if(!this.spawned)
        {
            // Mid-beach, facing down the corridor (-Z).
            // z = 1, not 0: a position exactly on a chunk boundary belongs to no chunk
            // (Chunk.isInside is strict) and would report no ground elevation
            this.position.current[0] = this.state.terrains.getShoreX(1) - this.state.terrains.corridor.beachWidth * 0.7
            this.position.current[2] = 1
            vec3.copy(this.position.previous, this.position.current)
            this.rotation = 0
            this.spawned = true
        }

        this.dashTimer = Math.max(0, this.dashTimer - delta)
        this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - delta)

        // Flow drains slowly while moving fast, quickly once the pace drops
        const flowDecay = this.horizontalSpeed < 10 ? this.flowDecaySlowRate : this.flowDecayRate
        this.flow = Math.max(0, this.flow - flowDecay * delta)

        const surfaceSample = chunks.getSampleForPosition(this.position.current[0], this.position.current[2])

        /**
         * Soft barriers: deep water and steep uphill grades scale the max speed down
         */
        let moveScale = 1

        if(this.swimming)
        {
            moveScale *= this.swimSpeedRatio
        }
        else if(this.position.current[1] < 0)
        {
            const wading = Math.min(1, - this.position.current[1] / this.wadingDepth)
            moveScale *= 1 - wading * (1 - this.wadingSpeedRatio)
        }

        if(this.grounded && !this.swimming && this.horizontalSpeed > 0.5)
        {
            const probeDistance = this.slopeProbeDistance
            const directionX = this.velocity[0] / this.horizontalSpeed
            const directionZ = this.velocity[2] / this.horizontalSpeed
            let grade = this.getTerrainGradeInDirection(surfaceSample, directionX, directionZ)
            const elevationAhead = probeDistance > 0
                ? chunks.getElevationForPosition(this.position.current[0] + directionX * probeDistance, this.position.current[2] + directionZ * probeDistance)
                : false

            if(surfaceSample !== false && Number.isFinite(elevationAhead))
            {
                const probeGrade = (elevationAhead - surfaceSample.elevation) / probeDistance
                grade = Math.max(grade, probeGrade)
            }

            const slopeRange = Math.max(0.001, this.slopeGradeMax - this.slopeGradeMin)
            const steepness = Math.max(0, Math.min(1, (grade - this.slopeGradeMin) / slopeRange))
            moveScale *= 1 - steepness * (1 - this.slopeSpeedFloor)
        }

        /**
         * Horizontal velocity
         */
        const inputRotation = this.getInputRotation()
        const hasInput = inputRotation !== false

        const currentSpeed = Math.hypot(this.velocity[0], this.velocity[2])

        this.carving = this.grounded && this.controls.keys.down.crouch && hasInput

        if(hasInput)
        {
            const inputX = - Math.sin(inputRotation)
            const inputZ = - Math.cos(inputRotation)
            const maxSpeed = (this.dashTimer > 0 ? this.inputSpeed + this.dashSustainSpeed : this.inputSpeed) * moveScale * (1 + this.flow * this.flowSpeedBonus)
            const control = this.grounded || this.dashTimer > 0 ? 1 : this.airControlRatio
            const steerRate = this.carving ? this.accelerationRate * this.carveSteerBoost : this.accelerationRate
            const ratio = 1 - Math.exp(- steerRate * control * delta)
            const targetX = inputX * maxSpeed
            const targetZ = inputZ * maxSpeed
            const movingAgainstInput = this.grounded && currentSpeed > 0.5 && this.velocity[0] * inputX + this.velocity[2] * inputZ < 0

            if(movingAgainstInput)
            {
                const brakingRatio = 1 - Math.exp(- this.brakingRate * delta)
                this.velocity[0] += (targetX - this.velocity[0]) * brakingRatio
                this.velocity[2] += (targetZ - this.velocity[2]) * brakingRatio
            }
            else if(currentSpeed > maxSpeed)
            {
                // Above input speed (dash, skiing): steer the direction but keep the
                // momentum, decaying the excess gently instead of at accelerationRate.
                // Carving (crouch held) steers tighter and bleeds even less speed
                let directionX = this.velocity[0] / currentSpeed
                let directionZ = this.velocity[2] / currentSpeed
                directionX += (inputX - directionX) * ratio
                directionZ += (inputZ - directionZ) * ratio

                const directionLength = Math.hypot(directionX, directionZ)
                const decayRate = this.carving ? this.overspeedDecayRate * this.carveOverspeedKeep : this.overspeedDecayRate
                const newSpeed = maxSpeed + (currentSpeed - maxSpeed) * Math.exp(- decayRate * delta)

                if(directionLength > 0.001)
                {
                    this.velocity[0] = directionX / directionLength * newSpeed
                    this.velocity[2] = directionZ / directionLength * newSpeed
                }
            }
            else
            {
                this.velocity[0] += (targetX - this.velocity[0]) * ratio
                this.velocity[2] += (targetZ - this.velocity[2]) * ratio
            }
        }
        else
        {
            const dampingRate = this.dashTimer > 0 ? this.dampingRate * 0.25 : this.dampingRate
            const damping = Math.exp(- dampingRate * delta)
            this.velocity[0] *= damping
            this.velocity[2] *= damping
        }

        this.applySteepSlopeLimit(delta, surfaceSample)

        // Skiing: on downhill grades gravity accelerates the player along the slope.
        // Grade comes from the smoothed ground-follow velocity, so no extra terrain samples
        if(this.grounded)
        {
            const speed = Math.hypot(this.velocity[0], this.velocity[2])
            const grade = this.groundVy / Math.max(speed, 0.5)

            if(speed > 0.5 && grade < 0)
            {
                const skiAcceleration = this.gravityFalling * Math.min(- grade, 1.2) * this.skiFactor
                const skiSpeed = Math.min(speed + skiAcceleration * delta, this.skiMaxSpeed)
                this.velocity[0] *= skiSpeed / speed
                this.velocity[2] *= skiSpeed / speed
            }
        }

        const beforeMoveX = this.position.current[0]
        const beforeMoveZ = this.position.current[2]

        this.position.current[0] += this.velocity[0] * delta
        this.position.current[2] += this.velocity[2] * delta

        if(this.grounded && !this.swimming && surfaceSample !== false)
        {
            const movedSurfaceSample = chunks.getSampleForPosition(this.position.current[0], this.position.current[2])
            const gradient = this.getTerrainGradient(movedSurfaceSample)

            if(gradient !== false)
            {
                const slopeGrade = Math.hypot(gradient.x, gradient.z)

                if(slopeGrade > this.slopeBlockGrade && movedSurfaceSample.elevation > surfaceSample.elevation)
                {
                    const uphillX = gradient.x / slopeGrade
                    const uphillZ = gradient.z / slopeGrade
                    const uphillDistance = (this.position.current[0] - beforeMoveX) * uphillX
                        + (this.position.current[2] - beforeMoveZ) * uphillZ

                    if(uphillDistance > 0)
                    {
                        const correction = uphillDistance * (1 - this.slopeWallSpeedRatio)
                        this.position.current[0] -= uphillX * correction
                        this.position.current[2] -= uphillZ * correction

                        const uphillSpeed = this.velocity[0] * uphillX + this.velocity[2] * uphillZ

                        if(uphillSpeed > 0)
                        {
                            const bleed = uphillSpeed * (1 - this.slopeWallSpeedRatio)
                            this.velocity[0] -= uphillX * bleed
                            this.velocity[2] -= uphillZ * bleed
                        }
                    }
                }
            }
        }

        /**
         * Prop collisions: push out of tree trunks and rocks, slide along
         * them, and thud when hitting fast. Anything above a prop's height
         * (glides, big launches) passes over
         */
        this.bumpCooldownTimer = Math.max(0, this.bumpCooldownTimer - delta)

        this.state.propsColliders.forEach((collider) =>
        {
            if(this.position.current[1] > collider.y + collider.height)
                return

            const deltaX = this.position.current[0] - collider.x
            const deltaZ = this.position.current[2] - collider.z
            const minDistance = collider.radius + this.bodyRadius
            const distanceSq = deltaX * deltaX + deltaZ * deltaZ

            if(distanceSq >= minDistance * minDistance)
                return

            const distance = Math.sqrt(Math.max(distanceSq, 0.0001))
            const normalX = deltaX / distance
            const normalZ = deltaZ / distance

            this.position.current[0] = collider.x + normalX * minDistance
            this.position.current[2] = collider.z + normalZ * minDistance

            // Remove the velocity component into the prop so the player slides
            const into = this.velocity[0] * normalX + this.velocity[2] * normalZ

            if(into < 0)
            {
                this.velocity[0] -= normalX * into
                this.velocity[2] -= normalZ * into

                if(- into > this.bumpMinSpeed && this.bumpCooldownTimer === 0)
                {
                    this.bumpCooldownTimer = 0.25
                    this.events.emit('bump', - into)
                }
            }
        })

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
        const postMoveSample = chunks.getSampleForPosition(this.position.current[0], this.position.current[2])
        const elevation = postMoveSample === false ? false : postMoveSample.elevation

        if(elevation === false || !Number.isFinite(elevation))
        {
            // Chunk not ready yet, hold in place
            this.velocity[1] = 0
            this.groundVy = 0
            this.grounded = true
            this.airTime = 0
            this.jumpCount = 0
        }
        else if(this.grounded && elevation < - this.swimDepth)
        {
            // Buoyancy: the seabed is too deep to walk — float up to the surface
            this.swimming = true
            this.groundVy = 0
            this.airTime = 0
            this.jumpCount = 0
            this.position.current[1] += (- this.floatDraft - this.position.current[1]) * (1 - Math.exp(- this.buoyancyRate * delta))
        }
        else if(this.grounded)
        {
            this.swimming = false

            // Vertical velocity implied by following the terrain, clamped against
            // LOD-seam spikes and smoothed against facet quantization
            const groundVyRaw = Math.max(- 30, Math.min((elevation - this.position.current[1]) / delta, this.launchMaxVy))
            this.groundVy += (groundVyRaw - this.groundVy) * (1 - Math.exp(- delta / this.groundVySmoothing))

            if(groundVyRaw < this.groundVy - this.groundStickTolerance)
            {
                // Terrain drops away faster than carried momentum: detach and fly.
                // jumpCount stays 0 so coyote time still allows a full jump at the crest
                this.grounded = false
                this.velocity[1] = this.groundVy
                this.addFlow(0.1 + Math.max(0, this.velocity[1]) * 0.01)
                this.events.emit('launch', this.velocity[1])
            }
            else
            {
                this.position.current[1] = elevation
                this.airTime = 0
                this.jumpCount = 0
            }
        }
        else
        {
            this.airTime += delta

            let gravity = this.velocity[1] > 0 ? this.gravityRising : this.gravityFalling

            // Dive bomb (crouch) wins over glide (jump held) on the way down
            this.diving = this.controls.keys.down.crouch

            if(this.velocity[1] < 0 && this.diving)
                gravity *= this.diveGravityRatio
            else if(this.velocity[1] < 0 && this.controls.keys.down.jump)
            {
                gravity *= this.glideGravityRatio
                this.addFlow(this.flowGlideGain * delta)
            }

            this.velocity[1] -= gravity * delta
            this.position.current[1] += this.velocity[1] * delta

            const landY = elevation < - this.swimDepth ? - this.floatDraft : elevation

            if(this.position.current[1] <= landY && elevation < - this.swimDepth)
            {
                // Splashdown: water absorbs the impact — no bounce or landing carry
                const impactSpeed = - this.velocity[1]
                this.position.current[1] = landY
                this.groundVy = 0
                this.velocity[1] = 0
                this.grounded = true
                this.swimming = true
                this.diving = false
                this.padJumpVelocity = 0

                if(this.airTime > this.landEventMinAirTime)
                    this.events.emit('splash', impactSpeed)
            }
            else if(this.position.current[1] <= elevation)
            {
                const impactSpeed = - this.velocity[1]
                this.position.current[1] = elevation
                this.groundVy = 0
                this.swimming = false

                // Butter landing: on a downhill slope part of the impact carries
                // into forward speed instead of being discarded
                const landingSpeed = Math.hypot(this.velocity[0], this.velocity[2])

                if(impactSpeed > 0 && landingSpeed > 0.5)
                {
                    const probeDistance = 1.5
                    const elevationAhead = chunks.getElevationForPosition(
                        this.position.current[0] + this.velocity[0] / landingSpeed * probeDistance,
                        this.position.current[2] + this.velocity[2] / landingSpeed * probeDistance
                    )

                    if(Number.isFinite(elevationAhead))
                    {
                        const grade = (elevationAhead - elevation) / probeDistance

                        if(grade < 0)
                        {
                            const bonus = impactSpeed * this.landingCarryRatio * Math.min(- grade, 1)
                            const boostedSpeed = Math.min(landingSpeed + bonus, this.skiMaxSpeed)
                            this.velocity[0] *= boostedSpeed / landingSpeed
                            this.velocity[2] *= boostedSpeed / landingSpeed
                            this.addFlow(bonus * 0.02)
                        }
                    }
                }

                if(this.controls.keys.down.jump && impactSpeed > this.bounceMinImpact)
                {
                    // Bounce hop: holding jump converts the impact into a rebound,
                    // skimming across the terrain without a hard landing
                    this.velocity[1] = impactSpeed * this.bounceRatio
                    this.airTime = 0
                    this.jumpCount = 0
                    this.addFlow(0.15)
                    this.events.emit('bounce', impactSpeed)
                }
                else
                {
                    this.velocity[1] = 0
                    this.grounded = true
                    this.diving = false
                    this.padJumpVelocity = 0

                    // Micro-skims stay silent (no chime, particles or squash)
                    if(this.airTime > this.landEventMinAirTime)
                        this.events.emit('land', impactSpeed)
                }
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
        folder.add(this, 'accelerationRate').min(0).max(20).step(0.1)
        folder.add(this, 'brakingRate').min(0).max(30).step(0.1)
        folder.add(this, 'dampingRate').min(0).max(10).step(0.05)
        folder.add(this, 'airControlRatio').min(0).max(1).step(0.01)
        folder.add(this, 'rotationLerpRate').min(0).max(30).step(0.1)
        folder.add(this, 'dashImpulse').min(0).max(60).step(0.1)
        folder.add(this, 'dashMaxSpeed').min(0).max(100).step(0.1)
        folder.add(this, 'dashSustainSpeed').min(0).max(60).step(0.1)
        folder.add(this, 'dashDuration').min(0).max(1).step(0.01)
        folder.add(this, 'dashCooldown').min(0).max(3).step(0.01)
        folder.add(this, 'gravityRising').min(0).max(80).step(0.5)
        folder.add(this, 'gravityFalling').min(0).max(80).step(0.5)
        folder.add(this, 'glideGravityRatio').min(0).max(1).step(0.01)
        folder.add(this, 'jumpVelocity').min(0).max(30).step(0.1)
        folder.add(this, 'jumpCutRatio').min(0).max(1).step(0.01)
        folder.add(this, 'doubleJumpRatio').min(0).max(1).step(0.01)
        folder.add(this, 'coyoteTime').min(0).max(0.5).step(0.01)
        folder.add(this, 'groundVySmoothing').min(0.01).max(0.3).step(0.01)
        folder.add(this, 'groundStickTolerance').min(0).max(15).step(0.1)
        folder.add(this, 'launchMaxVy').min(0).max(30).step(0.5)
        folder.add(this, 'uphillJumpCarry').min(0).max(2).step(0.05)
        folder.add(this, 'landEventMinAirTime').min(0).max(0.5).step(0.01)
        folder.add(this, 'skiFactor').min(0).max(3).step(0.05)
        folder.add(this, 'skiMaxSpeed').min(10).max(100).step(1)
        folder.add(this, 'overspeedDecayRate').min(0).max(5).step(0.05)
        folder.add(this, 'landingCarryRatio').min(0).max(1).step(0.01)
        folder.add(this, 'bodyRadius').min(0.1).max(2).step(0.05)
        folder.add(this, 'bumpMinSpeed').min(0).max(20).step(0.5)
        folder.add(this, 'rollLift').min(0).max(10).step(0.1)
        folder.add(this, 'diveGravityRatio').min(1).max(5).step(0.05)
        folder.add(this, 'bounceRatio').min(0).max(1).step(0.01)
        folder.add(this, 'bounceMinImpact').min(0).max(20).step(0.5)
        folder.add(this, 'carveSteerBoost').min(1).max(6).step(0.1)
        folder.add(this, 'carveOverspeedKeep').min(0).max(1).step(0.01)
        folder.add(this, 'flowSpeedBonus').min(0).max(1).step(0.01)
        folder.add(this, 'flowDecayRate').min(0).max(0.5).step(0.005)
        folder.add(this, 'flowDecaySlowRate').min(0).max(1).step(0.01)
        folder.add(this, 'slopeGradeMin').min(0).max(2).step(0.01)
        folder.add(this, 'slopeGradeMax').min(0).max(3).step(0.01)
        folder.add(this, 'slopeSpeedFloor').min(0).max(1).step(0.01)
        folder.add(this, 'slopeBlockGrade').min(0).max(3).step(0.01)
        folder.add(this, 'slopeWallSpeedRatio').min(0).max(1).step(0.01)
        folder.add(this, 'slopeSlideRate').min(0).max(3).step(0.01)
        folder.add(this, 'slopeProbeDistance').min(0).max(5).step(0.1)
        folder.add(this, 'wadingDepth').min(0.1).max(10).step(0.1)
        folder.add(this, 'wadingSpeedRatio').min(0).max(1).step(0.01)
        folder.add(this, 'swimDepth').min(0.3).max(5).step(0.05)
        folder.add(this, 'floatDraft').min(0).max(2).step(0.05)
        folder.add(this, 'swimSpeedRatio').min(0).max(1).step(0.01)
        folder.add(this, 'buoyancyRate').min(0.5).max(20).step(0.5)
    }
}
