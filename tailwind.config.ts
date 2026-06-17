import type { Config } from 'tailwindcss'

// BriefOS design system — single source of truth for the renderer UI.
// Token names + values match the react-ui skill exactly. Never hardcode colors
// in components; always reference these tokens.
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F7F9FC',
        surface: '#FFFFFF',
        'bg-2': '#EFF3F9',
        'blue-deep': '#0A2540', // sidebar
        accent: '#1A56DB',
        'blue-mid': '#1B4F8A',
        'blue-tint': '#EBF3FF', // hover / selected
        'blue-pale': '#D6E8FF',
        border: '#D8E5F5',
        'border-soft': '#E8F0FA',
        text: '#0A2540', // primary
        'text-2': '#3D5A80', // secondary
        'text-3': '#7A95B8', // muted
        'text-4': '#A8BDD6',
        green: '#0EA874',
        'green-soft': '#E6F9F2',
        amber: '#D97706',
        'amber-soft': '#FFFBEB',
        red: '#E53E3E', // recording
        'red-soft': '#FEF2F2',
        purple: '#6D28D9',
        'purple-soft': '#EDE9FE'
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace']
      },
      borderRadius: {
        card: '10px',
        panel: '16px',
        modal: '22px'
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
