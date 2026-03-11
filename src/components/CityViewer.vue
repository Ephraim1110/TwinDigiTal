<template>
  <div ref="container" class="viewer">
    <!-- HUD -->
    <div class="hud">
      <div class="stats">
        <div class="stat-item">
          <span class="label">👥 Utilisateurs:</span>
          <span class="value">{{ usersStore.userCount }}</span>
        </div>
        <div class="stat-item">
          <span class="label">🔗 WoT:</span>
          <span class="value" :class="lampStore.connectionStatus">
            {{ lampStore.connectionStatus }}
          </span>
        </div>
        <div class="stat-item">
          <span class="label">💡 Lampes:</span>
          <span class="value">{{ lampStore.lampOn ? '✓ ON' : '✗ OFF' }}</span>
        </div>
      </div>
      <div class="users-list" v-if="usersStore.userCount > 1">
        <div class="user-item" v-for="user of usersStore.remoteUsers" :key="user.id">
          <span class="user-color" :style="{ backgroundColor: user.color }"></span>
          <span class="user-name">{{ user.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { useLampStore } from '@/stores/lamp'
import { useUsersStore } from '@/stores/users'

const container = ref<HTMLDivElement | null>(null)
const lampStore = useLampStore()
const usersStore = useUsersStore()
const isDev = import.meta.env.DEV

// Three.js références
const allLampLights = ref<THREE.PointLight[]>([])
const allLampHelpers = ref<THREE.PointLightHelper[]>([])
const allLamps = ref<THREE.Group[]>([])
const userAvatarsMap = ref<Map<string, THREE.Group>>(new Map())
const scene = ref<THREE.Scene | null>(null)
const camera = ref<THREE.PerspectiveCamera | null>(null)

// Références pour le cleanup
let renderer: THREE.WebGLRenderer | null = null
let animationId: number | null = null
let presenceSyncCleanup: (() => void) | null = null
const eventListeners: Array<{ target: any; type: string; handler: any }> = []

// Configuration
const LIGHT_INTENSITY = 1.8
const LIGHT_COLOR = '#fff6d5'
const AVATAR_SCALE = 0.3
const AVATAR_HEIGHT = 1.8

// Helper pour ajouter des listeners avec tracking
function addTrackedListener(target: any, type: string, handler: any) {
  target.addEventListener(type, handler)
  eventListeners.push({ target, type, handler })
}

// Créer un avatar pour un utilisateur (capsule + nom)
function createUserAvatar(user: any): THREE.Group {
  const group = new THREE.Group()
  group.name = `avatar-${user.id}`

  // Capsule (cylinde + sphères)
  const cylinderGeom = new THREE.CylinderGeometry(AVATAR_SCALE * 0.5, AVATAR_SCALE * 0.5, AVATAR_HEIGHT * 0.6, 8)
  const sphereGeom = new THREE.SphereGeometry(AVATAR_SCALE * 0.5, 8, 8)
  
  const material = new THREE.MeshStandardMaterial({
    color: user.color,
    metalness: 0.4,
    roughness: 0.6,
    emissive: user.color,
    emissiveIntensity: 0.3
  })

  // Corps
  const body = new THREE.Mesh(cylinderGeom, material)
  body.position.y = AVATAR_HEIGHT * 0.2
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // Tête
  const headMaterial = new THREE.MeshStandardMaterial({
    color: user.color,
    metalness: 0.2,
    roughness: 0.7,
    emissive: user.color,
    emissiveIntensity: 0.2
  })
  const head = new THREE.Mesh(sphereGeom, headMaterial)
  head.position.y = AVATAR_HEIGHT * 0.65
  head.castShadow = true
  head.receiveShadow = true
  group.add(head)

  // Indicator au-dessus pour afficher le nom
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = user.color
  ctx.fillRect(0, 0, 256, 64)
  ctx.fillStyle = '#000'
  ctx.font = 'bold 24px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(user.name, 128, 40)

  const texture = new THREE.CanvasTexture(canvas)
  const textureGeom = new THREE.PlaneGeometry(1.2, 0.3)
  const textureMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  const labelMesh = new THREE.Mesh(textureGeom, textureMaterial)
  labelMesh.position.y = AVATAR_HEIGHT + 0.3
  labelMesh.position.z = 0.1
  group.add(labelMesh)

  group.position.set(user.position.x, user.position.y, user.position.z)
  
  return group
}

// Mettre à jour position d'un avatar
function updateUserAvatarPosition(userId: string, position: any) {
  const avatar = userAvatarsMap.value.get(userId)
  if (avatar) {
    avatar.position.set(position.x, position.y, position.z)
  }
}

// Ajouter ou mettre à jour un avatar dans la scène
function syncUserAvatar(user: any) {
  if (!scene.value) return

  const existing = userAvatarsMap.value.get(user.id)
  if (existing) {
    // Mettre à jour la position
    updateUserAvatarPosition(user.id, user.position)
  } else {
    // Créer un nouvel avatar
    const avatar = createUserAvatar(user)
    userAvatarsMap.value.set(user.id, avatar)
    scene.value.add(avatar)
  }
}

// Supprimer un avatar de la scène
function removeUserAvatar(userId: string) {
  const avatar = userAvatarsMap.value.get(userId)
  if (avatar && scene.value) {
    scene.value.remove(avatar)
    avatar.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh
        if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose())
        else mesh.material?.dispose()
        mesh.geometry?.dispose()
      }
    })
  }
  userAvatarsMap.value.delete(userId)
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

  // ✅ Initialiser utilisateurs
  usersStore.initializeLocal()
  presenceSyncCleanup = usersStore.startPresenceSync()

  // ✅ Connexion au Web of Things
  lampStore.connectWoT()

  const sceneInstance = new THREE.Scene()
  scene.value = sceneInstance
  sceneInstance.background = new THREE.Color(0xaaaaaa)

  // Grille
  const grid = new THREE.GridHelper(2000, 40, 0x000000, 0x000000)
  ;(grid.material as THREE.Material).opacity = 0.2
  ;(grid.material as THREE.Material).transparent = true
  sceneInstance.add(grid)

  // Camera
  const cameraInstance = new THREE.PerspectiveCamera(
    60,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    100000
  )
  camera.value = cameraInstance
  cameraInstance.position.set(11.3, 1.5, 5.1)

  // Lumières de la scène
  const dirLight = new THREE.DirectionalLight(0xffffff, 3)
  dirLight.position.set(10, 10, 10)
  dirLight.castShadow = true
  sceneInstance.add(dirLight)
  sceneInstance.add(new THREE.AmbientLight(0xffffff, 0.6))

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
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
      sceneInstance.add(gltf.scene)

      if (isDev) {
        sceneInstance.add(new THREE.AxesHelper(500))
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
            sceneInstance.add(lamp)
          })

          console.log(`✅ ${allLamps.value.length} lampes chargées`)

          // Appliquer l'état initial
          updateAllLamps(lampStore.lampOn)

          // Sync store → lampes
          const unsubscribe = lampStore.$subscribe(() => {
            updateAllLamps(lampStore.lampOn)
          })
          eventListeners.push({ target: 'store-lamp', type: 'unsubscribe', handler: unsubscribe })
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

  // ✅ Watcher pour les utilisateurs
  const unsubscribeUsers = usersStore.$subscribe((mutation, state) => {
    state.users.forEach((user) => {
      if (!user.isLocal) {
        syncUserAvatar(user)
      }
    })
  })
  eventListeners.push({ target: 'store-users', type: 'unsubscribe', handler: unsubscribeUsers })

  // Ajouter les avatars des utilisateurs à la scène initialement
  usersStore.remoteUsers.forEach(user => {
    syncUserAvatar(user)
  })

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
      cameraInstance.position.x += direction.x * step
      cameraInstance.position.z += direction.z * step
      moved = true
    }
    if (keys['ArrowDown']) {
      cameraInstance.position.x -= direction.x * step
      cameraInstance.position.z -= direction.z * step
      moved = true
    }

    if (moved) {
      cameraInstance.position.y = 1.5
      // Mettre à jour la position dans le store (diffuser aux autres utilisateurs)
      usersStore.updateLocalPosition({
        x: cameraInstance.position.x,
        y: cameraInstance.position.y,
        z: cameraInstance.position.z
      })
    }

    cameraInstance.rotation.set(0, yaw, 0)
    const target = new THREE.Vector3(
      cameraInstance.position.x + Math.sin(yaw),
      1.5,
      cameraInstance.position.z + Math.cos(yaw)
    )
    cameraInstance.lookAt(target)

    renderer?.render(sceneInstance, cameraInstance)
  }
  animate()

  // Resize handler
  const handleResize = () => {
    if (!container.value || !renderer || !cameraInstance) return
    cameraInstance.aspect = container.value.clientWidth / container.value.clientHeight
    cameraInstance.updateProjectionMatrix()
    renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  }
  addTrackedListener(window, 'resize', handleResize)
})

