/**
 * Headless fixed-step verification of the two new minigames:
 * Dune Melody (sculpted moguls + butter-landing notes) and Carve the Tideline
 * (shoreline ribbon course). Runs the REAL State layer with the REAL terrain
 * worker executed synchronously in-process.
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
const { buildDuneMelodyField, duneMelodyConfig } = await import('@/Workers/DuneMelodyLayout.js')

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

const step = async (frames = 1) =>
{
    for(let i = 0; i < frames; i++)
    {
        state.update()
        // Flush the worker-shim microtasks so baked chunks land between frames
        await new Promise((resolve) => setImmediate(resolve))
    }
}

const player = state.player

const teleport = (x, z, y = null) =>
{
    player.position.current[0] = x
    player.position.current[2] = z

    if(y !== null)
        player.position.current[1] = y

    player.position.previous[0] = x
    player.position.previous[2] = z

    if(y !== null)
        player.position.previous[1] = y
}

let failures = 0

const check = (name, condition, detail = '') =>
{
    console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)

    if(!condition)
        failures++
}

// Let the player spawn and the world settle
await step(5)

/**
 * 1. Dune Melody — moguls sculpted into physics terrain where State expects them
 */
console.log('\n--- Dune Melody: terrain moguls ---')

const field0Layout = buildDuneMelodyField(0, (z) => state.terrains.getShoreX(z))

teleport(field0Layout.moguls[0].x, field0Layout.startZ + 20, 5)
player.velocity[0] = 0
player.velocity[1] = 0
player.velocity[2] = 0
await step(40)

let mogulsOk = 0

for(const mogul of field0Layout.moguls)
{
    const crest = state.chunks.getElevationForPosition(mogul.x, mogul.z)
    const troughA = state.chunks.getElevationForPosition(mogul.x, mogul.z + duneMelodyConfig.mogulSpacing * 0.5)
    const troughB = state.chunks.getElevationForPosition(mogul.x, mogul.z - duneMelodyConfig.mogulSpacing * 0.5)

    if(crest === false || troughA === false || troughB === false)
        continue

    const prominence = crest - (troughA + troughB) * 0.5

    if(prominence > mogul.height * 0.5)
        mogulsOk++
}

check('moguls present in baked physics terrain', mogulsOk >= duneMelodyConfig.mogulCount - 1, `${mogulsOk}/${duneMelodyConfig.mogulCount} crests with expected prominence`)

const stateField = state.duneMelody.fields.get(0)
check('state field 0 created and built', !!stateField && stateField.built)
check('state layout matches shared layout', !!stateField && Math.abs(stateField.moguls[3].x - field0Layout.moguls[3].x) < 0.001 && Math.abs(stateField.moguls[3].z - field0Layout.moguls[3].z) < 0.001)

/**
 * 2. Dune Melody — butter landing plays a note, flat landing does not
 */
console.log('\n--- Dune Melody: notes ---')

const notes = []
let butterCount = 0
state.duneMelody.events.on('note', (note) => notes.push(note))
player.events.on('butterLand', () => butterCount++)

const noteMogul = field0Layout.moguls[2]
const landZ = noteMogul.z - 2.5 // downslope, heading down-beach (-Z)
const landElevation = state.chunks.getElevationForPosition(noteMogul.x, landZ)

player.grounded = false
player.swimming = false
player.airTime = 1
teleport(noteMogul.x, landZ, landElevation + 0.4)
player.velocity[0] = 0
player.velocity[1] = - 12
player.velocity[2] = - 10
await step(5)

check('butter landing on mogul downslope emits butterLand', butterCount >= 1, `count ${butterCount}`)
check('butter landing in field emits one note', notes.length === 1, `notes ${notes.length}`)

// Landing again at the same spot must not re-note (no hopping in place)
player.grounded = false
player.airTime = 1
teleport(noteMogul.x, landZ - 0.5, state.chunks.getElevationForPosition(noteMogul.x, landZ - 0.5) + 0.4)
player.velocity[1] = - 12
player.velocity[2] = - 10
await step(5)

check('landing again without progress does not re-note', notes.length === 1, `notes ${notes.length}`)

// A landing one mogul further down the field notes again
const nextMogul = field0Layout.moguls[3]
const nextLandZ = nextMogul.z - 2.5
player.grounded = false
player.airTime = 1
teleport(nextMogul.x, nextLandZ, state.chunks.getElevationForPosition(nextMogul.x, nextLandZ) + 0.4)
player.velocity[1] = - 12
player.velocity[2] = - 10
await step(5)

check('landing on the next mogul notes again', notes.length === 2, `notes ${notes.length}`)

/**
 * 3. Dune Melody — prize activates and collects, persists in the Set
 */
