import * as THREE from 'three'

import vertexShader from './shaders/sunShafts/vertex.glsl'
import fragmentShader from './shaders/sunShafts/fragment.glsl'

export default function SunShaftsMaterial()
{
    const material = new THREE.ShaderMaterial({
        uniforms:
        {
            uSkyTexture: { value: null },
            uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
            uGate: { value: 0 },
            uIntensity: { value: 0.35 },
            uDecay: { value: 0.92 },
            uThreshold: { value: 0.6 },
            uRadius: { value: 0.7 },
            uColor: { value: new THREE.Color('#ffd9a0') },
            uAspect: { value: 1 }
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
