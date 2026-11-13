import type { Config } from 'tailwindcss'

// Minutama Agent design system — glass + tangerine, matching minutama.com.
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
        // Glass surfaces (translucent, no opacity modifiers)
        bg: 'var(--glass-bg)', // inputs, inset areas
        surface: 'var(--glass-surface)', // cards, panels
        'bg-2': 'var(--glass-bg-2)', // subtle fills, tabs
        border: 'var(--glass-border)',
        'border-soft': 'var(--glass-border-soft)',

        // Solid
        paper: '#FBFAF7',
        sand: '#F3F0E9',
        ink: '#15171C', // headings, dark panels
        accent: '#FF6A3D', // tangerine
        'accent-ink': '#C9441B', // hover / text on light
        'accent-soft': '#FFEDE5', // hover / selected
        'accent-pale': '#FFC9B3',
        text: '#15171C',
        'text-2': '#4A4F5C',
        'text-3': '#858A96',
        'text-4': '#B4B8C1',
        green: '#16A34A',
        'green-soft': '#E8F7EE',
        amber: '#D97706',
        'amber-soft': '#FFF7E6',
        red: '#E5484D', // recording
        'red-soft': '#FDEDEE',
        purple: '#7C3AED',
        'purple-soft': '#F1EAFE'
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
        glass: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 30px -12px rgba(21,23,28,.18)',
        'glass-lg': '0 1px 0 rgba(255,255,255,.8) inset, 0 24px 60px -20px rgba(21,23,28,.28)'
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
