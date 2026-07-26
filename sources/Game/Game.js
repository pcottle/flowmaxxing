import Debug from '@/Debug/Debug.js'
import State from '@/State/State.js'
import View from '@/View/View.js'

export default class Game
{
    static instance

    static getInstance()
    {
        return Game.instance
    }

    constructor()
    {
        if(Game.instance)
            return Game.instance

        Game.instance = this
        window.game = this

        this.seed = 'p'
        this.debug = new Debug()
        this.state = new State()
        this.view = new View()
        
        window.addEventListener('resize', () =>
        {
            this.resize()
        })

        // requestAnimationFrame stops firing while the tab is hidden, which
        // froze the world but left the ambient audio sounding its last levels.
        // Tick the simulation and the audio that follows it from an interval
        // instead — no rendering, and the sound keeps matching the weather.
        // The pending rAF callback simply resumes the normal loop on return.
        document.addEventListener('visibilitychange', () =>
        {
            if(document.hidden)
            {
                this.hiddenInterval = window.setInterval(() =>
                {
                    this.state.update()
                    this.view.audio.update()
                }, 60)
            }
            else
            {
                window.clearInterval(this.hiddenInterval)
            }
        })

        this.update()
    }

    update()
    {
        this.state.update()
        this.view.update()

        window.requestAnimationFrame(() =>
        {
            this.update()
        })
    }

    resize()
    {
        this.state.resize()
        this.view.resize()
    }

    destroy()
    {
        
    }
}