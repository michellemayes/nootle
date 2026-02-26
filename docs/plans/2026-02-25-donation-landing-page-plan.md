# Nootle Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a playful, colorful marketing landing page with a GitHub Sponsors donation CTA, deployed as a static Next.js site on Vercel.

**Architecture:** A `site/` subdirectory with Next.js 15 (App Router), statically exported. The page has four sections: Hero, Features, How It Works, and Sponsor CTA. Framer Motion handles scroll animations. Logo assets are copied from the main repo. Vercel deploys from `site/` as root directory.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS 4, Framer Motion, Inter font (next/font)

**Design doc:** `docs/plans/2026-02-25-donation-landing-page-design.md`

---

### Task 1: Scaffold Next.js project

**Files:**
- Create: `site/package.json`
- Create: `site/next.config.ts`
- Create: `site/tsconfig.json`
- Create: `site/app/layout.tsx`
- Create: `site/app/page.tsx`
- Create: `site/app/globals.css`

**Step 1: Initialize Next.js in site/ directory**

Run:
```bash
cd /Users/michelle/conductor/workspaces/nootle/istanbul
npx create-next-app@latest site --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm
```

Accept defaults. This creates the full scaffolding.

**Step 2: Configure static export**

In `site/next.config.ts`, set:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
```

**Step 3: Install Framer Motion**

Run:
```bash
cd /Users/michelle/conductor/workspaces/nootle/istanbul/site && npm install framer-motion
```

**Step 4: Verify it builds**

Run:
```bash
cd /Users/michelle/conductor/workspaces/nootle/istanbul/site && npm run build
```

Expected: Successful static export to `site/out/`.

**Step 5: Add site/out/ to .gitignore**

Append to `site/.gitignore`:
```
out/
```

**Step 6: Commit**

```bash
git add site/
git commit -m "feat: scaffold Next.js landing page project in site/"
```

---

### Task 2: Copy logo assets and set up brand tokens

**Files:**
- Create: `site/public/nootle-logo.png` (copy from `Nootle Exports/Nootle-iOS-Default-1024x1024@1x.png`)
- Create: `site/public/nootle-logo-dark.png` (copy from `Nootle Exports/Nootle-iOS-Dark-1024x1024@1x.png`)
- Create: `site/public/nootle-icon.svg` (copy from `src-tauri/icons/icon.svg`)
- Modify: `site/app/globals.css`

**Step 1: Copy assets**

Run:
```bash
cp "Nootle Exports/Nootle-iOS-Default-1024x1024@1x.png" site/public/nootle-logo.png
cp "Nootle Exports/Nootle-iOS-Dark-1024x1024@1x.png" site/public/nootle-logo-dark.png
cp src-tauri/icons/icon.svg site/public/nootle-icon.svg
```

**Step 2: Set up brand CSS custom properties**

In `site/app/globals.css`, add brand tokens after the Tailwind imports:

```css
:root {
  --color-mint: #4EEABB;
  --color-teal: #5BC4A8;
  --color-lavender: #C084FC;
  --color-purple: #A855F7;
  --color-pink: #E879A8;
  --color-bg: #FAFAFA;
  --color-text: #1A1A2E;
}
```

**Step 3: Configure Inter font in layout.tsx**

In `site/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nootle - AI Meeting Recorder for Mac",
  description:
    "Capture meetings, transcribe in real-time, and chat with AI about what was discussed. Local and private.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

**Step 4: Verify build still works**

Run:
```bash
cd /Users/michelle/conductor/workspaces/nootle/istanbul/site && npm run build
```

Expected: PASS

**Step 5: Commit**

```bash
git add site/public/ site/app/globals.css site/app/layout.tsx
git commit -m "feat: add logo assets and brand tokens"
```

---

### Task 3: Build Hero component

**Files:**
- Create: `site/components/Hero.tsx`
- Modify: `site/app/page.tsx`

**Step 1: Create Hero component**

Create `site/components/Hero.tsx`:

