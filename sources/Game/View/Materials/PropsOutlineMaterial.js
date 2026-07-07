import * as THREE from 'three'

import vertexShader from './shaders/propsOutline/vertex.glsl'
import fragmentShader from './shaders/propsOutline/fragment.glsl'

export default function PropsOutlineMaterial({ thickness = 0.06, swayCollapse = 999 } = {})
{
    const material = new THREE.ShaderMaterial({
        uniforms:
        {
            uThickness: { value: thickness },
            uSwayCollapse: { value: swayCollapse },
            uColor: { value: new THREE.Color('#1c1713') },
            uFogTexture: { value: null },
            uNoiseTexture: { value: null },
            uWindTime: { value: 0 },
            uWindStrength: { value: 0 }
        },
        side: THREE.BackSide,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    })

    return material
}
