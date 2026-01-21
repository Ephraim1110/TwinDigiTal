<template>
  <div ref="container" class="viewer"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { useLampStore } from '@/stores/lamp'

const container = ref<HTMLDivElement | null>(null)
const lampStore = useLampStore()
const isDev = import.meta.env.DEV

// Three.js references
const allLampLights = ref<THREE.PointLight[]>([])
const allLampHelpers = ref<THREE.PointLightHelper[]>([])
const allLamps = ref<THREE.Group[]>([])

// Références pour le cleanup
let renderer: THREE.WebGLRenderer | null = null
let animationId: number | null = null
const eventListeners: Array<{ target: any; type: string; handler: any }> = []

// Configuration
const LIGHT_INTENSITY = 1.8
const LIGHT_COLOR = '#fff6d5'

// Helper pour ajouter des listeners avec tracking
function addTrackedListener(target: any, type: string, handler: any) {
  target.addEventListener(type, handler)
  eventListeners.push({ target, type, handler })
}

// Toggle emissive material avec vérification de type
function applyEmissiveToggle(root: THREE.Object3D, on: boolean) {
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return

    const mesh = obj as THREE.Mesh
    const mat = mesh.material as THREE.Material & {
      emissive?: THREE.Color
      emissiveIntensity?: number
      userData?: any
    }

    if (!mat) return

    const supportsEmissive =
      mat instanceof THREE.MeshStandardMaterial ||
      mat instanceof THREE.MeshPhongMaterial ||
      mat instanceof THREE.MeshLambertMaterial

    if (!supportsEmissive || !mat.emissive) return

    if (on) {
      if (mat.userData?._emissiveBackup) {
        mat.emissive.copy(mat.userData._emissiveBackup)
        mat.emissiveIntensity = mat.userData._emissiveIntensityBackup ?? 1
      }
    } else {
      mat.userData = mat.userData || {}
      if (!mat.userData._emissiveBackup) {
        mat.userData._emissiveBackup = mat.emissive.clone()
        mat.userData._emissiveIntensityBackup = mat.emissiveIntensity ?? 1
      }
      mat.emissive.setHex(0x000000)
      mat.emissiveIntensity = 0
    }
    mat.needsUpdate = true
  })
}

// Mettre à jour toutes les lampes
function updateAllLamps(on: boolean) {
  const targetIntensity = on ? LIGHT_INTENSITY : 0

  allLampLights.value.forEach((light) => {
    light.intensity = targetIntensity
  })

  allLampHelpers.value.forEach((helper) => {
    helper.visible = on && isDev
  })

  allLamps.value.forEach((lamp) => {
    applyEmissiveToggle(lamp, on)
  })
}