```tsx
"use client";

import { motion } from "framer-motion";
import Image from "next/image";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-6">
      {/* Animated mesh gradient background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, rgba(78, 234, 187, 0.3), transparent 50%), " +
            "radial-gradient(ellipse at 80% 20%, rgba(192, 132, 252, 0.3), transparent 50%), " +
            "radial-gradient(ellipse at 60% 80%, rgba(232, 121, 168, 0.2), transparent 50%), " +
            "#FAFAFA",
        }}
      />

      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Image
            src="/nootle-logo.png"
            alt="Nootle"
            width={180}
            height={180}
            className="mx-auto mb-8 rounded-[2.5rem] shadow-2xl"
            priority
          />
        </motion.div>

        <motion.h1
          className="text-5xl md:text-7xl font-bold tracking-tight mb-6"
          style={{ color: "var(--color-text)" }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          Your meetings,{" "}
          <span className="bg-gradient-to-r from-[#4EEABB] via-[#C084FC] to-[#E879A8] bg-clip-text text-transparent">
            captured and understood
          </span>
        </motion.h1>

        <motion.p
          className="text-xl md:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          AI-powered meeting recorder for Mac. Transcribe in real-time, identify
          speakers, and chat with AI about what was discussed. All local, all
          private.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
        >
          <a
            href="https://github.com/michellemayes/nootle/releases"
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #4EEABB, #5BC4A8)",
            }}
          >
            Download for Mac
          </a>
          <a
            href="https://github.com/sponsors/michellemayes"
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold rounded-full border-2 border-purple-300 text-purple-600 hover:bg-purple-50 transition-all hover:scale-105"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="currentColor"
              viewBox="0 0 16 16"
            >
              <path
                fillRule="evenodd"
                d="M4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.565 20.565 0 008 13.393a20.561 20.561 0 003.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.75.75 0 01-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5z"
              />
            </svg>
            Support on GitHub
          </a>
        </motion.div>
      </div>
    </section>
  );
}
```

**Step 2: Wire into page.tsx**

Replace `site/app/page.tsx` contents with:

```tsx
import { Hero } from "@/components/Hero";

export default function Home() {
  return (
    <main>
      <Hero />
    </main>
  );
}
```

**Step 3: Verify dev server renders**

Run:
```bash
cd /Users/michelle/conductor/workspaces/nootle/istanbul/site && npm run dev
```

Open browser, confirm Hero renders with logo, headline, gradient background, and both CTA buttons.

**Step 4: Verify build**

Run:
```bash
cd /Users/michelle/conductor/workspaces/nootle/istanbul/site && npm run build
```

Expected: PASS

**Step 5: Commit**

```bash
git add site/components/Hero.tsx site/app/page.tsx
git commit -m "feat: add Hero section with gradient background and CTAs"
```

---

### Task 4: Build Features component

**Files:**
- Create: `site/components/Features.tsx`
- Modify: `site/app/page.tsx`

**Step 1: Create Features component**

Create `site/components/Features.tsx`:

```tsx
"use client";

import { motion } from "framer-motion";

const features = [
  {
    icon: "🔒",
    title: "Local & Private",
    description:
      "No cloud recording. Everything stays on your Mac — your meetings, your data.",
    gradient: "from-[#4EEABB] to-[#5BC4A8]",
  },
  {
    icon: "🎙️",
    title: "Real-time Transcription",
    description:
      "Live speech-to-text with automatic speaker identification. Know who said what.",
    gradient: "from-[#C084FC] to-[#A855F7]",
  },
  {
    icon: "💬",
    title: "AI Summaries & Chat",
    description:
      "Get instant summaries and ask follow-up questions about your meetings.",
    gradient: "from-[#E879A8] to-[#C084FC]",
  },
  {
    icon: "🖥️",
    title: "Works with Any Meeting App",
    description:
      "Zoom, Teams, Google Meet, and more. Nootle captures audio from any app.",
    gradient: "from-[#5BC4A8] to-[#4EEABB]",
  },
];

export function Features() {
  return (
    <section className="py-24 px-6" style={{ backgroundColor: "var(--color-bg)" }}>
      <div className="max-w-6xl mx-auto">
        <motion.h2
          className="text-4xl md:text-5xl font-bold text-center mb-16"
          style={{ color: "var(--color-text)" }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          Everything you need from a meeting recorder
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="relative p-8 rounded-3xl bg-white shadow-sm hover:shadow-lg transition-shadow border border-gray-100"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <div
                className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} text-2xl mb-4`}
              >
                {feature.icon}
              </div>
              <h3
                className="text-2xl font-bold mb-2"
                style={{ color: "var(--color-text)" }}
              >
                {feature.title}
              </h3>
              <p className="text-gray-600 text-lg">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Add to page.tsx**

