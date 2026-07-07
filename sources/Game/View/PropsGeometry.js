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

const mixColor = (a, b, t) =>
{
    return [
        a[0] * (1 - t) + b[0] * t,
        a[1] * (1 - t) + b[1] * t,
        a[2] * (1 - t) + b[2] * t
    ]
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

    // Fronds in two layers: a long drooping outer skirt and a shorter,
    // flatter inner crown rotated between the outer fronds, overlapping
    // into a full canopy
    const frondLayers = [
        { count: 9, length: 2.6, width: 1.4, droop: 1.1, yOffset: - 0.1, angleOffset: 0 },
        { count: 7, length: 1.7, width: 1.1, droop: 0.5, yOffset: 0.18, angleOffset: 0.38 }
    ]

    for(const layer of frondLayers)
    {
        for(let f = 0; f < layer.count; f++)
        {
            const frond = new THREE.PlaneGeometry(layer.length, layer.width, 4, 1)
            frond.rotateX(- Math.PI * 0.5)
            frond.translate(layer.length * 0.5, 0, 0)

            const positions = frond.attributes.position
            for(let i = 0; i < positions.count; i++)
            {
                const t = positions.getX(i) / layer.length
                positions.setY(i, positions.getY(i) - Math.pow(t, 1.7) * layer.droop)
                positions.setZ(i, positions.getZ(i) * (1 - t * 0.7))
            }

            const withAttributes = addAttributes(
                frond,
                (x) => {
                    const t = x / layer.length
                    return [0.20 + t * 0.12, 0.38 + t * 0.14, 0.16 + t * 0.06]
                },
                (x) => 0.3 + (x / layer.length) * 0.7
            )

            withAttributes.rotateY((f / layer.count) * Math.PI * 2 + f * 0.35 + layer.angleOffset)
            withAttributes.translate(lean, trunkHeight + layer.yOffset, 0)
            parts.push(withAttributes)
        }
    }

    const merged = mergeBufferGeometries(parts)
    merged.computeVertexNormals()

    return merged
}

export const buildConifer = (options = {}) =>
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
        const cone = new THREE.ConeGeometry(tier.radius, tier.height, 6, options.snow ? 3 : 1, true)
        cone.translate(0, tier.baseY + tier.height * 0.5, 0)

        const lightness = i * 0.03
        const needles = [0.15 + lightness, 0.3 + lightness * 1.6, 0.18 + lightness]
        parts.push(addAttributes(
            cone,
            (x, y, z) =>
            {
                if(!options.snow)
                    return needles

                const heightT = Math.max(0, Math.min(1, (y - tier.baseY) / tier.height))
                const radialT = Math.min(Math.hypot(x, z) / tier.radius, 1)
                const snow = Math.max(0, Math.min(1, (heightT - 0.38) / 0.38)) * (0.35 + radialT * 0.65)
                return mixColor(needles, [0.88, 0.94, 0.96], snow)
            },
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
