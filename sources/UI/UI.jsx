import './UI.css'
import Controls from './Controls.jsx'

export default function UI()
{
    return (
        <div className="ui">
            <div className="mobile-warning">
                This experience isn't suited for mobile devices
            </div>
            <Controls />
        </div>
    )
}
