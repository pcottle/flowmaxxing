uniform float uVisibility;

varying vec2 vUv;

void main()
{
    // Aspect-corrected local frame (the plane is 2:1) so the arc stays
    // circular: x spans -1..1, y spans 0..1 from the plane's bottom edge
    vec2 local = vec2((vUv.x - 0.5) * 2.0, vUv.y);

    // Arc around a center just below the bottom edge — apex high, legs
    // landing inside the plane's lower corners
    float radius = distance(local, vec2(0.0, - 0.15));
    float band = (radius - 0.72) / 0.24;

    if(band < 0.0 || band >= 1.0)
        discard;

    // Hard-banded WW pastels, inner violet to outer red, no gradients
    vec3 color = vec3(0.61, 0.5, 0.9); // violet (inner)
    color = mix(color, vec3(0.45, 0.66, 0.95), step(1.0 / 6.0, band)); // blue
    color = mix(color, vec3(0.52, 0.86, 0.6), step(2.0 / 6.0, band)); // green
    color = mix(color, vec3(0.99, 0.93, 0.52), step(3.0 / 6.0, band)); // yellow
    color = mix(color, vec3(1.0, 0.75, 0.47), step(4.0 / 6.0, band)); // orange
    color = mix(color, vec3(0.98, 0.55, 0.55), step(5.0 / 6.0, band)); // red (outer)

    // Fade the legs near the ground so the arc doesn't hard-clip into terrain
    float alpha = uVisibility * smoothstep(0.02, 0.2, vUv.y);

    gl_FragColor = vec4(color, alpha);
}
