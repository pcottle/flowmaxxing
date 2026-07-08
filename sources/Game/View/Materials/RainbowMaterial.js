import * as THREE from 'three'

import vertexShader from './shaders/rainbow/vertex.glsl'
import fragmentShader from './shaders/rainbow/fragment.glsl'

export default function RainbowMaterial()
{
    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms:
        {
            uVisibility: { value: 0 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
