uniform float uTime;
uniform float uActivity;
uniform float uIntensity;
uniform vec3 uColorFringe;
uniform vec3 uColorLow;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

varying vec3 vPosition;

#include ../partials/perlin2d.glsl;

void main()
{
    vec3 direction = normalize(vPosition);
    float theta = atan(direction.z, direction.x);

    // Curtain rays: SPARSE bright pillars with dark gaps between them — a
    // broad faint veil just reads as grey haze. Slanted with height so the
    // curtains read folded
    float fold = direction.y * 3.5;
    float rays = perlin2d(vec2(theta * 3.0 + fold * 0.35 + uTime * 0.025, 0.0)) * 0.65
               + perlin2d(vec2(theta * 8.5 - fold * 0.5 - uTime * 0.017, 3.7)) * 0.35;
    rays = smoothstep(0.38, 0.82, rays + 0.42);

    // Tall band: crisp hem low over the horizon, wispy crown higher up
    float hem = smoothstep(0.10, 0.17, direction.y);
    float crown = 1.0 - smoothstep(0.30, 0.62, direction.y);
    float band = hem * crown;

    // Bright near the hem, wispy at the crown — the hot core must live in
    // the green zone, not the violet top
    float heightFalloff = 1.0 - smoothstep(0.18, 0.55, direction.y) * 0.45;

    // Large swells breathing along the ribbon's length
    // ('patch' is a reserved word in GLSL ES 3.0 — don't name it that)
    float swell = perlin2d(vec2(theta * 1.1 - uTime * 0.01, 11.3)) * 0.5 + 0.5;
    swell = smoothstep(0.05, 0.6, swell);

    float intensity = rays * band * swell * uActivity * heightFalloff;

    // The hot electric border along the curtain's lower edge
    float hemLine = smoothstep(0.13, 0.17, direction.y) * (1.0 - smoothstep(0.19, 0.26, direction.y));

    // Pink fringe line → broad GREEN body → emerald waist → magenta crown
    vec3 color = mix(uColorFringe, uColorLow, smoothstep(0.12, 0.18, direction.y));
    color = mix(color, uColorMid, smoothstep(0.32, 0.45, direction.y));
    color = mix(color, uColorHigh, smoothstep(0.45, 0.60, direction.y));

    // Gentle hue drift along the ribbon (kept subtle so colors stay pure)
    float hueShift = perlin2d(vec2(theta * 0.9 + 7.0, uTime * 0.005)) * 0.5 + 0.5;
    color = mix(color, color.brg, hueShift * 0.12);

    float alpha = (intensity + hemLine * rays * swell * uActivity * 0.7) * uIntensity;
    alpha = pow(alpha, 1.35); // deepen the gaps, keep the hot pillars

    gl_FragColor = vec4(color * (1.0 + hemLine * 0.4), alpha);
}
