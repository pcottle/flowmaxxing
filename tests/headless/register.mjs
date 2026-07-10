import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./loader.mjs', pathToFileURL(new URL('.', import.meta.url).pathname).href)
