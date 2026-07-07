import Game from '@/Game.js'
import State from '@/State/State.js'
import View from '@/View/View.js'
import Debug from '@/Debug/Debug.js'
import PropsMaterial from './Materials/PropsMaterial.js'
import PropsOutlineMaterial from './Materials/PropsOutlineMaterial.js'
import PropsLayer from './PropsLayer.js'
import { buildPalm, buildConifer, buildBoulder } from './PropsGeometry.js'

export default class Props
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.material = new PropsMaterial()
        this.material.uniforms.uFogTexture.value = this.view.sky.customRender.texture
        this.material.uniforms.uNoiseTexture.value = this.view.noises.create(128, 128)

        // Per-family outline materials: palms collapse their frond strips
        // (inverted hulls artifact on open geometry), others hull fully
        this.outlineMaterials = {
            palm: new PropsOutlineMaterial({ thickness: 0.05, swayCollapse: 0.28 }),
            conifer: new PropsOutlineMaterial({ thickness: 0.05 }),
            boulder: new PropsOutlineMaterial({ thickness: 0.05 })
        }

        for(const outlineMaterial of Object.values(this.outlineMaterials))
        {
            outlineMaterial.uniforms.uFogTexture.value = this.view.sky.customRender.texture
            outlineMaterial.uniforms.uNoiseTexture.value = this.material.uniforms.uNoiseTexture.value
        }

        this.setLayers()
        this.setDebug()
    }

    setLayers()
    {
        // Palms lean seaward (+X is baked into the geometry) — yaw stays small
        this.palms = new PropsLayer({
            name: 'palm',
            geometry: buildPalm(),
            material: this.material,
            outlineMaterial: this.outlineMaterials.palm,
            capacity: 48,
            rowSize: 24,
            perRow: 1,
            probability: 0.7,
            inlandMin: 6,
            inlandMax: 18,
            minElevation: 0.8,
            maxElevation: 6,
            radius: 192,
            biomeDensity: (weights) => 1 - weights[1] * 0.95,
            composeTransform: (dummy, r, x, y, z) =>
            {
                dummy.position.set(x, y - 0.15, z)
                dummy.rotation.set(0, (r[4] - 0.5) * 0.8, - r[5] * 0.15)
                const scale = 0.75 + r[6] * 0.5
                dummy.scale.set(scale, scale, scale)
            },
            collision: (dummy) => ({ radius: 0.4 * dummy.scale.x, height: 6 * dummy.scale.y }),
            tint: (color, r) => color.setScalar(0.9 + r[7] * 0.2)
        })

        this.conifers = new PropsLayer({
            name: 'conifer',
            geometry: buildConifer(),
            material: this.material,
            outlineMaterial: this.outlineMaterials.conifer,
            capacity: 1024,
            rowSize: 8,
            perRow: 6,
            probability: 0.8,
            inlandMin: 30,
            inlandMax: 100,
            minElevation: 2.5,
            maxElevation: 30,
            slopeMax: 1.2,
            radius: 160,
            biomeDensity: (weights) => 1 - weights[1] * 0.5 - weights[2] * 0.65,
            composeTransform: (dummy, r, x, y, z) =>
            {
                dummy.position.set(x, y - 0.1, z)
                dummy.rotation.set(0, r[4] * Math.PI * 2, 0)
                const scale = 0.6 + r[5] * 0.8
                dummy.scale.set(scale, scale, scale)
            },
            // Collide with the inner foliage, not the full tier spread
            collision: (dummy) => ({ radius: 0.8 * dummy.scale.x, height: 4.5 * dummy.scale.y }),
            tint: (color, r) => color.setRGB(0.9 + r[6] * 0.2, 0.9 + r[7] * 0.2, 0.9 + r[6] * 0.15)
        })

        this.highlandConifers = new PropsLayer({
            name: 'highlandConifer',
            geometry: buildConifer({ snow: true }),
            material: this.material,
            outlineMaterial: this.outlineMaterials.conifer,
            capacity: 384,
            rowSize: 12,
            perRow: 3,
            probability: 0.45,
            inlandMin: 330,
            inlandMax: 560,
            minElevation: 24,
            maxElevation: 72,
            slopeMax: 0.9,
            radius: 192,
            biomeDensity: (weights) => 1 - weights[1] * 0.35 - weights[2] * 0.5,
            composeTransform: (dummy, r, x, y, z) =>
            {
                dummy.position.set(x, y - 0.08, z)
                dummy.rotation.set(0, r[4] * Math.PI * 2, 0)
                const scale = 0.35 + r[5] * 0.45
                dummy.scale.set(scale, scale * (0.75 + r[6] * 0.35), scale)
            },
            collision: (dummy) => ({ radius: 0.7 * dummy.scale.x, height: 4.2 * dummy.scale.y }),
            tint: (color, r) => color.setRGB(0.86 + r[6] * 0.1, 0.92 + r[7] * 0.07, 0.96 + r[6] * 0.04)
        })

        this.boulders = []

        for(let variant = 0; variant < 2; variant++)
        {
            this.boulders.push(new PropsLayer({
                name: 'boulder' + variant,
                geometry: buildBoulder(this.game.seed, variant),
                material: this.material,
                outlineMaterial: this.outlineMaterials.boulder,
                capacity: 64,
                rowSize: 16,
                perRow: 2,
                probability: 0.55,
                inlandMin: 80,
                inlandMax: 140,
                minElevation: 2,
                maxElevation: 60,
                radius: 128,
                composeTransform: (dummy, r, x, y, z) =>
                {
                    const base = 0.5 + r[4] * 1.5
                    const scaleX = base * (0.7 + r[5] * 0.6)
                    const scaleY = base * (0.7 + r[6] * 0.6)
                    const scaleZ = base * (0.7 + r[7] * 0.6)
                    dummy.position.set(x, y - 0.25 * scaleY, z)
                    dummy.rotation.set(0, r[4] * Math.PI * 2, 0)
                    dummy.scale.set(scaleX, scaleY, scaleZ)
                },
                collision: (dummy) => ({
                    radius: 0.85 * (dummy.scale.x + dummy.scale.z) * 0.5,
                    height: 1.1 * dummy.scale.y
                }),
                tint: (color, r) => color.setRGB(0.92 + r[5] * 0.16, 0.9 + r[6] * 0.16, 0.88 + r[7] * 0.16)
            }))
        }

        this.highlandBoulders = new PropsLayer({
            name: 'highlandBoulder',
            geometry: buildBoulder(this.game.seed, 2),
            material: this.material,
            outlineMaterial: this.outlineMaterials.boulder,
            capacity: 96,
            rowSize: 18,
            perRow: 2,
            probability: 0.45,
            inlandMin: 300,
            inlandMax: 620,
            minElevation: 24,
            maxElevation: 78,
            slopeMax: 1.1,
            radius: 192,
            composeTransform: (dummy, r, x, y, z) =>
            {
                const base = 0.45 + r[4] * 1.2
                const scaleX = base * (0.8 + r[5] * 0.7)
                const scaleY = base * (0.45 + r[6] * 0.45)
                const scaleZ = base * (0.8 + r[7] * 0.7)
                dummy.position.set(x, y - 0.2 * scaleY, z)
                dummy.rotation.set(0, r[4] * Math.PI * 2, 0)
                dummy.scale.set(scaleX, scaleY, scaleZ)
            },
            collision: (dummy) => ({
                radius: 0.8 * (dummy.scale.x + dummy.scale.z) * 0.5,
                height: 0.9 * dummy.scale.y
            }),
            tint: (color, r) => color.setRGB(0.82 + r[5] * 0.12, 0.86 + r[6] * 0.12, 0.9 + r[7] * 0.1)
        })

        this.layers = [this.palms, this.conifers, this.highlandConifers, ...this.boulders, this.highlandBoulders]
    }

    update()
    {
        const sunState = this.state.sun
        const windState = this.state.wind

        this.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
        this.material.uniforms.uWindTime.value = windState.windTime
        this.material.uniforms.uWindStrength.value = windState.strength

        for(const outlineMaterial of Object.values(this.outlineMaterials))
        {
            outlineMaterial.uniforms.uWindTime.value = windState.windTime
            outlineMaterial.uniforms.uWindStrength.value = windState.strength
        }

        for(const layer of this.layers)
            layer.update()
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/props')

        for(const layer of this.layers)
        {
            const layerFolder = this.debug.ui.getFolder('view/props/' + layer.options.name)
            layerFolder.add(layer.options, 'probability').min(0).max(1).step(0.01).onFinishChange(() => layer.rebuild())
            layerFolder.add(layer.options, 'perRow').min(1).max(12).step(1).onFinishChange(() => layer.rebuild())
            layerFolder.add(layer.options, 'radius').min(32).max(400).step(8).onFinishChange(() => layer.rebuild())
        }

        folder.add({ rebuild: () => this.layers.forEach(layer => layer.rebuild()) }, 'rebuild')

        const outlinesFolder = this.debug.ui.getFolder('view/outlines')
        const outlineProxy = {
            thickness: this.outlineMaterials.palm.uniforms.uThickness.value,
            visible: true
        }
        outlinesFolder.add(outlineProxy, 'thickness').min(0).max(0.2).step(0.005).onChange(() =>
        {
            for(const outlineMaterial of Object.values(this.outlineMaterials))
                outlineMaterial.uniforms.uThickness.value = outlineProxy.thickness
        })
        outlinesFolder.add(outlineProxy, 'visible').onChange(() =>
        {
            for(const layer of this.layers)
                if(layer.outlineMesh)
                    layer.outlineMesh.visible = outlineProxy.visible
        })
        outlinesFolder.addColor(this.outlineMaterials.palm.uniforms.uColor, 'value').name('color').onChange(() =>
        {
            this.outlineMaterials.conifer.uniforms.uColor.value.copy(this.outlineMaterials.palm.uniforms.uColor.value)
            this.outlineMaterials.boulder.uniforms.uColor.value.copy(this.outlineMaterials.palm.uniforms.uColor.value)
        })
    }
}
