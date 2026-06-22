import { useState, useRef, useCallback, useEffect } from 'react'
import { invoke, subscribe } from './lib/ipc'

type Status = 'idle' | 'working' | 'done' | 'error'

interface ProgressEvent {
  step: string
  pct: number
}

const STEP_LABELS: Record<string, string> = {
  downloading: 'Downloading audio…',
  extracting: 'Extracting audio track…',
  splitting: 'Splitting into chunks…',
  transcribing: 'Transcribing with Whisper…',
  done: 'Done!'
}

export default function Transcribe() {
  const [status, setStatus] = useState<Status>('idle')
  const [progressLabel, setProgressLabel] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [result, setResult] = useState('')
  const [language, setLanguage] = useState('')
  const [error, setError] = useState('')
  const [url, setUrl] = useState('')
  const [dragging, setDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = subscribe('transcribe:progress', (data: ProgressEvent) => {
      setProgressLabel(STEP_LABELS[data.step] ?? data.step)
      setProgressPct(data.pct)
    })
    return unsub
  }, [])

  const handleResult = useCallback((data: { text: string; language?: string } | null) => {
    if (!data?.text) {
      setError('Transcription returned empty result.')
      setStatus('error')
      return
    }
    setResult(data.text)
    setLanguage(data.language ?? '')
    setStatus('done')
  }, [])

  const handleError = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : String(err))
    setStatus('error')
  }, [])

  const transcribeFile = useCallback(async (path: string) => {
    setStatus('working')
    setResult('')
    setError('')
    setProgressLabel('Extracting audio track…')
    setProgressPct(5)
    try {
      const res = await invoke<{ text: string; language?: string }>('transcribe:file', path)
      handleResult(res)
    } catch (err) {
      handleError(err)
    }
  }, [handleResult, handleError])

  const transcribeUrl = useCallback(async () => {
    if (!url.trim()) return
    setStatus('working')
    setResult('')
    setError('')
    setProgressLabel('Downloading audio…')
    setProgressPct(5)
    try {
      const res = await invoke<{ text: string; language?: string }>('transcribe:url', url.trim())
      handleResult(res)
    } catch (err) {
      handleError(err)
    }
  }, [url, handleResult, handleError])

  // Drag and drop
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) transcribeFile(file.path)
  }

  const openFileDialog = async () => {
    // Use electron dialog via a hidden file input
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.mp3,.m4a,.wav,.ogg'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) transcribeFile((file as File & { path: string }).path)
    }
    input.click()
  }

  const copyText = async () => {
    await navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const reset = () => {
    setStatus('idle')
    setResult('')
    setError('')
    setUrl('')
    setProgressPct(0)
    setProgressLabel('')
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display font-bold text-[22px] text-text mb-1">Transcribe Video</h1>
        <p className="text-text-3 text-[13px]">Drop a video file or paste a YouTube / TikTok URL — get the full text in seconds.</p>
      </div>

      {status === 'idle' && (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            ref={dropRef}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={openFileDialog}
            className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-all select-none ${
              dragging
                ? 'border-accent bg-blue-tint scale-[1.01]'
                : 'border-border hover:border-accent/50 hover:bg-surface'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-tint flex items-center justify-center">
              <i className="ti ti-video text-[28px] text-accent" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-text text-[14px]">Drop a video here</p>
              <p className="text-text-3 text-[12px] mt-1">MP4, MOV, AVI, MKV, WebM, MP3, M4A…</p>
            </div>
            <span className="text-[11px] text-text-3 bg-surface border border-border rounded-full px-3 py-1">
              or click to browse
            </span>
          </div>

          {/* URL input */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-text-3 font-medium">or paste a URL</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && transcribeUrl()}
              placeholder="https://youtube.com/shorts/… or TikTok, Instagram…"
              className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-[13px] text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
            />
            <button
              onClick={transcribeUrl}
              disabled={!url.trim()}
              className="px-5 py-3 bg-accent text-white rounded-xl text-[13px] font-semibold hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <i className="ti ti-arrow-right text-[15px]" />
              Go
            </button>
          </div>
        </div>
      )}

      {status === 'working' && (
        <div className="bg-surface border border-border rounded-2xl p-10 flex flex-col items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-blue-tint flex items-center justify-center">
            <i className="ti ti-loader-2 text-[28px] text-accent animate-spin-slow" />
          </div>
          <div className="w-full max-w-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-text font-medium">{progressLabel}</span>
              <span className="text-[12px] text-text-3">{progressPct}%</span>
            </div>
            <div className="h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-soft border border-red/20 rounded-2xl p-6 flex gap-3">
          <i className="ti ti-alert-circle text-red text-[20px] mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-red text-[13px] mb-1">Transcription failed</p>
            <p className="text-text-3 text-[12px] leading-relaxed">{error}</p>
          </div>
          <button onClick={reset} className="text-text-3 hover:text-text transition-colors ml-auto flex-shrink-0">
            <i className="ti ti-x text-[16px]" />
          </button>
        </div>
      )}

      {status === 'done' && (
        <div className="space-y-4">
          {/* Header bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green" />
              <span className="text-[13px] font-semibold text-text">Transcription complete</span>
              {language && (
                <span className="text-[11px] text-text-3 bg-surface border border-border rounded-full px-2 py-0.5 uppercase">
                  {language}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyText}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-surface border border-border hover:border-accent/50 hover:text-accent transition-all text-text-2"
              >
                <i className={`ti ti-${copied ? 'check' : 'copy'} text-[14px]`} />
                {copied ? 'Copied!' : 'Copy all'}
              </button>
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-surface border border-border hover:border-accent/50 hover:text-accent transition-all text-text-2"
              >
                <i className="ti ti-refresh text-[14px]" />
                New
              </button>
            </div>
          </div>

          {/* Result text */}
          <div className="bg-surface border border-border rounded-2xl p-5 min-h-[200px] max-h-[500px] overflow-y-auto">
            <p className="text-[13px] text-text leading-relaxed whitespace-pre-wrap">{result}</p>
          </div>

          <p className="text-[11px] text-text-3 text-center">
            {result.split(' ').length} words · {result.length} characters
          </p>
        </div>
      )}
    </div>
  )
}
