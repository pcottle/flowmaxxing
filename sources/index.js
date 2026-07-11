import Game from '@/Game.js'
import mountUI from './UI/mount.jsx'

const boot = document.querySelector('.boot')

let game = null
try
{
    game = new Game()
}
catch(error)
{
    console.error(error)
    boot.querySelector('.boot-spinner').remove()
    boot.querySelector('.boot-text').innerHTML =
        'Hmm, couldn\'t get the world started 😔<br>' +
        'This usually means WebGL isn\'t available &mdash; try another browser,<br>' +
        'or check that hardware acceleration is turned on.'
}

if(game)
{
    if(game.view)
        document.querySelector('.game').append(game.view.renderer.instance.domElement)

    mountUI(document.querySelector('.ui-root'))
    boot.remove()

    // Multiplayer presence is optional: firebase loads as its own async chunk
    // and the game never waits on (or requires) it
    import('./Game/Multiplayer/presence.js')
        .then((presence) => presence.createPresenceAdapter())
        .then((adapter) => { game.state.ghosts.setAdapter(adapter) })
        .catch(() => {})
}
