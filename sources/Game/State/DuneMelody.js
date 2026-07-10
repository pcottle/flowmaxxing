import EventsEmitter from 'events'
import { vec3 } from 'gl-matrix'

import Game from '@/Game.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import { duneMelodyConfig, getDuneMelodyFieldZ, getDuneMelodyFieldSpanZ, buildDuneMelodyField } from '@/Workers/DuneMelodyLayout.js'

export default class DuneMelody
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.events = new EventsEmitter()

        this.enabled = true

        // Fields are deterministic landmarks like the bounce towers: field k
        // always sits at the same spot, and the terrain worker sculpts the
        // matching moguls from the same shared layout (DuneMelodyLayout.js)
        this.keepDistance = 500
        this.fieldMarginZ = 12
        this.fieldHalfWidth = 24
        this.notesRequired = 6
        this.minNoteBonus = 0.3
        this.minNoteImpact = 5
        this.noteFlow = 0.08
        this.prizeHeight = 2.8
        this.prizeRadius = 2.5
        this.prizeFlow = 0.55

        this.fields = new Map()
        this.collectedPrizes = new Set()

        const player = this.state.player

        player.events.on('butterLand', (bonus) =>
        {
            this.onLanding(bonus >= this.minNoteBonus, false)
        })

        player.events.on('bounce', (impactSpeed) =>
        {
            this.onLanding(impactSpeed >= this.minNoteImpact, true)
        })

        this.setDebug()
    }

    createField(k)
    {
        const terrains = this.state.terrains
        const layout = buildDuneMelodyField(k, (z) => terrains.getShoreX(z))

        const field = {
            ...layout,
            built: false,
            notes: 0,
            lastNoteZ: layout.startZ + 999,
            lastNoteTime: - 999,
            prize: null
        }

        this.fields.set(k, field)

        return field
    }

    buildField(field)
    {
        const chunks = this.state.chunks

        for(const mogul of field.moguls)
        {
            // Crest elevation includes the sculpted bump once the chunk is baked
            const elevation = chunks.getElevationForPosition(mogul.x, mogul.z)

            if(elevation === false || !Number.isFinite(elevation))
                return

            mogul.crestY = elevation
        }

        const finalMogul = field.moguls[field.moguls.length - 1]

        field.prize = {
            position: vec3.fromValues(finalMogul.x, finalMogul.crestY + this.prizeHeight, finalMogul.z),
            collected: this.collectedPrizes.has(field.k),
            collectTime: 0
        }

        field.built = true
        this.events.emit('fieldBuilt', field)
    }

    updateFields(player)
    {
        const config = duneMelodyConfig
        const playerZ = player.position.current[2]
        const kMin = Math.max(0, Math.ceil((- playerZ - this.keepDistance - config.firstOffset) / config.interval))
        const kMax = Math.floor((- playerZ + this.keepDistance - config.firstOffset) / config.interval)

        for(let k = kMin; k <= kMax; k++)
        {
            if(!this.fields.has(k))
                this.createField(k)
        }

        for(const field of this.fields.values())
        {
            if(Math.abs(field.startZ - playerZ) > this.keepDistance + getDuneMelodyFieldSpanZ())
            {
                this.fields.delete(field.k)
                continue
            }

            if(!field.built)
                this.buildField(field)
        }
    }

    getActiveField(player)
    {
        const playerX = player.position.current[0]
        const playerZ = player.position.current[2]

        for(const field of this.fields.values())
        {
            if(!field.built)
                continue

            if(playerZ > field.startZ + this.fieldMarginZ || playerZ < field.endZ - this.fieldMarginZ)
                continue

            if(Math.abs(playerX - field.centerX) > this.fieldHalfWidth)
                continue

            return field
        }

        return null
    }

    onLanding(qualifies, bounceHop)
    {
        if(!this.enabled || !qualifies)
            return

        const player = this.state.player
        const field = this.getActiveField(player)

        if(!field)
            return

        // A butter landing rolling into a bounce hop is one landing, one note
        if(this.time.elapsed === field.lastNoteTime)
            return

        const playerZ = player.position.current[2]

        // Each note needs real progress down the field — no hopping in place
        if(playerZ > field.lastNoteZ - duneMelodyConfig.mogulSpacing * 0.5)
            return

        field.lastNoteZ = playerZ
        field.lastNoteTime = this.time.elapsed
        field.notes++
        player.addFlow(this.noteFlow)

        this.events.emit('note', {
            field,
            index: field.notes,
            bounceHop,
            position: vec3.fromValues(
                player.position.current[0],
                player.position.current[1],
                playerZ
            )
        })
    }

    collectPrize(field, player)
    {
        const prize = field.prize

        prize.collected = true
        prize.collectTime = this.time.elapsed
        this.collectedPrizes.add(field.k)
        player.refillJumpFromRing(null)
        player.addFlow(this.prizeFlow)

        this.events.emit('prizeCollect', {
            field,
            position: prize.position
        })
    }

    isPrizeActive(field)
    {
        return field.built && !field.prize.collected && field.notes >= this.notesRequired
    }

    updateActive(player)
    {
        const playerZ = player.position.current[2]

        for(const field of this.fields.values())
        {
            if(!field.built)
                continue

            // Walking back past the first mogul re-arms the phrase for a re-run
            if(field.notes > 0 && playerZ > field.startZ + this.fieldMarginZ * 0.5)
            {
                field.notes = 0
                field.lastNoteZ = field.startZ + 999
            }

            if(this.isPrizeActive(field))
            {
                const prize = field.prize
                const distance = Math.hypot(
                    player.position.current[0] - prize.position[0],
                    player.position.current[1] + 0.9 - prize.position[1],
                    playerZ - prize.position[2]
                )

                if(distance < this.prizeRadius)
                    this.collectPrize(field, player)
            }
        }
    }

    overlapsField(x, z, margin = 0)
    {
        for(const field of this.fields.values())
        {
            for(const mogul of field.moguls)
            {
                if(Math.hypot(x - mogul.x, z - mogul.z) < mogul.radius * 2 + margin)
                    return true
            }
        }

        return false
    }

    update()
    {
        if(!this.enabled)
            return

        const player = this.state.player

        this.updateFields(player)
        this.updateActive(player)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('state/duneMelody')

        folder.add(this, 'enabled')
        folder.add(this, 'notesRequired').min(1).max(12).step(1)
        folder.add(this, 'minNoteBonus').min(0).max(2).step(0.05)
        folder.add(this, 'minNoteImpact').min(0).max(12).step(0.5)
        folder.add(this, 'noteFlow').min(0).max(0.3).step(0.01)
        folder.add(this, 'prizeFlow').min(0).max(1).step(0.05)
    }
}