```tsx
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";

export default function Home() {
  return (
    <main>
      <Hero />
      <Features />
    </main>
  );
}
```

**Step 3: Verify dev server renders**

Run:
```bash
cd /Users/michelle/conductor/workspaces/nootle/istanbul/site && npm run dev
```

Confirm 4 feature cards render in a 2x2 grid, with gradient icon backgrounds and hover shadow.

**Step 4: Commit**

```bash
git add site/components/Features.tsx site/app/page.tsx
git commit -m "feat: add Features section with animated cards"
```

---

### Task 5: Build HowItWorks component

**Files:**
- Create: `site/components/HowItWorks.tsx`
- Modify: `site/app/page.tsx`

**Step 1: Create HowItWorks component**

Create `site/components/HowItWorks.tsx`:

```tsx
"use client";

import { motion } from "framer-motion";

const steps = [
  {
    number: "1",
    title: "Join your meeting",
    description: "Nootle detects active meetings automatically — Zoom, Teams, Google Meet, and more.",
    color: "#4EEABB",
  },
  {
    number: "2",
    title: "Record & transcribe",
    description: "Real-time transcription with speaker labels. Captures both your mic and system audio.",
    color: "#C084FC",
  },
  {
    number: "3",
    title: "Review & chat",
    description: "Browse transcripts, get AI summaries, and ask follow-up questions about anything discussed.",
    color: "#E879A8",
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          className="text-4xl md:text-5xl font-bold text-center mb-16"
          style={{ color: "var(--color-text)" }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          How it works
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-[#4EEABB] via-[#C084FC] to-[#E879A8]" />

          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              className="text-center relative"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.15 }}
            >
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full text-2xl font-bold text-white mb-6 relative z-10"
                style={{ backgroundColor: step.color }}
              >
                {step.number}
              </div>
              <h3
                className="text-2xl font-bold mb-3"
                style={{ color: "var(--color-text)" }}
              >
                {step.title}
              </h3>
              <p className="text-gray-600 text-lg max-w-xs mx-auto">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Add to page.tsx**

```tsx
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { HowItWorks } from "@/components/HowItWorks";

export default function Home() {
  return (
    <main>
      <Hero />
      <Features />
      <HowItWorks />
    </main>
  );
}
```

**Step 3: Verify dev server renders**

Confirm 3 steps in a horizontal row with numbered circles, connecting gradient line on desktop, and stacked vertically on mobile.

**Step 4: Commit**

```bash
git add site/components/HowItWorks.tsx site/app/page.tsx
git commit -m "feat: add How It Works section with step flow"
```

---

### Task 6: Build SponsorCTA component

**Files:**
- Create: `site/components/SponsorCTA.tsx`
- Modify: `site/app/page.tsx`

**Step 1: Create SponsorCTA component**

Create `site/components/SponsorCTA.tsx`:

```tsx
"use client";

import { motion } from "framer-motion";

