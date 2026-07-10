import * as THREE from 'three'

import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'

export default class PlayerShadow
{
    constructor()
    {
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.scene = this.view.scene

        this.radius = 0.55
        this.opacity = 0.3
        this.heightFade = 20
        this.minScale = 0.55
        this.minOpacityRatio = 0.5
        this.lift = 0.06

        this.up = new THREE.Vector3(0, 1, 0)
        this.normal = new THREE.Vector3()

        this.setMesh()
        this.setDebug()
    }

    setMesh()
    {
        // Crisp WW disc: solid ink circle, subtly polygonal edge like the
        // footprints. Flat circle + polygonOffset instead of the pads'
        // shallow cylinder — on terrain that recipe is already proven
        this.geometry = new THREE.CircleGeometry(1, 16)
        this.geometry.rotateX(- Math.PI * 0.5)

        this.material = new THREE.MeshBasicMaterial({
            color: '#10222b',
            transparent: true,
            opacity: this.opacity,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: - 1,
            polygonOffsetUnits: - 1
        })

        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.visible = false
        this.mesh.frustumCulled = false
        this.mesh.renderOrder = 2
        this.scene.add(this.mesh)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/playerShadow')

        folder.add(this, 'radius').min(0.2).max(1.5).step(0.05)
        folder.add(this, 'opacity').min(0).max(1).step(0.05)
        folder.add(this, 'heightFade').min(5).max(50).step(1)
        folder.add(this, 'minScale').min(0).max(1).step(0.05)
        folder.add(this, 'minOpacityRatio').min(0).max(1).step(0.05)
        folder.add(this, 'lift').min(0).max(0.2).step(0.01)
    }

    update()
    {
        const playerState = this.state.player
        const px = playerState.position.current[0]
        const py = playerState.position.current[1]
        const pz = playerState.position.current[2]

        // Swimming: the ripple/wake own the water contact
        if(playerState.swimming)
        {
            this.mesh.visible = false
            return
        }

        // Pad aim shadow wins while active — avoid doubled marks
        if(this.view.bouncePads.shadow.visible)
        {
            this.mesh.visible = false
            return
        }

        const sample = this.state.chunks.getSampleForPosition(px, pz)

        if(sample === false || !Number.isFinite(sample.elevation))
        {
            this.mesh.visible = false
            return
        }

        // WW draws shadows on the sea too — snap to the y=0 surface
        let groundY = sample.elevation
        const onWater = groundY < 0

        if(onWater)
            groundY = 0

        const heightRatio = Math.min(Math.max(py - groundY, 0) / this.heightFade, 1)
        const scale = this.radius * (1 - heightRatio * (1 - this.minScale))

        this.mesh.visible = true
        this.mesh.position.set(px, groundY + this.lift, pz)
        this.mesh.scale.setScalar(scale)
        this.material.opacity = this.opacity * (1 - heightRatio * (1 - this.minOpacityRatio))

        // Tilt to the terrain facet so the disc doesn't clip into slopes
        if(!onWater && sample.normal)
        {
            this.normal.set(sample.normal[0], sample.normal[1], sample.normal[2]).normalize()
            this.mesh.quaternion.setFromUnitVectors(this.up, this.normal)
        }
        else
        {
            this.mesh.quaternion.identity()
        }
    }
}
