import { useEffect, useState } from 'react'

import State from '@/State/State.js'
import { track } from '@/Analytics.js'

import './EmojiPicker.css'

const EMOJIS = [ '👋', '🙂', '😎', '❤️', '🔥', '🌊', '✨', '🌴', '🍆', '💩' ]

export default function EmojiPicker()
{
    // Only offered inside the beach circle, where other players are visible
    const [ inside, setInside ] = useState(false)
    const [ expanded, setExpanded ] = useState(false)

    useEffect(() =>
    {
        const interval = setInterval(() =>
        {
            const isInside = State.getInstance()?.ghosts?.inside ?? false

            setInside(isInside)

            if(!isInside)
                setExpanded(false)
        }, 250)

        return () => clearInterval(interval)
    }, [])

    const pick = (emoji) =>
    {
        State.getInstance()?.ghosts?.setEmoji(emoji)
        track('emoji_send', { emoji })
        setExpanded(false)
    }

    return (
        <div className={ inside ? 'emoji-picker' : 'emoji-picker emoji-picker--hidden' }>
            { expanded && EMOJIS.map((emoji) =>
                <button
                    key={ emoji }
                    className="emoji-picker__item"
                    onPointerDown={ () => pick(emoji) }
                >
                    { emoji }
                </button>
            ) }
            <button
                className={ expanded ? 'emoji-picker__toggle emoji-picker__toggle--open' : 'emoji-picker__toggle' }
                onPointerDown={ () => setExpanded(!expanded) }
            >
                { expanded ? '✕' : '💬' }
            </button>
        </div>
    )
}
