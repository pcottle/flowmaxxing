import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Terrain from './Terrain.js'
import TerrainGradient from './TerrainGradient.js'
import TerrainMaterial from './Materials/TerrainMaterial.js'

export default class Terrains
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = View.getInstance()

        this.viewport = this.state.viewport
        this.sky =  this.view.sky

        this.setGradient()
        this.setMaterial()
        this.setDebug()

        this.state.terrains.events.on('create', (engineTerrain) =>
        {
            const terrain = new Terrain(this, engineTerrain)

            engineTerrain.events.on('destroy', () =>
            {
                terrain.destroy()
            })
        })
    }

    setGradient()
    {
        this.gradient = new TerrainGradient()
    }

    setMaterial()
    {
        this.material = new TerrainMaterial()
        this.material.uniforms.uPlayerPosition.value = new THREE.Vector3()
        this.material.uniforms.uGradientTexture.value = this.gradient.texture
        this.material.uniforms.uLightnessSmoothness.value = 0.25
        this.material.uniforms.uFresnelOffset.value = 0
        this.material.uniforms.uFresnelScale.value = 0.5
        this.material.uniforms.uFresnelPower.value = 2
        this.material.uniforms.uSunPosition.value = new THREE.Vector3(- 0.5, - 0.5, - 0.5)
        this.material.uniforms.uFogTexture.value = this.sky.customRender.texture
        this.material.uniforms.uGrassDistance.value = this.state.chunks.minSize
        this.material.uniforms.uBeachEnd.value = this.state.terrains.beachEnd
        this.material.uniforms.uMountainStart.value = this.state.terrains.mountainStart
        this.material.uniforms.uMountainFull.value = this.state.terrains.mountainFull

        this.material.onBeforeRender = (renderer, scene, camera, geometry, mesh) =>
        {
            this.material.uniforms.uTexture.value = mesh.userData.texture
            this.material.uniformsNeedUpdate = true
        }

        // this.material.wireframe = true

        // const dummy = new THREE.Mesh(
        //     new THREE.SphereGeometry(30, 64, 32),
        //     this.material
        // )
        // dummy.position.y = 50
        // this.scene.add(dummy)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = debug.ui.getFolder('view/terrains')

        folder
            .add(this.material, 'wireframe')

        folder
            .add(this.material.uniforms.uLightnessSmoothness, 'value')
            .min(0)
            .max(1)
            .step(0.001)
            .name('uLightnessSmoothness')
        
        folder
            .add(this.material.uniforms.uFresnelOffset, 'value')
            .min(- 1)
            .max(1)
            .step(0.001)
            .name('uFresnelOffset')
        
        folder
            .add(this.material.uniforms.uFresnelScale, 'value')
            .min(0)
            .max(2)
            .step(0.001)
            .name('uFresnelScale')
        
        folder
            .add(this.material.uniforms.uFresnelPower, 'value')
            .min(1)
            .max(10)
            .step(1)
            .name('uFresnelPower')
    }

    update()
    {
        const playerState = this.state.player
        const playerPosition = playerState.position.current
        const sunState = this.state.sun
        const terrainsState = this.state.terrains

        this.material.uniforms.uPlayerPosition.value.set(playerPosition[0], playerPosition[1], playerPosition[2])
        this.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
        this.material.uniforms.uBeachEnd.value = terrainsState.beachEnd
        this.material.uniforms.uMountainStart.value = terrainsState.mountainStart
        this.material.uniforms.uMountainFull.value = terrainsState.mountainFull
        this.material.uniforms.uTime.value = this.state.time.elapsed

        // Shared corridor + wave textures (owned by Water, which updates before Terrains)
        const water = this.view.water
        this.material.uniforms.uCorridorTexture.value = water.shoreTexture
        this.material.uniforms.uCorridorZMin.value = water.shoreZMin
        this.material.uniforms.uCorridorZRange.value = water.shoreWindow
        this.material.uniforms.uWaveTexture.value = water.waveTexture

        // Wave-set uprush + wet memory (computed in State/WaveSets)
        const waveSets = this.state.waveSets
        this.material.uniforms.uUprush0.value = waveSets.sets[0].uprushE
        this.material.uniforms.uUprush1.value = waveSets.sets[1].uprushE
        this.material.uniforms.uWetLine.value = waveSets.wetLineE
        this.material.uniforms.uWetFresh.value = waveSets.wetFresh

        // Biome palettes: live-tunable, no recreate needed
        for(let i = 0; i < 3; i++)
        {
            const colors = terrainsState.biomes[i].colors
            this.material.uniforms.uSandColors.value[i].setRGB(colors.sand[0], colors.sand[1], colors.sand[2])
            this.material.uniforms.uGrassColors.value[i].setRGB(colors.grass[0], colors.grass[1], colors.grass[2])
            this.material.uniforms.uRockColors.value[i].setRGB(colors.rock[0], colors.rock[1], colors.rock[2])
        }
    }

    resize()
    {
    }
}
