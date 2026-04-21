import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@tremor/**/*.{js,ts,jsx,tsx}', // Tremor components
  ],
  theme: {
    extend: {
      colors: {
        // Tremor color palette
        tremor: {
          brand: {
            faint: '#eff6ff',
            muted: '#bfdbfe',
            subtle: '#60a5fa',
            DEFAULT: '#3b82f6',
            emphasis: '#1d4ed8',
            inverted: '#ffffff',
          },
          background: {
            muted: '#f9fafb',
            subtle: '#f3f4f6',
            DEFAULT: '#ffffff',
            emphasis: '#374151',
          },
          border: {
            DEFAULT: '#e5e7eb',
          },
          ring: {
            DEFAULT: '#e5e7eb',
          },
          content: {
            subtle: '#9ca3af',
            DEFAULT: '#6b7280',
            emphasis: '#374151',
            strong: '#111827',
            inverted: '#ffffff',
          },
        },
        // Keep Polaris colors for compatibility
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
