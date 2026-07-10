import Audio from './Audio.js'
import BouncePads from './BouncePads.js'
import Camera from './Camera.js'
import Campfires from './Campfires.js'
import Chunks from './Chunks.js'
import Crabs from './Crabs.js'
import Cyclones from './Cyclones.js'
import Fireflies from './Fireflies.js'
import Fish from './Fish.js'
import Footprints from './Footprints.js'
import Grass from './Grass.js'
import HorizonIslands from './HorizonIslands.js'
import Noises from './Noises.js'
import ObstacleCourses from './ObstacleCourses.js'
import Particles from './Particles.js'
import Player from './Player.js'
import PlayerShadow from './PlayerShadow.js'
import ProgressiveBounceCourses from './ProgressiveBounceCourses.js'
import Props from './Props.js'
import Rain from './Rain.js'
import Rainbow from './Rainbow.js'
import Renderer from './Renderer.js'
import Ribbon from './Ribbon.js'
import Seagulls from './Seagulls.js'
import Sky from './Sky.js'
import Sparkles from './Sparkles.js'
import SunShafts from './SunShafts.js'
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
        this.horizonIslands = new HorizonIslands()
        this.terrains = new Terrains()
        this.chunks = new Chunks()
        this.player = new Player()
        this.ribbon = new Ribbon()
        this.grass = new Grass()
        this.props = new Props()
        this.obstacleCourses = new ObstacleCourses()
        this.bouncePads = new BouncePads()
        this.playerShadow = new PlayerShadow()
        this.progressiveBounceCourses = new ProgressiveBounceCourses()
        this.cyclones = new Cyclones()
        this.particles = new Particles()
        this.rain = new Rain()
        this.rainbow = new Rainbow()
        this.seagulls = new Seagulls()
        this.fish = new Fish()
        this.footprints = new Footprints()
        this.crabs = new Crabs()
        this.fireflies = new Fireflies()
        this.campfires = new Campfires()
        this.sparkles = new Sparkles()
        this.sunShafts = new SunShafts()
        this.audio = new Audio()
    }

    resize()
    {
        this.camera.resize()
        this.renderer.resize()
        this.sky.resize()
        this.terrains.resize()
        this.particles.resize()
        this.rain.resize()
        this.fireflies.resize()
        this.campfires.resize()
        this.sparkles.resize()
        this.sunShafts.resize()
    }

    update()
    {
        this.camera.update()
        this.sky.update()
        this.water.update()
        this.horizonIslands.update()
        this.terrains.update()
        this.chunks.update()
        this.player.update()
        this.ribbon.update()
        this.grass.update()
        this.props.update()
        this.obstacleCourses.update()
        this.bouncePads.update()
        this.playerShadow.update()
        this.progressiveBounceCourses.update()
        this.cyclones.update()
        this.particles.update()
        this.rain.update()
        this.rainbow.update()
        this.seagulls.update()
        this.fish.update()
        this.footprints.update()
        this.crabs.update()
        this.fireflies.update()
        this.campfires.update()
        this.sparkles.update()
        this.sunShafts.update()
        this.audio.update()
        this.renderer.update()
    }

    destroy()
    {
    }
}
