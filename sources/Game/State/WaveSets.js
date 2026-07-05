import Game from '@/Game.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import SimplexNoise from '@/Workers/SimplexNoise.js'

const smoothStep = (edgeMin, edgeMax, value) =>
{
    const t = Math.max(0, Math.min(1, (value - edgeMin) / (edgeMax - edgeMin)))
    return t * t * (3 - 2 * t)
}

/**
 * Breaking wave sets: the CPU computes all phase/timing values so Water,
 * Terrains and Particles read exactly the same wave state each frame —
 * shaders only compute local shape from uniforms, never mod(uTime).
 *
 * Per set life cycle (phase p in [0,1)):
 *   p < pBreak            swell approaches from deep water, decelerating and shoaling
 *   pBreak..pBreak+0.15   breaks: amplitude collapses into a whitewater bore
 *   pBreak+0.05..1        uprush washes up the beach then recedes (terrain foam)
 */
export default class WaveSets
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.D0 = 130
        this.DBreak = 6
        this.pBreak = 0.62
        this.width = 9
        this.uprushMaxE = 0.8
        this.jitterAmplitude = 7
        this.jitterFrequency = 0.012

        this.wetLineE = 0
        this.wetFresh = 0

        this.noise = new SimplexNoise(this.game.seed + 'w')

        this.sets = [
            { period: 11, offset: 0, baseAmplitude: 0.75, p: 0, k: 0, frontD: this.D0, amplitude: 0, foamWidth: 0, foamIntensity: 0, uprushE: 0 },
            { period: 16.5, offset: 7.3, baseAmplitude: 0.5, p: 0, k: 0, frontD: this.D0, amplitude: 0, foamWidth: 0, foamIntensity: 0, uprushE: 0 }
        ]

        this.setDebug()
    }

    // Wave fronts aren't straight lines: per-wave jitter along z, reseeded by
    // wave index k so each wave has its own shape. Written into the wave data
    // texture (CPU) and used for spray positions — always in sync.
    getFrontJitter(z, setIndex)
    {
        const set = this.sets[setIndex]
        return this.jitterAmplitude * this.noise.noise2D(z * this.jitterFrequency, set.k * 7.31 + setIndex * 113.7)
    }

    update()
    {
        const time = this.state.time

        let maxUprush = 0
        let peaking = false

        for(const set of this.sets)
        {
            const t = time.elapsed + set.offset
            set.k = Math.floor(t / set.period)
            set.p = t / set.period - set.k

            const p = set.p

            // Quadratic deceleration ~ shallow-water wave speed
            if(p < this.pBreak)
            {
                const s = p / this.pBreak
                set.frontD = this.DBreak + (this.D0 - this.DBreak) * (1 - s) * (1 - s)
            }
            else
            {
                set.frontD = 0
            }

            // Shoaling: grows approaching shore, collapses over the break window
            let amplitude = set.baseAmplitude * (0.35 + 0.65 * (1 - smoothStep(15, this.D0, set.frontD)))
            amplitude *= 1 - smoothStep(this.pBreak, this.pBreak + 0.06, p)
            set.amplitude = amplitude

            // Whitewater bore rushing the last meters after the break
            if(p >= this.pBreak && p < this.pBreak + 0.15)
            {
                const q = (p - this.pBreak) / 0.15
                set.foamWidth = this.DBreak * (1 - q) + 2
                set.foamIntensity = 1 - q * 0.6
            }
            else
            {
                set.foamWidth = 0
                set.foamIntensity = 0
            }

            // Uprush: fast run-up, slow recede
            const uprushStart = this.pBreak + 0.05

            if(p >= uprushStart)
            {
                const q = Math.min(1, (p - uprushStart) / (1 - uprushStart))
                set.uprushE = this.uprushMaxE * Math.pow(Math.sin(Math.PI * Math.pow(q, 0.55)), 0.9)
            }
            else
            {
                set.uprushE = 0
            }

            maxUprush = Math.max(maxUprush, set.uprushE)

            if(set.uprushE >= this.uprushMaxE * 0.85)
                peaking = true
        }

        // Wet memory (GLSL can't hold state): the wet line creeps down slowly,
        // freshness fades over ~6s leaving a darkening band after each wave
        this.wetLineE = Math.max(this.wetLineE - time.delta * 0.08, maxUprush)
        this.wetFresh = Math.max(this.wetFresh - time.delta / 6, peaking ? 1 : 0)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('state/waveSets')

        folder.add(this, 'D0').min(40).max(300).step(1)
        folder.add(this, 'pBreak').min(0.3).max(0.9).step(0.01)
        folder.add(this, 'width').min(2).max(30).step(0.5)
        folder.add(this, 'uprushMaxE').min(0).max(2).step(0.05)
        folder.add(this, 'jitterAmplitude').min(0).max(20).step(0.5)
        folder.add(this, 'jitterFrequency').min(0).max(0.05).step(0.001)
        folder.add(this.sets[0], 'period').min(4).max(40).step(0.5).name('period0')
        folder.add(this.sets[1], 'period').min(4).max(40).step(0.5).name('period1')
        folder.add(this.sets[0], 'baseAmplitude').min(0).max(2).step(0.05).name('amplitude0')
        folder.add(this.sets[1], 'baseAmplitude').min(0).max(2).step(0.05).name('amplitude1')
        folder.add({ trigger: () =>
        {
            // Jump set 0 to just before its approach for quick iteration
            this.sets[0].offset = - this.state.time.elapsed + this.sets[0].period * 0.05
        } }, 'trigger')
    }
}
