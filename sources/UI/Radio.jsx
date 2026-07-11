import { useEffect, useState } from 'react'

import './Radio.css'

// Stations are plain YouTube videos dressed up as FM frequencies.
// The iframe only exists while tuned in, so YouTube costs nothing until then.
const STATIONS = [
    { id: 'NDQ3eafSKXo', freq: '88.1' },
    { id: 'NFa7KlLyzGY', freq: '104.6' }
]

function Equalizer()
{
    return (
        <span className="radio__eq">
            <span></span><span></span><span></span>
        </span>
    )
}

export default function Radio()
{
    const [ open, setOpen ] = useState(false)
    const [ tuned, setTuned ] = useState(null)
    const [ titles, setTitles ] = useState({})

    // Real titles via oEmbed (no API key). Lofi channels often "blank" their
    // titles with invisible filler characters — treat those as missing too
    useEffect(() =>
    {
        for(const station of STATIONS)
        {
            fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${station.id}&format=json`)
                .then((response) => response.ok ? response.json() : null)
                .then((data) =>
                {
                    const title = (data?.title ?? '').replace(/[\sㅤ⠀]+/g, ' ').trim()

                    if(title !== '')
                        setTitles((titles) => ({ ...titles, [station.id]: title }))
                })
                .catch(() => {})
        }
    }, [])

    // Radio semantics: tapping the live station turns it off, no pausing
    const tune = (id) => setTuned(tuned === id ? null : id)

    return (
        <div className="radio">
            <button
                className={ open ? 'radio__pill radio__pill--open' : 'radio__pill' }
                onPointerDown={ () => setOpen(!open) }
                aria-label="radio"
            >
                { tuned ? <Equalizer /> : <span className="radio__note">♪</span> }
                radio
            </button>

            <div className={ open ? 'radio__panel radio__panel--open' : 'radio__panel' }>
                { tuned &&
                    <div className="radio__screen">
                        <iframe
                            key={ tuned }
                            src={ `https://www.youtube-nocookie.com/embed/${tuned}?autoplay=1&controls=0&modestbranding=1&rel=0&playsinline=1` }
                            title="radio"
                            allow="autoplay; encrypted-media"
                        ></iframe>
                    </div>
                }

                <div className="radio__stations">
                    { STATIONS.map((station) =>
                        <button
                            key={ station.id }
                            className={ tuned === station.id ? 'radio__station radio__station--live' : 'radio__station' }
                            onPointerDown={ () => tune(station.id) }
                        >
                            <span className="radio__freq">{ station.freq }</span>
                            <span className="radio__title">{ titles[station.id] ?? 'waitingfor.ai fm' }</span>
                            { tuned === station.id && <Equalizer /> }
                        </button>
                    ) }
                </div>
            </div>
        </div>
    )
}
