/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ador-black': '#000000',
        'ador-dark': '#0a0a0a',
        'ador-gray': '#171717',
        'ador-neutral': '#262626',
        'ador-border': '#404040',
        // Champagne-gold — identidad premium (AGREGADO, no reemplaza ningún token
        // existente). Es la nueva familia de acento; los componentes la consumen
        // vía `gold-*`. Reemplaza gradualmente los acentos indigo/violeta/blanco.
        gold: {
          50:  '#fff9e6',
          100: '#ffe9a8', // highlight brillante (íconos de acento, textos vivos)
          200: '#f7d878',
          300: '#f2c94c', // oro vivo — texto/ícono principal sobre oscuro
          400: '#e8b923',
          500: '#d4af37', // metálico medio
          600: '#b8860b', // profundo
          700: '#8f6a0d',
          800: '#6b4f0a',
          900: '#443206',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      spacing: {
        'safe-area-top': 'env(safe-area-inset-top)',
        'safe-area-bottom': 'env(safe-area-inset-bottom)',
      },
      padding: {
        'safe-area-top': 'env(safe-area-inset-top)',
        'safe-area-bottom': 'env(safe-area-inset-bottom)',
      },
      minHeight: {
        'screen-nav': 'calc(100vh - 56px - 56px)',
      },
    },
  },
  plugins: [],
}
