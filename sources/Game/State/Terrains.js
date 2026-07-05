import EventsEmitter from 'events'
import seedrandom from 'seedrandom'

import Game from '@/Game.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import TerrainWorker from '@/Workers/Terrain.js?worker'
import SimplexNoise from '@/Workers/SimplexNoise.js'
import { getCorridorProfile, getBiomeWeights } from '@/Workers/CorridorProfile.js'
import Terrain from './Terrain.js'

export default class Terrains
{
    static ITERATIONS_FORMULA_MAX = 1
    static ITERATIONS_FORMULA_MIN = 2
    static ITERATIONS_FORMULA_MIX = 3
    static ITERATIONS_FORMULA_POWERMIX = 4

    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.seed = this.game.seed + 'b'
        this.random = new seedrandom(this.seed)
        this.subdivisions = 40
        this.lacunarity = 2.05
        this.persistence = 0.35
        this.maxIterations = 4
        this.baseFrequency = 0.0035
        this.baseAmplitude = 30
        this.power = 1

        // Color band thresholds (shader uniforms only, geometry no longer uses them)
        this.beachEnd = 3
        this.mountainStart = 14
        this.mountainFull = 30

        // Beach corridor: forward = -Z, ocean = +X (right), mountains = -X (left)
        this.corridor = {
            shoreBaseX: 0,
            shoreMeanderAmplitude: 120,
            shoreMeanderFrequency: 0.0009,
            oceanRampWidth: 90,
            oceanDepth: 9,
            beachWidth: 14,
            beachTopHeight: 2.2,
            hillsWidth: 70,
            hillsHeight: 9,
            mountainStartDistance: 110,
            mountainFullDistance: 230,
            mountainHeight: 40,
            ridgeAmplitude: 18,
            ridgeFrequency: 0.01,
            moundHeight: 3.5,
            moundFrequency: 0.03,
            oceanDetail: 0.06,
            beachDetail: 0.012,
            hillsDetail: 0.16,

            // Journey biomes (weights over z, see CorridorProfile.getBiomeWeights)
            biomeFrequency: 0.0007,
            biomeEdgeVolcanic: - 0.42,
            biomeEdgeSavanna: 0.3,
            biomeBlendWidth: 0.18,

            // Coves / headland pinch-points
            coveFrequency: 0.0018,
            coveAmplitude: 70,
            minPassGap: 22,
            headlandMeanderDamp: 0.4,

            // Terraced cliffs
            terraceStep: 7,
            terraceLedge: 0.35,
            terraceStrength: 0.7,
            terraceJitter: 2.5,
            terraceJitterFrequency: 0.006,
            terraceDetailSuppress: 0.65,

            // Offshore sea stacks
            stackFrequency: 0.008,
            stackThreshold: 0.62,
            stackSharpness: 0.14,
            stackPower: 1.5,
            stackBandNear: 25,
            stackBandFar: 200,
            stackHeight: 12,
            stackHeightVariation: 5
        }

        // Per-biome geometry overrides + palette. Overrides may only contain
        // amplitudes/distances (never frequencies — phase-sweep artifacts).
        // Colors are shader uniforms: live-tunable without recreate()
        this.biomes = [
            {
                name: 'golden',
                overrides: {},
                colors: {
                    sand: [0.76, 0.68, 0.45],
                    grass: [0.52, 0.65, 0.26],
                    rock: [0.37, 0.38, 0.36]
                }
            },
            {
                name: 'volcanic',
                overrides: {
                    beachWidth: 10,
                    hillsWidth: 50,
                    hillsHeight: 7,
                    mountainStartDistance: 75,
                    mountainFullDistance: 175,
                    mountainHeight: 55,
                    ridgeAmplitude: 26,
                    terraceStrength: 0.85,
                    oceanDepth: 12
                },
                colors: {
                    sand: [0.16, 0.15, 0.16],
                    grass: [0.3, 0.38, 0.22],
                    rock: [0.13, 0.12, 0.13]
                }
            },
            {
                name: 'savanna',
                overrides: {
                    beachWidth: 30,
                    hillsHeight: 6,
                    mountainStartDistance: 160,
                    mountainFullDistance: 320,
                    mountainHeight: 24,
                    ridgeAmplitude: 10,
                    terraceStrength: 0.25
                },
                colors: {
                    sand: [0.85, 0.78, 0.58],
                    grass: [0.68, 0.62, 0.3],
                    rock: [0.48, 0.44, 0.38]
                }
            }
        ]

