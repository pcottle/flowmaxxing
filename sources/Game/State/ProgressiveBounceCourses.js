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
        this.minStableDot = 0.96
        this.triggerTime = 3.6
        this.cooldown = 24
        this.cooldownTimer = 2
        this.blockedCourseCooldown = 7

        this.padCountMin = 8
        this.padCountMax = 14
        this.startDistance = 42
        this.fastStartDistanceBonus = 10
        this.forwardGap = 12
        this.fastForwardGapBonus = 6.5
        this.forwardGapJitter = 5
        this.lateralGap = 9
        this.fastLateralGapBonus = 3
        this.maxLateral = 22
        this.firstPadHeight = 1.1
        this.heightBase = 4.2
        this.verticalStep = 2.35
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
        this.speedSpreadMax = 34
        this.padCooldown = 0.32
        this.missDistance = 12
        this.restartRadius = 12
        this.restartBacktrackDistance = 8
        this.fallGrace = 0.35
        this.expireDelay = 1.4
        this.failedAbandonDistance = 110
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

    createCourse(player)
    {
        if(this.state.obstacleCourses?.course)
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

        for(let i = 0; i < padCount; i++)
        {
            let currentSideStep = 0

            if(i > 0)
            {
                distance += courseForwardGap + (Math.random() - 0.5) * this.forwardGapJitter

                const progress = i / Math.max(1, padCount - 1)
                let sideStep = 0
                const forceAngled = i % 3 === 1

                if(forceAngled || Math.random() < this.angledPadChance)
                {
                    let direction = Math.random() < 0.62 ? - previousSide : previousSide

                    if(Math.abs(lateral + direction * courseLateralGap) > courseMaxLateral)
                        direction *= - 1

                    sideStep = direction * courseLateralGap * (0.82 + progress * 0.42)
                    lateral += sideStep
                    previousSide = direction
                    currentSideStep = sideStep
                }
                else
                {
                    lateral *= 0.82
                }

                const climb = (Math.random() - 0.42) * this.verticalStep + Math.sin(i * 0.95) * 0.8
                heightOffset = Math.max(this.firstPadHeight + 0.2, Math.min(this.heightBase + progress * 6.5, heightOffset + climb))
            }

            const z = originZ + directionZ * distance + sideZ * lateral
            const x = this.getSafeCourseX(originX + directionX * distance + sideX * lateral, z)
            const elevation = chunks.getElevationForPosition(x, z)

            if(elevation === false || !Number.isFinite(elevation))
                return false

            const radius = i > 2 && Math.random() < 0.3 + Math.min(this.streak, 4) * 0.05
                ? this.narrowPadRadius
                : this.padRadius

            if(this.overlapsBounceTower(x, z, radius))
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
                tiltDirection: 0,
                tiltAngle: 0,
                launchVelocity: this.launchVelocity + Math.min(i, 8) * 0.18,
                horizontalVelocity: vec3.fromValues(directionX * courseForwardLaunchSpeed, 0, directionZ * courseForwardLaunchSpeed),
                lastBounceTime: - 999,
                bounced: false,
                bounceTime: 0,
                skipped: false,
                skipTime: 0,
                revealTime: i === 0 ? this.time.elapsed : 0
            })

            const pad = pads[pads.length - 1]
            const terrainClearance = Math.abs(currentSideStep) > 1.2
                ? this.sidePadTerrainClearance
                : this.padTerrainClearance

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
            started: false,
            revealedUntil: 0,
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
        course.started = false
        course.revealedUntil = 0
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
            pad.revealTime = pad.index === 0 ? this.time.elapsed : 0
        }

        this.events.emit('courseStart', course)
    }

    getNextPad()
    {
        if(!this.course)
            return false

        return this.course.pads.find(pad => !this.isPadResolved(pad)) ?? false
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

    skipPassedPads(playerDistance)
    {
        if(!this.course.started)
            return

        for(const pad of this.course.pads)
        {
            if(pad.index > this.course.revealedUntil)
                continue

            if(this.isPadResolved(pad))
                continue

            if(playerDistance > pad.distance + this.missDistance)
                this.skipPad(pad)
        }
    }

    bouncePad(pad, player)
    {
        const perfect = this.state.controls.keys.down.jump
        const verticalVelocity = pad.launchVelocity * (perfect ? this.perfectBonusRatio : 1)

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

    completeCourse(perfect)
    {
        if(!this.course || this.course.completedAt > 0)
            return

        const bounced = this.course.pads.filter(pad => pad.bounced).length
        const skipped = this.course.pads.filter(pad => pad.skipped).length
        this.course.completedAt = this.time.elapsed
        this.course.failed = !perfect
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

    updateCourse(player)
    {
        const course = this.course
        const playerX = player.position.current[0]
        const playerY = player.position.current[1]
        const playerZ = player.position.current[2]

        if(player.velocity[1] < 0 && this.previousPlayerY !== null)
        {
            for(const pad of course.pads)
            {
                if(this.isPadResolved(pad) || pad.index > course.revealedUntil)
                    continue

                if(this.time.elapsed - pad.lastBounceTime < this.padCooldown)
                    continue

                if(this.previousPlayerY < pad.position[1] || playerY >= pad.position[1])
                    continue

                if(Math.hypot(playerX - pad.position[0], playerZ - pad.position[2]) > pad.radius)
                    continue

                this.bouncePad(pad, player)
                break
            }
        }

        const prize = course.prize

        const toPlayerX = playerX - course.origin[0]
        const toPlayerZ = playerZ - course.origin[2]
        const playerDistance = toPlayerX * course.direction[0] + toPlayerZ * course.direction[2]

        if(this.canRestartAtBeginning(course, playerDistance, playerX, playerZ))
            this.restartAtBeginning(course)

        this.skipPassedPads(playerDistance)

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
                this.completeCourse(false)
        }

        if(course.failed && playerDistance > course.pads[course.pads.length - 1].distance + this.failedAbandonDistance)
            this.course = null
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

        if(this.state.obstacleCourses?.course)
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
        folder.add(this, 'forwardGap').min(5).max(18).step(0.5)
        folder.add(this, 'fastForwardGapBonus').min(0).max(10).step(0.5)
        folder.add(this, 'lateralGap').min(2).max(12).step(0.25)
        folder.add(this, 'fastLateralGapBonus').min(0).max(6).step(0.25)
        folder.add(this, 'padRadius').min(1).max(5).step(0.1)
        folder.add(this, 'restartRadius').min(2).max(30).step(0.5)
        folder.add(this, 'failedAbandonDistance').min(20).max(250).step(5)
        folder.add({ spawn: () => this.spawnDebugCourse() }, 'spawn')
    }
}
