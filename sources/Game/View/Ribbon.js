import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import RibbonMaterial from './Materials/RibbonMaterial.js'

export default class Ribbon
{
    constructor()
    {
        this.game = Game.getInstance()
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene

        this.samplesCount = 28
        this.segmentLength = 0.16
        this.width = 0.35
        this.tipWidthRatio = 0.42
        this.panelGapRatio = 0
        this.anchorUpOffset = 1.4
        this.anchorBackOffset = 0.45
        this.flutterAmplitude = 0.018
        this.droop = 0.6
        this.bodyRadius = 0.62
        this.bodyBottomOffset = 0.05
        this.bodyTopOffset = 1.75
        this.opacity = 1
        this.idleOpacity = 0
        this.fadeSpeedThreshold = 2.2
        this.opacityLerpRate = 2.8

        this.samples = []
        const playerState = this.state.player
        for(let i = 0; i < this.samplesCount; i++)
        {
            this.samples.push(new THREE.Vector3(
                playerState.position.current[0],
                playerState.position.current[1] + this.anchorUpOffset,
                playerState.position.current[2]
            ))
        }

        this.anchor = new THREE.Vector3()
        this.direction = new THREE.Vector3()
        this.side = new THREE.Vector3(1, 0, 0)
        this.up = new THREE.Vector3(0, 1, 0)
        this.back = new THREE.Vector3()
        this.panelStart = new THREE.Vector3()
        this.panelEnd = new THREE.Vector3()

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        this.setDebug()
    }

    setGeometry()
    {
        const panelsCount = this.samplesCount - 1
        const vertexCount = panelsCount * 4
        const positions = new Float32Array(vertexCount * 3)
        const indices = []

        for(let i = 0; i < panelsCount; i++)
        {
            const a = i * 4

            indices.push(a, a + 1, a + 2)
            indices.push(a + 2, a + 1, a + 3)

            if(i < panelsCount - 1)
            {
                const b = (i + 1) * 4
                indices.push(a + 2, a + 3, b)
                indices.push(b, a + 3, b + 1)
            }
        }

        this.geometry = new THREE.BufferGeometry()
        this.positionAttribute = new THREE.Float32BufferAttribute(positions, 3)
        this.positionAttribute.setUsage(THREE.DynamicDrawUsage)
        this.geometry.setAttribute('position', this.positionAttribute)
        this.geometry.setIndex(indices)
    }

    setMaterial()
    {
        this.material = new RibbonMaterial()
        this.material.uniforms.uColor.value.set('#35d7d0')
    }

    keepSampleOutsidePlayer(sample, index)
    {
        const playerState = this.state.player
        const playerX = playerState.position.current[0]
        const playerY = playerState.position.current[1]
        const playerZ = playerState.position.current[2]

        if(sample.y < playerY + this.bodyBottomOffset || sample.y > playerY + this.bodyTopOffset)
            return

        const toSampleX = sample.x - playerX
        const toSampleZ = sample.z - playerZ
        const distance = Math.hypot(toSampleX, toSampleZ)
        const tailRatio = index / (this.samplesCount - 1)
        const radius = this.bodyRadius + this.width * 0.5 * (1 - tailRatio)

        if(distance >= radius)
            return

        let pushX = toSampleX
        let pushZ = toSampleZ

        if(distance < 0.0001)
        {
            pushX = this.back.x
            pushZ = this.back.z
        }

        const pushDistance = Math.hypot(pushX, pushZ) || 1
        sample.x = playerX + pushX / pushDistance * radius
        sample.z = playerZ + pushZ / pushDistance * radius
    }

    setMesh()
    {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.frustumCulled = false
        this.scene.add(this.mesh)
    }

