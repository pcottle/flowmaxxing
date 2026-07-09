import Game from '@/Game.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class DayCycle
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.autoUpdate = true
        this.startProgresses = [0, 0.75, 0.25] // Day, sunrise, sunset
        this.timeProgress = this.startProgresses[Math.floor(Math.random() * this.startProgresses.length)]
        this.progress = this.timeProgress
        this.duration = 360 // Seconds
        this.goldenHourStretch = 0.6 // 0 = linear time, <1 keeps progress monotonic

        this.setDebug()
    }

    update()
    {
        const time = this.state.time

        if(this.autoUpdate)
        {
            this.timeProgress += time.delta / this.duration

            // Warp progress so dawn/dusk (0.25 / 0.75) linger and noon/midnight pass quickly
            const linearProgress = this.timeProgress % 1
            this.progress = (linearProgress + (this.goldenHourStretch / (Math.PI * 4)) * Math.sin(Math.PI * 4 * linearProgress)) % 1
        }
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('state/dayCycle')

        folder
            .add(this, 'autoUpdate')

        folder
            .add(this, 'progress')
            .min(0)
            .max(1)
            .step(0.001)

        folder
            .add(this, 'duration')
            .min(5)
            .max(900)
            .step(1)

        folder
            .add(this, 'goldenHourStretch')
            .min(0)
            .max(0.95)
            .step(0.01)
    }
}
