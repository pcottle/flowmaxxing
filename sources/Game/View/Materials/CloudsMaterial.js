import * as THREE from 'three'

import vertexShader from './shaders/clouds/vertex.glsl'
import fragmentShader from './shaders/clouds/fragment.glsl'

export default function CloudsMaterial()
{
    const material = new THREE.ShaderMaterial({
        uniforms:
        {
            uTime: { value: 0 },
            uSunPosition: { value: new THREE.Vector3(- 0.5, - 0.5, - 0.5) },
            uColorSun: { value: new THREE.Color('#ffa54a') },
            uCloudScale: { value: 0.6 },
            uCoverage: { value: 0.45 },
            uSoftness: { value: 0.35 },
            uDriftSpeed: { value: new THREE.Vector2(0.008, 0.003) },
            uOpacity: { value: 0.85 }
        },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
