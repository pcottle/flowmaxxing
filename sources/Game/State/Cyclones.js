import EventsEmitter from 'events'
import seedrandom from 'seedrandom'

import Game from '@/Game.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class Cyclones
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.events = new EventsEmitter()

        this.enabled = true

        // Anchors are deterministic landmarks (seeded by index) staggered
        // against the bounce towers (300 + 420k); the wander below is a pure
        // function of (seed, elapsed) so despawn/rebuild is idempotent.
        // Sparse on purpose — finding one should feel like an event
        this.interval = 1800
        this.firstOffset = 900
        this.keepDistance = 600

        // How far up the foothills they live: 0 = shoreline, 1 = mountain start
        this.inlandRatio = 0.75

        // Cyclones sleep as small ground swirls until the player follows a
        // three-wisp trail in from the beach. The generous reset radius keeps
        // ordinary course corrections from wiping nearby progress.
        this.revealDistance = 85
        this.resetDistance = 110
        this.wispRadius = 2.6
        this.wispHeight = 1.8
        this.wispFlow = 0.06
        this.wispOffsets = [
            [18, - 4],
            [12, 4],
            [6, - 3]
        ]

        this.radius = 2.4
        this.height = 11
        this.launchVelocity = 48 // v²/56 ≈ 41m up — Elden Ring updraft, not a bounce pad
        this.airJumpCap = 15
        this.forwardCarry = 8
        this.launchCooldown = 1.5
        this.launchFlow = 0.35

        this.wanderRadiusMin = 3
        this.wanderRadiusMax = 7
        this.wanderSpeed = 0.12

        this.cyclones = new Map()
        this.awakenedCyclones = new Set()
        this.debugCycloneCount = 0

        this.setDebug()
    }

    getCycloneZ(k)
    {
        return - (this.firstOffset + k * this.interval)
    }

    createCyclone(k, z)
    {
        const random = new seedrandom(`cyclone:${k}`)

        const cyclone = {
            k,
            z,
            jitter: (random() - 0.5) * 6,
            phaseX: random() * Math.PI * 2,
            phaseZ: random() * Math.PI * 2,
            wanderRadius: this.wanderRadiusMin + random() * (this.wanderRadiusMax - this.wanderRadiusMin),
            speedRatio: 0.75 + random() * 0.5,
            position: [0, 0, 0],
            baseElevation: 0,
            lastLaunchTime: - 999,
            lastAwakenTime: - 999,
            phase: this.awakenedCyclones.has(k) ? 'awakened' : 'dormant',
            nextWisp: 0,
            wispSide: random() < 0.5 ? - 1 : 1,
            wisps: this.wispOffsets.map(() => ({
                position: [0, 0, 0],
                collected: false,
                collectTime: - 999
            })),
            built: false
        }

        this.cyclones.set(k, cyclone)

        return cyclone
    }

    updateCyclones(player)
    {
        const playerZ = player.position.current[2]
        const kMin = Math.max(0, Math.ceil((- playerZ - this.keepDistance - this.firstOffset) / this.interval))
        const kMax = Math.floor((- playerZ + this.keepDistance - this.firstOffset) / this.interval)

        for(let k = kMin; k <= kMax; k++)
        {
            if(!this.cyclones.has(k))
                this.createCyclone(k, this.getCycloneZ(k))
        }

        for(const cyclone of this.cyclones.values())
        {
            if(Math.abs(cyclone.z - playerZ) > this.keepDistance)
            {
                this.cyclones.delete(cyclone.k)
                continue
            }

            this.updateWander(cyclone)
        }
    }

    updateWander(cyclone)
    {
        const terrains = this.state.terrains
        const t = this.time.elapsed * this.wanderSpeed * cyclone.speedRatio

        const anchorZ = cyclone.z + Math.sin(t * 0.8 + cyclone.phaseZ) * cyclone.wanderRadius * 1.6
        const shoreX = terrains.getShoreX(anchorZ)

        // Anchor up in the foothills (mountains are -X of the shore), clamped
        // between the back of the beach and the mountain start so the
        // shoreline meander can never strand it in the water or the peaks
        const inland = terrains.corridor.mountainStartDistance * this.inlandRatio
        let x = shoreX - inland + cyclone.jitter
            + Math.cos(t + cyclone.phaseX) * cyclone.wanderRadius
        x = Math.min(
            Math.max(x, shoreX - terrains.corridor.mountainStartDistance),
            shoreX - terrains.corridor.beachWidth * 1.5
        )

        const elevation = this.state.chunks.getElevationForPosition(x, anchorZ)

        if(elevation !== false && Number.isFinite(elevation))
        {
            // Wet-sand drift may dip below the water plane; ride the surface
            cyclone.baseElevation = Math.max(elevation, 0)

            if(!cyclone.built)
            {
                cyclone.built = true
                this.events.emit('cycloneSpawn', cyclone)
            }
        }

        cyclone.position[0] = x
        cyclone.position[1] = cyclone.baseElevation
        cyclone.position[2] = anchorZ

        this.updateWisps(cyclone)
    }

    updateWisps(cyclone)
    {
        for(let i = 0; i < cyclone.wisps.length; i++)
        {
            const wisp = cyclone.wisps[i]
            const offset = this.wispOffsets[i]
            const x = cyclone.position[0] + offset[0]
            const z = cyclone.position[2] + offset[1] * cyclone.wispSide
            const elevation = this.state.chunks.getElevationForPosition(x, z)

            wisp.position[0] = x
            wisp.position[1] = (elevation !== false && Number.isFinite(elevation)
                ? Math.max(elevation, 0)
                : cyclone.baseElevation) + this.wispHeight
            wisp.position[2] = z
        }
    }

    resetChallenge(cyclone)
    {
        cyclone.phase = 'dormant'
        cyclone.nextWisp = 0

        for(const wisp of cyclone.wisps)
        {
            wisp.collected = false
            wisp.collectTime = - 999
        }
    }

    getPlayerDistance(cyclone, player)
    {
        return Math.hypot(
            player.position.current[0] - cyclone.position[0],
            player.position.current[2] - cyclone.position[2]
        )
    }

    updateChallenges(player)
    {
        for(const cyclone of this.cyclones.values())
        {
            if(!cyclone.built)
                continue

            const distance = this.getPlayerDistance(cyclone, player)

            if(cyclone.phase === 'spent')
            {
                if(distance > this.resetDistance)
                    this.resetChallenge(cyclone)

                continue
            }

            // An awakened landmark remains armed across despawn/rebuild until
            // the player eventually returns and rides it.
            if(cyclone.phase === 'awakened')
                continue

            if(distance > this.resetDistance)
            {
                if(cyclone.phase === 'collecting')
                    this.resetChallenge(cyclone)

                continue
            }

            if(cyclone.phase === 'dormant')
            {
                if(distance > this.revealDistance)
                    continue

                cyclone.phase = 'collecting'
            }

            const wisp = cyclone.wisps[cyclone.nextWisp]

            if(!wisp)
                continue

            const wispDistance = Math.hypot(
                player.position.current[0] - wisp.position[0],
                player.position.current[1] + 0.9 - wisp.position[1],
                player.position.current[2] - wisp.position[2]
            )

            if(wispDistance > this.wispRadius)
                continue

            wisp.collected = true
            wisp.collectTime = this.time.elapsed
            cyclone.nextWisp++
            player.addFlow(this.wispFlow)

            this.events.emit('cycloneWispCollect', {
                cyclone,
                wisp,
                index: cyclone.nextWisp,
                position: [...wisp.position]
            })

            if(cyclone.nextWisp === cyclone.wisps.length)
            {
                cyclone.phase = 'awakened'
                cyclone.lastAwakenTime = this.time.elapsed
                this.awakenedCyclones.add(cyclone.k)

                this.events.emit('cycloneAwaken', {
                    cyclone,
                    position: [...cyclone.position]
                })
            }
        }
    }

    updateLaunches(player)
    {
        const playerX = player.position.current[0]
        const playerY = player.position.current[1]
        const playerZ = player.position.current[2]

        for(const cyclone of this.cyclones.values())
        {
            if(!cyclone.built || cyclone.phase !== 'awakened' || Math.abs(cyclone.z - playerZ) > 60)
                continue

            if(this.time.elapsed - cyclone.lastLaunchTime < this.launchCooldown)
                continue

            // Works grounded or gliding low through the column, but not when
            // falling back through its top after the launch
            if(playerY < cyclone.position[1] - 1 || playerY > cyclone.position[1] + this.height * 0.7)
                continue

            if(Math.hypot(playerX - cyclone.position[0], playerZ - cyclone.position[2]) > this.radius)
                continue

            player.launchFromPad(this.launchVelocity)
            // Don't hand the air jump the cyclone's full power
            player.padJumpVelocity = Math.min(player.padJumpVelocity, this.airJumpCap)
            player.velocity[2] -= this.forwardCarry
            player.addFlow(this.launchFlow)
            cyclone.lastLaunchTime = this.time.elapsed
            cyclone.phase = 'spent'
            this.awakenedCyclones.delete(cyclone.k)

            this.events.emit('cycloneLaunch', {
                cyclone,
                position: [cyclone.position[0], cyclone.position[1], cyclone.position[2]],
                launchVelocity: this.launchVelocity
            })

            break
        }
    }

    update()
    {
        if(!this.enabled)
            return

        const player = this.state.player

        this.updateCyclones(player)
        this.updateChallenges(player)
        this.updateLaunches(player)
    }

    spawnDebugCyclone()
    {
        const player = this.state.player
        const cyclone = this.createCyclone(`debug:${this.debugCycloneCount++}`, player.position.current[2] - 40)
        this.updateWander(cyclone)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('state/cyclones')

        folder.add(this, 'enabled')
        folder.add(this, 'launchVelocity').min(10).max(70).step(0.5)
        folder.add(this, 'interval').min(400).max(4000).step(100)
        folder.add(this, 'inlandRatio').min(0.2).max(1).step(0.05)
        folder.add(this, 'revealDistance').min(30).max(160).step(5)
        folder.add(this, 'resetDistance').min(40).max(220).step(5)
        folder.add(this, 'wispRadius').min(1).max(6).step(0.1)
        folder.add(this, 'forwardCarry').min(0).max(20).step(0.5)
        folder.add(this, 'radius').min(1).max(6).step(0.1)
        folder.add(this, 'height').min(4).max(24).step(0.5)
        folder.add(this, 'wanderRadiusMax').min(0).max(20).step(0.5)
        folder.add(this, 'wanderSpeed').min(0).max(0.6).step(0.01)
        folder.add(this, 'launchFlow').min(0).max(1).step(0.05)
        folder.add({ spawn: () => this.spawnDebugCyclone() }, 'spawn')

        this.debug.ui.addQuickAction('🌪️ cyclone', () => this.spawnDebugCyclone())
    }
}
