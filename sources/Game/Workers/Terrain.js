import SimplexNoise from './SimplexNoise.js'
import { getCorridorProfile } from './CorridorProfile.js'
import { vec3 } from 'gl-matrix'

let elevationRandom = null

const linearStep = (edgeMin, edgeMax, value) =>
{
    return Math.max(0.0, Math.min(1.0, (value - edgeMin) / (edgeMax - edgeMin)))
}

const smoothStep = (edgeMin, edgeMax, value) =>
{
    const t = linearStep(edgeMin, edgeMax, value)
    return t * t * (3 - 2 * t)
}

const mix = (a, b, t) =>
{
    return a * (1 - t) + b * t
}

const getElevation = (x, z, profile, lacunarity, persistence, iterations, baseFrequency, baseAmplitude, power, iterationsOffsets, corridor, corridorOffsets) =>
{
    // FBM detail (LOD-dependent octaves, amplitude scaled per zone below)
    let detail = 0
    let frequency = baseFrequency
    let amplitude = 1
    let normalisation = 0

    for(let i = 0; i < iterations; i++)
    {
        const noise = elevationRandom.noise2D(x * frequency + iterationsOffsets[i][0], z * frequency + iterationsOffsets[i][1])
        detail += noise * amplitude

        normalisation += amplitude
        amplitude *= persistence
        frequency *= lacunarity
    }

    detail /= normalisation
    detail = Math.pow(Math.abs(detail), power) * Math.sign(detail)

    // Cross-shore zones, measured from the meandering shoreline (sea level = 0).
    // Zone widths/heights come from the per-row profile (biome-blended, cove-modulated)
    const inland = profile.shoreX - x   // + = toward mountains (west)
    const seaward = - inland            // + = toward ocean (east)

    const tOcean = smoothStep(0, corridor.oceanRampWidth, seaward)
    const tDry = smoothStep(- 6, profile.beachWidth, inland)
    const tHills = smoothStep(profile.beachWidth, profile.beachWidth + profile.hillsWidth, inland)
    const tMount = smoothStep(profile.mountainStart, profile.mountainFull, inland)
    const tHighland = smoothStep(profile.highlandStart, profile.highlandFull, inland)

    let elevation =
        - profile.oceanDepth * tOcean
        + profile.beachTopHeight * tDry
        + profile.hillsHeight * tHills
        + profile.mountainHeight * profile.mountainScale * Math.pow(tMount, 1.6)

    // Ridged mountain relief (term and derivative are 0 at tMount = 0 → C1 continuous)
    if(tMount > 0)
    {
        const r1 = 1 - Math.abs(elevationRandom.noise2D(x * corridor.ridgeFrequency + corridorOffsets[3][0], z * corridor.ridgeFrequency + corridorOffsets[3][1]))
        const r2 = 1 - Math.abs(elevationRandom.noise2D(x * corridor.ridgeFrequency * 2.6 + corridorOffsets[4][0], z * corridor.ridgeFrequency * 2.6 + corridorOffsets[4][1]))
        elevation += tMount * Math.pow(r1 * 0.72 + r2 * 0.28, 2.0) * profile.ridgeAmplitude * profile.mountainScale
    }

    // Scattered mounds across the beach and foothills — broad ramps with the same
    // crest height (fixed octaves, starts past the waterline so the foam band stays clean)
    const moundMask = smoothStep(4, profile.beachWidth, inland) * (1 - tMount)

    if(moundMask > 0)
    {
        const m1 = elevationRandom.noise2D(x * corridor.moundFrequency + corridorOffsets[5][0], z * corridor.moundFrequency + corridorOffsets[5][1])
        const m2 = elevationRandom.noise2D(x * corridor.moundFrequency * 1.7 + corridorOffsets[6][0], z * corridor.moundFrequency * 1.7 + corridorOffsets[6][1])
        const mound = smoothStep(- 0.25, 0.6, m1 * 0.85 + m2 * 0.15)
        elevation += mound * profile.moundHeight * moundMask
    }

    // Terraced cliffs: jittered quantization of the structural elevation, applied
    // BEFORE the LOD-varying detail noise so terrace band positions never move
    // between LODs. C1: smoothStep derivative is 0 at both ends of each riser.
    const terraceBlend = profile.terraceStrength * tMount

    if(terraceBlend > 0)
    {
        const jitter = elevationRandom.noise2D(x * corridor.terraceJitterFrequency + corridorOffsets[11][0], z * corridor.terraceJitterFrequency + corridorOffsets[11][1]) * corridor.terraceJitter
        const e = elevation + jitter
        const band = Math.floor(e / corridor.terraceStep)
        const r = e / corridor.terraceStep - band
        const shaped = (band + smoothStep(1 - corridor.terraceLedge, 1, r)) * corridor.terraceStep - jitter
        elevation = mix(elevation, shaped, terraceBlend)
    }

    // Beyond the winter wall: a smoother frozen highland/basin so the far side
    // reads as a traversable snowfield instead of endless vertical ridges.
    if(tHighland > 0)
    {
        const basinNoise = elevationRandom.noise2D(x * 0.004 + corridorOffsets[15][0], z * 0.004 + corridorOffsets[15][1])
        const driftNoise = elevationRandom.noise2D(x * 0.008 + corridorOffsets[15][0] + 83.1, z * 0.004 + corridorOffsets[15][1] - 41.7)
        const shelfNoise = elevationRandom.noise2D(x * 0.006 + corridorOffsets[15][0] - 127.4, z * 0.006 + corridorOffsets[15][1] + 62.3)
        const ridgeNoise = 1 - Math.abs(elevationRandom.noise2D(x * 0.014 + corridorOffsets[15][0] + 211.8, z * 0.009 + corridorOffsets[15][1] - 95.2))
        const basin = profile.highlandHeight * profile.mountainScale
            - profile.highlandBowlDepth * smoothStep(- 0.25, 0.65, basinNoise)
            + driftNoise * profile.highlandUndulation
            + Math.pow(ridgeNoise, 2.2) * profile.highlandRidgeAmplitude
        const shelf = smoothStep(0.46, 0.72, shelfNoise)
        const shelfHeight = profile.highlandHeight * profile.mountainScale - profile.highlandBowlDepth * 0.45

        elevation = mix(elevation, mix(basin, shelfHeight, shelf * 0.45), tHighland)
    }

    // Offshore sea stacks: rare steep spires rising from the seabed (fixed octaves)
    const stackBand = smoothStep(corridor.stackBandNear, corridor.stackBandNear + 20, seaward)
        * (1 - smoothStep(corridor.stackBandFar - 40, corridor.stackBandFar, seaward))

    if(stackBand > 0.001)
    {
        const s = elevationRandom.noise2D(x * corridor.stackFrequency + corridorOffsets[12][0], z * corridor.stackFrequency + corridorOffsets[12][1]) * 0.7
            + elevationRandom.noise2D(x * corridor.stackFrequency * 2.4 + corridorOffsets[13][0], z * corridor.stackFrequency * 2.4 + corridorOffsets[13][1]) * 0.3
        const core = Math.pow(smoothStep(corridor.stackThreshold, corridor.stackThreshold + corridor.stackSharpness, s), corridor.stackPower)

        if(core > 0)
        {
            const top = corridor.stackHeight + corridor.stackHeightVariation * elevationRandom.noise2D(x * 0.005 + corridorOffsets[14][0], z * 0.005 + corridorOffsets[14][1])
            elevation = mix(elevation, top, core * stackBand)
        }
    }

    // Zone-scaled detail LAST (the only LOD-varying term): smooth beach, rolling
    // seabed and hills, rough mountains — suppressed where terraces are strong so
    // the 7m steps stay readable
    const detailAmplitude = mix(
        mix(corridor.oceanDetail, corridor.beachDetail, smoothStep(- corridor.oceanRampWidth * 0.5, 0, inland)),
        mix(
            mix(profile.hillsDetail, 1 - terraceBlend * corridor.terraceDetailSuppress, tMount),
            profile.highlandDetail,
            tHighland
        ),
        tHills
    ) * baseAmplitude
    elevation += detail * detailAmplitude

    return elevation
}

