uniform vec3 uColorMoon;
uniform vec3 uColorRim;
uniform float uNightness;
uniform float uMoonRadius;
uniform float uPhase;
uniform float uHaloIntensity;

varying vec2 vUv;

void main()
{
    // The moon body occupies the inner part of the disc; the outer band hosts
    // the posterized halo rings — hard edges everywhere, WW sun-halo style
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);

    // Crescent: a second circle bitten out of the body, hard edge
    float body = 1.0 - step(uMoonRadius, r);
    vec2 biteCenter = vec2(uMoonRadius * uPhase, uMoonRadius * uPhase * 0.35);
    float bite = 1.0 - step(uMoonRadius * 0.92, distance(p, biteCenter));
    float crescent = body * (1.0 - bite);

    // Slightly darker band along the terminator
    float rimBand = crescent * (1.0 - step(uMoonRadius * 1.05, distance(p, biteCenter)));
    vec3 color = mix(uColorMoon, uColorRim, rimBand);

    // Two stepped glow rings outside the body
    float halo = (1.0 - step(uMoonRadius * 1.35, r)) * 0.6
               + (1.0 - step(uMoonRadius * 1.9, r)) * 0.4;
    halo *= uHaloIntensity * (1.0 - body);

    float alpha = max(crescent, halo) * uNightness;

    if(alpha < 0.01)
        discard;

    gl_FragColor = vec4(color, alpha);
}
