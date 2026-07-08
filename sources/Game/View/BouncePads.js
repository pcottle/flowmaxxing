import * as THREE from 'three'

import State from '@/State/State.js'
import View from '@/View/View.js'

export default class BouncePads
{
    constructor()
    {
        this.state = State.getInstance()
        this.view = View.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene

        this.color = new THREE.Color()
        this.idleColor = new THREE.Color('#7af0c8')
        this.flashColor = new THREE.Color('#fff0a6')
        this.perfectColor = new THREE.Color('#ffd166')
        this.prizeColor = new THREE.Color('#ffd166')
        this.collectedColor = new THREE.Color('#8aa8bb')

        this.fadeNear = 200
        this.fadeFar = 260
        this.squashDuration = 0.35

        this.padGeometry = new THREE.CylinderGeometry(1, 1, 0.16, 24, 1).toNonIndexed()
        this.padGeometry.computeVertexNormals()
        this.prizeGeometry = new THREE.IcosahedronGeometry(0.9, 1).toNonIndexed()
        this.prizeGeometry.computeVertexNormals()

        this.pads = []
        this.prizes = []
    }

    createPadMesh()
    {
        const material = new THREE.MeshBasicMaterial({
            color: this.idleColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        const mesh = new THREE.Mesh(this.padGeometry, material)
        mesh.visible = false
        mesh.frustumCulled = false
        this.scene.add(mesh)

        const item = { mesh, lastBounceSeen: - 999 }
        this.pads.push(item)

        return item
    }

    createPrizeMesh()
    {
        const material = new THREE.MeshBasicMaterial({
            color: this.prizeColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        const mesh = new THREE.Mesh(this.prizeGeometry, material)
        mesh.visible = false
        mesh.frustumCulled = false
        this.scene.add(mesh)

        const item = { mesh }
        this.prizes.push(item)

        return item
    }

    getPadMesh(index)
    {
        while(this.pads.length <= index)
            this.createPadMesh()

        return this.pads[index]
    }

    getPrizeMesh(index)
    {
        while(this.prizes.length <= index)
            this.createPrizeMesh()

        return this.prizes[index]
    }

    updatePad(item, pad, fade)
    {
        const mesh = item.mesh
        const squashAge = this.time.elapsed - pad.lastBounceTime
        const squash = squashAge < this.squashDuration ? squashAge / this.squashDuration : 1

        mesh.visible = fade > 0.01
        mesh.position.set(pad.position[0], pad.position[1], pad.position[2])
        mesh.scale.set(
            pad.radius * (1 + 0.35 * (1 - squash)),
            0.4 + 0.6 * squash,
            pad.radius * (1 + 0.35 * (1 - squash))
        )

        const pulse = 1 + Math.sin(this.time.elapsed * 2 + pad.index * 0.7) * 0.05
        mesh.scale.x *= pulse
        mesh.scale.z *= pulse

        this.color.copy(this.idleColor)

        if(squash < 1)
            this.color.lerp(this.flashColor, 1 - squash)

        mesh.material.color.copy(this.color)
        mesh.material.opacity = fade * (0.55 + 0.25 * Math.sin(this.time.elapsed * 2 + pad.index * 0.7))
    }

    updatePrize(item, prize, fade)
    {
        const mesh = item.mesh
        let opacity = fade * 0.85

        if(prize.collected)
            opacity = prize.collectTime > 0
                ? fade * 0.85 * Math.max(0, 1 - (this.time.elapsed - prize.collectTime) / 0.45)
                : 0

        mesh.visible = opacity > 0.01
        mesh.position.set(
            prize.position[0],
            prize.position[1] + Math.sin(this.time.elapsed * 2.4) * 0.25,
            prize.position[2]
        )
        mesh.rotation.y = this.time.elapsed * 1.4
        mesh.rotation.x = Math.sin(this.time.elapsed * 0.9) * 0.3
        mesh.scale.setScalar(1 + Math.sin(this.time.elapsed * 5.2) * 0.08)
        mesh.material.color.copy(prize.collected ? this.collectedColor : this.prizeColor)
        mesh.material.opacity = opacity
    }

    update()
    {
        const bouncePads = this.state.bouncePads
        const player = this.state.player
        let padIndex = 0
        let prizeIndex = 0

        for(const tower of bouncePads.towers.values())
        {
            if(!tower.built)
                continue

            const distance = Math.hypot(
                player.position.current[0] - tower.pads[0].position[0],
                player.position.current[2] - tower.z
            )
            const fade = 1 - THREE.MathUtils.smoothstep(distance, this.fadeNear, this.fadeFar)

            for(const pad of tower.pads)
                this.updatePad(this.getPadMesh(padIndex++), pad, fade)

            this.updatePrize(this.getPrizeMesh(prizeIndex++), tower.prize, fade)
        }

        for(let i = padIndex; i < this.pads.length; i++)
            this.pads[i].mesh.visible = false

        for(let i = prizeIndex; i < this.prizes.length; i++)
            this.prizes[i].mesh.visible = false
    }
}