onMounted(() => {
  if (!container.value) return

  // ✅ Connexion au Web of Things (store WoT direct)
  lampStore.connectWoT()

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xaaaaaa)

  // Grille
  const grid = new THREE.GridHelper(2000, 40, 0x000000, 0x000000)
  ;(grid.material as THREE.Material).opacity = 0.2
  ;(grid.material as THREE.Material).transparent = true
  scene.add(grid)

  // Camera
  const camera = new THREE.PerspectiveCamera(
    60,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    100000
  )
  camera.position.set(11.3, 1.5, 5.1)

  // Lumières de la scène
  const dirLight = new THREE.DirectionalLight(0xffffff, 3)
  dirLight.position.set(10, 10, 10)
  scene.add(dirLight)
  scene.add(new THREE.AmbientLight(0xffffff, 0.6))

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.value.appendChild(renderer.domElement)

  // Contrôles clavier (caméra seulement)
  const keys: Record<string, boolean> = {}
  addTrackedListener(window, 'keydown', (e: KeyboardEvent) => {
    keys[e.key] = true
  })
  addTrackedListener(window, 'keyup', (e: KeyboardEvent) => {
    keys[e.key] = false
  })

  // Charger modèles GLTF
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
  const loader = new GLTFLoader()
  loader.setDRACOLoader(dracoLoader)

  // Charger la scène principale
  loader.load(
    '/models/scene.gltf',
    (gltf) => {
      scene.add(gltf.scene)

      if (isDev) {
        scene.add(new THREE.AxesHelper(500))
      }

      // Charger les lampes
      loader.load(
        '/lamps/lamp.gltf',
        (lampGltf) => {
          const baseLamp = lampGltf.scene || lampGltf.scenes?.[0]
          if (!baseLamp) {
            console.error('❌ Impossible de charger le modèle de lampe')
            return
          }

          const lampPositions = [
            { x: -12.6, y: 2.4, z: 5.9 }, { x: -9.1, y: 2.4, z: 5.9 }, { x: -5.6, y: 2.4, z: 5.9 },
            { x: -12.6, y: 2.4, z: 4.5 }, { x: -9.1, y: 2.4, z: 4.5 }, { x: -5.6, y: 2.4, z: 4.5 },
            { x: -12.6, y: 2.4, z: 3.1 }, { x: -9.1, y: 2.4, z: 3.1 }, { x: -5.6, y: 2.4, z: 3.1 },
            { x: -12.6, y: 2.4, z: 1.7 }, { x: -9.1, y: 2.4, z: 1.7 }, { x: -5.6, y: 2.4, z: 1.7 }
          ]

          lampPositions.forEach((pos, index) => {
            const lamp = baseLamp.clone()
            lamp.position.set(pos.x, pos.y, pos.z)
            lamp.rotation.set(0, Math.PI, 0)
            lamp.scale.set(1.554, 1.554, 1.554)
            lamp.name = `lamp-${index}`

            // Lumière ponctuelle
            const pl = new THREE.PointLight(
              new THREE.Color(LIGHT_COLOR),
              lampStore.lampOn ? LIGHT_INTENSITY : 0,
              10
            )
            pl.position.set(0, 0.2, 0)
            lamp.add(pl)
            allLampLights.value.push(pl)

            // Helper (dev only)
            const helper = new THREE.PointLightHelper(pl, 0.15)
            lamp.add(helper)
            helper.visible = lampStore.lampOn && isDev
            allLampHelpers.value.push(helper)

            allLamps.value.push(lamp)
            scene.add(lamp)
          })

          console.log(`✅ ${allLamps.value.length} lampes chargées`)

          // Appliquer l'état initial
          updateAllLamps(lampStore.lampOn)

          // Sync store → lampes
          const unsubscribe = lampStore.$subscribe(() => {
            updateAllLamps(lampStore.lampOn)
          })
          eventListeners.push({ target: 'store', type: 'unsubscribe', handler: unsubscribe })
        },
        undefined,
        (error) => {
          console.error('❌ Erreur de chargement des lampes:', error)
        }
      )
    },
    undefined,
    (error) => {
      console.error('❌ Erreur de chargement de la scène:', error)
    }
  )

  // Animation + déplacement caméra
  let yaw = 0
  const animate = () => {
    animationId = requestAnimationFrame(animate)

    const step = 0.15
    let moved = false

    if (keys['ArrowLeft']) { yaw += 0.05; moved = true }
    if (keys['ArrowRight']) { yaw -= 0.05; moved = true }

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

    camera.rotation.set(0, yaw, 0)
    const target = new THREE.Vector3(
      camera.position.x + Math.sin(yaw),
      1.5,
      camera.position.z + Math.cos(yaw)
    )
    camera.lookAt(target)

    renderer?.render(scene, camera)
  }
  animate()

  // Resize handler
  const handleResize = () => {
    if (!container.value || !renderer) return
    camera.aspect = container.value.clientWidth / container.value.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  }
  addTrackedListener(window, 'resize', handleResize)
})

onUnmounted(() => {
  console.log('🧹 Cleanup du composant...')

  // Stop animation
  if (animationId !== null) cancelAnimationFrame(animationId)

  // Remove listeners + unsubscribe store
  eventListeners.forEach(({ target, type, handler }) => {
    if (target === 'store') handler()
    else target.removeEventListener(type, handler)
  })

  // Dispose renderer
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
    renderer = null
  }

  // Dispose meshes/materials
  allLampLights.value.forEach((light) => light.dispose())
  allLampHelpers.value.forEach((helper) => helper.dispose())
  allLamps.value.forEach((lamp) => {
    lamp.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh
        mesh.geometry?.dispose()
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose())
        else mesh.material?.dispose()
      }
    })
  })

  // ✅ Disconnect WoT observer
  lampStore.disconnect()

  console.log('✅ Cleanup terminé')
})
</script>

<style scoped>
.viewer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  z-index: 1;
}
</style>
