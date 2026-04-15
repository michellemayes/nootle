# Nootle.ai — Full SEO Audit Report

**URL:** https://nootle.ai
**Date:** 2026-04-14
**Business Type:** SaaS / Desktop Software (AI Meeting Recorder for Mac)
**Framework:** Next.js (static export on Vercel)
**Pages Crawled:** 1 (single-page application)

---

## Executive Summary

### Overall SEO Health Score: 28 / 100

Nootle.ai is a beautifully designed single-page marketing site for an AI meeting recorder Mac app. However, it has **almost no SEO infrastructure in place**. The site is missing fundamental elements that search engines need to discover, crawl, understand, and rank the content.

### Top 5 Critical Issues

1. **No `robots.txt`** — search engines have no crawl directives (404)
2. **No `sitemap.xml`** — search engines cannot discover pages (404)
3. **No structured data (JSON-LD)** — zero schema markup for SoftwareApplication or Organization
4. **No canonical URL tag** — risk of duplicate content issues
5. **OG image is a 64×64 favicon** — social shares look broken/unprofessional

### Top 5 Quick Wins

1. Add `robots.txt` with sitemap reference (~5 min)
2. Add `sitemap.xml` with the homepage URL (~5 min)
3. Add canonical `<link>` tag to layout (~2 min)
4. Create a proper 1200×630 OG image for social sharing (~30 min)
5. Add SoftwareApplication JSON-LD structured data (~15 min)

---

## Technical SEO

### Crawlability

| Check | Status | Severity |
|-------|--------|----------|
| `robots.txt` exists | **NO** (404) | **Critical** |
| `sitemap.xml` exists | **NO** (404) | **Critical** |
| `sitemap-index.xml` exists | **NO** (404) | Critical |
| `sitemap-0.xml` exists | **NO** (404) | Critical |
| HTML `lang` attribute | ✅ `lang="en"` | Pass |
| Viewport meta tag | ✅ Present | Pass |
| Charset declaration | ✅ `utf-8` | Pass |

### Indexability

| Check | Status | Severity |
|-------|--------|----------|
| Canonical URL tag | **MISSING** | **High** |
| Meta robots / X-Robots-Tag | Not set (defaults to index,follow) | Info |
| HTTP status | ✅ 200 | Pass |
| Content rendered without JS? | ❌ Relies on client-side React/framer-motion | **High** |

**Note:** The site uses `"use client"` on all components with `framer-motion` animations. While Next.js static export pre-renders HTML, the heavy reliance on client-side JavaScript for content display may affect how search engine crawlers perceive the content.

### Security Headers

| Header | Status | Severity |
|--------|--------|----------|
| `strict-transport-security` | ✅ `max-age=63072000` | Pass |
| `content-security-policy` | **MISSING** | Medium |
| `x-content-type-options` | **MISSING** | Medium |
| `x-frame-options` | **MISSING** | Low |
| `referrer-policy` | **MISSING** | Low |
| `permissions-policy` | **MISSING** | Low |

### URL Structure

| Check | Status | Severity |
|-------|--------|----------|
| HTTPS enforced | ✅ Yes (HSTS) | Pass |
| Clean URLs | ✅ Single page at `/` | Pass |
| No trailing slash issues | ✅ | Pass |
| Multiple pages | ❌ Only 1 page exists | **Medium** |

### Server & Hosting

- **Server:** Vercel
- **Caching:** `public, max-age=0, must-revalidate` — OK for static site
- **CDN:** Vercel Edge Network (x-vercel-cache: HIT)
- **Build:** Next.js static export (`output: "export"`)

---

## Content Quality

### E-E-A-T Assessment

| Signal | Status | Severity |
|--------|--------|----------|
| Author/creator identified | ✅ "Michelle Mayes" in footer | Pass |
| Author link to external profile | ✅ Links to michellemayes.me | Pass |
| About page | **MISSING** | Medium |
| Privacy policy | **MISSING** | **High** |
| Terms of service | **MISSING** | Medium |
| Contact information | **MISSING** | Medium |
| Trust signals (testimonials, reviews) | **MISSING** | Medium |
| Social proof | Partial — GitHub sponsorship link | Low |

### Content Depth

| Section | Word Count (approx) | Assessment |
|---------|---------------------|------------|
| Hero | ~25 words | Thin — keyword-light |
| Features (9 items) | ~120 words | Moderate — good keywords |
| Integrations | ~20 words | Very thin |
| How It Works (4 steps) | ~80 words | Thin |
| Sponsor CTA | ~25 words | Thin |
| **Total page content** | **~270 words** | **Very thin** |

