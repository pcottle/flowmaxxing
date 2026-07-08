import * as THREE from 'three'

import vertexShader from './shaders/cyclone/vertex.glsl'
import fragmentShader from './shaders/cyclone/fragment.glsl'

export default function CycloneMaterial()
{
    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms:
        {
            uTime: { value: 0 },
            uScrollSpeed: { value: 0.8 },
            uColor: { value: new THREE.Color('#eafff4') },
            uOpacity: { value: 1 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
