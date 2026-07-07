import * as THREE from 'three'

import vertexShader from './shaders/terrain/vertex.glsl'
import fragmentShader from './shaders/terrain/fragment.glsl'

export default function TerrainMaterial()
{
    const material = new THREE.ShaderMaterial({
        uniforms:
        {
            uPlayerPosition: { value: null },
            uGradientTexture: { value: null },
            uLightnessSmoothness: { value: null },
            uFresnelOffset: { value: null },
            uFresnelScale: { value: null },
            uFresnelPower: { value: null },
            uSunPosition: { value: null },
            uFogTexture: { value: null },
            uGrassDistance: { value: null },
            uBeachEnd: { value: null },
            uMountainStart: { value: null },
            uMountainFull: { value: null },
            uTexture: { value: null },
            uTime: { value: 0 },
            uCorridorTexture: { value: null },
            uCorridorZMin: { value: 0 },
            uCorridorZRange: { value: 1 },
            uSandColors: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] },
            uGrassColors: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] },
            uRockColors: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] },
            uWaveTexture: { value: null },
            uUprush0: { value: 0 },
            uUprush1: { value: 0 },
            uUprushJitterScale: { value: 0.05 },
            uWetLine: { value: 0 },
            uWetFresh: { value: 0 }
        },
        extensions: { derivatives: true },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
