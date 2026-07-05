import * as THREE from 'three'

import vertexShader from './shaders/props/vertex.glsl'
import fragmentShader from './shaders/props/fragment.glsl'

export default function PropsMaterial()
{
    const material = new THREE.ShaderMaterial({
        uniforms:
        {
            uSunPosition: { value: new THREE.Vector3(- 0.5, - 0.5, - 0.5) },
            uFogTexture: { value: null },
            uNoiseTexture: { value: null },
            uWindTime: { value: 0 },
            uWindStrength: { value: 0 }
        },
        vertexColors: true,
        side: THREE.DoubleSide,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
