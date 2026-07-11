import Game from '@/Game.js'
import mountUI from './UI/mount.jsx'

const game = new Game()

if(game.view)
    document.querySelector('.game').append(game.view.renderer.instance.domElement)

mountUI(document.querySelector('.ui-root'))

// Multiplayer presence is optional: firebase loads as its own async chunk
// and the game never waits on (or requires) it
import('./Game/Multiplayer/presence.js')
    .then((presence) => presence.createPresenceAdapter())
    .then((adapter) => { game.state.ghosts.setAdapter(adapter) })
    .catch(() => {})
