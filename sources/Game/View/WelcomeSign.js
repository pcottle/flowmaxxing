import * as THREE from 'three'
import seedrandom from 'seedrandom'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import FlameMaterial from './Materials/FlameMaterial.js'

/**
 * One-off welcome tablet planted in the sand just ahead of spawn: a tiki
 * frame (bamboo rails, lashed corners, carved post heads) around a slate
 * slab. The instructions are drawn on an offscreen 2d canvas as jittered
 * multi-pass "chalk" strokes and mapped onto the slab as a CanvasTexture —
 * no DOM overlay, the text lives in the world like any other prop.
 */
export default class WelcomeSign
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.scene = this.view.scene

        // Just down the beach from spawn (forward is -Z), up on the dry
        // sand to the player's left (-X, inland) so it frames the path
        // without blocking it
        this.z = - 8
        this.shoreOffset = 20
        this.yaw = 0.38
        this.scale = 2
        this.placed = false

        // Drawn in the prompt box AND written to the clipboard on click
        this.promptText = 'Edit the appropriate config settings to play the MacOS sound "Bottle" for when you need input and Glass when you are done'

        this.setBoardTexture()
        this.setMeshes()
        this.setInteraction()
        this.setDebug()
    }

    setBoardTexture()
    {
        this.boardWidth = 1024
        this.boardHeight = 1280
        this.boardCanvas = document.createElement('canvas')
        this.boardCanvas.width = this.boardWidth
        this.boardCanvas.height = this.boardHeight
        this.boardContext = this.boardCanvas.getContext('2d')

        this.boardTexture = new THREE.CanvasTexture(this.boardCanvas)
        this.boardTexture.anisotropy = this.view.renderer.instance.capabilities.getMaxAnisotropy()

        this.drawBoard('normal')
    }

    // boardState: 'normal' | 'hover' | 'copied'. Re-seeding the rng per
    // draw keeps every jittered chalk stroke identical across redraws, so
    // state changes don't make the whole board shimmer.
    drawBoard(boardState)
    {
        this.boardState = boardState
        this.random = new seedrandom('welcome-sign')

        const width = this.boardWidth
        const height = this.boardHeight
        const context = this.boardContext

        context.globalAlpha = 1

        // Slate blackboard, mottled so it doesn't read as a flat fill
        const background = context.createLinearGradient(0, 0, 0, height)
        background.addColorStop(0, '#2d3833')
        background.addColorStop(1, '#222b26')
        context.fillStyle = background
        context.fillRect(0, 0, width, height)

        for(let i = 0; i < 1600; i++)
        {
            const bright = this.random() < 0.5
            context.fillStyle = bright ? '#ffffff' : '#000000'
            context.globalAlpha = 0.015 + this.random() * 0.03
            context.fillRect(this.random() * width, this.random() * height, 1 + this.random() * 3, 1 + this.random() * 3)
        }

        // Ghosts of half-erased chalk — big soft smudges
        for(let i = 0; i < 7; i++)
        {
            const smudge = context.createRadialGradient(0, 0, 0, 0, 0, 60 + this.random() * 140)
            smudge.addColorStop(0, 'rgba(232, 228, 216, 0.05)')
            smudge.addColorStop(1, 'rgba(232, 228, 216, 0)')
            context.save()
            context.translate(this.random() * width, this.random() * height)
            context.scale(1 + this.random(), 0.4 + this.random() * 0.4)
            context.fillStyle = smudge
            context.globalAlpha = 1
            context.fillRect(- 220, - 220, 440, 440)
            context.restore()
        }

        context.globalAlpha = 1

        const chalkFont = (size, bold = true) =>
            `${bold ? 'bold ' : ''}${size}px 'Chalkboard SE', 'Comic Sans MS', 'Segoe Print', cursive`

        // Chalk strokes: a few offset low-alpha passes for the dusty halo,
        // then one firmer pass on top. Per-line micro-rotation keeps the
        // layout from looking typeset.
        const chalk = (text, x, y, size, { align = 'center', alpha = 1, bold = true, tilt = 0 } = {}) =>
        {
            context.save()
            context.translate(x, y)
            context.rotate(tilt + (this.random() - 0.5) * 0.008)
            context.font = chalkFont(size, bold)
            context.textAlign = align
            context.textBaseline = 'middle'
            context.fillStyle = '#e8e4d6'

            for(let pass = 0; pass < 3; pass++)
            {
                context.globalAlpha = 0.16 * alpha
                context.fillText(text, (this.random() - 0.5) * 2.4, (this.random() - 0.5) * 2.4)
            }

            context.globalAlpha = 0.62 * alpha
            context.fillText(text, 0, 0)
            context.restore()
        }

        // Rough hand-drawn line: segments with jitter, doubled like chalk
        const chalkLine = (points, lineWidth, alpha = 0.5) =>
        {
            for(let pass = 0; pass < 2; pass++)
            {
                context.beginPath()
                context.strokeStyle = '#e8e4d6'
                context.lineWidth = lineWidth
                context.lineCap = 'round'
                context.globalAlpha = alpha * (pass === 0 ? 0.6 : 0.3)

                for(let i = 0; i < points.length; i++)
                {
                    const [ pointX, pointY ] = points[i]
                    const jitterX = pointX + (this.random() - 0.5) * 3
                    const jitterY = pointY + (this.random() - 0.5) * 3

                    if(i === 0)
                        context.moveTo(jitterX, jitterY)
                    else
                        context.lineTo(jitterX, jitterY)
                }

                context.stroke()
            }
        }

        // Chalk border, drawn inside the slab like someone framed their notes
        const inset = 38
        //chalkLine([ [ inset, inset ], [ width - inset, inset ], [ width - inset, height - inset ], [ inset, height - inset ], [ inset, inset + 4 ] ], 5, 0.45)

        // Doodle: a sun in the top corner
        const sunX = 100
        const sunY = 100
        chalkLine(Array.from({ length: 17 }, (_, i) => [ sunX + Math.cos(i * Math.PI / 8) * 34, sunY + Math.sin(i * Math.PI / 8) * 34 ]), 5, 0.55)

        for(let i = 0; i < 8; i++)
        {
            const angle = i * Math.PI / 4 + 0.35
            chalkLine([
                [ sunX + Math.cos(angle) * 44, sunY + Math.sin(angle) * 44 ],
                [ sunX + Math.cos(angle) * 62, sunY + Math.sin(angle) * 62 ]
            ], 5, 0.55)
        }

        chalk('Welcome to', width / 2, 128, 46, { alpha: 0.85, tilt: - 0.01 })
        chalk('WaitingFor.AI', width / 2, 248, 104, { tilt: 0.005 })

        // Squiggle underline
        chalkLine(Array.from({ length: 24 }, (_, i) => [ 225 + i * ((width - 440) / 23), 325 + Math.sin(i * 1.1) * 7 ]), 6, 0.6)

        // Word-wrapped chalk paragraph, centered; returns the y below it
        const chalkParagraph = (text, y, size, maxWidth, { bold = true, alpha = 1, lineHeight = size * 1.4 } = {}) =>
        {
            context.font = chalkFont(size, bold)

            const lines = []
            let line = ''

            for(const word of text.split(' '))
            {
                const attempt = line === '' ? word : `${line} ${word}`

                if(context.measureText(attempt).width > maxWidth && line !== '')
                {
                    lines.push(line)
                    line = word
                }
                else
                {
                    line = attempt
                }
            }

            if(line !== '')
                lines.push(line)

            for(const outputLine of lines)
            {
                chalk(outputLine, width / 2, y, size, { bold, alpha })
                y += lineHeight
            }

            return y
        }

        let cursorY = chalkParagraph(
            'The chillest place to wait for your coding agents. Drop the prompt below into Claude, Codex, or OpenCode to turn on your island chimes; then kick back here, catch a vibe, and let the code cook 🌴🔔',
            420, 48, 860, { alpha: 0.95 }
        )

        // Divider wave
        cursorY += 12
        // chalkLine(Array.from({ length: 30 }, (_, i) => [ 150 + i * ((width - 300) / 29), cursorY + Math.sin(i * 0.9) * 12 ]), 5, 0.5)
        cursorY += 80

        // The prompt, framed in its own rough chalk box — clickable, so the
        // box rect is recorded (in canvas pixels) for the raycast hit-test
        const boxTop = cursorY - 48
        const promptLineHeight = 58
        const promptBottom = chalkParagraph(
            this.promptText,
            cursorY, 41, 790, { bold: false, alpha: 0.9, lineHeight: promptLineHeight }
        )
        const boxBottom = promptBottom - promptLineHeight + 46
        const boxAlpha = boardState === 'normal' ? 0.4 : 0.8
        chalkLine([ [ 82, boxTop ], [ width - 82, boxTop ], [ width - 82, boxBottom ], [ 82, boxBottom ], [ 82, boxTop + 4 ] ], 4, boxAlpha)

        this.promptRect = { x1: 82, y1: boxTop, x2: width - 82, y2: boxBottom }

        const hintY = Math.min(boxBottom + 44, height - 26)

        if(boardState === 'copied')
            chalk('copied!', width / 2, hintY, 42, { alpha: 0.95, tilt: - 0.02 })
        else
            chalk('( click to copy )', width / 2, hintY, 34, { bold: false, alpha: boardState === 'hover' ? 0.9 : 0.5 })

        chalk('— the tiki spirits', width - 120, height - 25, 42, { align: 'right', bold: false, alpha: 0.8, tilt: 0.015 })

        this.boardTexture.needsUpdate = true
    }

    setMeshes()
    {
        this.group = new THREE.Group()
        this.group.visible = false

        const paint = (geometry, r, g, b) =>
        {
            const colors = new Float32Array(geometry.attributes.position.count * 3)

            for(let i = 0; i < geometry.attributes.position.count; i++)
            {
                colors[i * 3    ] = r
                colors[i * 3 + 1] = g
                colors[i * 3 + 2] = b
            }

            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

            return geometry
        }

        const parts = []

        // Slab the chalk sits on — dark wood, slightly larger than the face
        const slabWidth = 3.7
        const slabHeight = 4.5
        const slabCenterY = 2.7
        parts.push(paint(new THREE.BoxGeometry(slabWidth, slabHeight, 0.22).translate(0, slabCenterY, 0), 0.23, 0.15, 0.10))

        // Bamboo rails proud of the slab edges, with node rings
        const rail = (length, tiltZ, x, y) =>
        {
            const cane = paint(new THREE.CylinderGeometry(0.085, 0.085, length, 7), 0.55, 0.42, 0.20)
            cane.rotateZ(tiltZ)
            cane.translate(x, y, 0.06)
            parts.push(cane)

            const ringCount = Math.floor(length / 0.9)

            for(let i = 1; i <= ringCount; i++)
            {
                const ring = paint(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 7), 0.42, 0.30, 0.13)
                ring.rotateZ(tiltZ)
                const along = - length / 2 + i * (length / (ringCount + 1))
                ring.translate(x - Math.sin(tiltZ) * along, y + Math.cos(tiltZ) * along, 0.06)
                parts.push(ring)
            }
        }

        rail(slabWidth + 0.3, Math.PI * 0.5, 0, slabCenterY + slabHeight / 2) // top
        rail(slabWidth + 0.3, Math.PI * 0.5, 0, slabCenterY - slabHeight / 2) // bottom
        rail(slabHeight + 0.3, 0, - slabWidth / 2, slabCenterY) // left
        rail(slabHeight + 0.3, 0, slabWidth / 2, slabCenterY) // right

        // Corner lashings: crossed rope stubs
        for(const cornerX of [ - slabWidth / 2, slabWidth / 2 ])
        {
            for(const cornerY of [ slabCenterY - slabHeight / 2, slabCenterY + slabHeight / 2 ])
            {
                for(const cross of [ - 1, 1 ])
                {
                    const lash = paint(new THREE.BoxGeometry(0.34, 0.055, 0.26), 0.30, 0.21, 0.11)
                    lash.rotateZ(cross * Math.PI * 0.25)
                    lash.translate(cornerX, cornerY, 0.08)
                    parts.push(lash)
                }
            }
        }

        // Posts sunk into the sand, carrying the slab
        const postX = slabWidth / 2 + 0.28
        const postTop = slabCenterY + slabHeight / 2 + 0.35

        this.torchFlames = []

        for(const side of [ - 1, 1 ])
        {
            const post = paint(new THREE.CylinderGeometry(0.13, 0.16, postTop + 0.8, 7), 0.38, 0.26, 0.15)
            post.translate(side * postX, (postTop - 0.8) / 2, - 0.08)
            parts.push(post)

            // Carved tiki head on each post top: head block, brow, nose, mouth
            const headY = postTop + 0.22
            parts.push(paint(new THREE.BoxGeometry(0.34, 0.46, 0.3).translate(side * postX, headY, - 0.08), 0.45, 0.29, 0.15))
            parts.push(paint(new THREE.BoxGeometry(0.38, 0.09, 0.34).translate(side * postX, headY + 0.13, - 0.08), 0.30, 0.19, 0.10))
            parts.push(paint(new THREE.BoxGeometry(0.09, 0.16, 0.1).translate(side * postX, headY + 0.01, 0.09), 0.52, 0.35, 0.18))
            parts.push(paint(new THREE.BoxGeometry(0.24, 0.07, 0.06).translate(side * postX, headY - 0.14, 0.09), 0.16, 0.10, 0.07))
            parts.push(paint(new THREE.BoxGeometry(0.4, 0.07, 0.36).translate(side * postX, headY - 0.235, - 0.08), 0.30, 0.19, 0.10))

            // Tiki torch flame above each head — the sign's night light
            // (crossed cutout planes, same recipe as the campfires)
            const flameParts = []

            for(let i = 0; i < 3; i++)
            {
                const plane = new THREE.PlaneGeometry(0.45, 0.7)
                plane.translate(0, 0.35, 0)
                plane.rotateY(i * Math.PI / 3)

                const phases = new Float32Array(plane.attributes.position.count)
                phases.fill(i * 2.1)
                plane.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))

                flameParts.push(plane)
            }

            const flameMaterial = new FlameMaterial()
            flameMaterial.uniforms.uSeed.value = 31 + side * 7.3

            const flame = new THREE.Mesh(mergeBufferGeometries(flameParts), flameMaterial)
            flame.position.set(side * postX, headY + 0.24, - 0.08)
            flame.visible = false
            flame.userData.seed = side * 2.7
            this.group.add(flame)
            this.torchFlames.push(flame)
        }

        this.frameMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })
        const frame = new THREE.Mesh(mergeBufferGeometries(parts), this.frameMaterial)
        this.group.add(frame)

        // The chalk face, floating just off the slab front
        this.boardMaterial = new THREE.MeshBasicMaterial({ map: this.boardTexture })
        this.boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 4.12), this.boardMaterial)
        this.boardMesh.position.set(0, slabCenterY, 0.115)
        this.group.add(this.boardMesh)

        // A hair of lean so it reads as planted, not placed
        this.group.rotation.set(- 0.05, this.yaw, 0.015)

        this.scene.add(this.group)
    }

    setInteraction()
    {
        this.raycaster = new THREE.Raycaster()
        this.pointerNdc = new THREE.Vector2()
        this.pointerOnPrompt = false
        this.pointerMoved = false
        this.copiedUntil = 0
        this.pressX = 0
        this.pressY = 0

        const setNdc = (event) =>
        {
            this.pointerNdc.x = (event.clientX / window.innerWidth) * 2 - 1
            this.pointerNdc.y = - (event.clientY / window.innerHeight) * 2 + 1
        }

        window.addEventListener('pointermove', (event) =>
        {
            setNdc(event)
            this.pointerMoved = true
        })

        window.addEventListener('pointerdown', (event) =>
        {
            this.pressX = event.clientX
            this.pressY = event.clientY
        })

        window.addEventListener('pointerup', (event) =>
        {
            // A click/tap, not the tail end of a camera drag
            if(Math.hypot(event.clientX - this.pressX, event.clientY - this.pressY) > 6)
                return

            setNdc(event)

            if(this.hitPrompt())
                this.copyPrompt()
        })
    }

    // Ray from the cursor through the camera at the board plane; the
    // intersection uv maps 1:1 onto the chalk canvas, so the hit-test is
    // against the drawn prompt box itself
    hitPrompt()
    {
        if(!this.placed || this.state.viewport?.pointerLock.active)
            return false

        this.raycaster.setFromCamera(this.pointerNdc, this.view.camera.instance)
        const hit = this.raycaster.intersectObject(this.boardMesh, false)[0]

        if(!hit || !hit.uv)
            return false

        const x = hit.uv.x * this.boardWidth
        const y = (1 - hit.uv.y) * this.boardHeight

        return x >= this.promptRect.x1 && x <= this.promptRect.x2
            && y >= this.promptRect.y1 && y <= this.promptRect.y2
    }

    copyPrompt()
    {
        if(navigator.clipboard?.writeText)
        {
            navigator.clipboard.writeText(this.promptText).catch(() => {})
        }
        else
        {
            // Plain-http fallback (e.g. vite over LAN)
            const textarea = document.createElement('textarea')
            textarea.value = this.promptText
            textarea.style.position = 'fixed'
            textarea.style.opacity = '0'
            document.body.appendChild(textarea)
            textarea.select()
            document.execCommand('copy')
            textarea.remove()
        }

        this.copiedUntil = this.state.time.elapsed + 2
        this.drawBoard('copied')
    }

    place()
    {
        const x = this.state.terrains.getShoreX(this.z) - this.shoreOffset
        const elevation = this.state.chunks.getElevationForPosition(x, this.z)

        if(elevation === false || !Number.isFinite(elevation) || elevation <= 0.05)
            return

        this.group.position.set(x, elevation - 0.15 * this.scale, this.z)
        this.group.scale.setScalar(this.scale)
        this.group.visible = true
        this.placed = true

        // Block walking through the slab; anything airborne clears it
        this.state.propsColliders.setGroup('welcomeSign', [
            { x, z: this.z, y: elevation, radius: 1.6 * this.scale, height: 5.2 * this.scale }
        ])
    }

    update()
    {
        if(!this.placed)
            this.place()

        const sunY = this.state.sun.position.y
        const day = THREE.MathUtils.smoothstep(sunY, - 0.2, 0.25)

        // Torch-lit: unlike the campfire logs, the sign barely dims at
        // night — the board keeps a warm readable glow, the frame a bit less
        const boardTint = 0.82 + 0.18 * day
        this.boardMaterial.color.setRGB(boardTint, boardTint * (0.93 + 0.07 * day), boardTint * (0.84 + 0.24 * day))

        const frameTint = 0.6 + 0.4 * day
        this.frameMaterial.color.setRGB(frameTint, frameTint * (0.93 + 0.07 * day), frameTint * (0.84 + 0.24 * day))

        // Torches follow the campfire rules: alive at night, damped by rain
        const night = 1 - THREE.MathUtils.smoothstep(sunY, - 0.02, 0.12)
        const presence = night * (1 - 0.85 * this.state.weather.rainIntensity)
        const elapsed = this.state.time.elapsed

        for(const flame of this.torchFlames)
        {
            const flicker = 0.88 + 0.12 * Math.sin(elapsed * 2.3 + flame.userData.seed)
            const intensity = presence * flicker

            flame.visible = intensity > 0.05

            if(flame.visible)
            {
                flame.material.uniforms.uTime.value = elapsed
                flame.material.uniforms.uIntensity.value = intensity
            }
        }

        // Prompt hover/copy affordances — board redraws only on transitions
        const copied = this.copiedUntil > elapsed

        if(this.pointerMoved)
        {
            this.pointerMoved = false
            const hovering = this.hitPrompt()

            if(hovering !== this.pointerOnPrompt)
            {
                this.pointerOnPrompt = hovering
                this.view.renderer.instance.domElement.style.cursor = hovering ? 'pointer' : ''

                if(!copied)
                    this.drawBoard(hovering ? 'hover' : 'normal')
            }
        }

        if(this.boardState === 'copied' && !copied)
            this.drawBoard(this.pointerOnPrompt ? 'hover' : 'normal')
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('view/welcomeSign')

        const replace = () =>
        {
            this.placed = false
            this.group.visible = false
        }

        folder.add(this, 'z').min(- 60).max(0).step(1).onChange(replace)
        folder.add(this, 'shoreOffset').min(0).max(30).step(0.5).onChange(replace)
        folder.add(this, 'scale').min(0.5).max(4).step(0.1).onChange(replace)
        folder.add(this.group.rotation, 'y').min(- 1).max(1).step(0.01).name('yaw')
    }
}
