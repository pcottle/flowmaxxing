uniform float uOpacity;

varying float vProgress;
varying vec3 vColor;
varying vec3 vHighlightColor;
varying vec3 vSandColor;
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

    float isPuff = step(0.5, vType) * (1.0 - step(1.5, vType));
    float isCurl = step(1.5, vType) * (1.0 - step(2.5, vType));
    float isSand = step(2.5, vType);

    // Shapes are hard-edged (toon); only the in/out is a short temporal fade
    float fadeIn = smoothstep(0.0, 0.08, vProgress);
    float fadeOut = 1.0 - smoothstep(0.7, 1.0, vProgress);

    // Wind streak: curved brush stroke, thresholded into a crisp mark
    float along = abs(local.x);
    float curve = sin((local.x + 0.5) * 3.14159) * 0.055;
    float stroke = abs(local.y - curve);
    float taper = smoothstep(0.62, 0.2, along);
    float streakShape = smoothstep(0.065, 0.012, stroke) * taper;
    streakShape += smoothstep(0.035, 0.0, abs(local.y + curve * 0.55)) * smoothstep(0.32, 0.12, along) * 0.35;
    float streakAlpha = step(0.3, streakShape);

    float headGlow = smoothstep(- 0.35, 0.5, local.x);
    float centerGlow = smoothstep(0.08, 0.0, abs(local.y - curve));
    vec3 streakColor = mix(vColor, vHighlightColor, clamp(headGlow * 0.65 + centerGlow * 0.35, 0.0, 1.0));

    // Spray puff: crisp white disc
    float puffAlpha = step(length(gl_PointCoord - vec2(0.5)), 0.36) * 0.9;
    vec3 puffColor = mix(vHighlightColor, vec3(1.0), 0.6);

    // Sand puff: same crisp disc, kicked-up beach color with a pale crown
    float sandAlpha = step(length(gl_PointCoord - vec2(0.5)), 0.34) * 0.85;
    vec3 sandColor = mix(vSandColor, vec3(1.0), 0.15);

    // Wind curl: trailing line winding into a spinning spiral head — the
    // classic Wind Waker wind glyph
    vec2 spiralCenter = local - vec2(0.18, 0.0);
    float r = length(spiralCenter);
    float theta = atan(spiralCenter.y, spiralCenter.x);
    float spiralPhase = fract(theta / 6.2832 + r * 6.0 - vProgress * 1.4);
    float spiral = step(spiralPhase, 0.24) * step(0.04, r) * step(r, 0.24);
    float tail = step(abs(local.y), 0.032) * step(- 0.55, local.x) * step(local.x, 0.02);
    float curlAlpha = max(spiral, tail) * 0.75;
    vec3 curlColor = vec3(1.0);

    vec3 color = streakColor;
    float alpha = streakAlpha;
    color = mix(color, puffColor, isPuff);
    alpha = mix(alpha, puffAlpha, isPuff);
    color = mix(color, curlColor, isCurl);
    alpha = mix(alpha, curlAlpha, isCurl);
    color = mix(color, sandColor, isSand);
    alpha = mix(alpha, sandAlpha, isSand);

    gl_FragColor = vec4(color, alpha * fadeIn * fadeOut * uOpacity);
}
