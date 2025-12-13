/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        secondary: '#8b5cf6',
        accent: '#f59e0b',
        neutral: '#6b7280',
        base: {
          100: '#ffffff',
          200: '#f3f4f6',
          300: '#e5e7eb',
          content: '#111827',
        },
      },
    },
  },
  plugins: [],
}

