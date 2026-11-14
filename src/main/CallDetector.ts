import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { app } from 'electron'

// =============================================================================
// CallDetector — notices when a call app starts using the microphone.
//
// A small PowerShell helper (resources/mic-sessions.ps1) asks Windows Core Audio
// every 2 s which processes have an ACTIVE capture session and prints
// "MIC zoom,chrome". (The privacy registry used before stopped updating on
// newer Windows builds.) Only known call apps and browsers count, so dictation
// or voice notes elsewhere don't trigger the "Take notes?" prompt. Our own
// process is ignored. The helper only reads session state — it never opens or
// records the microphone.
// =============================================================================

/** process name (lower-case, no .exe) → display name. */
const CALL_APPS: [RegExp, string][] = [
  [/^zoom/, 'Zoom'],
  [/^ms-teams$|^teams$|^msteams/, 'Microsoft Teams'],
  [/^slack$/, 'Slack'],
  [/^telegram$/, 'Telegram'],
  [/^discord/, 'Discord'],
  [/whatsapp/, 'WhatsApp'],
  [/^skype|^lync/, 'Skype'],
  [/^ciscocollabhost$|^webex|^atmgr$|^ciscowebex/, 'Webex'],
  [/^viber$/, 'Viber'],
  [/^signal$/, 'Signal'],
  [/^ringcentral/, 'RingCentral'],
  [/^goto$|^g2m/, 'GoTo Meeting'],
  [/^lark$|^feishu/, 'Lark'],
  [/^jitsi/, 'Jitsi Meet'],
  [/^facetime/, 'FaceTime'],
  [/^chrome$/, 'Chrome'],
  [/^msedge$/, 'Microsoft Edge'],
  [/^firefox$/, 'Firefox'],
  [/^brave$/, 'Brave'],
  [/^opera|^opera_gx/, 'Opera'],
  [/^arc$/, 'Arc'],
  [/^vivaldi$/, 'Vivaldi'],
  [/^yandex|^browser$/, 'Yandex Browser']
]
const BROWSERS = new Set(['Chrome', 'Microsoft Edge', 'Firefox', 'Brave', 'Opera', 'Arc', 'Vivaldi', 'Yandex Browser'])
const SELF = new Set(['minutama', 'electron'])

export function appNameFor(processName: string): string | null {
  const id = processName.trim().toLowerCase().replace(/\.exe$/, '')
  if (!id || SELF.has(id)) return null
  for (const [re, name] of CALL_APPS) if (re.test(id)) return name
  return null
}

/** "MIC zoom,chrome" → preferred call app name (dedicated app over a browser). */
export function pickCallApp(line: string): string | null {
  if (!line.startsWith('MIC')) return null
  const apps = line
    .slice(3)
    .split(',')
    .map(appNameFor)
    .filter((n): n is string => Boolean(n))
  if (apps.length === 0) return null
  return apps.find((a) => !BROWSERS.has(a)) ?? apps[0]
}

function helperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'mic-sessions.ps1')
    : join(app.getAppPath(), 'resources', 'mic-sessions.ps1')
}

export interface CallDetectorEvents {
  /** A call app took the mic (friendly app name). */
  onCallStart: (app: string) => void
  /** No call app holds the mic any more. */
  onCallEnd: () => void
}

let child: ChildProcess | null = null
let stopped = false
let currentApp: string | null = null
let missed = 0
let restarts = 0

export function startCallDetector(events: CallDetectorEvents, isEnabled: () => boolean): void {
  if (process.platform !== 'win32' || child) return
  stopped = false

  const handleLine = (line: string) => {
    if (!isEnabled()) {
      if (currentApp) {
        currentApp = null
        events.onCallEnd()
      }
      return
    }
    const found = pickCallApp(line.trim())
    if (found) {
      missed = 0
      if (found !== currentApp) {
        console.log('[calls] mic in use by', found)
        currentApp = found
        events.onCallStart(found)
      }
    } else if (currentApp) {
      // Apps briefly release the mic when switching devices; wait ~4 s.
      missed += 1
      if (missed >= 2) {
        console.log('[calls] call ended', currentApp)
        currentApp = null
        missed = 0
        events.onCallEnd()
      }
    }
  }

  const launch = () => {
    console.log('[calls] detector starting', helperPath())
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', helperPath()],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    child = proc
    let buf = ''
    proc.stdout?.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        handleLine(buf.slice(0, i))
        buf = buf.slice(i + 1)
      }
    })
    proc.stderr?.on('data', (d: Buffer) => console.warn('[calls] helper:', d.toString('utf8').slice(0, 300)))
    proc.on('exit', (code) => {
      child = null
      if (stopped) return
      restarts += 1
      console.warn('[calls] helper exited', code, '— restart', restarts)
      if (restarts <= 5) setTimeout(launch, 5000 * restarts)
    })
  }

  launch()
  app.on('will-quit', stopCallDetector)
}

export function stopCallDetector(): void {
  stopped = true
  child?.kill()
  child = null
  currentApp = null
}
