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

    float fbm = perlin2d(uv) * 0.55 + perlin2d(uv * 2.1 + 5.0) * 0.28 + perlin2d(uv * 4.3 + 11.0) * 0.17;
    float density = smoothstep(uCoverage, uCoverage + uSoftness, fbm + 0.5);

    // Fade at the horizon so the fog gradient below stays clean
    float horizonFade = smoothstep(0.04, 0.14, direction.y);

    // Day/night brightness from sun height, warm sun-lit edges near the sun
    float day = smoothstep(- 0.25, 0.1, uSunPosition.y);
    vec3 color = mix(vec3(0.3, 0.32, 0.4), vec3(1.0), day);
    float sunGlow = pow(max(dot(direction, normalize(uSunPosition)), 0.0), 6.0);
    color += uColorSun * sunGlow * (1.0 - density) * density * 2.0;

    gl_FragColor = vec4(color, density * uOpacity * horizonFade);
}
