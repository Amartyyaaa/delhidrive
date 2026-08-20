/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070a14',
          900: '#0d1120',
          850: '#12172a',
          800: '#181e35',
          700: '#232a45',
          600: '#333c5e',
        },
        brand: {
          50: '#eef1ff',
          100: '#e0e5ff',
          200: '#c7cfff',
          300: '#a5aeff',
          400: '#8484fb',
          500: '#4f46e5',
          600: '#4338ca',
          700: '#3730a3',
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
        glow: '0 0 0 1px rgba(129,140,248,0.25), 0 18px 50px -20px rgba(79,70,229,0.55)',
        card: '0 10px 40px -24px rgba(2,6,23,0.9)',
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
