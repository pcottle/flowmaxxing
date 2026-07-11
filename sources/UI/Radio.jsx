import { useEffect, useState } from 'react'

import './Radio.css'

// Stations are plain YouTube videos dressed up as FM frequencies.
// The iframe only exists while tuned in, so YouTube costs nothing until then.
// freq is optional — omit it and the station gets a famous dial position
// (each handed out once), then random FM frequencies once those run out.
const RAW_STATIONS = [
    { id: 'NDQ3eafSKXo' },
    { id: '8CdPZ6VQucg' },
    { id: 'S4id5sFAma4' },
    { id: 'NFa7KlLyzGY' },
    { id: 'wyFIiEtpTf0' },
    { id: 'JZ7ATszdEqo', vibe: 'intense' },
    { id: 'hZOkwm52Nco', vibe: 'intense' },
    { id: 'H1d_aEantvc', vibe: 'intense' }
]

// Legendary dial positions: KEXP Seattle, Hot 97 + Z100 + KISS FM New York,
// KROQ + KIIS + Power 106 Los Angeles, KCRW Santa Monica, WBLS New York,
// WDIA Memphis, KMEL San Francisco, WKRP Cincinnati (fictional but immortal)
const FAMOUS_FREQS = [ '90.3', '97.1', '100.3', '98.7', '106.7', '102.7', '105.9', '89.9', '107.5', '101.1', '106.1', '103.5' ]

function assignFrequencies(stations)
{
    const used = new Set(stations.map((station) => station.freq).filter(Boolean))
    const famous = FAMOUS_FREQS.filter((freq) => !used.has(freq))

    return stations.map((station) =>
    {
        if(station.freq)
            return station

        let freq = famous.shift()

        // Famous dial exhausted: random valid US FM frequency (odd tenths,
        // 87.9-107.9), rerolled until unique
        while(!freq || used.has(freq))
            freq = ((879 + Math.floor(Math.random() * 101) * 2) / 10).toFixed(1)

        used.add(freq)

        return { ...station, freq }
    })
}

const STATIONS = assignFrequencies(RAW_STATIONS)

// Background-music level, not foreground-video level (0-100)
const RADIO_VOLUME = 35

// Skip the intro: tune in 60s deep so the song reads immediately
const RADIO_START = 17

// No volume URL param exists — ask the player over the widget postMessage API.
// The player isn't ready the instant the iframe loads, so retry a few times.
function setEmbedVolume(iframe)
{
    if(!iframe?.contentWindow)
        return

    const send = () => iframe.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'setVolume', args: [ RADIO_VOLUME ] }),
        '*'
    )

    send()
    setTimeout(send, 400)
    setTimeout(send, 1200)
    setTimeout(send, 2500)
}

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
                            src={ `https://www.youtube-nocookie.com/embed/${tuned}?autoplay=1&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&start=${RADIO_START}` }
                            title="radio"
                            allow="autoplay; encrypted-media"
                            onLoad={ (event) => setEmbedVolume(event.currentTarget) }
                        ></iframe>
                    </div>
                }

                <div className="radio__stations">
                    { STATIONS.map((station) =>
                        <button
                            key={ station.id }
                            className={ [
                                'radio__station',
                                station.vibe === 'intense' ? 'radio__station--intense' : '',
                                tuned === station.id ? 'radio__station--live' : ''
                            ].join(' ').trim() }
                            onPointerDown={ () => tune(station.id) }
                        >
                            <span className="radio__freq">{ station.freq }</span>
                            <span className="radio__title">
                                { station.vibe === 'intense' && <span className="radio__zap">⚡⚡⚡ </span> }
                                { titles[station.id] ?? 'waitingfor.ai fm' }
                            </span>
                            { tuned === station.id && <Equalizer /> }
                        </button>
                    ) }
                </div>
            </div>
        </div>
    )
}
