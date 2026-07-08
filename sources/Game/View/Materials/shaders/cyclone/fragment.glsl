uniform float uTime;
uniform float uScrollSpeed;
uniform vec3 uColor;
uniform float uOpacity;

varying vec2 vUv;

void main()
{
    // Hard-stepped diagonal bands winding up the column — the WW cyclone
    // language; dissolve toward the top, solid dusty band at the base
    float band = step(0.55, fract(vUv.x * 3.0 - vUv.y * 5.0 + uTime * uScrollSpeed));
    float taper = 1.0 - smoothstep(0.55, 1.0, vUv.y);
    float rim = 1.0 - smoothstep(0.0, 0.12, vUv.y);
    float alpha = max(band * taper * 0.55, rim * 0.35) * uOpacity;

    if(alpha < 0.01)
        discard;

    gl_FragColor = vec4(uColor, alpha);
}
