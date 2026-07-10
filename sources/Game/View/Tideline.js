import * as THREE from 'three'

import State from '@/State/State.js'
import View from '@/View/View.js'
import Debug from '@/Debug/Debug.js'
import SparklesMaterial from './Materials/SparklesMaterial.js'

export default class Tideline
{
    constructor()
    {
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene
        this.viewport = this.state.viewport

        this.maxSamples = 80
        this.groundOffset = 0.14
        this.widthRatio = 0.8
        this.baseOpacity = 0.62
        this.outOfBandOpacity = 0.4
        this.opacityLerpRate = 3
        this.frontGlowDistance = 12
        this.endTaperSamples = 3
        this.sparklesCount = 40
        this.sparkleLateralJitter = 1.3

        this.aheadColor = new THREE.Color('#6fe8c9')
        this.doneColor = new THREE.Color('#ffd166')
        this.prizeColor = new THREE.Color('#ffd166')

        this.color = new THREE.Color()
        this.up = new THREE.Vector3(0, 1, 0)
        this.direction = new THREE.Vector3()
        this.side = new THREE.Vector3()

        this.opacity = 0
        this.activeSamplesCount = 0

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        this.setPrize()
        this.setSparkles()
        this.setCelebration()
        this.setDebug()

        this.state.tideline.events.on('courseStart', (course) =>
        {
            this.buildRibbon(course)
        })

        this.state.tideline.events.on('prizeCollect', ({ position }) =>
        {
            this.startCelebration(position)
        })
    }

    setGeometry()
    {
        const vertexCount = this.maxSamples * 2
        const positions = new Float32Array(vertexCount * 3)
        const colors = new Float32Array(vertexCount * 3)
        const indices = []

        for(let i = 0; i < this.maxSamples - 1; i++)
        {
            const a = i * 2

            indices.push(a, a + 1, a + 2)
            indices.push(a + 2, a + 1, a + 3)
        }

        this.geometry = new THREE.BufferGeometry()
        this.positionAttribute = new THREE.Float32BufferAttribute(positions, 3)
        this.positionAttribute.setUsage(THREE.DynamicDrawUsage)
        this.colorAttribute = new THREE.Float32BufferAttribute(colors, 3)
        this.colorAttribute.setUsage(THREE.DynamicDrawUsage)
        this.geometry.setAttribute('position', this.positionAttribute)
        this.geometry.setAttribute('color', this.colorAttribute)
        this.geometry.setIndex(indices)
    }

