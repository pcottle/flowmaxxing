import * as THREE from 'three'

import vertexShader from './shaders/ribbon/vertex.glsl'
import fragmentShader from './shaders/ribbon/fragment.glsl'

export default function RibbonMaterial()
{
    const material = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms:
        {
            uColor: { value: new THREE.Color() },
            uTrimColor: { value: new THREE.Color('#f6c85f') },
            uGlowColor: { value: new THREE.Color('#ffdd8a') },
            uSunPosition: { value: new THREE.Vector3() },
            uOpacity: { value: 1 },
            uPanelsCount: { value: 1 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
