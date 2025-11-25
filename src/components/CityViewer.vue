<template>
  <div ref="container" class="viewer"></div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'

const container = ref<HTMLDivElement | null>(null)

onMounted(() => {
  if (!container.value) return

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xaaaaaa)

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

  const dirLight = new THREE.DirectionalLight(0xffffff, 3)
  dirLight.position.set(1, 1, 1)
  scene.add(dirLight)
  scene.add(new THREE.AmbientLight(0xffffff, 0.6))

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  container.value.appendChild(renderer.domElement)

  camera.position.set(11.326652673104228, 1.5, 5.121259248977974)

  const keys: Record<string, boolean> = {}
  window.addEventListener('keydown', (e) => (keys[e.key] = true))
  window.addEventListener('keyup', (e) => (keys[e.key] = false))

  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

  const loader = new GLTFLoader()
  loader.setDRACOLoader(dracoLoader)

  loader.load('/models/scene.gltf', (gltf) => {
	scene.add(gltf.scene)
	const axesHelper = new THREE.AxesHelper(500)
	scene.add(axesHelper)

	const box = new THREE.Box3().setFromObject(gltf.scene)
	const center = box.getCenter(new THREE.Vector3())

	loader.load(
	  '/lamps/lamp.gltf',
	  (lampGltf) => {
		const lamp = lampGltf.scene || lampGltf.scenes?.[0]
		if (!lamp) return

		// Apply fixed transform from user
		lamp.position.set(-7.7, -1.3, 7.2)
		lamp.rotation.set(
		  THREE.MathUtils.degToRad(0),
		  THREE.MathUtils.degToRad(180),
		  THREE.MathUtils.degToRad(0)
		)
		lamp.scale.set(1.554056, 1.554056, 1.554056)

		lamp.traverse((obj) => {
		  if ((obj as THREE.Mesh).isMesh) {
			const mesh = obj as THREE.Mesh
			mesh.castShadow = false
			mesh.receiveShadow = false
		  }
		})

		scene.add(lamp)
		console.log('Lamp fixed at default transform', lamp.position, lamp.rotation, lamp.scale)
	  },
	  undefined,
	  (err) => console.error('Erreur lors du chargement de lamp.gltf', err)
	)
  })

  let yaw = 0
  const animate = () => {
	requestAnimationFrame(animate)
	const step = 0.15
	let moved = false
	if (keys['ArrowLeft']) {
	  yaw += 0.05
	  moved = true
	}
	if (keys['ArrowRight']) {
	  yaw -= 0.05
	  moved = true
	}
	camera.rotation.set(0, yaw, 0)
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
	if (moved) camera.position.y = 1.5
	const target = new THREE.Vector3(camera.position.x + Math.sin(yaw), 1.5, camera.position.z + Math.cos(yaw))
	camera.lookAt(target)
	renderer.render(scene, camera)
  }
  animate()

  window.addEventListener('resize', () => {
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
