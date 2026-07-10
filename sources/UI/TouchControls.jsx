import { useRef } from 'react'

import State from '@/State/State.js'

import './TouchControls.css'

const DEAD_ZONE = 12
const NUB_RADIUS = 40
const MOVEMENT_KEYS = [ 'forward', 'backward', 'strafeLeft', 'strafeRight' ]

// Throws on pointer ids the browser no longer tracks (e.g. finger already lifted)
function capturePointer(element, pointerId)
{
    try { element.setPointerCapture(pointerId) }
    catch { /* keep going without capture */ }
}

function Joystick()
{
    const nubRef = useRef(null)
    const pointerIdRef = useRef(null)
    const centerRef = useRef({ x: 0, y: 0 })

    const getControls = () => State.getInstance()?.controls

    const reset = () =>
    {
        const controls = getControls()

        if(controls)
        {
            controls.stick.active = false

            for(const name of MOVEMENT_KEYS)
                controls.setButton(name, false)

            if(pointerIdRef.current !== null)
                controls.pointer.release(pointerIdRef.current)
        }

        pointerIdRef.current = null

        if(nubRef.current)
            nubRef.current.style.transform = 'translate(0px, 0px)'
    }

    const onPointerDown = (event) =>
    {
        const controls = getControls()

        if(!controls || pointerIdRef.current !== null)
            return

        pointerIdRef.current = event.pointerId
        capturePointer(event.currentTarget, event.pointerId)
        controls.pointer.claim(event.pointerId)

        const rect = event.currentTarget.getBoundingClientRect()
        centerRef.current.x = rect.left + rect.width * 0.5
        centerRef.current.y = rect.top + rect.height * 0.5

        onPointerMove(event)
    }

    const onPointerMove = (event) =>
    {
        const controls = getControls()

        if(!controls || event.pointerId !== pointerIdRef.current)
            return

        const dx = event.clientX - centerRef.current.x
        const dy = event.clientY - centerRef.current.y
        const magnitude = Math.hypot(dx, dy)

        if(magnitude > DEAD_ZONE)
        {
            const angle = Math.atan2(- dx, - dy)
            controls.stick.active = true
            controls.stick.angle = angle

            // Quantize to 8-way booleans so held-key mechanics (carve, roll, glide) keep working
            controls.setButton('forward', Math.abs(angle) < Math.PI * 0.375)
            controls.setButton('backward', Math.abs(angle) > Math.PI * 0.625)
            controls.setButton('strafeLeft', angle > Math.PI * 0.125 && angle < Math.PI * 0.875)
            controls.setButton('strafeRight', angle < - Math.PI * 0.125 && angle > - Math.PI * 0.875)
        }
        else
        {
            controls.stick.active = false

            for(const name of MOVEMENT_KEYS)
                controls.setButton(name, false)
        }

        if(nubRef.current)
        {
            const clamp = magnitude > NUB_RADIUS ? NUB_RADIUS / magnitude : 1
            nubRef.current.style.transform = `translate(${dx * clamp}px, ${dy * clamp}px)`
        }
    }

    const onPointerEnd = (event) =>
    {
        if(event.pointerId === pointerIdRef.current)
            reset()
    }

    return (
        <div
            className="touch-joystick"
            onPointerDown={ onPointerDown }
            onPointerMove={ onPointerMove }
            onPointerUp={ onPointerEnd }
            onPointerCancel={ onPointerEnd }
            onLostPointerCapture={ onPointerEnd }
        >
            <div className="touch-joystick__nub" ref={ nubRef }></div>
        </div>
    )
}

function TouchButton({ name, label, className })
{
    const pointerIdRef = useRef(null)

    const getControls = () => State.getInstance()?.controls

    const onPointerDown = (event) =>
    {
        const controls = getControls()

        if(!controls || pointerIdRef.current !== null)
            return

        pointerIdRef.current = event.pointerId
        capturePointer(event.currentTarget, event.pointerId)
        controls.pointer.claim(event.pointerId)
        controls.setButton(name, true)
    }

    const onPointerEnd = (event) =>
    {
        if(event.pointerId !== pointerIdRef.current)
            return

        const controls = getControls()

        if(controls)
        {
            controls.setButton(name, false)
            controls.pointer.release(event.pointerId)
        }

        pointerIdRef.current = null
    }

    return (
        <div
            className={ `touch-button ${className}` }
            onPointerDown={ onPointerDown }
            onPointerUp={ onPointerEnd }
            onPointerCancel={ onPointerEnd }
            onLostPointerCapture={ onPointerEnd }
        >
            { label }
        </div>
    )
}

export default function TouchControls()
{
    return (
        <div className="touch-controls">
            <Joystick />
            <TouchButton name="jump" label="jump" className="touch-button--jump" />
            <TouchButton name="boost" label="dash" className="touch-button--dash" />
        </div>
    )
}
