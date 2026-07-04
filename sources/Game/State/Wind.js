import Game from '@/Game.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class Wind
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.baseStrength = 0.4
        this.gustStrength = 0.6
        this.gustAttack = 1 // Seconds
        this.gustRelease = 4 // Seconds
        this.gustIntervalMin = 20 // Seconds
        this.gustIntervalMax = 60 // Seconds

        this.strength = this.baseStrength
        this.windTime = 0
        this.gustStartTime = - Infinity
        this.gustNextTime = 10

        this.setDebug()
    }

    update()
    {
        const time = this.state.time

        // Slow drift from layered sines
        let strength = this.baseStrength
        strength += 0.2 * Math.sin(time.elapsed * 0.11)
        strength += 0.2 * Math.sin(time.elapsed * 0.043 + 2)

        // Occasional gust
        if(time.elapsed > this.gustNextTime)
        {
            this.gustStartTime = time.elapsed
            this.gustNextTime = time.elapsed + this.gustIntervalMin + Math.random() * (this.gustIntervalMax - this.gustIntervalMin)
        }

        const gustAge = time.elapsed - this.gustStartTime

        if(gustAge < this.gustAttack + this.gustRelease)
        {
            const envelope = gustAge < this.gustAttack
                ? gustAge / this.gustAttack
                : 1 - (gustAge - this.gustAttack) / this.gustRelease
            strength += envelope * this.gustStrength
        }

        this.strength = Math.min(Math.max(strength, 0), 1)

        // Accumulated so gusts speed the wind scroll without discontinuity
        this.windTime += time.delta * (0.5 + this.strength)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('state/wind')

        folder.add(this, 'baseStrength').min(0).max(1).step(0.01)
        folder.add(this, 'gustStrength').min(0).max(1).step(0.01)
        folder.add(this, 'gustIntervalMin').min(1).max(120).step(1)
        folder.add(this, 'gustIntervalMax').min(1).max(120).step(1)
    }
}
