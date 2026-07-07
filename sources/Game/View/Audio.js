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
        this.flowPadVolume = 0.04
        this.susVolume = 0.045

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

        // Flow voice: a high harmonic pair that fades in as the player's flow
        // builds (bypasses the pad lowpass so it stays airy)
        this.pad.flow = {}
        this.pad.flow.gain = this.context.createGain()
        this.pad.flow.gain.gain.value = 0
        this.pad.flow.gain.connect(this.masterGain)
        this.pad.flow.gain.connect(this.reverb.input)

        for(const frequency of [440, 659.25]) // A4, E5
        {
            for(const detune of [- 3, 3])
            {
                const oscillator = this.context.createOscillator()
                oscillator.type = 'sine'
                oscillator.frequency.value = frequency
                oscillator.detune.value = detune
                oscillator.connect(this.pad.flow.gain)
                oscillator.start()
            }
        }
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

        // A low root pluck as each wave breaks nearby: the ocean keeps time
        const waveSets = this.state.waveSets

        if(waveSets)
        {
            for(let i = 0; i < waveSets.sets.length; i++)
            {
                const set = waveSets.sets[i]
                const broke = set.foamIntensity > 0 && !(this.waveFoamPrev[i] > 0)
                this.waveFoamPrev[i] = set.foamIntensity

                if(!broke || this.time.elapsed < this.nextWavePluckTime)
                    continue

                const breakX = this.state.terrains.getShoreX(playerState.position.current[2]) + waveSets.DBreak
                const distance = Math.abs(playerState.position.current[0] - breakX)
                const attenuation = Math.max(0, 1 - distance / 80)

                if(attenuation < 0.05)
                    continue

                this.nextWavePluckTime = this.time.elapsed + 2
                this.playChime(110, this.chimeVolume * 0.5 * attenuation * (0.5 + set.baseAmplitude * 0.7), 3.5)
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
        folder.add(this, 'reverbVolume').min(0).max(1).step(0.01).onChange(() =>
        {
            if(this.ready)
                this.reverb.output.gain.setTargetAtTime(this.reverbVolume, this.context.currentTime, 0.1)
        })
    }
}
