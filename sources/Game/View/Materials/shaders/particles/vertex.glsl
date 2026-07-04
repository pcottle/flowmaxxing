uniform float uTime;
uniform float uSizeScale;
uniform vec3 uColor;
uniform vec3 uHighlightColor;
uniform vec3 uSunPosition;

attribute vec3 aVelocity;
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSize;
attribute float aRotation;
attribute float aStretch;

varying float vProgress;
varying vec3 vColor;
varying vec3 vHighlightColor;
varying float vRotation;
varying float vStretch;

#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;

void main()
{
    float age = uTime - aSpawnTime;
    float progress = age / aLifetime;

    // Damped outward drift with a slight upward float
    float aliveProgress = clamp(progress, 0.0, 1.0);
    vec3 newPosition = position + aVelocity * age * (1.0 - aliveProgress * 0.45);
    newPosition.y += age * 0.55;

    vec4 viewPosition = viewMatrix * modelMatrix * vec4(newPosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    vec3 velocityDirection = normalize(aVelocity + vec3(0.0001));
    vec4 projectedHead = projectionMatrix * viewMatrix * modelMatrix * vec4(newPosition + velocityDirection * 0.35, 1.0);
    vec2 projectedDirection = projectedHead.xy / projectedHead.w - gl_Position.xy / gl_Position.w;

    // Grow over life, perspective attenuation
    gl_PointSize = aSize * mix(0.7, 1.35, aliveProgress) * uSizeScale / - viewPosition.z;

    // Clip out dead particles
    if(progress >= 1.0 || progress < 0.0)
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);

    // Shade like the grass so puffs match the time of day
    float sunShade = getSunShade(vec3(0.0, 1.0, 0.0));
    vColor = getSunShadeColor(uColor, sunShade);
    vHighlightColor = getSunShadeColor(uHighlightColor, sunShade);
    vProgress = progress;
    vRotation = length(projectedDirection) > 0.0001 ? atan(projectedDirection.y, projectedDirection.x) : aRotation;
    vStretch = aStretch;
}
