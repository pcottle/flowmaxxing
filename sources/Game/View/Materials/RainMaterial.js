import * as THREE from 'three'

import vertexShader from './shaders/rain/vertex.glsl'
import fragmentShader from './shaders/rain/fragment.glsl'

export default function RainMaterial()
{
    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms:
        {
            uTime: { value: 0 },
            uSizeScale: { value: null },
            uCenter: { value: new THREE.Vector3() },
            uArea: { value: new THREE.Vector3(50, 28, 50) },
            uFallSpeed: { value: 24 },
            uWindSlant: { value: new THREE.Vector2(0.5, - 3) },
            uIntensity: { value: 0 },
            uSize: { value: 0.4 },
            uColor: { value: new THREE.Color('#dceefb') },
            uOpacity: { value: 0.75 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
