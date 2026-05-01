import { useEffect, useRef, useCallback } from 'react'
import { useDashboardStore } from '../store'
import { deltaPayloadFromBridgeMessage } from '../bridgeMessages'
import { shouldUseBridgeWebSocket } from '../view-mode'

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelay = useRef(1000)
  const shouldReconnectRef = useRef(true)
  const connectRef = useRef<() => void>(() => {})

  const { setEntities, applyDelta, setConnectionStatus } = useDashboardStore.getState()

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current) return
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    reconnectTimeoutRef.current = setTimeout(() => {
      if (!shouldReconnectRef.current) return
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000)
      connectRef.current()
    }, reconnectDelay.current)
  }, [])

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setConnectionStatus('connecting')

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!shouldReconnectRef.current) {
          ws.close()
          return
        }
        console.log('[WS] Connected to Bridge')
        setConnectionStatus('connected')
        reconnectDelay.current = 1000
        ws.send(JSON.stringify({ type: 'request_full_state' }))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          if (msg.type === 'snapshot') {
            setEntities(msg.entities)
          } else if (msg.type === 'delta') {
            const delta = deltaPayloadFromBridgeMessage(msg)
            if (delta) {
              applyDelta(delta)
            } else {
              console.warn('[WS] delta message missing payload', msg)
            }
          } else if (msg.type === 'pong') {
            // Heartbeat response
          }
        } catch (e) {
          console.warn('[WS] Parse error:', e)
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        if (!shouldReconnectRef.current) {
          return
        }
        console.log('[WS] Disconnected, reconnecting in', reconnectDelay.current, 'ms')
        setConnectionStatus('disconnected')
        scheduleReconnect()
      }

      ws.onerror = (err) => {
        if (!shouldReconnectRef.current) {
          return
        }
        console.error('[WS] Error:', err)
        setConnectionStatus('error')
      }
    } catch (err) {
      console.error('[WS] Connection failed:', err)
      setConnectionStatus('error')
      if (shouldReconnectRef.current) {
        scheduleReconnect()
      }
    }
  }, [url, scheduleReconnect])

  connectRef.current = connect

  const ping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ping' }))
    }
  }, [])

  useEffect(() => {
    if (!shouldUseBridgeWebSocket(window.location.search)) {
      return () => {}
    }

    shouldReconnectRef.current = true
    connect()

    const interval = setInterval(ping, 15000)

    return () => {
      shouldReconnectRef.current = false
      clearInterval(interval)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      const s = wsRef.current
      wsRef.current = null
      if (s && (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING)) {
        s.close()
      }
    }
  }, [connect, ping])
}
