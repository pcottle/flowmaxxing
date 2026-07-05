// Breaking-wave bump: asymmetric gaussian with a steep shoreward face.
// d = jitter-corrected shore distance, front/amplitude/width/d0 from CPU WaveSets.
// slope = dHeight/dDistance (for normals and crest-foam masks).
float getWaveBump(float d, float front, float amplitude, float width, float d0, out float slope)
{
    float dj = d - front;
    float w = width * mix(0.5, 1.0, front / d0);
    float wSide = w * mix(0.55, 1.45, smoothstep(- w, w, dj));
    float rel = dj / wSide;
    float height = amplitude * exp(- rel * rel);
    slope = - 2.0 * dj / (wSide * wSide) * height;

    return height;
}
