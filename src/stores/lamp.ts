// stores/lamp.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io } from 'socket.io-client'

export const useLampStore = defineStore('lamp', () => {
  const lampOn = ref(true)
  let socket: any = null

  // Connexion au serveur Socket.io
  function connectSocket() {
    socket = io('http://localhost:3001', {
      transports: ['websocket', 'polling']
    })

    // Recevoir l'état actuel depuis le serveur
    socket.on('lampStateUpdate', (state: any) => {
      lampOn.value = state.powerState === 'on'
    })

    socket.on('disconnect', () => {
      console.log('Déconnecté du serveur')
    })
  }

  // Changer l'état de la lampe
  function setLamp(on: boolean) {
    lampOn.value = on
    if (socket) {
      socket.emit('setLampState', { powerState: on ? 'on' : 'off' })
    }
  }

  // Fonction toggle pratique côté UI
  function toggle() {
    setLamp(!lampOn.value)
  }

  return {
    lampOn,
    connectSocket,
    setLamp,
    toggle
  }
})
