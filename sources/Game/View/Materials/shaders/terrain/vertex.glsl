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
uniform float uTime;
uniform sampler2D uCorridorTexture;
uniform float uCorridorZMin;
uniform float uCorridorZRange;
uniform vec3 uSandColors[3];
uniform vec3 uGrassColors[3];
uniform vec3 uRockColors[3];
uniform sampler2D uWaveTexture;
uniform float uUprush0;
uniform float uUprush1;
uniform float uUprushJitterScale;
uniform float uWetLine;
uniform float uWetFresh;

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

    // Biome palette from the shared 1D corridor texture
    // (R = shoreX, G = volcanic weight, B = savanna weight, A = headland)
    float corridorUv = clamp((modelPosition.z - uCorridorZMin) / uCorridorZRange, 0.0, 1.0);
    vec4 corridorData = texture2D(uCorridorTexture, vec2(corridorUv, 0.5));
    float shoreX = corridorData.r;
    vec3 bw = vec3(1.0 - corridorData.g - corridorData.b, corridorData.g, corridorData.b);

    vec3 sandColor = uSandColors[0] * bw.x + uSandColors[1] * bw.y + uSandColors[2] * bw.z;
    vec3 grassBaseColor = uGrassColors[0] * bw.x + uGrassColors[1] * bw.y + uGrassColors[2] * bw.z;
    vec3 rockColor = uRockColors[0] * bw.x + uRockColors[1] * bw.y + uRockColors[2] * bw.z;
    vec3 wetSandColor = sandColor * 0.62;
    vec3 uGrassDefaultColor = grassBaseColor;
    vec3 uGrassShadedColor = grassBaseColor / 1.3;
    vec3 alpineColor = mix(vec3(0.38, 0.48, 0.36), rockColor, bw.y * 0.6);
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

    // Offshore geometry (sea stacks) is rock, not sand/grass, even on flat tops
    float seawardDistance = modelPosition.x - shoreX;
    float offshoreRock = smoothstep(6.0, 18.0, seawardDistance) * smoothstep(0.3, 1.5, elevation);
    rockBlend = max(rockBlend, offshoreRock);
    float snowCoverage = snowBlend * (1.0 - smoothstep(0.45, 0.75, slope) * 0.65);

    vec3 color = mix(beachColor, grassColor, grassBlend);
    color = mix(color, alpineColor, alpineBlend * (1.0 - snowCoverage));
    color = mix(color, rockColor, rockBlend);
    color = mix(color, snowColor, snowCoverage);

    // Waterline: wet sand and foam, driven by the CPU wave-set phase so the
    // uprush surges up the beach exactly when a water wave arrives (sea level = 0)
    float flatness = 1.0 - smoothstep(0.25, 0.5, slope);
    vec2 waveJitter = texture2D(uWaveTexture, vec2(corridorUv, 0.5)).rg;

    float lapEdge = 0.15 + sin(uTime * 0.6 + modelPosition.z * 0.02) * 0.25;
    float uprush0 = uUprush0 > 0.01 ? uUprush0 + waveJitter.x * uUprushJitterScale : 0.0;
    float uprush1 = uUprush1 > 0.01 ? uUprush1 + waveJitter.y * uUprushJitterScale : 0.0;
    float waveEdge = max(lapEdge, max(uprush0, uprush1));

    // Wet band extends to the slowly-receding wet line; fresh waves darken it more
    float wetTarget = max(waveEdge, uWetLine);
    float wetness = (1.0 - smoothstep(wetTarget, wetTarget + 0.6, elevation)) * flatness;
    color = mix(color, wetSandColor * 0.75, wetness * (0.55 + 0.45 * uWetFresh));

    // Subtle waterline foam on the sand: a stable dashed line that only moves
    // with the wave edge — the water plane carries the real foam show
    float foamBand = 1.0 - step(0.16, abs(elevation - waveEdge));
    float foamRand = fract(sin(floor(modelPosition.z / 3.0) * 127.1) * 43758.5453);
    float foam = foamBand * step(foamRand, 0.45);
    color = mix(color, vec3(0.95, 0.97, 0.96), foam * flatness * 0.55);

    // Time of day tint
    color = getTimeOfDayColor(color);

    // Sun shade
    float sunShade = getSunShade(normal);
    color = getSunShadeColor(color, sunShade);

    // Sun reflection
    float sunReflection = getSunReflection(viewDirection, worldNormal, viewNormal);
    color = getSunReflectionColor(color, sunReflection);

    // Wet-sand gloss: dedicated grazing-angle specular, strongest at golden hour
    float sunLow = smoothstep(0.4, 0.06, uSunPosition.y) * smoothstep(- 0.1, 0.02, uSunPosition.y);
    float wetSpec = pow(max(0.0, dot(reflect(uSunPosition, viewNormal), viewDirection)), 10.0) * (1.0 + dot(viewDirection, worldNormal));
    float gloss = wetSpec * 1.4 * wetness * sunLow;
    color = mix(color, vec3(1.0, 0.95, 0.85), clamp(gloss, 0.0, 1.0));

    // Fog
    vec2 screenUv = (gl_Position.xy / gl_Position.w * 0.5) + 0.5;
    color = getFogColor(color, depth, screenUv);

    // vec3 dirtColor = vec3(0.3, 0.2, 0.1);
    // vec3 color = mix(dirtColor, grassColor, terrainData.g);

    // Varyings
    vColor = color;
}
