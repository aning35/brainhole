import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#2563EB', // blue-600
          50: '#EFF6FF',      // blue-50
          500: '#3B82F6',     // blue-500
          600: '#2563EB',     // blue-600
          700: '#1D4ED8',     // blue-700
        },
        secondary: {
          DEFAULT: '#34A853',
          50: '#E8F5E9',
          500: '#34A853',
          600: '#2E7D32',
        },
        status: {
          ready: '#00ACC1',
          processing: '#FFB300',
          completed: '#43A047',
          error: '#E53935',
          warning: '#FB8C00',
        },
      },
      backgroundImage: {
        'primary-gradient': 'linear-gradient(to right, #2563EB, #7C3AED)', // blue-600 to purple-600
        'primary-gradient-hover': 'linear-gradient(to right, #1D4ED8, #6D28D9)', // blue-700 to purple-700
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};

export default config; 