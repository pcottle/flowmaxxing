/**
 * Shared corridor profile math, imported by BOTH the terrain worker and the
 * main thread (State/Terrains) so the two can never drift apart.
 *
 * Everything here uses FIXED octave counts: chunk LOD varies the FBM detail
 * octaves, so any structural feature (shoreline, biomes, coves) must not
 * depend on iteration count or it pops between LODs.
 *
 * corridorOffsets allocation: 0-1 meander, 2 mountain scale, 3-4 ridges,
 * 5-6 mounds, 7-8 biome selector, 9-10 cove/headland, 11 terrace jitter,
 * 12-13 sea stacks, 14 stack height, 15 highland basin.
 */

const linearStep = (edgeMin, edgeMax, value) =>
{
    return Math.max(0.0, Math.min(1.0, (value - edgeMin) / (edgeMax - edgeMin)))
}

const smoothStep = (edgeMin, edgeMax, value) =>
{
    const t = linearStep(edgeMin, edgeMax, value)
    return t * t * (3 - 2 * t)
}

const getBiomeSelector = (noise, z, corridor, offsets) =>
{
    return noise.noise2D(z * corridor.biomeFrequency + offsets[7][0], offsets[7][1]) * 0.75
        + noise.noise2D(z * corridor.biomeFrequency * 2.3 + offsets[8][0], offsets[8][1]) * 0.25
}

const getVolcanicWeight = (b, corridor) =>
{
    return 1 - smoothStep(corridor.biomeEdgeVolcanic - corridor.biomeBlendWidth, corridor.biomeEdgeVolcanic + corridor.biomeBlendWidth, b)
}

const getSavannaWeight = (b, corridor) =>
{
    return smoothStep(corridor.biomeEdgeSavanna - corridor.biomeBlendWidth, corridor.biomeEdgeSavanna + corridor.biomeBlendWidth, b)
}

// Weights for [golden, volcanic, savanna], C1-smooth, summing to 1
export const getBiomeWeights = (noise, z, corridor, offsets) =>
{
    const b = getBiomeSelector(noise, z, corridor, offsets)
    const wVolcanic = getVolcanicWeight(b, corridor)
    const wSavanna = getSavannaWeight(b, corridor)

    return [1 - wVolcanic - wSavanna, wVolcanic, wSavanna]
}

const getCoveValue = (noise, z, corridor, offsets) =>
{
    return noise.noise2D(z * corridor.coveFrequency + offsets[9][0], offsets[9][1]) * 0.7
        + noise.noise2D(z * corridor.coveFrequency * 2.6 + offsets[10][0], offsets[10][1]) * 0.3
}

const getShoreXForHeadland = (noise, z, corridor, offsets, headland) =>
{
    // Shoreline meander, damped at headlands so pinch-points stay narrow
    const meanderAmplitude = corridor.shoreMeanderAmplitude * (1 - corridor.headlandMeanderDamp * headland)
    const m1 = noise.noise2D(z * corridor.shoreMeanderFrequency + offsets[0][0], offsets[0][1])
    const m2 = noise.noise2D(z * corridor.shoreMeanderFrequency * 2.7 + offsets[1][0], offsets[1][1])
    return corridor.shoreBaseX + meanderAmplitude * (m1 * 0.8 + m2 * 0.2)
}

/**
 * Shoreline x only — 4 noise calls, no biome blends, no allocation. For the
 * many per-frame main-thread callers that discard everything but shoreX.
 */
export const getShoreX = (noise, z, corridor, offsets) =>
{
    const headland = smoothStep(0.1, 0.8, getCoveValue(noise, z, corridor, offsets))
    return getShoreXForHeadland(noise, z, corridor, offsets, headland)
}

/**
 * Shore band scalars (shoreX, biome weights, headland) written into `out` —
 * the per-frame water texture refresh takes 256 of these, so no allocation.
 */
export const getShoreSampleInto = (noise, z, corridor, offsets, out) =>
{
    const b = getBiomeSelector(noise, z, corridor, offsets)
    const headland = smoothStep(0.1, 0.8, getCoveValue(noise, z, corridor, offsets))

    out.shoreX = getShoreXForHeadland(noise, z, corridor, offsets, headland)
    out.wVolcanic = getVolcanicWeight(b, corridor)
    out.wSavanna = getSavannaWeight(b, corridor)
    out.headland = headland

    return out
}

/**
 * All z-dependent corridor values for one row: shoreline, biome-blended zone
 * params, cove/headland modulation. Blend amplitudes/distances only — never
 * frequencies (blending a frequency sampled at fixed offsets sweeps the phase
 * along z and smears features).
 */
export const getCorridorProfile = (noise, z, corridor, offsets, biomes) =>
{
    const weights = getBiomeWeights(noise, z, corridor, offsets)

    const blend = (key) =>
    {
        let value = 0

        for(let i = 0; i < biomes.length; i++)
        {
            const override = biomes[i].overrides[key]
            value += weights[i] * (override !== undefined ? override : corridor[key])
        }

        return value
    }

    // Coves / headlands: positive extremes push the mountain wall toward the shore
    const c = getCoveValue(noise, z, corridor, offsets)
    const coveShaped = Math.sign(c) * Math.pow(Math.abs(c), 1.3)
    const headland = smoothStep(0.1, 0.8, c)

    const shoreX = getShoreXForHeadland(noise, z, corridor, offsets, headland)

    const beachWidth = blend('beachWidth')
    const baseStart = blend('mountainStartDistance')
    const wallWidth = blend('mountainFullDistance') - baseStart
    const mountainStart = Math.max(
        baseStart - corridor.coveAmplitude * coveShaped,
        beachWidth + corridor.minPassGap
    )
    const mountainFull = mountainStart + wallWidth
    const highlandStart = Math.max(blend('highlandStartDistance'), mountainFull + 30)
    const highlandFull = Math.max(blend('highlandFullDistance'), highlandStart + 30)

    return {
        weights,
        headland,
        shoreX,
        beachWidth,
        beachTopHeight: blend('beachTopHeight'),
        hillsWidth: blend('hillsWidth'),
        hillsHeight: blend('hillsHeight'),
        mountainStart,
        mountainFull,
        mountainHeight: blend('mountainHeight'),
        ridgeAmplitude: blend('ridgeAmplitude'),
        highlandStart,
        highlandFull,
        highlandHeight: blend('highlandHeight'),
        highlandBowlDepth: blend('highlandBowlDepth'),
        highlandUndulation: blend('highlandUndulation'),
        highlandRidgeAmplitude: blend('highlandRidgeAmplitude'),
        highlandDetail: blend('highlandDetail'),
        moundHeight: blend('moundHeight'),
        oceanDepth: blend('oceanDepth'),
        hillsDetail: blend('hillsDetail'),
        terraceStrength: blend('terraceStrength'),
        mountainScale: 1 + 0.35 * noise.noise2D(z * 0.0012 + offsets[2][0], offsets[2][1])
    }
}
