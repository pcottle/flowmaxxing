uniform float uTime;
uniform sampler2D uShoreTexture;
uniform sampler2D uWaveTexture;
uniform float uShoreZMin;
uniform float uShoreZRange;
uniform float uWaveD0;
uniform float uWaveWidth;
uniform float uWaveFront0;
uniform float uWaveFront1;
uniform float uWaveAmp0;
uniform float uWaveAmp1;

varying vec3 vWorldPosition;
varying float vShoreDistance;
varying vec4 vClipPosition;
varying float vViewDepth;
varying vec2 vWaveJitter;
varying float vCrestSlope;

#include ../partials/getWaveBump.glsl;

void main()
{
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);

    // Shoreline X for this row, exact match with the terrain worker via the data texture
    float shoreUv = clamp((modelPosition.z - uShoreZMin) / uShoreZRange, 0.0, 1.0);
    float shoreX = texture2D(uShoreTexture, vec2(shoreUv, 0.5)).r;
    float shoreDistance = modelPosition.x - shoreX;

    // Ambient waves travel toward the shore (-X), flattening as they arrive.
    // Shading is per-facet in the fragment shader, so only heights matter here
    float attenuation = smoothstep(- 2.0, 40.0, shoreDistance);

    float k1 = 6.2831 / 30.0;
    float k2 = 6.2831 / 13.0;
    float k3 = 6.2831 / 5.5;
    float p1 = modelPosition.x * k1 + uTime * 1.0 + sin(modelPosition.z * 0.05) * 2.0;
    float p2 = modelPosition.x * k2 + uTime * 1.6 + modelPosition.z * 0.08;
    float p3 = modelPosition.x * k3 + uTime * 2.4 - modelPosition.z * 0.13;

    modelPosition.y += (sin(p1) * 0.22 + sin(p2) * 0.12 + sin(p3) * 0.05) * attenuation;

    // Breaking wave sets (phase computed on the CPU in State/WaveSets):
    // localized traveling bumps with their own shore attenuation — they must
    // survive right up to the break at d ≈ 6, unlike the ambient sines
    vec2 waveJitter = texture2D(uWaveTexture, vec2(shoreUv, 0.5)).rg;
    float setAttenuation = smoothstep(0.0, 6.0, shoreDistance);

    float slope0;
    float slope1;
    float setHeight0 = getWaveBump(shoreDistance - waveJitter.x, uWaveFront0, uWaveAmp0, uWaveWidth, uWaveD0, slope0) * setAttenuation;
    float setHeight1 = getWaveBump(shoreDistance - waveJitter.y, uWaveFront1, uWaveAmp1, uWaveWidth, uWaveD0, slope1) * setAttenuation;

    modelPosition.y += setHeight0 + setHeight1;

    // Positive slope = the steep shoreward face of a set wave (for crest foam)
    vCrestSlope = (max(0.0, slope0) + max(0.0, slope1)) * setAttenuation;
    vWaveJitter = waveJitter;

    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;

    vWorldPosition = modelPosition.xyz;
    vShoreDistance = shoreDistance;
    vClipPosition = gl_Position;
    vViewDepth = - viewPosition.z;
}
