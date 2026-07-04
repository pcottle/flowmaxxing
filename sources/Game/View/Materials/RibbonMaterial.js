import * as THREE from 'three'

import vertexShader from './shaders/ribbon/vertex.glsl'
import fragmentShader from './shaders/ribbon/fragment.glsl'

export default function RibbonMaterial()
{
    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms:
        {
            uColor: { value: new THREE.Color() },
            uSunPosition: { value: new THREE.Vector3() },
            uOpacity: { value: 0.9 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