**Verdict:** At ~270 words, this page is considered **thin content** by search engine standards. Google typically expects 500-1500+ words for a competitive product landing page. Key product terms like "AI meeting recorder", "meeting transcription", "Mac meeting notes" appear only once or not at all.

### Readability

- Writing is clear and concise
- Good use of headings (H1 → H2 → H3 hierarchy is correct)
- Short, scannable descriptions
- **Issue:** Too concise — lacks the depth needed for SEO ranking

### Heading Structure

```
H1: "Meetings on autopilot" ← Not keyword-optimized
  H2: "See it in action"
  H2: "Built for focus"
  H2: "Works with your stack"
  H2: "How it works"
  H2: "Support Nootle"
    H3: Local & Private
    H3: Real-time Transcription
    H3: AI Summaries & Chat
    H3: Smart Insights
    H3: Search Across Meetings
    H3: Noise Cancellation
    H3: Auto-Detection
    H3: Linear Integration
    H3: CLI & Developer Tools
```

**Issue:** The H1 "Meetings on autopilot" is catchy but not SEO-friendly. It doesn't contain the primary keyword "AI meeting recorder" or "meeting transcription for Mac". Search engines rely heavily on H1 for topic signals.

---

## On-Page SEO

### Title Tag

**Current:** `Nootle - AI Meeting Recorder for Mac`
**Assessment:** ✅ Good — 40 characters, contains primary keyword, brand name first
**Suggestion:** Consider leading with keyword: `AI Meeting Recorder for Mac | Nootle` (more SEO-friendly)

### Meta Description

**Current:** `Capture meetings, transcribe in real-time, and chat with AI about what was discussed. Local and private.`
**Assessment:** ✅ Good — 101 characters, descriptive, includes action verbs
**Suggestion:** Add a call-to-action: `...Local and private. Download free for Mac.`

### Open Graph Tags

| Tag | Status | Issue |
|-----|--------|-------|
| `og:title` | ✅ Present | — |
| `og:description` | ✅ Present | — |
| `og:type` | ✅ `website` | — |
| `og:image` | ⚠️ `/favicon.png` (64×64) | **High** — Should be 1200×630 |
| `og:url` | **MISSING** | **Medium** |
| `og:site_name` | **MISSING** | Low |

### Twitter Card Tags

| Tag | Status | Issue |
|-----|--------|-------|
| `twitter:card` | ✅ `summary_large_image` | — |
| `twitter:title` | ✅ Present | — |
| `twitter:description` | ✅ Present | — |
| `twitter:image` | ⚠️ `/favicon.png` (64×64) | **High** — Card will look broken |
| `twitter:site` | **MISSING** | Low |
| `twitter:creator` | **MISSING** | Low |

### Internal Linking

| Check | Status | Severity |
|-------|--------|----------|
| Internal links to other pages | **NONE** | **High** |
| Anchor text variety | N/A — single page | — |
| Navigation links | Only "Download" (external) | **Medium** |

**Note:** All links on the page are external (GitHub releases, GitHub sponsors, michellemayes.me). There are zero internal links because it's a single-page site with no other pages.

### Image SEO

| Image | Alt Text | Format | Severity |
|-------|----------|--------|----------|
| Nootle icon (navbar) | `alt="Nootle"` | SVG | Low — could be more descriptive |
| Nootle icon (hero) | `alt="Nootle"` | SVG | Low — could be "Nootle AI meeting recorder logo" |
| App mockup | Not checked | — | — |
| Integration icons | No alt text (decorative icons) | SVG | Pass (decorative) |

---

## Schema & Structured Data

### Current Implementation

**None.** Zero JSON-LD or microdata markup detected on the entire site.

### Missing Schema (Priority Order)

| Schema Type | Priority | Impact |
|-------------|----------|--------|
| `SoftwareApplication` | **Critical** | Enables rich results for software in search |
| `Organization` | **High** | Establishes entity identity |
| `WebSite` | **High** | Enables sitelinks search box |
| `WebPage` | Medium | Clarifies page purpose |
| `FAQPage` | Medium | Could be added if FAQ section is created |
| `HowTo` | Low | Could apply to "How it works" section |