    setMaterial()
    {
        this.material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        })
    }

    setMesh()
    {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.visible = false
        this.mesh.frustumCulled = false
        this.mesh.renderOrder = 1
        this.scene.add(this.mesh)
    }

    setPrize()
    {
        this.prizeGeometry = new THREE.IcosahedronGeometry(0.9, 1).toNonIndexed()
        this.prizeGeometry.computeVertexNormals()
        this.prizeMaterial = new THREE.MeshBasicMaterial({
            color: this.prizeColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        this.prize = new THREE.Mesh(this.prizeGeometry, this.prizeMaterial)
        this.prize.visible = false
        this.prize.frustumCulled = false
        this.scene.add(this.prize)
    }

    setSparkles()
    {
        const positions = new Float32Array(this.sparklesCount * 3)
        const phases = new Float32Array(this.sparklesCount)
        const popSpeeds = new Float32Array(this.sparklesCount)
        const sizes = new Float32Array(this.sparklesCount)
        const angles = new Float32Array(this.sparklesCount)
        const densities = new Float32Array(this.sparklesCount)

        for(let i = 0; i < this.sparklesCount; i++)
        {
            positions[i * 3 + 1] = - 1000
            phases[i] = Math.random()
            popSpeeds[i] = 0.18 + Math.random() * 0.3
            sizes[i] = 0.7 + Math.random() * 0.6
            angles[i] = Math.random() < 0.5 ? 0 : Math.PI * 0.25
            densities[i] = i / this.sparklesCount
        }

        this.sparklesGeometry = new THREE.BufferGeometry()
        this.sparklesPositionAttribute = new THREE.Float32BufferAttribute(positions, 3)
        this.sparklesPositionAttribute.setUsage(THREE.DynamicDrawUsage)
        this.sparklesGeometry.setAttribute('position', this.sparklesPositionAttribute)
        this.sparklesGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))
        this.sparklesGeometry.setAttribute('aPopSpeed', new THREE.Float32BufferAttribute(popSpeeds, 1))
        this.sparklesGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
        this.sparklesGeometry.setAttribute('aAngle', new THREE.Float32BufferAttribute(angles, 1))
        this.sparklesGeometry.setAttribute('aDensity', new THREE.Float32BufferAttribute(densities, 1))

        this.sparklesMaterial = new SparklesMaterial()
        this.sparklesMaterial.uniforms.uColor.value.set('#bffbe8')
        this.sparklesMaterial.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio

        this.sparkles = new THREE.Points(this.sparklesGeometry, this.sparklesMaterial)
        this.sparkles.visible = false
        this.sparkles.frustumCulled = false
        this.scene.add(this.sparkles)

        this.sparklesFrameIndex = 0
    }

    setCelebration()
    {
        this.confettiCount = 80
        this.confettiDuration = 2.2
        this.confettiStartTime = - 999
        this.confettiItems = []
        this.confettiDummy = new THREE.Object3D()
        this.confettiPalette = [
            new THREE.Color('#6fe8c9'),
            new THREE.Color('#74d7ff'),
            new THREE.Color('#ffd166'),
            new THREE.Color('#fff0a6')
        ]

        this.confettiGeometry = new THREE.PlaneGeometry(0.24, 0.15)
        this.confettiMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 1,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        this.confetti = new THREE.InstancedMesh(this.confettiGeometry, this.confettiMaterial, this.confettiCount)
        this.confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.confetti.visible = false
        this.confetti.frustumCulled = false
        this.scene.add(this.confetti)

        this.shockwaveGeometry = new THREE.TorusGeometry(1, 0.06, 4, 28).toNonIndexed()
        this.shockwaveGeometry.rotateX(- Math.PI * 0.5)
        this.shockwaveMaterial = new THREE.MeshBasicMaterial({
            color: this.prizeColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        this.shockwave = new THREE.Mesh(this.shockwaveGeometry, this.shockwaveMaterial)
        this.shockwave.visible = false
        this.shockwave.frustumCulled = false
        this.scene.add(this.shockwave)
    }

    startCelebration(position)
    {
        this.confettiStartTime = this.time.elapsed
        this.confettiItems.length = 0

        for(let i = 0; i < this.confettiCount; i++)
        {
            const angle = Math.random() * Math.PI * 2
            const radial = 1.4 + Math.random() * 4.2

            this.confettiItems.push({
                x: position[0],
                y: position[1],
                z: position[2],
                vx: Math.sin(angle) * radial,
                vy: 5 + Math.random() * 5,
                vz: Math.cos(angle) * radial,
                spinX: (Math.random() - 0.5) * 12,
                spinY: (Math.random() - 0.5) * 12,
                spinZ: (Math.random() - 0.5) * 12,
                scale: 0.8 + Math.random() * 0.8,
                phase: Math.random() * Math.PI * 2
            })

            this.confetti.setColorAt(i, this.confettiPalette[i % this.confettiPalette.length])
        }

        this.confetti.instanceColor.needsUpdate = true
        this.shockwave.position.set(position[0], position[1], position[2])
    }

    updateCelebration()
    {
        const age = this.time.elapsed - this.confettiStartTime

        if(age >= this.confettiDuration)
        {
            this.confetti.visible = false
            this.shockwave.visible = false
            return
        }

        const dummy = this.confettiDummy

        for(let i = 0; i < this.confettiItems.length; i++)
        {
            const item = this.confettiItems[i]

            item.vy -= 7 * this.time.delta
            item.vx *= 1 - 0.9 * this.time.delta
            item.vz *= 1 - 0.9 * this.time.delta
            item.x += item.vx * this.time.delta
            item.y += item.vy * this.time.delta
            item.z += item.vz * this.time.delta

            dummy.position.set(item.x, item.y + Math.sin(this.time.elapsed * 6 + item.phase) * 0.1, item.z)
            dummy.rotation.set(item.spinX * age, item.spinY * age, item.spinZ * age)
            dummy.scale.setScalar(item.scale)
            dummy.updateMatrix()
            this.confetti.setMatrixAt(i, dummy.matrix)
        }

        this.confetti.visible = true
        this.confetti.instanceMatrix.needsUpdate = true
        this.confettiMaterial.opacity = 1 - THREE.MathUtils.smoothstep(age, this.confettiDuration * 0.65, this.confettiDuration)

        if(age < 0.65)
        {
            const ripple = age / 0.65
            this.shockwave.visible = true
            this.shockwave.scale.setScalar(0.5 + ripple * 8)
            this.shockwaveMaterial.opacity = 0.85 * (1 - ripple)
        }
        else
        {
            this.shockwave.visible = false
        }
    }

    buildRibbon(course)
    {
        const samples = course.samples
        this.activeSamplesCount = Math.min(samples.length, this.maxSamples)

        const bandHalfWidth = this.state.tideline.bandHalfWidth * this.widthRatio

        for(let i = 0; i < this.activeSamplesCount; i++)
        {
            const sample = samples[i]
            const previous = samples[Math.max(i - 1, 0)]
            const next = samples[Math.min(i + 1, this.activeSamplesCount - 1)]

            this.direction.set(next.x - previous.x, 0, next.z - previous.z)

            if(this.direction.lengthSq() > 0.000001)
            {
                this.side.crossVectors(this.direction, this.up)
                this.side.normalize()
            }

            const y = sample.y + this.groundOffset

            this.positionAttribute.setXYZ(
                i * 2,
                sample.x - this.side.x * bandHalfWidth,
                y,
                sample.z - this.side.z * bandHalfWidth
            )
            this.positionAttribute.setXYZ(
                i * 2 + 1,
                sample.x + this.side.x * bandHalfWidth,
                y,
                sample.z + this.side.z * bandHalfWidth
            )
        }

        // Collapse any unused panels onto the last sample so they render as
        // degenerate (invisible) triangles
        const lastSample = samples[this.activeSamplesCount - 1]

        for(let i = this.activeSamplesCount; i < this.maxSamples; i++)
        {
            this.positionAttribute.setXYZ(i * 2, lastSample.x, lastSample.y, lastSample.z)
            this.positionAttribute.setXYZ(i * 2 + 1, lastSample.x, lastSample.y, lastSample.z)
        }

        this.positionAttribute.needsUpdate = true
    }

    updateColors(course)
    {
        for(let i = 0; i < this.activeSamplesCount; i++)
        {
            const sample = course.samples[i]
            const completed = sample.arc < course.progress
            const frontDistance = Math.abs(sample.arc - course.progress)

            this.color.copy(completed ? this.doneColor : this.aheadColor)

            let brightness = completed ? 0.5 : 0.62

            if(frontDistance < this.frontGlowDistance)
            {
                const glow = 1 - frontDistance / this.frontGlowDistance
                brightness += glow * (0.55 + Math.sin(this.time.elapsed * 5) * 0.12)
            }

            const edgeTaper = Math.min(
                Math.min(i, this.activeSamplesCount - 1 - i) / this.endTaperSamples,
                1
            )
            brightness *= 0.2 + 0.8 * edgeTaper

            this.color.multiplyScalar(brightness)
            this.colorAttribute.setXYZ(i * 2, this.color.r, this.color.g, this.color.b)
            this.colorAttribute.setXYZ(i * 2 + 1, this.color.r, this.color.g, this.color.b)
        }

        this.colorAttribute.needsUpdate = true
    }

    getLinePosition(course, arc, target)
    {
        const samples = course.samples

        for(let i = 0; i < this.activeSamplesCount - 1; i++)
        {
            const a = samples[i]
            const b = samples[i + 1]

            if(arc > b.arc)
                continue

            const t = (arc - a.arc) / Math.max(b.arc - a.arc, 0.0001)
            target.set(
                a.x + (b.x - a.x) * t,
                a.y + (b.y - a.y) * t,
                a.z + (b.z - a.z) * t
            )

            return
        }

        const last = samples[this.activeSamplesCount - 1]
        target.set(last.x, last.y, last.z)
    }

    updateSparkles(course)
    {
        this.sparkles.visible = this.opacity > 0.01
        this.sparklesMaterial.uniforms.uPresence.value = Math.min(this.opacity * 1.6, 1)
        this.sparklesMaterial.uniforms.uTime.value = this.time.elapsed

        if(!this.sparkles.visible || !course)
            return

        this.sparklesFrameIndex++

        const point = this.direction

        for(let k = 0; k < 4; k++)
        {
            const i = (this.sparklesFrameIndex * 4 + k) % this.sparklesCount
            const arc = course.progress + Math.random() * Math.max(course.totalLength - course.progress, 5)

            this.getLinePosition(course, Math.min(arc, course.totalLength), point)
            this.sparklesPositionAttribute.setXYZ(
                i,
                point.x + (Math.random() - 0.5) * this.sparkleLateralJitter * 2,
                point.y + 0.12 + Math.random() * 0.3,
                point.z + (Math.random() - 0.5) * this.sparkleLateralJitter * 2
            )
        }

        this.sparklesPositionAttribute.needsUpdate = true
    }

    updatePrize(course)
    {
        if(!course)
        {
            this.prize.visible = false
            return
        }

        const prize = course.prize
        let opacity = prize.active ? 0.9 : 0

        if(prize.collected)
            opacity *= Math.max(0, 1 - (this.time.elapsed - prize.collectTime) / 0.45)

        this.prize.visible = opacity > 0.01
        this.prize.position.set(
            prize.position[0],
            prize.position[1] + Math.sin(this.time.elapsed * 2.4) * 0.25,
            prize.position[2]
        )
        this.prize.rotation.y = this.time.elapsed * 1.5
        this.prize.rotation.x = Math.sin(this.time.elapsed * 0.9) * 0.3
        this.prize.scale.setScalar(1 + Math.sin(this.time.elapsed * 5.2) * 0.08)
        this.prizeMaterial.opacity = opacity
    }

    update()
    {
        const course = this.state.tideline.course
        let targetOpacity = 0

        if(course)
        {
            targetOpacity = course.inBand ? this.baseOpacity : this.outOfBandOpacity

            if(course.completedAt > 0)
                targetOpacity *= Math.max(0, 1 - (this.time.elapsed - course.completedAt) / 1.2)

            // Ease the ribbon in on discovery
            targetOpacity *= Math.min((this.time.elapsed - course.createdAt) / 0.8, 1)
        }

        this.opacity += (targetOpacity - this.opacity) * (1 - Math.exp(- this.opacityLerpRate * this.time.delta))
        this.material.opacity = this.opacity
        this.mesh.visible = this.opacity > 0.01 && this.activeSamplesCount > 1

        if(course && this.mesh.visible)
            this.updateColors(course)

        this.updatePrize(course)
        this.updateSparkles(course)
        this.updateCelebration()
    }

    resize()
    {
        this.sparklesMaterial.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/tideline')

        folder.addColor(this, 'aheadColor')
        folder.addColor(this, 'doneColor')
        folder.add(this, 'baseOpacity').min(0).max(1).step(0.01)
        folder.add(this, 'widthRatio').min(0.3).max(1.5).step(0.05)
        folder.add(this, 'frontGlowDistance').min(2).max(30).step(1)
    }
}
