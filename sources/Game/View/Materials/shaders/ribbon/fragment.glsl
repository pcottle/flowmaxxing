uniform vec3 uColor;
uniform vec3 uTrimColor;
uniform vec3 uGlowColor;
uniform vec3 uSunPosition;
uniform float uOpacity;
uniform float uPanelsCount;

varying vec2 vUv;

void main()
{
    float dayness = smoothstep(- 0.2, 0.2, uSunPosition.y);
    float nightness = 1.0 - dayness;
    float edgeDistance = min(vUv.x, 1.0 - vUv.x);
    float centerDistance = abs(vUv.x - 0.5);
    float panelPosition = fract(vUv.y * uPanelsCount);
    float stitchBand = max(
        1.0 - smoothstep(0.0, 0.055, panelPosition),
        1.0 - smoothstep(0.0, 0.055, 1.0 - panelPosition)
    );
    float stitchWidth = smoothstep(0.12, 0.22, vUv.x) * smoothstep(0.12, 0.22, 1.0 - vUv.x);
    float trim = 1.0 - smoothstep(0.028, 0.07, edgeDistance);
    float centerLine = 1.0 - smoothstep(0.015, 0.045, centerDistance);
    float glyphRepeat = vUv.y * 8.0;
    float glyphCell = abs(fract(glyphRepeat) - 0.5);
    float glyph = (1.0 - smoothstep(0.17, 0.29, glyphCell)) * (1.0 - smoothstep(0.04, 0.16, centerDistance));
    float details = clamp(trim + stitchBand * stitchWidth * 0.42 + glyph * 0.22 + centerLine * 0.08, 0.0, 1.0);
    float glow = (trim * 0.18 + stitchBand * stitchWidth * 0.1 + glyph * 0.16) * mix(0.55, 1.0, nightness);

    vec3 cloth = uColor * mix(0.34, 1.0, dayness);
    vec3 color = mix(cloth, uTrimColor * mix(0.85, 1.2, dayness), details);
    color += uGlowColor * glow;

    gl_FragColor = vec4(color, uOpacity);
}
