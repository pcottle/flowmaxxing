import * as THREE from 'three'

import vertexShader from './shaders/flame/vertex.glsl'
import fragmentShader from './shaders/flame/fragment.glsl'

export default function FlameMaterial()
{
    // Opaque cutout (discard does the silhouette) — flat WW sprite look;
    // additive blending is reserved for the glow disc and embers
    const material = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms:
        {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uSeed: { value: 0 },
            uColorOuter: { value: new THREE.Color('#d84c15') },
            uColorMid: { value: new THREE.Color('#ff9b2f') },
            uColorCore: { value: new THREE.Color('#ffe28a') }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
