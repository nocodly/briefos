// Thin wrapper over the preload bridge. Main handlers return a Result envelope
// ({ ok: true, data } | { ok: false, error }); this unwraps it so components
// get the data directly and a failed call throws a real Error.

// The preload bridge may be absent if the preload script failed to load.
// Guard so the UI shows a clear error instead of crashing on `undefined.on`.
function bridge() {
  const api = (window as Window).electron
  if (!api) {
    throw new Error(
      'window.electron is unavailable — the preload bridge failed to load. ' +
        'Check the preload path/format in electron.vite.config.ts.'
    )
  }
  return api
}

export function hasBridge(): boolean {
  return typeof window !== 'undefined' && Boolean((window as Window).electron)
}

export async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await bridge().invoke(channel, ...args)) as unknown
  if (res && typeof res === 'object' && 'ok' in res) {
    const env = res as { ok: boolean; data?: T; error?: string }
    if (!env.ok) throw new Error(env.error || `IPC ${channel} failed`)
    return env.data as T
  }
  return res as T
}

/** Subscribe to a push event; returns an unsubscribe function (no-op if no bridge). */
export function subscribe(channel: string, cb: (data: any) => void): () => void {
  if (!hasBridge()) {
    console.error(`[ipc] cannot subscribe to ${channel} — preload bridge missing`)
    return () => {}
  }
  const sub = window.electron.on(channel, cb)
  return () => window.electron.off(channel, sub)
}
