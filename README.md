# VITAL — Health & Fitness Intelligence Dashboard

A personal health and fitness PWA built with Next.js 15, Tailwind CSS v4, and shadcn/ui.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4 with VITAL design tokens
- **Components**: shadcn/ui v4 with Base UI primitives
- **Fonts**: Outfit (headings) + Inter (body) + JetBrains Mono (numbers)
- **Database**: Supabase
- **Testing**: Vitest + Testing Library
- **Deployment**: Netlify

## Design System

### Colors
- `primary`: `#00E5A0` (electric mint)
- `energy`: `#7C5CFF` (vivid purple)
- `bg`: `#0B0E13` (deep navy-black)
- `surface`: `#141A22`
- `border`: `#243040`

### Component Classes
- `.vital-card` — bento-style card with shadow and hover effects
- `.vital-number` — monospace tabular number display
- `.btn-primary` — primary action button
- `.btn-ghost` — secondary ghost button
- `.bento-grid` — responsive auto-fit grid layout

## Development

```bash
npm install
npm run dev       # development server
npm run build     # production build
npm run test      # vitest unit tests
npm run typecheck # TypeScript check
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values.