### Recommended JSON-LD

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Nootle",
  "description": "AI-powered meeting recorder for Mac with real-time transcription, speaker identification, and AI chat. Local and private.",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "macOS",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "author": {
    "@type": "Person",
    "name": "Michelle Mayes",
    "url": "https://michellemayes.me"
  },
  "url": "https://nootle.ai",
  "downloadUrl": "https://github.com/michellemayes/nootle/releases",
  "featureList": [
    "Real-time transcription",
    "Speaker identification",
    "AI summaries and chat",
    "Local and private processing",
    "Noise cancellation",
    "Auto-detection of Zoom, Teams, Google Meet",
    "Linear integration",
    "CLI and developer tools"
  ]
}
```

---

## Performance

### Build Configuration

- **Output:** Static export (`output: "export"`)
- **Image optimization:** Disabled (`images: { unoptimized: true }`)
- **Font loading:** ✅ `display: "swap"` on both fonts (Outfit, DM Sans)
- **Font preloading:** ✅ WOFF2 preloaded in `<head>`

### Core Web Vitals (Predicted — no CrUX field data available)

| Metric | Predicted Status | Severity |
|--------|-----------------|----------|
| **LCP** | Needs Improvement / Poor risk | **High** |
| **INP** | Good (low risk) | Low |
| **CLS** | Likely Good | Low |

**LCP Issue:** The hero logo (`nootle-icon.svg`) is the LCP candidate. It has `priority` set (good), but it's wrapped in a Framer Motion `<motion.div>` with `initial={{ opacity: 0, scale: 0.8 }}`. The browser's LCP algorithm doesn't count invisible elements — LCP clock stops only after the 500ms animation completes post-hydration, adding **500ms+ to LCP** on top of normal load time.

### Observations

| Metric | Assessment | Severity |
|--------|-----------|----------|
| Font loading strategy | ✅ `display: swap` + preload | Pass |
| Image optimization | ❌ Disabled in Next.js config | **Medium** |
| LCP element hidden by animation | ❌ `opacity: 0` initial state | **High** |
| Excessive client components | ❌ All 6 sections are `"use client"` | **High** |
| Framer Motion bundle | ~100-140KB gzipped for animations only | **Medium** |
| Large unused PNGs in /public | `nootle-logo.png` (1.8MB), `nootle-logo-dark.png` (2.1MB) | **Medium** |
| JS bundle | Multiple async chunks loaded | Medium |
| CSS | Single chunk, inlined precedence | Pass |
| Third-party scripts | Vercel Analytics only | Pass |
| CLS from font swap | Low risk — `next/font` applies size adjustments | Low |

**Note:** `images: { unoptimized: true }` is required for static export but means no automatic WebP/AVIF conversion, no responsive srcsets, and no lazy loading optimization from Next.js Image component.

**Note:** Only `AppMockup.tsx` genuinely requires client-side state. `Features`, `Integrations`, `HowItWorks`, and `SponsorCTA` use Framer Motion only for scroll-triggered `whileInView` animations — these could be refactored to server components with CSS animations, reducing JS hydration surface area significantly.

---

## AI Search Readiness

### AI Crawler Accessibility

| Check | Status | Severity |
|-------|--------|----------|
| `llms.txt` | **MISSING** (404) | **Critical** |
| `robots.txt` AI bot rules | **MISSING** (no robots.txt) | **Critical** |
| GPTBot explicitly allowed | **NO** | **High** |
| OAI-SearchBot explicitly allowed | **NO** | **High** |
| ClaudeBot explicitly allowed | **NO** | **High** |
| PerplexityBot explicitly allowed | **NO** | **High** |
| Content accessible without JS | Partial — static export pre-renders | Medium |

### AI Platform Visibility Scores

| Platform | Score | Primary Gaps |
|----------|-------|-------------|
| Google AI Overviews | 15/100 | No Schema.org, no long-form content, no FAQ |
| ChatGPT (web search) | 22/100 | No robots.txt, no llms.txt, no citable passages |
| Perplexity | 30/100 | Accessible HTML but no structured content |
| Bing Copilot | 25/100 | No schema, no sitemap, no robots.txt |

### Citability Assessment

| Signal | Status | Severity |
|--------|--------|----------|
| Clear, factual claims | ✅ Feature descriptions are specific | Pass |
| Unique value proposition stated | ✅ "Local and private" differentiator | Pass |
| Structured content sections | ✅ Clear H2/H3 hierarchy | Pass |
| Sufficient content depth | ❌ ~270 words is too thin | **High** |
| Entity clarity (what is Nootle?) | Partial — no explicit definition | Medium |
| Comparison/context vs competitors | **MISSING** | Medium |

### Brand Mention Optimization

| Signal | Status | Severity |
|--------|--------|----------|
| Brand + category in title | ✅ "Nootle - AI Meeting Recorder for Mac" | Pass |
| Brand consistently used | ✅ | Pass |
| Unique brand name | ✅ "Nootle" is distinctive | Pass |
| External authority signals | ⚠️ Only GitHub links | Medium |

### Citability Assessment Detail

| Signal | Status | Severity |
|--------|--------|----------|
| Passage length (target: 134-167 words) | ❌ All passages are 12-20 words | **Critical** |
| Direct answers in first 40-60 words | ❌ Hero opens with tagline, not answer | **High** |
| Question-based headings | ❌ All H2s are declarative statements | **High** |
| Statistics/benchmarks | ❌ Zero numbers or verifiable claims | **Medium** |
| Self-contained answer blocks | ❌ All content requires surrounding context | **High** |
| YouTube presence (~0.737 citation correlation) | ❌ No video content anywhere | **High** |

### Recommendations for AI Search

1. **Create `llms.txt`** — Provide a concise summary of Nootle for AI systems
2. **Add more prose content** — AI citation engines need paragraphs, not just bullet features (target 134-167 words per passage)
3. **Add a FAQ section with question-format headings** — AI assistants frequently cite FAQ answers
4. **Create a YouTube demo video** — YouTube has the strongest measured correlation (~0.737) with AI citation frequency
5. **Include comparison content** — "How Nootle compares to Otter.ai/Fireflies" helps AI contextualize
6. **Add pricing/availability section** — AI assistants frequently answer "is X free?" queries
7. **Explicitly allow AI crawlers in robots.txt** — GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot

---

## Images

| Check | Status | Severity |
|-------|--------|----------|
| All images have alt text | ⚠️ Generic alt text ("Nootle") | Low |
| OG image dimensions | ❌ 64×64 (should be 1200×630) | **High** |
| Favicon present | ✅ `/favicon.png` | Pass |
| Image format optimization | SVG for icons (good), PNG for favicon | Pass |
| Apple touch icon | **MISSING** | Low |
| Dedicated OG social image | **MISSING** | **High** |

---

## Sitemap Analysis

### Status: No Sitemap Found

All checked paths returned 404:
- `/sitemap.xml` — 404
- `/sitemap-index.xml` — 404
- `/sitemap-0.xml` — 404

### Impact

Without a sitemap, search engines rely entirely on crawl discovery. For a single-page site this is less critical, but a sitemap is still a best practice and enables:
- Faster initial indexing
- Communication of page priority and update frequency
- Foundation for future multi-page expansion

### Recommended Sitemap

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://nootle.ai/</loc>
    <lastmod>2026-04-14</lastmod>
  </url>
</urlset>
```

