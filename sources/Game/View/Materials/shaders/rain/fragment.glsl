uniform vec3 uColor;
uniform float uOpacity;

varying float vRotation;

void main()
{
    // Rotate the sprite so +x runs along the fall direction
    vec2 centered = gl_PointCoord - 0.5;
    float cosR = cos(- vRotation);
    float sinR = sin(- vRotation);
    vec2 local = vec2(
        centered.x * cosR - centered.y * sinR,
        centered.x * sinR + centered.y * cosR
    );

    // Flat one-tone hard streak, no gradients
    float alpha = step(abs(local.y), 0.03) * step(abs(local.x), 0.42);
    alpha *= uOpacity;

    if(alpha < 0.01)
        discard;

    gl_FragColor = vec4(uColor, alpha);
}
