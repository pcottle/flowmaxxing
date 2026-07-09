import EventsEmitter from 'events'
import seedrandom from 'seedrandom'

import Game from '@/Game.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class BouncePads
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.events = new EventsEmitter()

        this.enabled = true

        // Towers are deterministic landmarks: tower k always sits at the same
        // spot (seeded by its index), so despawn/rebuild while traveling is
        // idempotent — only collected prizes need to survive
        this.towerInterval = 420
        this.firstTowerOffset = 300
        this.keepDistance = 600
        this.padCountMin = 9
        this.padCountMax = 16
        this.padRadius = 2.6
        this.firstPadHeight = 1.3
        this.verticalGap = 3.2
        this.spiralRadius = 6
        this.spiralStep = 1.15
        this.forwardStep = 6

        // Tuning bounds: launchBase^2 / 56 must exceed verticalGap + 1 so every
        // gap is reachable, and (launchBase * jumpCutRatio)^2 / 56 must stay
        // under verticalGap so a cut bounce falls back onto the same pad
        this.launchBase = 19
        this.launchPerIndex = 0.5
        this.perfectBonusRatio = 1.12
        this.padCooldown = 0.35

        this.prizeHeight = 4.2
        this.prizeRadius = 2.4
        this.prizeFlow = 0.5
        this.bounceFlow = 0.06
        this.perfectFlow = 0.1

        this.towers = new Map()
        this.collectedPrizes = new Set()
        this.previousPlayerY = null
        this.debugTowerCount = 0

        this.setDebug()
    }

    getTowerZ(k)
    {
        return - (this.firstTowerOffset + k * this.towerInterval)
    }

    createTower(k, z)
    {
        const random = new seedrandom(`tower:${k}`)

        const tower = {
            k,
            z,
            phase: random() * Math.PI * 2,
            jitter: (random() - 0.5) * 6,
            padCount: this.padCountMin + Math.floor(random() * (this.padCountMax - this.padCountMin + 1)),
            endZ: z,
            built: false,
            pads: [],
            prize: null
        }

        this.towers.set(k, tower)

        return tower
    }

    buildTower(tower)
    {
        const terrains = this.state.terrains
        const chunks = this.state.chunks
        const x = terrains.getShoreX(tower.z) - terrains.corridor.beachWidth * 0.9 + tower.jitter
        const elevation = chunks.getElevationForPosition(x, tower.z)

        if(elevation === false || !Number.isFinite(elevation))
            return

        for(let i = 0; i < tower.padCount; i++)
        {
            // Spiral tightens toward the apex so the final bounces need less
            // travel, and the whole helix drifts down-beach so the climb keeps
            // carrying the run forward instead of circling in place
            const progress = i / Math.max(1, tower.padCount - 1)
            const radius = this.spiralRadius * (1 - progress * 0.4)
            const angle = tower.phase + i * this.spiralStep

            tower.pads.push({
                index: i,
                position: [
                    x + Math.cos(angle) * radius,
                    elevation + this.firstPadHeight + i * this.verticalGap,
                    tower.z - i * this.forwardStep + Math.sin(angle) * radius
                ],
                radius: this.padRadius,
                launchVelocity: this.launchBase + i * this.launchPerIndex,
                lastBounceTime: - 999
            })
        }

        const topPad = tower.pads[tower.pads.length - 1]
        tower.endZ = tower.z - (tower.padCount - 1) * this.forwardStep

        tower.prize = {
            position: [topPad.position[0], topPad.position[1] + this.prizeHeight, topPad.position[2]],
            collected: this.collectedPrizes.has(tower.k),
            collectTime: 0
        }

        tower.built = true
        this.events.emit('towerBuilt', tower)
    }

    updateTowers(player)
    {
        const playerZ = player.position.current[2]
        const kMin = Math.max(0, Math.ceil((- playerZ - this.keepDistance - this.firstTowerOffset) / this.towerInterval))
        const kMax = Math.floor((- playerZ + this.keepDistance - this.firstTowerOffset) / this.towerInterval)

        for(let k = kMin; k <= kMax; k++)
        {
            if(!this.towers.has(k))
                this.createTower(k, this.getTowerZ(k))
        }

        for(const tower of this.towers.values())
        {
            if(Math.abs(tower.z - playerZ) > this.keepDistance)
            {
                this.towers.delete(tower.k)
                continue
            }

            if(!tower.built)
                this.buildTower(tower)
        }
    }

    updateBounces(player)
    {
        const playerX = player.position.current[0]
        const playerY = player.position.current[1]
        const playerZ = player.position.current[2]

        for(const tower of this.towers.values())
        {
            // The helix drifts forward, so gate on the tower's full z span
            // rather than its base — tall towers end far down-beach
            if(!tower.built || playerZ > tower.z + 60 || playerZ < tower.endZ - 60)
                continue

            if(player.velocity[1] < 0 && this.previousPlayerY !== null)
            {
                for(const pad of tower.pads)
                {
                    if(this.time.elapsed - pad.lastBounceTime < this.padCooldown)
                        continue

                    // Plane crossing (not proximity) so no frame rate can tunnel through
                    if(this.previousPlayerY < pad.position[1] || playerY >= pad.position[1])
                        continue

                    if(Math.hypot(playerX - pad.position[0], playerZ - pad.position[2]) > pad.radius)
                        continue

                    const perfect = this.state.controls.keys.down.jump

                    player.position.current[1] = pad.position[1]
                    player.launchFromPad(pad.launchVelocity * (perfect ? this.perfectBonusRatio : 1))
                    player.addFlow(perfect ? this.perfectFlow : this.bounceFlow)
                    pad.lastBounceTime = this.time.elapsed

                    this.events.emit('padBounce', {
                        tower,
                        pad,
                        index: pad.index,
                        perfect,
                        position: pad.position
                    })

                    break
                }
            }

            const prize = tower.prize

            if(!prize.collected)
            {
                const distance = Math.hypot(
                    playerX - prize.position[0],
                    playerY + 0.9 - prize.position[1],
                    playerZ - prize.position[2]
                )

                if(distance < this.prizeRadius)
                {
                    prize.collected = true
                    prize.collectTime = this.time.elapsed
                    this.collectedPrizes.add(tower.k)
                    player.refillJumpFromRing(null)
                    player.addFlow(this.prizeFlow)

                    this.events.emit('prizeCollect', {
                        tower,
                        position: prize.position
                    })
                }
            }
        }
    }

    update()
    {
        if(!this.enabled)
            return

        const player = this.state.player

        this.updateTowers(player)
        this.updateBounces(player)

        this.previousPlayerY = player.position.current[1]
    }

    spawnDebugTower()
    {
        const player = this.state.player
        const tower = this.createTower(`debug:${this.debugTowerCount++}`, player.position.current[2] - 60)
        this.buildTower(tower)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('state/bouncePads')

        folder.add(this, 'enabled')
        folder.add(this, 'padCountMin').min(3).max(20).step(1)
        folder.add(this, 'padCountMax').min(3).max(24).step(1)
        folder.add(this, 'launchBase').min(10).max(26).step(0.5)
        folder.add(this, 'launchPerIndex').min(0).max(2).step(0.05)
        folder.add(this, 'verticalGap').min(1.5).max(6).step(0.1)
        folder.add(this, 'forwardStep').min(0).max(10).step(0.5)
        folder.add(this, 'padRadius').min(1).max(5).step(0.1)
        folder.add(this, 'perfectBonusRatio').min(1).max(1.5).step(0.01)
        folder.add(this, 'prizeFlow').min(0).max(1).step(0.05)
        folder.add({ spawn: () => this.spawnDebugTower() }, 'spawn')
    }
}
