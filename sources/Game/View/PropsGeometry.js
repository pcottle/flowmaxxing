import * as THREE from 'three'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import SimplexNoise from '@/Workers/SimplexNoise.js'

/**
 * Low-poly vertex-colored prop geometries, built once at startup.
 * Every geometry carries: position, normal (faceted), color, sway
 * (0 root → 1 tip, drives wind in the props shader).
 */

const addAttributes = (geometry, color, swayGetter) =>
{
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry
    const positions = nonIndexed.attributes.position
    const count = positions.count

    const colors = new Float32Array(count * 3)
    const sway = new Float32Array(count)

    for(let i = 0; i < count; i++)
    {
        const y = positions.getY(i)
        const c = typeof color === 'function' ? color(positions.getX(i), y, positions.getZ(i)) : color
        colors[i * 3] = c[0]
        colors[i * 3 + 1] = c[1]
        colors[i * 3 + 2] = c[2]
        sway[i] = swayGetter ? swayGetter(positions.getX(i), y, positions.getZ(i)) : 0
    }

    nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    nonIndexed.setAttribute('sway', new THREE.BufferAttribute(sway, 1))

    return nonIndexed
}

export const buildPalm = () =>
{
    const parts = []

    // Trunk: bent toward +X (seaward) — instances must keep yaw small to preserve the lean
    const trunkHeight = 6
    const lean = 1.8
    const trunk = new THREE.CylinderGeometry(0.14, 0.24, trunkHeight, 5, 6, true)
    trunk.translate(0, trunkHeight * 0.5, 0)

    {
        const positions = trunk.attributes.position
        for(let i = 0; i < positions.count; i++)
        {
            const t = positions.getY(i) / trunkHeight
            positions.setX(i, positions.getX(i) + t * t * lean)
        }
    }

    parts.push(addAttributes(
        trunk,
        (x, y) => [0.36 + y * 0.008, 0.27 + y * 0.006, 0.19],
        (x, y) => Math.pow(y / trunkHeight, 2) * 0.25
    ))

    // Fronds: tapered drooping strips fanned around the crown
    const frondCount = 7
    const frondLength = 2.6

    for(let f = 0; f < frondCount; f++)
    {
        const frond = new THREE.PlaneGeometry(frondLength, 0.5, 4, 1)
        frond.rotateX(- Math.PI * 0.5)
        frond.translate(frondLength * 0.5, 0, 0)

        const positions = frond.attributes.position
        for(let i = 0; i < positions.count; i++)
        {
            const t = positions.getX(i) / frondLength
            positions.setY(i, positions.getY(i) - Math.pow(t, 1.7) * 1.1)
            positions.setZ(i, positions.getZ(i) * (1 - t * 0.7))
        }

        const withAttributes = addAttributes(
            frond,
            (x) => {
                const t = x / frondLength
                return [0.20 + t * 0.12, 0.38 + t * 0.14, 0.16 + t * 0.06]
            },
            (x) => 0.3 + (x / frondLength) * 0.7
        )

        withAttributes.rotateY((f / frondCount) * Math.PI * 2 + f * 0.35)
        withAttributes.translate(lean, trunkHeight - 0.1, 0)
        parts.push(withAttributes)
    }

    const merged = mergeBufferGeometries(parts)
    merged.computeVertexNormals()

    return merged
}

export const buildConifer = () =>
{
    const parts = []

    const trunk = new THREE.CylinderGeometry(0.12, 0.18, 0.9, 5, 1, true)
    trunk.translate(0, 0.45, 0)
    parts.push(addAttributes(trunk, [0.3, 0.22, 0.15], null))

    const tiers = [
        { radius: 1.6, height: 1.9, baseY: 0.6 },
        { radius: 1.2, height: 1.7, baseY: 1.8 },
        { radius: 0.8, height: 1.6, baseY: 2.9 }
    ]

    for(let i = 0; i < tiers.length; i++)
    {
        const tier = tiers[i]
        const cone = new THREE.ConeGeometry(tier.radius, tier.height, 6, 1, true)
        cone.translate(0, tier.baseY + tier.height * 0.5, 0)

        const lightness = i * 0.03
        parts.push(addAttributes(
            cone,
            [0.15 + lightness, 0.3 + lightness * 1.6, 0.18 + lightness],
            (x, y) => Math.pow(y / 4.5, 2) * 0.6
        ))
    }

    const merged = mergeBufferGeometries(parts)
    merged.computeVertexNormals()

    return merged
}

export const buildBoulder = (seed, variant) =>
{
    const noise = new SimplexNoise(seed + ':rock:' + variant)
    const geometry = new THREE.IcosahedronGeometry(1, 1).toNonIndexed()
    const positions = geometry.attributes.position
    const vertex = new THREE.Vector3()

    for(let i = 0; i < positions.count; i++)
    {
        vertex.fromBufferAttribute(positions, i)
        const n = noise.noise3D(vertex.x * 1.2, vertex.y * 1.2, vertex.z * 1.2)
        vertex.multiplyScalar(1 + n * 0.35)

        // Flatten the underside so it sits in the ground
        if(vertex.y < - 0.45)
            vertex.y = - 0.45 + (vertex.y + 0.45) * 0.25

        positions.setXYZ(i, vertex.x, vertex.y, vertex.z)
    }

    const withAttributes = addAttributes(
        geometry,
        (x, y, z) => {
            const n = noise.noise3D(x * 2.1 + 10, y * 2.1, z * 2.1)
            const base = 0.4 + n * 0.05
            return [base + 0.02, base + 0.015, base]
        },
        null
    )

    withAttributes.computeVertexNormals()

    return withAttributes
}
