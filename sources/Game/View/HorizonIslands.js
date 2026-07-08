import * as THREE from 'three'
import seedrandom from 'seedrandom'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class HorizonIslands
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene

        // Islands must fade fully out before the water plane edge
        // (the ocean mesh only spans playerZ ± 1000)
        this.interval = 480
        this.firstOffset = 150
        this.keepDistance = 900
        this.fadeNear = 650
        this.fadeFar = 850
        this.xOffsetMin = 620
        this.xOffsetMax = 880
        this.skipRatio = 0.35
        this.baseOpacity = 0.9

        this.dayColor = new THREE.Color('#a8cfd2')
        this.nightColor = new THREE.Color('#0d3050')
        this.stormColor = new THREE.Color('#5f6d78')
        this.dawnColor = new THREE.Color('#c48a7a')
        this.color = new THREE.Color()

        this.islands = new Map()
        this.meshPool = []

        this.setVariants()
        this.setDebug()
    }

    setVariants()
    {
        // Faceted silhouette clusters; every cone gets a 3m below-waterline
        // skirt so wave displacement never opens a gap at the base
        const cone = (radius, height, segments, x, z, squashX = 1) =>
        {
            const geometry = new THREE.ConeGeometry(radius, height + 3, segments)
            geometry.translate(0, (height + 3) * 0.5 - 3, 0)
            geometry.scale(squashX, 1, 1)
            geometry.translate(x, 0, z)
            return geometry
        }

        const merge = (geometries) =>
        {
            // Manual merge (positions only) keeps us off extra imports;
            // MeshBasicMaterial needs no normals or uvs
            let vertexCount = 0

            for(const geometry of geometries)
                vertexCount += geometry.toNonIndexed().attributes.position.count

            const positions = new Float32Array(vertexCount * 3)
            let offset = 0

            for(const geometry of geometries)
            {
                const nonIndexed = geometry.toNonIndexed()
                positions.set(nonIndexed.attributes.position.array, offset)
                offset += nonIndexed.attributes.position.array.length
                geometry.dispose()
            }

            const merged = new THREE.BufferGeometry()
            merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
            return merged
        }

        // Only low atolls read well at this distance (taller shapes looked bad)
        this.variants = [
            merge([cone(0.55, 0.28, 7, 0, 0, 2.6), cone(0.3, 0.4, 6, - 1, 0.1)]),
            merge([cone(0.6, 0.22, 7, 0.2, 0, 3.1), cone(0.35, 0.3, 6, - 1.2, 0.15), cone(0.25, 0.24, 6, 1.5, - 0.1)])
        ]
    }

    createIsland(k)
    {
        const random = new seedrandom(`island:${k}`)
        const z = - (this.firstOffset + k * this.interval) + (random() - 0.5) * this.interval * 0.5

        if(random() < this.skipRatio)
        {
            this.islands.set(k, { skip: true, z })
            return
        }

        const x = this.state.terrains.getShoreX(z)
            + this.xOffsetMin + random() * (this.xOffsetMax - this.xOffsetMin)
        const scale = 14 + random() * 26
        const stretch = 0.8 + random() * 1.6
        const variant = Math.floor(random() * this.variants.length)

        const mesh = this.meshPool.pop() ?? new THREE.Mesh(
            this.variants[0],
            new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
        )
        mesh.geometry = this.variants[variant]
        mesh.position.set(x, 0, z)
        mesh.scale.set(scale * stretch, scale, scale * stretch)
        mesh.rotation.y = random() * Math.PI * 2
        mesh.frustumCulled = false
        this.scene.add(mesh)

        this.islands.set(k, { skip: false, z, mesh })
    }

    releaseIsland(island)
    {
        if(island.mesh)
        {
            this.scene.remove(island.mesh)
            this.meshPool.push(island.mesh)
        }
    }

    regenerate()
    {
        for(const island of this.islands.values())
            this.releaseIsland(island)

        this.islands.clear()
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/horizonIslands')

        folder.add(this, 'interval').min(150).max(1200).step(10).onChange(() => { this.regenerate() })
        folder.add(this, 'xOffsetMin').min(300).max(1200).step(10).onChange(() => { this.regenerate() })
        folder.add(this, 'xOffsetMax').min(300).max(1400).step(10).onChange(() => { this.regenerate() })
        folder.add(this, 'skipRatio').min(0).max(0.9).step(0.05).onChange(() => { this.regenerate() })
        folder.add(this, 'baseOpacity').min(0).max(1).step(0.05)
        folder.add(this, 'fadeNear').min(200).max(900).step(10)
        folder.add(this, 'fadeFar').min(250).max(950).step(10)
        folder.addColor(this, 'dayColor')
        folder.addColor(this, 'nightColor')
        folder.addColor(this, 'stormColor')
        folder.addColor(this, 'dawnColor')
        folder.add({ regenerate: () => { this.regenerate() } }, 'regenerate')
    }

    update()
    {
        const playerZ = this.state.player.position.current[2]
        const kMin = Math.max(0, Math.ceil((- playerZ - this.keepDistance - this.firstOffset) / this.interval))
        const kMax = Math.floor((- playerZ + this.keepDistance - this.firstOffset) / this.interval)

        for(let k = kMin; k <= kMax; k++)
        {
            if(!this.islands.has(k))
                this.createIsland(k)
        }

        // Shared palette: hazy horizon color tracking day / dawn / storm
        const sunY = this.state.sun.position.y
        const day = THREE.MathUtils.smoothstep(sunY, - 0.25, 0.1)
        const dawn = Math.max(0, 1 - Math.abs(sunY) * 8) * 0.35

        this.color.copy(this.nightColor).lerp(this.dayColor, day)
        this.color.lerp(this.dawnColor, dawn)
        this.color.lerp(this.stormColor, this.state.weather.rainIntensity)

        for(const [k, island] of this.islands)
        {
            const distance = Math.abs(island.z - playerZ)

            if(distance > this.keepDistance)
            {
                this.releaseIsland(island)
                this.islands.delete(k)
                continue
            }

            if(island.skip)
                continue

            const opacity = this.baseOpacity * (1 - THREE.MathUtils.smoothstep(distance, this.fadeNear, this.fadeFar))
            island.mesh.visible = opacity > 0.01
            island.mesh.material.opacity = opacity
            island.mesh.material.color.copy(this.color)
        }
    }
}
