import type { Config } from 'tailwindcss'

// Minutama brand tokens — warm paper + ink, one tangerine accent.
export default {
  content: ['./app/**/*.{ts,tsx,mdx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#15171C', //        primary text, dark surfaces
        'ink-2': '#4A4F5C', //    secondary text
        'ink-3': '#8A8F9C', //    muted text
        paper: '#FBFAF7', //      page background
        sand: '#F3F0E9', //       soft section background
        line: '#E6E1D6', //       borders
        accent: '#FF6A3D', //     tangerine — CTAs, highlights
        'accent-ink': '#C9441B', // accent text on light bg (AA)
        'accent-soft': '#FFEDE6',
        me: '#E8F0FF', //         "You" transcript bubbles
        them: '#F1EEE7' //        "Them" transcript bubbles
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        xl2: '20px'
      },
      boxShadow: {
        window: '0 1px 2px rgba(21,23,28,.06), 0 24px 60px -20px rgba(21,23,28,.25)'
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.3' } },
        bar: { '0%,100%': { transform: 'scaleY(.35)' }, '50%': { transform: 'scaleY(1)' } }
      },
      animation: {
        rise: 'rise .7s cubic-bezier(.2,.7,.2,1) both',
        blink: 'blink 1.2s ease-in-out infinite',
        bar: 'bar 1s ease-in-out infinite'
      }
    }
  },
  plugins: []
} satisfies Config
