import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io, Socket } from 'socket.io-client'

export const useSocketStore = defineStore('socket', () => {
  const socket = ref<Socket | null>(null)
  const isConnected = ref(false)

  // Connecter au serveur Socket.IO
  function connect(serverUrl: string = 'http://localhost:5554') {
    if (socket.value?.connected) {
      console.log('✅ Déjà connecté à Socket.IO')
      return
    }

    socket.value = io(serverUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    })

    socket.value.on('connect', () => {
      isConnected.value = true
      console.log('✅ Connecté au serveur Socket.IO')
    })

    socket.value.on('disconnect', () => {
      isConnected.value = false
      console.log('❌ Déconnecté du serveur Socket.IO')
    })

    socket.value.on('error', (error) => {
      console.error('❌ Erreur Socket.IO:', error)
    })
  }

  // Envoyer les données utilisateur au serveur
  function joinUser(userData: { name: string; color: string; position: any }) {
    if (socket.value?.connected) {
      socket.value.emit('user:join', userData)
      console.log('📤 Utilisateur rejoint:', userData.name)
    }
  }

  // Mettre à jour la position
  function updatePosition(position: any) {
    if (socket.value?.connected) {
      socket.value.emit('user:position', position)
    }
  }

  // Écouter les mises à jour de la liste des utilisateurs
  function onUsersList(callback: (users: any[]) => void) {
    if (socket.value) {
      socket.value.on('users:list', callback)
    }
  }

  // Écouter les mises à jour de position des autres utilisateurs
  function onPositionUpdate(callback: (data: any) => void) {
    if (socket.value) {
      socket.value.on('user:position:update', callback)
    }
  }

  function disconnect() {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
      isConnected.value = false
    }
  }

  return {
    socket,
    isConnected,
    connect,
    joinUser,
    updatePosition,
    onUsersList,
    onPositionUpdate,
    disconnect
  }
})
