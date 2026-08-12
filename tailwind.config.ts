import type { Config } from 'tailwindcss'

// Minimal config kept for shadcn/ui CLI compatibility.
// All design tokens are defined via @theme in globals.css (Tailwind v4); the
// palette itself lives in src/lib/theme/palette.ts. ("MERIDIAN" was the
// pre-rename brand — this comment was the last mention of it in the repo.)
const config: Config = {
  darkMode: 'class',
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
}

export default config
