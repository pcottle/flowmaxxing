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

        this.samplesCount = 40
        this.segmentLength = 0.18
        this.width = 0.35
        this.anchorUpOffset = 1.4
        this.anchorBackOffset = 0.45
        this.flutterAmplitude = 0.035
        this.droop = 0.6

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

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        this.setDebug()
    }

    setGeometry()
    {
        const vertexCount = this.samplesCount * 2
        const positions = new Float32Array(vertexCount * 3)
        const alphas = new Float32Array(vertexCount)
        const indices = []

        for(let i = 0; i < this.samplesCount; i++)
        {
            const alpha = 1 - i / (this.samplesCount - 1)
            alphas[i * 2] = alpha
            alphas[i * 2 + 1] = alpha

            if(i < this.samplesCount - 1)
            {
                const a = i * 2
                indices.push(a, a + 1, a + 2)
                indices.push(a + 2, a + 1, a + 3)
            }
        }

        this.geometry = new THREE.BufferGeometry()
        this.positionAttribute = new THREE.Float32BufferAttribute(positions, 3)
        this.positionAttribute.setUsage(THREE.DynamicDrawUsage)
        this.geometry.setAttribute('position', this.positionAttribute)
        this.geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1))
        this.geometry.setIndex(indices)
    }

    setMaterial()
    {
        this.material = new RibbonMaterial()
        this.material.uniforms.uColor.value.set('#c23b22')
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

        // Anchor at the top back of the wisp
        this.anchor.set(
            playerState.position.current[0] + Math.sin(playerState.rotation) * this.anchorBackOffset,
            playerState.position.current[1] + this.anchorUpOffset,
            playerState.position.current[2] + Math.cos(playerState.rotation) * this.anchorBackOffset
        )
        this.samples[0].copy(this.anchor)

        // Chain follow with flutter and droop
        const flutter = this.flutterAmplitude * (0.3 + windState.strength)

        for(let i = 1; i < this.samplesCount; i++)
        {
            const sample = this.samples[i]
            const previous = this.samples[i - 1]

            sample.y -= this.droop * delta * (i / this.samplesCount)
            sample.x += Math.sin(elapsed * 5 + i * 0.7) * flutter * delta * 20
            sample.y += Math.sin(elapsed * 3.4 + i * 1.1) * flutter * delta * 12

            this.direction.subVectors(sample, previous)
            const distance = this.direction.length()

            if(distance > this.segmentLength)
            {
                this.direction.multiplyScalar(this.segmentLength / distance)
                sample.copy(previous).add(this.direction)
            }
        }

        // Rebuild the strip
        for(let i = 0; i < this.samplesCount; i++)
        {
            const sample = this.samples[i]
            const next = this.samples[Math.min(i + 1, this.samplesCount - 1)]
            const previous = this.samples[Math.max(i - 1, 0)]

            this.direction.subVectors(next, previous)

            if(this.direction.lengthSq() > 0.000001)
            {
                this.side.crossVectors(this.direction, this.up)
                this.side.normalize()
            }

            const halfWidth = this.width * 0.5 * (1 - i / (this.samplesCount - 1))

            this.positionAttribute.setXYZ(
                i * 2,
                sample.x - this.side.x * halfWidth,
                sample.y - this.side.y * halfWidth,
                sample.z - this.side.z * halfWidth
            )
            this.positionAttribute.setXYZ(
                i * 2 + 1,
                sample.x + this.side.x * halfWidth,
                sample.y + this.side.y * halfWidth,
                sample.z + this.side.z * halfWidth
            )
        }

        this.positionAttribute.needsUpdate = true

        this.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/ribbon')

        folder.addColor(this.material.uniforms.uColor, 'value').name('uColor')
        folder.add(this.material.uniforms.uOpacity, 'value').min(0).max(1).step(0.01).name('uOpacity')
        folder.add(this, 'width').min(0).max(1).step(0.01)
        folder.add(this, 'flutterAmplitude').min(0).max(0.2).step(0.005)
        folder.add(this, 'droop').min(0).max(3).step(0.05)
    }
}
