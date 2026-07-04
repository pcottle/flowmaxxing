attribute float aAlpha;

varying float vAlpha;

void main()
{
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    vAlpha = aAlpha;
}
