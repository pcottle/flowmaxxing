#define M_PI 3.1415926535897932384626433832795

uniform float uTime;
uniform float uWindTime;
uniform float uWindStrength;
uniform float uGrassDistance;
uniform vec3 uPlayerPosition;
uniform float uTerrainSize;
uniform float uTerrainTextureSize;
uniform sampler2D uTerrainATexture;
uniform vec2 uTerrainAOffset;
uniform sampler2D uTerrainBTexture;
uniform vec2 uTerrainBOffset;
uniform sampler2D uTerrainCTexture;
uniform vec2 uTerrainCOffset;
uniform sampler2D uTerrainDTexture;
uniform vec2 uTerrainDOffset;
uniform sampler2D uNoiseTexture;
uniform float uPlayerPushRadius;
uniform float uPlayerPushStrength;
uniform float uFresnelOffset;
uniform float uFresnelScale;
uniform float uFresnelPower;
uniform vec3 uSunPosition;
uniform sampler2D uCorridorTexture;
uniform float uCorridorZMin;
uniform float uCorridorZRange;
uniform vec3 uGrassColors[3];

attribute vec2 center;
// attribute float tipness;

varying vec3 vColor;

#include ../partials/inverseLerp.glsl
#include ../partials/remap.glsl
#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;
#include ../partials/getSunReflection.glsl;
#include ../partials/getSunReflectionColor.glsl;
#include ../partials/getGrassAttenuation.glsl;
#include ../partials/getRotatePivot2d.glsl;
#include ../partials/getTimeOfDayColor.glsl;

