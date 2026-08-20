/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral blacks — the logo sits on pure black, so the greys stay
        // untinted rather than the old navy cast.
        ink: {
          950: '#050505',
          900: '#0d0f0e',
          850: '#141817',
          800: '#1b201e',
          700: '#28302c',
          600: '#3a453f',
        },
        // Sampled from the DELHI wordmark in the logo.
        brand: {
          50: '#e9f7ef',
          100: '#cdedda',
          200: '#9bdcb7',
          300: '#5cc78d',
          400: '#2fae6a',
          500: '#128A4B',
          600: '#0d6f3c',
          700: '#0a562f',
        },
        saffron: {
          400: '#ffb545',
          500: '#f59e0b',
          600: '#d97706',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(47,174,106,0.28), 0 18px 50px -20px rgba(18,138,75,0.55)',
        card: '0 10px 40px -24px rgba(0,0,0,0.95)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: 0, transform: 'scale(0.96)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'ping-slow': {
          '0%': { transform: 'scale(1)', opacity: 0.7 },
          '100%': { transform: 'scale(2.4)', opacity: 0 },
        },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.16,1,.3,1) both',
        'pop-in': 'pop-in .22s cubic-bezier(.16,1,.3,1) both',
        shimmer: 'shimmer 2.2s linear infinite',
        'ping-slow': 'ping-slow 2s cubic-bezier(0,0,.2,1) infinite',
      },
    },
  },
  plugins: [],
};
