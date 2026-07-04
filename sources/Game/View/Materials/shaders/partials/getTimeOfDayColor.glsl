vec3 getTimeOfDayColor(vec3 baseColor)
{
    float sunY = uSunPosition.y;

    // Golden hour: sun near the horizon on the day side
    float golden = smoothstep(0.35, 0.05, abs(sunY)) * smoothstep(- 0.15, 0.05, sunY);
    vec3 color = mix(baseColor, vec3(0.70, 0.52, 0.22), golden * 0.7);

    // Night: cooler and desaturated (sun shading darkens further)
    float night = smoothstep(0.05, - 0.25, sunY);
    color = mix(color, vec3(0.12, 0.18, 0.24), night * 0.5);

    return color;
}
