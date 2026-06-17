---
name: react-ui
description: Use this skill for ANY task involving React components, Tailwind CSS styling, UI state management, or any renderer-side code in BriefOS. Triggers when: creating or editing any .jsx file in src/renderer/ — or when the user asks "how to style this component", "button not working", "state not updating", "how to show the overlay", "loading spinner", "how to connect to IPC from React", "Tailwind class not applying", "animation not smooth". Always use before writing any React/UI code — it contains the exact BriefOS design tokens, component patterns, and Tailwind config that must stay consistent.
---

# React UI — BriefOS

## Design tokens — use EXACTLY these

```js
// tailwind.config.js
module.exports = {
  content: ['./src/renderer/**/*.{jsx,js}'],
  theme: {
    extend: {
      colors: {
        bg: '#F7F9FC',
        surface: '#FFFFFF',
        'bg-2': '#EFF3F9',
        'blue-deep': '#0A2540',
        accent: '#1A56DB',
        'blue-mid': '#1B4F8A',
        'blue-tint': '#EBF3FF',
        'blue-pale': '#D6E8FF',
        border: '#D8E5F5',
        'border-soft': '#E8F0FA',
        text: '#0A2540',
        'text-2': '#3D5A80',
        'text-3': '#7A95B8',
        'text-4': '#A8BDD6',
        green: '#0EA874',
        'green-soft': '#E6F9F2',
        amber: '#D97706',
        'amber-soft': '#FFFBEB',
        red: '#E53E3E',
        'red-soft': '#FEF2F2',
        purple: '#6D28D9',
        'purple-soft': '#EDE9FE',
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      borderRadius: {
        card: '10px',
        panel: '16px',
        modal: '22px',
      },
      animation: {
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
        'wave': 'wave 0.8s ease-in-out infinite',
        'spin-slow': 'spin 0.9s linear infinite',
        'fade-up': 'fadeUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      },
    }
  }
}
```

---

## App router — App.jsx

```jsx
// src/renderer/App.jsx
import { useState } from 'react'
import Dashboard from './Dashboard'
import MeetingView from './MeetingView'
import PeriodReport from './PeriodReport'
import Settings from './Settings'
import Onboarding from './Onboarding'
import Processing from './Processing'

export default function App() {
  const [page, setPage] = useState('dashboard')  // dashboard | meeting | period | settings | onboarding
  const [activeMeetingId, setActiveMeetingId] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState('')

  // Listen for push events from main
  useEffect(() => {
    const sub1 = window.electron.on('progress:transcription', ({ pct, step }) => {
      setIsProcessing(true)
      setProcessingStep(step)
    })
    const sub2 = window.electron.on('progress:done', ({ meetingId }) => {
      setIsProcessing(false)
      setActiveMeetingId(meetingId)
      setPage('meeting')
    })
    return () => {
      window.electron.off('progress:transcription', sub1)
      window.electron.off('progress:done', sub2)
    }
  }, [])

  if (isProcessing) return <Processing step={processingStep} />

  const navigate = (p, id = null) => {
    setPage(p)
    if (id) setActiveMeetingId(id)
  }

  return (
    <div className="flex min-h-screen bg-bg font-body">
      <Sidebar page={page} navigate={navigate} />
      <main className="flex-1 overflow-auto">
        {page === 'dashboard' && <Dashboard navigate={navigate} />}
        {page === 'meeting' && <MeetingView id={activeMeetingId} navigate={navigate} />}
        {page === 'period' && <PeriodReport navigate={navigate} />}
        {page === 'settings' && <Settings navigate={navigate} />}
        {page === 'onboarding' && <Onboarding navigate={navigate} />}
      </main>
    </div>
  )
}
```

---

## Sidebar component

```jsx
function Sidebar({ page, navigate }) {
  return (
    <aside className="w-[200px] bg-blue-deep flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-white/7">
        <div className="w-[26px] h-[26px] bg-accent rounded-md flex items-center justify-center flex-shrink-0">
          {/* SVG logo */}
        </div>
        <span className="font-display font-bold text-[14px] text-white">
          Brief<span className="text-[#7CB9FF]">OS</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="p-2 flex-1">
        <NavItem icon="layout-dashboard" label="Dashboard" active={page==='dashboard'} onClick={() => navigate('dashboard')} />
        <NavItem icon="chart-bar" label="Period Reports" active={page==='period'} onClick={() => navigate('period')} />
        <NavItem icon="search" label="Search" onClick={() => {}} />
      </nav>

      {/* Bottom */}
      <div className="p-2 border-t border-white/7">
        <NavItem icon="settings" label="Settings" active={page==='settings'} onClick={() => navigate('settings')} />
      </div>
    </aside>
  )
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] mb-0.5 transition-all
        ${active
          ? 'bg-white/11 text-white'
          : 'text-white/50 hover:bg-white/6 hover:text-white/80'
        }`}
    >
      <i className={`ti ti-${icon} text-[16px] w-[18px] text-center`} />
      {label}
    </button>
  )
}
```

---

## Button variants — use consistently

```jsx
// Primary — main CTA
<button className="bg-accent hover:bg-blue-mid text-white rounded-lg px-4 py-2.5 text-[13px] font-medium flex items-center gap-1.5 transition-all shadow-[0_2px_8px_rgba(26,86,219,.22)] active:scale-[.97]">
  <i className="ti ti-sparkles text-[15px]" /> Generate Summary
