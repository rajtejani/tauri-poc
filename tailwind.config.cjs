/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
      colors: {
        slate: {
          50: '#F5F2EB',
          100: '#EBE7DE',
          200: '#DDD8CC',
          300: '#C8C1B3',
          400: '#8A968F',
          500: '#5D6F66',
          600: '#4A5C53',
          700: '#334840',
          800: '#24362E',
          900: '#15231C',
          925: '#101A15',
          950: '#0A120E',
        },
        primary: {
          DEFAULT: '#0F4D38',
          hover: '#0B3D2C',
          light: '#E7EFE9',
        },
        surface: {
          DEFAULT: '#F5F2EB',
          card: '#FFFEFA',
          muted: '#EBE7DE',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
