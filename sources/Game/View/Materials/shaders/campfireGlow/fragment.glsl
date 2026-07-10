uniform float uTime;
uniform float uSeed;
uniform float uOpacity;
uniform vec3 uColor;

varying vec2 vUv;

void main()
{
    // Two flat stepped rings whose edges breathe — toon glow, no gradient
    float d = length(vUv - 0.5) * 2.0;
    d *= 1.0 + 0.06 * sin(uTime * 2.8 + uSeed);

    float alpha = (1.0 - step(1.0, d)) * 0.35 + (1.0 - step(0.55, d)) * 0.45;
    alpha *= uOpacity;

    if(alpha < 0.01)
        discard;

    gl_FragColor = vec4(uColor, alpha);
}