onUnmounted(() => {
  console.log('🧹 Cleanup du composant...')

  // Stop animation
  if (animationId !== null) cancelAnimationFrame(animationId)

  // Remove listeners + unsubscribe stores
  eventListeners.forEach(({ target, type, handler }) => {
    if (target === 'store-lamp' || target === 'store-users') handler()
    else target.removeEventListener(type, handler)
  })

  // Stop presence sync
  if (presenceSyncCleanup) presenceSyncCleanup()

  // Dispose avatars
  userAvatarsMap.value.forEach((avatar) => {
    if (scene.value) scene.value.remove(avatar)
    avatar.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh
        mesh.geometry?.dispose()
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose())
        else mesh.material?.dispose()
      }
    })
  })
  userAvatarsMap.value.clear()

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

  // ✅ Disconnect WoT
  lampStore.disconnect()

  // ✅ Disconnect users
  usersStore.$reset()

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

.hud {
  position: absolute;
  top: 20px;
  left: 20px;
  backdrop-filter: blur(10px);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 16px;
  max-width: 300px;
  font-family: 'Courier New', monospace;
  color: #fff;
  z-index: 100;
}

.stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
}

.label {
  color: #aaa;
  margin-right: 8px;
}

.value {
  color: #4ecdc4;
  font-weight: bold;
  padding: 4px 8px;
  background: rgba(78, 205, 196, 0.1);
  border-radius: 4px;
  min-width: 60px;
  text-align: center;
}

.value.connected {
  color: #51cf66;
  background: rgba(81, 207, 102, 0.1);
}

.value.connecting {
  color: #ffd43b;
  background: rgba(255, 212, 59, 0.1);
}

.value.error {
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.1);
}

.users-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 6px 8px;
  background: rgba(78, 205, 196, 0.05);
  border-radius: 4px;
  border-left: 3px solid transparent;
  transition: all 0.3s ease;
}

.user-item:hover {
  background: rgba(78, 205, 196, 0.15);
  transform: translateX(2px);
}

.user-color {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 6px currentColor;
}

.user-name {
  color: #fff;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 600px) {
  .hud {
    top: 10px;
    left: 10px;
    padding: 12px;
    max-width: 250px;
  }

  .stat-item {
    font-size: 12px;
  }

  .user-item {
    font-size: 11px;
  }
}
</style>
