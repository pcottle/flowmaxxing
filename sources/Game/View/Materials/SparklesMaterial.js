import * as THREE from 'three'

import vertexShader from './shaders/sparkles/vertex.glsl'
import fragmentShader from './shaders/sparkles/fragment.glsl'

export default function SparklesMaterial()
{
    const material = new THREE.ShaderMaterial({
        uniforms:
        {
            uTime: { value: 0 },
            uSizeScale: { value: 1 },
            uSize: { value: 0.35 },
            uDensity: { value: 0.6 },
            uColor: { value: new THREE.Color('#fff3d6') },
            uPresence: { value: 0 },
            uOpacity: { value: 1 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
