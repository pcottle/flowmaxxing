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
uniform float uFoamEdgeWidth;
uniform float uFoamLineWidth;
uniform float uFoamGap;
uniform float uRingPeriod;
uniform float uRingMaxD;
uniform float uDashLength;
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

    // Toon foam: crisp white lines with STABLE shapes — all breakup noise is
    // static in space; the only animation is where the lines sit
    float scallop = sin(vWorldPosition.z * 0.35) * 1.1 + sin(vWorldPosition.z * 0.11 + 2.7) * 1.8;

    // Shore edge band: solid white, scalloped edge, slow width breathe
    float edgeWidth = uFoamEdgeWidth + scallop + sin(uTime * 0.6 + vWorldPosition.z * 0.02) * 0.9;
    float foam = step(d, edgeWidth);

    // Thin outline ring just outside the band (double-line look)
    foam = max(foam, step(abs(d - edgeWidth - uFoamGap), uFoamLineWidth));

    // Drifting contour rings: spawn offshore, drift shoreward, dashes lengthen
    // as they approach until they merge into the edge band
    for(int k = 0; k < 3; k++)
    {
        float phase = fract(uTime / uRingPeriod + float(k) / 3.0);
        float ringD = mix(uRingMaxD, uFoamEdgeWidth, phase);
        float onRing = step(abs(d - ringD + scallop * 0.6), uFoamLineWidth);
        float gen = floor(uTime / uRingPeriod + float(k) / 3.0);
        float cell = floor(vWorldPosition.z / uDashLength) + float(k) * 61.0 + gen * 17.0;
        float h = fract(sin(cell * 127.1) * 43758.5453);
        float coverage = smoothstep(0.0, 0.4, phase) * 0.85;
        foam = max(foam, onRing * step(h, coverage));
    }

    // Whitewater bore after each break: scalloped trailing edge, static dash notches
    float boreCell = floor(vWorldPosition.z / uDashLength);
    float boreHash = fract(sin(boreCell * 269.5) * 43758.5453);
    float boreNotch = step(boreHash, 0.8);
    float bore0 = step(d - vWaveJitter.x + scallop * 0.5, uWaveFoamWidth0) * step(0.05, uWaveFoamIntensity0);
    float bore1 = step(d - vWaveJitter.y + scallop * 0.5, uWaveFoamWidth1) * step(0.05, uWaveFoamIntensity1);
    foam = max(foam, max(bore0, bore1) * boreNotch);

    // Solid crest band on the steep face of a set wave, scalloped threshold
    foam = max(foam, step(0.075 + scallop * 0.004, vCrestSlope));

    // Fade at the sand so the plane has no hard edge
    alpha *= smoothstep(- 3.0, 1.5, d);

    color = getTimeOfDayColor(color);

    // Per-facet sun shade + glint → sparkling faceted water
    float facetShade = dot(faceNormal, - uSunPosition) * 0.5 + 0.5;
    color *= mix(1.12, 0.82, facetShade);

    vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
    float glint = pow(max(0.0, dot(reflect(normalize(uSunPosition), faceNormal), viewDirection)), 30.0);
    color = mix(color, vec3(1.0), clamp(glint, 0.0, 1.0) * 0.7);

    // Foam last, after lighting — flat unshaded white, the toon signature
    color = mix(color, getTimeOfDayColor(uFoamColor), foam);
    alpha = mix(alpha, 0.97 * smoothstep(- 3.0, 1.5, d), foam);

    // Fog
    vec2 screenUv = (vClipPosition.xy / vClipPosition.w) * 0.5 + 0.5;
    color = getFogColor(color, vViewDepth, screenUv);

    gl_FragColor = vec4(color, alpha);
}
