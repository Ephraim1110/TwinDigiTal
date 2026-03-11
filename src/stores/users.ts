import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface User {
  id: string
  name: string
  position: { x: number; y: number; z: number }
  color: string
  lastUpdate: number
  isLocal: boolean
}

const COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe', '#fd79a8', '#fdcb6e']

function generateRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}

export const useUsersStore = defineStore('users', () => {
  const users = ref<Map<string, User>>(new Map())
  const localUserId = ref<string>('')
  const localUserName = ref<string>(`User${Math.floor(Math.random() * 10000)}`)

  // Générer un ID unique pour l'utilisateur local
  function initializeLocal() {
    if (localUserId.value) return
    localUserId.value = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Créer l'utilisateur local
    addOrUpdateUser({
      id: localUserId.value,
      name: localUserName.value,
      position: { x: 11.3, y: 1.5, z: 5.1 },
      color: '#3498db',
      lastUpdate: Date.now(),
      isLocal: true
    })
  }

  function addOrUpdateUser(user: User) {
    users.value.set(user.id, { ...user, lastUpdate: Date.now() })
  }

  function updateLocalPosition(position: { x: number; y: number; z: number }) {
    if (!localUserId.value) return
    const user = users.value.get(localUserId.value)
    if (user) {
      user.position = position
      user.lastUpdate = Date.now()
    }
  }

  function removeUser(userId: string) {
    users.value.delete(userId)
  }

  // Nettoyer les utilisateurs inactifs après 30s
  function cleanupInactiveUsers() {
    const now = Date.now()
    const timeout = 30000 // 30 secondes
    
    const inactiveIds: string[] = []
    users.value.forEach((user) => {
      if (!user.isLocal && now - user.lastUpdate > timeout) {
        inactiveIds.push(user.id)
      }
    })
    
    inactiveIds.forEach(id => removeUser(id))
  }

  // Connecter via localStorage broadcast (simulation multi-utilisateurs)
  function startPresenceSync() {
    // Envoyer la position locale tous les 100ms
    const interval = setInterval(() => {
      if (!localUserId.value) return
      const user = users.value.get(localUserId.value)
      if (user) {
        // Simuler une présence partagée via localStorage
        const presenceKey = `presence:${localUserId.value}`
        localStorage.setItem(presenceKey, JSON.stringify({
          id: user.id,
          name: user.name,
          position: user.position,
          color: user.color,
          timestamp: Date.now()
        }))
      }
    }, 100)

    // Écouter les autres utilisateurs via storage events
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('presence:')) {
        try {
          const data = e.newValue ? JSON.parse(e.newValue) : null
          if (data && data.id !== localUserId.value) {
            addOrUpdateUser({
              id: data.id,
              name: data.name,
              position: data.position,
              color: data.color || generateRandomColor(),
              lastUpdate: data.timestamp || Date.now(),
              isLocal: false
            })
          }
        } catch (err) {
          console.error('Erreur parsing présence:', err)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)

    // Cleanup inactifs tous les 5s
    const cleanupInterval = setInterval(() => {
      cleanupInactiveUsers()
    }, 5000)

    // Retourner fonction de cleanup
    return () => {
      clearInterval(interval)
      clearInterval(cleanupInterval)
      window.removeEventListener('storage', handleStorageChange)
    }
  }

  const userCount = computed(() => users.value.size)
  const localUser = computed(() => users.value.get(localUserId.value))
  const remoteUsers = computed(() => {
    return Array.from(users.value.values()).filter(u => !u.isLocal)
  })

  return {
    users,
    localUserId,
    localUserName,
    userCount,
    localUser,
    remoteUsers,
    initializeLocal,
    addOrUpdateUser,
    updateLocalPosition,
    removeUser,
    startPresenceSync,
    cleanupInactiveUsers
  }
})
