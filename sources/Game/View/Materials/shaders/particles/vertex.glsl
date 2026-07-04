uniform float uTime;
uniform float uSizeScale;
uniform vec3 uColor;
uniform vec3 uSunPosition;

attribute vec3 aVelocity;
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSize;

varying float vProgress;
varying vec3 vColor;

#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;

void main()
{
    float age = uTime - aSpawnTime;
    float progress = age / aLifetime;

    // Damped outward drift with a slight upward float
    vec3 newPosition = position + aVelocity * age * (1.0 - min(progress, 1.0) * 0.6);
    newPosition.y += age * 0.35;

    vec4 viewPosition = viewMatrix * modelMatrix * vec4(newPosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    // Grow over life, perspective attenuation
    gl_PointSize = aSize * mix(0.6, 1.6, min(progress, 1.0)) * uSizeScale / - viewPosition.z;

    // Clip out dead particles
    if(progress >= 1.0 || progress < 0.0)
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);

    // Shade like the grass so puffs match the time of day
    float sunShade = getSunShade(vec3(0.0, 1.0, 0.0));
    vColor = getSunShadeColor(uColor, sunShade);
    vProgress = progress;
}
