import * as THREE from 'three'

import State from '@/State/State.js'
import View from '@/View/View.js'
import Debug from '@/Debug/Debug.js'

export default class DuneMelody
{
    constructor()
    {
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene

        this.markerHeight = 2.3
        this.markerRadius = 1.05
        this.markerOpacity = 0.55
        this.passedOpacity = 0.22
        this.visibleDistance = 260

        this.idleColor = new THREE.Color('#74d7ff')
        this.nextColor = new THREE.Color('#fff0a6')
        this.notedColor = new THREE.Color('#b6ff7a')
        this.prizeColor = new THREE.Color('#ffd166')

        this.color = new THREE.Color()

        this.markerGeometry = new THREE.TorusGeometry(1, 0.09, 5, 26).toNonIndexed()
        this.markerGeometry.rotateX(- Math.PI * 0.5)
        this.prizeGeometry = new THREE.IcosahedronGeometry(0.9, 1).toNonIndexed()
        this.prizeGeometry.computeVertexNormals()

        this.fieldViews = new Map()

        this.setNoteBursts()
        this.setCelebration()
        this.setDebug()

        this.state.duneMelody.events.on('note', ({ position }) =>
        {
            this.startNoteBurst(position)
        })

        this.state.duneMelody.events.on('prizeCollect', ({ position }) =>
        {
            this.startCelebration(position)
        })
    }

    setNoteBursts()
    {
        this.noteBursts = []
        this.noteBurstDuration = 0.55

        this.noteBurstGeometry = new THREE.TorusGeometry(1, 0.07, 4, 24).toNonIndexed()
        this.noteBurstGeometry.rotateX(- Math.PI * 0.5)

        for(let i = 0; i < 3; i++)
        {
            const material = new THREE.MeshBasicMaterial({
                color: this.notedColor,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                side: THREE.DoubleSide
            })
            const mesh = new THREE.Mesh(this.noteBurstGeometry, material)
            mesh.visible = false
            mesh.frustumCulled = false
            this.scene.add(mesh)

            this.noteBursts.push({ mesh, material, startTime: - 999 })
        }

        this.noteBurstIndex = 0
    }

    startNoteBurst(position)
    {
        const burst = this.noteBursts[this.noteBurstIndex]
        this.noteBurstIndex = (this.noteBurstIndex + 1) % this.noteBursts.length

        burst.startTime = this.time.elapsed
        burst.mesh.position.set(position[0], position[1] + 0.15, position[2])
    }

    updateNoteBursts()
    {
        for(const burst of this.noteBursts)
        {
            const age = this.time.elapsed - burst.startTime

            if(age >= this.noteBurstDuration)
            {
                burst.mesh.visible = false
                continue
            }

            const ratio = age / this.noteBurstDuration
            burst.mesh.visible = true
            burst.mesh.scale.setScalar(0.4 + ratio * 4.2)
            burst.material.opacity = 0.75 * (1 - ratio)
        }
    }

