import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io } from 'socket.io-client'

export const useLampStore = defineStore('lamp', () => {
  const lampOn = ref(true)
  let socket: any = null

  // Connecte au serveur Socket.IO
  function connectSocket() {
    socket = io('http://localhost:3001', { transport: ['websocket', 'polling'] })

    // Recevoir l'état du backend
    socket.on('lampStateUpdate', (state: any) => {
      console.log('RECU lampStateUpdate:', state)
      lampOn.value = state.powerState === 'on'
    })

    socket.on('disconnect', () => {
      console.log('Déconnecté du serveur')
    })
  }

  // Toggle la lampe
    function toggle() {
      lampOn.value = !lampOn.value;
      if (socket) {
        const state = lampOn.value ? "on" : "off";
        socket.emit("setLampState", { powerState: state });
      }
    }


  return { lampOn, connectSocket, toggle }
})
