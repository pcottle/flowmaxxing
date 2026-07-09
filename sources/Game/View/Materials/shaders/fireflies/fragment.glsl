uniform float uTime;
uniform vec3 uColor;
uniform float uNight;
uniform float uOpacity;

varying float vPhase;
varying float vFlickerSpeed;

void main()
{
    // Crisp warm dot with a dim halo, slowly breathing on and off
    float d = length(gl_PointCoord - 0.5);
    float core = 1.0 - step(0.13, d);
    float halo = (1.0 - smoothstep(0.13, 0.5, d)) * 0.22;
    float flicker = 0.35 + 0.65 * smoothstep(- 0.6, 0.6, sin(uTime * vFlickerSpeed + vPhase));
    float alpha = (core + halo) * flicker * uNight * uOpacity;

    if(alpha < 0.01)
        discard;

    gl_FragColor = vec4(uColor, alpha);
}
