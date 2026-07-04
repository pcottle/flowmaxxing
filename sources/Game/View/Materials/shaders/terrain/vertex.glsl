uniform vec3 uPlayerPosition;
uniform float uLightnessSmoothness;
uniform float uFresnelOffset;
uniform float uFresnelScale;
uniform float uFresnelPower;
uniform vec3 uSunPosition;
uniform float uGrassDistance;
uniform float uBeachEnd;
uniform float uMountainStart;
uniform float uMountainFull;
uniform sampler2D uTexture;
uniform sampler2D uFogTexture;

varying vec3 vColor;

#include ../partials/inverseLerp.glsl
#include ../partials/remap.glsl
#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;
#include ../partials/getSunReflection.glsl;
#include ../partials/getSunReflectionColor.glsl;
#include ../partials/getFogColor.glsl;
#include ../partials/getGrassAttenuation.glsl;
#include ../partials/getTimeOfDayColor.glsl;

void main()
{
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    float depth = - viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;

    // Terrain data
    vec4 terrainData = texture2D(uTexture, uv);
    vec3 normal = terrainData.rgb;

    // Slope
    float slope = 1.0 - abs(dot(vec3(0.0, 1.0, 0.0), normal));

    vec3 viewDirection = normalize(modelPosition.xyz - cameraPosition);
    vec3 worldNormal = normalize(mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * normal);
    vec3 viewNormal = normalize(normalMatrix * normal);

    // Color
    float elevation = terrainData.a;
    float beachEnd = max(uBeachEnd, 1.3);
    float mountainFull = max(uMountainFull, uMountainStart + 0.1);

    vec3 sandColor = vec3(0.76, 0.68, 0.45);
    vec3 wetSandColor = vec3(0.48, 0.46, 0.34);
    vec3 uGrassDefaultColor = vec3(0.52, 0.65, 0.26);
    vec3 uGrassShadedColor = vec3(0.52 / 1.3, 0.65 / 1.3, 0.26 / 1.3);
    vec3 alpineColor = vec3(0.38, 0.48, 0.36);
    vec3 rockColor = vec3(0.37, 0.38, 0.36);
    vec3 snowColor = vec3(0.9, 0.92, 0.86);
    
    // Grass distance attenuation
    // Terrain must match the bottom of the grass which is darker
    float grassDistanceAttenuation = getGrassAttenuation(modelPosition.xz);
    float grassSlopeAttenuation = smoothstep(remap(slope, 0.4, 0.5, 1.0, 0.0), 0.0, 1.0);
    float grassAttenuation = grassDistanceAttenuation * grassSlopeAttenuation;
    vec3 grassColor = mix(uGrassShadedColor, uGrassDefaultColor, 1.0 - grassAttenuation);
    vec3 beachColor = mix(wetSandColor, sandColor, smoothstep(0.0, beachEnd, elevation));
    float grassBlend = smoothstep(1.2, beachEnd + 2.0, elevation);
    float alpineBlend = smoothstep(uMountainStart, mountainFull, elevation);
    float snowBlend = smoothstep(mountainFull - 1.0, mountainFull + 9.0, elevation);
    float rockBlend = smoothstep(0.18, 0.55, slope) * (1.0 - snowBlend * 0.55);
    float snowCoverage = snowBlend * (1.0 - smoothstep(0.45, 0.75, slope) * 0.65);

    vec3 color = mix(beachColor, grassColor, grassBlend);
    color = mix(color, alpineColor, alpineBlend * (1.0 - snowCoverage));
    color = mix(color, rockColor, rockBlend);
    color = mix(color, snowColor, snowCoverage);

    // Time of day tint
    color = getTimeOfDayColor(color);

    // Sun shade
    float sunShade = getSunShade(normal);
    color = getSunShadeColor(color, sunShade);

    // Sun reflection
    float sunReflection = getSunReflection(viewDirection, worldNormal, viewNormal);
    color = getSunReflectionColor(color, sunReflection);

    // Fog
    vec2 screenUv = (gl_Position.xy / gl_Position.w * 0.5) + 0.5;
    color = getFogColor(color, depth, screenUv);

    // vec3 dirtColor = vec3(0.3, 0.2, 0.1);
    // vec3 color = mix(dirtColor, grassColor, terrainData.g);

    // Varyings
    vColor = color;
}
