import Stats from './Stats.js'
import UI from './UI.js'

export default class Debug
{
    static instance

    static getInstance()
    {
        return Debug.instance
    }

    constructor()
    {
        if(Debug.instance)
            return Debug.instance

        Debug.instance = this

        this.active = true
        this.ui = new UI()
        this.stats = new Stats()

        this.visible = true

        if(location.hash !== '#debug')
            this.hide()
    }

    show()
    {
        this.visible = true
        this.ui.show()
        this.stats.show()

        location.hash = 'debug'
    }

    hide()
    {
        this.visible = false
        this.ui.hide()
        this.stats.hide()

        if(location.hash === '#debug')
            history.replaceState(null, '', location.pathname + location.search)
    }

    toggle()
    {
        if(this.visible)
            this.hide()
        else
            this.show()
    }
}
