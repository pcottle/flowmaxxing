uniform vec3 uSunPosition;
uniform sampler2D uFogTexture;
uniform sampler2D uNoiseTexture;
uniform float uWindTime;
uniform float uWindStrength;

attribute float sway;

varying vec3 vColor;

#include ../partials/inverseLerp.glsl
#include ../partials/remap.glsl
#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;
#include ../partials/getFogColor.glsl;
#include ../partials/getTimeOfDayColor.glsl;

void main()
{
    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec4 originPosition = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // Wind sway: same noise-scroll idiom as grass, much stiffer, tips only
    vec2 noiseUv = originPosition.xz * 0.02 + uWindTime * 0.05;
    vec4 noiseColor = texture2D(uNoiseTexture, noiseUv);
    float windAmplitude = mix(0.03, 0.4, uWindStrength) * sway;
    worldPosition.x += (noiseColor.x - 0.5) * windAmplitude;
    worldPosition.z += (noiseColor.y - 0.5) * windAmplitude;

    vec4 viewPosition = viewMatrix * worldPosition;
    float depth = - viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;

    vec3 worldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);

    vec3 outputColor = color;

    #ifdef USE_INSTANCING_COLOR
        outputColor *= instanceColor;
    #endif

    outputColor = getTimeOfDayColor(outputColor);
    outputColor = getSunShadeColor(outputColor, getSunShade(worldNormal));

    vec2 screenUv = (gl_Position.xy / gl_Position.w * 0.5) + 0.5;
    outputColor = getFogColor(outputColor, depth, screenUv);

    vColor = outputColor;
}
