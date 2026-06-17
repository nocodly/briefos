// Renderer-side typing for the preload bridge (window.electron).
// Mirrors the API exposed in src/main/preload.ts via contextBridge.

export interface ElectronBridge {
  /** Two-way request → resolves with the main handler's Result envelope. */
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
  /** Subscribe to a push event; returns the wrapped listener for off(). */
  on(channel: string, callback: (data: any) => void): (...args: any[]) => void
  /** Remove a previously-registered listener. */
  off(channel: string, sub: (...args: any[]) => void): void
}

declare global {
  interface Window {
    electron: ElectronBridge
  }
}

export {}
