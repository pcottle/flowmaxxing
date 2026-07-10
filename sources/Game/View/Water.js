import * as THREE from 'three'

import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import WaterMaterial from './Materials/WaterMaterial.js'

export default class Water
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene

        // Ocean is on the +X side: bias the plane so open water fills the right horizon
        this.oceanOffset = 400
        this.shoreSamplesCount = 256
        this.shoreWindow = 2048

        this.wakeStrength = 0
        this.wakeHeading = new THREE.Vector2(0, - 1)
        this.wakeDropTimer = 0
        this.wakeTrailIndex = 0
        this.wakeDropInterval = 0.15
        this.wakeMinSpeed = 1.2
        this.wakeFullSpeed = 3.5

        this.setShoreTexture()
        this.setMaterial()
        this.setDebug()

        this.mesh = new THREE.Mesh(
            this.buildOceanGeometry(),
            this.material
        )
        this.mesh.frustumCulled = false // follows the player and is vertex-displaced
        this.scene.add(this.mesh)
    }

    // Graded irregular grid: 4m columns across the shore band (plane-local
    // x ∈ [-600,-200], where breaking waves live), 20m elsewhere, with a
    // deterministic jitter on interior vertices so triangles read as an
    // irregular low-poly mesh instead of a regular grid.
    buildOceanGeometry()
    {
        const columns = []

        for(let x = - 1000; x < - 600; x += 20)
            columns.push(x)

        for(let x = - 600; x < - 200; x += 4)
            columns.push(x)

        for(let x = - 200; x <= 1000; x += 20)
            columns.push(x)

        const rows = []

        for(let z = - 1000; z <= 1000; z += 14)
            rows.push(z)

        const columnsCount = columns.length
        const rowsCount = rows.length

        const hash = (iX, iZ, salt) =>
        {
            const value = Math.sin(iX * 127.1 + iZ * 311.7 + salt * 74.7) * 43758.5453
            return value - Math.floor(value)
        }

        const positions = new Float32Array(columnsCount * rowsCount * 3)

        for(let iZ = 0; iZ < rowsCount; iZ++)
        {
            for(let iX = 0; iX < columnsCount; iX++)
            {
                let x = columns[iX]
                let z = rows[iZ]

                // Jitter interior vertices by up to ±35% of the local spacing
                if(iX > 0 && iX < columnsCount - 1 && iZ > 0 && iZ < rowsCount - 1)
                {
                    const spacingX = Math.min(columns[iX + 1] - columns[iX], columns[iX] - columns[iX - 1])
                    x += (hash(iX, iZ, 1) - 0.5) * 0.7 * spacingX
                    z += (hash(iX, iZ, 2) - 0.5) * 0.7 * 14
                }

                const iStride = (iZ * columnsCount + iX) * 3
                positions[iStride] = x
                positions[iStride + 1] = 0
                positions[iStride + 2] = z
            }
        }

        const indices = new Uint32Array((columnsCount - 1) * (rowsCount - 1) * 6)
        let iIndex = 0

        for(let iZ = 0; iZ < rowsCount - 1; iZ++)
        {
            for(let iX = 0; iX < columnsCount - 1; iX++)
            {
                const a = iZ * columnsCount + iX
                const b = a + 1
                const c = a + columnsCount
                const d = c + 1

                indices[iIndex++] = a
                indices[iIndex++] = d
                indices[iIndex++] = b
                indices[iIndex++] = a
                indices[iIndex++] = c
                indices[iIndex++] = d
            }
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geometry.setIndex(new THREE.BufferAttribute(indices, 1))

        return geometry
    }

    setShoreTexture()
    {
        // Shared 1D corridor texture, also bound by the terrain and grass materials:
        // R = shoreX, G = volcanic biome weight, B = savanna weight, A = headland
        this.shoreData = new Float32Array(this.shoreSamplesCount * 4)
        this.shoreTexture = new THREE.DataTexture(this.shoreData, this.shoreSamplesCount, 1, THREE.RGBAFormat, THREE.FloatType)
        this.shoreTexture.magFilter = THREE.LinearFilter
        this.shoreTexture.minFilter = THREE.LinearFilter

        // Wave data texture: R = front jitter set 0, G = front jitter set 1
        this.waveData = new Float32Array(this.shoreSamplesCount * 4)
        this.waveTexture = new THREE.DataTexture(this.waveData, this.shoreSamplesCount, 1, THREE.RGBAFormat, THREE.FloatType)
        this.waveTexture.magFilter = THREE.LinearFilter
        this.waveTexture.minFilter = THREE.LinearFilter

        this.shoreZMin = 0

        this.updateShoreTexture()
    }

    // Sampled from the same seeded noise as the terrain worker / WaveSets, so
    // waves, foam and biome palettes track the exact simulation values. Cheap
    // enough (256 samples) to refresh every frame, which also picks up live
    // corridor tweaks from the debug UI.
    updateShoreTexture()
    {
        const terrains = this.state.terrains
        const waveSets = this.state.waveSets
        const playerZ = this.state.player.position.current[2]

        this.shoreZMin = playerZ - this.shoreWindow * 0.5

        for(let i = 0; i < this.shoreSamplesCount; i++)
        {
            const z = this.shoreZMin + (i / (this.shoreSamplesCount - 1)) * this.shoreWindow
            const sample = terrains.getCorridorSample(z)

            const iStride = i * 4
            this.shoreData[iStride] = sample.shoreX
            this.shoreData[iStride + 1] = sample.wVolcanic
            this.shoreData[iStride + 2] = sample.wSavanna
            this.shoreData[iStride + 3] = sample.headland

            this.waveData[iStride] = waveSets.getFrontJitter(z, 0)
            this.waveData[iStride + 1] = waveSets.getFrontJitter(z, 1)
            this.waveData[iStride + 2] = 0
            this.waveData[iStride + 3] = 0
        }

        this.shoreTexture.needsUpdate = true
        this.waveTexture.needsUpdate = true
    }

    setMaterial()
    {
        this.material = new WaterMaterial()
        this.material.uniforms.uShoreTexture.value = this.shoreTexture
        this.material.uniforms.uWaveTexture.value = this.waveTexture
        this.material.uniforms.uFogTexture.value = this.view.sky.customRender.texture
    }

    setDebug()
    {
        const debug = Debug.getInstance()

        if(!debug.active)
            return

        const folder = debug.ui.getFolder('view/water')
        const uniforms = this.material.uniforms

        folder.add(uniforms.uFoamEdgeWidth, 'value').min(0).max(10).step(0.1).name('uFoamEdgeWidth')
        folder.add(uniforms.uFoamLineWidth, 'value').min(0.1).max(3).step(0.05).name('uFoamLineWidth')
        folder.add(uniforms.uFoamGap, 'value').min(0).max(6).step(0.1).name('uFoamGap')
        folder.add(uniforms.uRingPeriod, 'value').min(2).max(20).step(0.5).name('uRingPeriod')
        folder.add(uniforms.uRingMaxD, 'value').min(5).max(80).step(1).name('uRingMaxD')
        folder.add(uniforms.uDashLength, 'value').min(1).max(20).step(0.5).name('uDashLength')
        folder.add(uniforms.uRippleRadius, 'value').min(1).max(8).step(0.1).name('uRippleRadius')
        folder.add(uniforms.uWakeSpread, 'value').min(0.1).max(1).step(0.02).name('uWakeSpread')
        folder.add(uniforms.uWakeLength, 'value').min(2).max(20).step(0.5).name('uWakeLength')
        folder.add(uniforms.uWakeLineWidth, 'value').min(0.05).max(1).step(0.01).name('uWakeLineWidth')
        folder.add(uniforms.uWakeTrailRadius, 'value').min(0.2).max(2).step(0.05).name('uWakeTrailRadius')
        folder.add(uniforms.uWakeTrailLife, 'value').min(0.4).max(4).step(0.1).name('uWakeTrailLife')
        folder.add(this, 'wakeDropInterval').min(0.05).max(0.5).step(0.01)
        folder.add(this, 'wakeMinSpeed').min(0).max(5).step(0.1)
        folder.add(this, 'wakeFullSpeed').min(1).max(10).step(0.1)
        folder.addColor(uniforms.uFoamColor, 'value').name('uFoamColor')
        folder.addColor(uniforms.uDeepColor, 'value').name('uDeepColor')
        folder.addColor(uniforms.uShallowColor, 'value').name('uShallowColor')
    }

    update()
    {
        const playerState = this.state.player
        const sunState = this.state.sun
        const waveSets = this.state.waveSets

        this.updateShoreTexture()

        const uniforms = this.material.uniforms
        uniforms.uTime.value = this.state.time.elapsed
        uniforms.uShoreZMin.value = this.shoreZMin
        uniforms.uShoreZRange.value = this.shoreWindow
        uniforms.uOceanRampWidth.value = this.state.terrains.corridor.oceanRampWidth
        uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
        uniforms.uRainIntensity.value = this.state.weather.rainIntensity

        // Player ripple rings ramp in with wading depth (full strength by
        // ankle-to-knee deep, matching the swimming float draft) and dissolve on exit
        this.playerRipple = this.playerRipple ?? 0
        const wadeDepth = - playerState.position.current[1]
        const rippleTarget = playerState.swimming ? 1 : Math.min(1, Math.max(0, wadeDepth / 0.5))
        const rippleRate = rippleTarget > this.playerRipple ? 5 : 2.5
        this.playerRipple += (rippleTarget - this.playerRipple) * Math.min(1, rippleRate * this.state.time.delta)
        uniforms.uPlayerRipple.value = this.playerRipple
        uniforms.uPlayerRipplePosition.value.set(playerState.position.current[0], playerState.position.current[2])

        // Directional wake: smoothed heading, speed-gated strength, trail
        // ring buffer of dropped churn points aged out in-shader
        const vx = playerState.velocity[0]
        const vz = playerState.velocity[2]
        const planarSpeed = Math.hypot(vx, vz)

        if(planarSpeed > 0.5)
        {
            const headingRatio = 1 - Math.exp(- 8 * this.state.time.delta)
            this.wakeHeading.x += (vx / planarSpeed - this.wakeHeading.x) * headingRatio
            this.wakeHeading.y += (vz / planarSpeed - this.wakeHeading.y) * headingRatio

            if(this.wakeHeading.lengthSq() > 0.0001)
                this.wakeHeading.normalize()
        }

        const wakeTarget = playerState.swimming
            ? Math.min(1, Math.max(0, (planarSpeed - this.wakeMinSpeed) / (this.wakeFullSpeed - this.wakeMinSpeed)))
            : 0
        const wakeRate = wakeTarget > this.wakeStrength ? 6 : 3
        this.wakeStrength += (wakeTarget - this.wakeStrength) * Math.min(1, wakeRate * this.state.time.delta)
        uniforms.uWakeStrength.value = this.wakeStrength
        uniforms.uWakeHeading.value.copy(this.wakeHeading)

        if(playerState.swimming && planarSpeed > this.wakeMinSpeed)
        {
            this.wakeDropTimer += this.state.time.delta

            if(this.wakeDropTimer >= this.wakeDropInterval)
            {
                this.wakeDropTimer -= this.wakeDropInterval

                // Drop slightly behind the wisp so churn rings don't overlap
                // the hugging contact ring
                uniforms.uWakeTrail.value[this.wakeTrailIndex].set(
                    playerState.position.current[0] - this.wakeHeading.x * 0.5,
                    playerState.position.current[2] - this.wakeHeading.y * 0.5,
                    this.state.time.elapsed,
                    this.wakeStrength
                )
                this.wakeTrailIndex = (this.wakeTrailIndex + 1) % 12
            }
        }
        else
        {
            this.wakeDropTimer = 0
        }

        uniforms.uWaveD0.value = waveSets.D0
        uniforms.uWaveWidth.value = waveSets.width
        uniforms.uWaveFront0.value = waveSets.sets[0].frontD
        uniforms.uWaveFront1.value = waveSets.sets[1].frontD
        uniforms.uWaveAmp0.value = waveSets.sets[0].amplitude
        uniforms.uWaveAmp1.value = waveSets.sets[1].amplitude
        uniforms.uWaveFoamWidth0.value = waveSets.sets[0].foamWidth
        uniforms.uWaveFoamWidth1.value = waveSets.sets[1].foamWidth
        uniforms.uWaveFoamIntensity0.value = waveSets.sets[0].foamIntensity
        uniforms.uWaveFoamIntensity1.value = waveSets.sets[1].foamIntensity

        // Track the shoreline (not the player) in x so the dense mesh band and
        // the breaking waves stay aligned even when the player wanders inland
        const playerZ = playerState.position.current[2]
        this.mesh.position.set(
            this.state.terrains.getShoreX(playerZ) + this.oceanOffset,
            0,
            playerZ
        )
    }
}