console.log('\n--- Dune Melody: prize ---')

const prizeEvents = []
state.duneMelody.events.on('prizeCollect', (event) => prizeEvents.push(event))

stateField.notes = state.duneMelody.notesRequired
check('prize active once enough notes', state.duneMelody.isPrizeActive(stateField))

player.grounded = true
player.velocity[0] = 0
player.velocity[1] = 0
player.velocity[2] = 0
teleport(stateField.prize.position[0], stateField.prize.position[2], stateField.prize.position[1] - 0.9)
await step(3)

check('prize collected on contact', prizeEvents.length === 1 && stateField.prize.collected)
check('prize persisted for idempotent rebuild', state.duneMelody.collectedPrizes.has(0))

/**
 * 4. Tideline — trigger, progress, segments, pause, prize
 */
console.log('\n--- Tideline: trigger and run ---')

// Puppet the player: freeze physics, drive position/velocity directly
player.update = () => {}
player.swimming = false
player.carving = false
state.progressiveBounceCourses.enabled = false

const tidelineEvents = { segments: [], prize: 0, complete: 0, abandon: 0 }
state.tideline.events.on('segment', (event) => tidelineEvents.segments.push(event.index))
state.tideline.events.on('prizeCollect', () => tidelineEvents.prize++)
state.tideline.events.on('courseComplete', () => tidelineEvents.complete++)
state.tideline.events.on('abandon', () => tidelineEvents.abandon++)

// Run along the shore at speed until the ribbon lights up
let z = player.position.current[2]
state.tideline.cooldownTimer = 0
state.tideline.straightTimer = 0

for(let i = 0; i < 200 && !state.tideline.course; i++)
{
    z -= 15 * DT
    teleport(state.terrains.getShoreX(z) - 1, z, 1)
    player.velocity[0] = 0
    player.velocity[1] = 0
    player.velocity[2] = - 15
    player.horizontalSpeed = 15
    await step(1)
}

const course = state.tideline.course
check('running the shoreline triggers a tideline course', !!course)

if(course)
{
    const linePoint = (arc) =>
    {
        const samples = course.samples

        for(let i = 0; i < samples.length - 1; i++)
        {
            if(arc > samples[i + 1].arc)
                continue

            const t = (arc - samples[i].arc) / Math.max(samples[i + 1].arc - samples[i].arc, 0.0001)

            return {
                x: samples[i].x + (samples[i + 1].x - samples[i].x) * t,
                y: samples[i].y + (samples[i + 1].y - samples[i].y) * t,
                z: samples[i].z + (samples[i + 1].z - samples[i].z) * t
            }
        }

        return samples[samples.length - 1]
    }

    // Ride the ribbon for the first 100m
    let arc = 0

    while(arc < 100)
    {
        arc += 15 * DT
        const point = linePoint(arc)
        teleport(point.x, point.z, point.y)
        player.horizontalSpeed = 15
        await step(1)
    }

    const progressBeforePause = course.progress
    check('progress advances while riding the band', progressBeforePause > 80, `progress ${progressBeforePause.toFixed(1)}`)
    check('segment chimes fired every 25m', tidelineEvents.segments.length === Math.floor(progressBeforePause / state.tideline.segmentLength), `segments ${tidelineEvents.segments.join(',')}`)

    // Step out of the band: progress pauses, never rewinds
    const outside = linePoint(arc)
    teleport(outside.x - 12, outside.z, outside.y)
    await step(30)
    check('progress pauses outside the band', course.progress === progressBeforePause, `progress ${course.progress.toFixed(1)}`)
    check('leaving the band does not abandon nearby', tidelineEvents.abandon === 0)

    // Ride the rest and collect the prize
    while(arc < course.totalLength)
    {
        arc += 15 * DT
        const point = linePoint(arc)
        teleport(point.x, point.z, point.y)
        player.horizontalSpeed = 15
        await step(1)
    }

    check('prize activates near the end', course.prize.active)

    teleport(course.prize.position[0], course.prize.position[2], course.prize.position[1] - 0.9)
    player.horizontalSpeed = 15
    await step(3)

    check('tideline prize collected', tidelineEvents.prize === 1 && tidelineEvents.complete === 1)

    // Course expires shortly after completion
    await step(120)
    check('course expires after completion', state.tideline.course === null)
}

/**
 * 5. Mutual gating
 */
console.log('\n--- Gating ---')

state.progressiveBounceCourses.enabled = true
state.tideline.course = { samples: [], prize: {} } // pretend a course is running
const blocked = state.progressiveBounceCourses.createCourse(player)
check('bounce course cannot spawn during a tideline run', blocked === false)
state.tideline.course = null

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
