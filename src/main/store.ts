import Store from 'electron-store'
import { app } from 'electron'

// =============================================================================
// Settings store — electron-store, encrypted at rest (AES). Single source of
// truth for API keys, device choices, plan, and integration config. Backs the
// settings:* IPC channels and is read by the engines for keys + plan gating.
// =============================================================================

export interface AppSettings {
  openaiApiKey: string
  anthropicApiKey: string
  huggingfaceToken: string
  // AI provider selection: 'openai' uses openaiApiKey (or owner env key as fallback),
  // 'anthropic' uses anthropicApiKey (user must supply their own key).
  aiProvider: 'openai' | 'anthropic'
  aiModel: string  // e.g. 'gpt-4o', 'gpt-4.1', 'claude-sonnet-4-5', 'claude-opus-4-8'
  microphoneDevice: string
  systemAudioDevice: string
  micOnly: boolean
  launchAtStartup: boolean
  hotkeyRecord: string
  retentionDays: number
  plan: 'trial' | 'byok' | 'pro' | 'enterprise'
  licenseKey: string
  notionToken: string
  notionParentPageId: string
  slackWebhookUrl: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  emailFrom: string
  onboardingComplete: boolean
}

const DEFAULTS: AppSettings = {
  openaiApiKey: '',
  anthropicApiKey: '',
  huggingfaceToken: '',
  aiProvider: 'openai',
  aiModel: '',
  microphoneDevice: 'default',
  systemAudioDevice: 'virtual-audio-capturer',
  micOnly: false,
  launchAtStartup: false,
  hotkeyRecord: 'CmdOrCtrl+Shift+B',
  retentionDays: 90,
  plan: 'trial',
  licenseKey: '',
  notionToken: '',
  notionParentPageId: '',
  slackWebhookUrl: '',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  emailFrom: '',
  onboardingComplete: false
}

// encryptionKey obfuscates the on-disk JSON (electron-store uses AES-256-CBC).
// Note: this protects against casual inspection, not a determined local attacker
// (the key ships in the binary) — acceptable for local-first API key storage.
const store = new Store<AppSettings>({
  name: 'briefos-settings',
  encryptionKey: 'briefos-aes-key-2026',
  defaults: DEFAULTS
})

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return store.get(key)
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  store.set(key, value)
  // Side effects for settings that touch the OS.
  if (key === 'launchAtStartup') {
    app.setLoginItemSettings({ openAtLogin: Boolean(value) })
  }
}

export function getAllSettings(): AppSettings {
  return store.store
}

/** Pro features: exports, diarization, Period Reports. */
export function isPro(): boolean {
  const plan = store.get('plan')
  return plan === 'pro' || plan === 'enterprise'
}

/** User brings their own API keys (byok or pro/enterprise with override). */
export function isByok(): boolean {
  return store.get('plan') === 'byok'
}

/** Trial plan — limited to 10 meetings, we cover API costs. */
export function isTrial(): boolean {
  return store.get('plan') === 'trial'
}
