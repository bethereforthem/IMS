import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e6f0ff',
          100: '#cce0ff',
          500: '#00438B',
          600: '#003a7a',
          700: '#002f66',
          900: '#001a3d',
        },
        niss:   { DEFAULT: '#7C3AED', light: '#EDE9FE' },
        rnp:    { DEFAULT: '#1D4ED8', light: '#DBEAFE' },
        rib:    { DEFAULT: '#0F766E', light: '#CCFBF1' },
        rdf:    { DEFAULT: '#15803D', light: '#DCFCE7' },
        rcs:    { DEFAULT: '#B45309', light: '#FEF3C7' },
        patrol: { DEFAULT: '#6B7280', light: '#F3F4F6' },
        danger: { DEFAULT: '#DC2626', light: '#FEE2E2' },
        warn:   { DEFAULT: '#D97706', light: '#FEF3C7' },
        ok:     { DEFAULT: '#16A34A', light: '#DCFCE7' },
      },
    },
  },
  plugins: [],
}
export default config
