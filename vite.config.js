import glsl from 'vite-plugin-glsl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

const dirname = path.resolve()

export default defineConfig({
    base: './',
    build:
    {
        assetsDir: 'build'
    },
    resolve:
    {
        alias:
        {
            '@' : path.resolve(dirname, './sources/Game')
        }
    },
    plugins:
    [
        glsl({ watch: true }),
        react()
    ],
    server:
    {
        host: true,
        open: true
    }
})
