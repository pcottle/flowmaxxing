import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import State from '@/State/State.js'
import Debug from '@/Debug/Debug.js'
import SkyBackgroundMaterial from './Materials/SkyBackgroundMaterial.js'
import SkySphereMaterial from './Materials/SkySphereMaterial.js'
import StarsMaterial from './Materials/StarsMaterial.js'
import CloudsMaterial from './Materials/CloudsMaterial.js'

export default class Sky
{
    constructor()
    {
        this.game = Game.getInstance()
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()
        
        this.viewport = this.state.viewport
        this.renderer = this.view.renderer
        this.scene = this.view.scene

        this.outerDistance = 1000

        this.group = new THREE.Group()
        this.scene.add(this.group)

        this.setCustomRender()
        this.setBackground()
        this.setSphere()
        this.setClouds()
        this.setSun()
        this.setMoon()
        this.setShootingStar()
        this.setStars()
        this.setDebug()
    }

    setCustomRender()
    {
        this.customRender = {}
        this.customRender.scene = new THREE.Scene()
        this.customRender.camera = this.view.camera.instance.clone()
        // High enough that hard-edged toon clouds survive the upscale
        this.customRender.resolutionRatio = 0.35
        this.customRender.renderTarget = new THREE.WebGLRenderTarget(
            this.viewport.width * this.customRender.resolutionRatio,
            this.viewport.height * this.customRender.resolutionRatio,
            {
                generateMipmaps: false
            }
        )
        this.customRender.texture = this.customRender.renderTarget.texture
    }

    setBackground()
    {
        this.background = {}
        
        this.background.geometry = new THREE.PlaneGeometry(2, 2)
        
        // this.background.material = new THREE.MeshBasicMaterial({ wireframe: false, map: this.customRender.renderTarget.texture })
        this.background.material = new SkyBackgroundMaterial()
        this.background.material.uniforms.uTexture.value = this.customRender.renderTarget.texture
        // this.background.material.wireframe = true
        this.background.material.depthTest = false
        this.background.material.depthWrite = false
        
        this.background.mesh = new THREE.Mesh(this.background.geometry, this.background.material)
        this.background.mesh.frustumCulled = false
        
        this.group.add(this.background.mesh)
    }

    setSphere()
    {
        this.sphere = {}
        this.sphere.widthSegments = 128
        this.sphere.heightSegments = 64
        this.sphere.update = () =>
        {
            const geometry = new THREE.SphereGeometry(10, this.sphere.widthSegments, this.sphere.heightSegments)
            if(this.sphere.geometry)
            {
                this.sphere.geometry.dispose()
                this.sphere.mesh.geometry = this.sphere.geometry
            }
                
            this.sphere.geometry = geometry
        }
        this.sphere.material = new SkySphereMaterial()
        
        this.sphere.material.uniforms.uColorDayCycleLow.value.set('#f0fff9')
        this.sphere.material.uniforms.uColorDayCycleHigh.value.set('#2e89ff')
        this.sphere.material.uniforms.uColorNightLow.value.set('#004794')
        this.sphere.material.uniforms.uColorNightHigh.value.set('#001624')
        this.sphere.material.uniforms.uColorSun.value.set('#ffa54a')
        this.sphere.material.uniforms.uColorDawn.value.set('#ff7038')
        this.sphere.material.uniforms.uDayCycleProgress.value = 0
        this.sphere.material.side = THREE.BackSide

        this.sphere.update()

        // this.sphere.material.wireframe = true
        this.sphere.mesh = new THREE.Mesh(this.sphere.geometry, this.sphere.material)
        this.customRender.scene.add(this.sphere.mesh)
    }