</button>

// Secondary — secondary action
<button className="bg-surface hover:bg-blue-tint text-text-2 hover:text-accent border border-border hover:border-accent rounded-lg px-3.5 py-2.5 text-[13px] flex items-center gap-1.5 transition-all">
  <i className="ti ti-download text-[14px]" /> Export PDF
</button>

// Ghost — low-priority
<button className="text-text-3 hover:text-text-2 hover:bg-bg-2 rounded-lg px-2.5 py-2 text-[12px] flex items-center gap-1.5 transition-all">
  <i className="ti ti-trash text-[14px]" /> Delete
</button>

// Danger
<button className="bg-red-soft text-red border border-red/20 hover:bg-red/10 rounded-lg px-3.5 py-2.5 text-[13px] flex items-center gap-1.5 transition-all">
  <i className="ti ti-trash text-[14px]" /> Delete meeting
</button>
```

---

## Card pattern

```jsx
// Standard card
<div className="bg-surface border border-border-soft rounded-panel shadow-sm overflow-hidden">
  {/* Card header */}
  <div className="flex items-center gap-2 px-[18px] py-3.5 border-b border-border-soft bg-bg">
    <div className="w-7 h-7 rounded-lg bg-blue-tint flex items-center justify-center">
      <i className="ti ti-check text-[15px] text-accent" />
    </div>
    <span className="text-[12px] font-semibold text-text tracking-wide">Card title</span>
  </div>
  {/* Card body */}
  <div className="p-[18px]">
    {/* content */}
  </div>
</div>
```

---

## IPC hooks — reusable patterns

```jsx
// hooks/useMeetings.js
import { useState, useEffect } from 'react'

export function useMeetings() {
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electron.invoke('meetings:getAll').then(data => {
      setMeetings(data)
      setLoading(false)
    })
  }, [])

  const deleteMeeting = async (id) => {
    await window.electron.invoke('meetings:delete', id)
    setMeetings(prev => prev.filter(m => m.id !== id))
  }

  return { meetings, loading, deleteMeeting }
}

// hooks/useRecording.js
export function useRecording() {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const sub = window.electron.on('recording:tick', ({ durationMs }) => {
      setDuration(durationMs)
    })
    return () => window.electron.off('recording:tick', sub)
  }, [])

  const start = () => {
    window.electron.invoke('recording:start')
    setIsRecording(true)
    setDuration(0)
  }

  const stop = async () => {
    const result = await window.electron.invoke('recording:stop')
    setIsRecording(false)
    return result
  }

  return { isRecording, duration, start, stop }
}
```

---

## Audio wave animation — for recording overlay

```jsx
function AudioWave({ active }) {
  return (
    <div className="flex items-end gap-0.5 h-6">
      {[8, 14, 10, 18, 12, 7].map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm bg-accent"
          style={{
            height: active ? `${h}px` : '4px',
            animation: active ? `wave 0.8s ease-in-out ${i * 0.1}s infinite` : 'none',
            transition: 'height 0.3s ease',
          }}
        />
      ))}
    </div>
  )
}
```

---

## Processing screen

```jsx
function Processing({ step }) {
  return (
    <div className="fixed inset-0 bg-blue-deep/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-surface rounded-modal p-10 w-[400px] text-center shadow-2xl">
        <div className="w-14 h-14 border-[3px] border-blue-pale border-t-accent rounded-full animate-spin-slow mx-auto mb-5" />
        <h2 className="font-display font-bold text-xl text-blue-deep mb-2">Analyzing your meeting</h2>
        <p className="text-[13px] text-text-3 mb-6">{step}</p>
        {/* steps list */}
      </div>
    </div>
  )
}
```

---

## Key rules

- Never hardcode colors — always use Tailwind design tokens above
- Never use `style={{color: '#something'}}` unless it's a dynamic value
- All icons use Tabler: `<i className="ti ti-{name}" />`
- Font display (headings): `font-display font-bold`
- Font body (text): `font-body` (default, no class needed)
- Font mono (timestamps, keys): `font-mono`
- Transitions: always `transition-all` with hover states
- Cards: always `rounded-panel` (16px) with `border border-border-soft`
- Modals: `rounded-modal` (22px)
