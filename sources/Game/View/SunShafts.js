import * as THREE from 'three'

import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import SunShaftsMaterial from './Materials/SunShaftsMaterial.js'

export default class SunShafts
{
    constructor()
    {
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.scene = this.view.scene
        this.viewport = this.state.viewport

        // SunY window where shafts live: just above the horizon
        this.windowMin = 0.02
        this.windowMax = 0.35

        this.sunWorld = new THREE.Vector3()
        this.projected = new THREE.Vector3()
        this.camDir = new THREE.Vector3()
        this.sunDir = new THREE.Vector3()

        this.setMesh()
        this.setDebug()
    }

    setMesh()
    {
        // Fullscreen overlay quad (skyBackground recipe): additive screen-space
        // rays sampled from the sky render target, drawn over everything last
        this.material = new SunShaftsMaterial()
        this.material.uniforms.uSkyTexture.value = this.view.sky.customRender.texture

        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
        this.mesh.frustumCulled = false
        this.mesh.renderOrder = 999
        this.mesh.visible = false
        this.scene.add(this.mesh)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/sunShafts')

        folder.add(this.material.uniforms.uIntensity, 'value').min(0).max(1).step(0.01).name('uIntensity')
        folder.add(this.material.uniforms.uDecay, 'value').min(0.7).max(0.99).step(0.01).name('uDecay')
        folder.add(this.material.uniforms.uThreshold, 'value').min(0).max(1).step(0.01).name('uThreshold')
        folder.add(this.material.uniforms.uRadius, 'value').min(0.2).max(1.5).step(0.05).name('uRadius')
        folder.addColor(this.material.uniforms.uColor, 'value').name('uColor')
        folder.add(this, 'windowMin').min(0).max(0.2).step(0.005)
        folder.add(this, 'windowMax').min(0.1).max(0.8).step(0.01)
    }

    update()
    {
        const sun = this.state.sun.position
        const player = this.state.player.position.current
        const camera = this.view.camera.instance

        // Fade window: sun low but up, facing the sun, and no storm deck
        const lowSun = THREE.MathUtils.smoothstep(sun.y, this.windowMin, this.windowMin + 0.06)
            * (1 - THREE.MathUtils.smoothstep(sun.y, this.windowMax - 0.1, this.windowMax))

        camera.getWorldDirection(this.camDir)
        const facing = this.camDir.dot(this.sunDir.set(sun.x, sun.y, sun.z))
        const gate = lowSun
            * THREE.MathUtils.smoothstep(facing, 0.0, 0.35)
            * (1 - this.state.weather.rainIntensity)

        this.mesh.visible = gate > 0.01

        if(!this.mesh.visible)
            return

        // Sun screen position (only trusted while facing > 0 — the facing
        // gate zeroes out before the projection flips behind the camera)
        this.sunWorld.set(
            player[0] + sun.x * 900,
            player[1] + sun.y * 900,
            player[2] + sun.z * 900
        )
        this.projected.copy(this.sunWorld).project(camera)

        const uniforms = this.material.uniforms
        uniforms.uSunScreen.value.set(this.projected.x * 0.5 + 0.5, this.projected.y * 0.5 + 0.5)
        uniforms.uGate.value = gate
        uniforms.uAspect.value = this.viewport.width / this.viewport.height
    }

    resize()
    {
        this.material.uniforms.uAspect.value = this.viewport.width / this.viewport.height
    }
}
