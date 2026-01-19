<template>
	<div ref="container" class="viewer"></div>

	<div class="lamp-ui">
		<h4>Lamp UI</h4>
		<div class="row">
			<button @click="lampStore.toggle" class="toggle-btn" :class="{ on: lampStore.lampOn }">
				{{ lampStore.lampOn ? 'ON' : 'OFF' }}
			</button>
		</div>
		
		<div class="divider"></div>
		<h5>Move All Lamps</h5>
		
		<div class="row">
			<label>X:</label>
			<input type="range" min="-10" max="10" step="0.1" v-model.number="lampOffsetX" @input="updateAllLampsPosition">
			<span class="value">{{ lampOffsetX.toFixed(1) }}</span>
		</div>
		
		<div class="row">
			<label>Y:</label>
			<input type="range" min="-3" max="5" step="0.1" v-model.number="lampOffsetY" @input="updateAllLampsPosition">
			<span class="value">{{ lampOffsetY.toFixed(1) }}</span>
		</div>
		
		<div class="row">
			<label>Z:</label>
			<input type="range" min="-10" max="10" step="0.1" v-model.number="lampOffsetZ" @input="updateAllLampsPosition">
			<span class="value">{{ lampOffsetZ.toFixed(1) }}</span>
		</div>

		<div class="divider"></div>
		<h5>Spacing</h5>
		
		<div class="row">
			<label>Distance:</label>
			<input type="range" min="0.5" max="2" step="0.1" v-model.number="lampSpacing" @input="updateAllLampsPosition">
			<span class="value">{{ lampSpacing.toFixed(1) }}x</span>
		</div>

		<button @click="logFinalCoordinates" class="log-btn">📋 Log Coords</button>
		<button @click="resetLampsPosition" class="reset-btn">Reset Position</button>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { useLampStore } from '@/stores/lamp'

const container = ref<HTMLDivElement | null>(null)
const lampStore = useLampStore()

// UI state and lamp references
const lampLight = ref<THREE.PointLight | null>(null)
const lampLightHelper = ref<THREE.PointLightHelper | null>(null)
const lampOn = ref<boolean>(true)
const lightIntensity = 1.8
const lightColor = '#fff6d5'

// Lamp positioning
const lampOffsetX = ref<number>(0)
const lampOffsetY = ref<number>(0)
const lampOffsetZ = ref<number>(0)
const lampSpacing = ref<number>(1)
const allLamps = ref<THREE.Group[]>([])
const lampBasePositions = ref<Map<THREE.Group, {x: number, y: number, z: number}>>(new Map())

function applyEmissiveToggle(root: THREE.Object3D, on: boolean) {
	root.traverse((obj) => {
		if ((obj as THREE.Mesh).isMesh) {
			const mesh = obj as THREE.Mesh
			const mat: any = mesh.material
			if (!mat) return
			
			if (on) {
				if (mat.userData && mat.userData._emissiveBackup) {
					try {
						mat.emissive.copy(mat.userData._emissiveBackup)
						mat.emissiveIntensity = mat.userData._emissiveIntensityBackup ?? 1
					} catch (e) {}
				}
			} else {
				if (mat && 'emissive' in mat) {
					mat.userData = mat.userData || {}
					try {
						mat.userData._emissiveBackup = mat.emissive?.clone ? mat.emissive.clone() : new THREE.Color(0x000000)
						mat.userData._emissiveIntensityBackup = mat.emissiveIntensity ?? 1
						mat.emissive.setHex(0x000000)
						mat.emissiveIntensity = 0
					} catch (e) {}
				}
			}
			mat.needsUpdate = true
		}
	})
}

function setLampOnInternal(on: boolean) {
	lampOn.value = on
	if (lampLight.value) lampLight.value.intensity = on ? lightIntensity : 0
	if (lampLightHelper.value) lampLightHelper.value.visible = on
	if (lampLight.value && lampLight.value.parent) applyEmissiveToggle(lampLight.value.parent, on)
}

