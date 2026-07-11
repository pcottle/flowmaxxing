import EventsEmitter from 'events'
import { vec3 } from 'gl-matrix'

import Game from '@/Game.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class ProgressiveBounceCourses
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.events = new EventsEmitter()

        this.enabled = true
        this.minSpeed = 10
        this.minForwardRatio = 0.58
        this.minStableDot = 0.94
        this.triggerTime = 2.4
        this.cooldown = 12
        this.cooldownTimer = 0.5
        this.blockedCourseCooldown = 7

        this.padCountMin = 8
        this.padCountMax = 14
        this.startDistance = 42
        this.fastStartDistanceBonus = 10
        this.minForwardGap = 5.4
        this.maxForwardGap = 23
        this.closeForwardGap = 5.8
        this.longForwardGapBonus = 6
        this.forwardGap = 12
        this.fastForwardGapBonus = 6.5
        this.forwardGapJitter = 5
        this.lateralGap = 9
        this.fastLateralGapBonus = 3
        this.maxLateral = 22
        this.firstPadHeight = 1.1
        this.heightBase = 4.2
        this.verticalStep = 2.35
        this.minHeightOffset = 1.1
        this.maxHeightOffset = 11
        this.highHopClimbMin = 2.2
        this.highHopClimbMax = 4
        this.dropHopMin = 1.4
        this.dropHopMax = 3.2
        this.padTerrainClearance = 1.7
        this.sidePadTerrainClearance = 2.8
        this.visibleAhead = 3
        this.padRadius = 2.25
        this.narrowPadRadius = 1.65
        this.angledPadChance = 0.72
        this.tiltAngle = Math.PI / 6
        this.launchVelocity = 18.2
        this.perfectBonusRatio = 1.1
        this.forwardLaunchSpeed = 8.8
        this.fastForwardLaunchBonus = 1.4
        this.horizontalLaunchSpeed = 18.5
        this.fastHorizontalLaunchBonus = 4
        this.launchPerHeight = 0.5
        this.launchVelocityMax = 22
        this.speedSpreadMax = 34
        this.padCooldown = 0.32
        this.missDistance = 12
        this.restartRadius = 12
        this.restartBacktrackDistance = 8
        this.fallGrace = 0.35
        this.expireDelay = 1.4
        this.failedAbandonDistance = 70
        this.towerAvoidRadius = 16
        this.prizeHeight = 4
        this.prizeRadius = 2.5
        this.bounceFlow = 0.08
        this.perfectFlow = 0.12
        this.prizeFlow = 0.55
        this.streakPadBonus = 1

        this.straightTimer = 0
        this.straightDirection = vec3.fromValues(0, 0, - 1)
        this.course = null
        this.nextCourseId = 1
        this.streak = 0
        this.previousPlayerY = null
        this.lastCollisionDebugTime = - 999
        this.collisionDebugInterval = 0.25

        this.setDebug()
    }

    updateStraightTravel(player)
    {
        const speed = player.horizontalSpeed

        if(speed < this.minSpeed)
        {
            this.straightTimer = Math.max(0, this.straightTimer - this.time.delta * 1.5)
            return
        }

        const directionX = player.velocity[0] / speed
        const directionZ = player.velocity[2] / speed

        if(- directionZ < this.minForwardRatio)
        {
            this.straightTimer = Math.max(0, this.straightTimer - this.time.delta * 2)
            this.straightDirection[0] = directionX
            this.straightDirection[2] = directionZ
            return
        }

        const dot = directionX * this.straightDirection[0] + directionZ * this.straightDirection[2]

        if(dot > this.minStableDot)
        {
            this.straightTimer += this.time.delta
        }
        else
        {
            this.straightTimer = Math.max(0, this.straightTimer - this.time.delta)
            this.straightDirection[0] = directionX
            this.straightDirection[2] = directionZ
        }
    }

    getSafeCourseX(x, z)
    {
        const terrains = this.state.terrains
        const shoreX = terrains.getShoreX(z)
        const beachWidth = terrains.corridor.beachWidth
        const minX = shoreX - beachWidth * 1.25
        const maxX = shoreX + 7

        return Math.max(minX, Math.min(maxX, x))
    }

    overlapsBounceTower(x, z, radius = this.padRadius)
    {
        const bouncePads = this.state.bouncePads

        if(!bouncePads)
            return false

        for(const tower of bouncePads.towers.values())
        {
            if(!tower.built)
                continue

            for(const pad of tower.pads)
            {
                const clearance = this.towerAvoidRadius + radius + pad.radius

                if(Math.hypot(x - pad.position[0], z - pad.position[2]) < clearance)
                    return true
            }
        }

        return false
    }

    clamp(value, min, max)
    {
        return Math.max(min, Math.min(max, value))
    }

    chooseSegmentType(index, previousSegmentType)
    {
        if(index === 1)
            return 'side'

        const needsRecovery = previousSegmentType === 'side'
            || previousSegmentType === 'long'
            || previousSegmentType === 'high'

        if(needsRecovery && Math.random() < 0.38)
            return 'close'

        const roll = Math.random()

        if(roll < 0.2)
            return 'side'

        if(roll < 0.37)
            return 'close'

        if(roll < 0.53)
            return 'high'

        if(roll < 0.66)
            return 'drop'

        if(roll < 0.8)
            return 'long'

        return 'normal'
    }

    getSideDirection(lateral, courseLateralGap, courseMaxLateral, previousSide)
    {
        let direction = Math.random() < 0.62 ? - previousSide : previousSide

        if(Math.abs(lateral + direction * courseLateralGap) > courseMaxLateral)
            direction *= - 1

        return direction
    }

    getSegmentPlan(segmentType, progress, speedSpread, courseForwardGap, courseLateralGap, courseMaxLateral, lateral, previousSide)
    {
        let forwardGap = courseForwardGap + (Math.random() - 0.5) * this.forwardGapJitter
        let heightDelta = (Math.random() - 0.42) * this.verticalStep + Math.sin(progress * Math.PI * 3) * 0.8
        let sideStep = 0
        let nextPreviousSide = previousSide
        let widePad = false
        let terrainClearance = this.padTerrainClearance

        if(segmentType === 'close')
        {
            forwardGap = this.closeForwardGap + Math.random() * 1.8 + speedSpread * 1.2
            heightDelta = (Math.random() - 0.5) * 0.9
            widePad = true
        }
        else if(segmentType === 'long')
        {
            forwardGap = courseForwardGap + this.longForwardGapBonus + Math.random() * 4
            heightDelta += - 0.6 + Math.random() * 1.2
        }
        else if(segmentType === 'high')
        {
            forwardGap = courseForwardGap * 0.75 + Math.random() * 2.5
            heightDelta = this.highHopClimbMin + Math.random() * (this.highHopClimbMax - this.highHopClimbMin)
            widePad = true
            terrainClearance = this.sidePadTerrainClearance
        }
        else if(segmentType === 'drop')
        {
            forwardGap = courseForwardGap + Math.random() * 5
            heightDelta = - (this.dropHopMin + Math.random() * (this.dropHopMax - this.dropHopMin))
        }
        else if(segmentType === 'side')
        {
            forwardGap = courseForwardGap * (0.82 + Math.random() * 0.22)
            heightDelta += (Math.random() - 0.5) * 1.4
        }

        const shouldSideHop = segmentType === 'side'
            || (segmentType === 'high' && Math.random() < this.angledPadChance * 0.45)
            || (segmentType === 'drop' && Math.random() < this.angledPadChance * 0.35)
            || (segmentType === 'long' && Math.random() < this.angledPadChance * 0.3)
            || (segmentType === 'normal' && Math.random() < this.angledPadChance * 0.45)

        if(shouldSideHop)
        {
            const direction = this.getSideDirection(lateral, courseLateralGap, courseMaxLateral, previousSide)
            const sideScale = segmentType === 'side'
                ? 0.86 + progress * 0.45
                : segmentType === 'close'
                    ? 0.45
                    : 0.5 + progress * 0.25

            sideStep = direction * courseLateralGap * sideScale
            nextPreviousSide = direction
            terrainClearance = Math.max(terrainClearance, this.sidePadTerrainClearance)
        }

        return {
            segmentType,
            forwardGap: this.clamp(forwardGap, this.minForwardGap, this.maxForwardGap + speedSpread * 4),
            heightDelta,
            sideStep,
            previousSide: nextPreviousSide,
            widePad,
            terrainClearance
        }
    }

    createCourse(player)
    {
        if(this.state.obstacleCourses?.course || this.state.tideline?.course)
            return false

        const chunks = this.state.chunks
        const directionX = this.straightDirection[0]
        const directionZ = this.straightDirection[2]
        const sideX = - directionZ
        const sideZ = directionX
        const originX = player.position.current[0]
        const originZ = player.position.current[2]
        const speedSpread = Math.min(Math.max((player.horizontalSpeed - this.minSpeed) / (this.speedSpreadMax - this.minSpeed), 0), 1)
        const courseStartDistance = this.startDistance + speedSpread * this.fastStartDistanceBonus
        const courseForwardGap = this.forwardGap + speedSpread * this.fastForwardGapBonus
        const courseLateralGap = this.lateralGap + speedSpread * this.fastLateralGapBonus
        const courseMaxLateral = this.maxLateral + speedSpread * 4
        const courseForwardLaunchSpeed = this.forwardLaunchSpeed + speedSpread * this.fastForwardLaunchBonus
        const courseSideLaunchSpeed = this.horizontalLaunchSpeed + speedSpread * this.fastHorizontalLaunchBonus
        const padCount = this.padCountMin
            + Math.floor(Math.random() * (this.padCountMax - this.padCountMin + 1))
            + Math.min(this.streak * this.streakPadBonus, 5)
        const pads = []
        let distance = courseStartDistance
        let lateral = 0
        let heightOffset = this.firstPadHeight
        let previousSide = Math.random() < 0.5 ? - 1 : 1
        let previousSegmentType = 'start'

        for(let i = 0; i < padCount; i++)
        {
            let segmentType = 'start'
            let terrainClearance = this.padTerrainClearance
            let widePad = false

            if(i > 0)
            {
                const progress = i / Math.max(1, padCount - 1)
                segmentType = this.chooseSegmentType(i, previousSegmentType)
                const segmentPlan = this.getSegmentPlan(
                    segmentType,
                    progress,
                    speedSpread,
                    courseForwardGap,
                    courseLateralGap,
                    courseMaxLateral,
                    lateral,
                    previousSide
                )

                distance += segmentPlan.forwardGap
                lateral += segmentPlan.sideStep
                previousSide = segmentPlan.previousSide
                terrainClearance = segmentPlan.terrainClearance
                widePad = segmentPlan.widePad
                heightOffset = this.clamp(heightOffset + segmentPlan.heightDelta, this.minHeightOffset, this.maxHeightOffset)
                previousSegmentType = segmentType
            }

            const z = originZ + directionZ * distance + sideZ * lateral
            const x = this.getSafeCourseX(originX + directionX * distance + sideX * lateral, z)
            const elevation = chunks.getElevationForPosition(x, z)

            if(elevation === false || !Number.isFinite(elevation))
            {
                this.cooldownTimer = this.blockedCourseCooldown
                this.straightTimer = 0
                return false
            }

            const radius = widePad
                ? this.padRadius
                : i > 2 && Math.random() < 0.3 + Math.min(this.streak, 4) * 0.05
                ? this.narrowPadRadius
                : this.padRadius

            if(this.overlapsBounceTower(x, z, radius)
                || this.state.duneMelody?.overlapsField(x, z, radius))
            {
                this.cooldownTimer = this.blockedCourseCooldown
                this.straightTimer = 0
                return false
            }

            pads.push({
                id: `${this.nextCourseId}:${i}`,
                index: i,
                position: vec3.fromValues(x, elevation + heightOffset, z),
                groundY: elevation,
                distance,
                radius,
                segmentType,
                tiltDirection: 0,
                tiltAngle: 0,
                launchVelocity: this.launchVelocity + Math.min(i, 8) * 0.18,
                horizontalVelocity: vec3.fromValues(directionX * courseForwardLaunchSpeed, 0, directionZ * courseForwardLaunchSpeed),
                lastBounceTime: - 999,
                bounced: false,
                bounceTime: 0,
                skipped: false,
                skipTime: 0,
                revealTime: this.time.elapsed
            })

            const pad = pads[pads.length - 1]
            pad.position[1] = Math.max(pad.position[1], elevation + terrainClearance)
        }

        for(let i = 0; i < pads.length; i++)
        {
            const pad = pads[i]
            const nextPad = pads[i + 1]

            if(nextPad)
            {
                const dx = nextPad.position[0] - pad.position[0]
                const dz = nextPad.position[2] - pad.position[2]
                const sideAmount = dx * sideX + dz * sideZ
                // Positive side is course-right, negative side is course-left.
                // The launch side always matches the visible tilt direction.
                const tiltDirection = Math.abs(sideAmount) > 1.2 ? Math.sign(sideAmount) : 0

                pad.tiltDirection = tiltDirection
                pad.tiltAngle = tiltDirection === 0 ? 0 : this.tiltAngle
                pad.horizontalVelocity[0] = directionX * courseForwardLaunchSpeed + sideX * tiltDirection * courseSideLaunchSpeed
                pad.horizontalVelocity[2] = directionZ * courseForwardLaunchSpeed + sideZ * tiltDirection * courseSideLaunchSpeed
                pad.launchVelocity = Math.min(
                    this.launchVelocityMax,
                    pad.launchVelocity + Math.max(0, nextPad.position[1] - pad.position[1]) * this.launchPerHeight
                )
            }
        }

        const finalPad = pads[pads.length - 1]
        const prize = {
            position: vec3.fromValues(finalPad.position[0], finalPad.position[1] + this.prizeHeight, finalPad.position[2]),
            collected: false,
            collectTime: 0
        }

        this.course = {
            id: this.nextCourseId++,
            createdAt: this.time.elapsed,
            completedAt: 0,
            failed: false,
            failedDistance: 0,
            started: false,
            revealedUntil: pads.length - 1,
            streakLevel: this.streak,
            speedSpread,
            lastBounceTime: - 999,
            origin: vec3.fromValues(originX, player.position.current[1], originZ),
            direction: vec3.fromValues(directionX, 0, directionZ),
            side: vec3.fromValues(sideX, 0, sideZ),
            pads,
            prize
        }

        this.previousPlayerY = player.position.current[1]
        this.straightTimer = 0
        this.cooldownTimer = this.cooldown
        this.events.emit('courseStart', this.course)

        return true
    }

    isPadResolved(pad)
    {
        return pad.bounced || pad.skipped
    }

    arePadsResolved(course = this.course)
    {
        return course.pads.every(pad => this.isPadResolved(pad))
    }

    canRestartAtBeginning(course, playerDistance, playerX, playerZ)
    {
        const firstPad = course.pads[0]
        const nearFirstPad = Math.hypot(playerX - firstPad.position[0], playerZ - firstPad.position[2]) < this.restartRadius
        const backAtStart = playerDistance < firstPad.distance + this.restartBacktrackDistance
        const hasProgressToReset = course.failed || course.started || course.completedAt > 0 || course.pads.some(pad => pad.skipped)

        return hasProgressToReset && nearFirstPad && backAtStart
    }

    restartAtBeginning(course)
    {
        course.completedAt = 0
        course.failed = false
        course.failedDistance = 0
        course.started = false
        course.revealedUntil = course.pads.length - 1
        course.lastBounceTime = - 999
        course.prize.collected = false
        course.prize.collectTime = 0

        for(const pad of course.pads)
        {
            pad.bounced = false
            pad.bounceTime = 0
            pad.skipped = false
            pad.skipTime = 0
            pad.lastBounceTime = - 999
            pad.revealTime = this.time.elapsed
        }

        this.events.emit('courseStart', course)
    }

    getNextPad()
    {
        if(!this.course)
            return false

        return this.course.pads.find(pad => !this.isPadResolved(pad)) ?? false
    }

    getCollisionRevealLimit(course = this.course)
    {
        return course.revealedUntil
    }

    revealThrough(index)
    {
        if(!this.course)
            return

        const previous = this.course.revealedUntil
        this.course.revealedUntil = Math.min(this.course.pads.length - 1, Math.max(previous, index))

        for(const pad of this.course.pads)
        {
            if(pad.index <= this.course.revealedUntil && pad.revealTime === 0)
                pad.revealTime = this.time.elapsed
        }

        if(this.debug.visible)
        {
            console.log('[progressiveBounceCourses] reveal', {
                courseId: this.course.id,
                previous,
                next: this.course.revealedUntil,
                visibleAhead: this.visibleAhead
            })
        }
    }

    skipPad(pad)
    {
        if(this.isPadResolved(pad))
            return

        pad.skipped = true
        pad.skipTime = this.time.elapsed

        if(pad.revealTime === 0)
            pad.revealTime = this.time.elapsed
    }

    skipPadsBefore(index)
    {
        for(const pad of this.course.pads)
        {
            if(pad.index >= index)
                break

            this.skipPad(pad)
        }
    }

    bouncePad(pad, player)
    {
        const perfect = this.state.controls.keys.down.jump
        const verticalVelocity = pad.launchVelocity * (perfect ? this.perfectBonusRatio : 1)
        const previousReveal = this.course.revealedUntil

        // Pad contact is authoritative. If the player lands on a retry pad,
        // clear any stale failed/completed state before revealing the chain.
        this.course.completedAt = 0
        this.course.failed = false
        this.course.failedDistance = 0
        this.course.prize.collected = false
        this.course.prize.collectTime = 0

        this.skipPadsBefore(pad.index)

        player.position.current[1] = pad.position[1]
        player.launchFromPad(verticalVelocity, pad.horizontalVelocity)
        player.addFlow(perfect ? this.perfectFlow : this.bounceFlow)

        pad.bounced = true
        pad.bounceTime = this.time.elapsed
        pad.lastBounceTime = this.time.elapsed
        this.course.started = true
        this.course.lastBounceTime = this.time.elapsed
        this.revealThrough(pad.index + this.visibleAhead)

        if(this.debug.visible)
        {
            console.log('[progressiveBounceCourses] pad bounce counted', {
                courseId: this.course.id,
                padIndex: pad.index,
                previousReveal,
                revealedUntil: this.course.revealedUntil,
                collisionLimit: this.getCollisionRevealLimit(this.course),
                perfect,
                playerY: player.position.current[1],
                padY: pad.position[1],
                velocityY: player.velocity[1]
            })
        }

        this.events.emit('padBounce', {
            course: this.course,
            pad,
            index: pad.index,
            perfect,
            position: pad.position,
            direction: this.course.direction
        })
    }

    collectPrize(player)
    {
        const prize = this.course.prize

        prize.collected = true
        prize.collectTime = this.time.elapsed
        player.refillJumpFromRing(this.course.direction, this.launchVelocity * 0.8)
        player.addFlow(this.prizeFlow)

        this.events.emit('prizeCollect', {
            course: this.course,
            position: prize.position
        })

        this.completeCourse(true)
    }

    completeCourse(perfect, playerDistance = 0)
    {
        if(!this.course || this.course.completedAt > 0)
            return

        const bounced = this.course.pads.filter(pad => pad.bounced).length
        const skipped = this.course.pads.filter(pad => pad.skipped).length
        this.course.completedAt = this.time.elapsed
        this.course.failed = !perfect
        this.course.failedDistance = perfect ? 0 : playerDistance
        this.streak = perfect && skipped === 0 && bounced === this.course.pads.length ? this.streak + 1 : 0

        this.events.emit('courseComplete', {
            course: this.course,
            bounced,
            skipped,
            total: this.course.pads.length,
            perfect: perfect && skipped === 0 && bounced === this.course.pads.length,
            streak: this.streak
        })
    }

    debugCollisionMiss(course, player, playerDistance)
    {
        if(!this.debug.visible || this.time.elapsed - this.lastCollisionDebugTime < this.collisionDebugInterval)
            return

        const playerX = player.position.current[0]
        const playerY = player.position.current[1]
        const playerZ = player.position.current[2]
        const collisionLimit = this.getCollisionRevealLimit(course)
        let best = null

        for(const pad of course.pads)
        {
            const restartPad = course.failed && pad.index === 0
            const inspectable = restartPad || pad.index <= collisionLimit

            if(!inspectable)
                continue

            const horizontalDistance = Math.hypot(playerX - pad.position[0], playerZ - pad.position[2])
            const yGap = playerY - pad.position[1]
            const score = Math.max(0, horizontalDistance - pad.radius) + Math.max(0, Math.abs(yGap) - 4) * 0.35

            if(!best || score < best.score)
                best = { pad, restartPad, horizontalDistance, yGap, score }
        }

        if(!best)
            return

        const { pad, restartPad, horizontalDistance, yGap } = best

        if(horizontalDistance > pad.radius + 3 && Math.abs(yGap) > 7)
            return

        const reasons = []

        if(!restartPad && this.isPadResolved(pad))
            reasons.push(pad.bounced ? 'already bounced' : 'skipped')

        if(!restartPad && pad.index > collisionLimit)
            reasons.push('not collision-active')

        if(player.velocity[1] >= 0)
            reasons.push('not falling')

        if(this.previousPlayerY === null)
            reasons.push('missing previous Y')
        else
        {
            if(this.previousPlayerY < pad.position[1])
                reasons.push('previous Y below pad plane')

            if(playerY >= pad.position[1])
                reasons.push('current Y above pad plane')
        }

        if(horizontalDistance > pad.radius)
            reasons.push('outside radius')

        if(this.time.elapsed - pad.lastBounceTime < this.padCooldown)
            reasons.push('pad cooldown')

        this.lastCollisionDebugTime = this.time.elapsed
        console.log('[progressiveBounceCourses] collision not counted', {
            courseId: course.id,
            padIndex: pad.index,
            reasons: reasons.length ? reasons : [ 'near pad, waiting for plane crossing' ],
            revealedUntil: course.revealedUntil,
            collisionLimit,
            completedAt: course.completedAt,
            failed: course.failed,
            started: course.started,
            bounced: pad.bounced,
            skipped: pad.skipped,
            horizontalDistance: Number(horizontalDistance.toFixed(2)),
            radius: pad.radius,
            previousY: this.previousPlayerY === null ? null : Number(this.previousPlayerY.toFixed(2)),
            playerY: Number(playerY.toFixed(2)),
            padY: Number(pad.position[1].toFixed(2)),
            yGap: Number(yGap.toFixed(2)),
            velocityY: Number(player.velocity[1].toFixed(2)),
            playerDistance: Number(playerDistance.toFixed(2)),
            padDistance: Number(pad.distance.toFixed(2))
        })
    }

    updateCourse(player)
    {
        const course = this.course
        const playerX = player.position.current[0]
        const playerY = player.position.current[1]
        const playerZ = player.position.current[2]
        const toPlayerX = playerX - course.origin[0]
        const toPlayerZ = playerZ - course.origin[2]
        const playerDistance = toPlayerX * course.direction[0] + toPlayerZ * course.direction[2]
        let countedBounce = false

        // Retry/reset must happen before collision checks. Otherwise a failed
        // course can test the first pad while it is still marked bounced/skipped.
        if(this.canRestartAtBeginning(course, playerDistance, playerX, playerZ))
            this.restartAtBeginning(course)

        if(player.velocity[1] < 0 && this.previousPlayerY !== null)
        {
            const collisionLimit = this.getCollisionRevealLimit(course)

            for(const pad of course.pads)
            {
                const restartPad = course.failed && pad.index === 0

                if(!restartPad && (this.isPadResolved(pad) || pad.index > collisionLimit))
                    continue

                if(this.time.elapsed - pad.lastBounceTime < this.padCooldown)
                    continue

                if(this.previousPlayerY < pad.position[1] || playerY >= pad.position[1])
                    continue

                if(Math.hypot(playerX - pad.position[0], playerZ - pad.position[2]) > pad.radius)
                    continue

                if(restartPad)
                    this.restartAtBeginning(course)

                this.bouncePad(course.pads[pad.index], player)
                countedBounce = true
                break
            }
        }

        if(!countedBounce)
            this.debugCollisionMiss(course, player, playerDistance)

        const prize = course.prize

        if(course.completedAt === 0 && !course.started && playerDistance > course.pads[0].distance + this.missDistance)
            this.completeCourse(false, playerDistance)

        if(!prize.collected && this.arePadsResolved(course))
        {
            const distance = Math.hypot(
                playerX - prize.position[0],
                playerY + 0.9 - prize.position[1],
                playerZ - prize.position[2]
            )

            if(distance < this.prizeRadius)
                this.collectPrize(player)
        }

        if(course.completedAt === 0)
        {
            const nextPad = this.getNextPad()
            const landedAfterStart = course.started
                && player.grounded
                && this.time.elapsed - course.lastBounceTime > this.fallGrace

            if((nextPad || this.arePadsResolved(course)) && (landedAfterStart || player.swimming))
                this.completeCourse(false, playerDistance)
        }

        if(course.failed && playerDistance > course.failedDistance + this.failedAbandonDistance)
        {
            this.course = null
            this.cooldownTimer = Math.min(this.cooldownTimer, 1.5)
            this.straightTimer = 0
        }
        else if(course.completedAt > 0 && !course.failed && this.time.elapsed - course.completedAt > this.expireDelay)
            this.course = null
    }

    update()
    {
        if(!this.enabled)
            return

        const player = this.state.player
        this.cooldownTimer = Math.max(0, this.cooldownTimer - this.time.delta)

        if(this.course)
        {
            this.updateCourse(player)
            this.previousPlayerY = player.position.current[1]
            return
        }

        if(this.state.obstacleCourses?.course || this.state.tideline?.course)
        {
            this.previousPlayerY = player.position.current[1]
            return
        }

        this.updateStraightTravel(player)

        if(this.cooldownTimer === 0 && this.straightTimer >= this.triggerTime)
            this.createCourse(player)

        this.previousPlayerY = player.position.current[1]
    }

    spawnDebugCourse()
    {
        this.createCourse(this.state.player)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('state/progressiveBounceCourses')

        folder.add(this, 'enabled')
        folder.add(this, 'triggerTime').min(0).max(12).step(0.1)
        folder.add(this, 'cooldown').min(0).max(80).step(1)
        folder.add(this, 'padCountMin').min(3).max(20).step(1)
        folder.add(this, 'padCountMax').min(3).max(24).step(1)
        folder.add(this, 'visibleAhead').min(1).max(6).step(1)
        folder.add(this, 'launchVelocity').min(10).max(28).step(0.1)
        folder.add(this, 'forwardLaunchSpeed').min(2).max(22).step(0.1)
        folder.add(this, 'horizontalLaunchSpeed').min(6).max(36).step(0.1)
        folder.add(this, 'angledPadChance').min(0).max(1).step(0.01)
        folder.add(this, 'minForwardGap').min(3).max(12).step(0.25)
        folder.add(this, 'maxForwardGap').min(12).max(32).step(0.5)
        folder.add(this, 'closeForwardGap').min(3).max(12).step(0.25)
        folder.add(this, 'forwardGap').min(5).max(18).step(0.5)
        folder.add(this, 'fastForwardGapBonus').min(0).max(10).step(0.5)
        folder.add(this, 'lateralGap').min(2).max(12).step(0.25)
        folder.add(this, 'fastLateralGapBonus').min(0).max(6).step(0.25)
        folder.add(this, 'minHeightOffset').min(0.5).max(4).step(0.1)
        folder.add(this, 'maxHeightOffset').min(5).max(16).step(0.25)
        folder.add(this, 'padRadius').min(1).max(5).step(0.1)
        folder.add(this, 'restartRadius').min(2).max(30).step(0.5)
        folder.add(this, 'failedAbandonDistance').min(20).max(250).step(5)
        folder.add({ spawn: () => this.spawnDebugCourse() }, 'spawn')
    }
}
