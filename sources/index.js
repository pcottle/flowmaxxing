import Game from '@/Game.js'
import mountUI from './UI/mount.jsx'

const game = new Game()

if(game.view)
    document.querySelector('.game').append(game.view.renderer.instance.domElement)

mountUI(document.querySelector('.ui-root'))
