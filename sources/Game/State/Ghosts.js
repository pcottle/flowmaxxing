import State from './State.js'
import { track } from '@/Analytics.js'

export default class Ghosts
{
    constructor()
    {
        this.state = State.getInstance()
        this.time = this.state.time

        // Presence is published only inside a circle around the beach spawn.
        // Hysteresis so a player skirting the edge doesn't flap join/leave.
        this.center = null
        this.radius = 40
        this.exitRadius = 48
        this.inside = false

        // Adapter is injected from the browser entry (sources/index.js) once
        // firebase loads — with no adapter this module is a no-op publisher,
        // which keeps the headless harness free of network code
        this.adapter = null
        this.peers = new Map()

        this.emoji = ''
        this.emojiSentAt = 0
        this.jumpedAt = 0

        this.publishInterval = 1 / 6
        this.heartbeatInterval = 30
        this.staleAfter = 300000
        this.smoothRate = 8

        this.lastPublishTime = - Infinity
        this.lastPublished = null

        this.state.player.events.on('jump', () =>
        {
            this.jumpedAt = Date.now()
        })
    }

    setAdapter(adapter)
    {
        this.adapter = adapter
        adapter.onPeers((raw, serverNow) => this.ingest(raw, serverNow))
    }

    setEmoji(emoji)
    {
        // Emojis are transient: the timestamp both re-triggers the display on
        // repeat sends and lets everyone (self included) expire it locally
        this.emoji = emoji
        this.emojiSentAt = Date.now()
    }

    ensureCenter()
    {
        if(this.center)
            return true

        const terrains = this.state.terrains

        if(!terrains)
            return false

        // The player spawn point (see State/Player.js spawn logic)
        this.center = {
            x: terrains.getShoreX(1) - terrains.corridor.beachWidth * 0.7,
            z: 1
        }

        return true
    }

    ingest(raw, serverNow)
    {
        const seen = new Set()

        for(const uid in raw)
        {
            if(this.adapter && uid === this.adapter.uid)
                continue

            const data = raw[uid]

            if(!data || typeof data.t !== 'number' || typeof data.x !== 'number')
                continue

            if(serverNow - data.t > this.staleAfter)
                continue

            // Peers self-remove on leaving the circle; this only hides edge cases
            if(this.ensureCenter())
            {
                const distance = Math.hypot(data.x - this.center.x, data.z - this.center.z)

                if(distance > this.radius * 1.25)
                    continue
            }

            seen.add(uid)

            let peer = this.peers.get(uid)

            if(!peer)
            {
                // Snap to the first reported position so ghosts don't fly in
                peer = { cur: { x: data.x, y: data.y, z: data.z, r: data.r }, fade: 0 }
                this.peers.set(uid, peer)
            }

            peer.x = data.x
            peer.y = data.y
            peer.z = data.z
            peer.r = data.r
            peer.j = data.j || 0
            peer.e = typeof data.e === 'string' ? data.e : ''
            peer.es = typeof data.es === 'number' ? data.es : 0
        }

        for(const uid of this.peers.keys())
        {
            if(!seen.has(uid))
                this.peers.delete(uid)
        }
    }

    update()
    {
        this.updatePublish()
        this.updatePeers()
    }

    updatePublish()
    {
        const player = this.state.player

        if(!this.adapter || !player.spawned || !this.ensureCenter())
            return

        const x = player.position.current[0]
        const y = player.position.current[1]
        const z = player.position.current[2]
        const distance = Math.hypot(x - this.center.x, z - this.center.z)

        if(!this.inside && distance < this.radius)
        {
            this.inside = true
            this.lastPublished = null
            track('beach_join', { peers: this.peers.size })
        }
        else if(this.inside && distance > this.exitRadius)
        {
            this.inside = false
            this.lastPublished = null
            this.adapter.leave()
        }

        if(!this.inside)
            return

        if(this.time.elapsed - this.lastPublishTime < this.publishInterval)
            return

        const payload = {
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 100) / 100,
            z: Math.round(z * 10) / 10,
            r: Math.round(player.rotation * 100) / 100,
            j: this.jumpedAt,
            e: this.emoji,
            es: this.emojiSentAt
        }

        const last = this.lastPublished
        const heartbeatDue = this.time.elapsed - this.lastPublishTime > this.heartbeatInterval
        const changed = !last
            || Math.abs(payload.x - last.x) > 0.05
            || Math.abs(payload.y - last.y) > 0.05
            || Math.abs(payload.z - last.z) > 0.05
            || Math.abs(payload.r - last.r) > 0.02
            || payload.j !== last.j
            || payload.es !== last.es

        if(!changed && !heartbeatDue)
            return

        this.lastPublishTime = this.time.elapsed
        this.lastPublished = payload
        this.adapter.publish(payload)
    }

    updatePeers()
    {
        const rate = 1 - Math.exp(- this.smoothRate * this.time.delta)

        for(const peer of this.peers.values())
        {
            peer.cur.x += (peer.x - peer.cur.x) * rate
            peer.cur.y += (peer.y - peer.cur.y) * rate
            peer.cur.z += (peer.z - peer.cur.z) * rate

            let rotationDelta = peer.r - peer.cur.r
            rotationDelta = ((rotationDelta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
            peer.cur.r += rotationDelta * rate

            // Ghosts fade toward the edge of the circle: fully visible well
            // inside, gone by the exit radius
            if(this.center)
            {
                const fadeStart = this.radius * 0.7
                const distance = Math.hypot(peer.x - this.center.x, peer.z - this.center.z)
                peer.fade = Math.min(Math.max((this.exitRadius - distance) / (this.exitRadius - fadeStart), 0), 1)
            }
        }
    }
}
