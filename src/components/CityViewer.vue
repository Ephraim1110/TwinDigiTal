<template>
	<div ref="container" class="viewer"></div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"

const container = ref<HTMLDivElement | null>(null)

onMounted(() => {
	if (!container.value) return

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

	// Contrôles caméra
	const controls = new OrbitControls(camera, renderer.domElement)
	controls.enableDamping = true
	controls.screenSpacePanning = false
	controls.minDistance = 1
	controls.maxDistance = 10000
	controls.maxPolarAngle = Math.PI / 2

	// Charger le modèle GLTF
	const loader = new GLTFLoader()
	loader.load("/models/scene.gltf", (gltf) => {
		console.log("GLTF loaded", gltf)
		scene.add(gltf.scene)

		// Helpers visuels
		const axesHelper = new THREE.AxesHelper(500)
		scene.add(axesHelper)

		// Centrer la caméra et les contrôles sur le modèle
		const box = new THREE.Box3().setFromObject(gltf.scene)
		const size = box.getSize(new THREE.Vector3()).length()
		const center = box.getCenter(new THREE.Vector3())

		// Box helper
		const boxHelper = new THREE.Box3Helper(box, 0xff0000)
		scene.add(boxHelper)

		camera.position.set(center.x + size, center.y + size * 0.5, center.z + size)
		camera.lookAt(center)
		controls.target.copy(center)
		controls.update()
	})

	// Animation loop
	const animate = () => {
		requestAnimationFrame(animate)
		if (!renderer || !camera) {
			console.error('Renderer ou caméra manquant !')
			return
		}
		controls.update()
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
