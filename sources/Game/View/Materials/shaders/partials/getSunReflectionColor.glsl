vec3 getSunReflectionColor(vec3 baseColor, float sunReflection)
{
    // Single clean rim band instead of a smooth gradient
    float rim = smoothstep(0.45, 0.5, clamp(sunReflection, 0.0, 1.0)) * 0.55;
    return mix(baseColor, vec3(1.0, 1.0, 1.0), rim);
}