    setCelebration()
    {
        this.confettiCount = 80
        this.confettiDuration = 2.2
        this.confettiStartTime = - 999
        this.confettiItems = []
        this.confettiDummy = new THREE.Object3D()
        this.confettiPalette = [
            new THREE.Color('#b6ff7a'),
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

    createFieldView(field)
    {
        const group = new THREE.Group()
        group.frustumCulled = false
        this.scene.add(group)

        const markers = []

        for(const mogul of field.moguls)
        {
            const material = new THREE.MeshBasicMaterial({
                color: this.idleColor,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                side: THREE.DoubleSide
            })
            const mesh = new THREE.Mesh(this.markerGeometry, material)
            mesh.position.set(mogul.x, mogul.crestY + this.markerHeight, mogul.z)
            mesh.frustumCulled = false
            group.add(mesh)

            markers.push({ mesh, material, mogul })
        }

        const prizeMaterial = new THREE.MeshBasicMaterial({
            color: this.prizeColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        const prizeMesh = new THREE.Mesh(this.prizeGeometry, prizeMaterial)
        prizeMesh.visible = false
        prizeMesh.frustumCulled = false
        group.add(prizeMesh)

        const fieldView = { group, markers, prizeMesh, prizeMaterial }
        this.fieldViews.set(field.k, fieldView)

        return fieldView
    }

    destroyFieldView(k)
    {
        const fieldView = this.fieldViews.get(k)

        if(!fieldView)
            return

        for(const marker of fieldView.markers)
            marker.material.dispose()

        fieldView.prizeMaterial.dispose()
        this.scene.remove(fieldView.group)
        this.fieldViews.delete(k)
    }

    updateFieldView(field, fieldView, player)
    {
        const duneMelody = this.state.duneMelody
        const playerZ = player.position.current[2]
        const distance = Math.abs(field.startZ - playerZ)
        const presence = 1 - THREE.MathUtils.smoothstep(distance, this.visibleDistance * 0.75, this.visibleDistance)

        fieldView.group.visible = presence > 0.01

        if(!fieldView.group.visible)
            return

        // The next expected landing: the first mogul still ahead of the player
        let nextMogul = null

        if(playerZ < field.startZ + duneMelody.fieldMarginZ && playerZ > field.endZ)
            nextMogul = field.moguls.find(mogul => mogul.z < playerZ) ?? null

        for(const marker of fieldView.markers)
        {
            const passed = marker.mogul.z > playerZ
            const isNext = marker.mogul === nextMogul
            const pulse = isNext
                ? 1 + Math.sin(this.time.elapsed * 5) * 0.14
                : 1 + Math.sin(this.time.elapsed * 2 + marker.mogul.index * 0.7) * 0.05

            marker.mesh.scale.setScalar(this.markerRadius * pulse)
            marker.mesh.position.y = marker.mogul.crestY + this.markerHeight + Math.sin(this.time.elapsed * 1.8 + marker.mogul.index) * 0.12

            this.color.copy(this.idleColor)

            if(isNext)
                this.color.lerp(this.nextColor, 0.75)
            else if(passed && field.notes > 0)
                this.color.lerp(this.notedColor, 0.4)

            marker.material.color.copy(this.color)
            marker.material.opacity = (passed ? this.passedOpacity : this.markerOpacity) * presence
        }

        const prize = field.prize
        let prizeOpacity = duneMelody.isPrizeActive(field) ? 0.9 : 0

        if(prize.collected)
            prizeOpacity = 0.9 * Math.max(0, 1 - (this.time.elapsed - prize.collectTime) / 0.45)

        fieldView.prizeMesh.visible = prizeOpacity > 0.01

        if(fieldView.prizeMesh.visible)
        {
            fieldView.prizeMesh.position.set(
                prize.position[0],
                prize.position[1] + Math.sin(this.time.elapsed * 2.4) * 0.25,
                prize.position[2]
            )
            fieldView.prizeMesh.rotation.y = this.time.elapsed * 1.5
            fieldView.prizeMesh.rotation.x = Math.sin(this.time.elapsed * 0.9) * 0.3
            fieldView.prizeMesh.scale.setScalar(1 + Math.sin(this.time.elapsed * 5.2) * 0.08)
            fieldView.prizeMaterial.opacity = prizeOpacity
        }
    }

    update()
    {
        const duneMelody = this.state.duneMelody
        const player = this.state.player

        for(const field of duneMelody.fields.values())
        {
            if(!field.built)
                continue

            const fieldView = this.fieldViews.get(field.k) ?? this.createFieldView(field)
            this.updateFieldView(field, fieldView, player)
        }

        for(const k of this.fieldViews.keys())
        {
            const field = duneMelody.fields.get(k)

            if(!field || !field.built)
                this.destroyFieldView(k)
        }

        this.updateNoteBursts()
        this.updateCelebration()
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/duneMelody')

        folder.add(this, 'markerHeight').min(0.5).max(6).step(0.1)
        folder.add(this, 'markerRadius').min(0.3).max(3).step(0.05)
        folder.add(this, 'markerOpacity').min(0).max(1).step(0.05)
        folder.add(this, 'visibleDistance').min(50).max(600).step(10)
    }
}
