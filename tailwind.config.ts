import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        polaris: {
          primary: '#008060',
          primaryDark: '#004c3f',
          surface: '#f6f6f7',
          border: '#c4cdd5',
          text: '#202223',
          textSubdued: '#6d7175',
          critical: '#d72c0d',
          warning: '#ffc453',
          success: '#008060',
        },
      },
    },
  },
  plugins: [],
}

export default config
