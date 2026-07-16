import EventsEmitter from 'events'

import Game from '@/Game.js'
import State from '@/State/State.js'

export default class Controls
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()

        this.events = new EventsEmitter()

        // Analog stick (touch joystick) — angle is relative to the camera, applied in Player.getInputRotation()
        this.stick = { active: false, angle: 0 }

        this.setKeys()
        this.setPointer()

        this.events.on('debugDown', () =>
        {
            this.game.debug.toggle()
        })
    }

    setKeys()
    {
        this.keys = {}
        
        // Map
        this.keys.map = [
            {
                codes: [ 'KeyW' ],
                name: 'forward'
            },
            {
                codes: [ 'KeyD' ],
                name: 'strafeRight'
            },
            {
                codes: [ 'KeyS' ],
                name: 'backward'
            },
            {
                codes: [ 'KeyA' ],
                name: 'strafeLeft'
            },
            // Arrow keys rotate the camera view
            {
                codes: [ 'ArrowUp' ],
                name: 'lookUp'
            },
            {
                codes: [ 'ArrowDown' ],
                name: 'lookDown'
            },
            {
                codes: [ 'ArrowLeft' ],
                name: 'lookLeft'
            },
            {
                codes: [ 'ArrowRight' ],
                name: 'lookRight'
            },
            {
                codes: [ 'ShiftLeft', 'ShiftRight' ],
                name: 'boost'
            },
            {
                codes: [ 'KeyB' ],
                name: 'debug'
            },
            {
                codes: [ 'Space' ],
                name: 'jump'
            },
            {
                codes: [ 'ControlLeft', 'KeyC' ],
                name: 'crouch'
            },
        ]

        // Down keys
        this.keys.down = {}

        for(const mapItem of this.keys.map)
        {
            this.keys.down[mapItem.name] = false
        }

        // Find in map per code
        this.keys.findPerCode = (key) =>
        {
            return this.keys.map.find((mapItem) => mapItem.codes.includes(key))
        }

        // Event
        window.addEventListener('keydown', (event) =>
        {
            if(event.repeat)
                return

            const mapItem = this.keys.findPerCode(event.code)

            if(mapItem)
            {
                this.events.emit('keyDown', mapItem.name)
                this.events.emit(`${mapItem.name}Down`)
                this.keys.down[mapItem.name] = true
            }
        })

        window.addEventListener('keyup', (event) =>
        {
            const mapItem = this.keys.findPerCode(event.code)
            
            if(mapItem)
            {
                this.events.emit('keyUp', mapItem.name)
                this.events.emit(`${mapItem.name}Up`)
                this.keys.down[mapItem.name] = false
            }
        })
    }

    setButton(name, isDown)
    {
        if(this.keys.down[name] === isDown)
            return

        this.keys.down[name] = isDown
        this.events.emit(isDown ? 'keyDown' : 'keyUp', name)
        this.events.emit(`${name}${isDown ? 'Down' : 'Up'}`)
    }

    setPointer()
    {
        this.pointer = {}
        this.pointer.down = false
        this.pointer.deltaTemp = { x: 0, y: 0 }
        this.pointer.delta = { x: 0, y: 0 }

        // The camera drags with the first pointer not claimed by the touch UI (joystick/buttons)
        this.pointer.activeId = null
        this.pointer.last = { x: 0, y: 0 }
        this.pointer.claimed = new Set()

        this.pointer.claim = (id) =>
        {
            this.pointer.claimed.add(id)

            if(this.pointer.activeId === id)
            {
                this.pointer.activeId = null
                this.pointer.down = false
            }
        }

        this.pointer.release = (id) =>
        {
            this.pointer.claimed.delete(id)

            if(this.pointer.activeId === id)
            {
                this.pointer.activeId = null
                this.pointer.down = false
            }
        }

        window.addEventListener('pointerdown', (event) =>
        {
            if(this.pointer.claimed.has(event.pointerId) || this.pointer.activeId !== null)
                return

            this.pointer.activeId = event.pointerId
            this.pointer.down = true
            this.pointer.last.x = event.clientX
            this.pointer.last.y = event.clientY
        })

        window.addEventListener('pointermove', (event) =>
        {
            if(this.state.viewport?.pointerLock.active)
            {
                this.pointer.deltaTemp.x += event.movementX
                this.pointer.deltaTemp.y += event.movementY
            }
            else if(event.pointerId === this.pointer.activeId)
            {
                this.pointer.deltaTemp.x += event.clientX - this.pointer.last.x
                this.pointer.deltaTemp.y += event.clientY - this.pointer.last.y
                this.pointer.last.x = event.clientX
                this.pointer.last.y = event.clientY
            }
        })

        const onPointerEnd = (event) =>
        {
            this.pointer.claimed.delete(event.pointerId)

            if(event.pointerId === this.pointer.activeId)
            {
                this.pointer.activeId = null
                this.pointer.down = false
            }
        }

        window.addEventListener('pointerup', onPointerEnd)
        window.addEventListener('pointercancel', onPointerEnd)
    }

    update()
    {
        this.pointer.delta.x = this.pointer.deltaTemp.x
        this.pointer.delta.y = this.pointer.deltaTemp.y

        this.pointer.deltaTemp.x = 0
        this.pointer.deltaTemp.y = 0
    }
}