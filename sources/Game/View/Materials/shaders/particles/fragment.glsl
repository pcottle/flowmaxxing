uniform float uOpacity;

varying float vProgress;
varying vec3 vColor;

void main()
{
    float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
    float alpha = smoothstep(0.5, 0.12, distanceToCenter);
    alpha *= smoothstep(0.0, 0.1, vProgress);
    alpha *= 1.0 - smoothstep(0.4, 1.0, vProgress);

    gl_FragColor = vec4(vColor, alpha * uOpacity);
}
