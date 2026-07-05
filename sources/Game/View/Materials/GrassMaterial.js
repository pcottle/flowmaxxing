import * as THREE from 'three'

import vertexShader from './shaders/grass/vertex.glsl'
import fragmentShader from './shaders/grass/fragment.glsl'

export default function GrassMaterial()
{
    const material = new THREE.ShaderMaterial({
        uniforms:
        {
            uTime: { value: null },
            uWindTime: { value: null },
            uWindStrength: { value: null },
            uGrassDistance: { value: null },
            uPlayerPosition: { value: null },
            uTerrainSize: { value: null },
            uTerrainTextureSize: { value: null },
            uTerrainATexture: { value: null },
            uTerrainAOffset: { value: null },
            uTerrainBTexture: { value: null },
            uTerrainBOffset: { value: null },
            uTerrainCTexture: { value: null },
            uTerrainCOffset: { value: null },
            uTerrainDTexture: { value: null },
            uTerrainDOffset: { value: null },
            uNoiseTexture: { value: null },
            uPlayerPushRadius: { value: null },
            uPlayerPushStrength: { value: null },
            uFresnelOffset: { value: null },
            uFresnelScale: { value: null },
            uFresnelPower: { value: null },
            uSunPosition: { value: null },
            uCorridorTexture: { value: null },
            uCorridorZMin: { value: 0 },
            uCorridorZRange: { value: 1 },
            uGrassColors: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}