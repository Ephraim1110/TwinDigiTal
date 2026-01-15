import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io } from 'socket.io-client'

export const useLampStore = defineStore('lamp', () => {
  const lampOn = ref(true)
  let socket: any = null

  // Connecter au serveur
  function connectSocket() {
    socket = io('http://localhost:3001', {
      transport: ['websocket', 'polling']
    })

    // Recevoir l'état initial
    socket.on('lampStateUpdate', (state: any) => {
      lampOn.value = state.on
    })

    socket.on('disconnect', () => {
      console.log('Déconnecté du serveur')
    })
  }

  // Basculer la lampe
  function toggle() {
    lampOn.value = !lampOn.value
    if (socket) {
      socket.emit('toggleLamp', { on: lampOn.value })
    }
  }

  return {
    lampOn,
    connectSocket,
    toggle
  }
})
