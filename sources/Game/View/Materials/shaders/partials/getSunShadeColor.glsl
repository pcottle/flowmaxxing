vec3 getSunShadeColor(vec3 baseColor, float sunShade)
{
    // Cel bands: lit / midtone / shade, narrow smoothsteps for AA
    float cel = smoothstep(0.35, 0.40, sunShade) * 0.55 + smoothstep(0.62, 0.67, sunShade) * 0.45;
    vec3 shadeColor = baseColor * vec3(0.50, 0.55, 0.82);
    return mix(baseColor, shadeColor, cel);
}
