import * as THREE from 'three'

import State from '@/State/State.js'
import View from '@/View/View.js'

export default class BouncePads
{
    constructor()
    {
        this.state = State.getInstance()
        this.view = View.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene

        this.color = new THREE.Color()
        this.idleColor = new THREE.Color('#7af0c8')
        this.flashColor = new THREE.Color('#fff0a6')
        this.perfectColor = new THREE.Color('#ffd166')
        this.prizeColor = new THREE.Color('#ffd166')
        this.collectedColor = new THREE.Color('#8aa8bb')

        this.fadeNear = 200
        this.fadeFar = 260
        this.squashDuration = 0.35

        this.padGeometry = new THREE.CylinderGeometry(1, 1, 0.16, 24, 1).toNonIndexed()
        this.padGeometry.computeVertexNormals()
        this.prizeGeometry = new THREE.IcosahedronGeometry(0.9, 1).toNonIndexed()
        this.prizeGeometry.computeVertexNormals()

        this.pads = []
        this.prizes = []

        // Aim shadow: no lights in this renderer, so a blob shadow on the pad
        // surface shows where the player will land while falling toward it.
        // A squat cylinder, not a flat disc — the orbit camera sits barely
        // above horizontal, and mid-jump a disc foreshortens to an invisible
        // sliver; the puck's side band stays readable edge-on
        this.shadowGeometry = new THREE.CylinderGeometry(1, 1, 0.22, 20, 1)
        this.shadowMaterial = new THREE.MeshBasicMaterial({
            color: '#10222b',
            transparent: true,
            opacity: 0,
            depthWrite: false
        })
        this.shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial)
        this.shadow.visible = false
        this.shadow.frustumCulled = false
        // Draw after the pad glow: both are transparent with depthWrite off,
        // so without this the distance sort lets a close pad wash the shadow out
        this.shadow.renderOrder = 2
        this.scene.add(this.shadow)

        this.setCelebration()

