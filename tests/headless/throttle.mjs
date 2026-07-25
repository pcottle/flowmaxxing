/**
 * Headless fixed-step verification of the touch-stick analog throttle:
 * stick magnitude scales target speed, intensity ramps up over
 * throttleRampTime (drops instantly), keyboard input stays full-speed.
 * Runs the REAL State layer with the REAL terrain worker in-process.
 */

// Browser global stubs (Controls/Viewport listeners, Debug location)
globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 2
}
globalThis.document = {
    addEventListener() {},
    removeEventListener() {},
    exitPointerLock() {},
    pointerLockElement: null
}
globalThis.location = { hash: '', pathname: '/', search: '' }

const { default: Debug } = await import('@/Debug/Debug.js')
Debug.instance = { active: false, visible: false }

const { default: Game } = await import('@/Game.js')
Game.instance = { seed: 'p', debug: Debug.instance }

const { default: State } = await import('@/State/State.js')

const state = new State()
Game.instance.state = state

// Fixed-step time
const DT = 1 / 60
state.time.update = function()
{
    this.delta = DT
    this.elapsed += DT
    this.current += DT
}

const player = state.player
const controls = state.controls

// Pin the player to one spot so terrain slope/skiing never skews the speed
// comparison — velocity dynamics still run for real, only position is held
const anchor = { x: 0, z: 0 }

const step = async (frames = 1) =>
{
    for(let i = 0; i < frames; i++)
    {
        state.update()
        player.position.current[0] = anchor.x
        player.position.current[2] = anchor.z
        player.position.previous[0] = anchor.x
        player.position.previous[2] = anchor.z
        await new Promise((resolve) => setImmediate(resolve))
    }
}

let failures = 0

const check = (name, condition, detail = '') =>
{
    console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)

    if(!condition)
        failures++
}

const releaseAll = () =>
{
    controls.stick.active = false
    controls.stick.magnitude = 0
    controls.setButton('forward', false)
    player.velocity[0] = 0
    player.velocity[2] = 0
}

const horizontalSpeed = () => Math.hypot(player.velocity[0], player.velocity[2])

// Let the player spawn and the world settle, then anchor where they landed
await step(5)
anchor.x = player.position.current[0]
anchor.z = player.position.current[2]
await step(30)

/**
 * 1. Steady-state speed scales with stick magnitude
 */
console.log('\n--- Analog throttle: steady-state speed ---')

const steadySpeed = async (magnitude) =>
{
    releaseAll()
    await step(5)
    controls.stick.active = true
    controls.stick.angle = 0
    controls.stick.magnitude = magnitude
    await step(240)

    return horizontalSpeed()
}

const fullSpeed = await steadySpeed(1)
const halfSpeed = await steadySpeed(0.5)
const quarterSpeed = await steadySpeed(0.25)

check('full deflection reaches input speed', Math.abs(fullSpeed - player.inputSpeed) / player.inputSpeed < 0.15, `${fullSpeed.toFixed(2)} vs ${player.inputSpeed}`)
check('half magnitude gives ~half speed', Math.abs(halfSpeed - fullSpeed * 0.5) / fullSpeed < 0.1, `${halfSpeed.toFixed(2)} vs ${(fullSpeed * 0.5).toFixed(2)}`)
check('quarter magnitude gives ~quarter speed', Math.abs(quarterSpeed - fullSpeed * 0.25) / fullSpeed < 0.1, `${quarterSpeed.toFixed(2)} vs ${(fullSpeed * 0.25).toFixed(2)}`)

/**
 * 2. Throttle ramps up over throttleRampTime, drops instantly
 */
console.log('\n--- Attack ramp ---')

releaseAll()
await step(5)
check('throttle resets to 0 while stick is inactive', player.stickThrottle === 0)

controls.stick.active = true
controls.stick.angle = 0
controls.stick.magnitude = 1

await step(10)
check('early in the ramp intensity is still low', player.stickThrottle < 0.45, `throttle ${player.stickThrottle.toFixed(2)} after ${(10 * DT).toFixed(2)}s`)
check('early in the ramp speed is well below half', horizontalSpeed() < fullSpeed * 0.5, `${horizontalSpeed().toFixed(2)} vs full ${fullSpeed.toFixed(2)}`)

const rampFrames = Math.ceil(player.throttleRampTime / DT)
await step(rampFrames - 10 - 2)
check('throttle not yet full just before ramp time', player.stickThrottle < 1, `throttle ${player.stickThrottle.toFixed(3)}`)

await step(4)
check('throttle reaches full after ramp time', player.stickThrottle === 1, `throttle ${player.stickThrottle.toFixed(3)}`)

controls.stick.magnitude = 0.3
await step(1)
check('easing off applies instantly', player.stickThrottle === 0.3, `throttle ${player.stickThrottle.toFixed(3)}`)

/**
 * 3. Keyboard path unchanged: full speed, no ramp
 */
console.log('\n--- Keyboard path ---')

releaseAll()
await step(5)
controls.setButton('forward', true)
await step(240)

const keyboardSpeed = horizontalSpeed()
check('keyboard reaches full input speed', Math.abs(keyboardSpeed - fullSpeed) / fullSpeed < 0.05, `${keyboardSpeed.toFixed(2)} vs ${fullSpeed.toFixed(2)}`)
check('keyboard path never engages stick throttle', player.stickThrottle === 0)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
