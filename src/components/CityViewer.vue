<template>
	<div ref="container" class="viewer"></div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader"

const container = ref<HTMLDivElement | null>(null)

onMounted(() => {
	if (!container.value) return

	// Gestion des touches pour déplacement simultané (déclaré ici pour portée globale)
	const keys: { [key: string]: boolean } = {}

	const scene = new THREE.Scene()
	scene.background = new THREE.Color(0xaaaaaa)

	// Grille au sol
	const grid = new THREE.GridHelper(2000, 40, 0x000000, 0x000000)
	grid.material.opacity = 0.2
	grid.material.transparent = true
	scene.add(grid)

	const camera = new THREE.PerspectiveCamera(
		60,
		container.value.clientWidth / container.value.clientHeight,
		0.1,
		100000
	)

	// Lumières
	const dirLight = new THREE.DirectionalLight(0xffffff, 3)
	dirLight.position.set(1, 1, 1)
	scene.add(dirLight)
	scene.add(new THREE.AmbientLight(0xffffff, 0.6))

	const renderer = new THREE.WebGLRenderer({ antialias: true })
	renderer.setSize(container.value.clientWidth, container.value.clientHeight)
	container.value.appendChild(renderer.domElement)
	console.log('Renderer ajouté au DOM', renderer.domElement)

	// Plus de OrbitControls : gestion FPS clavier custom

	// Charger le modèle GLTF avec DRACOLoader
	const dracoLoader = new DRACOLoader()
	dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/') // ou chemin local si besoin

	const loader = new GLTFLoader()
	loader.setDRACOLoader(dracoLoader)
	loader.load("/models/scene.gltf", (gltf) => {
		console.log("GLTF loaded", gltf)
		scene.add(gltf.scene)

		// Helpers visuels
		const axesHelper = new THREE.AxesHelper(500)
		scene.add(axesHelper)

		// Centrer la caméra sur le modèle (optionnel)
		const box = new THREE.Box3().setFromObject(gltf.scene)
		const size = box.getSize(new THREE.Vector3()).length()
		const center = box.getCenter(new THREE.Vector3())

		// Box helper
		const boxHelper = new THREE.Box3Helper(box, 0xff0000)
		scene.add(boxHelper)

		camera.position.set(11.326652673104228, 1.5, 5.121259248977974)

		// Gestion des touches pour déplacement FPS
		window.addEventListener('keydown', (e) => {
			keys[e.key] = true
		})
		window.addEventListener('keyup', (e) => {
			keys[e.key] = false
		})
	})

	// Animation loop FPS
	let yaw = 0 // angle horizontal
	const animate = () => {
		requestAnimationFrame(animate)
		if (!renderer || !camera) {
			console.error('Renderer ou caméra manquant !')
			return
		}

	const step = 0.15
		let moved = false

		// Rotation Y (gauche/droite)
		if (keys['ArrowLeft']) {
			yaw += 0.05
			moved = true
		}
		if (keys['ArrowRight']) {
			yaw -= 0.05
			moved = true
		}
		// Applique la rotation à la caméra
		camera.rotation.set(0, yaw, 0)

		// Calcul du vecteur direction (avant/arrière)
		const direction = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
		if (keys['ArrowUp']) {
			camera.position.x += direction.x * step
			camera.position.z += direction.z * step
			moved = true
		}
		if (keys['ArrowDown']) {
			camera.position.x -= direction.x * step
			camera.position.z -= direction.z * step
			moved = true
		}
		if (moved) {
			camera.position.y = 1.5
		}

		// La caméra regarde toujours devant elle
		const target = new THREE.Vector3(
			camera.position.x + Math.sin(yaw),
			1.5,
			camera.position.z + Math.cos(yaw)
		)
		camera.lookAt(target)

		renderer.render(scene, camera)
	}
	animate()

	// Resize
	window.addEventListener("resize", () => {
		if (!container.value) return
		camera.aspect = container.value.clientWidth / container.value.clientHeight
		camera.updateProjectionMatrix()
		renderer.setSize(container.value.clientWidth, container.value.clientHeight)
	})
})
</script>

<style scoped>
.viewer {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	margin: 0;
	padding: 0;
	overflow: hidden;
	z-index: 1;
}
</style>
