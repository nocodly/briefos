import { useEffect, useState } from 'react'
import { invoke, subscribe } from './lib/ipc'
import Processing from './Processing'

// =============================================================================
// PeriodReport — BriefOS's differentiator. Pick a period → ai:generatePeriodReport
// → render the cross-meeting intelligence report. Listens to progress:periodReport
// for live status and exports via export:periodReportPdf.
// =============================================================================

interface Decision {
  decision: string
  meeting: string
  date: string
}
interface OpenAction {
  person: string
  task: string
  deadline: string | null
  priority: 'high' | 'medium' | 'low'
  sourceMeeting: string
  sourceDate?: string
}
interface RecurringQuestion {
  question: string
  appearedIn: string[]
}
interface Topic {
  topic: string
  count: number
}
interface SpeakerStat {
  name: string
  totalMinutes: number
  percentage: number
}
interface Insight {
  type: 'pattern' | 'warning' | 'opportunity'
  text: string
}
interface Report {
  reportId: string
  meetingCount: number
  executiveSummary: string
  mainThemes: string[]
  allDecisions: Decision[]
  openActions: OpenAction[]
  recurringQuestions: RecurringQuestion[]
  topTopics: Topic[]
  speakerStats: SpeakerStat[]
  aiInsights: Insight[]
  keywords: string[]
}

// --- Date range helpers (local boundaries → ISO for SQLite comparison) ------

function iso(d: Date): string {
  return d.toISOString()
}
function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

interface PeriodDef {
  label: string
  getRange: () => { from: string; to: string }
}

const PERIODS: PeriodDef[] = [
  {
    label: 'This week',
    getRange: () => {
      const now = new Date()
      const day = (now.getDay() + 6) % 7 // Monday = 0
      const monday = new Date(now)
      monday.setDate(now.getDate() - day)
      return { from: iso(startOfDay(monday)), to: iso(endOfDay(now)) }
    }
  },
  {
    label: 'Last 30 days',
    getRange: () => {
      const now = new Date()
      const past = new Date(now)
      past.setDate(now.getDate() - 30)
      return { from: iso(startOfDay(past)), to: iso(endOfDay(now)) }
    }
  },
  {
    label: 'This month',
    getRange: () => {
      const now = new Date()
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: iso(startOfDay(first)), to: iso(endOfDay(now)) }
    }
  },
  {
    label: 'This quarter',
    getRange: () => {
      const now = new Date()
      const q = Math.floor(now.getMonth() / 3)
      const first = new Date(now.getFullYear(), q * 3, 1)
      return { from: iso(startOfDay(first)), to: iso(endOfDay(now)) }
    }
  },
  {
    label: 'This year',
    getRange: () => {
      const now = new Date()
      const first = new Date(now.getFullYear(), 0, 1)
      return { from: iso(startOfDay(first)), to: iso(endOfDay(now)) }
    }
  }
]

