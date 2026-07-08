uniform vec3 uSunPosition;
uniform float uSunAmplitude;
uniform float uSunMultiplier;
uniform vec3 uColorSun;
uniform float uStormness;
uniform float uFlash;

varying vec3 vColor;
varying vec3 vSpherePosition;

vec3 blendAdd(vec3 base, vec3 blend)
{
    return min(base + blend, vec3(1.0));
}

vec3 blendAdd(vec3 base, vec3 blend, float opacity)
{
    return (blendAdd(base, blend) * opacity + base * (1.0 - opacity));
}

void main()
{
    vec3 color = vColor;

    // Storm: desaturate toward a cool mid gray (luma-based, so night values
    // lift slightly rather than crush)
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color, vec3(luma) * vec3(0.72, 0.75, 0.8), uStormness * 0.85);

    // Toon sun halo: the smooth glow posterized into a flat outer disc
    // and a brighter inner core with hard edges
    float distanceToSun = distance(normalize(vSpherePosition), uSunPosition);
    float glow = smoothstep(0.0, 1.0, clamp(1.0 - distanceToSun / uSunAmplitude, 0.0, 1.0)) * uSunMultiplier;
    glow += pow(max(0.0, 1.0 + 0.05 - distanceToSun * 2.5), 2.0);

    float halo = smoothstep(0.72, 0.75, glow) * 0.3 + smoothstep(1.1, 1.15, glow) * 0.7;
    color = blendAdd(color, uColorSun, halo * (1.0 - uStormness * 0.85));

    // Lightning flash
    color = mix(color, vec3(1.0), uFlash * 0.8);

    gl_FragColor = vec4(color, 1.0);
}
