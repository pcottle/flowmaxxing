uniform float uTime;
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform float uNight;
uniform float uOpacity;

varying float vPhase;
varying float vFlickerSpeed;
varying float vAlpha;

void main()
{
    // Paper lantern glyph: a plump ellipse body, flame-bright toward the
    // bottom, a dim cap on top, and a faint halo bleeding past the paper
    vec2 p = gl_PointCoord - 0.5;

    float body = 1.0 - smoothstep(0.28, 0.325, length(p * vec2(1.22, 0.92)));

    // Flame core sits low (gl_PointCoord y grows downward)
    float flame = 1.0 - smoothstep(0.0, 0.30, length((p - vec2(0.0, 0.11)) * vec2(1.35, 1.0)));
    float flicker = 0.72 + 0.28 * sin(uTime * vFlickerSpeed + vPhase);
    vec3 color = mix(uColor, uCoreColor, flame * flicker);

    // Dim paper cap and base
    float cap = (1.0 - smoothstep(0.13, 0.20, p.y)) * body;
    color = mix(color, uColor * 0.4, cap * 0.75);
    float base = smoothstep(0.28, 0.34, p.y) * body;
    color = mix(color, uColor * 0.55, base * 0.5);

    float halo = (1.0 - smoothstep(0.3, 0.5, length(p))) * 0.16;

    float alpha = (body + halo) * vAlpha * uNight * uOpacity;

    if(alpha < 0.01)
        discard;

    gl_FragColor = vec4(color, alpha);
}
