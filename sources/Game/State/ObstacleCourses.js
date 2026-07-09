import EventsEmitter from 'events'
import { vec3 } from 'gl-matrix'

import Game from '@/Game.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class ObstacleCourses
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.events = new EventsEmitter()

        this.enabled = true
        this.minSpeed = 11
        this.minForwardRatio = 0.62
        this.minStableDot = 0.965
        this.triggerTime = 6
        this.cooldown = 24
        this.cooldownTimer = 5
        this.blockedCourseCooldown = 6

        this.ringCountMin = 5
        this.ringCountMax = 25
        this.startDistance = 44
        this.spacing = 13
        this.bouncePadAvoidRadius = 16
        this.lateralAmplitude = 4.5
        this.trickLateralDistance = 9
        this.firstRingHeight = 2.15
        this.heightBase = 3.6
        this.heightAmplitude = 1.9
        this.maxRingClimb = 1.25
        this.collectRadius = 2.35
        this.ringJumpVelocity = 14
        this.missDistance = 7
        this.courseEndDistance = 30
        this.expireDelay = 1.4
        this.visibleAhead = 3
        this.rollGrace = 1.15
        this.dashGrace = 1
        this.diveGrace = 0.3
        this.glideGrace = 0.3
        this.diveRingHeight = 1.6
        this.glideRingExtraHeight = 3
        this.specialStartIndex = 3
        this.specialMinGap = 3
        this.specialChance = 0.35
        this.streakRingBonus = 2

        this.straightTimer = 0
        this.straightDirection = vec3.fromValues(0, 0, - 1)
        this.course = null
        this.nextCourseId = 1
        this.streak = 0
        this.recentRollDirection = 0
        this.recentRollTime = - 999
        this.recentDashTime = - 999
        this.lastDivingTime = - 999
        this.lastGlidingTime = - 999

        this.state.player.events.on('roll', (direction) =>
        {
            this.recentRollDirection = direction
            this.recentRollTime = this.time.elapsed
        })

        this.state.player.events.on('dash', () =>
        {
            this.recentDashTime = this.time.elapsed
        })

        this.setDebug()
    }

    updateStraightTravel(player)
    {
        const speed = player.horizontalSpeed

        if(speed < this.minSpeed)
        {
            this.straightTimer = Math.max(0, this.straightTimer - this.time.delta * 1.6)
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
        const minX = shoreX - beachWidth * 1.35
        const maxX = shoreX + 8

        return Math.max(minX, Math.min(maxX, x))
    }

    chooseRingTypes(ringCount)
    {
        // Baseline: ring 1 is the roll ring (hinted by ring 0), rest normal.
        // Perfect-clear streaks unlock trick rings sprinkled over the middle
        // of the course so the opening always stays readable
        const types = []

        for(let i = 0; i < ringCount; i++)
            types.push(i === 1 ? 'roll' : 'normal')

        const pool = []

        if(this.streak >= 1)
            pool.push('glide')

        if(this.streak >= 2)
            pool.push('dive')

        if(this.streak >= 3)
            pool.push('dashGate')

        if(pool.length === 0)
            return types

        let budget = Math.min(1 + this.streak, Math.floor(ringCount / 3))
        let lastSpecial = - this.specialMinGap

        for(let i = this.specialStartIndex; i <= ringCount - 2 && budget > 0; i++)
        {
            if(i - lastSpecial < this.specialMinGap)
                continue

            if(Math.random() < this.specialChance)
            {
                types[i] = pool[Math.floor(Math.random() * pool.length)]
                lastSpecial = i
                budget--
            }
        }

        return types
    }

    overlapsBouncePadCourse(x, z)
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
                const clearance = this.bouncePadAvoidRadius + pad.radius

                if(Math.hypot(x - pad.position[0], z - pad.position[2]) < clearance)
                    return true
            }
        }

        return false
    }

    createCourse(player)
    {
        const chunks = this.state.chunks
        const directionX = this.straightDirection[0]
        const directionZ = this.straightDirection[2]
        const sideX = - directionZ
        const sideZ = directionX
        const originX = player.position.current[0]
        const originZ = player.position.current[2]
        const ringCount = this.ringCountMin
            + Math.floor(Math.random() * (this.ringCountMax - this.ringCountMin + 1))
            + Math.min(this.streak * this.streakRingBonus, 10)
        const trickDirection = Math.random() < 0.5 ? - 1 : 1
        const types = this.chooseRingTypes(ringCount)
        const rings = []

        for(let i = 0; i < ringCount; i++)
        {
            const distance = this.startDistance + i * this.spacing
            const rhythm = i / Math.max(1, ringCount - 1)
            let lateral = Math.sin(i * 1.35) * this.lateralAmplitude * (0.45 + rhythm * 0.55)

            if(i === 0)
                lateral = 0
            else if(i === 1 || i === 2)
                lateral = trickDirection * this.trickLateralDistance
            else
                lateral = trickDirection * this.trickLateralDistance * Math.max(0, 1 - (i - 2) * 0.35) + lateral * Math.min(1, (i - 2) * 0.35)

            const z = originZ + directionZ * distance + sideZ * lateral
            const x = this.getSafeCourseX(originX + directionX * distance + sideX * lateral, z)
            const elevation = chunks.getElevationForPosition(x, z)

            if(elevation === false || !Number.isFinite(elevation))
                return false

            if(this.overlapsBouncePadCourse(x, z))
            {
                if(rings.length >= this.ringCountMin)
                    break

                this.straightTimer = 0
                this.cooldownTimer = this.blockedCourseCooldown
                return false
            }

            const type = types[i]
            const rollDirection = type === 'roll' ? trickDirection : 0
            const hintRoll = i === 0 ? trickDirection : 0
            let targetY = elevation + (i === 0 ? this.firstRingHeight : this.heightBase + Math.sin(i * 0.9) * this.heightAmplitude)

            if(type === 'dive')
                targetY = elevation + this.diveRingHeight
            else if(type === 'glide')
                targetY = elevation + this.heightBase + this.glideRingExtraHeight

            let y = i === 0 ? targetY : Math.min(targetY, rings[i - 1].position[1] + this.maxRingClimb)

            // Glide rings cap just above the previous ring: the refill float
            // peaks higher than this, so the ring is always enterable while
            // descending with jump held — exactly the glide condition
            if(type === 'glide' && i > 0)
                y = Math.min(y, rings[i - 1].position[1] + 1)

            rings.push({
                id: `${this.nextCourseId}:${i}`,
                index: i,
                revealTime: 0,
                groundY: elevation,
                position: vec3.fromValues(
                    x,
                    y,
                    z
                ),
                distance,
                radius: this.collectRadius,
                type,
                rollDirection,
                hintRoll,
                collected: false,
                missed: false,
                collectTime: 0
            })
        }

        this.course = {
            id: this.nextCourseId++,
            createdAt: this.time.elapsed,
            completedAt: 0,
            streakLevel: this.streak,
            origin: vec3.fromValues(originX, player.position.current[1], originZ),
            direction: vec3.fromValues(directionX, 0, directionZ),
            rings
        }

        this.straightTimer = 0
        this.cooldownTimer = this.cooldown
        this.events.emit('courseStart', this.course)

        return true
    }

    getNextRing()
    {
        if(!this.course)
            return false

        return this.course.rings.find(ring => !ring.collected && !ring.missed) ?? false
    }

    getRevealLimit()
    {
        if(!this.course)
            return - 1

        const nextRing = this.getNextRing()
        const nextIndex = nextRing ? nextRing.index : this.course.rings.length - 1

        return Math.min(this.course.rings.length - 1, nextIndex + this.visibleAhead - 1)
    }

    isGliding(player)
    {
        return !player.grounded && player.velocity[1] < 0 && this.state.controls.keys.down.jump
    }

    canCollectRing(ring)
    {
        const player = this.state.player

        if(ring.type === 'roll')
            return this.recentRollDirection === ring.rollDirection && this.time.elapsed - this.recentRollTime < this.rollGrace

        if(ring.type === 'dive')
            return player.diving || this.time.elapsed - this.lastDivingTime < this.diveGrace

        if(ring.type === 'glide')
            return this.isGliding(player) || this.time.elapsed - this.lastGlidingTime < this.glideGrace

        if(ring.type === 'dashGate')
            return this.time.elapsed - this.recentDashTime < this.dashGrace

        return true
    }

    collectRing(ring, player)
    {
        ring.collected = true
        ring.collectTime = this.time.elapsed
        player.refillJumpFromRing(this.course.direction, this.ringJumpVelocity)

        this.events.emit('ringCollect', {
            course: this.course,
            ring,
            index: ring.index,
            count: this.course.rings.length,
            type: ring.type,
            position: ring.position,
            direction: this.course.direction
        })
    }

    updateCourse(player)
    {
        const course = this.course
        const toPlayerX = player.position.current[0] - course.origin[0]
        const toPlayerZ = player.position.current[2] - course.origin[2]
        const playerDistance = toPlayerX * course.direction[0] + toPlayerZ * course.direction[2]

        // Grace trackers so collecting a frame or two after pulling out of a
        // dive or glide still counts
        if(player.diving)
            this.lastDivingTime = this.time.elapsed

        if(this.isGliding(player))
            this.lastGlidingTime = this.time.elapsed

        for(const ring of course.rings)
        {
            if(ring.collected || ring.missed)
                continue

            const distance = Math.hypot(
                player.position.current[0] - ring.position[0],
                player.position.current[1] + 0.9 - ring.position[1],
                player.position.current[2] - ring.position[2]
            )

            if(distance < ring.radius && this.canCollectRing(ring))
            {
                this.collectRing(ring, player)
                continue
            }

            if(playerDistance > ring.distance + this.missDistance)
                ring.missed = true
        }

        const lastRing = course.rings[course.rings.length - 1]
        const finished = course.rings.every(ring => ring.collected || ring.missed)
        const farPast = playerDistance > lastRing.distance + this.courseEndDistance

        if((finished || farPast) && course.completedAt === 0)
        {
            course.completedAt = this.time.elapsed

            const collected = course.rings.filter(ring => ring.collected).length
            const perfect = collected === course.rings.length
            this.streak = perfect ? this.streak + 1 : 0

            this.events.emit('courseComplete', {
                course,
                collected,
                total: course.rings.length,
                perfect,
                streak: this.streak
            })
        }

        if(course.completedAt > 0 && this.time.elapsed - course.completedAt > this.expireDelay)
            this.course = null
    }

    update()
    {
        if(!this.enabled)
            return

        const player = this.state.player

        if(this.state.progressiveBounceCourses?.course)
            return

        this.cooldownTimer = Math.max(0, this.cooldownTimer - this.time.delta)

        if(this.course)
        {
            this.updateCourse(player)
            return
        }

        this.updateStraightTravel(player)

        if(this.cooldownTimer === 0 && this.straightTimer >= this.triggerTime)
            this.createCourse(player)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('state/obstacleCourses')

        folder.add(this, 'enabled')
        folder.add(this, 'minSpeed').min(0).max(40).step(0.5)
        folder.add(this, 'minForwardRatio').min(0).max(1).step(0.01)
        folder.add(this, 'triggerTime').min(0).max(12).step(0.1)
        folder.add(this, 'cooldown').min(0).max(60).step(1)
        folder.add(this, 'blockedCourseCooldown').min(0).max(30).step(1)
        folder.add(this, 'spacing').min(5).max(24).step(0.5)
        folder.add(this, 'startDistance').min(20).max(80).step(1)
        folder.add(this, 'bouncePadAvoidRadius').min(0).max(40).step(0.5)
        folder.add(this, 'trickLateralDistance').min(3).max(18).step(0.5)
        folder.add(this, 'collectRadius').min(0.5).max(5).step(0.05)
        folder.add(this, 'ringJumpVelocity').min(0).max(30).step(0.1)
        folder.add(this, 'firstRingHeight').min(0.5).max(6).step(0.05)
        folder.add(this, 'heightBase').min(1).max(10).step(0.1)
        folder.add(this, 'maxRingClimb').min(0.25).max(4).step(0.05)
        folder.add(this, 'visibleAhead').min(1).max(7).step(1)
        folder.add(this, 'rollGrace').min(0.2).max(3).step(0.05)
        folder.add(this, 'streak').min(0).max(8).step(1)
        folder.add({ spawn: () => this.createCourse(this.state.player) }, 'spawn')
    }
}
