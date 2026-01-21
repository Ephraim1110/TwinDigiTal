import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

type PowerState = 'on' | 'off' | 'unknown'

function normalizePowerState(raw: unknown): 'on' | 'off' | null {
  if (raw == null) return null

  // raw peut être: "on" | "off" | { powerState: "on" } | { value: "on" }
  if (typeof raw === 'string') {
    const s = raw.replaceAll('"', '').trim().toLowerCase()
    return (s === 'on' || s === 'off') ? s : null
  }

  if (typeof raw === 'object') {
    const obj = raw as any
    const candidate = obj.powerState ?? obj.value
    if (typeof candidate === 'string') {
      const s = candidate.replaceAll('"', '').trim().toLowerCase()
      return (s === 'on' || s === 'off') ? s : null
    }
  }

  return null
}

export const useLampStore = defineStore('lamp', () => {
  const powerState = ref<PowerState>('unknown')
  const isConnected = ref(false)
  const connectionError = ref<string | null>(null)
  const isObserving = ref(false)

  const lampOn = computed(() => powerState.value === 'on')

  const connectionStatus = computed(() => {
    if (isConnected.value) return 'connected'
    if (connectionError.value) return 'error'
    return 'connecting'
  })

  const WOT_BASE = import.meta.env.VITE_WOT_BASE_URL || 'http://localhost:5555'
  const THING = import.meta.env.VITE_WOT_THING || 'lamp'

  let abortController: AbortController | null = null

  async function readInitial() {
    const res = await fetch(`${WOT_BASE}/${THING}/properties/powerState`)
    const txt = await res.text() // généralement "on" ou "off"
    const v = normalizePowerState(txt)
    if (!v) throw new Error(`Valeur powerState invalide: ${txt}`)
    powerState.value = v
  }

  async function longpollLoop() {
    if (isObserving.value) return
    isObserving.value = true

    abortController = new AbortController()

    while (isObserving.value) {
      try {
        // observeproperty : /observable (subprotocol longpoll)
        const res = await fetch(
          `${WOT_BASE}/${THING}/properties/powerState/observable`,
          { signal: abortController.signal }
        )

        const ct = res.headers.get('content-type') || ''
        let v: 'on' | 'off' | null = null

        if (ct.includes('application/json')) {
          const data = await res.json()
          v = normalizePowerState(data)
        } else {
          const txt = await res.text()
          v = normalizePowerState(txt)
        }

        if (v) {
          powerState.value = v
          isConnected.value = true
          connectionError.value = null
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') break
        isConnected.value = false
        connectionError.value = `WoT observe KO: ${e?.message ?? e}`
        // petit délai avant retry
        await new Promise((r) => setTimeout(r, 800))
      }
    }
  }

  async function connectWoT() {
    connectionError.value = null
    isConnected.value = false

    try {
      await readInitial()
      isConnected.value = true
    } catch (e: any) {
      connectionError.value = `WoT read KO: ${e?.message ?? e}`
    }

    // lance l'observation longpoll
    longpollLoop()
  }

  function disconnect() {
    isObserving.value = false
    isConnected.value = false
    abortController?.abort()
    abortController = null
  }

  function reconnect() {
    disconnect()
    connectWoT()
  }

  // Optionnel (override UI) : écrire dans la property
  async function requestSetPowerState(on: boolean) {
    // JSON string => "on" / "off"
    const body = JSON.stringify(on ? 'on' : 'off')
    await fetch(`${WOT_BASE}/${THING}/properties/powerState`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body
    })
    // pas d’optimistic update: l’état viendra via longpoll
  }

  return {
    powerState,
    lampOn,
    isConnected,
    connectionError,
    connectionStatus,
    connectWoT,
    disconnect,
    reconnect,
    requestSetPowerState
  }
})
