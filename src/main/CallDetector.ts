import { execFile } from 'node:child_process'
import { basename } from 'node:path'

// =============================================================================
// CallDetector — notices when a call app starts using the microphone.
//
// Windows records every app's microphone use under
//   HKCU\…\CapabilityAccessManager\ConsentStore\microphone[\NonPackaged]\<app>
// and while an app holds the mic its LastUsedTimeStop is 0. We poll that key
// (cheap: one `reg query` every few seconds) and report which known call app —
// or browser, for Meet/Teams-web/etc. — is currently on the mic.
// Only call apps and browsers count, so dictation or voice notes in other apps
// don't trigger the "Start notes?" prompt. Our own process is ignored.
// =============================================================================

const ROOT = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone'
const POLL_MS = 3000

/** exe name (lower-case) or packaged-app family prefix → display name. */
const CALL_APPS: [RegExp, string][] = [
  [/^zoom\.exe$|^zoom/, 'Zoom'],
  [/^ms-teams\.exe$|^teams\.exe$|^msteams|^microsoft\.teams/, 'Microsoft Teams'],
  [/^slack\.exe$|slack/, 'Slack'],
  [/^telegram\.exe$|telegram/, 'Telegram'],
  [/^discord\.exe$|discord/, 'Discord'],
  [/whatsapp/, 'WhatsApp'],
  [/^skype|skype/, 'Skype'],
  [/^ciscocollabhost\.exe$|^webex|^atmgr\.exe$/, 'Webex'],
  [/^viber\.exe$|viber/, 'Viber'],
  [/^signal\.exe$|signal/, 'Signal'],
  [/^ringcentral|ringcentral/, 'RingCentral'],
  [/^goto\.exe$|^g2m/, 'GoTo Meeting'],
  [/^lark\.exe$|^feishu/, 'Lark'],
  [/^jitsi/, 'Jitsi Meet'],
  [/^facetime/, 'FaceTime'],
  [/^chrome\.exe$/, 'Chrome'],
  [/^msedge\.exe$/, 'Microsoft Edge'],
  [/^firefox\.exe$/, 'Firefox'],
  [/^brave\.exe$/, 'Brave'],
  [/^opera\.exe$|^opera_gx/, 'Opera'],
  [/^arc\.exe$|thebrowsercompany/, 'Arc'],
  [/^vivaldi\.exe$/, 'Vivaldi']
]

function appNameFor(keyName: string): string | null {
  // NonPackaged keys are full paths with '#' instead of '\'; packaged ones are
  // "<Publisher>.<Name>_<hash>".
  const leaf = keyName.includes('#') ? basename(keyName.replace(/#/g, '\\')) : keyName
  const id = leaf.toLowerCase()
  for (const [re, name] of CALL_APPS) if (re.test(id)) return name
  return null
}

/** Parse `reg query /s` output → app keys whose LastUsedTimeStop is 0 (mic in use). */
export function parseActiveMicApps(output: string, selfExe: string): string[] {
  const active: string[] = []
  const self = selfExe.toLowerCase().replace(/\\/g, '#')
  let key = ''
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('HKEY_')) {
      key = line
      continue
    }
    const m = /^LastUsedTimeStop\s+REG_QWORD\s+0x([0-9a-f]+)$/i.exec(line)
    if (!m || Number.parseInt(m[1], 16) !== 0) continue
    const leaf = key.split('\\').pop() ?? ''
    const lower = leaf.toLowerCase()
    if (lower === self || lower.endsWith('#minutama.exe') || lower.endsWith('#electron.exe')) continue
    active.push(leaf)
  }
  return active
}

function queryRegistry(): Promise<string> {
  return new Promise((resolve) => {
    execFile('reg', ['query', ROOT, '/s'], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) =>
      resolve(err ? '' : stdout)
    )
  })
}

export interface CallDetectorEvents {
  /** A call app took the mic (name is the friendly app name). */
  onCallStart: (app: string) => void
  /** No call app holds the mic any more. */
  onCallEnd: () => void
}

let timer: NodeJS.Timeout | null = null
let currentApp: string | null = null
let missedPolls = 0

export function startCallDetector(events: CallDetectorEvents, isEnabled: () => boolean): void {
  if (process.platform !== 'win32' || timer) return
  console.log('[calls] detector started')

  const tick = async () => {
    if (!isEnabled()) {
      if (currentApp) {
        currentApp = null
        events.onCallEnd()
      }
      return
    }
    const out = await queryRegistry()
    if (!out) return
    const apps = parseActiveMicApps(out, process.execPath)
      .map(appNameFor)
      .filter((n): n is string => Boolean(n))

    if (apps.length > 0) {
      missedPolls = 0
      // Prefer a dedicated call app over a browser when both hold the mic.
      const browsers = new Set(['Chrome', 'Microsoft Edge', 'Firefox', 'Brave', 'Opera', 'Arc', 'Vivaldi'])
      const app = apps.find((a) => !browsers.has(a)) ?? apps[0]
      if (app !== currentApp) {
        console.log('[calls] mic in use by', app)
        currentApp = app
        events.onCallStart(app)
      }
    } else if (currentApp) {
      // Apps briefly release the mic when switching devices; wait 2 polls.
      missedPolls += 1
      if (missedPolls >= 2) {
        console.log('[calls] call ended', currentApp)
        currentApp = null
        missedPolls = 0
        events.onCallEnd()
      }
    }
  }

  timer = setInterval(() => void tick(), POLL_MS)
  void tick()
}

export function stopCallDetector(): void {
  if (timer) clearInterval(timer)
  timer = null
  currentApp = null
}
