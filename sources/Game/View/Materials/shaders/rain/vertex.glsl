uniform float uTime;
uniform float uSizeScale;
uniform vec3 uCenter;
uniform vec3 uArea;
uniform float uFallSpeed;
uniform vec2 uWindSlant;
uniform float uIntensity;
uniform float uSize;

attribute vec3 aOffset;
attribute float aSpeed;
attribute float aSize;
attribute float aPhase;

varying float vRotation;

void main()
{
    // World-anchored wrapping column: each drop falls forever in world space
    // and gets wrapped into a box around the player, so streaks stay put
    // while the player dashes instead of swimming with the camera
    vec3 base = aOffset * uArea;
    base.y -= uTime * uFallSpeed * aSpeed;
    base.xz += uTime * uWindSlant * aSpeed;

    vec3 local = mod(base - uCenter + uArea * 0.5, uArea) - uArea * 0.5;
    vec3 worldPosition = uCenter + local;
    worldPosition.y += uArea.y * 0.25;

    vec4 viewPosition = viewMatrix * modelMatrix * vec4(worldPosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    // Align the streak with the screen-projected fall direction
    vec3 fallDirection = normalize(vec3(uWindSlant.x, - uFallSpeed, uWindSlant.y));
    vec4 projectedHead = projectionMatrix * viewMatrix * modelMatrix * vec4(worldPosition + fallDirection * 0.5, 1.0);
    vec2 projectedDirection = projectedHead.xy / projectedHead.w - gl_Position.xy / gl_Position.w;
    vRotation = length(projectedDirection) > 0.0001 ? atan(projectedDirection.y, projectedDirection.x) : - 1.5708;

    gl_PointSize = aSize * uSize * uSizeScale / - viewPosition.z;

    // Density gate: drops pop in one by one as the rain builds
    if(aPhase > uIntensity)
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
