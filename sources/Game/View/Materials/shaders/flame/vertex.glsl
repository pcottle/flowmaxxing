attribute float aPhase;

varying vec2 vUv;
varying float vPhase;

void main()
{
    vUv = uv;
    vPhase = aPhase;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