export function SponsorCTA() {
  return (
    <section
      className="py-24 px-6 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(78, 234, 187, 0.15), rgba(192, 132, 252, 0.15), rgba(232, 121, 168, 0.15))",
      }}
    >
      <div className="max-w-3xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-6xl mb-6">💜</div>
          <h2
            className="text-4xl md:text-5xl font-bold mb-6"
            style={{ color: "var(--color-text)" }}
          >
            Support Nootle
          </h2>
          <p className="text-xl text-gray-600 mb-10 max-w-xl mx-auto">
            Nootle is free and open source. If it saves you time, consider
            supporting development so I can keep making it better.
          </p>
          <a
            href="https://github.com/sponsors/michellemayes"
            className="inline-flex items-center justify-center px-10 py-4 text-lg font-semibold text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #C084FC, #A855F7)",
            }}
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="currentColor"
              viewBox="0 0 16 16"
            >
              <path
                fillRule="evenodd"
                d="M4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.565 20.565 0 008 13.393a20.561 20.561 0 003.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.75.75 0 01-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5z"
              />
            </svg>
            Sponsor on GitHub
          </a>
        </motion.div>
      </div>
    </section>
  );
}
```

**Step 2: Add to page.tsx, including Footer**

```tsx
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { HowItWorks } from "@/components/HowItWorks";
import { SponsorCTA } from "@/components/SponsorCTA";

export default function Home() {
  return (
    <main>
      <Hero />
      <Features />
      <HowItWorks />
      <SponsorCTA />
      <footer className="py-8 text-center text-gray-500 text-sm">
        <p>
          Made by{" "}
          <a
            href="https://github.com/michellemayes"
            className="underline hover:text-gray-700"
          >
            Michelle Mayes
          </a>
        </p>
      </footer>
    </main>
  );
}
```

**Step 3: Verify dev server renders**

Confirm sponsor section with gradient background, heart icon, and prominent purple CTA button. Footer renders below.

**Step 4: Commit**

```bash
git add site/components/SponsorCTA.tsx site/app/page.tsx
git commit -m "feat: add Sponsor CTA and footer"
```

---

### Task 7: Polish and final build verification

**Files:**
- Modify: `site/app/globals.css` (smooth scrolling, any final tweaks)
- Modify: `site/app/layout.tsx` (Open Graph metadata, favicon)

**Step 1: Add smooth scroll and base body styles**

In `site/app/globals.css`, add:
```css
html {
  scroll-behavior: smooth;
}
```

**Step 2: Add favicon and OG metadata**

Copy favicon:
```bash
cp src-tauri/icons/32x32.png site/public/favicon.png
```

Update metadata in `site/app/layout.tsx`:
```tsx
export const metadata: Metadata = {
  title: "Nootle - AI Meeting Recorder for Mac",
  description:
    "Capture meetings, transcribe in real-time, and chat with AI about what was discussed. Local and private.",
  openGraph: {
    title: "Nootle - AI Meeting Recorder for Mac",
    description:
      "Capture meetings, transcribe in real-time, and chat with AI about what was discussed. Local and private.",
    type: "website",
  },
  icons: {
    icon: "/favicon.png",
  },
};
```

**Step 3: Full build and verify**

Run:
```bash
cd /Users/michelle/conductor/workspaces/nootle/istanbul/site && npm run build
```

Expected: PASS, static output in `site/out/`.

**Step 4: Test static export locally**

Run:
```bash
cd /Users/michelle/conductor/workspaces/nootle/istanbul/site && npx serve out
```

Open in browser, scroll through all sections, test both CTA links, verify responsive layout on narrow viewport.

**Step 5: Commit**

```bash
git add site/
git commit -m "feat: polish styles, add metadata and favicon"
```

---

### Task 8: Vercel deployment setup

**Step 1: Use the vercel:setup skill to configure**

Invoke `vercel:setup` skill. Configure:
- Root directory: `site`
- Framework: Next.js
- Build command: `npm run build`
- Output directory: `out`

**Step 2: Deploy**

Invoke `vercel:deploy` skill to deploy the site.

**Step 3: Verify live URL**

Open the Vercel URL in browser, confirm all sections render correctly.

**Step 4: Commit any Vercel config changes**

```bash
git add site/ .vercel/
git commit -m "chore: add Vercel deployment config"
```
