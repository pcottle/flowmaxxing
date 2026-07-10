import * as THREE from 'three'

import vertexShader from './shaders/campfireGlow/vertex.glsl'
import fragmentShader from './shaders/campfireGlow/fragment.glsl'

export default function CampfireGlowMaterial()
{
    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms:
        {
            uTime: { value: 0 },
            uSeed: { value: 0 },
            uOpacity: { value: 0 },
            uColor: { value: new THREE.Color('#ff9b3c') }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