function toggleLamp() { 
	setLampOnInternal(!lampOn.value) 
}

function updateAllLampsPosition() {
	allLamps.value.forEach((lamp) => {
		const basePos = lampBasePositions.value.get(lamp)
		if (basePos) {
			lamp.position.set(
				basePos.x * lampSpacing.value + lampOffsetX.value,
				basePos.y + lampOffsetY.value,
				basePos.z * lampSpacing.value + lampOffsetZ.value
			)
		}
	})
}

function resetLampsPosition() {
	lampOffsetX.value = 0
	lampOffsetY.value = 0
	lampOffsetZ.value = 0
	lampSpacing.value = 1
	updateAllLampsPosition()
}

function logFinalCoordinates() {
	console.log('\n========== COORDONNÉES FINALES DES LAMPES ==========\n')
	
	const lampCoords: Array<{index: number, x: number, y: number, z: number}> = []
	
	allLamps.value.forEach((lamp, index) => {
		const pos = lamp.position
		lampCoords.push({
			index: index + 1,
			x: parseFloat(pos.x.toFixed(3)),
			y: parseFloat(pos.y.toFixed(3)),
			z: parseFloat(pos.z.toFixed(3))
		})
		console.log(`Lampe ${index + 1}: { x: ${pos.x.toFixed(3)}, y: ${pos.y.toFixed(3)}, z: ${pos.z.toFixed(3)} }`)
	})
	
	// Afficher aussi en format tableau
	console.log('\n--- Format tableau ---')
	console.log(lampCoords)
	
	// Afficher en format JSON pour copier facilement
	console.log('\n--- Format JSON (copier-coller) ---')
	console.log(JSON.stringify(lampCoords, null, 2))
	
	console.log('\n====================================================\n')
}

