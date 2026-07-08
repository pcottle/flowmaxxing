import * as THREE from 'three'

import State from '@/State/State.js'
import View from '@/View/View.js'

export default class ObstacleCourses
{
    constructor()
    {
        this.state = State.getInstance()
        this.view = View.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene
        this.forward = new THREE.Vector3(0, 0, 1)
        this.direction = new THREE.Vector3(0, 0, - 1)
        this.rollQuaternion = new THREE.Quaternion()
        this.color = new THREE.Color()
        this.nextColor = new THREE.Color('#fff0a6')
        this.idleColor = new THREE.Color('#73d9ff')
        this.rollColor = new THREE.Color('#ff9bbd')
        this.missedColor = new THREE.Color('#8aa8bb')

        this.geometry = new THREE.TorusGeometry(1.45, 0.075, 4, 14).toNonIndexed()
        this.geometry.computeVertexNormals()
        this.markerGeometry = new THREE.ConeGeometry(0.22, 0.68, 3, 1).toNonIndexed()
        this.markerGeometry.rotateZ(- Math.PI * 0.5)
        this.rings = []
    }

    createRingMesh()
    {
        const group = new THREE.Group()
        group.visible = false
        group.frustumCulled = false
        this.scene.add(group)

        const ringMaterial = new THREE.MeshBasicMaterial({
            color: this.idleColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        const mesh = new THREE.Mesh(this.geometry, ringMaterial)
        group.add(mesh)

        const markerMaterial = new THREE.MeshBasicMaterial({
            color: this.rollColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        const marker = new THREE.Mesh(this.markerGeometry, markerMaterial)
        marker.position.x = 1.9
        group.add(marker)

        const hint = new THREE.Mesh(this.markerGeometry, markerMaterial.clone())
        hint.position.y = 2.35
        group.add(hint)

        const item = { group, mesh, marker, hint }
        this.rings.push(item)

        return item
    }

    getRingMesh(index)
    {
        while(this.rings.length <= index)
            this.createRingMesh()

        return this.rings[index]
    }

    update()
    {
        const obstacleState = this.state.obstacleCourses
        const course = obstacleState.course

        if(!course)
        {
            for(const item of this.rings)
                item.group.visible = false

            return
        }

        this.direction.set(course.direction[0], 0, course.direction[2]).normalize()
        const nextRing = obstacleState.getNextRing()
        const revealLimit = obstacleState.getRevealLimit()

        for(let i = 0; i < course.rings.length; i++)
        {
            const ring = course.rings[i]
            const item = this.getRingMesh(i)
            const group = item.group
            const mesh = item.mesh
            const marker = item.marker
            const hint = item.hint
            const isNext = ring === nextRing
            const revealed = ring.index <= revealLimit
            const pulse = isNext ? 1 + Math.sin(this.time.elapsed * 5.2) * 0.08 : 1
            if(revealed && ring.revealTime === 0)
                ring.revealTime = this.time.elapsed

            const fadeIn = ring.revealTime > 0 ? THREE.MathUtils.smoothstep(this.time.elapsed - ring.revealTime, 0, 0.9) : 0
            let opacity = isNext ? 0.95 : 0.58

            if(!revealed)
                opacity = 0

            if(ring.collected)
                opacity *= Math.max(0, 1 - (this.time.elapsed - ring.collectTime) / 0.45)
            else if(ring.missed)
                opacity = 0.18
            else
                opacity *= fadeIn

            this.color.copy(ring.missed ? this.missedColor : (ring.requiresRoll ? this.rollColor : this.idleColor))
            if(isNext)
                this.color.lerp(this.nextColor, 0.72)

            const y = THREE.MathUtils.lerp(ring.groundY + 0.8, ring.position[1], fadeIn)

            group.visible = opacity > 0.01
            group.position.set(ring.position[0], y, ring.position[2])
            group.quaternion.setFromUnitVectors(this.forward, this.direction)
            this.rollQuaternion.setFromAxisAngle(this.direction, this.time.elapsed * 0.9 + i * 0.55)
            group.scale.setScalar(pulse)
            mesh.quaternion.copy(this.rollQuaternion)
            mesh.material.opacity = opacity
            mesh.material.color.copy(this.color)
            marker.visible = ring.requiresRoll !== 0
            marker.position.x = 1.9 * (ring.requiresRoll || 1)
            marker.rotation.z = ring.requiresRoll > 0 ? - Math.PI * 0.5 : Math.PI * 0.5
            marker.material.opacity = opacity * (ring.requiresRoll ? 0.9 : 0)
            marker.material.color.copy(this.color)
            hint.visible = ring.hintRoll !== 0
            hint.position.x = 0.9 * (ring.hintRoll || 1)
            hint.position.y = 2.25 + Math.sin(this.time.elapsed * 3) * 0.15
            hint.rotation.z = ring.hintRoll > 0 ? - Math.PI * 0.5 : Math.PI * 0.5
            hint.material.opacity = opacity * (ring.hintRoll ? 0.95 : 0)
            hint.material.color.copy(this.rollColor)
        }

        for(let i = course.rings.length; i < this.rings.length; i++)
            this.rings[i].group.visible = false
    }
}
