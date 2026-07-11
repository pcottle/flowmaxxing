import State from '@/State/State.js'

// Milestone-only analytics: a handful of low-volume gtag events so GA4 can
// answer "did visitors actually play?" — never per-trick or per-frame signals

const onLocalhost = typeof location !== 'undefined'
    && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')

// ?ga_debug lets a dev session send events anyway, flagged into GA4 DebugView
const debugSend = typeof location !== 'undefined'
    && new URLSearchParams(location.search).has('ga_debug')

export function track(name, params = {})
{
    // gtag missing (headless tests, blocked script), debug menu open, or
    // plain localhost dev — all sessions we don't want in the data
    if(typeof window === 'undefined' || typeof window.gtag !== 'function')
        return

    if(location.hash === '#debug')
        return

    if(onLocalhost && !debugSend)
        return

    window.gtag('event', name, debugSend ? { ...params, debug_mode: true } : params)
}

export default class Analytics
{
    constructor()
    {
        this.state = State.getInstance()

        this.setPlayStart()
        this.setCourses()
    }

    setPlayStart()
    {
        // keyDown covers keyboard and the touch joystick actions alike
        const controls = this.state.controls

        const onFirstInput = () =>
        {
            controls.events.off('keyDown', onFirstInput)
            track('play_start')
        }

        controls.events.on('keyDown', onFirstInput)
    }

    setCourses()
    {
        const duration = (course) =>
            Math.round((course.completedAt - course.createdAt) * 10) / 10

        this.state.progressiveBounceCourses.events.on('courseStart', () =>
        {
            track('course_start', { course_type: 'bounce' })
        })

        this.state.progressiveBounceCourses.events.on('courseComplete', ({ course, perfect, streak }) =>
        {
            track('course_complete', { course_type: 'bounce', perfect, streak, duration: duration(course) })
        })

        this.state.obstacleCourses.events.on('courseStart', () =>
        {
            track('course_start', { course_type: 'rings' })
        })

        this.state.obstacleCourses.events.on('courseComplete', ({ course, perfect, streak }) =>
        {
            track('course_complete', { course_type: 'rings', perfect, streak, duration: duration(course) })
        })

        this.state.tideline.events.on('courseStart', () =>
        {
            track('course_start', { course_type: 'tideline' })
        })

        // Tideline only completes on prize collect, so it's always "perfect"
        this.state.tideline.events.on('courseComplete', ({ course }) =>
        {
            track('course_complete', { course_type: 'tideline', perfect: true, duration: duration(course) })
        })
    }
}
