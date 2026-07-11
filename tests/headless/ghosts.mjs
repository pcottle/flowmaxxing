/**
 * Headless fixed-step verification of the multiplayer ghost presence state:
 * beach-circle gating, publish throttling, heartbeat, peer ingest (TTL +
 * self-filter) and peer smoothing — all through a fake adapter, no firebase.
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

const step = async (frames = 1) =>
{
    for(let i = 0; i < frames; i++)
    {
        state.update()
        await new Promise((resolve) => setImmediate(resolve))
    }
}

const player = state.player
const ghosts = state.ghosts

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

const fake = {
    uid: 'self-uid',
    published: [],
    leaves: 0,
    cb: null,
    publish(fields) { this.published.push(fields) },
    leave() { this.leaves++ },
    onPeers(callback) { this.cb = callback }
}

ghosts.setAdapter(fake)

// Let the player spawn and the world settle, then puppet it
await step(5)
player.update = () => {}

const center = ghosts.center ?? { x: player.position.current[0], z: player.position.current[2] }

/**
 * 1. Publishing: throttle, idle, emoji, jump
 */
console.log('\n--- Publishing ---')

check('adapter received onPeers subscription', typeof fake.cb === 'function')
check('beach circle centered on spawn', !!ghosts.center && Math.hypot(player.position.current[0] - center.x, player.position.current[2] - center.z) < 2)

// Move steadily inside the circle for 2 simulated seconds
fake.published.length = 0

for(let i = 0; i < 120; i++)
{
    teleport(center.x, center.z - i * 0.05, 1)
    await step(1)
}

check('publishes while moving inside the circle', fake.published.length > 0, `${fake.published.length} writes`)
check('writes throttled to ~6Hz', fake.published.length >= 8 && fake.published.length <= 14, `${fake.published.length} writes over 2s`)

// Stand still: after the throttle flushes the final position, no further
// writes (heartbeat is 30s away)
await step(15)
fake.published.length = 0
await step(120)
check('stops publishing while idle', fake.published.length === 0, `${fake.published.length} writes`)

// Emoji send forces a publish even when idle, stamped with a send time
fake.published.length = 0
ghosts.setEmoji('🌊')
await step(15)
check('emoji send publishes', fake.published.length === 1 && fake.published[0].e === '🌊' && fake.published[0].es > 0)

// Re-sending the SAME emoji publishes again (es changes, e does not)
const firstEs = fake.published[0].es
fake.published.length = 0
await new Promise((resolve) => setTimeout(resolve, 5))
ghosts.setEmoji('🌊')
await step(15)
check('re-sending the same emoji publishes again', fake.published.length === 1 && fake.published[0].es > firstEs)

// Jump updates jumpedAt and publishes it
fake.published.length = 0
player.events.emit('jump', 1)
await step(15)
check('jump publishes fresh jumpedAt', fake.published.length === 1 && fake.published[0].j > 0)

// Heartbeat refreshes lastSeen while idle within the circle
fake.published.length = 0
await step(Math.ceil(31 / DT / 60) * 60) // ~31 simulated seconds
check('heartbeat publishes while idle', fake.published.length >= 1, `${fake.published.length} writes over 31s`)

/**
 * 2. Leaving the circle
 */
console.log('\n--- Beach circle exit ---')

fake.published.length = 0
teleport(center.x + 100, center.z, 1)
await step(10)

check('leaving the circle calls leave()', fake.leaves === 1)
check('no publishes outside the circle', fake.published.length === 0)

// Coming back re-enters and publishes again
teleport(center.x, center.z, 1)
await step(15)
check('re-entering the circle resumes publishing', fake.published.length >= 1)

/**
 * 3. Peer ingest: self-filter, TTL, distance, removal
 */
console.log('\n--- Peer ingest ---')

const serverNow = Date.now()

fake.cb({
    'self-uid': { x: center.x, y: 1, z: center.z, r: 0, j: 0, e: '', t: serverNow },
    'fresh-peer': { x: center.x + 2, y: 1, z: center.z, r: 1, j: 0, e: '👋', t: serverNow - 1000 },
    'edge-peer': { x: center.x + 44, y: 1, z: center.z, r: 0, j: 0, e: '', t: serverNow },
    'stale-peer': { x: center.x, y: 1, z: center.z, r: 0, j: 0, e: '', t: serverNow - 400000 },
    'far-peer': { x: center.x + 200, y: 1, z: center.z, r: 0, j: 0, e: '', t: serverNow }
}, serverNow)

check('fresh peer ingested', ghosts.peers.has('fresh-peer'))
check('own uid filtered out', !ghosts.peers.has('self-uid'))
check('stale peer dropped (5m TTL)', !ghosts.peers.has('stale-peer'))
check('out-of-circle peer dropped', !ghosts.peers.has('far-peer'))
check('exactly two peers survive', ghosts.peers.size === 2)

// Edge fade: full presence near the center, fading out toward the exit radius
await step(1)
const centerFade = ghosts.peers.get('fresh-peer').fade
const edgeFade = ghosts.peers.get('edge-peer').fade
check('peer near center is fully visible', centerFade === 1, `fade ${centerFade}`)
check('peer near the edge is faded', edgeFade > 0.05 && edgeFade < 0.5, `fade ${edgeFade.toFixed(2)}`)

const peer = ghosts.peers.get('fresh-peer')
check('new peer snaps to reported position', Math.abs(peer.cur.x - (center.x + 2)) < 0.001 && Math.abs(peer.cur.r - 1) < 0.001)

// Peer moves: cur lerps toward the new target across frames
fake.cb({
    'fresh-peer': { x: center.x + 6, y: 1, z: center.z - 4, r: 2, j: 0, e: '👋', t: serverNow }
}, serverNow)

const before = { x: peer.cur.x, z: peer.cur.z }
await step(3)
const movedSome = peer.cur.x > before.x && peer.cur.z < before.z && Math.abs(peer.cur.x - 6 - center.x) > 0.5
await step(120)
const converged = Math.abs(peer.cur.x - (center.x + 6)) < 0.05 && Math.abs(peer.cur.z - (center.z - 4)) < 0.05 && Math.abs(peer.cur.r - 2) < 0.02

check('peer position lerps (not snaps) toward target', movedSome)
check('peer position converges on target', converged)

// Peer disappearing from the snapshot is removed
fake.cb({}, serverNow)
check('peer removed when absent from snapshot', ghosts.peers.size === 0)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
