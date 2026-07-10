import EventsEmitter from 'events'

import Game from '@/Game.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class Weather
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.events = new EventsEmitter()

        this.rainIntervalMin = 90 // Seconds
        this.rainIntervalMax = 240 // Seconds
        this.rainDuration = 30 // Seconds
        this.rainRamp = 3 // Seconds

        this.isRaining = false
        this.rainIntensity = 0
        this.rainStartTime = 0
        this.currentDuration = this.rainDuration
        this.nextRainTime = this.rainIntervalMin + Math.random() * (this.rainIntervalMax - this.rainIntervalMin)

        // Lightning: strikes scheduled only while the rain is heavy, thunder
        // follows on the game clock (never setTimeout) so pauses stay coherent
        this.lightningIntervalMin = 4 // Seconds
        this.lightningIntervalMax = 12 // Seconds
        this.flash = 0
        this.lightningTime = - Infinity
        this.nextLightningTime = Infinity
        this.thunderAt = Infinity

        this.setDebug()
    }

    startRain()
    {
        const time = this.state.time

        this.isRaining = true
        this.rainStartTime = time.elapsed
        this.currentDuration = this.rainDuration
        this.nextLightningTime = time.elapsed + this.lightningIntervalMin + Math.random() * (this.lightningIntervalMax - this.lightningIntervalMin)
        this.events.emit('rainStart')
    }

    stopRain()
    {
        if(!this.isRaining)
            return

        // Clamp the duration to now so the intensity releases through the
        // ramp instead of cutting
        const age = this.state.time.elapsed - this.rainStartTime
        this.currentDuration = Math.min(this.currentDuration, age)
    }

    strike()
    {
        const time = this.state.time

        this.lightningTime = time.elapsed
        this.thunderAt = time.elapsed + 0.4 + Math.random() * 1.1
        this.nextLightningTime = time.elapsed + this.lightningIntervalMin + Math.random() * (this.lightningIntervalMax - this.lightningIntervalMin)
    }

    update()
    {
        const time = this.state.time

        if(!this.isRaining && time.elapsed > this.nextRainTime)
            this.startRain()

        let intensity = 0

        if(this.isRaining)
        {
            const age = time.elapsed - this.rainStartTime

            if(age >= this.currentDuration + this.rainRamp)
            {
                this.isRaining = false
                this.nextRainTime = time.elapsed + this.rainIntervalMin + Math.random() * (this.rainIntervalMax - this.rainIntervalMin)
                this.events.emit('rainStop')
            }
            else
            {
                intensity = Math.min(age / this.rainRamp, 1, (this.currentDuration + this.rainRamp - age) / this.rainRamp)
                intensity = Math.min(Math.max(intensity, 0), 1)
                intensity = intensity * intensity * (3 - 2 * intensity)
            }
        }

        this.rainIntensity = intensity

        // Lightning while the rain is heavy
        if(this.rainIntensity > 0.7 && time.elapsed > this.nextLightningTime)
            this.strike()

        // Double-spike flash decay (main flash plus a dimmer re-flicker)
        const flashAge = time.elapsed - this.lightningTime
        const spikeA = Math.exp(- flashAge * 14)
        const spikeB = flashAge > 0.12 ? 0.6 * Math.exp(- (flashAge - 0.12) * 14) : 0
        this.flash = flashAge >= 0 ? Math.min(Math.max(spikeA, spikeB), 1) : 0

        if(this.flash < 0.001)
            this.flash = 0

        // Thunder trails the flash
        if(time.elapsed > this.thunderAt)
        {
            this.thunderAt = Infinity
            this.events.emit('thunder')
        }
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        this.debug.ui.addQuickAction('☔ rain now', () => { this.startRain() })
        this.debug.ui.addQuickAction('🌂 stop rain', () => { this.stopRain() })
        this.debug.ui.addQuickAction('⚡ strike now', () => { this.strike() })

        const folder = this.debug.ui.getFolder('state/weather')
        folder.add(this, 'rainIntervalMin').min(10).max(600).step(5)
        folder.add(this, 'rainIntervalMax').min(10).max(900).step(5)
        folder.add(this, 'rainDuration').min(5).max(180).step(1)
        folder.add(this, 'rainRamp').min(0.5).max(10).step(0.5)
        folder.add(this, 'lightningIntervalMin').min(1).max(30).step(0.5)
        folder.add(this, 'lightningIntervalMax').min(1).max(60).step(0.5)
    }
}
