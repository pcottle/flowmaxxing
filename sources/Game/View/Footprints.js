import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class Footprints
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene

        this.count = 48
        this.index = 0
        this.spacing = 0.8
        this.life = 6
        this.printLength = 0.2
        this.printWidth = 0.14
        this.lift = 0.03
        this.sideOffset = 0.12
        this.darkness = 0.5

        this.side = 1
        this.travelAccum = 0
        this.lastX = 0
        this.lastZ = 0
        this.stampColor = new THREE.Color()

        this.dummy = new THREE.Object3D()
        this.dummy.rotation.reorder('YXZ')

        this.setMesh()
        this.setPool()
        this.setDebug()
    }

    setMesh()
    {
        // Octagonal disc: the subtly polygonal edge is the toon tell.
        // Ellipse shape comes from the per-stamp scale
        this.geometry = new THREE.CircleGeometry(1, 8)
        this.geometry.rotateX(- Math.PI * 0.5)

        this.material = new THREE.MeshBasicMaterial({
            polygonOffset: true,
            polygonOffsetFactor: - 1,
            polygonOffsetUnits: - 1
        })

        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.count)
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.mesh.frustumCulled = false

        // Park all slots and touch every instance color so the buffer exists
        this.dummy.scale.setScalar(0)
        this.dummy.updateMatrix()
        this.stampColor.set('#ffffff')

        for(let i = 0; i < this.count; i++)
        {
            this.mesh.setMatrixAt(i, this.dummy.matrix)
            this.mesh.setColorAt(i, this.stampColor)
        }

        this.mesh.instanceColor.needsUpdate = true
        this.scene.add(this.mesh)
    }

    setPool()
    {
        this.pool = []

        for(let i = 0; i < this.count; i++)
            this.pool.push({ birth: - 9999, x: 0, y: 0, z: 0, yaw: 0, dead: true })
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/footprints')

        folder.add(this, 'spacing').min(0.3).max(2).step(0.05)
        folder.add(this, 'life').min(2).max(15).step(0.5)
        folder.add(this, 'printLength').min(0.05).max(0.5).step(0.01)
        folder.add(this, 'printWidth').min(0.05).max(0.5).step(0.01)
        folder.add(this, 'lift').min(0).max(0.15).step(0.005)
        folder.add(this, 'sideOffset').min(0).max(0.4).step(0.01)
        folder.add(this, 'darkness').min(0.3).max(0.8).step(0.05)
        folder.add({ clearAll: () => { this.clearAll() } }, 'clearAll')
        folder.add({ stampBurst: () => { this.stampBurst() } }, 'stampBurst')
    }

    clearAll()
    {
        for(const slot of this.pool)
        {
            slot.birth = - 9999
            slot.dead = false // let the fade loop zero it once
        }
    }

    stampBurst()
    {
        // Test arc around the player, ignoring the gates — for shape tuning
        const playerState = this.state.player

        for(let i = 0; i < 12; i++)
        {
            const angle = (i / 12) * Math.PI * 2
            this.stamp(
                playerState.position.current[0] + Math.sin(angle) * 2.5,
                playerState.position.current[2] + Math.cos(angle) * 2.5,
                angle + Math.PI * 0.5
            )
        }
    }

    getSandColor(target, z)
    {
        // Biome-blended sand so prints stay darker-than-ground on every sand
        // color (a fixed dark golden would read LIGHT on volcanic black sand)
        const sample = this.state.terrains.getCorridorSample(z)
        const biomes = this.state.terrains.biomes
        const wGolden = Math.max(0, 1 - sample.wVolcanic - sample.wSavanna)

        target.setRGB(
            biomes[0].colors.sand[0] * wGolden + biomes[1].colors.sand[0] * sample.wVolcanic + biomes[2].colors.sand[0] * sample.wSavanna,
            biomes[0].colors.sand[1] * wGolden + biomes[1].colors.sand[1] * sample.wVolcanic + biomes[2].colors.sand[1] * sample.wSavanna,
            biomes[0].colors.sand[2] * wGolden + biomes[1].colors.sand[2] * sample.wVolcanic + biomes[2].colors.sand[2] * sample.wSavanna
        )
        target.multiplyScalar(this.darkness)

        return target
    }

    stamp(x, z, yaw)
    {
        const elevation = this.state.chunks.getElevationForPosition(x, z)

        if(elevation === false || !Number.isFinite(elevation))
            return false

        const slot = this.pool[this.index]
        slot.x = x
        slot.y = elevation + this.lift
        slot.z = z
        slot.yaw = yaw
        slot.birth = this.time.elapsed
        slot.dead = false

        this.mesh.setColorAt(this.index, this.getSandColor(this.stampColor, z))
        this.mesh.instanceColor.needsUpdate = true

        this.index = (this.index + 1) % this.count

        return true
    }

    update()
    {
        const playerState = this.state.player
        const waveSets = this.state.waveSets
        const elapsed = this.time.elapsed

        const px = playerState.position.current[0]
        const py = playerState.position.current[1]
        const pz = playerState.position.current[2]

        // Stamp only while running on the wet band near the waterline
        const wetTarget = Math.max(waveSets.wetLineE, this.state.weather.rainIntensity * 2.5)
        const shoreDistance = this.state.terrains.getShoreX(pz) - px
        const stamping = playerState.grounded
            && !playerState.swimming
            && playerState.horizontalSpeed > 2
            && py > 0.02 && py < wetTarget + 0.3
            && shoreDistance > 0 && shoreDistance < 10

        if(stamping)
        {
            this.travelAccum += Math.hypot(px - this.lastX, pz - this.lastZ)

            if(this.travelAccum >= this.spacing)
            {
                const yaw = Math.atan2(playerState.velocity[0], playerState.velocity[2])
                this.side = - this.side
                const offsetX = Math.cos(yaw) * this.sideOffset * this.side
                const offsetZ = - Math.sin(yaw) * this.sideOffset * this.side

                if(this.stamp(px + offsetX, pz + offsetZ, yaw))
                    this.travelAccum -= this.spacing
            }
        }
        else
        {
            this.travelAccum = 0
        }

        this.lastX = px
        this.lastZ = pz

        // Hold, then pop away
        for(let i = 0; i < this.count; i++)
        {
            const slot = this.pool[i]

            if(slot.dead)
                continue

            const progress = (elapsed - slot.birth) / this.life
            let shrink = 1

            if(progress >= 1)
            {
                slot.dead = true
                shrink = 0
            }
            else if(progress > 0.7)
            {
                shrink = 1 - (progress - 0.7) / 0.3
            }

            this.dummy.position.set(slot.x, slot.y, slot.z)
            this.dummy.rotation.set(0, slot.yaw, 0)
            this.dummy.scale.set(this.printWidth * shrink, 1, this.printLength * shrink)
            this.dummy.updateMatrix()
            this.mesh.setMatrixAt(i, this.dummy.matrix)
        }

        this.mesh.instanceMatrix.needsUpdate = true

        // Day/night tint rides material.color (multiplies the instance colors)
        const day = THREE.MathUtils.smoothstep(this.state.sun.position.y, - 0.2, 0.25)
        const tint = 0.4 + 0.6 * day
        this.material.color.setRGB(tint, tint, tint * 1.08)
    }
}
