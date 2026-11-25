import { invoke } from './ipc'

// The user's Windows display language, as one of the languages Minutama
// translates into ('uk', 'es', …). Used to preselect "Your language".

const SUPPORTED = ['uk', 'en', 'de', 'ru', 'pl', 'es', 'fr', 'it', 'pt', 'hi', 'bn', 'ur', 'tl', 'id', 'vi', 'tr', 'ar', 'ro']

const toCode = (tag: string) => {
  const t = tag.toLowerCase()
  return t.startsWith('fil') ? 'tl' : t.slice(0, 2)
}

export async function detectSystemLanguage(): Promise<string> {
  const tags = await invoke<string[]>('app:systemLanguages').catch(() => [] as string[])
  for (const tag of [...(tags ?? []), ...(navigator.languages ?? []), navigator.language]) {
    if (!tag) continue
    const code = toCode(tag)
    if (SUPPORTED.includes(code)) return code
  }
  return 'en'
}
