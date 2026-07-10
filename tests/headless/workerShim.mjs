// Runs the real terrain worker synchronously in-process: the worker module
// assigns to the global `onmessage` and calls the global `postMessage`, so we
// provide both and bridge them to a Worker-like object.

const instance = {
    onmessage: null,
    postMessage(data)
    {
        workerHandler({ data })
    }
}

globalThis.onmessage = null
globalThis.postMessage = (data) =>
{
    queueMicrotask(() => instance.onmessage?.({ data }))
}

await import(new URL('../../sources/Game/Workers/Terrain.js', import.meta.url).href)

const workerHandler = globalThis.onmessage

export default function TerrainWorker()
{
    return instance
}
