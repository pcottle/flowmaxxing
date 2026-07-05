/**
 * Simple prop collision registry: each props layer registers flat circles
 * ({x, z, y: ground, radius, height}) whenever it rebuilds. The player
 * resolves against them with a horizontal push-out; anything above
 * y + height (a glide, a big launch) passes over freely.
 */
export default class PropsColliders
{
    constructor()
    {
        this.groups = {}
    }

    setGroup(name, colliders)
    {
        this.groups[name] = colliders
    }

    forEach(callback)
    {
        for(const name in this.groups)
        {
            const colliders = this.groups[name]

            for(let i = 0; i < colliders.length; i++)
                callback(colliders[i])
        }
    }
}
