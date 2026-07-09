import * as THREE from 'three'

import vertexShader from './shaders/fireflies/vertex.glsl'
import fragmentShader from './shaders/fireflies/fragment.glsl'

export default function FirefliesMaterial()
{
    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms:
        {
            uTime: { value: 0 },
            uSizeScale: { value: null },
            uSize: { value: 0.25 },
            uDensity: { value: 1 },
            uColor: { value: new THREE.Color('#ffe9a8') },
            uNight: { value: 0 },
            uOpacity: { value: 1 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
