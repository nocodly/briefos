import type { Config } from 'tailwindcss'

// Minutama Agent design system — dark glass + tangerine.
// Never hardcode colors in components; reference these tokens.
//
// Surfaces are translucent CSS variables (see index.css) so panels read as
// frosted glass over the warm app backdrop. Solid tokens are hex so opacity
// modifiers (bg-accent/20, bg-ink/60 …) keep working.
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Glass surfaces (translucent, no opacity modifiers) — see index.css
        bg: 'var(--glass-bg)', // inputs, inset areas
        surface: 'var(--glass-surface)', // cards, panels
        'bg-2': 'var(--glass-bg-2)', // subtle fills, tabs
        border: 'var(--glass-border)',
        'border-soft': 'var(--glass-border-soft)',

        // Solid (dark theme). Hex so opacity modifiers keep working.
        paper: '#0B0C0F', // app background
        sand: '#1C1D22',
        ink: '#17181D', // dark panels
        accent: '#FF6A3D', // tangerine
        'accent-ink': '#FF8F6B', // accent text / hover on dark
        'accent-soft': '#2A1811', // selected / highlight fill
        'accent-pale': '#FFC9B3',
        text: '#F3F1EC',
        'text-2': '#B4B1AB',
        'text-3': '#807D78',
        'text-4': '#595751',
        green: '#22C55E',
        'green-soft': '#0F2418',
        amber: '#F5A524',
        'amber-soft': '#2A200C',
        red: '#F2555A', // recording
        'red-soft': '#2C1316',
        purple: '#A78BFA',
        'purple-soft': '#1F1733'
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'Inter', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      },
      borderRadius: {
        card: '14px',
        panel: '20px',
        modal: '26px'
      },
      boxShadow: {
        glass: '0 1px 0 rgba(255,255,255,.05) inset, 0 12px 40px -18px rgba(0,0,0,.65)',
        'glass-lg': '0 1px 0 rgba(255,255,255,.07) inset, 0 30px 80px -24px rgba(0,0,0,.8)'
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.85)' }
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(0.4)' },
          '50%': { transform: 'scaleY(1)' }
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
        wave: 'wave 0.8s ease-in-out infinite',
        'spin-slow': 'spin 0.9s linear infinite',
        'fade-up': 'fadeUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
      }
    }
  },
  plugins: []
} satisfies Config