        this.segments = this.subdivisions + 1
        this.iterationsFormula = Terrains.ITERATIONS_FORMULA_POWERMIX

        this.lastId = 0
        this.terrains = new Map()

        this.events = new EventsEmitter()

        // Iterations offsets
        this.iterationsOffsets = []

        for(let i = 0; i < this.maxIterations; i++)
            this.iterationsOffsets.push([(this.random() - 0.5) * 200000, (this.random() - 0.5) * 200000])

        // Corridor offsets — allocation map documented in CorridorProfile.js
        this.corridorOffsets = []

        for(let i = 0; i < 16; i++)
            this.corridorOffsets.push([(this.random() - 0.5) * 200000, (this.random() - 0.5) * 200000])

        // Same seeded noise as the worker: shared CorridorProfile functions give
        // exact main-thread mirrors of the worker's structural values
        this.shoreNoise = new SimplexNoise(this.seed)

        this.setWorkers()
        this.setDebug()
    }

    getCorridorSample(z)
    {
        const profile = getCorridorProfile(this.shoreNoise, z, this.corridor, this.corridorOffsets, this.biomes)

        return {
            shoreX: profile.shoreX,
            wVolcanic: profile.weights[1],
            wSavanna: profile.weights[2],
            headland: profile.headland
        }
    }

    getBiomeWeights(z)
    {
        return getBiomeWeights(this.shoreNoise, z, this.corridor, this.corridorOffsets)
    }

    getShoreX(z)
    {
        return getCorridorProfile(this.shoreNoise, z, this.corridor, this.corridorOffsets, this.biomes).shoreX
    }

    setWorkers()
    {
        this.worker = TerrainWorker()

        this.worker.onmessage = (event) =>
        {
            // console.timeEnd(`terrains: worker (${event.data.id})`)

            const terrain = this.terrains.get(event.data.id)

            if(terrain)
            {
                terrain.create(event.data)
            }
        }
    }

    getIterationsForPrecision(precision)
    {
        if(this.iterationsFormula === Terrains.ITERATIONS_FORMULA_MAX)
            return this.maxIterations

        if(this.iterationsFormula === Terrains.ITERATIONS_FORMULA_MIN)
            return Math.floor((this.maxIterations - 1) * precision) + 1

        if(this.iterationsFormula === Terrains.ITERATIONS_FORMULA_MIX)
            return Math.round((this.maxIterations * precision + this.maxIterations) / 2)

        if(this.iterationsFormula === Terrains.ITERATIONS_FORMULA_POWERMIX)
            return Math.round((this.maxIterations * (precision, 1 - Math.pow(1 - precision, 2)) + this.maxIterations) / 2)
    }

    getWorkerMessage(id, size, x, z, iterations)
    {
        return {
            id: id,
            x,
            z,
            seed: this.seed,
            subdivisions: this.subdivisions,
            size: size,
            lacunarity: this.lacunarity,
            persistence: this.persistence,
            iterations: iterations,
            baseFrequency: this.baseFrequency,
            baseAmplitude: this.baseAmplitude,
            power: this.power,
            iterationsOffsets: this.iterationsOffsets,
            corridor: this.corridor,
            corridorOffsets: this.corridorOffsets,
            biomes: this.biomes
        }
    }

    create(size, x, z, precision)
    {
        // Create id
        const id = this.lastId++

        // Create terrain
        const iterations = this.getIterationsForPrecision(precision)
        const terrain = new Terrain(this, id, size, x, z, precision)
        this.terrains.set(terrain.id, terrain)

        // Post to worker
        // console.time(`terrains: worker (${terrain.id})`)
        this.worker.postMessage(this.getWorkerMessage(terrain.id, size, x, z, iterations))

        this.events.emit('create', terrain)

        return terrain
    }

    destroyTerrain(id)
    {
        const terrain = this.terrains.get(id)

        if(terrain)
        {
            terrain.destroy()
            this.terrains.delete(id)
        }
    }

    recreate()
    {
        for(const [key, terrain] of this.terrains)
        {
            // console.time(`terrains: worker (${terrain.id})`)
            const iterations = this.getIterationsForPrecision(terrain.precision)
            this.worker.postMessage(this.getWorkerMessage(terrain.id, terrain.size, terrain.x, terrain.z, iterations))
        }
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('state/terrains')

        folder
            .add(this, 'subdivisions')
            .min(1)
            .max(400)
            .step(1)
            .onFinishChange(() => this.recreate())

        folder
            .add(this, 'lacunarity')
            .min(1)
            .max(5)
            .step(0.01)
            .onFinishChange(() => this.recreate())

        folder
            .add(this, 'persistence')
            .min(0)
            .max(1)
            .step(0.01)
            .onFinishChange(() => this.recreate())

        folder
            .add(this, 'maxIterations')
            .min(1)
            .max(10)
            .step(1)
            .onFinishChange(() => this.recreate())

        folder
            .add(this, 'baseFrequency')
            .min(0)
            .max(0.01)
            .step(0.0001)
            .onFinishChange(() => this.recreate())

        folder
            .add(this, 'baseAmplitude')
            .min(0)
            .max(500)
            .step(0.1)
            .onFinishChange(() => this.recreate())

        folder
            .add(this, 'power')
            .min(1)
            .max(10)
            .step(1)
            .onFinishChange(() => this.recreate())

        folder
            .add(this, 'beachEnd')
            .min(1.3)
            .max(20)
            .step(0.1)
            .onFinishChange(() => this.recreate())

        folder
            .add(this, 'mountainStart')
            .min(0)
            .max(60)
            .step(0.1)
            .onFinishChange(() => this.recreate())

        folder
            .add(this, 'mountainFull')
            .min(0)
            .max(80)
            .step(0.1)
            .onFinishChange(() => this.recreate())

        folder
            .add(
                this,
                'iterationsFormula',
                {
                    'max': Terrains.ITERATIONS_FORMULA_MAX,
                    'min': Terrains.ITERATIONS_FORMULA_MIN,
                    'mix': Terrains.ITERATIONS_FORMULA_MIX,
                    'powerMix': Terrains.ITERATIONS_FORMULA_POWERMIX,
                }
            )
            .onFinishChange(() => this.recreate())

        const corridorFolder = this.debug.ui.getFolder('state/terrains/corridor')

        corridorFolder.add(this.corridor, 'shoreBaseX').min(- 500).max(500).step(1).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'shoreMeanderAmplitude').min(0).max(300).step(1).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'shoreMeanderFrequency').min(0).max(0.005).step(0.0001).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'oceanRampWidth').min(10).max(300).step(1).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'oceanDepth').min(0).max(40).step(0.5).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'beachWidth').min(5).max(120).step(1).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'beachTopHeight').min(0).max(10).step(0.1).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'hillsWidth').min(10).max(400).step(1).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'hillsHeight').min(0).max(30).step(0.5).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'mountainStartDistance').min(50).max(600).step(1).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'mountainFullDistance').min(100).max(1000).step(1).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'mountainHeight').min(0).max(120).step(1).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'ridgeAmplitude').min(0).max(60).step(0.5).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'ridgeFrequency').min(0).max(0.05).step(0.001).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'moundHeight').min(0).max(15).step(0.1).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'moundFrequency').min(0).max(0.1).step(0.001).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'oceanDetail').min(0).max(1).step(0.005).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'beachDetail').min(0).max(1).step(0.005).onFinishChange(() => this.recreate())
        corridorFolder.add(this.corridor, 'hillsDetail').min(0).max(1).step(0.005).onFinishChange(() => this.recreate())

        const biomesFolder = this.debug.ui.getFolder('state/terrains/corridor/biomes')

        biomesFolder.add(this.corridor, 'biomeFrequency').min(0).max(0.003).step(0.0001).onFinishChange(() => this.recreate())
        biomesFolder.add(this.corridor, 'biomeEdgeVolcanic').min(- 1).max(0).step(0.01).onFinishChange(() => this.recreate())
        biomesFolder.add(this.corridor, 'biomeEdgeSavanna').min(0).max(1).step(0.01).onFinishChange(() => this.recreate())
        biomesFolder.add(this.corridor, 'biomeBlendWidth').min(0.02).max(0.5).step(0.01).onFinishChange(() => this.recreate())

        const covesFolder = this.debug.ui.getFolder('state/terrains/corridor/coves')

        covesFolder.add(this.corridor, 'coveFrequency').min(0).max(0.01).step(0.0001).onFinishChange(() => this.recreate())
        covesFolder.add(this.corridor, 'coveAmplitude').min(0).max(150).step(1).onFinishChange(() => this.recreate())
        covesFolder.add(this.corridor, 'minPassGap').min(10).max(60).step(1).onFinishChange(() => this.recreate())
        covesFolder.add(this.corridor, 'headlandMeanderDamp').min(0).max(1).step(0.01).onFinishChange(() => this.recreate())

        const terracesFolder = this.debug.ui.getFolder('state/terrains/corridor/terraces')

        terracesFolder.add(this.corridor, 'terraceStep').min(3).max(15).step(0.5).onFinishChange(() => this.recreate())
        terracesFolder.add(this.corridor, 'terraceLedge').min(0.1).max(0.9).step(0.01).onFinishChange(() => this.recreate())
        terracesFolder.add(this.corridor, 'terraceStrength').min(0).max(1).step(0.01).onFinishChange(() => this.recreate())
        terracesFolder.add(this.corridor, 'terraceJitter').min(0).max(8).step(0.1).onFinishChange(() => this.recreate())
        terracesFolder.add(this.corridor, 'terraceJitterFrequency').min(0).max(0.03).step(0.001).onFinishChange(() => this.recreate())
        terracesFolder.add(this.corridor, 'terraceDetailSuppress').min(0).max(1).step(0.01).onFinishChange(() => this.recreate())

        const stacksFolder = this.debug.ui.getFolder('state/terrains/corridor/stacks')

        stacksFolder.add(this.corridor, 'stackFrequency').min(0).max(0.03).step(0.001).onFinishChange(() => this.recreate())
        stacksFolder.add(this.corridor, 'stackThreshold').min(0).max(0.95).step(0.01).onFinishChange(() => this.recreate())
        stacksFolder.add(this.corridor, 'stackSharpness').min(0.02).max(0.5).step(0.01).onFinishChange(() => this.recreate())
        stacksFolder.add(this.corridor, 'stackPower').min(1).max(4).step(0.1).onFinishChange(() => this.recreate())
        stacksFolder.add(this.corridor, 'stackBandNear').min(5).max(100).step(1).onFinishChange(() => this.recreate())
        stacksFolder.add(this.corridor, 'stackBandFar').min(50).max(500).step(1).onFinishChange(() => this.recreate())
        stacksFolder.add(this.corridor, 'stackHeight').min(0).max(25).step(0.5).onFinishChange(() => this.recreate())
        stacksFolder.add(this.corridor, 'stackHeightVariation').min(0).max(10).step(0.5).onFinishChange(() => this.recreate())

        // this.material.uniforms.uFresnelOffset.value = 0
        // this.material.uniforms.uFresnelScale.value = 0.5
        // this.material.uniforms.uFresnelPower.value = 2
    }
}
