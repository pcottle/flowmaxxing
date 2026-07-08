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
        this.triggerTime = 4.25
        this.cooldown = 14
        this.cooldownTimer = 5

        this.ringCountMin = 5
        this.ringCountMax = 7
        this.startDistance = 44
        this.spacing = 13
        this.lateralAmplitude = 4.5
        this.trickLateralDistance = 9
        this.firstRingHeight = 2.15
        this.heightBase = 3.6
        this.heightAmplitude = 1.9
        this.maxRingClimb = 1.25
        this.collectRadius = 2.35
        this.missDistance = 7
        this.courseEndDistance = 30
        this.expireDelay = 1.4
        this.visibleAhead = 3
        this.rollGrace = 1.15

        this.straightTimer = 0
        this.straightDirection = vec3.fromValues(0, 0, - 1)
        this.course = null
        this.nextCourseId = 1
        this.recentRollDirection = 0
        this.recentRollTime = - 999

        this.state.player.events.on('roll', (direction) =>
        {
            this.recentRollDirection = direction
            this.recentRollTime = this.time.elapsed
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

    createCourse(player)
    {
        const chunks = this.state.chunks
        const directionX = this.straightDirection[0]
        const directionZ = this.straightDirection[2]
        const sideX = - directionZ
        const sideZ = directionX
        const originX = player.position.current[0]
        const originZ = player.position.current[2]
        const ringCount = this.ringCountMin + Math.floor(Math.random() * (this.ringCountMax - this.ringCountMin + 1))
        const trickDirection = Math.random() < 0.5 ? - 1 : 1
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

            const requiresRoll = i === 1 ? trickDirection : 0
            const hintRoll = i === 0 ? trickDirection : 0
            const targetY = elevation + (i === 0 ? this.firstRingHeight : this.heightBase + Math.sin(i * 0.9) * this.heightAmplitude)
            const y = i === 0 ? targetY : Math.min(targetY, rings[i - 1].position[1] + this.maxRingClimb)

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
                requiresRoll,
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

    canCollectRing(ring)
    {
        if(!ring.requiresRoll)
            return true

        return this.recentRollDirection === ring.requiresRoll && this.time.elapsed - this.recentRollTime < this.rollGrace
    }

    collectRing(ring, player)
    {
        ring.collected = true
        ring.collectTime = this.time.elapsed
        player.refillJumpFromRing(this.course.direction)

        this.events.emit('ringCollect', {
            course: this.course,
            ring,
            index: ring.index,
            count: this.course.rings.length,
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
            course.completedAt = this.time.elapsed

        if(course.completedAt > 0 && this.time.elapsed - course.completedAt > this.expireDelay)
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
        folder.add(this, 'spacing').min(5).max(24).step(0.5)
        folder.add(this, 'startDistance').min(20).max(80).step(1)
        folder.add(this, 'trickLateralDistance').min(3).max(18).step(0.5)
        folder.add(this, 'collectRadius').min(0.5).max(5).step(0.05)
        folder.add(this, 'firstRingHeight').min(0.5).max(6).step(0.05)
        folder.add(this, 'heightBase').min(1).max(10).step(0.1)
        folder.add(this, 'maxRingClimb').min(0.25).max(4).step(0.05)
        folder.add(this, 'visibleAhead').min(1).max(7).step(1)
        folder.add(this, 'rollGrace').min(0.2).max(3).step(0.05)
        folder.add({ spawn: () => this.createCourse(this.state.player) }, 'spawn')
    }
}
