uniform sampler2D uSkyTexture;
uniform vec2 uSunScreen;
uniform float uGate;
uniform float uIntensity;
uniform float uDecay;
uniform float uThreshold;
uniform float uRadius;
uniform vec3 uColor;
uniform float uAspect;

varying vec2 vUv;

void main()
{
    // March toward the sun through the sky render target: bright warm texels
    // (the posterized sun halo) feed the ray, cloud texels carve gaps —
    // crepuscular shafts for free since clouds live in the same texture
    const int TAPS = 20;
    vec2 toSun = (uSunScreen - vUv) / float(TAPS);

    float illumination = 0.0;
    float weight = 1.0;
    float totalWeight = 0.0;
    vec2 uv = vUv;

    for(int i = 0; i < TAPS; i++)
    {
        uv += toSun;
        vec3 skySample = texture2D(uSkyTexture, uv).rgb;
        float luma = dot(skySample, vec3(0.299, 0.587, 0.114));
        float warmth = clamp((skySample.r - skySample.b) * 2.0, 0.0, 1.0);
        float bright = smoothstep(uThreshold, uThreshold + 0.15, luma * (0.4 + 0.6 * warmth));
        illumination += bright * weight;
        totalWeight += weight;
        weight *= uDecay;
    }

    illumination /= totalWeight;

    // Radial falloff so shafts stay a fan around the sun, not a screen wash
    vec2 d = (vUv - uSunScreen) * vec2(uAspect, 1.0);
    illumination *= 1.0 - smoothstep(uRadius * 0.4, uRadius, length(d));

    // Posterize into hard bands — toon shafts, not a smooth glow
    float bands = step(0.2, illumination) * 0.35
                + step(0.45, illumination) * 0.35
                + step(0.7, illumination) * 0.3;

    float alpha = bands * uIntensity * uGate;

    if(alpha < 0.004)
        discard;

    gl_FragColor = vec4(uColor, alpha);
}
