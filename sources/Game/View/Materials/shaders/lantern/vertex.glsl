uniform float uTime;
uniform float uSizeScale;
uniform float uSize;

attribute float aPhase;
attribute float aFlickerSpeed;
attribute float aSize;
attribute float aAlpha;

varying float vPhase;
varying float vFlickerSpeed;
varying float vAlpha;

void main()
{
    vec4 viewPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = aSize * uSize * uSizeScale / - viewPosition.z;

    vPhase = aPhase;
    vFlickerSpeed = aFlickerSpeed;
    vAlpha = aAlpha;

    // Released lanterns park far below the beach
    if(position.y < - 500.0)
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
