import Audio from './Audio.js'
import Camera from './Camera.js'
import Chunks from './Chunks.js'
import Grass from './Grass.js'
import Noises from './Noises.js'
import Particles from './Particles.js'
import Player from './Player.js'
import Renderer from './Renderer.js'
import Ribbon from './Ribbon.js'
import Sky from './Sky.js'
import Terrains from './Terrains.js'
import Water from './Water.js'

import * as THREE from 'three'

export default class View
{
    static instance

    static getInstance()
    {
        return View.instance
    }

    constructor()
    {
        if(View.instance)
            return View.instance

        View.instance = this

        this.scene = new THREE.Scene()
        
        this.camera = new Camera()
        this.renderer = new Renderer()
        this.noises = new Noises()
        this.sky = new Sky()
        this.water = new Water()
        this.terrains = new Terrains()
        this.chunks = new Chunks()
        this.player = new Player()
        this.ribbon = new Ribbon()
        this.grass = new Grass()
        this.particles = new Particles()
        this.audio = new Audio()
    }

    resize()
    {
        this.camera.resize()
        this.renderer.resize()
        this.sky.resize()
        this.terrains.resize()
        this.particles.resize()
    }

    update()
    {
        this.sky.update()
        this.water.update()
        this.terrains.update()
        this.chunks.update()
        this.player.update()
        this.ribbon.update()
        this.grass.update()
        this.particles.update()
        this.audio.update()
        this.camera.update()
        this.renderer.update()
    }

    destroy()
    {
    }
}