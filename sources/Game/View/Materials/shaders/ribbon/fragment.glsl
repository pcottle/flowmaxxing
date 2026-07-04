uniform vec3 uColor;
uniform vec3 uSunPosition;
uniform float uOpacity;

varying float vAlpha;

void main()
{
    float dayness = smoothstep(- 0.2, 0.2, uSunPosition.y);
    vec3 color = uColor * mix(0.35, 1.0, dayness);

    gl_FragColor = vec4(color, vAlpha * uOpacity);
}
