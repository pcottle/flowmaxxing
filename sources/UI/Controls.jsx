import { useEffect, useState } from 'react'

import State from '@/State/State.js'

import './Controls.css'

// Fade the controls out after this long of continuous movement, and back in
// after this long of standing still
const HIDE_AFTER = 10000
const SHOW_AFTER = 10000
const MOVING_SPEED = 1

function Key({ children, wide = false })
{
    return (
        <div className={ wide ? 'key key--wide' : 'key' }>{ children }</div>
    )
}

function Control({ keys, label })
{
    return (
        <div className="control">
            <div className="keys">
                { keys }
            </div>
            <span className="label">{ label }</span>
        </div>
    )
}

export default function Controls()
{
    const [ hidden, setHidden ] = useState(false)

    useEffect(() =>
    {
        let movingSince = null
        let lastMovingTime = 0

        const interval = setInterval(() =>
        {
            const player = State.getInstance()?.player

            if(!player)
                return

            const now = performance.now()
            const moving = player.horizontalSpeed > MOVING_SPEED || Math.abs(player.velocity[1]) > MOVING_SPEED

            if(moving)
            {
                if(movingSince === null)
                    movingSince = now

                lastMovingTime = now

                if(now - movingSince > HIDE_AFTER)
                    setHidden(true)
            }
            else if(now - lastMovingTime > SHOW_AFTER)
            {
                movingSince = null
                setHidden(false)
            }
        }, 250)

        return () => clearInterval(interval)
    }, [])

    return (
        <div className={ hidden ? 'controls controls--hidden' : 'controls' }>
            <Control
                label="move"
                keys={
                    <div className="wasd">
                        <div className="wasd__row"><Key>W</Key></div>
                        <div className="wasd__row">
                            <Key>A</Key>
                            <Key>S</Key>
                            <Key>D</Key>
                        </div>
                    </div>
                }
            />
            <Control label="jump" keys={ <Key wide>Space</Key> } />
            <Control label="dash" keys={ <Key wide>Shift</Key> } />
            <Control label="debug" keys={ <Key>B</Key> } />
        </div>
    )
}
