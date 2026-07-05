uniform float uOpacity;

varying float vProgress;
varying vec3 vColor;
varying vec3 vHighlightColor;
varying float vRotation;
varying float vStretch;
varying float vType;

void main()
{
    vec2 local = gl_PointCoord - vec2(0.5);
    float angleCos = cos(vRotation);
    float angleSin = sin(vRotation);
    local = mat2(angleCos, - angleSin, angleSin, angleCos) * local;
    local.x *= vStretch;

    float along = abs(local.x);
    float curve = sin((local.x + 0.5) * 3.14159) * 0.055;
    float stroke = abs(local.y - curve);
    float taper = smoothstep(0.62, 0.2, along);
    float alpha = smoothstep(0.065, 0.012, stroke) * taper;
    alpha += smoothstep(0.035, 0.0, abs(local.y + curve * 0.55)) * smoothstep(0.32, 0.12, along) * 0.35;
    alpha *= smoothstep(0.0, 0.1, vProgress);
    alpha *= 1.0 - smoothstep(0.35, 1.0, vProgress);

    float headGlow = smoothstep(-0.35, 0.5, local.x);
    float centerGlow = smoothstep(0.08, 0.0, abs(local.y - curve));
    vec3 color = mix(vColor, vHighlightColor, clamp(headGlow * 0.65 + centerGlow * 0.35, 0.0, 1.0));

    // Spray puff: small crisp white disc (soft blobs read as smoke)
    float puffAlpha = smoothstep(0.4, 0.3, length(gl_PointCoord - vec2(0.5))) * 0.9;
    puffAlpha *= smoothstep(0.0, 0.08, vProgress);
    puffAlpha *= 1.0 - smoothstep(0.35, 1.0, vProgress);
    vec3 puffColor = mix(vHighlightColor, vec3(1.0), 0.6);

    color = mix(color, puffColor, vType);
    alpha = mix(alpha, puffAlpha, vType);

    gl_FragColor = vec4(color, alpha * uOpacity);
}
