import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSocketStore } from './socket'

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
  const socketStore = useSocketStore()
  const users = ref<Map<string, User>>(new Map())
  const localUserId = ref<string>('')
  const localUserName = ref<string>(`User${Math.floor(Math.random() * 10000)}`)

  // Générer un ID unique pour l'utilisateur local
  function initializeLocal() {
    // Connecter à Socket.IO
    socketStore.connect()

    // Attendre la connexion avant de rejoindre
    const checkConnection = setInterval(() => {
      if (socketStore.isConnected && socketStore.socket?.id) {
        clearInterval(checkConnection)

        localUserId.value = socketStore.socket.id
        const position = { x: 11.3, y: 1.0, z: 5.1 }
        const userColor = generateRandomColor()
        
        // Créer l'utilisateur local
        const localUser: User = {
          id: localUserId.value,
          name: localUserName.value,
          position,
          color: userColor,
          lastUpdate: Date.now(),
          isLocal: true
        }

        users.value.set(localUserId.value, localUser)

        // Envoyer les données au serveur
        socketStore.joinUser({
          name: localUserName.value,
          color: userColor,
          position
        })

        console.log('✅ Utilisateur local initialisé:', localUserName.value)
      }
    }, 100)
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
      // Envoyer la position au serveur
      socketStore.updatePosition(position)
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

  // Connecter via Socket.IO pour la synchronisation des présences
  function startPresenceSync() {
    // Écouter la liste des utilisateurs du serveur
    socketStore.onUsersList((serverUsers) => {
      const localId = localUserId.value

      // Ajouter les nouveaux utilisateurs distants
      serverUsers.forEach((serverUser) => {
        if (serverUser.id !== localId && !users.value.has(serverUser.id)) {
          addOrUpdateUser({
            id: serverUser.id,
            name: serverUser.name,
            position: serverUser.position,
            color: serverUser.color,
            lastUpdate: Date.now(),
            isLocal: false
          })
          console.log('👤 Nouvel utilisateur rejoint:', serverUser.name)
        }
      })

      // Supprimer les utilisateurs qui se sont déconnectés
      const serverIds = new Set(serverUsers.map(u => u.id))
      const toRemove: string[] = []
      users.value.forEach((user) => {
        if (!user.isLocal && !serverIds.has(user.id)) {
          toRemove.push(user.id)
        }
      })
      toRemove.forEach(id => removeUser(id))
    })

    // Écouter les mises à jour de position
    socketStore.onPositionUpdate((data) => {
      const user = users.value.get(data.id)
      if (user && !user.isLocal) {
        user.position = data.position
        user.lastUpdate = Date.now()
      }
    })

    // Retourner fonction de cleanup
    return () => {
      socketStore.disconnect()
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
