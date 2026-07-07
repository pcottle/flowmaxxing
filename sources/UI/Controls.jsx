import './Controls.css'

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
    return (
        <div className="controls">
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