---

## Scoring Breakdown

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Technical SEO | 22% | 25/100 | 5.5 |
| Content Quality | 23% | 30/100 | 6.9 |
| On-Page SEO | 20% | 45/100 | 9.0 |
| Schema / Structured Data | 10% | 0/100 | 0.0 |
| Performance (CWV) | 10% | 60/100 | 6.0 |
| AI Search Readiness | 10% | 15/100 | 1.5 |
| Images | 5% | 30/100 | 1.5 |
| **TOTAL** | **100%** | — | **30.4** |

### Score Justification

- **Technical (25):** HTTPS/HSTS good, but no robots.txt, sitemap, canonical, or security headers
- **Content (30):** Well-written but extremely thin (~270 words). No E-E-A-T pages (privacy, about, terms)
- **On-Page (45):** Good title/meta description, proper heading hierarchy, but OG image broken, no canonical, no internal links
- **Schema (0):** Zero structured data implementation
- **Performance (60):** Good font loading, static export is fast, but unoptimized images and large JS bundles
- **AI Readiness (15):** No llms.txt, thin content, no FAQ — but clear brand and good heading structure
- **Images (30):** SVG icons are good, but OG image is broken (64×64 favicon) and alt text is generic

---

## Notes

- **No Google API credentials configured** — Could not pull CrUX field data, GSC indexation, or GA4 traffic
- **No backlink API credentials** — Could not pull DA/PA or backlink profile data
- **Single-page site** — Many SEO optimizations (internal linking, content silos, blog) are structurally impossible without adding pages
- **Static export** — Limits dynamic features like server-side sitemap generation or API routes for robots.txt
