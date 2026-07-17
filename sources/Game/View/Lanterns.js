import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import LanternsMaterial from './Materials/LanternsMaterial.js'

export default class Lanterns
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene
        this.viewport = this.state.viewport

        this.count = 20
        this.maxPerFire = 3
        this.spawnIntervalMin = 2.5
        this.spawnIntervalMax = 7
        this.fireRange = 250 // only fires within this corridor window release lanterns
        this.lifetimeMin = 40
        this.lifetimeMax = 65
        this.fadeInDuration = 3
        this.fadeOutDuration = 8
        this.nightOverride = - 1

        this.spawnTimer = 4 // first release a few seconds into the first night

        this.setPool()
        this.setGeometry()
        this.setMaterial()
        this.setPoints()
        this.setDebug()
    }

    setPool()
    {
        this.pool = []

        for(let i = 0; i < this.count; i++)
        {
            this.pool.push({
                active: false,
                x: 0,
                y: - 1000,
                z: 0,
                age: 0,
                lifetime: 1,
                riseSpeed: 0.55,
                driftX: 0,
                driftZ: - 0.5,
                wp1: Math.random() * Math.PI * 2,
                wp2: Math.random() * Math.PI * 2
            })
        }
    }

    setGeometry()
    {
        const positions = new Float32Array(this.count * 3)
        const phases = new Float32Array(this.count)
        const flickerSpeeds = new Float32Array(this.count)
        const sizes = new Float32Array(this.count)
        const alphas = new Float32Array(this.count)

        for(let i = 0; i < this.count; i++)
        {
            positions[i * 3 + 1] = - 1000
            phases[i] = Math.random() * Math.PI * 2
            flickerSpeeds[i] = 1.2 + Math.random() * 1.6
            sizes[i] = 1.1 + Math.random() * 0.6
        }

        this.geometry = new THREE.BufferGeometry()
        this.positionAttribute = new THREE.Float32BufferAttribute(positions, 3)
        this.positionAttribute.setUsage(THREE.DynamicDrawUsage)
        this.alphaAttribute = new THREE.Float32BufferAttribute(alphas, 1)
        this.alphaAttribute.setUsage(THREE.DynamicDrawUsage)
        this.geometry.setAttribute('position', this.positionAttribute)
        this.geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))
        this.geometry.setAttribute('aFlickerSpeed', new THREE.Float32BufferAttribute(flickerSpeeds, 1))
        this.geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
        this.geometry.setAttribute('aAlpha', this.alphaAttribute)
    }

    setMaterial()
    {
        this.material = new LanternsMaterial()
        this.material.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio
    }

    setPoints()
    {
        this.points = new THREE.Points(this.geometry, this.material)
        this.points.frustumCulled = false
        this.points.visible = false
        this.scene.add(this.points)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/lanterns')

        folder.add(this.material.uniforms.uSize, 'value').min(0.1).max(2).step(0.05).name('uSize')
        folder.add(this.material.uniforms.uOpacity, 'value').min(0).max(1).step(0.05).name('uOpacity')
        folder.addColor(this.material.uniforms.uColor, 'value').name('uColor')
        folder.addColor(this.material.uniforms.uCoreColor, 'value').name('uCoreColor')
        folder.add(this, 'maxPerFire').min(1).max(10).step(1)
        folder.add(this, 'nightOverride').min(- 1).max(1).step(0.05)
    }

    release(fire)
    {
        const lantern = this.pool.find((entry) => !entry.active)

        if(!lantern)
            return

        lantern.active = true
        lantern.x = fire.x + (Math.random() - 0.5) * 1.5
        lantern.y = fire.y + 0.8
        lantern.z = fire.z + (Math.random() - 0.5) * 1.5
        lantern.age = 0
        lantern.lifetime = this.lifetimeMin + Math.random() * (this.lifetimeMax - this.lifetimeMin)
        lantern.riseSpeed = 0.45 + Math.random() * 0.3
        lantern.driftX = (Math.random() - 0.5) * 0.4
        lantern.driftZ = - 0.3 - Math.random() * 0.5 // loose down-beach drift
    }

    clear()
    {
        for(let i = 0; i < this.count; i++)
        {
            const lantern = this.pool[i]

            if(!lantern.active)
                continue

            lantern.active = false
            lantern.y = - 1000
            this.positionAttribute.setXYZ(i, lantern.x, lantern.y, lantern.z)
            this.alphaAttribute.setX(i, 0)
        }

        this.positionAttribute.needsUpdate = true
        this.alphaAttribute.needsUpdate = true
    }

    update()
    {
        const delta = this.time.delta
        const elapsed = this.time.elapsed
        const playerState = this.state.player
        const playerZ = playerState.position.current[2]

        // Lanterns are a dusk-and-night ritual; rain keeps them grounded
        const sunY = this.state.sun.position.y
        const nightFactor = this.nightOverride >= 0
            ? this.nightOverride
            : 1 - THREE.MathUtils.smoothstep(sunY, - 0.02, 0.12)
        const presence = nightFactor * (1 - this.state.weather.rainIntensity)

        this.points.visible = presence > 0.01

        // Come daylight (or rain) the ritual is over: retire any lanterns still
        // aloft so nothing lingers frozen through the day and pops back at dusk
        if(!this.points.visible)
        {
            this.clear()
            return
        }

        this.material.uniforms.uTime.value = elapsed
        this.material.uniforms.uNight.value = presence

        // Release from a nearby campfire every few seconds
        this.spawnTimer -= delta

        if(this.spawnTimer <= 0)
        {
            this.spawnTimer = this.spawnIntervalMin + Math.random() * (this.spawnIntervalMax - this.spawnIntervalMin)

            if(presence > 0.5)
            {
                const campfires = this.view.campfires
                const candidates = []

                for(const fire of campfires.fires.values())
                {
                    if(fire.skip || fire.y === null || !fire.group.visible)
                        continue

                    if(Math.abs(fire.z - playerZ) > this.fireRange)
                        continue

                    candidates.push(fire)
                }

                if(candidates.length > 0)
                {
                    const fire = candidates[Math.floor(Math.random() * candidates.length)]
                    const airborne = this.pool.filter((entry) => entry.active
                        && Math.hypot(entry.x - fire.x, entry.z - fire.z) < 30).length

                    if(airborne < this.maxPerFire)
                        this.release(fire)
                }
            }
        }

        for(let i = 0; i < this.count; i++)
        {
            const lantern = this.pool[i]

            if(!lantern.active)
                continue

            lantern.age += delta

            if(lantern.age >= lantern.lifetime)
            {
                lantern.active = false
                lantern.y = - 1000
                this.positionAttribute.setXYZ(i, lantern.x, lantern.y, lantern.z)
                this.alphaAttribute.setX(i, 0)
                continue
            }

            // Slow climb with a pendulum sway, let go of the shoreline breeze
            lantern.y += lantern.riseSpeed * delta
            lantern.x += (Math.sin(elapsed * 0.4 + lantern.wp1) * 0.35 + lantern.driftX) * delta
            lantern.z += (Math.cos(elapsed * 0.33 + lantern.wp2) * 0.25 + lantern.driftZ) * delta

            const fadeIn = Math.min(lantern.age / this.fadeInDuration, 1)
            const fadeOut = Math.min((lantern.lifetime - lantern.age) / this.fadeOutDuration, 1)

            this.positionAttribute.setXYZ(i, lantern.x, lantern.y, lantern.z)
            this.alphaAttribute.setX(i, Math.min(fadeIn, fadeOut))
        }

        this.positionAttribute.needsUpdate = true
        this.alphaAttribute.needsUpdate = true
    }

    resize()
    {
        this.material.uniforms.uSizeScale.value = this.viewport.height * this.viewport.clampedPixelRatio
    }
}
