uniform float uTime;
uniform float uSize;
uniform float uSizeScale;
uniform float uDensity;

attribute float aPhase;
attribute float aPopSpeed;
attribute float aSize;
attribute float aAngle;
attribute float aDensity;

varying float vAngle;

void main()
{
    vec4 viewPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    // Lifecycle: invisible most of the cycle, then pop -> hold -> shrink
    // inside an 18% window; the pop is quantized into toon size steps
    float cycle = fract(uTime * aPopSpeed + aPhase);
    float life = cycle / 0.18;
    float scale = step(life, 1.0) * min(smoothstep(0.0, 0.2, life), 1.0 - smoothstep(0.5, 1.0, life));
    scale = floor(scale * 3.0 + 0.5) / 3.0;

    gl_PointSize = aSize * uSize * uSizeScale * scale / - viewPosition.z;
    vAngle = aAngle;

    if(scale < 0.01 || aDensity > uDensity || gl_PointSize < 1.0)
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