onmessage = function(event)
{
    const id = event.data.id
    const size = event.data.size
    const baseX = event.data.x
    const baseZ = event.data.z
    const seed = event.data.seed
    const subdivisions = event.data.subdivisions
    const lacunarity = event.data.lacunarity
    const persistence = event.data.persistence
    const iterations = event.data.iterations
    const baseFrequency = event.data.baseFrequency
    const baseAmplitude = event.data.baseAmplitude
    const power = event.data.power
    const iterationsOffsets = event.data.iterationsOffsets
    const corridor = event.data.corridor
    const corridorOffsets = event.data.corridorOffsets
    const biomes = event.data.biomes

    const segments = subdivisions + 1
    elevationRandom = new SimplexNoise(seed)
    const grassRandom = new SimplexNoise(seed)

    /**
     * Corridor profile (depends on z only — cache one per row)
     */
    const profiles = new Array(segments + 1)

    for(let iZ = 0; iZ < segments + 1; iZ++)
    {
        const z = baseZ + (iZ / subdivisions - 0.5) * size
        profiles[iZ] = getCorridorProfile(elevationRandom, z, corridor, corridorOffsets, biomes)
    }

    /**
     * Elevation
     */
    const overflowElevations = new Float32Array((segments + 1) * (segments + 1)) // Bigger to calculate normals more accurately
    const elevations = new Float32Array(segments * segments)

    for(let iX = 0; iX < segments + 1; iX++)
    {
        const x = baseX + (iX / subdivisions - 0.5) * size

        for(let iZ = 0; iZ < segments + 1; iZ++)
        {
            const z = baseZ + (iZ / subdivisions - 0.5) * size
            const elevation = getElevation(x, z, profiles[iZ], lacunarity, persistence, iterations, baseFrequency, baseAmplitude, power, iterationsOffsets, corridor, corridorOffsets)

            const i = iZ * (segments + 1) + iX
            overflowElevations[i] = elevation

            if(iX < segments && iZ < segments)
            {
                const i = iZ * segments + iX
                elevations[i] = elevation
            }
        }
    }

    /**
     * Positions
     */
    const skirtCount = subdivisions * 4 + 4
    const positions = new Float32Array(segments * segments * 3 + skirtCount * 3)

    for(let iZ = 0; iZ < segments; iZ++)
    {
        const z = baseZ + (iZ / subdivisions - 0.5) * size
        for(let iX = 0; iX < segments; iX++)
        {
            const x = baseX + (iX / subdivisions - 0.5) * size

            const elevation = elevations[iZ * segments + iX]

            const iStride = (iZ * segments + iX) * 3
            positions[iStride    ] = x
            positions[iStride + 1] = elevation
            positions[iStride + 2] = z
        }
    }
    
    /**
     * Normals
     */
    const normals = new Float32Array(segments * segments * 3 + skirtCount * 3)
    
    const interSegmentX = - size / subdivisions
    const interSegmentZ = - size / subdivisions

    for(let iZ = 0; iZ < segments; iZ++)
    {
        for(let iX = 0; iX < segments; iX++)
        {
            // Indexes
            const iOverflowStride = iZ * (segments + 1) + iX

            // Elevations
            const currentElevation = overflowElevations[iOverflowStride]
            const neighbourXElevation = overflowElevations[iOverflowStride + 1]
            const neighbourZElevation = overflowElevations[iOverflowStride + segments + 1]

            // Deltas
            const deltaX = vec3.fromValues(
                interSegmentX,
                currentElevation - neighbourXElevation,
                0
            )

            const deltaZ = vec3.fromValues(
                0,
                currentElevation - neighbourZElevation,
                interSegmentZ
            )

            // Normal
            const normal = vec3.create()
            vec3.cross(normal, deltaZ, deltaX)
            vec3.normalize(normal, normal)

            const iStride = (iZ * segments + iX) * 3
            normals[iStride    ] = normal[0]
            normals[iStride + 1] = normal[1]
            normals[iStride + 2] = normal[2]
        }
    }

    /**
     * UV
     */
    const uv = new Float32Array(segments * segments * 2 + skirtCount * 2)

    for(let iZ = 0; iZ < segments; iZ++)
    {
        for(let iX = 0; iX < segments; iX++)
        {
            const iStride = (iZ * segments + iX) * 2
            uv[iStride    ] = iX / (segments - 1)
            uv[iStride + 1] = iZ / (segments - 1)
        }
    }

    /**
     * Indices
     */
    const indicesCount = subdivisions * subdivisions
    const indices = new (indicesCount < 65535 ? Uint16Array : Uint32Array)(indicesCount * 6 + subdivisions * 4 * 6 * 4)
    
    for(let iZ = 0; iZ < subdivisions; iZ++)
    {
        for(let iX = 0; iX < subdivisions; iX++)
        {
            const row = subdivisions + 1
            const a = iZ * row + iX
            const b = iZ * row + (iX + 1)
            const c = (iZ + 1) * row + iX
            const d = (iZ + 1) * row + (iX + 1)

            const iStride = (iZ * subdivisions + iX) * 6
            indices[iStride    ] = a
            indices[iStride + 1] = d
            indices[iStride + 2] = b

            indices[iStride + 3] = d
            indices[iStride + 4] = a
            indices[iStride + 5] = c
        }
    }
    
    /**
     * Skirt
     */
    let skirtIndex = segments * segments
    let indicesSkirtIndex = segments * segments

    // North (negative Z)
    for(let iX = 0; iX < segments; iX++)
    {
        const iZ = 0
        const iPosition = iZ * segments + iX
        const iPositionStride = iPosition * 3

        // Position
        positions[skirtIndex * 3    ] = positions[iPositionStride + 0]
        positions[skirtIndex * 3 + 1] = positions[iPositionStride + 1] - 15
        positions[skirtIndex * 3 + 2] = positions[iPositionStride + 2]

        // Normal
        normals[skirtIndex * 3    ] = normals[iPositionStride + 0]
        normals[skirtIndex * 3 + 1] = normals[iPositionStride + 1]
        normals[skirtIndex * 3 + 2] = normals[iPositionStride + 2]
        
        // UV
        uv[skirtIndex * 2    ] = iZ / (segments - 1)
        uv[skirtIndex * 2 + 1] = iX / (segments - 1)

        // Index
        if(iX < segments - 1)
        {
            const a = iPosition
            const b = iPosition + 1
            const c = skirtIndex
            const d = skirtIndex + 1

            const iIndexStride = indicesSkirtIndex * 6
            indices[iIndexStride    ] = b
            indices[iIndexStride + 1] = d
            indices[iIndexStride + 2] = a

            indices[iIndexStride + 3] = c
            indices[iIndexStride + 4] = a
            indices[iIndexStride + 5] = d

            indicesSkirtIndex++
        }

        skirtIndex++
    }
    
    // South (positive Z)
    for(let iX = 0; iX < segments; iX++)
    {
        const iZ = segments - 1
        const iPosition = iZ * segments + iX
        const iPositionStride = iPosition * 3

        // Position
        positions[skirtIndex * 3    ] = positions[iPositionStride + 0]
        positions[skirtIndex * 3 + 1] = positions[iPositionStride + 1] - 15
        positions[skirtIndex * 3 + 2] = positions[iPositionStride + 2]

        // Normal
        normals[skirtIndex * 3    ] = normals[iPositionStride + 0]
        normals[skirtIndex * 3 + 1] = normals[iPositionStride + 1]
        normals[skirtIndex * 3 + 2] = normals[iPositionStride + 2]
        
        // UV
        uv[skirtIndex * 2    ] = iZ / (segments - 1)
        uv[skirtIndex * 2 + 1] = iX / (segments - 1)

        // Index
        if(iX < segments - 1)
        {
            const a = iPosition
            const b = iPosition + 1
            const c = skirtIndex
            const d = skirtIndex + 1

            const iIndexStride = indicesSkirtIndex * 6
            indices[iIndexStride    ] = a
            indices[iIndexStride + 1] = c
            indices[iIndexStride + 2] = b

            indices[iIndexStride + 3] = d
            indices[iIndexStride + 4] = b
            indices[iIndexStride + 5] = c

            indicesSkirtIndex++
        }
        
        skirtIndex++
    }

    // West (negative X)
    for(let iZ = 0; iZ < segments; iZ++)
    {
        const iX = 0
        const iPosition = (iZ * segments + iX)
        const iPositionStride = iPosition * 3

        // Position
        positions[skirtIndex * 3    ] = positions[iPositionStride + 0]
        positions[skirtIndex * 3 + 1] = positions[iPositionStride + 1] - 15
        positions[skirtIndex * 3 + 2] = positions[iPositionStride + 2]

        // Normal
        normals[skirtIndex * 3    ] = normals[iPositionStride + 0]
        normals[skirtIndex * 3 + 1] = normals[iPositionStride + 1]
        normals[skirtIndex * 3 + 2] = normals[iPositionStride + 2]
        
        // UV
        uv[skirtIndex * 2    ] = iZ / (segments - 1)
        uv[skirtIndex * 2 + 1] = iX

        // Index
        if(iZ < segments - 1)
        {
            const a = iPosition
            const b = iPosition + segments
            const c = skirtIndex
            const d = skirtIndex + 1

            const iIndexStride = indicesSkirtIndex * 6
            indices[iIndexStride    ] = a
            indices[iIndexStride + 1] = c
            indices[iIndexStride + 2] = b

            indices[iIndexStride + 3] = d
            indices[iIndexStride + 4] = b
            indices[iIndexStride + 5] = c

            indicesSkirtIndex++
        }

        skirtIndex++
    }

    for(let iZ = 0; iZ < segments; iZ++)
    {
        const iX = segments - 1
        const iPosition = (iZ * segments + iX)
        const iPositionStride = iPosition * 3

        // Position
        positions[skirtIndex * 3    ] = positions[iPositionStride + 0]
        positions[skirtIndex * 3 + 1] = positions[iPositionStride + 1] - 15
        positions[skirtIndex * 3 + 2] = positions[iPositionStride + 2]

        // Normal
        normals[skirtIndex * 3    ] = normals[iPositionStride + 0]
        normals[skirtIndex * 3 + 1] = normals[iPositionStride + 1]
        normals[skirtIndex * 3 + 2] = normals[iPositionStride + 2]
        
        // UV
        uv[skirtIndex * 2    ] = iZ / (segments - 1)
        uv[skirtIndex * 2 + 1] = iX / (segments - 1)

        // Index
        if(iZ < segments - 1)
        {
            const a = iPosition
            const b = iPosition + segments
            const c = skirtIndex
            const d = skirtIndex + 1

            const iIndexStride = indicesSkirtIndex * 6
            indices[iIndexStride    ] = b
            indices[iIndexStride + 1] = d
            indices[iIndexStride + 2] = a

            indices[iIndexStride + 3] = c
            indices[iIndexStride + 4] = a
            indices[iIndexStride + 5] = d

            indicesSkirtIndex++
        }

        skirtIndex++
    }

    /**
     * Texture
     */
    const texture = new Float32Array(segments * segments * 4)

    for(let iZ = 0; iZ < segments; iZ++)
    {
        for(let iX = 0; iX < segments; iX++)
        {
            const iPositionStride = (iZ * segments + iX) * 3
            const position = vec3.fromValues(
                positions[iPositionStride    ],
                positions[iPositionStride + 1],
                positions[iPositionStride + 2]
            )

            // Normal
            const iNormalStride = (iZ * segments + iX) * 3
            const normal = vec3.fromValues(
                normals[iNormalStride    ],
                normals[iNormalStride + 1],
                normals[iNormalStride + 2]
            )

            // Grass
            const upward = Math.max(0, normal[1])
            let grass = 0;

            if(position[1] > 0)
            {
                const grassFrequency = 0.05
                let grassNoise = grassRandom.noise2D(position[0] * grassFrequency + iterationsOffsets[0][0], position[2] * grassFrequency + iterationsOffsets[0][0])
                grassNoise = linearStep(- 0.5, 0, grassNoise);

                const grassUpward = linearStep(0.9, 1, upward);

                // Keep grass off the beach sand: only inland of the dry sand band
                const inland = profiles[iZ].shoreX - position[0]
                const zoneMask = smoothStep(profiles[iZ].beachWidth + 4, profiles[iZ].beachWidth + 24, inland)

                grass = grassNoise * grassUpward * zoneMask
            }

            // Final texture
            const iTextureStride = (iZ * segments  + iX) * 4
            texture[iTextureStride    ] = normals[iNormalStride    ]
            texture[iTextureStride + 1] = normals[iNormalStride + 1]
            texture[iTextureStride + 2] = normals[iNormalStride + 2]
            texture[iTextureStride + 3] = position[1]
        }
    }

    // Post
    postMessage({
        id: id,
        positions: positions,
        normals: normals,
        indices: indices,
        texture: texture,
        uv: uv
    })
}
