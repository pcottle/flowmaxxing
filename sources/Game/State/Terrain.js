import EventsEmitter from 'events'

export default class Terrain
{
    constructor(terrains, id, size, x, z, precision, elevationOffset)
    {
        this.terrains = terrains
        this.id = id
        this.size = size
        this.x = x
        this.z = z
        this.precision = precision
        this.elevationOffset = elevationOffset

        this.halfSize = this.size * 0.5
        this.ready = false
        this.renderInstance = null

        this.events = new EventsEmitter()
    }

    create(data)
    {
        this.positions = data.positions
        this.normals = data.normals
        this.indices = data.indices
        this.texture = data.texture
        this.uv = data.uv

        this.ready = true

        this.events.emit('ready')
    }

    getElevationForPosition(x, z)
    {
        const sample = this.getSampleForPosition(x, z)

        if(sample === false)
            return false

        return sample.elevation
    }

    getSampleForPosition(x, z)
    {
        if(!this.ready)
        {
            // console.warn('terrain not ready')
            return false
        }

        const subdivisions = this.terrains.subdivisions
        const segments = subdivisions + 1
        const subSize = this.size / subdivisions

        // Relative position
        const relativeX = x - this.x + this.halfSize
        const relativeZ = z - this.z + this.halfSize

        // Ratio
        const cellX = relativeX / subSize
        const cellZ = relativeZ / subSize
        const xRatio = cellX % 1
        const zRatio = cellZ % 1
        
        // Indexes
        const aIndexX = Math.floor(cellX)
        const aIndexZ = Math.floor(cellZ)
            
        const cIndexX = aIndexX + 1
        const cIndexZ = aIndexZ + 1

        if(aIndexX < 0 || aIndexZ < 0 || cIndexX >= segments || cIndexZ >= segments)
            return false

        const bIndexX = xRatio < zRatio ? aIndexX : aIndexX + 1
        const bIndexZ = xRatio < zRatio ? aIndexZ + 1 : aIndexZ

        const aStrideIndex = (aIndexZ * segments + aIndexX) * 3
        const bStrideIndex = (bIndexZ * segments + bIndexX) * 3
        const cStrideIndex = (cIndexZ * segments + cIndexX) * 3

        // Weights
        const weight1 = xRatio < zRatio ? 1 - zRatio : 1 - xRatio
        const weight2 = xRatio < zRatio ? - (xRatio - zRatio) : xRatio - zRatio
        const weight3 = 1 - weight1 - weight2
        
        // Elevation
        const aElevation = this.positions[aStrideIndex + 1]
        const bElevation = this.positions[bStrideIndex + 1]
        const cElevation = this.positions[cStrideIndex + 1]
        const elevation = aElevation * weight1 + bElevation * weight2 + cElevation * weight3

        // Normal
        const normalX = this.normals[aStrideIndex] * weight1
            + this.normals[bStrideIndex] * weight2
            + this.normals[cStrideIndex] * weight3
        const normalY = this.normals[aStrideIndex + 1] * weight1
            + this.normals[bStrideIndex + 1] * weight2
            + this.normals[cStrideIndex + 1] * weight3
        const normalZ = this.normals[aStrideIndex + 2] * weight1
            + this.normals[bStrideIndex + 2] * weight2
            + this.normals[cStrideIndex + 2] * weight3
        const normalLength = Math.hypot(normalX, normalY, normalZ) || 1

        return {
            elevation,
            normal: [
                normalX / normalLength,
                normalY / normalLength,
                normalZ / normalLength
            ]
        }
    }

    destroy()
    {
        this.events.emit('destroy')
    }
}