    update()
    {
        const playerState = this.state.player
        const windState = this.state.wind
        const sunState = this.state.sun
        const delta = this.time.delta
        const elapsed = this.time.elapsed

        // Anchor at the top back of the wisp, following the body's lean
        // without inheriting the cone mesh's independent spin.
        this.view.player.getRibbonAnchor(this.anchor, this.anchorUpOffset, this.anchorBackOffset)
        this.back.set(Math.sin(playerState.rotation), 0, Math.cos(playerState.rotation))
        this.samples[0].copy(this.anchor)

        // Chain follow with flutter and droop
        const flutter = this.flutterAmplitude * (0.3 + windState.strength)

        for(let pass = 0; pass < 2; pass++)
        {
            for(let i = 1; i < this.samplesCount; i++)
            {
                const sample = this.samples[i]
                const previous = this.samples[i - 1]

                if(pass === 0)
                {
                    sample.y -= this.droop * delta * (i / this.samplesCount)
                    sample.x += Math.sin(elapsed * 5 + i * 0.7) * flutter * delta * 20
                    sample.y += Math.sin(elapsed * 3.4 + i * 1.1) * flutter * delta * 12
                }

                this.direction.subVectors(sample, previous)
                const distance = this.direction.length()

                if(distance > this.segmentLength)
                {
                    this.direction.multiplyScalar(this.segmentLength / distance)
                    sample.copy(previous).add(this.direction)
                }

                this.keepSampleOutsidePlayer(sample, i)
            }
        }

        // Rebuild the scarf as individual linked panels
        for(let i = 0; i < this.samplesCount - 1; i++)
        {
            const sample = this.samples[i]
            const next = this.samples[i + 1]

            this.direction.subVectors(next, sample)

            if(this.direction.lengthSq() > 0.000001)
            {
                this.side.crossVectors(this.direction, this.up)
                this.side.normalize()
            }

            const gap = Math.min(this.panelGapRatio, 0.45)
            this.panelStart.copy(sample).lerp(next, gap * 0.5)
            this.panelEnd.copy(sample).lerp(next, 1 - gap * 0.5)

            const startRatio = i / (this.samplesCount - 1)
            const endRatio = (i + 1) / (this.samplesCount - 1)
            const startHalfWidth = this.width * 0.5 * (this.tipWidthRatio + (1 - this.tipWidthRatio) * (1 - startRatio))
            const endHalfWidth = this.width * 0.5 * (this.tipWidthRatio + (1 - this.tipWidthRatio) * (1 - endRatio))
            const vertexIndex = i * 4

            this.positionAttribute.setXYZ(
                vertexIndex,
                this.panelStart.x - this.side.x * startHalfWidth,
                this.panelStart.y - this.side.y * startHalfWidth,
                this.panelStart.z - this.side.z * startHalfWidth
            )
            this.positionAttribute.setXYZ(
                vertexIndex + 1,
                this.panelStart.x + this.side.x * startHalfWidth,
                this.panelStart.y + this.side.y * startHalfWidth,
                this.panelStart.z + this.side.z * startHalfWidth
            )
            this.positionAttribute.setXYZ(
                vertexIndex + 2,
                this.panelEnd.x - this.side.x * endHalfWidth,
                this.panelEnd.y - this.side.y * endHalfWidth,
                this.panelEnd.z - this.side.z * endHalfWidth
            )
            this.positionAttribute.setXYZ(
                vertexIndex + 3,
                this.panelEnd.x + this.side.x * endHalfWidth,
                this.panelEnd.y + this.side.y * endHalfWidth,
                this.panelEnd.z + this.side.z * endHalfWidth
            )
        }

        this.positionAttribute.needsUpdate = true

        const speedRatio = playerState.horizontalSpeed < 0.08 ? 0 : Math.min(playerState.horizontalSpeed / this.fadeSpeedThreshold, 1)
        const targetOpacity = this.idleOpacity + (1 - this.idleOpacity) * speedRatio
        this.opacity += (targetOpacity - this.opacity) * (1 - Math.exp(- this.opacityLerpRate * delta))

        this.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
        this.material.uniforms.uOpacity.value = this.opacity
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/ribbon')

        folder.addColor(this.material.uniforms.uColor, 'value').name('uColor')
        folder.add(this, 'width').min(0).max(1).step(0.01)
        folder.add(this, 'tipWidthRatio').min(0).max(1).step(0.01)
        folder.add(this, 'panelGapRatio').min(0).max(0.45).step(0.01)
        folder.add(this, 'flutterAmplitude').min(0).max(0.2).step(0.005)
        folder.add(this, 'droop').min(0).max(3).step(0.05)
        folder.add(this, 'bodyRadius').min(0).max(2).step(0.01)
        folder.add(this, 'idleOpacity').min(0).max(1).step(0.01)
        folder.add(this, 'fadeSpeedThreshold').min(0.1).max(20).step(0.1)
        folder.add(this, 'opacityLerpRate').min(0.1).max(20).step(0.1)
    }
}
