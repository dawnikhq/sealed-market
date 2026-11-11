/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces and text. Monochrome: near-black ink on warm white.
        bg: v('bg'),
        card: v('card'),
        fg: v('fg'),
        // Status colours, used only for quality and outcome signals.
        good: v('good'),
        warn: v('warn'),
        bad: v('bad'),
        // Neutral scale: lower numbers are closer to the text colour,
        // higher numbers are closer to the page background.
        ink: {
          DEFAULT: v('fg'),
          50: '#0a0a0a',
          100: '#1f1f1f',
          200: '#3a3a3a',
          300: '#575757',
          400: '#707070',
          500: '#9a9a9a',
          600: '#bdbdbd',
          700: '#dcdcdc',
          800: '#ebebeb',
          850: '#f1f1f0',
          900: '#f5f5f4',
          950: '#ffffff',
        },
      },
      fontFamily: {
        sans: ['Geist', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"Geist Mono"', '"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        '3xl': '1rem',
        '4xl': '1.25rem',
        '5xl': '1.75rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.03)',
        lift: '0 10px 30px -12px rgb(0 0 0 / 0.18), 0 2px 6px rgb(0 0 0 / 0.05)',
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'sheet-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.35', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(1.06)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.3s ease-out both',
        'scale-in': 'scale-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both',
        'sheet-up': 'sheet-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        breathe: 'breathe 3.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