onMounted(() => {
	if (!container.value) return

	// Connecter au serveur Socket.io
	lampStore.connectSocket()

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

		loader.load('/lamps/lamp.gltf', (lampGltf) => {
			const baseLamp = lampGltf.scene || lampGltf.scenes?.[0]
			if (!baseLamp) return

			// Configuration des lampes sur le plafond (12 lampes en grille 3x4)
			const lampPositions = [
				{ x: -12.6, y: 2.4, z: 5.9 },
				{ x: -9.1, y: 2.4, z: 5.9 },
				{ x: -5.6, y: 2.4, z: 5.9 },
				{ x: -12.6, y: 2.4, z: 4.5 },
				{ x: -9.1, y: 2.4, z: 4.5 },
				{ x: -5.6, y: 2.4, z: 4.5 },
				{ x: -12.6, y: 2.4, z: 3.1 },
				{ x: -9.1, y: 2.4, z: 3.1 },
				{ x: -5.6, y: 2.4, z: 3.1 },
				{ x: -12.6, y: 2.4, z: 1.7 },
				{ x: -9.1, y: 2.4, z: 1.7 },
				{ x: -5.6, y: 2.4, z: 1.7 }
			]

			// Créer chaque lampe
			lampPositions.forEach((pos, index) => {
				const lamp = baseLamp.clone()

				// Appliquer la transformation avec les coordonnées finales
				lamp.position.set(pos.x, pos.y, pos.z)
				lamp.rotation.set(
					THREE.MathUtils.degToRad(0),
					THREE.MathUtils.degToRad(180),
					THREE.MathUtils.degToRad(0)
				)
				lamp.scale.set(1.554056, 1.554056, 1.554056)

				// Stocker les positions de base dans la Map
				lampBasePositions.value.set(lamp, { x: pos.x, y: pos.y, z: pos.z })

				lamp.traverse((obj) => {
					if ((obj as THREE.Mesh).isMesh) {
						const mesh = obj as THREE.Mesh
						mesh.castShadow = false
						mesh.receiveShadow = false
						const mat: any = mesh.material
						if (mat && 'emissive' in mat) {
							mat.userData = mat.userData || {}
							try {
								mat.userData._emissiveBackup = mat.emissive?.clone ? mat.emissive.clone() : new THREE.Color(0x000000)
								mat.userData._emissiveIntensityBackup = mat.emissiveIntensity ?? 1
								mat.emissive.setHex(0x000000)
								mat.emissiveIntensity = 0
								mat.needsUpdate = true
							} catch (e) {}
						}
					}
				})

				// Créer et attacher la lumière ponctuelle
				const pl = new THREE.PointLight(new THREE.Color(lightColor), lampOn.value ? lightIntensity : 0, 10)
				pl.position.set(0, 0.2, 0)
				lamp.add(pl)

				// Conserver la référence de la première lampe pour le toggle
				if (index === 0) {
					lampLight.value = pl
				}

				const helper = new THREE.PointLightHelper(pl, 0.15)
				lamp.add(helper)
				
				// Conserver le helper de la première lampe pour la visibilité
				if (index === 0) {
					lampLightHelper.value = helper
				}
				helper.visible = lampOn.value

				// Ajouter la lampe à la liste de toutes les lampes
				allLamps.value.push(lamp)
				scene.add(lamp)
				console.log(`Lamp ${index + 1} loaded at position:`, lamp.position)
			})

			setLampOnInternal(lampOn.value)

			// Synchroniser avec le store
			lampStore.$subscribe((mutation, state) => {
				setLampOnInternal(state.lampOn)
			})
		})
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
		
		const target = new THREE.Vector3(
			camera.position.x + Math.sin(yaw), 
			1.5, 
			camera.position.z + Math.cos(yaw)
		)
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

	// Toggle lamp with 'L' key
	window.addEventListener('keydown', (e) => {
		if (e.key.toLowerCase() === 'l') {
			lampStore.toggle()
		}
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

.lamp-ui {
	position: fixed;
	top: 12px;
	right: 12px;
	width: 220px;
	background: rgba(255, 255, 255, 0.95);
	padding: 8px;
	border-radius: 6px;
	z-index: 60;
	box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}

.lamp-ui h4 { 
	margin: 0 0 8px 0; 
	font-size: 14px;
}

.lamp-ui .row { 
	display: flex; 
	align-items: center; 
	gap: 8px; 
	margin: 6px 0;
}

.lamp-ui label { 
	width: 70px;
}

.lamp-ui input[type="range"] {
	flex: 1;
}

.lamp-ui .toggle-btn {
	width: 100%;
	padding: 10px 16px;
	font-size: 16px;
	font-weight: bold;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	background: #ccc;
	color: #333;
	transition: background 0.2s, color 0.2s;
}

.lamp-ui .toggle-btn.on {
	background: #4caf50;
	color: white;
}

.lamp-ui .divider {
	height: 1px;
	background: #ddd;
	margin: 10px 0;
}

.lamp-ui h5 {
	margin: 8px 0 6px 0;
	font-size: 12px;
	font-weight: 600;
	color: #666;
}

.lamp-ui input[type="range"] {
	flex: 1;
	height: 5px;
	cursor: pointer;
}

.lamp-ui .value {
	font-size: 12px;
	min-width: 35px;
	text-align: right;
	color: #666;
}

.lamp-ui .reset-btn {
	width: 100%;
	padding: 8px 12px;
	margin-top: 8px;
	font-size: 13px;
	border: 1px solid #999;
	border-radius: 4px;
	cursor: pointer;
	background: #f5f5f5;
	color: #333;
	transition: background 0.2s;
}

.lamp-ui .reset-btn:hover {
	background: #e0e0e0;
}

.lamp-ui .log-btn {
	width: 100%;
	padding: 8px 12px;
	margin-top: 8px;
	font-size: 13px;
	border: 1px solid #2196F3;
	border-radius: 4px;
	cursor: pointer;
	background: #e3f2fd;
	color: #1976d2;
	transition: background 0.2s;
	font-weight: 600;
}

.lamp-ui .log-btn:hover {
	background: #bbdefb;
}
</style>