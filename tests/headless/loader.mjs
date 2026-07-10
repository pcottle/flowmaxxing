import path from 'node:path'
import { pathToFileURL } from 'node:url'

const harness = path.dirname(new URL(import.meta.url).pathname)
const root = path.resolve(harness, '../../sources/Game')

export function resolve(specifier, context, nextResolve)
{
    if(specifier.endsWith('?worker'))
        return nextResolve(pathToFileURL(path.join(harness, 'workerShim.mjs')).href, context)

    if(specifier === '@/Game.js')
        return nextResolve(pathToFileURL(path.join(harness, 'gameStub.mjs')).href, context)

    if(specifier === '@/Debug/Debug.js')
        return nextResolve(pathToFileURL(path.join(harness, 'debugStub.mjs')).href, context)

    if(specifier.startsWith('@/'))
        return nextResolve(pathToFileURL(path.join(root, specifier.slice(2))).href, context)

    return nextResolve(specifier, context)
}
