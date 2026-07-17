import * as THREE from 'three'

import vertexShader from './shaders/particles/vertex.glsl'
import fragmentShader from './shaders/particles/fragment.glsl'

export default function ParticlesMaterial()
{
    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms:
        {
            uTime: { value: 0 },
            uSizeScale: { value: null },
            uColor: { value: new THREE.Color('#78c8ff') },
            uHighlightColor: { value: new THREE.Color('#ffffff') },
            uSandColor: { value: new THREE.Color('#dcba7e') },
            uSunPosition: { value: new THREE.Vector3() },
            uOpacity: { value: 0.82 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
