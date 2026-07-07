uniform sampler2D uNoiseTexture;
uniform float uWindTime;
uniform float uWindStrength;
uniform float uThickness;
uniform float uSwayCollapse;

attribute float sway;

varying float vViewDepth;
varying vec4 vClipPosition;

void main()
{
    // Inverted hull: inflate along the normal in object space so the outline
    // thickness scales with the instance
    vec3 displaced = position + normal * uThickness;
    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(displaced, 1.0);
    vec4 originPosition = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // Same wind sway as the prop itself so the outline tracks it exactly
    vec2 noiseUv = originPosition.xz * 0.02 + uWindTime * 0.05;
    vec4 noiseColor = texture2D(uNoiseTexture, noiseUv);
    float windAmplitude = mix(0.03, 0.4, uWindStrength) * sway;
    worldPosition.x += (noiseColor.x - 0.5) * windAmplitude;
    worldPosition.z += (noiseColor.y - 0.5) * windAmplitude;

    vec4 viewPosition = viewMatrix * worldPosition;
    vViewDepth = - viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;
    vClipPosition = gl_Position;

    // Collapse open-strip parts (palm fronds) — inverted hulls artifact on
    // open geometry, so those triangles degenerate to nothing
    if(sway > uSwayCollapse)
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