    setClouds()
    {
        // Rendered into the sky dome texture, so clouds tint the fog for free.
        // Stars/sun/moon are main-scene billboards and are not occluded — accepted.
        this.clouds = {}
        this.clouds.material = new CloudsMaterial()
        this.clouds.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(9.5, 64, 32),
            this.clouds.material
        )
        this.customRender.scene.add(this.clouds.mesh)
    }

    setSun()
    {
        this.sun = {}
        this.sun.distance = this.outerDistance - 50
        
        const geometry = new THREE.CircleGeometry(0.02 * this.sun.distance, 32)
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false })
        this.sun.mesh = new THREE.Mesh(geometry, material)
        this.group.add(this.sun.mesh)
    }

    setMoon()
    {
        this.moon = {}
        this.moon.distance = this.outerDistance - 50

        const geometry = new THREE.CircleGeometry(0.012 * this.moon.distance, 32)
        const material = new THREE.MeshBasicMaterial({
            color: '#e8f0ff',
            transparent: true,
            opacity: 0,
            depthWrite: false
        })
        this.moon.mesh = new THREE.Mesh(geometry, material)
        this.group.add(this.moon.mesh)
    }

    setShootingStar()
    {
        this.shootingStar = {}
        this.shootingStar.distance = this.outerDistance - 100
        this.shootingStar.active = false
        this.shootingStar.nextTime = 20
        this.shootingStar.startTime = 0
        this.shootingStar.duration = 1
        this.shootingStar.start = new THREE.Vector3()
        this.shootingStar.end = new THREE.Vector3()
        this.shootingStar.direction = new THREE.Vector3()

        const geometry = new THREE.PlaneGeometry(30, 0.8)
        const material = new THREE.MeshBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        this.shootingStar.mesh = new THREE.Mesh(geometry, material)
        this.group.add(this.shootingStar.mesh)
    }

    setStars()
    {
        this.stars = {}
        this.stars.count = 1000
        this.stars.distance = this.outerDistance

        this.stars.update = () =>
        {
            // Create geometry
            const positionArray = new Float32Array(this.stars.count * 3)
            const sizeArray = new Float32Array(this.stars.count)
            const colorArray = new Float32Array(this.stars.count * 3)

            for(let i = 0; i < this.stars.count; i++)
            {
                const iStride3 = i * 3

                // Position
                const position = new THREE.Vector3()
                position.setFromSphericalCoords(this.stars.distance, Math.acos(Math.random()), 2 * Math.PI * Math.random())

                positionArray[iStride3    ] = position.x
                positionArray[iStride3 + 1] = position.y
                positionArray[iStride3 + 2] = position.z

                // Size
                sizeArray[i] = Math.pow(Math.random() * 0.9, 10) + 0.1

                // Color
                const color = new THREE.Color()
                color.setHSL(Math.random(), 1, 0.5 + Math.random() * 0.5)
                colorArray[iStride3    ] = color.r
                colorArray[iStride3 + 1] = color.g
                colorArray[iStride3 + 2] = color.b
            }

            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionArray, 3))
            geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizeArray, 1))
            geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colorArray, 3))
            
            // Dispose of old one
            if(this.stars.geometry)
            {
                this.stars.geometry.dispose()
                this.stars.points.geometry = this.stars.geometry
            }
                
            this.stars.geometry = geometry
        }

        // Geometry
        this.stars.update()

        // Material
        // this.stars.material = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false })
        this.stars.material = new StarsMaterial()
        this.stars.material.uniforms.uHeightFragments.value = this.viewport.height * this.viewport.clampedPixelRatio

        // Points
        this.stars.points = new THREE.Points(this.stars.geometry, this.stars.material)
        this.group.add(this.stars.points)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        // Clouds
        const cloudsFolder = this.debug.ui.getFolder('view/sky/clouds')

        cloudsFolder.add(this.clouds.material.uniforms.uCloudScale, 'value').min(0.1).max(3).step(0.01).name('uCloudScale')
        cloudsFolder.add(this.clouds.material.uniforms.uCoverage, 'value').min(0).max(1).step(0.01).name('uCoverage')
        cloudsFolder.add(this.clouds.material.uniforms.uSoftness, 'value').min(0.02).max(1).step(0.01).name('uSoftness')
        cloudsFolder.add(this.clouds.material.uniforms.uOpacity, 'value').min(0).max(1).step(0.01).name('uOpacity')

        // Sphere
        const sphereGeometryFolder = this.debug.ui.getFolder('view/sky/sphere/geometry')

        sphereGeometryFolder.add(this.sphere, 'widthSegments').min(4).max(512).step(1).name('widthSegments').onChange(() => { this.sphere.update() })
        sphereGeometryFolder.add(this.sphere, 'heightSegments').min(4).max(512).step(1).name('heightSegments').onChange(() => { this.sphere.update() })

        const sphereMaterialFolder = this.debug.ui.getFolder('view/sky/sphere/material')

        sphereMaterialFolder.add(this.sphere.material.uniforms.uAtmosphereElevation, 'value').min(0).max(5).step(0.01).name('uAtmosphereElevation')
        sphereMaterialFolder.add(this.sphere.material.uniforms.uAtmospherePower, 'value').min(0).max(20).step(1).name('uAtmospherePower')
        sphereMaterialFolder.addColor(this.sphere.material.uniforms.uColorDayCycleLow, 'value').name('uColorDayCycleLow')
        sphereMaterialFolder.addColor(this.sphere.material.uniforms.uColorDayCycleHigh, 'value').name('uColorDayCycleHigh')
        sphereMaterialFolder.addColor(this.sphere.material.uniforms.uColorNightLow, 'value').name('uColorNightLow')
        sphereMaterialFolder.addColor(this.sphere.material.uniforms.uColorNightHigh, 'value').name('uColorNightHigh')
        sphereMaterialFolder.add(this.sphere.material.uniforms.uDawnAngleAmplitude, 'value').min(0).max(1).step(0.001).name('uDawnAngleAmplitude')
        sphereMaterialFolder.add(this.sphere.material.uniforms.uDawnElevationAmplitude, 'value').min(0).max(1).step(0.01).name('uDawnElevationAmplitude')
        sphereMaterialFolder.addColor(this.sphere.material.uniforms.uColorDawn, 'value').name('uColorDawn')
        sphereMaterialFolder.add(this.sphere.material.uniforms.uSunAmplitude, 'value').min(0).max(3).step(0.01).name('uSunAmplitude')
        sphereMaterialFolder.add(this.sphere.material.uniforms.uSunMultiplier, 'value').min(0).max(1).step(0.01).name('uSunMultiplier')
        sphereMaterialFolder.addColor(this.sphere.material.uniforms.uColorSun, 'value').name('uColorSun')
    
        // Stars
        const starsFolder = this.debug.ui.getFolder('view/sky/stars')

        starsFolder.add(this.stars, 'count').min(100).max(50000).step(100).name('count').onChange(() => { this.stars.update() })
        starsFolder.add(this.stars.material.uniforms.uSize, 'value').min(0).max(1).step(0.0001).name('uSize')
        starsFolder.add(this.stars.material.uniforms.uBrightness, 'value').min(0).max(1).step(0.001).name('uBrightness')
    }

    update()
    {
        const dayState = this.state.day
        const sunState = this.state.sun
        const playerState = this.state.player
        const weatherState = this.state.weather

        // Group
        this.group.position.set(
            playerState.position.current[0],
            playerState.position.current[1],
            playerState.position.current[2]
        )

        // Sphere
        this.sphere.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
        this.sphere.material.uniforms.uDayCycleProgress.value = dayState.progress
        this.sphere.material.uniforms.uStormness.value = weatherState.rainIntensity
        this.sphere.material.uniforms.uFlash.value = weatherState.flash

        // Clouds
        this.clouds.material.uniforms.uTime.value = this.state.time.elapsed
        this.clouds.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
        this.clouds.material.uniforms.uStormness.value = weatherState.rainIntensity
        this.clouds.material.uniforms.uFlash.value = weatherState.flash

        // Sun (the disc hides behind the storm deck)
        this.sun.mesh.material.opacity = 1 - weatherState.rainIntensity * 0.8
        this.sun.mesh.position.set(
            sunState.position.x * this.sun.distance,
            sunState.position.y * this.sun.distance,
            sunState.position.z * this.sun.distance
        )
        this.sun.mesh.lookAt(
            playerState.position.current[0],
            playerState.position.current[1],
            playerState.position.current[2]
        )

        // Moon (opposite the sun, fades in at night)
        const nightness = Math.min(Math.max((- sunState.position.y - 0.05) * 5, 0), 1)

        this.moon.mesh.position.set(
            - sunState.position.x * this.moon.distance,
            - sunState.position.y * this.moon.distance,
            - sunState.position.z * this.moon.distance
        )
        this.moon.mesh.lookAt(
            playerState.position.current[0],
            playerState.position.current[1],
            playerState.position.current[2]
        )
        this.moon.mesh.material.opacity = nightness

        // Shooting star
        const time = this.state.time

        if(!this.shootingStar.active && nightness > 0.5 && time.elapsed > this.shootingStar.nextTime)
        {
            this.shootingStar.active = true
            this.shootingStar.startTime = time.elapsed

            const theta = Math.random() * Math.PI * 2
            const phi = (0.15 + Math.random() * 0.25) * Math.PI
            this.shootingStar.start.setFromSphericalCoords(this.shootingStar.distance, phi, theta)
            this.shootingStar.end.setFromSphericalCoords(this.shootingStar.distance, phi + 0.15, theta + 0.25)
        }

        if(this.shootingStar.active)
        {
            const progress = (time.elapsed - this.shootingStar.startTime) / this.shootingStar.duration

            if(progress >= 1)
            {
                this.shootingStar.active = false
                this.shootingStar.nextTime = time.elapsed + 20 + Math.random() * 40
                this.shootingStar.mesh.material.opacity = 0
            }
            else
            {
                this.shootingStar.mesh.position.lerpVectors(this.shootingStar.start, this.shootingStar.end, progress)
                this.shootingStar.mesh.lookAt(
                    playerState.position.current[0],
                    playerState.position.current[1],
                    playerState.position.current[2]
                )

                // Roll the streak so its long axis follows the motion
                this.shootingStar.direction.subVectors(this.shootingStar.end, this.shootingStar.start).normalize()
                const localDirection = this.shootingStar.direction.clone().applyQuaternion(this.shootingStar.mesh.quaternion.clone().invert())
                this.shootingStar.mesh.rotateZ(Math.atan2(localDirection.y, localDirection.x))

                this.shootingStar.mesh.material.opacity = Math.sin(progress * Math.PI) * nightness
            }
        }

        // Stars
        this.stars.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
        this.stars.material.uniforms.uHeightFragments.value = this.viewport.height * this.viewport.clampedPixelRatio

        // Render in render target
        const sourceCamera = this.view.camera.instance
        this.customRender.camera.quaternion.copy(sourceCamera.quaternion)
        this.customRender.camera.fov = sourceCamera.fov
        this.customRender.camera.aspect = sourceCamera.aspect
        this.customRender.camera.near = sourceCamera.near
        this.customRender.camera.far = sourceCamera.far
        this.customRender.camera.zoom = sourceCamera.zoom
        this.customRender.camera.focus = sourceCamera.focus
        this.customRender.camera.filmGauge = sourceCamera.filmGauge
        this.customRender.camera.filmOffset = sourceCamera.filmOffset
        this.customRender.camera.updateProjectionMatrix()
        this.renderer.instance.setRenderTarget(this.customRender.renderTarget)
        this.renderer.instance.render(this.customRender.scene, this.customRender.camera)
        this.renderer.instance.setRenderTarget(null)
    }

    resize()
    {
        this.customRender.renderTarget.setSize(
            this.viewport.width * this.customRender.resolutionRatio,
            this.viewport.height * this.customRender.resolutionRatio
        )
    }
}
