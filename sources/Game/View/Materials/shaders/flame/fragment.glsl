uniform float uTime;
uniform float uIntensity;
uniform float uSeed;
uniform vec3 uColorOuter;
uniform vec3 uColorMid;
uniform vec3 uColorCore;

varying vec2 vUv;
varying float vPhase;

// Teardrop with WW billow bumps: a lumpy cloud edge whose puffs drift
// upward — the bumps translate, the silhouette formula never morphs
float flameShape(vec2 p, float t)
{
    float r = 0.33 * smoothstep(- 0.05, 0.35, p.y) * pow(clamp(1.0 - p.y, 0.0, 1.0), 1.3);
    float billow = sin(p.y * 12.0 - t * 1.6 + sign(p.x) * 1.9)
                 + 0.6 * sin(p.y * 21.0 - t * 2.7 + sign(p.x) * 4.2);
    r *= 1.0 + billow * 0.12;
    return abs(p.x) - r;
}

// WW spiral glyph: one archimedean arm swirling around a center —
// same trick as the wind-curl particles
float curlArm(vec2 p, vec2 center, float radius, float spin, float t)
{
    vec2 d = (p - center) / radius;
    float r = length(d);
    float theta = atan(d.y, d.x) / 6.2831853;
    float arm = fract(theta + r * 1.6 + spin * t);
    return step(abs(arm - 0.5), 0.13) * step(r, 1.0) * step(0.2, r);
}

void main()
{
    vec2 p = vec2(vUv.x - 0.5, vUv.y);

    // Sway scrolls the whole shape sideways, growing with height
    float t = uTime * 0.7 + uSeed + vPhase;
    p.x += (sin(t) * 0.05 + sin(t * 3.1 + p.y * 4.0) * 0.035) * p.y;

    // Flicker + night growth + rain damping breathe the flame height
    p.y /= max(uIntensity, 0.001);

    // De-phased billows per band read as WW's puff-on-puff clouds
    float outer = flameShape(p, t);
    float mid = flameShape(vec2(p.x * 1.35, (p.y - 0.02) * 1.2), t + 1.3);
    float core = flameShape(vec2(p.x * 2.2, (p.y - 0.04) * 1.65), t + 2.6);

    if(outer > 0.0)
        discard;

    vec3 color = uColorOuter;
    color = mix(color, uColorMid, step(mid, 0.0));
    color = mix(color, uColorCore, step(core, 0.0));

    // Golden spiral curls swirling through the body, clipped to the mid band
    float curl = curlArm(p, vec2(0.06, 0.30), 0.18, - 0.25, t);
    curl = max(curl, curlArm(p, vec2(- 0.05, 0.55), 0.14, 0.3, t));
    curl *= step(mid, 0.0);
    color = mix(color, uColorCore, curl);

    gl_FragColor = vec4(color, 1.0);
}
