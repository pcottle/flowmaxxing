import './UI.css'
import Controls from './Controls.jsx'
import TouchControls from './TouchControls.jsx'
import EmojiPicker from './EmojiPicker.jsx'

const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches
    || navigator.maxTouchPoints > 0
    || new URLSearchParams(window.location.search).has('touch') // force flag for desktop testing

export default function UI()
{
    return (
        <div className="ui">
            { IS_TOUCH ? <TouchControls /> : <Controls /> }
            <EmojiPicker />
        </div>
    )
}
