/**
 * Hermes API client (dashboard side)
 *
 * Cross-frame proxy for the in-iframe `__hermesAPI` surface installed by
 * `titan-reactor/src/core/world/hermes-api.ts`. Sends `hermes:api:invoke`
 * postMessages to the Titan iframe, awaits a `hermes:api:reply` with a
 * matching `reqId`, and returns the structured ApiResult.
 *
 * The dashboard never imports the iframe code directly (different bundle,
 * different origin in production). This module is the only seam.
 *
 * Usage:
 *   const api = useHermesApi(iframeRef)
 *   const r = await api.invoke('audio.playReadyById', [0]) // marine voice
 *   if (r.ok) console.log(r.value)
 */

import { useEffect, useMemo, useRef, useState } from 'react'

export interface ApiOk<T = unknown> {
  ok: true
  value: T
}
export interface ApiErr {
  ok: false
  error: string
}
export type ApiResult<T = unknown> = ApiOk<T> | ApiErr

export interface CapabilityDescriptor {
  name: string
  domain: string
  available: boolean
  requires?: string
  args?: string[]
  description: string
}

export interface HermesApiManifest {
  version: string
  features: Record<string, boolean>
  manifest: CapabilityDescriptor[]
}

interface PendingCall {
  resolve: (r: ApiResult) => void
  reject: (e: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

const TIMEOUT_MS = 15_000

export function createHermesApiClient(
  getIframe: () => HTMLIFrameElement | null,
): {
  invoke<T = unknown>(path: string, args?: unknown[]): Promise<ApiResult<T>>
  dispose(): void
} {
  const pending = new Map<string, PendingCall>()
  let counter = 0

  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as
      | { type?: string; reqId?: string; result?: ApiResult }
      | null
    if (!data || typeof data !== 'object') return
    if (data.type !== 'hermes:api:reply') return
    if (typeof data.reqId !== 'string') return
    const slot = pending.get(data.reqId)
    if (!slot) return
    pending.delete(data.reqId)
    clearTimeout(slot.timeout)
    slot.resolve((data.result ?? { ok: false, error: 'no result' }) as ApiResult)
  }
  window.addEventListener('message', onMessage)

  const invoke = <T = unknown>(
    path: string,
    args: unknown[] = [],
  ): Promise<ApiResult<T>> => {
    const iframe = getIframe()
    if (!iframe || !iframe.contentWindow) {
      return Promise.resolve({
        ok: false,
        error: 'titan iframe not available',
      } as ApiResult<T>)
    }
    return new Promise((resolve) => {
      const reqId = `req-${++counter}-${Date.now().toString(36)}`
      const timeout = setTimeout(() => {
        if (pending.has(reqId)) {
          pending.delete(reqId)
          resolve({
            ok: false,
            error: `timeout waiting for reply to ${path}`,
          } as ApiResult<T>)
        }
      }, TIMEOUT_MS)
      pending.set(reqId, {
        resolve: resolve as (r: ApiResult) => void,
        reject: () => {},
        timeout,
      })
      try {
        iframe.contentWindow!.postMessage(
          { type: 'hermes:api:invoke', reqId, path, args },
          '*',
        )
      } catch (err) {
        pending.delete(reqId)
        clearTimeout(timeout)
        resolve({
          ok: false,
          error: `postMessage failed: ${err instanceof Error ? err.message : String(err)}`,
        } as ApiResult<T>)
      }
    })
  }

  return {
    invoke,
    dispose: () => {
      window.removeEventListener('message', onMessage)
      for (const [, slot] of pending) {
        clearTimeout(slot.timeout)
        slot.resolve({ ok: false, error: 'client disposed' })
      }
      pending.clear()
    },
  }
}

/**
 * React hook that wires up an API client against the given iframe and
 * exposes the manifest the iframe broadcasts on `hermes:api:ready`.
 */
export function useHermesApi(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
) {
  const [manifest, setManifest] = useState<HermesApiManifest | null>(null)
  const clientRef = useRef<ReturnType<typeof createHermesApiClient> | null>(null)

  useEffect(() => {
    const client = createHermesApiClient(() => iframeRef.current)
    clientRef.current = client
    return () => {
      client.dispose()
      clientRef.current = null
    }
  }, [iframeRef])

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as
        | {
            type?: string
            version?: string
            features?: Record<string, boolean>
            manifest?: CapabilityDescriptor[]
          }
        | null
      if (!data || typeof data !== 'object') return
      if (data.type !== 'hermes:api:ready') return
      setManifest({
        version: data.version ?? 'unknown',
        features: data.features ?? {},
        manifest: data.manifest ?? [],
      })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const api = useMemo(
    () => ({
      invoke: <T = unknown>(path: string, args: unknown[] = []) => {
        const c = clientRef.current
        if (!c) {
          return Promise.resolve({
            ok: false,
            error: 'client not initialised',
          } as ApiResult<T>)
        }
        return c.invoke<T>(path, args)
      },
      manifest,
    }),
    [manifest],
  )

  return api
}
