uniform vec3 uColor;
uniform sampler2D uFogTexture;

varying float vViewDepth;
varying vec4 vClipPosition;

#include ../partials/getFogColor.glsl;

void main()
{
    // Fog the ink line so distant outlines melt into the haze instead of
    // staying harsh black dots
    vec2 screenUv = (vClipPosition.xy / vClipPosition.w) * 0.5 + 0.5;
    vec3 color = getFogColor(uColor, vViewDepth, screenUv);

    gl_FragColor = vec4(color, 1.0);
}
