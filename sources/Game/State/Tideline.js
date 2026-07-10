import EventsEmitter from 'events'
import seedrandom from 'seedrandom'
import { vec3 } from 'gl-matrix'

import Game from '@/Game.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class Tideline
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.events = new EventsEmitter()

        this.enabled = true
        this.minSpeed = 9
        this.minForwardRatio = 0.5
        this.maxShoreDistance = 9
        this.triggerTime = 2
        this.cooldown = 16
        this.cooldownTimer = 1
        this.blockedCourseCooldown = 6

        this.sampleStep = 5
        this.samplesCount = 45
        this.startDistance = 14
        this.bandHalfWidth = 2.6
        this.carveBandBonus = 0.9
        this.minProgressSpeed = 5.5
        this.segmentLength = 25
        this.meanderStartAmplitude = 1.5
        this.meanderEndAmplitude = 5
        this.prizeHeight = 1.7
        this.prizeRadius = 2.6
        this.prizeActivationGap = 15
        this.segmentFlow = 0.06
        this.carveFlowRate = 0.03
        this.prizeFlow = 0.55
        this.abandonLateralDistance = 60
        this.abandonBeyondDistance = 30
        this.expireDelay = 1.6

        this.straightTimer = 0
        this.course = null
        this.nextCourseId = 1

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

        if(- player.velocity[2] / speed < this.minForwardRatio)
        {
            this.straightTimer = Math.max(0, this.straightTimer - this.time.delta * 2)
            return
        }

        const playerZ = player.position.current[2]
        const shoreX = this.state.terrains.getShoreX(playerZ)

        if(Math.abs(player.position.current[0] - shoreX) > this.maxShoreDistance)
        {
            this.straightTimer = Math.max(0, this.straightTimer - this.time.delta)
            return
        }

        this.straightTimer += this.time.delta
    }

    createCourse(player)
    {
        if(this.state.progressiveBounceCourses?.course || this.state.obstacleCourses?.course)
            return false

        const terrains = this.state.terrains
        const chunks = this.state.chunks
        const random = new seedrandom(`tideline:${this.nextCourseId}`)

        const meanderWavelengthA = 45 + random() * 35
        const meanderWavelengthB = 19 + random() * 12
        const meanderPhaseA = random() * Math.PI * 2
        const meanderPhaseB = random() * Math.PI * 2

        const startZ = player.position.current[2] - this.startDistance
        const samples = []

        for(let i = 0; i < this.samplesCount; i++)
        {
            const z = startZ - i * this.sampleStep
            const along = i * this.sampleStep
            const rampRatio = i / (this.samplesCount - 1)
            const amplitude = this.meanderStartAmplitude
                + (this.meanderEndAmplitude - this.meanderStartAmplitude) * rampRatio
            const meander = amplitude * (
                Math.sin(along * Math.PI * 2 / meanderWavelengthA + meanderPhaseA) * 0.7
                + Math.sin(along * Math.PI * 2 / meanderWavelengthB + meanderPhaseB) * 0.3
            )
            const x = terrains.getShoreX(z) + meander
            const elevation = chunks.getElevationForPosition(x, z)

            if(elevation === false || !Number.isFinite(elevation))
            {
                this.cooldownTimer = this.blockedCourseCooldown
                this.straightTimer = 0
                return false
            }

            samples.push({
                x,
                // The ribbon floats on the water surface where the line dips
                // into the shallows
                y: Math.max(elevation, 0),
                z,
                arc: 0
            })
        }

        for(let i = 1; i < samples.length; i++)
        {
            const sample = samples[i]
            const previous = samples[i - 1]

            sample.arc = previous.arc + Math.hypot(
                sample.x - previous.x,
                sample.z - previous.z
            )
        }

        const finalSample = samples[samples.length - 1]
        const prize = {
            position: vec3.fromValues(finalSample.x, finalSample.y + this.prizeHeight, finalSample.z),
            active: false,
            collected: false,
            collectTime: 0
        }

        this.course = {
            id: this.nextCourseId++,
            createdAt: this.time.elapsed,
            completedAt: 0,
            samples,
            totalLength: finalSample.arc,
            progress: 0,
            segmentIndex: 0,
            inBand: false,
            prize
        }

        this.straightTimer = 0
        this.cooldownTimer = this.cooldown
        this.events.emit('courseStart', this.course)

        return true
    }

    getNearestPointOnLine(playerX, playerZ)
    {
        const samples = this.course.samples
        let bestArc = 0
        let bestDistance = Infinity

        for(let i = 0; i < samples.length - 1; i++)
        {
            const a = samples[i]
            const b = samples[i + 1]
            const segmentX = b.x - a.x
            const segmentZ = b.z - a.z
            const lengthSq = segmentX * segmentX + segmentZ * segmentZ

            if(lengthSq < 0.0001)
                continue

            const t = Math.min(Math.max(
                ((playerX - a.x) * segmentX + (playerZ - a.z) * segmentZ) / lengthSq,
                0
            ), 1)
            const pointX = a.x + segmentX * t
            const pointZ = a.z + segmentZ * t
            const distance = Math.hypot(playerX - pointX, playerZ - pointZ)

            if(distance < bestDistance)
            {
                bestDistance = distance
                bestArc = a.arc + (b.arc - a.arc) * t
            }
        }

        return { arc: bestArc, distance: bestDistance }
    }

    collectPrize(player)
    {
        const course = this.course
        const prize = course.prize

        prize.collected = true
        prize.collectTime = this.time.elapsed
        player.refillJumpFromRing(vec3.fromValues(0, 0, - 1), 14)
        player.addFlow(this.prizeFlow)
        course.completedAt = this.time.elapsed

        this.events.emit('prizeCollect', {
            course,
            position: prize.position
        })

        this.events.emit('courseComplete', {
            course,
            segments: course.segmentIndex,
            totalSegments: Math.floor(course.totalLength / this.segmentLength)
        })
    }

    abandonCourse()
    {
        this.events.emit('abandon', { course: this.course })
        this.course = null
        this.cooldownTimer = Math.min(this.cooldownTimer, 8)
        this.straightTimer = 0
    }

    updateCourse(player)
    {
        const course = this.course
        const playerX = player.position.current[0]
        const playerZ = player.position.current[2]
        const nearest = this.getNearestPointOnLine(playerX, playerZ)
        const effectiveBand = this.bandHalfWidth + (player.carving ? this.carveBandBonus : 0)

        course.inBand = nearest.distance < effectiveBand

        if(course.completedAt === 0)
        {
            if(course.inBand && player.horizontalSpeed > this.minProgressSpeed)
            {
                course.progress = Math.max(course.progress, nearest.arc)

                if(player.carving)
                    player.addFlow(this.carveFlowRate * this.time.delta)
            }

            const segmentIndex = Math.min(
                Math.floor(course.progress / this.segmentLength),
                Math.floor(course.totalLength / this.segmentLength)
            )

            while(course.segmentIndex < segmentIndex)
            {
                course.segmentIndex++
                player.addFlow(this.segmentFlow)
                this.events.emit('segment', {
                    course,
                    index: course.segmentIndex,
                    progress: course.progress
                })
            }

            course.prize.active = course.progress >= course.totalLength - this.prizeActivationGap

            if(course.prize.active && !course.prize.collected)
            {
                const distance = Math.hypot(
                    playerX - course.prize.position[0],
                    player.position.current[1] + 0.9 - course.prize.position[1],
                    playerZ - course.prize.position[2]
                )

                if(distance < this.prizeRadius)
                    this.collectPrize(player)
            }

            const finalSample = course.samples[course.samples.length - 1]

            if(playerZ < finalSample.z - this.abandonBeyondDistance
                || nearest.distance > this.abandonLateralDistance)
            {
                this.abandonCourse()
                return
            }
        }
        else if(this.time.elapsed - course.completedAt > this.expireDelay)
        {
            this.course = null
        }
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

        if(this.state.progressiveBounceCourses?.course || this.state.obstacleCourses?.course)
            return

        this.updateStraightTravel(player)

        if(this.cooldownTimer === 0 && this.straightTimer >= this.triggerTime)
            this.createCourse(player)
    }

    spawnDebugCourse()
    {
        this.createCourse(this.state.player)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('state/tideline')

        folder.add(this, 'enabled')
        folder.add(this, 'triggerTime').min(0).max(12).step(0.1)
        folder.add(this, 'cooldown').min(0).max(80).step(1)
        folder.add(this, 'bandHalfWidth').min(1).max(6).step(0.1)
        folder.add(this, 'carveBandBonus').min(0).max(3).step(0.1)
        folder.add(this, 'segmentLength').min(10).max(60).step(1)
        folder.add(this, 'meanderEndAmplitude').min(1).max(9).step(0.25)
        folder.add(this, 'samplesCount').min(15).max(80).step(1)
        folder.add({ spawn: () => this.spawnDebugCourse() }, 'spawn')
    }
}
