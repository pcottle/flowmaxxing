uniform float uTime;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uFoamColor;
uniform vec3 uSunPosition;
uniform float uOceanRampWidth;
uniform sampler2D uFogTexture;
uniform sampler2D uShoreTexture;
uniform float uShoreZMin;
uniform float uShoreZRange;
uniform float uFoamCellSize;
uniform float uWaveFoamWidth0;
uniform float uWaveFoamWidth1;
uniform float uWaveFoamIntensity0;
uniform float uWaveFoamIntensity1;

varying vec3 vWorldPosition;
varying float vShoreDistance;
varying vec4 vClipPosition;
varying float vViewDepth;
varying vec2 vWaveJitter;
varying float vCrestSlope;

#include ../partials/getFogColor.glsl;
#include ../partials/getTimeOfDayColor.glsl;
#include ../partials/perlin2d.glsl;

void main()
{
    // Faceted normal from screen-space derivatives — the flat-shaded low-poly look
    vec3 faceNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    faceNormal *= sign(faceNormal.y);

    float d = vShoreDistance;

    // Posterized shallow → deep color bands
    float depthBlend = smoothstep(0.0, uOceanRampWidth, d);
    depthBlend = floor(depthBlend * 4.0 + 0.5) / 4.0;
    vec3 color = mix(uShallowColor, uDeepColor, depthBlend);
    float alpha = mix(0.62, 0.94, depthBlend);

    // Foam evaluated at snapped cell centers → chunky hard-edged foam polygons
    vec2 cellCenter = (floor(vWorldPosition.xz / uFoamCellSize) + 0.5) * uFoamCellSize;
    float cellUvZ = clamp((cellCenter.y - uShoreZMin) / uShoreZRange, 0.0, 1.0);
    float cellShoreX = texture2D(uShoreTexture, vec2(cellUvZ, 0.5)).r;
    float cellD = cellCenter.x - cellShoreX;
    float cellNoise = perlin2d(cellCenter * 0.16 + vec2(uTime * 0.35, uTime * 0.1));

    // Waterline surf band, cell-notched edge
    float surfWidth = 4.5 + cellNoise * 3.5 + sin(uTime * 0.7 + cellCenter.y * 0.045) * 2.0;
    float foam = step(cellD, surfWidth);

    // Whitewater bore after each break
    float bore0 = step(cellD - vWaveJitter.x, uWaveFoamWidth0) * step(0.05, uWaveFoamIntensity0);
    float bore1 = step(cellD - vWaveJitter.y, uWaveFoamWidth1) * step(0.05, uWaveFoamIntensity1);
    foam = max(foam, max(bore0, bore1) * step(- 0.5, cellNoise));

    // Solid crest band on the steep face of a set wave
    foam = max(foam, step(0.075, vCrestSlope));

    color = mix(color, uFoamColor, foam);
    alpha = mix(alpha, 0.97, foam);

    // Fade at the sand so the plane has no hard edge
    alpha *= smoothstep(- 3.0, 1.5, d);

    color = getTimeOfDayColor(color);

    // Per-facet sun shade + glint → sparkling faceted water
    float facetShade = dot(faceNormal, - uSunPosition) * 0.5 + 0.5;
    color *= mix(1.12, 0.82, facetShade);

    vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
    float glint = pow(max(0.0, dot(reflect(normalize(uSunPosition), faceNormal), viewDirection)), 30.0);
    color = mix(color, vec3(1.0), clamp(glint, 0.0, 1.0) * 0.7);

    // Fog
    vec2 screenUv = (vClipPosition.xy / vClipPosition.w) * 0.5 + 0.5;
    color = getFogColor(color, vViewDepth, screenUv);

    gl_FragColor = vec4(color, alpha);
}
