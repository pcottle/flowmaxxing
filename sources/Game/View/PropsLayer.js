import * as THREE from 'three'
import seedrandom from 'seedrandom'

import Game from '@/Game.js'
import State from '@/State/State.js'
import View from '@/View/View.js'

/**
 * One scattered prop type as a single InstancedMesh.
 *
 * Placement is deterministic from (seed, layer name, world-space row index) —
 * independent of chunk LOD, so props never pop or move when chunks split.
 * Ground height comes from the same interpolated worker elevations the player
 * physics uses, so props sit exactly on the visible terrain.
 */
export default class PropsLayer
{
    constructor(options)
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()

        this.options = options

        this.mesh = new THREE.InstancedMesh(options.geometry, options.material, options.capacity)
        this.mesh.count = 0
        this.mesh.frustumCulled = false
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

        this.dummy = new THREE.Object3D()
        this.tintColor = new THREE.Color()

        this.lastRebuildX = Infinity
        this.lastRebuildZ = Infinity
        this.dirty = true
        this.retryTimer = 0

        this.view.scene.add(this.mesh)
    }

    update()
    {
        const playerPosition = this.state.player.position.current

        this.retryTimer -= this.state.time.delta

        const moved = Math.hypot(
            playerPosition[0] - this.lastRebuildX,
            playerPosition[2] - this.lastRebuildZ
        ) > this.options.rowSize

        if(moved || (this.dirty && this.retryTimer <= 0))
            this.rebuild()
    }

    rebuild()
    {
        const options = this.options
        const terrains = this.state.terrains
        const chunks = this.state.chunks
        const playerPosition = this.state.player.position.current

        this.lastRebuildX = playerPosition[0]
        this.lastRebuildZ = playerPosition[2]
        this.dirty = false
        this.retryTimer = 0.3

        const rowMin = Math.floor((playerPosition[2] - options.radius) / options.rowSize)
        const rowMax = Math.floor((playerPosition[2] + options.radius) / options.rowSize)

        let index = 0

        for(let row = rowMin; row <= rowMax && index < options.capacity; row++)
        {
            const rng = new seedrandom(`${this.game.seed}:props:${options.name}:${row}`)

            for(let k = 0; k < options.perRow && index < options.capacity; k++)
            {
                // Fixed draw count per candidate: skips never shift the stream,
                // so the same props appear at the same spots every visit
                const r = [rng(), rng(), rng(), rng(), rng(), rng(), rng(), rng()]

                if(r[0] > options.probability)
                    continue

                const z = (row + r[1]) * options.rowSize
                const inland = options.inlandMin + r[2] * (options.inlandMax - options.inlandMin)
                const x = terrains.getShoreX(z) - inland

                if(options.biomeDensity)
                {
                    const weights = terrains.getBiomeWeights(z)

                    if(r[3] > options.biomeDensity(weights))
                        continue
                }

                const y = chunks.getElevationForPosition(x, z)

                if(y === false || !Number.isFinite(y))
                {
                    // Chunk not ready — retry the whole layer shortly
                    this.dirty = true
                    continue
                }

                if(y < options.minElevation || y > options.maxElevation)
                    continue

                if(options.slopeMax)
                {
                    const yAhead = chunks.getElevationForPosition(x + 1.5, z)

                    if(yAhead !== false && Math.abs(yAhead - y) > options.slopeMax)
                        continue
                }

                options.composeTransform(this.dummy, r, x, y, z)
                this.dummy.updateMatrix()
                this.mesh.setMatrixAt(index, this.dummy.matrix)

                if(options.tint)
                {
                    options.tint(this.tintColor, r)
                    this.mesh.setColorAt(index, this.tintColor)
                }

                index++
            }
        }

        this.mesh.count = index
        this.mesh.instanceMatrix.needsUpdate = true

        if(this.mesh.instanceColor)
            this.mesh.instanceColor.needsUpdate = true
    }
}
