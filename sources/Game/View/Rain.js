import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import RainMaterial from './Materials/RainMaterial.js'

export default class Rain
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.scene = this.view.scene
        this.viewport = this.state.viewport

        this.count = 500

        this.setGeometry()
        this.setMaterial()
        this.setPoints()
        this.setDebug()
    }

    setGeometry()
    {
        const positions = new Float32Array(this.count * 3)
        const offsets = new Float32Array(this.count * 3)
        const speeds = new Float32Array(this.count)
        const sizes = new Float32Array(this.count)
        const phases = new Float32Array(this.count)

        for(let i = 0; i < this.count; i++)
        {
            const iStride3 = i * 3
            offsets[iStride3    ] = Math.random()
            offsets[iStride3 + 1] = Math.random()
            offsets[iStride3 + 2] = Math.random()

            speeds[i] = 0.8 + Math.random() * 0.4
            sizes[i] = 0.8 + Math.random() * 0.4
            phases[i] = Math.random()
        }

        this.geometry = new THREE.BufferGeometry()
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        this.geometry.setAttribute('aOffset', new THREE.Float32BufferAttribute(offsets, 3))
        this.geometry.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speeds, 1))
        this.geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
        this.geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))
    }

    setMaterial()
    {
        this.material = new RainMaterial()
        this.material.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio
    }

    setPoints()
    {
        this.points = new THREE.Points(this.geometry, this.material)
        this.points.frustumCulled = false
        this.points.visible = false
        this.scene.add(this.points)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/rain')

        folder.add({ rainNow: () => { this.state.weather.startRain() } }, 'rainNow')
        folder.add({ stopRain: () => { this.state.weather.stopRain() } }, 'stopRain')
        folder.add(this.material.uniforms.uFallSpeed, 'value').min(4).max(60).step(1).name('uFallSpeed')
        folder.add(this.material.uniforms.uWindSlant.value, 'x').min(- 8).max(8).step(0.1).name('uWindSlantX')
        folder.add(this.material.uniforms.uWindSlant.value, 'y').min(- 8).max(8).step(0.1).name('uWindSlantZ')
        folder.add(this.material.uniforms.uSize, 'value').min(0.25).max(10).step(0.25).name('uSize')
        folder.add(this.material.uniforms.uOpacity, 'value').min(0).max(1).step(0.01).name('uOpacity')
        folder.addColor(this.material.uniforms.uColor, 'value').name('uColor')
    }

    update()
    {
        const weatherState = this.state.weather
        const playerState = this.state.player

        this.points.visible = weatherState.rainIntensity > 0.001

        if(!this.points.visible)
            return

        this.material.uniforms.uTime.value = this.state.time.elapsed
        this.material.uniforms.uIntensity.value = weatherState.rainIntensity
        this.material.uniforms.uCenter.value.set(
            playerState.position.current[0],
            playerState.position.current[1],
            playerState.position.current[2]
        )
    }

    resize()
    {
        this.material.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio
    }
}
