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
        this.windVolume = 0.05
        this.padVolume = 0.05
        this.chimeVolume = 0.1
        this.reverbVolume = 0.4
        this.glideVolume = 0.05
        this.flowPadVolume = 0.06
        this.susVolume = 0.015
        this.surfVolume = 0.3
        this.crashVolume = 0.3
        this.rainVolume = 0.12
        this.thunderVolume = 0.4
        this.fireVolume = 0.15
        this.nextCrackleTime = 0

        // Two-octave A pentatonic scales: minor at night, major by day
        this.scales = {}
        this.scales.minor = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 784, 880]
        this.scales.major = [220, 246.94, 277.18, 329.63, 369.99, 440, 493.88, 554.37, 659.25, 739.99, 880]
        this.chimeFrequencies = this.scales.minor
        this.melodyIndex = 0
        this.melodyResetDelay = 2.5
        this.groundedTime = 0
        this.nextPluckTime = 0

        // Echo answers: the world quietly replays the end of a good phrase
        this.melodyBuffer = []
        this.nextEchoTime = 0

        // Wave plucks: one low note per wave break near the player
        this.waveFoamPrev = []
        this.nextWavePluckTime = 0

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

        this.setReverb()
        this.setWind()
        this.setPad()
        this.setGlide()
        this.setSus()
        this.setSurf()
        this.setRain()
        this.setFire()

        this.state.weather.events.on('thunder', () =>
        {
            this.playThunder()
        })

        this.state.cyclones.events.on('cycloneLaunch', () =>
        {
            // Big rising gust with a sparkle on top
            this.playWhoosh({ startFrequency: 180, endFrequency: 2600, duration: 1.1, volume: this.chimeVolume * 0.9 })
            this.playChime(this.chimeFrequencies[4], this.chimeVolume * 0.6, 2, 0.15)
            this.playChime(this.chimeFrequencies[6], this.chimeVolume * 0.5, 2, 0.3)
        })

        const playerState = this.state.player

        playerState.events.on('jump', (jumpCount) =>
        {
            // Chained jumps climb the pentatonic ladder, double jumps skip a
            // degree and land as a dyad (note plus a fifth) for extra lift
            const frequency = this.chimeFrequencies[this.melodyIndex]
            this.playChime(frequency, this.chimeVolume)

            if(jumpCount === 2)
                this.playChime(frequency * 1.5, this.chimeVolume * 0.6)

            this.rememberNote(frequency)
            this.melodyIndex = Math.min(this.melodyIndex + (jumpCount === 2 ? 2 : 1), this.chimeFrequencies.length - 1)
        })

        playerState.events.on('land', (impactSpeed) =>
        {
            // Resolve the phrase to the root below the last played note; a
            // phrase that climbed high enough earns a two-note cadence
            const intensity = Math.min(impactSpeed / 12, 1)
            const volume = this.chimeVolume * 0.5 * (0.3 + intensity)
            const rootIndex = this.melodyIndex > 5 ? 5 : 0

            if(this.melodyIndex - rootIndex >= 4)
            {
                this.playChime(this.chimeFrequencies[rootIndex + 1], volume * 0.8)
                this.playChime(this.chimeFrequencies[rootIndex], volume, 2.5, 0.11)
            }
            else
            {
                this.playChime(this.chimeFrequencies[rootIndex], volume)
            }

            // Echo answer: after a good run, the world quietly replays the
            // last few notes of the phrase, drenched in reverb
            if(playerState.flow > 0.5 && this.melodyBuffer.length >= 3 && this.time.elapsed > this.nextEchoTime)
            {
                this.nextEchoTime = this.time.elapsed + 10

                const notes = this.melodyBuffer.slice(- 3)

                for(let i = 0; i < notes.length; i++)
                    this.playChime(notes[i], this.chimeVolume * 0.3, 3, 1.8 + i * 0.3)

                this.melodyBuffer.length = 0
            }
        })

        playerState.events.on('splash', (impactSpeed) =>
        {
            this.playSplash(Math.min(impactSpeed / 12, 1))
        })

        playerState.events.on('dash', () =>
        {
            this.playWhoosh()
        })

        playerState.events.on('roll', (direction) =>
        {
            // Sparkling arpeggio spinning with the corkscrew: ascending rolling
            // right, descending rolling left, an octave above the jump ladder,
            // scheduled on the audio clock so the run stays crisp
            const steps = direction >= 0 ? [0, 2, 4] : [4, 2, 0]

            for(let i = 0; i < steps.length; i++)
            {
                const index = Math.min(this.melodyIndex + steps[i], this.chimeFrequencies.length - 1)
                this.playChime(this.chimeFrequencies[index] * 2, this.chimeVolume * 0.6, 1.6, i * 0.11)
                this.rememberNote(this.chimeFrequencies[index] * 2)
            }

            this.playWhoosh({ startFrequency: 700, endFrequency: 2600, duration: 0.45, volume: this.chimeVolume * 0.7 })
        })

        playerState.events.on('bounce', () =>
        {
            // Skimming bounces climb the ladder like quiet jumps
            const frequency = this.chimeFrequencies[this.melodyIndex]
            this.playChime(frequency, this.chimeVolume * 0.6, 1.6)
            this.rememberNote(frequency)
            this.melodyIndex = Math.min(this.melodyIndex + 1, this.chimeFrequencies.length - 1)
        })

        playerState.events.on('bump', (bumpSpeed) =>
        {
            // Soft low thud: a downward noise sweep with a quiet low A
            const intensity = Math.min(bumpSpeed / 20, 1)
            this.playWhoosh({ startFrequency: 500, endFrequency: 150, duration: 0.18, volume: this.chimeVolume * (0.4 + intensity * 0.5), glint: false })
            this.playChime(110, this.chimeVolume * 0.4 * (0.4 + intensity * 0.6), 0.6)
        })

        playerState.events.on('launch', (launchVy) =>
        {
            // Soft low breath when a crest lets go of the player
            const intensity = Math.min(Math.max(launchVy, 0) / 14, 1)
            this.playWhoosh({ startFrequency: 250, endFrequency: 900, duration: 0.5, volume: this.chimeVolume * (0.2 + intensity * 0.3), glint: false })
        })

        this.state.obstacleCourses.events.on('ringCollect', ({ index, type }) =>
        {
            const scaleIndex = Math.min(2 + index, this.chimeFrequencies.length - 1)
            const frequency = this.chimeFrequencies[scaleIndex] * (index > 3 ? 1.5 : 1)

            this.playChime(frequency, this.chimeVolume * 0.85, 1.35)

            if(index % 3 === 2)
                this.playChime(frequency * 1.5, this.chimeVolume * 0.38, 1.5, 0.06)

            // Trick rings get their own flavor on top of the ladder chime
            if(type === 'dive')
                this.playWhoosh({ startFrequency: 1400, endFrequency: 300, duration: 0.3, volume: this.chimeVolume * 0.6, glint: false })
            else if(type === 'glide')
                this.playChime(frequency * 2, this.chimeVolume * 0.4, 1.8)
            else if(type === 'dashGate')
                this.playChime(frequency, this.chimeVolume * 0.5, 1.2, 0.08)

            this.rememberNote(frequency)
            this.melodyIndex = Math.min(Math.max(this.melodyIndex, scaleIndex + 1), this.chimeFrequencies.length - 1)
        })

        this.state.obstacleCourses.events.on('courseComplete', ({ collected, perfect }) =>
        {
            if(collected === 0)
                return

            if(perfect)
            {
                // Full-clear cadence: rising chord capped an octave up
                const steps = [5, 7, 9]

                for(let i = 0; i < steps.length; i++)
                    this.playChime(this.chimeFrequencies[steps[i]], this.chimeVolume * 0.8, 2, i * 0.11)

                this.playChime(this.chimeFrequencies[10] * 2, this.chimeVolume * 0.55, 2.4, 0.36)
                this.playWhoosh({ startFrequency: 600, endFrequency: 2600, duration: 0.7, volume: this.chimeVolume * 0.7 })
            }
            else
            {
                // Partial clear resolves quietly
                this.playChime(this.chimeFrequencies[5], this.chimeVolume * 0.4, 1.6)
                this.playChime(this.chimeFrequencies[3], this.chimeVolume * 0.4, 2, 0.14)
            }
        })

        this.state.bouncePads.events.on('padBounce', ({ index, perfect }) =>
        {
            // Boing plus a chime climbing the ladder with the tower
            const scaleIndex = Math.min(2 + index, this.chimeFrequencies.length - 1)
            const frequency = this.chimeFrequencies[scaleIndex]

            this.playWhoosh({ startFrequency: 160, endFrequency: 750, duration: 0.28, volume: this.chimeVolume * 0.6, glint: false })
            this.playChime(frequency, this.chimeVolume * 0.8, 1.4)

            if(perfect)
                this.playChime(frequency * 1.5, this.chimeVolume * 0.45, 1.5, 0.05)

            this.rememberNote(frequency)
            this.melodyIndex = Math.min(Math.max(this.melodyIndex, scaleIndex + 1), this.chimeFrequencies.length - 1)
        })

        this.state.bouncePads.events.on('prizeCollect', () =>
        {
            // Apex fanfare: rising arpeggio capped an octave up
            const steps = [5, 7, 9, 10]

            for(let i = 0; i < steps.length; i++)
            {
                const frequency = this.chimeFrequencies[steps[i]] * (i === steps.length - 1 ? 2 : 1)
                this.playChime(frequency, this.chimeVolume * (0.9 - i * 0.12), 1.8, i * 0.09)
            }

            this.playWhoosh({ startFrequency: 500, endFrequency: 2400, duration: 0.6, volume: this.chimeVolume * 0.7 })
        })

        this.state.progressiveBounceCourses.events.on('padBounce', ({ index, perfect }) =>
        {
            const scaleIndex = Math.min(3 + index, this.chimeFrequencies.length - 1)
            const frequency = this.chimeFrequencies[scaleIndex]

            this.playWhoosh({ startFrequency: 180, endFrequency: 950, duration: 0.26, volume: this.chimeVolume * 0.65, glint: false })
            this.playChime(frequency, this.chimeVolume * 0.82, 1.35)

            if(perfect)
                this.playChime(frequency * 1.5, this.chimeVolume * 0.46, 1.5, 0.05)

            this.rememberNote(frequency)
            this.melodyIndex = Math.min(Math.max(this.melodyIndex, scaleIndex + 1), this.chimeFrequencies.length - 1)
        })

        this.state.progressiveBounceCourses.events.on('prizeCollect', () =>
        {
            const steps = [6, 8, 9, 10]

            for(let i = 0; i < steps.length; i++)
            {
                const frequency = this.chimeFrequencies[steps[i]] * (i === steps.length - 1 ? 2 : 1)
                this.playChime(frequency, this.chimeVolume * (0.92 - i * 0.12), 1.8, i * 0.085)
            }

            this.playWhoosh({ startFrequency: 620, endFrequency: 2600, duration: 0.58, volume: this.chimeVolume * 0.72 })
        })

        this.state.tideline.events.on('courseStart', () =>
        {
            // The ribbon lighting up: a soft rising shimmer and a low invite
            this.playWhoosh({ startFrequency: 320, endFrequency: 1500, duration: 0.8, volume: this.chimeVolume * 0.45 })
            this.playChime(this.chimeFrequencies[1], this.chimeVolume * 0.45, 2.2, 0.2)
        })

        this.state.tideline.events.on('segment', ({ index }) =>
        {
            // Each completed stretch of the ribbon climbs the ladder
            const scaleIndex = Math.min(1 + index, this.chimeFrequencies.length - 1)
            const frequency = this.chimeFrequencies[scaleIndex]

            this.playChime(frequency, this.chimeVolume * 0.75, 1.6)

            if(index % 3 === 0)
                this.playChime(frequency * 1.5, this.chimeVolume * 0.35, 1.6, 0.07)

            this.rememberNote(frequency)
            this.melodyIndex = Math.min(Math.max(this.melodyIndex, scaleIndex + 1), this.chimeFrequencies.length - 1)
        })

        this.state.tideline.events.on('prizeCollect', () =>
        {
            const steps = [4, 6, 8, 10]

            for(let i = 0; i < steps.length; i++)
            {
                const frequency = this.chimeFrequencies[steps[i]] * (i === steps.length - 1 ? 2 : 1)
                this.playChime(frequency, this.chimeVolume * (0.9 - i * 0.12), 1.8, i * 0.09)
            }

            this.playWhoosh({ startFrequency: 550, endFrequency: 2500, duration: 0.6, volume: this.chimeVolume * 0.7 })
        })

        this.ready = true
    }

    getNoiseBuffer()
    {
        if(this.noiseBuffer)
            return this.noiseBuffer

        const duration = 4
        const sampleCount = this.context.sampleRate * duration
        this.noiseBuffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate)
        const data = this.noiseBuffer.getChannelData(0)

        for(let i = 0; i < sampleCount; i++)
            data[i] = Math.random() * 2 - 1

        return this.noiseBuffer
    }

    setReverb()
    {
        // Shimmer reverb bus: two parallel feedback delays with a lowpass in
        // each loop so the repeats get darker as they fade
        this.reverb = {}
        this.reverb.input = this.context.createGain()
        this.reverb.input.gain.value = 1

        this.reverb.output = this.context.createGain()
        this.reverb.output.gain.value = this.reverbVolume
        this.reverb.output.connect(this.masterGain)

        for(const delayTime of [0.31, 0.43])
        {
            const delay = this.context.createDelay(1)
            delay.delayTime.value = delayTime

            const feedback = this.context.createGain()
            feedback.gain.value = 0.5

            const filter = this.context.createBiquadFilter()
            filter.type = 'lowpass'
            filter.frequency.value = 2200

            this.reverb.input.connect(delay)
            delay.connect(filter)
            filter.connect(feedback)
            feedback.connect(delay)
            filter.connect(this.reverb.output)
        }
    }

    setWind()
    {
        this.wind = {}
        this.wind.source = this.context.createBufferSource()
        this.wind.source.buffer = this.getNoiseBuffer()
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

        // Flow voice: an airy high shimmer that fades in as the player's flow
        // builds — narrow-band noise instead of held notes, so speed reads as
        // sparkle rather than a ringing chord. Raised playback rate
        // decorrelates it from the wind (same noise buffer, higher band)
        this.pad.flow = {}
        this.pad.flow.gain = this.context.createGain()
        this.pad.flow.gain.gain.value = 0
        this.pad.flow.gain.connect(this.masterGain)
        this.pad.flow.gain.connect(this.reverb.input)

        this.pad.flow.filter = this.context.createBiquadFilter()
        this.pad.flow.filter.type = 'bandpass'
        this.pad.flow.filter.frequency.value = 2800
        this.pad.flow.filter.Q.value = 1.5
        this.pad.flow.filter.connect(this.pad.flow.gain)

        this.pad.flow.source = this.context.createBufferSource()
        this.pad.flow.source.buffer = this.getNoiseBuffer()
        this.pad.flow.source.loop = true
        this.pad.flow.source.playbackRate.value = 1.3
        this.pad.flow.source.connect(this.pad.flow.filter)
        this.pad.flow.source.start()

        // Slow drift on the band keeps the shimmer breathing
        this.pad.flow.lfo = this.context.createOscillator()
        this.pad.flow.lfo.frequency.value = 0.18
        this.pad.flow.lfoGain = this.context.createGain()
        this.pad.flow.lfoGain.gain.value = 700
        this.pad.flow.lfo.connect(this.pad.flow.lfoGain)
        this.pad.flow.lfoGain.connect(this.pad.flow.filter.frequency)
        this.pad.flow.lfo.start()
    }

    setGlide()
    {
        // Airy sustained harmonics that fade in while gliding
        this.glide = {}
        this.glide.gain = this.context.createGain()
        this.glide.gain.gain.value = 0
        this.glide.gain.connect(this.masterGain)
        this.glide.gain.connect(this.reverb.input)

        this.glide.filter = this.context.createBiquadFilter()
        this.glide.filter.type = 'lowpass'
        this.glide.filter.frequency.value = 1200
        this.glide.filter.connect(this.glide.gain)

        for(const frequency of [880, 1318.51]) // A5, E6
        {
            for(const detune of [- 3, 3])
            {
                const oscillator = this.context.createOscillator()
                oscillator.type = 'sine'
                oscillator.frequency.value = frequency
                oscillator.detune.value = detune
                oscillator.connect(this.glide.filter)
                oscillator.start()
            }
        }

        this.glide.lfo = this.context.createOscillator()
        this.glide.lfo.frequency.value = 0.15
        this.glide.lfoGain = this.context.createGain()
        this.glide.lfoGain.gain.value = 300
        this.glide.lfo.connect(this.glide.lfoGain)
        this.glide.lfoGain.connect(this.glide.filter.frequency)
        this.glide.lfo.start()
    }

    setSus()
    {
        // Suspension voice: a soft D (the 4th of A) that fades in during long
        // flights, resolved by the root chime on landing
        this.sus = {}
        this.sus.gain = this.context.createGain()
        this.sus.gain.gain.value = 0
        this.sus.gain.connect(this.masterGain)
        this.sus.gain.connect(this.reverb.input)

        for(const detune of [- 3, 3])
        {
            const oscillator = this.context.createOscillator()
            oscillator.type = 'sine'
            oscillator.frequency.value = 293.66 // D4
            oscillator.detune.value = detune
            oscillator.connect(this.sus.gain)
            oscillator.start()
        }
    }

    setSurf()
    {
        // Ocean wash: a deep noise bed audible only near the shore, swelling
        // with each incoming set. Slowed playback decorrelates it from the
        // wind (same noise buffer) and darkens it into a rumble
        this.surf = {}
        this.surf.source = this.context.createBufferSource()
        this.surf.source.buffer = this.getNoiseBuffer()
        this.surf.source.loop = true
        this.surf.source.playbackRate.value = 0.7

        this.surf.filter = this.context.createBiquadFilter()
        this.surf.filter.type = 'lowpass'
        this.surf.filter.frequency.value = 500
        this.surf.filter.Q.value = 0.7

        this.surf.gain = this.context.createGain()
        this.surf.gain.gain.value = 0

        this.surf.source.connect(this.surf.filter)
        this.surf.filter.connect(this.surf.gain)
        this.surf.gain.connect(this.masterGain)
        this.surf.source.start()
    }

    setRain()
    {
        // Rain hiss: the shared noise bed sped up and pushed through a high
        // bandpass so it sits above the wind and surf rather than thickening them
        this.rain = {}
        this.rain.source = this.context.createBufferSource()
        this.rain.source.buffer = this.getNoiseBuffer()
        this.rain.source.loop = true
        this.rain.source.playbackRate.value = 1.5

        this.rain.filter = this.context.createBiquadFilter()
        this.rain.filter.type = 'bandpass'
        this.rain.filter.frequency.value = 3000
        this.rain.filter.Q.value = 0.5

        this.rain.gain = this.context.createGain()
        this.rain.gain.gain.value = 0

        this.rain.source.connect(this.rain.filter)
        this.rain.filter.connect(this.rain.gain)
        this.rain.gain.connect(this.masterGain)
        this.rain.source.start()
    }

    setFire()
    {
        // Campfire bed: warm low rumble, decorrelated from wind/surf by rate.
        // Gain follows proximity to the nearest live fire (View/Campfires.js)
        this.fire = {}
        this.fire.source = this.context.createBufferSource()
        this.fire.source.buffer = this.getNoiseBuffer()
        this.fire.source.loop = true
        this.fire.source.playbackRate.value = 0.9

        this.fire.filter = this.context.createBiquadFilter()
        this.fire.filter.type = 'lowpass'
        this.fire.filter.frequency.value = 1000
        this.fire.filter.Q.value = 0.8

        this.fire.gain = this.context.createGain()
        this.fire.gain.gain.value = 0

        this.fire.source.connect(this.fire.filter)
        this.fire.filter.connect(this.fire.gain)
        this.fire.gain.connect(this.masterGain)
        this.fire.source.start()
    }

    playCracklePop(amount)
    {
        // A single dry snap: short noise burst through a randomized bandpass —
        // close and dry on purpose, so it skips the reverb bus
        const now = this.context.currentTime

        const source = this.context.createBufferSource()
        source.buffer = this.getNoiseBuffer()
        source.playbackRate.value = 1 + Math.random() * 0.6

        const filter = this.context.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 1600 + Math.random() * 1800
        filter.Q.value = 2

        const gain = this.context.createGain()
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(this.fireVolume * amount * (0.5 + Math.random() * 0.5), now + 0.003)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05 + Math.random() * 0.08)

        source.connect(filter)
        filter.connect(gain)
        gain.connect(this.masterGain)
        source.start(now)
        source.stop(now + 0.2)
    }

    rememberNote(frequency)
    {
        this.melodyBuffer.push(frequency)

        if(this.melodyBuffer.length > 4)
            this.melodyBuffer.shift()
    }

    playChime(frequency, volume, decay = 2.5, delay = 0)
    {
        if(!this.ready && !this.context)
            return

        const now = this.context.currentTime + delay

        const oscillator = this.context.createOscillator()
        oscillator.type = 'sine'
        oscillator.frequency.value = frequency

        const gain = this.context.createGain()
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(volume, now + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + decay)

        oscillator.connect(gain)
        gain.connect(this.masterGain)
        gain.connect(this.reverb.input)
        oscillator.start(now)
        oscillator.stop(now + decay + 0.1)

        // Flow shadow: chained tricks give every note a quiet octave-below
        // double (skip the low thuds, they have no octave to gain)
        if(this.state.player.flow > 0.6 && frequency >= 200)
        {
            const shadow = this.context.createOscillator()
            shadow.type = 'sine'
            shadow.frequency.value = frequency * 0.5

            const shadowGain = this.context.createGain()
            shadowGain.gain.setValueAtTime(0, now)
            shadowGain.gain.linearRampToValueAtTime(volume * 0.4, now + 0.02)
            shadowGain.gain.exponentialRampToValueAtTime(0.0001, now + decay)

            shadow.connect(shadowGain)
            shadowGain.connect(this.masterGain)
            shadowGain.connect(this.reverb.input)
            shadow.start(now)
            shadow.stop(now + decay + 0.1)
        }
    }

    playSplash(intensity)
    {
        if(!this.ready)
            return

        const now = this.context.currentTime

        // Watery plop: noise through a lowpass diving down...
        const body = this.context.createBufferSource()
        body.buffer = this.getNoiseBuffer()
        body.loop = true

        const bodyFilter = this.context.createBiquadFilter()
        bodyFilter.type = 'lowpass'
        bodyFilter.Q.value = 1
        bodyFilter.frequency.setValueAtTime(900, now)
        bodyFilter.frequency.exponentialRampToValueAtTime(250, now + 0.3)

        const bodyGain = this.context.createGain()
        bodyGain.gain.setValueAtTime(0, now)
        bodyGain.gain.linearRampToValueAtTime(this.chimeVolume * (0.5 + intensity * 0.7), now + 0.02)
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)

        body.connect(bodyFilter)
        bodyFilter.connect(bodyGain)
        bodyGain.connect(this.masterGain)
        bodyGain.connect(this.reverb.input)
        body.start(now)
        body.stop(now + 0.4)

        // ...with a short high sizzle for the spray
        const spray = this.context.createBufferSource()
        spray.buffer = this.getNoiseBuffer()
        spray.loop = true

        const sprayFilter = this.context.createBiquadFilter()
        sprayFilter.type = 'bandpass'
        sprayFilter.Q.value = 0.8
        sprayFilter.frequency.setValueAtTime(2500, now)
        sprayFilter.frequency.exponentialRampToValueAtTime(4000, now + 0.2)

        const sprayGain = this.context.createGain()
        sprayGain.gain.setValueAtTime(0, now)
        sprayGain.gain.linearRampToValueAtTime(this.chimeVolume * 0.3 * (0.4 + intensity * 0.6), now + 0.03)
        sprayGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)

        spray.connect(sprayFilter)
        sprayFilter.connect(sprayGain)
        sprayGain.connect(this.masterGain)
        sprayGain.connect(this.reverb.input)
        spray.start(now)
        spray.stop(now + 0.3)
    }

    playWaveCrash(intensity)
    {
        if(!this.ready)
            return

        const now = this.context.currentTime
        const peak = this.crashVolume * intensity

        if(peak < 0.001)
            return

        // The crash proper: noise swelling in slowly (crashes aren't clicks)
        // through a lowpass that darkens as the whitewater collapses
        const body = this.context.createBufferSource()
        body.buffer = this.getNoiseBuffer()
        body.loop = true

        const bodyFilter = this.context.createBiquadFilter()
        bodyFilter.type = 'lowpass'
        bodyFilter.Q.value = 0.9
        bodyFilter.frequency.setValueAtTime(1600, now)
        bodyFilter.frequency.exponentialRampToValueAtTime(350, now + 2)

        const bodyGain = this.context.createGain()
        bodyGain.gain.setValueAtTime(0, now)
        bodyGain.gain.linearRampToValueAtTime(peak, now + 0.18)
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5)

        body.connect(bodyFilter)
        bodyFilter.connect(bodyGain)
        bodyGain.connect(this.masterGain)
        bodyGain.connect(this.reverb.input)
        body.start(now)
        body.stop(now + 2.6)

        // A short high band for the initial spray bite
        const spray = this.context.createBufferSource()
        spray.buffer = this.getNoiseBuffer()
        spray.loop = true

        const sprayFilter = this.context.createBiquadFilter()
        sprayFilter.type = 'bandpass'
        sprayFilter.Q.value = 0.8
        sprayFilter.frequency.value = 3000

        const sprayGain = this.context.createGain()
        sprayGain.gain.setValueAtTime(0, now)
        sprayGain.gain.linearRampToValueAtTime(peak * 0.3, now + 0.08)
        sprayGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)

        spray.connect(sprayFilter)
        sprayFilter.connect(sprayGain)
        sprayGain.connect(this.masterGain)
        sprayGain.connect(this.reverb.input)
        spray.start(now)
        spray.stop(now + 0.45)
    }

    playThunder()
    {
        if(!this.ready)
            return

        const now = this.context.currentTime
        const peak = this.thunderVolume

        if(peak < 0.001)
            return

        // Distant rumble: noise swelling in, darkening fast as it decays
        const body = this.context.createBufferSource()
        body.buffer = this.getNoiseBuffer()
        body.loop = true

        const bodyFilter = this.context.createBiquadFilter()
        bodyFilter.type = 'lowpass'
        bodyFilter.Q.value = 0.9
        bodyFilter.frequency.setValueAtTime(700, now)
        bodyFilter.frequency.exponentialRampToValueAtTime(90, now + 3)

        const bodyGain = this.context.createGain()
        bodyGain.gain.setValueAtTime(0, now)
        bodyGain.gain.linearRampToValueAtTime(peak, now + 0.25)
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 4)

        body.connect(bodyFilter)
        bodyFilter.connect(bodyGain)
        bodyGain.connect(this.masterGain)
        bodyGain.connect(this.reverb.input)
        body.start(now)
        body.stop(now + 4.1)

        // Sub thump under the swell
        const sub = this.context.createOscillator()
        sub.type = 'sine'
        sub.frequency.setValueAtTime(55, now)
        sub.frequency.exponentialRampToValueAtTime(38, now + 1.5)

        const subGain = this.context.createGain()
        subGain.gain.setValueAtTime(0, now)
        subGain.gain.linearRampToValueAtTime(peak * 0.6, now + 0.15)
        subGain.gain.exponentialRampToValueAtTime(0.0001, now + 2)

        sub.connect(subGain)
        subGain.connect(this.masterGain)
        sub.start(now)
        sub.stop(now + 2.1)
    }

    playWhoosh({ startFrequency = 400, endFrequency = 1800, duration = 0.45, volume = null, glint = true } = {})
    {
        if(!this.ready)
            return

        const now = this.context.currentTime
        const peak = volume === null ? this.chimeVolume * 0.8 : volume

        // Breathy noise sweep
        const source = this.context.createBufferSource()
        source.buffer = this.getNoiseBuffer()
        source.loop = true

        const filter = this.context.createBiquadFilter()
        filter.type = 'bandpass'
        filter.Q.value = 1.2
        filter.frequency.setValueAtTime(startFrequency, now)
        filter.frequency.exponentialRampToValueAtTime(endFrequency, now + duration * 0.66)

        const gain = this.context.createGain()
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(peak, now + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

        source.connect(filter)
        filter.connect(gain)
        gain.connect(this.masterGain)
        gain.connect(this.reverb.input)
        source.start(now)
        source.stop(now + duration + 0.05)

        if(!glint)
            return

        // Harmonic glint: a soft fifth bending up into tune, mostly reverb
        const glintOscillator = this.context.createOscillator()
        glintOscillator.type = 'sine'
        glintOscillator.frequency.setValueAtTime(622.25, now)
        glintOscillator.frequency.linearRampToValueAtTime(659.25, now + 0.08) // E5

        const glintGain = this.context.createGain()
        glintGain.gain.setValueAtTime(0, now)
        glintGain.gain.linearRampToValueAtTime(this.chimeVolume * 0.4, now + 0.03)
        glintGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)

        glintOscillator.connect(glintGain)
        glintGain.connect(this.reverb.input)
        glintOscillator.start(now)
        glintOscillator.stop(now + 1.3)
    }

    update()
    {
        if(!this.ready)
            return

        const playerState = this.state.player
        const windState = this.state.wind
        const sunState = this.state.sun
        const now = this.context.currentTime

        // Wind follows player speed and gusts, and swells while falling fast.
        // Squared speed curve keeps it a whisper at cruising pace and only
        // lets it breathe at genuinely high speed
        const speedNorm = Math.min(playerState.horizontalSpeed / 40, 1)
        const fallNorm = playerState.velocity[1] < 0 ? Math.min(- playerState.velocity[1] / 25, 1) : 0
        const windAmount = Math.min(0.25 + speedNorm * speedNorm * 0.55 + windState.strength * 0.35 + fallNorm * 0.4, 1)
        this.wind.filter.frequency.setTargetAtTime(300 + windAmount * 900, now, 0.4)
        this.wind.gain.gain.setTargetAtTime(this.windVolume * windAmount, now, 0.4)

        // Rain hiss follows the weather intensity
        this.rain.gain.gain.setTargetAtTime(this.rainVolume * this.state.weather.rainIntensity, now, 0.5)

        // Campfire crackle: bed + irregular pops near a live night fire
        const campfires = this.view.campfires

        if(campfires && this.fire)
        {
            const proximity = Math.max(0, 1 - campfires.nearestDistance / 25)
            const fireAmount = proximity * proximity * campfires.presence

            this.fire.gain.gain.setTargetAtTime(this.fireVolume * fireAmount * 0.5, now, 0.3)

            if(fireAmount > 0.02 && this.time.elapsed > this.nextCrackleTime)
            {
                this.nextCrackleTime = this.time.elapsed + 0.09 + Math.random() * (0.5 - fireAmount * 0.35)
                this.playCracklePop(fireAmount)

                // The occasional double-snap
                if(Math.random() < 0.17)
                    setTimeout(() => { if(this.ready) this.playCracklePop(fireAmount * 0.5) }, 40)
            }
        }

        // Crossfade pad voicings with the day cycle
        const dayness = Math.min(Math.max(sunState.position.y * 4 + 0.5, 0), 1)
        this.pad.day.gain.gain.setTargetAtTime(dayness, now, 2)
        this.pad.night.gain.gain.setTargetAtTime(1 - dayness, now, 2)

        // Chimes follow the light: major pentatonic by day, minor at night.
        // Hysteresis avoids flapping at dawn/dusk; each crossing rings a
        // little hour-chime arpeggio in the new scale
        const targetScale = dayness > 0.6 ? this.scales.major : (dayness < 0.4 ? this.scales.minor : this.chimeFrequencies)

        if(targetScale !== this.chimeFrequencies)
        {
            this.chimeFrequencies = targetScale

            for(let i = 0; i < 3; i++)
                this.playChime(targetScale[i * 2] * 2, this.chimeVolume * 0.5, 2, i * 0.15)
        }

        // Flow adds a high harmonic voice as the player chains tricks
        this.pad.flow.gain.gain.setTargetAtTime(playerState.flow * this.flowPadVolume, now, 0.5)

        // Long flights hang on a soft suspended 4th, resolved by the landing root
        const suspended = !playerState.grounded && playerState.airTime > 2
        this.sus.gain.gain.setTargetAtTime(suspended ? this.susVolume : 0, now, 0.6)

        // Reset the jump melody after resting on the ground for a while
        if(playerState.grounded)
        {
            this.groundedTime += this.time.delta

            if(this.groundedTime > this.melodyResetDelay)
            {
                this.melodyIndex = 0
                this.melodyBuffer.length = 0
            }
        }
        else
        {
            this.groundedTime = 0
        }

        // The ocean keeps time: a continuous surf wash near the sand, plus a
        // crash and a low root pluck as each wave breaks nearby
        const waveSets = this.state.waveSets

        if(waveSets)
        {
            const breakX = this.state.terrains.getShoreX(playerState.position.current[2]) + waveSets.DBreak
            const distance = Math.abs(playerState.position.current[0] - breakX)
            const attenuation = Math.max(0, 1 - distance / 140)

            // Surf bed swells as a set shoals in and peaks while the
            // whitewater bore rushes up; squared proximity still favors the
            // beach but carries well inland
            const proximity = Math.max(0, 1 - distance / 110)
            let activity = 0

            for(const set of waveSets.sets)
                activity += set.foamIntensity + Math.max(0, set.amplitude * (1 - set.frontD / 40))

            activity = Math.min(activity, 1)

            this.surf.gain.gain.setTargetAtTime(this.surfVolume * proximity * proximity * (0.35 + activity * 0.65), now, 0.5)
            this.surf.filter.frequency.setTargetAtTime(500 + activity * 400, now, 0.5)

            for(let i = 0; i < waveSets.sets.length; i++)
            {
                const set = waveSets.sets[i]
                const broke = set.foamIntensity > 0 && !(this.waveFoamPrev[i] > 0)
                this.waveFoamPrev[i] = set.foamIntensity

                if(!broke || this.time.elapsed < this.nextWavePluckTime || attenuation < 0.05)
                    continue

                this.nextWavePluckTime = this.time.elapsed + 2
                this.playChime(110, this.chimeVolume * 0.5 * attenuation * (0.5 + set.baseAmplitude * 0.7), 3.5)
                this.playWaveCrash(attenuation * (0.4 + set.baseAmplitude * 0.8))
            }
        }

        // Glide shimmer fades in while descending with jump held
        const gliding = !playerState.grounded && playerState.velocity[1] < 0 && this.state.controls.keys.down.jump
        const descentFactor = Math.min(- playerState.velocity[1] / 10, 1)
        this.glide.gain.gain.setTargetAtTime(gliding ? this.glideVolume * (0.5 + descentFactor) : 0, now, 0.25)

        if(gliding)
            this.glide.filter.frequency.setTargetAtTime(1200 + descentFactor * 800, now, 0.25)

        // Soft plucks while running, pitched by the terrain elevation so
        // hills read as rising and falling phrases
        if(playerState.grounded && playerState.horizontalSpeed > 4 && this.time.elapsed > this.nextPluckTime)
        {
            const speedRatio = Math.min(playerState.horizontalSpeed / 30, 1)
            this.nextPluckTime = this.time.elapsed + 2.4 - speedRatio * 1.2

            const scaleIndex = Math.abs(Math.floor(playerState.position.current[1] / 2.5)) % 6
            this.playChime(this.chimeFrequencies[scaleIndex] * 2, this.chimeVolume * 0.35, 1.2)
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
        folder.add(this, 'glideVolume').min(0).max(0.2).step(0.005)
        folder.add(this, 'flowPadVolume').min(0).max(0.15).step(0.005)
        folder.add(this, 'susVolume').min(0).max(0.15).step(0.005)
        folder.add(this, 'surfVolume').min(0).max(0.6).step(0.01)
        folder.add(this, 'crashVolume').min(0).max(0.8).step(0.01)
        folder.add(this, 'rainVolume').min(0).max(0.5).step(0.01)
        folder.add(this, 'thunderVolume').min(0).max(1).step(0.01)
        folder.add(this, 'fireVolume').min(0).max(0.5).step(0.01)
        folder.add(this, 'reverbVolume').min(0).max(1).step(0.01).onChange(() =>
        {
            if(this.ready)
                this.reverb.output.gain.setTargetAtTime(this.reverbVolume, this.context.currentTime, 0.1)
        })
    }
}
