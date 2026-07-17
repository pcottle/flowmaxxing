import * as THREE from 'three'

import vertexShader from './shaders/aurora/vertex.glsl'
import fragmentShader from './shaders/aurora/fragment.glsl'

export default function AuroraMaterial()
{
    const material = new THREE.ShaderMaterial({
        uniforms:
        {
            uTime: { value: 0 },
            uActivity: { value: 0 },
            uIntensity: { value: 1.3 },
            uColorFringe: { value: new THREE.Color('#ff4d6a') },
            uColorLow: { value: new THREE.Color('#39ff7a') },
            uColorMid: { value: new THREE.Color('#2fe8b0') },
            uColorHigh: { value: new THREE.Color('#c64dff') }
        },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        // Normal (not additive) blending: the night horizon is a bright blue
        // and additive would wash every hue toward cyan-white over it
        blending: THREE.NormalBlending,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
