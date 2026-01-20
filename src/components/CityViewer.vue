<template>
  <div ref="container" class="viewer"></div>

  <div class="lamp-ui">
    <h4>Lamp UI</h4>
    <div class="row">
      <button @click="lampStore.toggle" class="toggle-btn" :class="{ on: lampStore.lampOn }">
        {{ lampStore.lampOn ? 'ON' : 'OFF' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { useLampStore } from '@/stores/lamp'

const container = ref<HTMLDivElement | null>(null)
const lampStore = useLampStore()

// Three.js references
const allLampLights = ref<THREE.PointLight[]>([])
const allLampHelpers = ref<THREE.PointLightHelper[]>([])
const allLamps = ref<THREE.Group[]>([])
const lampOn = ref(true)
const lightIntensity = 1.8
const lightColor = '#fff6d5'

// Toggle emissive material
function applyEmissiveToggle(root: THREE.Object3D, on: boolean) {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh
      const mat: any = mesh.material
      if (!mat) return

      if (on) {
        if (mat.userData?._emissiveBackup) {
          mat.emissive.copy(mat.userData._emissiveBackup)
          mat.emissiveIntensity = mat.userData._emissiveIntensityBackup ?? 1
        }
      } else {
        if ('emissive' in mat) {
          mat.userData = mat.userData || {}
          mat.userData._emissiveBackup = mat.emissive?.clone ? mat.emissive.clone() : new THREE.Color(0x000000)
          mat.userData._emissiveIntensityBackup = mat.emissiveIntensity ?? 1
          mat.emissive.setHex(0x000000)
          mat.emissiveIntensity = 0
        }
      }
      mat.needsUpdate = true
    }
  })
}

// Mettre à jour toutes les lampes selon lampOn
function setLampOnInternal(on: boolean) {
  lampOn.value = on
  allLampLights.value.forEach(light => light.intensity = on ? lightIntensity : 0)
  allLampHelpers.value.forEach(helper => helper.visible = on)
  allLamps.value.forEach(lamp => applyEmissiveToggle(lamp, on))
}

onMounted(() => {
  if (!container.value) return

  // Connecter au store / backend
  lampStore.connectSocket()

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xaaaaaa)

  // Grille et lumières
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
  camera.position.set(11.3, 1.5, 5.1)

  scene.add(new THREE.DirectionalLight(0xffffff, 3))
  scene.add(new THREE.AmbientLight(0xffffff, 0.6))

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  container.value.appendChild(renderer.domElement)

  const keys: Record<string, boolean> = {}
  window.addEventListener('keydown', (e) => keys[e.key] = true)
  window.addEventListener('keyup', (e) => keys[e.key] = false)

  // Charger modèles GLTF
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
  const loader = new GLTFLoader()
  loader.setDRACOLoader(dracoLoader)

  loader.load('/models/scene.gltf', (gltf) => {
    scene.add(gltf.scene)
    scene.add(new THREE.AxesHelper(500))

    loader.load('/lamps/lamp.gltf', (lampGltf) => {
      const baseLamp = lampGltf.scene || lampGltf.scenes?.[0]
      if (!baseLamp) return

      // Positions des 12 lampes
      const lampPositions = [
        { x: -12.6, y: 2.4, z: 5.9 }, { x: -9.1, y: 2.4, z: 5.9 }, { x: -5.6, y: 2.4, z: 5.9 },
        { x: -12.6, y: 2.4, z: 4.5 }, { x: -9.1, y: 2.4, z: 4.5 }, { x: -5.6, y: 2.4, z: 4.5 },
        { x: -12.6, y: 2.4, z: 3.1 }, { x: -9.1, y: 2.4, z: 3.1 }, { x: -5.6, y: 2.4, z: 3.1 },
        { x: -12.6, y: 2.4, z: 1.7 }, { x: -9.1, y: 2.4, z: 1.7 }, { x: -5.6, y: 2.4, z: 1.7 }
      ]

      lampPositions.forEach((pos) => {
        const lamp = baseLamp.clone()
        lamp.position.set(pos.x, pos.y, pos.z)
        lamp.rotation.set(0, Math.PI, 0)
        lamp.scale.set(1.554, 1.554, 1.554)

        // Lumière
        const pl = new THREE.PointLight(new THREE.Color(lightColor), lampOn.value ? lightIntensity : 0, 10)
        pl.position.set(0, 0.2, 0)
        lamp.add(pl)
        allLampLights.value.push(pl)

        // Helper
        const helper = new THREE.PointLightHelper(pl, 0.15)
        lamp.add(helper)
        helper.visible = lampOn.value
        allLampHelpers.value.push(helper)

        allLamps.value.push(lamp)
        scene.add(lamp)
      })

      // Appliquer l'état initial du store
      setLampOnInternal(lampStore.lampOn)

      // Sync store → lampes
      lampStore.$subscribe(() => {
        setLampOnInternal(lampStore.lampOn)
      })
    })
  })

  // Animation et déplacement caméra
  let yaw = 0
  const animate = () => {
    requestAnimationFrame(animate)
    const step = 0.15
    let moved = false

    if (keys['ArrowLeft']) { yaw += 0.05; moved = true }
    if (keys['ArrowRight']) { yaw -= 0.05; moved = true }

    const direction = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    if (keys['ArrowUp']) { camera.position.x += direction.x * step; camera.position.z += direction.z * step; moved = true }
    if (keys['ArrowDown']) { camera.position.x -= direction.x * step; camera.position.z -= direction.z * step; moved = true }

    if (moved) camera.position.y = 1.5
    camera.rotation.set(0, yaw, 0)
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

  // Toggle avec la touche 'L'
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'l') lampStore.toggle()
  })
})
</script>

<style scoped>
.viewer { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; overflow: hidden; z-index: 1; }
.lamp-ui { position: fixed; top: 12px; right: 12px; width: 220px; background: rgba(255,255,255,0.95); padding: 8px; border-radius:6px; z-index:60; box-shadow:0 6px 18px rgba(0,0,0,0.12);}
.lamp-ui h4 { margin:0 0 8px 0; font-size:14px; }
.lamp-ui .row { display:flex; align-items:center; gap:8px; margin:6px 0;}
.toggle-btn { width:100%; padding:10px 16px; font-size:16px; font-weight:bold; border:none; border-radius:4px; cursor:pointer; background:#ccc; color:#333; transition:0.2s;}
.toggle-btn.on { background:#4caf50; color:#fff;}
</style>
