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
        this.color = new THREE.Color()
        this.nextColor = new THREE.Color('#fff0a6')
        this.idleColor = new THREE.Color('#73d9ff')
        this.rollColor = new THREE.Color('#ff9bbd')
        this.diveColor = new THREE.Color('#6fe3a5')
        this.glideColor = new THREE.Color('#cfe9ff')
        this.dashColor = new THREE.Color('#ffb066')
        this.goldenColor = new THREE.Color('#ffd166')
        this.finishColor = new THREE.Color('#b6ff7a')
        this.missedColor = new THREE.Color('#8aa8bb')

        this.geometry = new THREE.TorusGeometry(1.45, 0.075, 4, 14).toNonIndexed()
        this.geometry.computeVertexNormals()
        this.markerGeometry = new THREE.ConeGeometry(0.22, 0.68, 3, 1).toNonIndexed()
        this.markerGeometry.rotateZ(- Math.PI * 0.5)
        this.postGeometry = new THREE.CylinderGeometry(0.09, 0.09, 4.4, 6, 1).toNonIndexed()
        this.postGeometry.computeVertexNormals()
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

        // Dash gates swap the torus for a pair of flanking posts
        const postMaterial = new THREE.MeshBasicMaterial({
            color: this.dashColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        const postLeft = new THREE.Mesh(this.postGeometry, postMaterial)
        postLeft.position.x = - 2.2
        group.add(postLeft)
        const postRight = new THREE.Mesh(this.postGeometry, postMaterial)
        postRight.position.x = 2.2
        group.add(postRight)

        const item = { group, mesh, marker, hint, postLeft, postRight }
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
            const postLeft = item.postLeft
            const postRight = item.postRight
            const isGate = ring.type === 'dashGate'
            const isNext = ring === nextRing
            const isFinal = ring.index === course.rings.length - 1
            const revealed = ring.index <= revealLimit
            let pulse = isNext ? 1 + Math.sin(this.time.elapsed * 5.2) * 0.08 : 1
            if(isFinal)
                pulse += 0.16 + Math.sin(this.time.elapsed * 3.4) * 0.06
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

            if(ring.missed)
                this.color.copy(this.missedColor)
            else if(isFinal)
                this.color.copy(this.finishColor)
            else if(ring.type === 'roll')
                this.color.copy(this.rollColor)
            else if(ring.type === 'dive')
                this.color.copy(this.diveColor)
            else if(ring.type === 'glide')
                this.color.copy(this.glideColor)
            else if(isGate)
                this.color.copy(this.dashColor)
            else
                this.color.copy(this.idleColor)

            // Streak courses drift toward gold
            if(!ring.missed)
                this.color.lerp(this.goldenColor, Math.min(course.streakLevel, 5) / 5 * 0.35)

            if(isNext)
                this.color.lerp(this.nextColor, 0.72)

            const y = THREE.MathUtils.lerp(ring.groundY + 0.8, ring.position[1], fadeIn)

            group.visible = opacity > 0.01
            group.position.set(ring.position[0], y, ring.position[2])
            group.quaternion.setFromUnitVectors(this.forward, this.direction)
            group.scale.setScalar(pulse)
            mesh.visible = !isGate
            mesh.material.opacity = opacity
            mesh.material.color.copy(this.color)
            postLeft.visible = isGate
            postRight.visible = isGate
            postLeft.material.opacity = opacity
            postLeft.material.color.copy(this.color)

            if(ring.type === 'roll')
            {
                marker.visible = true
                marker.position.set(1.9 * ring.rollDirection, 0, 0)
                marker.rotation.z = ring.rollDirection > 0 ? - Math.PI * 0.5 : Math.PI * 0.5
            }
            else if(ring.type === 'dive')
            {
                // Cone above pointing down: plunge through from the sky
                marker.visible = true
                marker.position.set(0, 2, 0)
                marker.rotation.z = - Math.PI * 0.5
            }
            else if(ring.type === 'glide')
            {
                // Cone below pointing up: float in gently from above
                marker.visible = true
                marker.position.set(0, - 2, 0)
                marker.rotation.z = Math.PI * 0.5
            }
            else
            {
                marker.visible = false
            }

            marker.material.opacity = opacity * (marker.visible ? 0.9 : 0)
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
