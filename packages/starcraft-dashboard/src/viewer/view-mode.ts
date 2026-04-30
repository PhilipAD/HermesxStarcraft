export type ViewMode = 'titan' | 'dash' | 'cascdev'

/**
 * Default route = Titan (original StarCraft assets via iframe).
 * - `?dash=1` → the Hermes procedural dashboard (legacy view).
 * - `?cascdev=1` → dev-only CASC texture sanity view.
 * - `?titan=1` is accepted for backward compatibility; Titan is the default now.
 */
export function getViewMode(search: string): ViewMode {
  const q = new URLSearchParams(search)
  if (q.get('cascdev') === '1') return 'cascdev'
  if (q.get('dash') === '1') return 'dash'
  return 'titan'
}

export function shouldUseBridgeWebSocket(search: string): boolean {
  return getViewMode(search) !== 'cascdev'
}
