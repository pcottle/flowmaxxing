uniform float uTime;
uniform float uSizeScale;
uniform float uSize;
uniform float uDensity;

attribute float aPhase;
attribute float aFlickerSpeed;
attribute float aSize;
attribute float aDensity;

varying float vPhase;
varying float vFlickerSpeed;

void main()
{
    vec4 viewPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = aSize * uSize * uSizeScale / - viewPosition.z;

    vPhase = aPhase;
    vFlickerSpeed = aFlickerSpeed;

    // Density gate: sparks join and leave one by one as the slider moves
    if(aDensity > uDensity)
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
