import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class Audio
{
    constructor()
    {
        this.game = Game.getInstance()
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time

        this.ready = false
        this.muted = false
        this.masterVolume = 0.35
        this.windVolume = 0.12
        this.padVolume = 0.05
        this.chimeVolume = 0.08

        this.chimeFrequencies = [220, 261.63, 293.66, 329.63, 392, 440] // A minor pentatonic
        this.nextRandomChimeTime = 0

        // Browsers require a user gesture before audio can start
        const unlock = () =>
        {
            this.setup()
            window.removeEventListener('pointerdown', unlock)
            window.removeEventListener('keydown', unlock)
        }
        window.addEventListener('pointerdown', unlock, { once: false })
        window.addEventListener('keydown', unlock, { once: false })

        this.setDebug()
    }

    setup()
    {
        if(this.ready)
            return

        this.context = new AudioContext()
        this.context.resume()

        this.masterGain = this.context.createGain()
        this.masterGain.gain.value = this.muted ? 0 : this.masterVolume
        this.masterGain.connect(this.context.destination)

        this.setWind()
        this.setPad()

        const playerState = this.state.player

        playerState.events.on('jump', () =>
        {
            const frequency = this.chimeFrequencies[Math.floor(Math.random() * this.chimeFrequencies.length)]
            this.playChime(frequency, this.chimeVolume)
        })

        playerState.events.on('land', (impactSpeed) =>
        {
            const intensity = Math.min(impactSpeed / 12, 1)
            this.playChime(this.chimeFrequencies[0], this.chimeVolume * 0.5 * (0.3 + intensity))
        })

        this.ready = true
    }

    setWind()
    {
        // Looping noise buffer
        const duration = 4
        const sampleCount = this.context.sampleRate * duration
        const buffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate)
        const data = buffer.getChannelData(0)

        for(let i = 0; i < sampleCount; i++)
            data[i] = Math.random() * 2 - 1

        this.wind = {}
        this.wind.source = this.context.createBufferSource()
        this.wind.source.buffer = buffer
        this.wind.source.loop = true

        this.wind.filter = this.context.createBiquadFilter()
        this.wind.filter.type = 'lowpass'
        this.wind.filter.frequency.value = 400
        this.wind.filter.Q.value = 0.7

        this.wind.gain = this.context.createGain()
        this.wind.gain.gain.value = 0

        this.wind.source.connect(this.wind.filter)
        this.wind.filter.connect(this.wind.gain)
        this.wind.gain.connect(this.masterGain)
        this.wind.source.start()
    }

    setPad()
    {
        this.pad = {}
        this.pad.gain = this.context.createGain()
        this.pad.gain.gain.value = this.padVolume

        this.pad.filter = this.context.createBiquadFilter()
        this.pad.filter.type = 'lowpass'
        this.pad.filter.frequency.value = 600

        this.pad.filter.connect(this.pad.gain)
        this.pad.gain.connect(this.masterGain)

        // Slow LFO breathing on the filter keeps the pad evolving even when
        // the tab is hidden (the audio graph runs off the audio clock)
        this.pad.lfo = this.context.createOscillator()
        this.pad.lfo.frequency.value = 0.05
        this.pad.lfoGain = this.context.createGain()
        this.pad.lfoGain.gain.value = 250
        this.pad.lfo.connect(this.pad.lfoGain)
        this.pad.lfoGain.connect(this.pad.filter.frequency)
        this.pad.lfo.start()

        const createVoicing = (frequencies) =>
        {
            const voicing = {}
            voicing.gain = this.context.createGain()
            voicing.gain.gain.value = 0
            voicing.gain.connect(this.pad.filter)
            voicing.oscillators = []

            for(const frequency of frequencies)
            {
                for(const detune of [- 4, 4])
                {
                    const oscillator = this.context.createOscillator()
                    oscillator.type = 'triangle'
                    oscillator.frequency.value = frequency
                    oscillator.detune.value = detune
                    oscillator.connect(voicing.gain)
                    oscillator.start()
                    voicing.oscillators.push(oscillator)
                }
            }

            return voicing
        }

        this.pad.day = createVoicing([110, 164.81, 220]) // A2, E3, A3 — open fifth
        this.pad.night = createVoicing([110, 130.81, 164.81]) // A2, C3, E3 — minor
    }

    playChime(frequency, volume)
    {
        if(!this.ready && !this.context)
            return

        const now = this.context.currentTime

        const oscillator = this.context.createOscillator()
        oscillator.type = 'sine'
        oscillator.frequency.value = frequency

        const gain = this.context.createGain()
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(volume, now + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5)

        oscillator.connect(gain)
        gain.connect(this.masterGain)
        oscillator.start(now)
        oscillator.stop(now + 2.6)
    }

    update()
    {
        if(!this.ready)
            return

        const playerState = this.state.player
        const windState = this.state.wind
        const sunState = this.state.sun
        const now = this.context.currentTime

        // Wind follows player speed and gusts
        const speedNorm = Math.min(playerState.horizontalSpeed / 30, 1)
        const windAmount = Math.min(0.3 + speedNorm * 0.7 + windState.strength * 0.5, 1.5)
        this.wind.filter.frequency.setTargetAtTime(300 + windAmount * 1200, now, 0.3)
        this.wind.gain.gain.setTargetAtTime(this.windVolume * windAmount, now, 0.3)

        // Crossfade pad voicings with the day cycle
        const dayness = Math.min(Math.max(sunState.position.y * 4 + 0.5, 0), 1)
        this.pad.day.gain.gain.setTargetAtTime(dayness, now, 2)
        this.pad.night.gain.gain.setTargetAtTime(1 - dayness, now, 2)

        // Sparse random chimes while moving
        if(playerState.horizontalSpeed > 2 && this.time.elapsed > this.nextRandomChimeTime)
        {
            this.nextRandomChimeTime = this.time.elapsed + 8 + Math.random() * 12
            const frequency = this.chimeFrequencies[Math.floor(Math.random() * this.chimeFrequencies.length)]
            this.playChime(frequency, this.chimeVolume * 0.6)
        }
    }

    setMuted(muted)
    {
        this.muted = muted

        if(this.ready)
            this.masterGain.gain.setTargetAtTime(muted ? 0 : this.masterVolume, this.context.currentTime, 0.1)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/audio')

        folder.add(this, 'muted').onChange(() => { this.setMuted(this.muted) })
        folder.add(this, 'masterVolume').min(0).max(1).step(0.01).onChange(() =>
        {
            if(this.ready && !this.muted)
                this.masterGain.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, 0.1)
        })
        folder.add(this, 'windVolume').min(0).max(0.5).step(0.01)
        folder.add(this, 'padVolume').min(0).max(0.3).step(0.01).onChange(() =>
        {
            if(this.ready)
                this.pad.gain.gain.setTargetAtTime(this.padVolume, this.context.currentTime, 0.1)
        })
        folder.add(this, 'chimeVolume').min(0).max(0.3).step(0.01)
    }
}
