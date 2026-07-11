import * as THREE from 'three'

import View from '@/View/View.js'
import State from '@/State/State.js'

// One CanvasTexture per emoji, shared across all sprites, never disposed
// (the picker offers a handful of emojis, so the cache stays tiny)
const emojiTextures = new Map()

function getEmojiTexture(emoji)
{
    let texture = emojiTextures.get(emoji)

    if(!texture)
    {
        const canvas = document.createElement('canvas')
        canvas.width = 128
        canvas.height = 128

        const context = canvas.getContext('2d')
        context.font = '96px serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(emoji, 64, 70)

        texture = new THREE.CanvasTexture(canvas)
        emojiTextures.set(emoji, texture)
    }

    return texture
}

export default class Ghosts
{
    constructor()
    {
        this.state = State.getInstance()
        this.view = View.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene

        this.baseHeight = 0.5
        this.baseOpacity = 0.22
        this.idleSpinSpeed = 0.6
        this.jumpDuration = 0.45
        this.jumpHeight = 1

        // Emojis show briefly then expire, easing out at the end
        this.emojiDuration = 4
        this.emojiFadeTail = 0.8

        // Same faceted cone as the player wisp (View/Player.js), shared by
        // every ghost; materials are per-ghost so each can fade independently
        let geometry = new THREE.ConeGeometry(0.7, 1.8, 8, 1)
        geometry = geometry.toNonIndexed()
        geometry.computeVertexNormals()
        geometry.translate(0, 0.9, 0)
        this.geometry = geometry

        this.ghosts = new Map()

        // Your own emoji rides the player group so you see what you sent
        this.ownSprite = this.createEmojiSprite()
        this.ownSprite.position.y = 2.8
        this.view.player.group.add(this.ownSprite)
        this.ownEmojiSentAt = 0
        this.ownEmojiT = Infinity
    }

    createEmojiSprite()
    {
        const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false })
        const sprite = new THREE.Sprite(material)
        sprite.scale.set(1.1, 1.1, 1.1)
        sprite.visible = false

        return sprite
    }

    // 1 for most of the display window, easing to 0 over the tail
    emojiWindowOpacity(t)
    {
        if(t >= this.emojiDuration)
            return 0

        return Math.min((this.emojiDuration - t) / this.emojiFadeTail, 1)
    }

    createGhost(peer)
    {
        const group = new THREE.Group()

        const material = new THREE.MeshBasicMaterial({
            color: '#fff8d6',
            transparent: true,
            opacity: this.baseOpacity,
            depthWrite: false
        })

        const mesh = new THREE.Mesh(this.geometry, material)
        mesh.position.y = this.baseHeight
        group.add(mesh)

        const sprite = this.createEmojiSprite()
        sprite.position.y = 2.8
        group.add(sprite)

        this.scene.add(group)

        return {
            group,
            mesh,
            sprite,
            lastJ: peer.j,
            jumpT: 1,
            // Start from the current es so a stale emoji doesn't replay on join
            lastEs: peer.es,
            emojiT: Infinity
        }
    }

    update()
    {
        const peers = this.state.ghosts.peers

        for(const [uid, peer] of peers)
        {
            let ghost = this.ghosts.get(uid)

            if(!ghost)
            {
                ghost = this.createGhost(peer)
                this.ghosts.set(uid, ghost)
            }

            this.updateGhost(ghost, peer)
        }

        for(const [uid, ghost] of this.ghosts)
        {
            if(!peers.has(uid))
            {
                // Geometry and emoji textures are shared; materials are per-ghost
                this.scene.remove(ghost.group)
                ghost.mesh.material.dispose()
                ghost.sprite.material.dispose()
                this.ghosts.delete(uid)
            }
        }

        this.updateOwnEmoji()
    }

    updateOwnEmoji()
    {
        const ghostsState = this.state.ghosts

        if(ghostsState.emojiSentAt !== this.ownEmojiSentAt)
        {
            this.ownEmojiSentAt = ghostsState.emojiSentAt
            this.ownEmojiT = 0
            this.ownSprite.material.map = getEmojiTexture(ghostsState.emoji)
            this.ownSprite.material.needsUpdate = true
        }

        this.ownEmojiT += this.time.delta
        this.ownSprite.visible = this.ownEmojiT < this.emojiDuration
        this.ownSprite.material.opacity = this.emojiWindowOpacity(this.ownEmojiT)
    }

    updateGhost(ghost, peer)
    {
        const fade = peer.fade ?? 1

        ghost.group.visible = fade > 0.01
        ghost.mesh.material.opacity = this.baseOpacity * fade

        ghost.group.position.set(peer.cur.x, peer.cur.y, peer.cur.z)
        ghost.mesh.rotation.y = peer.cur.r + this.time.elapsed * this.idleSpinSpeed

        // Cosmetic hop replay when the peer's jumpedAt changes (their real
        // airborne y still arrives through position updates)
        if(peer.j !== ghost.lastJ)
        {
            ghost.lastJ = peer.j
            ghost.jumpT = 0
        }

        let hop = 0
        let stretch = 0

        if(ghost.jumpT < 1)
        {
            ghost.jumpT = Math.min(ghost.jumpT + this.time.delta / this.jumpDuration, 1)
            const arc = Math.sin(ghost.jumpT * Math.PI)
            hop = arc * this.jumpHeight
            stretch = arc * 0.2
        }

        ghost.mesh.position.y = this.baseHeight + hop
        ghost.mesh.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5)

        // Transient emoji: a fresh send timestamp opens the display window
        if(peer.es !== ghost.lastEs)
        {
            ghost.lastEs = peer.es
            ghost.emojiT = 0

            if(peer.e !== '')
            {
                ghost.sprite.material.map = getEmojiTexture(peer.e)
                ghost.sprite.material.needsUpdate = true
            }
        }

        ghost.emojiT += this.time.delta
        ghost.sprite.visible = peer.e !== '' && ghost.emojiT < this.emojiDuration
        ghost.sprite.material.opacity = fade * this.emojiWindowOpacity(ghost.emojiT)
        ghost.sprite.position.y = 2.8 + hop
    }
}
