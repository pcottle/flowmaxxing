uniform vec3 uSunPosition;
uniform float uFresnelOffset;
uniform float uFresnelScale;
uniform float uFresnelPower;
uniform sampler2D uFogTexture;

varying vec3 vColor;
varying vec3 vWetColor;
varying vec3 vWorldPosition;
varying float vWetness;
varying float vViewDepth;
varying vec4 vClipPosition;

#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;
#include ../partials/getSunReflection.glsl;
#include ../partials/getSunReflectionColor.glsl;
#include ../partials/getFogColor.glsl;

void main()
{
    // Faceted world normal from screen-space derivatives — one cel band per triangle
    vec3 faceNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    faceNormal *= sign(faceNormal.y);

    // Hard toon wet edge — stepping the interpolated wetness keeps it crisp
    float wet = step(0.35, vWetness);
    vec3 color = mix(vColor, vWetColor, wet);

    // Sun shade (cel-banded in the partial)
    float sunShade = getSunShade(faceNormal);
    color = getSunShadeColor(color, sunShade);

    // Sun reflection rim
    vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
    vec3 viewNormal = normalize((viewMatrix * vec4(faceNormal, 0.0)).xyz);
    float sunReflection = getSunReflection(viewDirection, faceNormal, viewNormal);
    color = getSunReflectionColor(color, sunReflection);

    // Wet-sand gloss: grazing-angle specular chips, strongest at golden hour
    float sunLow = smoothstep(0.4, 0.06, uSunPosition.y) * smoothstep(- 0.1, 0.02, uSunPosition.y);
    float wetSpec = pow(max(0.0, dot(reflect(uSunPosition, viewNormal), viewDirection)), 10.0) * (1.0 + dot(viewDirection, faceNormal));
    float gloss = step(0.35, wetSpec * 1.4 * wet * sunLow);
    color = mix(color, vec3(1.0, 0.95, 0.85), gloss * 0.8);

    // Fog
    vec2 screenUv = (vClipPosition.xy / vClipPosition.w) * 0.5 + 0.5;
    color = getFogColor(color, vViewDepth, screenUv);

    gl_FragColor = vec4(color, 1.0);
}
