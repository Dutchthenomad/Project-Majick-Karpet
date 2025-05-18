/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './Modular-Dashboard/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#181c24',
        card: '#23272f',
        primary: '#a259ff',
        accent: '#a259ff',
        success: '#31e981',
        destructive: '#ff4e4e',
        'muted-foreground': '#b0b4c1',
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,0.15)',
      },
      borderRadius: {
        xl: '1rem',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { backgroundColor: '#23272f' },
          '50%': { backgroundColor: '#2e3140' },
        },
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 0.8s',
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
