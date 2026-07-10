import * as THREE from 'three'

import State from '@/State/State.js'
import View from '@/View/View.js'

export default class ProgressiveBounceCourses
{
    constructor()
    {
        this.state = State.getInstance()
        this.view = View.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene

        this.color = new THREE.Color()
        this.forward = new THREE.Vector3(0, 0, - 1)
        this.tiltAxis = new THREE.Vector3(0, 0, - 1)
        this.tiltQuaternion = new THREE.Quaternion()
        this.nextColor = new THREE.Color('#fff0a6')
        this.idleColor = new THREE.Color('#74d7ff')
        this.angledColor = new THREE.Color('#ff9bbd')
        this.completedColor = new THREE.Color('#8aa8bb')
        this.prizeColor = new THREE.Color('#ffd166')
        this.failColor = new THREE.Color('#5d7484')

        this.squashDuration = 0.35
        this.fadeAfterComplete = 0.5

        this.padGeometry = new THREE.CylinderGeometry(1, 1, 0.16, 28, 1).toNonIndexed()
        this.padGeometry.computeVertexNormals()
        this.markerGeometry = new THREE.ConeGeometry(0.38, 1.15, 3, 1).toNonIndexed()
        this.markerGeometry.rotateX(Math.PI * 0.5)
        this.markerGeometry.rotateZ(- Math.PI * 0.5)
        this.prizeGeometry = new THREE.IcosahedronGeometry(0.9, 1).toNonIndexed()
        this.prizeGeometry.computeVertexNormals()

        this.pads = []
        this.prize = null

        this.shadowGeometry = new THREE.CylinderGeometry(1, 1, 0.025, 20, 1)
        this.shadowMaterial = new THREE.MeshBasicMaterial({
            color: '#10222b',
            transparent: true,
            opacity: 0,
            depthWrite: false
        })
        this.shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial)
        this.shadow.visible = false
        this.shadow.frustumCulled = false
        this.shadow.renderOrder = 2
        this.scene.add(this.shadow)

        this.setCelebration()

