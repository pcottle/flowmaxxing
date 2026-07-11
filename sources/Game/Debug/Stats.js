import StatsJs from 'stats.js'

export default class Stats
{
    constructor()
    {
        this.instance = new StatsJs()
        this.instance.showPanel(3)

        // Bottom right instead of stats.js's default top left,
        // matching the debug menu's right inset
        this.instance.dom.style.top = 'auto'
        this.instance.dom.style.left = 'auto'
        this.instance.dom.style.bottom = '0'
        this.instance.dom.style.right = '15px'

        this.active = false
        this.hidden = false
        this.max = 40
        this.ignoreMaxed = true

        this.activate()
    }

    show()
    {
        this.hidden = false
        this.instance.dom.style.display = 'block'
    }

    hide()
    {
        this.hidden = true
        this.instance.dom.style.display = 'none'
    }

    activate()
    {
        this.active = true

        document.body.appendChild(this.instance.dom)
    }

    deactivate()
    {
        this.active = false

        document.body.removeChild(this.instance.dom)
    }

    setRenderPanel(_context)
    {
        this.render = {}
        this.render.context = _context
        this.render.extension = this.render.context.getExtension('EXT_disjoint_timer_query_webgl2')
        this.render.panel = this.instance.addPanel(new StatsJs.Panel('Render (ms)', '#f8f', '#212'))

        const webGL2 = typeof WebGL2RenderingContext !== 'undefined' && _context instanceof WebGL2RenderingContext

        if(!webGL2 || !this.render.extension)
        {
            this.deactivate()
        }
    }

    beforeRender()
    {
        if(!this.active || this.hidden)
        {
            return
        }

        // Setup
        this.queryCreated = false
        let queryResultAvailable = false

        // Test if query result available
        if(this.render.query)
        {
            queryResultAvailable = this.render.context.getQueryParameter(this.render.query, this.render.context.QUERY_RESULT_AVAILABLE)
            const disjoint = this.render.context.getParameter(this.render.extension.GPU_DISJOINT_EXT)
                
            if(queryResultAvailable && !disjoint)
            {
                const elapsedNanos = this.render.context.getQueryParameter(this.render.query, this.render.context.QUERY_RESULT)
                const panelValue = Math.min(elapsedNanos / 1000 / 1000, this.max)

                if(panelValue === this.max && this.ignoreMaxed)
                {
                    
                }
                else
                {
                    this.render.panel.update(panelValue, this.max)
                }
            }
        }

        // If query result available or no query yet
        if(queryResultAvailable || !this.render.query)
        {
            // Create new query
            this.queryCreated = true
            this.render.query = this.render.context.createQuery()
            this.render.context.beginQuery(this.render.extension.TIME_ELAPSED_EXT, this.render.query)
        }

    }

    afterRender()
    {
        if(!this.active || this.hidden)
        {
            return
        }
        
        // End the query (result will be available "later")
        if(this.queryCreated)
        {
            this.render.context.endQuery(this.render.extension.TIME_ELAPSED_EXT)
        }
    }

    update()
    {
        if(!this.active || this.hidden)
        {
            return
        }

        this.instance.update()
    }

    destroy()
    {
        this.deactivate()
    }
}
