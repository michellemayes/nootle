# Nootle Landing Page & Donation Page Design

## Goal

A playful, colorful marketing landing page for Nootle that explains the product, showcases features, and funnels visitors to GitHub Sponsors.

## Architecture

- **Approach:** New Next.js project in a `site/` subdirectory of the existing repo
- **Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS 4, Framer Motion
- **Output:** Static export (`output: 'export'`) — no server required
- **Deployment:** Vercel, root directory set to `site/`
- **Donations:** Link to existing GitHub Sponsors page at https://github.com/sponsors/michellemayes

## Project Structure

```
site/
├── app/
│   ├── layout.tsx        # Root layout, fonts, metadata
│   ├── page.tsx          # Single landing page
│   └── globals.css       # Tailwind + custom styles
├── components/
│   ├── Hero.tsx
│   ├── Features.tsx
│   ├── HowItWorks.tsx
│   └── SponsorCTA.tsx
├── public/
│   └── (logo assets copied from repo)
├── next.config.ts
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```

## Visual Style

Playful and colorful, matching the Nootle logo gradient.

**Color palette:**
- Mint/Teal: `#4EEABB` to `#5BC4A8`
- Lavender/Purple: `#C084FC` to `#A855F7`
- Soft Pink: `#E879A8`
- Background: White / light gray (`#FAFAFA`)
- Text: Dark charcoal (`#1A1A2E`)

**Typography:** Inter or similar clean sans-serif. Bold headings, friendly tone.

## Page Sections

### 1. Hero

- Large Nootle logo
- Headline: "Your meetings, captured and understood"
- Subheadline about local AI transcription and summaries
- Two CTAs: "Download for Mac" (primary), "Support on GitHub" (secondary)
- Background: animated or mesh gradient using the brand palette

### 2. Features

3-4 cards in a grid:
- **Local & Private** — No cloud recording, everything on your Mac
- **Real-time Transcription** — Live speech-to-text with speaker identification
- **AI Summaries & Chat** — Ask questions about meetings after they end
- **Works with Any Meeting App** — Zoom, Teams, Google Meet, and more

Rounded cards, soft shadows, subtle hover animations.

### 3. How It Works

3 steps in a horizontal flow:
1. **Join your meeting** — Nootle detects it automatically
2. **Record & transcribe** — Real-time transcription with speaker labels
3. **Review & chat** — Browse transcripts, get AI summaries, ask follow-ups

Each step uses a mock UI snippet or illustration from brand assets.

### 4. Sponsor CTA

- Personal tone: "Nootle is free and open source. If it saves you time, consider supporting development."
- Prominent "Sponsor on GitHub" button linking to https://github.com/sponsors/michellemayes
- Soft gradient background

### 5. Footer

Minimal: "Made by Michelle Mayes" + GitHub repo link.
