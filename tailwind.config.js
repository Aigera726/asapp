/** @type {import('tailwindcss').Config} */

// Корпоративная палитра AS Group. Держится в синхроне с src/theme/index.ts —
// при правке цвета менять оба файла.
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Фирменный синий AS Group (#00387E — 500)
        brand: {
          50: '#EAF2FB',
          100: '#D0E1F5',
          200: '#9CC2EA',
          300: '#5A93D6',
          400: '#2E6BB8',
          500: '#00387E',
          600: '#00306C',
          700: '#002859',
          800: '#001F45',
          900: '#001631',
        },
        // Фирменный янтарный AS Group (#FFA100 — 500)
        accent: {
          50: '#FFF6E5',
          100: '#FFE7BF',
          200: '#FFD08A',
          300: '#FFB94D',
          400: '#FFAD26',
          500: '#FFA100',
          600: '#D98A00',
          700: '#B37200',
          800: '#8C5A00',
          900: '#664200',
        },
        // Поверхности тёмной темы (навигационно-синие)
        surface: {
          canvas: '#071A30',
          deep: '#03101F',
          DEFAULT: '#0E2645',
          raised: '#143255',
          sunken: '#08203B',
          border: '#1C3E63',
        },
      },
    },
  },
  plugins: [],
}