        this.state.progressiveBounceCourses.events.on('prizeCollect', ({ position }) =>
        {
            this.startCelebration(position)
        })
    }

    setCelebration()
    {
        this.confettiCount = 80
        this.confettiDuration = 2.2
        this.confettiStartTime = - 999
        this.confettiItems = []
        this.confettiDummy = new THREE.Object3D()
        this.confettiPalette = [
            new THREE.Color('#74d7ff'),
            new THREE.Color('#ff9bbd'),
            new THREE.Color('#ffd166'),
            new THREE.Color('#b6ff7a')
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

    createPadMesh()
    {
        const group = new THREE.Group()
        group.visible = false
        group.frustumCulled = false
        this.scene.add(group)

        const padMaterial = new THREE.MeshBasicMaterial({
            color: this.idleColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        const pad = new THREE.Mesh(this.padGeometry, padMaterial)
        group.add(pad)

        const markerMaterial = new THREE.MeshBasicMaterial({
            color: this.angledColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        const marker = new THREE.Mesh(this.markerGeometry, markerMaterial)
        marker.position.y = 0.22
        group.add(marker)

        const item = { group, pad, marker }
        this.pads.push(item)

        return item
    }

    createPrizeMesh()
    {
        const material = new THREE.MeshBasicMaterial({
            color: this.prizeColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        const mesh = new THREE.Mesh(this.prizeGeometry, material)
        mesh.visible = false
        mesh.frustumCulled = false
        this.scene.add(mesh)

        this.prize = { mesh }

        return this.prize
    }

    getPadMesh(index)
    {
        while(this.pads.length <= index)
            this.createPadMesh()

        return this.pads[index]
    }

    getPrizeMesh()
    {
        return this.prize ?? this.createPrizeMesh()
    }

    updatePad(item, pad, course, nextPad)
    {
        const group = item.group
        const mesh = item.pad
        const marker = item.marker
        const revealed = pad.index <= course.revealedUntil
        const preview = pad.index === course.revealedUntil + 1 && course.completedAt === 0
        const restartPad = course.failed && pad.index === 0
        const isNext = pad === nextPad
        const squashAge = this.time.elapsed - pad.lastBounceTime
        const squash = squashAge < this.squashDuration ? squashAge / this.squashDuration : 1
        let opacity = 0

        if(revealed)
            opacity = isNext ? 0.95 : pad.bounced || pad.skipped ? 0.55 : 0.78
        else if(preview)
            opacity = 0.13 + Math.sin(this.time.elapsed * 4) * 0.03

        if(pad.bounced)
            opacity = Math.max(0.42, opacity * Math.max(0.7, 1 - (this.time.elapsed - pad.bounceTime) / 0.9))

        if(restartPad)
            opacity = 0.9
        else if(course.completedAt > 0 && course.failed)
            opacity *= Math.max(0, 1 - (this.time.elapsed - course.completedAt) / this.fadeAfterComplete)

        group.visible = opacity > 0.01
        group.position.set(pad.position[0], pad.position[1], pad.position[2])

        this.tiltAxis.set(course.direction[0], 0, course.direction[2]).normalize()
        this.tiltQuaternion.setFromAxisAngle(this.tiltAxis, pad.tiltDirection * pad.tiltAngle)
        group.quaternion.copy(this.tiltQuaternion)

        const pulse = isNext || restartPad ? 1 + Math.sin(this.time.elapsed * 5) * 0.08 : 1 + Math.sin(this.time.elapsed * 2 + pad.index * 0.6) * 0.035
        group.scale.set(
            pad.radius * pulse * (1 + 0.34 * (1 - squash)),
            0.4 + 0.6 * squash,
            pad.radius * pulse * (1 + 0.34 * (1 - squash))
        )

        this.color.copy(pad.tiltDirection === 0 ? this.idleColor : this.angledColor)

        if(pad.bounced)
            this.color.lerp(this.completedColor, 0.7)
        else if(pad.skipped)
            this.color.lerp(this.completedColor, 0.45)

        if(restartPad)
            this.color.lerp(this.nextColor, 0.72)
        else if(course.failed)
            this.color.lerp(this.failColor, 0.75)
        else if(isNext)
            this.color.lerp(this.nextColor, 0.65)

        mesh.material.color.copy(this.color)
        mesh.material.opacity = opacity

        marker.visible = pad.tiltDirection !== 0 && opacity > 0.01
        marker.position.x = 0.18 * pad.tiltDirection
        marker.rotation.y = pad.tiltDirection > 0 ? - Math.PI * 0.5 : Math.PI * 0.5
        marker.material.color.copy(this.color)
        marker.material.opacity = opacity * (revealed ? 0.9 : 0.45)
    }

    updatePrize(prize, course)
    {
        const item = this.getPrizeMesh()
        const mesh = item.mesh
        const allResolved = course.pads.every(pad => pad.bounced || pad.skipped)
        let opacity = allResolved ? 0.9 : 0

        if(prize.collected)
            opacity *= Math.max(0, 1 - (this.time.elapsed - prize.collectTime) / 0.45)

        mesh.visible = opacity > 0.01
        mesh.position.set(
            prize.position[0],
            prize.position[1] + Math.sin(this.time.elapsed * 2.4) * 0.25,
            prize.position[2]
        )
        mesh.rotation.y = this.time.elapsed * 1.5
        mesh.rotation.x = Math.sin(this.time.elapsed * 0.9) * 0.3
        mesh.scale.setScalar(1 + Math.sin(this.time.elapsed * 5.2) * 0.08)
        mesh.material.color.copy(this.prizeColor)
        mesh.material.opacity = opacity
    }

    updateShadow(shadowPad)
    {
        if(!shadowPad)
        {
            this.shadow.visible = false
            return
        }

        const player = this.state.player
        const playerX = player.position.current[0]
        const playerY = player.position.current[1]
        const playerZ = player.position.current[2]
        const height = playerY - shadowPad.position[1]
        const rimDistance = Math.hypot(playerX - shadowPad.position[0], playerZ - shadowPad.position[2])
        const heightRatio = 1 - Math.min(height / 28, 1)
        const rimFade = Math.min(Math.max((shadowPad.radius - rimDistance) / 0.6, 0), 1)
        const radius = 0.55 + 0.45 * heightRatio

        this.shadow.visible = true
        this.shadow.position.set(playerX, shadowPad.position[1] + 0.12, playerZ)
        this.shadow.scale.set(radius, 1, radius)
        this.shadow.material.opacity = rimFade * 0.38
    }

    update()
    {
        const course = this.state.progressiveBounceCourses.course
        const player = this.state.player
        let shadowPad = null

        if(!course)
        {
            for(const item of this.pads)
                item.group.visible = false

            if(this.prize)
                this.prize.mesh.visible = false

            this.updateShadow(null)
            this.updateCelebration()
            return
        }

        const nextPad = this.state.progressiveBounceCourses.getNextPad()

        for(let i = 0; i < course.pads.length; i++)
        {
            const pad = course.pads[i]
            this.updatePad(this.getPadMesh(i), pad, course, nextPad)

            const overlap = Math.hypot(
                player.position.current[0] - pad.position[0],
                player.position.current[2] - pad.position[2]
            )

            if(
                pad.index <= course.revealedUntil
                && !pad.bounced
                && !pad.skipped
                && overlap < pad.radius
                && player.position.current[1] > pad.position[1]
                && (!shadowPad || pad.position[1] > shadowPad.position[1])
            )
                shadowPad = pad
        }

        this.updatePrize(course.prize, course)
        this.updateShadow(shadowPad)
        this.updateCelebration()

        for(let i = course.pads.length; i < this.pads.length; i++)
            this.pads[i].group.visible = false
    }
}
