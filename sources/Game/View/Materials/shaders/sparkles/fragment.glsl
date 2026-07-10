uniform vec3 uColor;
uniform float uPresence;
uniform float uOpacity;

varying float vAngle;

void main()
{
    // 4-point star: thin cross arms tapering outward plus a diamond core,
    // hard step edges — the WW treasure "ting"
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float c = cos(vAngle);
    float s = sin(vAngle);
    p = mat2(c, - s, s, c) * p;

    float dist = length(p);
    float nearestAxis = min(abs(p.x), abs(p.y));
    float arms = step(nearestAxis, 0.09 * max(0.0, 1.0 - dist)) * step(dist, 1.0);
    float core = step(abs(p.x) + abs(p.y), 0.28);
    float star = max(arms, core);

    float alpha = star * uPresence * uOpacity;

    if(alpha < 0.01)
        discard;

    gl_FragColor = vec4(uColor, alpha);
}
