import * as THREE from 'three'

import vertexShader from './shaders/moon/vertex.glsl'
import fragmentShader from './shaders/moon/fragment.glsl'

export default function MoonMaterial()
{
    const material = new THREE.ShaderMaterial({
        uniforms:
        {
            uColorMoon: { value: new THREE.Color('#e8f0ff') },
            uColorRim: { value: new THREE.Color('#b9c8e6') },
            uNightness: { value: 0 },
            uMoonRadius: { value: 0.4 },
            uPhase: { value: 0.55 },
            uHaloIntensity: { value: 0.25 }
        },
        transparent: true,
        depthWrite: false,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
