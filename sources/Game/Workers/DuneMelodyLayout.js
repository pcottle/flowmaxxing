/**
 * Shared dune-melody mogul layout, imported by BOTH the terrain worker (which
 * sculpts the bumps into getElevation) and State/DuneMelody (which runs the
 * minigame over them) so the two can never drift apart.
 *
 * Everything here is a pure function of the field index and the shoreline —
 * fixed frequencies, no LOD-dependent terms — so the sculpted terrain and the
 * gameplay layout always agree.
 *
 * Field interval is 2x the bounce-tower interval (420) with an offset chosen
 * so mogul fields never overlap a tower's helix span (tower k spans
 * -(300 + 420k) .. -(300 + 420k + ~96)).
 */

import seedrandom from 'seedrandom'

export const duneMelodyConfig = {
    firstOffset: 520,
    interval: 840,
    mogulCount: 8,
    mogulSpacing: 16,
    spacingJitter: 3,
    mogulRadius: 5.5,
    radiusJitter: 0.25,
    mogulHeight: 2,
    heightJitter: 0.35,
    inlandOffset: 8,
    lateralWeave: 3
}

export const getDuneMelodyFieldZ = (k) =>
{
    return - (duneMelodyConfig.firstOffset + k * duneMelodyConfig.interval)
}

// Worst-case field span along -z, for cheap broad-phase rejection
export const getDuneMelodyFieldSpanZ = () =>
{
    const config = duneMelodyConfig

    return (config.mogulCount - 1) * (config.mogulSpacing + config.spacingJitter * 0.5)
}

export const buildDuneMelodyField = (k, getShoreX) =>
{
    const config = duneMelodyConfig
    const random = new seedrandom(`duneMelody:${k}`)
    const startZ = getDuneMelodyFieldZ(k)
    const weavePhase = random() * Math.PI * 2
    const moguls = []
    let z = startZ
    let centerX = 0

    for(let i = 0; i < config.mogulCount; i++)
    {
        // Draw every value unconditionally so the sequence stays in lockstep
        // between the worker and the main thread
        const spacing = config.mogulSpacing + (random() - 0.5) * config.spacingJitter * 2
        const radius = config.mogulRadius * (1 + (random() - 0.5) * config.radiusJitter * 2)
        const height = config.mogulHeight + (random() - 0.5) * config.heightJitter * 2

        if(i > 0)
            z -= spacing

        const weave = Math.sin(i * 0.85 + weavePhase) * config.lateralWeave
        const x = getShoreX(z) - config.inlandOffset + weave

        moguls.push({ index: i, x, z, radius, height })
        centerX += x / config.mogulCount
    }

    return {
        k,
        startZ,
        endZ: z,
        centerX,
        moguls
    }
}
