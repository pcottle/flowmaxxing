import * as THREE from 'three'

import vertexShader from './shaders/water/vertex.glsl'
import fragmentShader from './shaders/water/fragment.glsl'

export default function WaterMaterial()
{
    const material = new THREE.ShaderMaterial({
        uniforms:
        {
            uTime: { value: 0 },
            uShoreTexture: { value: null },
            uWaveTexture: { value: null },
            uShoreZMin: { value: 0 },
            uShoreZRange: { value: 1 },
            uOceanRampWidth: { value: 90 },
            uWaveD0: { value: 130 },
            uWaveWidth: { value: 9 },
            uWaveFront0: { value: 130 },
            uWaveFront1: { value: 130 },
            uWaveAmp0: { value: 0 },
            uWaveAmp1: { value: 0 },
            uWaveFoamWidth0: { value: 0 },
            uWaveFoamWidth1: { value: 0 },
            uWaveFoamIntensity0: { value: 0 },
            uWaveFoamIntensity1: { value: 0 },
            uDeepColor: { value: new THREE.Color('#1d3456') },
            uShallowColor: { value: new THREE.Color('#3a6d8a') },
            uFoamColor: { value: new THREE.Color('#e8f0ee') },
            uSunPosition: { value: new THREE.Vector3(- 0.5, - 0.5, - 0.5) },
            uFoamCellSize: { value: 3.5 },
            uFogTexture: { value: null }
        },
        transparent: true,
        extensions: { derivatives: true },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