void main()
{
    // Recalculate center and keep around player
    vec2 newCenter = center;
    newCenter -= uPlayerPosition.xz;
    float halfSize = uGrassDistance * 0.5;
    newCenter.x = mod(newCenter.x + halfSize, uGrassDistance) - halfSize;
    newCenter.y = mod(newCenter.y + halfSize, uGrassDistance) - halfSize; // Y considered as Z
    vec4 modelCenter = modelMatrix * vec4(newCenter.x, 0.0, newCenter.y, 1.0);

    // Move grass to center
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    modelPosition.xz += newCenter; // Y considered as Z

    // Rotate blade to face camera
    float angleToCamera = atan(modelCenter.x - cameraPosition.x, modelCenter.z - cameraPosition.z);
    modelPosition.xz = getRotatePivot2d(modelPosition.xz, angleToCamera, modelCenter.xz);

    // Terrains data
    vec2 terrainAUv = (modelPosition.xz - uTerrainAOffset.xy) / uTerrainSize;
    vec2 terrainBUv = (modelPosition.xz - uTerrainBOffset.xy) / uTerrainSize;
    vec2 terrainCUv = (modelPosition.xz - uTerrainCOffset.xy) / uTerrainSize;
    vec2 terrainDUv = (modelPosition.xz - uTerrainDOffset.xy) / uTerrainSize;

    float fragmentSize = 1.0 / uTerrainTextureSize;
    vec4 terrainAColor = texture2D(uTerrainATexture, terrainAUv * (1.0 - fragmentSize) + fragmentSize * 0.5);
    vec4 terrainBColor = texture2D(uTerrainBTexture, terrainBUv * (1.0 - fragmentSize) + fragmentSize * 0.5);
    vec4 terrainCColor = texture2D(uTerrainCTexture, terrainCUv * (1.0 - fragmentSize) + fragmentSize * 0.5);
    vec4 terrainDColor = texture2D(uTerrainDTexture, terrainDUv * (1.0 - fragmentSize) + fragmentSize * 0.5);

    vec4 terrainData = vec4(0);
    terrainData += step(0.0, terrainAUv.x) * step(terrainAUv.x, 1.0) * step(0.0, terrainAUv.y) * step(terrainAUv.y, 1.0) * terrainAColor;
    terrainData += step(0.0, terrainBUv.x) * step(terrainBUv.x, 1.0) * step(0.0, terrainBUv.y) * step(terrainBUv.y, 1.0) * terrainBColor;
    terrainData += step(0.0, terrainCUv.x) * step(terrainCUv.x, 1.0) * step(0.0, terrainCUv.y) * step(terrainCUv.y, 1.0) * terrainCColor;
    terrainData += step(0.0, terrainDUv.x) * step(terrainDUv.x, 1.0) * step(0.0, terrainDUv.y) * step(terrainDUv.y, 1.0) * terrainDColor;

    vec3 normal = terrainData.rgb;

    modelPosition.y += terrainData.a;
    modelCenter.y += terrainData.a;

    // Slope
    float slope = 1.0 - abs(dot(vec3(0.0, 1.0, 0.0), normal));

    // Attenuation
    float distanceScale = getGrassAttenuation(modelCenter.xz);
    float slopeScale = smoothstep(remap(slope, 0.4, 0.5, 1.0, 0.0), 0.0, 1.0);
    float biomeScale = smoothstep(2.5, 7.0, terrainData.a) * (1.0 - smoothstep(17.0, 26.0, terrainData.a));
    float scale = distanceScale * slopeScale * biomeScale;
    modelPosition.xyz = mix(modelCenter.xyz, modelPosition.xyz, scale);

    // Tipness
    float tipness = step(2.0, mod(float(gl_VertexID) + 1.0, 3.0));

    // Wind
    vec2 noiseUv = modelPosition.xz * 0.02 + uWindTime * 0.05;
    vec4 noiseColor = texture2D(uNoiseTexture, noiseUv);
    float windAmplitude = mix(0.4, 1.6, uWindStrength) * tipness * scale;
    modelPosition.x += (noiseColor.x - 0.5) * windAmplitude;
    modelPosition.z += (noiseColor.y - 0.5) * windAmplitude;

    // Player push-away
    vec2 toPlayer = modelCenter.xz - uPlayerPosition.xz;
    float distanceToPlayer = length(toPlayer);
    float push = 1.0 - smoothstep(0.0, uPlayerPushRadius, distanceToPlayer);
    float pushHeightAttenuation = 1.0 - smoothstep(0.6, 2.5, uPlayerPosition.y - modelCenter.y);
    push *= pushHeightAttenuation * uPlayerPushStrength * tipness * scale;
    modelPosition.xz += normalize(toPlayer + vec2(0.0001)) * push;
    modelPosition.y -= push * 0.4;

    // Final position
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;
    
    vec3 viewDirection = normalize(modelPosition.xyz - cameraPosition);
    // vec3 normal = vec3(0.0, 1.0, 0.0);
    vec3 worldNormal = normalize(mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * normal);
    vec3 viewNormal = normalize(normalMatrix * normal);

    // Grass color, biome-blended from the shared corridor texture (G/B weights)
    float corridorUv = clamp((modelPosition.z - uCorridorZMin) / uCorridorZRange, 0.0, 1.0);
    vec4 corridorData = texture2D(uCorridorTexture, vec2(corridorUv, 0.5));
    vec3 bw = vec3(1.0 - corridorData.g - corridorData.b, corridorData.g, corridorData.b);
    vec3 uGrassDefaultColor = uGrassColors[0] * bw.x + uGrassColors[1] * bw.y + uGrassColors[2] * bw.z;
    vec3 uGrassShadedColor = uGrassDefaultColor / 1.3;
    vec3 lowColor = mix(uGrassShadedColor, uGrassDefaultColor, 1.0 - scale); // Match the terrain
    vec3 color = mix(lowColor, uGrassDefaultColor, tipness);

    // Time of day tint
    color = getTimeOfDayColor(color);

    // Sun shade
    float sunShade = getSunShade(normal);
    color = getSunShadeColor(color, sunShade);

    // Sun reflection
    float sunReflection = getSunReflection(viewDirection, worldNormal, viewNormal);
    color = getSunReflectionColor(color, sunReflection);

    vColor = color;
    // vColor = vec3(slope);
}
