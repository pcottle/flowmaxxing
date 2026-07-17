import * as THREE from 'three'

import vertexShader from './shaders/lantern/vertex.glsl'
import fragmentShader from './shaders/lantern/fragment.glsl'

export default function LanternsMaterial()
{
    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms:
        {
            uTime: { value: 0 },
            uSizeScale: { value: null },
            uSize: { value: 0.5 },
            uColor: { value: new THREE.Color('#ff9a3e') },
            uCoreColor: { value: new THREE.Color('#ffe6a3') },
            uNight: { value: 1 },
            uOpacity: { value: 1 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
