import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io } from 'socket.io-client'

export const useLampStore = defineStore('lamp', () => {
  const lampOn = ref(true)
  let socket: any = null

  function connectSocket() {
    socket = io('http://localhost:3001', { transport: ['websocket', 'polling'] })

    socket.on('lampStateUpdate', (state: any) => {
      lampOn.value = state.powerState === 'on'
    })

    socket.on('disconnect', () => console.log('Déconnecté du serveur'))
  }

  function toggle() {
    lampOn.value = !lampOn.value
    if (socket) {
      socket.emit('setLampState', { powerState: lampOn.value ? 'on' : 'off' })
    }
  }

  return { lampOn, connectSocket, toggle }
})
