import type { Config } from 'tailwindcss'

// Minimal config kept for shadcn/ui CLI compatibility.
// All MERIDIAN design tokens are defined via @theme in globals.css (Tailwind v4).
const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
}

export default config
