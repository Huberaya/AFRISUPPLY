/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Terre cuite / safran : chaleur, marché, Afrique de l'Ouest
        brand: { 50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12', 950: '#431407' },
        accent: { 400: '#facc15', 500: '#eab308' },
      },
      fontFamily: { sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'] },
      boxShadow: { card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)', 'card-hover': '0 10px 30px -5px rgb(0 0 0 / 0.12)' },
      animation: { 'fade-up': 'fadeUp 0.4s ease forwards' },
      keyframes: { fadeUp: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } } },
    },
  },
  plugins: [],
};
