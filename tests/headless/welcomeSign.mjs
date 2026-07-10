/**
 * Headless check of the WelcomeSign placement math (the View itself needs a
 * canvas, so we verify its inputs against the real State): the chosen spot
 * must resolve to dry sand near spawn, and the registered collider must
 * push a walking player out rather than let them clip through the slab.
 */

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

const DT = 1 / 60
state.time.update = function()
{
    this.delta = DT
    this.elapsed += DT
    this.current += DT
}

const step = async (frames = 1) =>
{
    for(let i = 0; i < frames; i++)
    {
        state.update()
        await new Promise((resolve) => setImmediate(resolve))
    }
}

let failures = 0
const check = (label, ok, detail = '') =>
{
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
    if(!ok) failures++
}

// Let spawn + chunks settle
await step(120)

// Same placement math as View/WelcomeSign.js
const SIGN_Z = - 14
const SHORE_OFFSET = 5

const signX = state.terrains.getShoreX(SIGN_Z) - SHORE_OFFSET
const elevation = state.chunks.getElevationForPosition(signX, SIGN_Z)

check('sign spot resolves to ground', elevation !== false && Number.isFinite(elevation), `elevation=${elevation}`)
check('sign spot is dry sand (> 0.05)', elevation > 0.05, `elevation=${elevation?.toFixed?.(3)}`)

const spawnX = state.player.position.current[0]
const spawnZ = state.player.position.current[2]
const spawnDistance = Math.hypot(signX - spawnX, SIGN_Z - spawnZ)
check('sign is near spawn (8–30m)', spawnDistance > 8 && spawnDistance < 30, `distance=${spawnDistance.toFixed(1)}m`)

const lateral = Math.abs(signX - spawnX)
check('sign is off the straight-ahead line (>2m lateral)', lateral > 2, `lateral=${lateral.toFixed(1)}m`)

// Register the same collider the view registers, then walk the player
// straight at the sign and confirm the push-out keeps them off it
state.propsColliders.setGroup('welcomeSign', [
    { x: signX, z: SIGN_Z, y: elevation, radius: 1.6, height: 5.2 }
])

state.player.position.current[0] = signX
state.player.position.current[2] = SIGN_Z + 6
state.player.position.previous[0] = signX
state.player.position.previous[2] = SIGN_Z + 6

state.controls.keys.down.forward = true
await step(240)
state.controls.keys.down.forward = false

const finalDistance = Math.hypot(
    state.player.position.current[0] - signX,
    state.player.position.current[2] - SIGN_Z
)
check('walking into the sign pushes out (stays >1.4m from center)', finalDistance > 1.4, `distance=${finalDistance.toFixed(2)}m`)

console.log(failures === 0 ? '\nAll welcome-sign checks passed' : `\n${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
