/**
 * Headless fixed-step verification of the Wake the Wind cyclone challenge:
 * nearby reveal, ordered wisps, armed launch, and departure reset.
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

const player = state.player

const teleport = (x, z, y = null) =>
{
    player.position.current[0] = x
    player.position.current[2] = z
    player.position.previous[0] = x
    player.position.previous[2] = z

    if(y !== null)
    {
        player.position.current[1] = y
        player.position.previous[1] = y
    }
}

let failures = 0

const check = (label, ok, detail = '') =>
{
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)

    if(!ok)
        failures++
}

// Let the ordinary spawn complete before taking control of the player.
await step(5)
player.update = () => {}

// Load the terrain around the first deterministic cyclone while staying just
// outside its reveal radius.
const cycloneZ = state.cyclones.getCycloneZ(0)
const approachX = state.terrains.getShoreX(cycloneZ) + 15
teleport(approachX, cycloneZ, 2)
await step(180)

const cyclone = state.cyclones.cyclones.get(0)
check('first deterministic cyclone is built', !!cyclone && cyclone.built)

if(cyclone)
{
    const layoutMatches = cyclone.wisps.every((wisp, index) =>
    {
        const offset = state.cyclones.wispOffsets[index]

        return Math.abs(wisp.position[0] - cyclone.position[0] - offset[0]) < 0.001
            && Math.abs(wisp.position[2] - cyclone.position[2] - offset[1] * cyclone.wispSide) < 0.001
            && Number.isFinite(wisp.position[1])
    })

    check('wisp trail is deterministic and grounded', layoutMatches)
    check('cyclone stays dormant outside reveal range', cyclone.phase === 'dormant', `phase=${cyclone.phase}`)

    let launches = 0
    let wispEvents = 0
    let awakenEvents = 0
    let launchEvents = 0
    const originalLaunch = player.launchFromPad.bind(player)

    player.launchFromPad = (velocity) =>
    {
        launches++
        originalLaunch(velocity)
    }

    state.cyclones.events.on('cycloneWispCollect', () => wispEvents++)
    state.cyclones.events.on('cycloneAwaken', () => awakenEvents++)
    state.cyclones.events.on('cycloneLaunch', () => launchEvents++)

    // Entering the dormant column reveals the challenge but cannot launch it.
    teleport(cyclone.position[0], cyclone.position[2], cyclone.position[1])
    await step(1)
    check('nearby dormant cyclone reveals its challenge', cyclone.phase === 'collecting')
    check('dormant cyclone cannot launch', launches === 0)

    // Touching a later wisp first must not skip the highlighted target.
    const second = cyclone.wisps[1]
    teleport(second.position[0], second.position[2], second.position[1] - 0.9)
    await step(1)
    check('out-of-order wisp does not collect', cyclone.nextWisp === 0 && wispEvents === 0)

    for(let i = 0; i < cyclone.wisps.length; i++)
    {
        const wisp = cyclone.wisps[i]
        teleport(wisp.position[0], wisp.position[2], wisp.position[1] - 0.9)
        await step(1)
    }

    check('three ordered wisps collect exactly once', cyclone.nextWisp === 3 && wispEvents === 3)
    check('third wisp awakens the updraft', cyclone.phase === 'awakened' && awakenEvents === 1)

    teleport(cyclone.position[0] + 30, cyclone.position[2], cyclone.position[1])
    await step(600)
    check('awakened updraft has no timer', cyclone.phase === 'awakened')

    teleport(cyclone.position[0], cyclone.position[2], cyclone.position[1])
    await step(1)
    check('awakened updraft launches exactly once', launches === 1 && launchEvents === 1)
    check('used cyclone becomes spent', cyclone.phase === 'spent')

    await step(10)
    check('spent cyclone cannot immediately relaunch', launches === 1)

    teleport(cyclone.position[0] + state.cyclones.resetDistance + 5, cyclone.position[2], cyclone.position[1])
    await step(1)
    check(
        'leaving resets the challenge for a later visit',
        cyclone.phase === 'dormant'
            && cyclone.nextWisp === 0
            && cyclone.wisps.every((wisp) => !wisp.collected)
    )
}

console.log(`\n${failures === 0 ? 'ALL CYCLONE CHECKS PASSED' : `${failures} CYCLONE CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