        this.state.bouncePads.events.on('prizeCollect', ({ position }) =>
        {
            this.startCelebration(position)
        })
    }

    setCelebration()
    {
        // Prize celebration: instanced confetti in the game palette plus an
        // expanding shockwave ring — the particle shader is single-color, so
        // multi-color confetti lives here instead
        this.confettiCount = 90
        this.confettiDuration = 2.4
        this.confettiStartTime = - 999
        this.confettiPalette = [
            new THREE.Color('#ffd166'),
            new THREE.Color('#ff9bbd'),
            new THREE.Color('#73d9ff'),
            new THREE.Color('#b6ff7a'),
            new THREE.Color('#fff0a6')
        ]
        this.confettiItems = []
        this.confettiDummy = new THREE.Object3D()

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

        this.shockwaveDuration = 0.65
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
            const radial = 1.5 + Math.random() * 4.5
            // A handful are tiny bright sparkles that flicker instead of tumbling
            const sparkle = i % 5 === 0

            this.confettiItems.push({
                x: position[0],
                y: position[1] + Math.random() * 0.4,
                z: position[2],
                vx: Math.sin(angle) * radial,
                vy: 5.5 + Math.random() * 5.5,
                vz: Math.cos(angle) * radial,
                spinX: (Math.random() - 0.5) * 12,
                spinY: (Math.random() - 0.5) * 12,
                spinZ: (Math.random() - 0.5) * 12,
                scale: sparkle ? 0.5 + Math.random() * 0.3 : 0.8 + Math.random() * 0.7,
                sparkle,
                phase: Math.random() * Math.PI * 2
            })

            const color = sparkle
                ? this.confettiPalette[4]
                : this.confettiPalette[i % this.confettiPalette.length]
            this.confetti.setColorAt(i, color)
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

        const delta = this.time.delta
        const dummy = this.confettiDummy

        for(let i = 0; i < this.confettiItems.length; i++)
        {
            const item = this.confettiItems[i]

            // Floaty confetti physics: light gravity plus drag so it flutters
            item.vy -= 7 * delta
            item.vx *= 1 - 0.9 * delta
            item.vz *= 1 - 0.9 * delta
            item.x += item.vx * delta
            item.y += item.vy * delta
            item.z += item.vz * delta

            dummy.position.set(
                item.x + Math.sin(this.time.elapsed * 6 + item.phase) * 0.12,
                item.y,
                item.z
            )
            dummy.rotation.set(item.spinX * age, item.spinY * age + item.phase, item.spinZ * age)

            const flicker = item.sparkle ? 0.55 + 0.45 * Math.sin(this.time.elapsed * 22 + item.phase) : 1
            dummy.scale.setScalar(item.scale * flicker)
            dummy.updateMatrix()
            this.confetti.setMatrixAt(i, dummy.matrix)
        }

        this.confetti.visible = true
        this.confetti.instanceMatrix.needsUpdate = true
        this.confettiMaterial.opacity = 1 - THREE.MathUtils.smoothstep(age, this.confettiDuration * 0.65, this.confettiDuration)

        // Golden ring racing outward from the prize
        if(age < this.shockwaveDuration)
        {
            const ripple = age / this.shockwaveDuration
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
        const material = new THREE.MeshBasicMaterial({
            color: this.idleColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        const mesh = new THREE.Mesh(this.padGeometry, material)
        mesh.visible = false
        mesh.frustumCulled = false
        this.scene.add(mesh)

        const item = { mesh, lastBounceSeen: - 999 }
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

        const item = { mesh }
        this.prizes.push(item)

        return item
    }

    getPadMesh(index)
    {
        while(this.pads.length <= index)
            this.createPadMesh()

        return this.pads[index]
    }

    getPrizeMesh(index)
    {
        while(this.prizes.length <= index)
            this.createPrizeMesh()

        return this.prizes[index]
    }

    updatePad(item, pad, fade)
    {
        const mesh = item.mesh
        const squashAge = this.time.elapsed - pad.lastBounceTime
        const squash = squashAge < this.squashDuration ? squashAge / this.squashDuration : 1

        mesh.visible = fade > 0.01
        mesh.position.set(pad.position[0], pad.position[1], pad.position[2])
        mesh.scale.set(
            pad.radius * (1 + 0.35 * (1 - squash)),
            0.4 + 0.6 * squash,
            pad.radius * (1 + 0.35 * (1 - squash))
        )

        const pulse = 1 + Math.sin(this.time.elapsed * 2 + pad.index * 0.7) * 0.05
        mesh.scale.x *= pulse
        mesh.scale.z *= pulse

        this.color.copy(this.idleColor)

        if(squash < 1)
            this.color.lerp(this.flashColor, 1 - squash)

        mesh.material.color.copy(this.color)
        mesh.material.opacity = fade * (0.55 + 0.25 * Math.sin(this.time.elapsed * 2 + pad.index * 0.7))
    }

    updatePrize(item, prize, fade)
    {
        const mesh = item.mesh
        let opacity = fade * 0.85

        if(prize.collected)
            opacity = prize.collectTime > 0
                ? fade * 0.85 * Math.max(0, 1 - (this.time.elapsed - prize.collectTime) / 0.45)
                : 0

        mesh.visible = opacity > 0.01
        mesh.position.set(
            prize.position[0],
            prize.position[1] + Math.sin(this.time.elapsed * 2.4) * 0.25,
            prize.position[2]
        )
        mesh.rotation.y = this.time.elapsed * 1.4
        mesh.rotation.x = Math.sin(this.time.elapsed * 0.9) * 0.3
        mesh.scale.setScalar(1 + Math.sin(this.time.elapsed * 5.2) * 0.08)
        mesh.material.color.copy(prize.collected ? this.collectedColor : this.prizeColor)
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
        const padY = shadowPad.position[1]
        const height = playerY - padY
        const rimDistance = Math.hypot(playerX - shadowPad.position[0], playerZ - shadowPad.position[2])

        // Size tells altitude (shrinks as the player rises), opacity stays
        // strong at any height and only fades toward the pad rim so the
        // shadow reads as how centered the landing is
        const heightRatio = 1 - Math.min(height / 28, 1)
        const rimFade = Math.min(Math.max((shadowPad.radius - rimDistance) / 0.6, 0), 1)
        const radius = 0.55 + 0.45 * heightRatio

        this.shadow.visible = true
        this.shadow.position.set(playerX, padY + 0.23, playerZ)
        this.shadow.scale.set(radius, 1, radius)
        this.shadow.material.opacity = rimFade * 0.55
    }

    update()
    {
        const bouncePads = this.state.bouncePads
        const player = this.state.player
        let padIndex = 0
        let prizeIndex = 0
        let shadowPad = null

        for(const tower of bouncePads.towers.values())
        {
            if(!tower.built)
                continue

            const distance = Math.hypot(
                player.position.current[0] - tower.pads[0].position[0],
                player.position.current[2] - tower.z
            )
            const fade = 1 - THREE.MathUtils.smoothstep(distance, this.fadeNear, this.fadeFar)

            for(const pad of tower.pads)
            {
                this.updatePad(this.getPadMesh(padIndex++), pad, fade)

                // Highest pad below the player that the player is currently over
                const overlap = Math.hypot(
                    player.position.current[0] - pad.position[0],
                    player.position.current[2] - pad.position[2]
                )

                if(
                    overlap < pad.radius
                    && player.position.current[1] > pad.position[1]
                    && (!shadowPad || pad.position[1] > shadowPad.position[1])
                )
                    shadowPad = pad
            }

            this.updatePrize(this.getPrizeMesh(prizeIndex++), tower.prize, fade)
        }

        this.updateShadow(shadowPad)
        this.updateCelebration()

        for(let i = padIndex; i < this.pads.length; i++)
            this.pads[i].mesh.visible = false

        for(let i = prizeIndex; i < this.prizes.length; i++)
            this.prizes[i].mesh.visible = false
    }
}
