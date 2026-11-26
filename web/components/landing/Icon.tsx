// Line icons for the landing page (24×24, stroke = currentColor).

const PATHS: Record<string, string> = {
  play: 'M8 5.5v13l11-6.5z',
  check: 'M5 12.5l4.2 4.2L19 7',
  cursor: 'M6 3l12 6.5-5.2 1.6L10.5 17z M13 11l5 5',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.4 7.4 0 0 1-1.7 1l-.3 2h-4l-.3-2a7.4 7.4 0 0 1-1.7-1l-1.9.7-2-3.4 1.6-1.2a7.6 7.6 0 0 1 0-2l-1.6-1.2 2-3.4 1.9.7a7.4 7.4 0 0 1 1.7-1l.3-2h4l.3 2a7.4 7.4 0 0 1 1.7 1l1.9-.7 2 3.4-1.6 1.2a7.6 7.6 0 0 1 0 2z',
  done: 'M4 12.5l5 5L20 6.5',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.5L4 8 M4 4v4h4 M4 13a8 8 0 0 0 14.5 4.5L20 16 M20 20v-4h-4',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  headset: 'M4 14v-2a8 8 0 0 1 16 0v2 M4 14h3v5H5a1 1 0 0 1-1-1z M20 14h-3v5h2a1 1 0 0 0 1-1z M17 19c0 1.5-2 2.5-4 2.5',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z M5 19.5A1.5 1.5 0 0 0 6.5 21H19',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  quote: 'M7 7h4v4c0 3-1.5 5-4 6 M14 7h4v4c0 3-1.5 5-4 6',
  bars: 'M5 20V13 M10 20V9 M15 20V5 M20 20H3',
  mail: 'M3.5 6h17v12h-17z M4 6.5l8 6.5 8-6.5',
  download: 'M12 4v11 M7 10.5l5 5 5-5 M5 20h14',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20a7.5 7.5 0 0 1 15 0',
  chevron: 'M6 9l6 6 6-6',
  captions: 'M3.5 5.5h17v13h-17z M7 11h4 M13 11h4 M7 14.5h7',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z',
  notes: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 15.5h7 M9 8.5h3'
}

export function Icon({ name, className = 'h-5 w-5', fill = false }: { name: keyof typeof PATHS | string; className?: string; fill?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}
