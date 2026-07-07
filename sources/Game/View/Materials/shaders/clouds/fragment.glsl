uniform float uTime;
uniform vec3 uSunPosition;
uniform vec3 uColorSun;
uniform float uCloudScale;
uniform float uCoverage;
uniform float uSoftness;
uniform vec2 uDriftSpeed;
uniform float uOpacity;

varying vec3 vPosition;

#include ../partials/perlin2d.glsl;

void main()
{
    vec3 direction = normalize(vPosition);

    // Planar projection keeps cloud shapes stable overhead; drift via time only
    // (the dome is rotation-locked to the camera, which is correct)
    vec2 uv = direction.xz / (direction.y + 0.35) * uCloudScale;
    uv += uTime * uDriftSpeed;

    // Two big octaves for chunky puff shapes, near-step edge for the toon look.
    // High coverage keeps only the noise peaks → discrete lumpy puffs
    float fbm = perlin2d(uv) * 0.65 + perlin2d(uv * 2.3 + 5.0) * 0.35;
    float density = smoothstep(uCoverage, uCoverage + 0.015, fbm + 0.5);

    // Flat shaded underside: sample the field slightly "higher" in projected
    // space — where the shifted sample is shallower, this pixel is near the
    // cloud's lower edge. Near-step for a flat two-tone body
    vec2 uvUp = uv + vec2(0.0, 0.05);
    float fbmUp = perlin2d(uvUp) * 0.65 + perlin2d(uvUp * 2.3 + 5.0) * 0.35;
    float underside = density * (1.0 - smoothstep(uCoverage + 0.03, uCoverage + 0.045, fbmUp + 0.5));

    // Fade at the horizon so the fog gradient below stays clean
    float horizonFade = smoothstep(0.04, 0.14, direction.y);

    // Day/night brightness from sun height; flat two-tone body
    float day = smoothstep(- 0.25, 0.1, uSunPosition.y);
    vec3 bodyColor = mix(vec3(0.3, 0.32, 0.4), vec3(1.0), day);
    vec3 undersideColor = mix(vec3(0.22, 0.24, 0.32), vec3(0.78, 0.82, 0.90), day);
    vec3 color = mix(bodyColor, undersideColor, underside);

    // Hard sun-lit rim on the sun side
    float sunGlow = pow(max(dot(direction, normalize(uSunPosition)), 0.0), 6.0);
    float rim = step(0.5, sunGlow * (1.0 - underside));
    color = mix(color, clamp(bodyColor + uColorSun * 0.55, 0.0, 1.0), rim * 0.8);

    gl_FragColor = vec4(color, density * uOpacity * horizonFade);
}