export default function PeriodReport() {
  const [selected, setSelected] = useState('This month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [view, setView] = useState<'empty' | 'processing' | 'report'>('empty')
  const [report, setReport] = useState<Report | null>(null)
  const [step, setStep] = useState('')
  const [error, setError] = useState('')
  const [previewCount, setPreviewCount] = useState<number | null>(null)

  const isCustom = selected === 'Custom'
  const resolveRange = (): { from: string; to: string } | null => {
    if (isCustom) {
      if (!customFrom || !customTo) return null
      return { from: iso(startOfDay(new Date(customFrom))), to: iso(endOfDay(new Date(customTo))) }
    }
    return PERIODS.find((p) => p.label === selected)?.getRange() ?? null
  }

  // Best-effort meeting count preview (skill: show count before generating).
  useEffect(() => {
    const range = resolveRange()
    if (!range) {
      setPreviewCount(null)
      return
    }
    invoke<unknown[]>('meetings:getAll', { from: range.from, to: range.to, limit: 1000 })
      .then((rows) => setPreviewCount(Array.isArray(rows) ? rows.length : null))
      .catch(() => setPreviewCount(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, customFrom, customTo])

  const generate = async () => {
    const range = resolveRange()
    if (!range) {
      setError('Please choose a valid date range.')
      return
    }
    setError('')
    setView('processing')
    setStep('Starting…')
    const unsub = subscribe('progress:periodReport', ({ step: s }) => setStep(s))
    try {
      const result = await invoke<Report>('ai:generatePeriodReport', {
        from: range.from,
        to: range.to,
        label: selected
      })
      setReport(result)
      setView('report')
    } catch (err) {
      setError((err as Error).message)
      setView('empty')
    } finally {
      unsub()
    }
  }

  return (
    <div className="min-h-screen bg-bg font-body text-text">
      {/* Period picker bar */}
      <div className="sticky top-0 z-10 bg-blue-deep px-8 py-5">
        <h1 className="font-display font-extrabold text-[22px] text-white mb-3">
          Period Intelligence
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setSelected(p.label)
                if (view === 'report') setView('empty')
              }}
              className={`px-3.5 py-2 rounded-lg text-[12px] transition-all ${
                selected === p.label
                  ? 'bg-accent text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/15'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setSelected('Custom')}
            className={`px-3.5 py-2 rounded-lg text-[12px] transition-all ${
              isCustom ? 'bg-accent text-white' : 'bg-white/10 text-white/70 hover:bg-white/15'
            }`}
          >
            Custom
          </button>
          {isCustom && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-white/10 text-white text-[12px] rounded-lg px-2.5 py-1.5 border border-white/15 focus:outline-none"
              />
              <span className="text-white/40 text-[12px]">→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-white/10 text-white text-[12px] rounded-lg px-2.5 py-1.5 border border-white/15 focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      <div className="p-8">
        {error && (
          <div className="mb-4 text-[12px] text-red bg-red-soft border border-red/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {view === 'empty' && (
          <EmptyState
            period={selected}
            count={previewCount}
            onGenerate={generate}
          />
        )}
        {view === 'processing' && <Processing step={step} />}
        {view === 'report' && report && (
          <ReportView report={report} period={selected} onError={setError} />
        )}
      </div>
    </div>
  )
}

function EmptyState({
  period,
  count,
  onGenerate
}: {
  period: string
  count: number | null
  onGenerate: () => void
}) {
  return (
    <div className="bg-surface border border-border-soft rounded-panel p-12 text-center animate-fade-up">
      <div className="w-14 h-14 rounded-panel bg-blue-tint flex items-center justify-center mx-auto mb-4">
        <i className="ti ti-chart-histogram text-[28px] text-accent" />
      </div>
      <h3 className="font-display font-bold text-[18px] text-blue-deep mb-1">
        Analyze {period.toLowerCase()}
      </h3>
      <p className="text-[13px] text-text-3 mb-1 max-w-[420px] mx-auto">
        BriefOS reads every meeting in this period and surfaces decisions, open actions, recurring
        questions, themes, and who drove the conversation.
      </p>
      {count !== null && (
        <p className="text-[12px] text-text-2 mb-6">
          <span className="font-semibold text-accent">{count}</span>{' '}
          {count === 1 ? 'meeting' : 'meetings'} found in this period
        </p>
      )}
      <div className="mt-5">
        <button
          onClick={onGenerate}
          disabled={count === 0}
          className="bg-accent hover:bg-blue-mid text-white rounded-lg px-5 py-2.5 text-[13px] font-medium inline-flex items-center gap-1.5 transition-all shadow-[0_2px_8px_rgba(26,86,219,.22)] active:scale-[.97] disabled:opacity-50"
        >
          <i className="ti ti-sparkles text-[15px]" /> Generate Report
        </button>
      </div>
      {count === 0 && (
        <p className="text-[12px] text-text-3 mt-3">No meetings recorded in this period.</p>
      )}
    </div>
  )
}

function ReportView({
  report,
  period,
  onError
}: {
  report: Report
  period: string
  onError: (m: string) => void
}) {
  const [exporting, setExporting] = useState(false)
  const totalMinutes = report.speakerStats.reduce((s, x) => s + (x.totalMinutes || 0), 0)

  const exportPdf = async () => {
    setExporting(true)
    try {
      await invoke('export:periodReportPdf', { reportId: report.reportId })
    } catch (err) {
      onError(`PDF export failed: ${(err as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Hero */}
      <div className="bg-blue-deep rounded-panel px-7 py-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[12px] text-[#B9CBE4] mb-1">{period}</div>
            <h2 className="font-display font-extrabold text-[22px]">Intelligence Report</h2>
          </div>
          <button
            onClick={exportPdf}
            disabled={exporting}
            className="bg-white/10 hover:bg-white/20 text-white rounded-lg px-3.5 py-2 text-[12px] flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <i className={`ti ti-${exporting ? 'loader-2 animate-spin-slow' : 'file-type-pdf'} text-[14px]`} />
            Export PDF
          </button>
        </div>
        <div className="flex gap-8 mt-5">
          <Stat num={report.meetingCount} label="Meetings" />
          <Stat num={Math.round(totalMinutes)} label="Minutes" />
          <Stat num={report.allDecisions.length} label="Decisions" />
          <Stat num={report.openActions.length} label="Open actions" />
        </div>
      </div>

      {/* Executive summary + themes */}
      <div className="grid grid-cols-2 gap-4">
        <Card title="Executive Summary" icon="article">
          <p className="text-[13px] text-text leading-relaxed">{report.executiveSummary || '—'}</p>
        </Card>
        <Card title="Main Themes" icon="bulb">
          {report.mainThemes.length ? (
            <ul className="space-y-2">
              {report.mainThemes.map((t, i) => (
                <li key={i} className="text-[13px] text-text flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </Card>
      </div>

      {/* AI insights */}
      {report.aiInsights.length > 0 && (
        <Card title="AI Insights" icon="sparkles">
          <div className="space-y-2">
            {report.aiInsights.map((ins, i) => (
              <Insight key={i} insight={ins} />
            ))}
          </div>
        </Card>
      )}

      {/* Decisions + Open actions */}
      <div className="grid grid-cols-2 gap-4">
        <Card title="All Decisions" icon="circle-check">
          {report.allDecisions.length ? (
            <div className="divide-y divide-border-soft">
              {report.allDecisions.map((d, i) => (
                <div key={i} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="text-[13px] text-text">{d.decision}</div>
                  <div className="text-[11px] text-text-3 mt-0.5">
                    {d.meeting} · <span className="font-mono">{d.date}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Card>
        <Card title="Open Actions" icon="checklist">
          {report.openActions.length ? (
            <div className="divide-y divide-border-soft">
              {report.openActions.map((a, i) => (
                <div key={i} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-3">
                  <div className="flex-1">
                    <div className="text-[13px] text-text">{a.task}</div>
                    <div className="text-[11px] text-text-3 mt-0.5">
                      <span className="font-medium text-text-2">{a.person}</span> · from{' '}
                      {a.sourceMeeting}
                      {a.deadline && <span className="font-mono"> · due {a.deadline}</span>}
                    </div>
                  </div>
                  <PriorityPill p={a.priority} />
                </div>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Card>
      </div>

      {/* Speaker time + Top topics */}
      <div className="grid grid-cols-2 gap-4">
        <Card title="Speaker Time" icon="microphone">
          {report.speakerStats.length ? (
            <div className="space-y-2.5">
              {report.speakerStats.map((sp, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-text font-medium">{sp.name}</span>
                    <span className="text-text-3">
                      {sp.totalMinutes}m · {sp.percentage}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-bg-2 overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${sp.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Card>
        <Card title="Top Topics" icon="chart-bar">
          {report.topTopics.length ? (
            <div className="space-y-2">
              {report.topTopics.map((t, i) => {
                const max = report.topTopics[0]?.count || 1
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[12px] text-text w-28 truncate">{t.topic}</span>
                    <div className="flex-1 h-2 rounded-full bg-bg-2 overflow-hidden">
                      <div
                        className="h-full bg-green"
                        style={{ width: `${(t.count / max) * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-text-3 font-mono w-6 text-right">
                      {t.count}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty />
          )}
        </Card>
      </div>

      {/* Recurring questions + Keywords */}
      <div className="grid grid-cols-2 gap-4">
        <Card title="Recurring Questions" icon="help-circle">
          {report.recurringQuestions.length ? (
            <div className="space-y-2.5">
              {report.recurringQuestions.map((q, i) => (
                <div key={i}>
                  <div className="text-[13px] text-text">{q.question}</div>
                  <div className="text-[11px] text-text-3 mt-0.5">
                    Appeared in {q.appearedIn.length} meetings
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Card>
        <Card title="Keywords" icon="tags">
          {report.keywords.length ? (
            <div className="flex flex-wrap gap-1.5">
              {report.keywords.map((k) => (
                <span key={k} className="text-[11px] px-2.5 py-1 rounded-full bg-blue-tint text-text-2">
                  {k}
                </span>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Card>
      </div>
    </div>
  )
}

function Stat({ num, label }: { num: number; label: string }) {
  return (
    <div>
      <div className="font-display font-extrabold text-[22px]">{num}</div>
      <div className="text-[11px] text-[#B9CBE4] uppercase tracking-wide">{label}</div>
    </div>
  )
}

function Insight({ insight }: { insight: Insight }) {
  const style: Record<string, { c: string; icon: string }> = {
    pattern: { c: 'bg-blue-tint text-accent', icon: 'chart-dots' },
    warning: { c: 'bg-red-soft text-red', icon: 'alert-triangle' },
    opportunity: { c: 'bg-green-soft text-green', icon: 'trending-up' }
  }
  const st = style[insight.type] || style.pattern
  return (
    <div className="flex items-start gap-2.5">
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${st.c}`}>
        <i className={`ti ti-${st.icon} text-[13px]`} />
      </div>
      <div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3 capitalize">
          {insight.type}
        </span>
        <p className="text-[13px] text-text">{insight.text}</p>
      </div>
    </div>
  )
}

function PriorityPill({ p }: { p: 'high' | 'medium' | 'low' }) {
  const c: Record<string, string> = {
    high: 'bg-red-soft text-red',
    medium: 'bg-amber-soft text-amber',
    low: 'bg-green-soft text-green'
  }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${c[p]}`}>
      {p}
    </span>
  )
}

function Card({
  title,
  icon,
  children
}: {
  title: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-border-soft rounded-panel shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-[18px] py-3.5 border-b border-border-soft bg-bg">
        <div className="w-7 h-7 rounded-lg bg-blue-tint flex items-center justify-center">
          <i className={`ti ti-${icon} text-[15px] text-accent`} />
        </div>
        <span className="text-[12px] font-semibold text-text tracking-wide">{title}</span>
      </div>
      <div className="p-[18px]">{children}</div>
    </div>
  )
}

function Empty() {
  return <p className="text-[13px] text-text-3">None</p>
}
