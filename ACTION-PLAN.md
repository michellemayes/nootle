# Nootle.ai — SEO Action Plan

**Date:** 2026-04-14
**Current Score:** 30 / 100
**Target Score:** 70+ / 100

---

## Critical (Fix Immediately)

### 1. Add `robots.txt` (with AI crawler rules)
**Impact:** Crawlability + Sitemap discovery + AI search visibility
**Effort:** 5 minutes
**File:** `site/public/robots.txt`
```
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: anthropic-ai
Allow: /

Sitemap: https://nootle.ai/sitemap.xml
```

### 2. Add `sitemap.xml`
**Impact:** Indexation speed + Search engine discovery
**Effort:** 5 minutes
**File:** `site/public/sitemap.xml`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://nootle.ai/</loc>
    <lastmod>2026-04-14</lastmod>
  </url>
</urlset>
```

### 3. Add JSON-LD Structured Data (`SoftwareApplication`)
**Impact:** Rich search results, knowledge panel eligibility
**Effort:** 15 minutes
**File:** `site/app/layout.tsx` — add `<script type="application/ld+json">` in `<head>`

### 4. Create proper OG/social image (1200×630)
**Impact:** Social sharing appearance on Twitter/LinkedIn/Slack
**Effort:** 30 minutes
**Action:** Design a 1200×630px image showing Nootle brand + tagline. Save as `site/public/og-image.png`. Update `layout.tsx` metadata to reference `/og-image.png`.

### 5. Add canonical URL
**Impact:** Prevents duplicate content indexing
**Effort:** 2 minutes
**File:** `site/app/layout.tsx` — add to metadata:
```typescript
metadataBase: new URL("https://nootle.ai"),
alternates: { canonical: "/" },
```

---

### 6. Fix LCP — remove `opacity: 0` from hero logo animation
**Impact:** Core Web Vitals LCP improvement (~500ms reduction)
**Effort:** 5 minutes
**File:** `site/components/Hero.tsx`
**Action:** Change the hero logo `motion.div` from `initial={{ opacity: 0, scale: 0.8 }}` to `initial={{ opacity: 1, scale: 0.8 }}` (or remove the motion wrapper entirely and use CSS animation). The LCP element must be visible immediately — hiding it behind a Framer Motion fade-in adds 500ms+ to LCP.

---

## High (Fix Within 1 Week)

### 7. Expand page content to 800+ words
**Impact:** Content depth signals, keyword coverage, AI citability
**Effort:** 2-3 hours
**Actions:**
- Add a paragraph under the hero expanding on what Nootle is and who it's for
- Add longer feature descriptions (50-80 words each, self-contained for AI citation)
- Add a FAQ section with question-format headings (5-8 common questions)
- Add a "Why Nootle?" or comparison section
- Target 134-167 words per prose passage (optimal AI citation window)

### 8. Optimize H1 for primary keyword
**Impact:** Primary ranking signal
**Effort:** 5 minutes
**Current:** "Meetings on autopilot"
**Suggested:** "AI Meeting Recorder for Mac" or "Record, Transcribe & Chat with Your Meetings"

### 9. Add `llms.txt` for AI search engines
**Impact:** AI search citability (ChatGPT, Perplexity, Google AI Overviews)
**Effort:** 15 minutes
**File:** `site/public/llms.txt`
```
# Nootle

AI-powered meeting recorder for Mac. Captures meetings, transcribes in real-time with speaker identification, and provides AI chat for meeting follow-up. All processing happens locally on your Mac for privacy.

## Key Features
- Real-time transcription with speaker diarization
- AI summaries and follow-up chat
- Auto-detection of Zoom, Teams, Google Meet
- Integrations with Slack, Linear, Notion, and more
- CLI and MCP server for developer workflows
- Local processing — no cloud recording

## Links
- Website: https://nootle.ai
- Download: https://github.com/michellemayes/nootle/releases
- Source: https://github.com/michellemayes/nootle
- Author: Michelle Mayes (https://michellemayes.me)
```

### 10. Add Privacy Policy page
**Impact:** E-E-A-T trust signal, required for "local & private" claim credibility
**Effort:** 1-2 hours
**Action:** Create `/privacy` page explaining data handling, local processing, no cloud storage

### 11. Fix `og:url` and `og:site_name`
**Impact:** Social sharing accuracy
**Effort:** 5 minutes
**File:** `site/app/layout.tsx` — add to `openGraph` config:
```typescript
url: "https://nootle.ai",
siteName: "Nootle",
```

---

## Medium (Fix Within 1 Month)

### 12. Refactor client components — reduce JS hydration surface
**Impact:** LCP improvement (200-400ms less JS to parse), smaller bundle
**Effort:** 2-3 hours
**Action:** Extract Framer Motion wrappers into isolated `"use client"` wrapper components. Keep data/markup in Features, Integrations, HowItWorks, and SponsorCTA as server components. Only AppMockup genuinely needs client-side state.

### 13. Use Framer Motion `LazyMotion` + `domAnimation` subset
**Impact:** Bundle size reduction from ~100-140KB to ~18KB gzipped
**Effort:** 1 hour
**Action:** Import from `framer-motion/lazy` and use `domAnimation` feature subset

### 14. Compress or delete large unused PNGs
**Impact:** Prevents accidental LCP disaster
**Effort:** 15 minutes
**Action:** `nootle-logo.png` (1.8MB) and `nootle-logo-dark.png` (2.1MB) in `/public` appear unused. Delete or compress to <100KB WebP.

### 15. Create YouTube demo video
**Impact:** Strongest AI citation correlation signal (~0.737)
**Effort:** 4-8 hours
**Action:** Record 2-3 minute screen recording of Nootle in action. Upload to YouTube with "Nootle AI meeting recorder Mac" in title/description. Embed on site.

### 16. Add security headers via Vercel config
**Effort:** 15 minutes
**File:** Create `site/vercel.json` or add headers to `next.config.ts`:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy` (basic policy)

### 12. Add Organization JSON-LD
**Effort:** 10 minutes
**Action:** Add alongside SoftwareApplication schema

### 13. Create a blog or changelog section
**Impact:** Content freshness signals, long-tail keyword targeting, internal links
**Effort:** 4-8 hours initial setup
**Action:** Add `/blog` or `/changelog` with regular updates about features, use cases, tips

### 14. Add descriptive alt text to images
**Effort:** 10 minutes
**Current:** `alt="Nootle"` (generic)
**Suggested:** `alt="Nootle AI meeting recorder app icon"` (descriptive)

### 15. Add apple-touch-icon and complete favicon set
**Effort:** 15 minutes
**Action:** Generate favicon set (16×16, 32×32, 180×180 apple-touch-icon, site.webmanifest)

### 16. Consider adding more pages
**Impact:** SEO content depth, internal linking, long-tail keywords
**Potential pages:**
- `/features` — detailed feature breakdowns
- `/integrations` — dedicated integration pages (Zoom, Slack, etc.)
- `/about` — team/creator story
- `/faq` — commonly asked questions
- `/changelog` — release notes

---

## Low (Backlog)

### 17. Add twitter:site and twitter:creator
**Effort:** 2 minutes

### 18. Add X-Frame-Options and Referrer-Policy headers
**Effort:** 5 minutes

### 19. Consider switching from static export to SSR
**Impact:** Enables dynamic sitemap, server-side rendering, and API routes
**Trade-off:** Increased hosting complexity vs. SEO capabilities

### 20. Submit to Google Search Console
**Action:** Verify ownership, submit sitemap, monitor indexation

### 21. Set up Google Analytics 4
**Action:** Track organic traffic, user behavior, conversion to downloads

---

## Implementation Priority Matrix

```
                    HIGH IMPACT
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    │  #1 robots.txt    │  #6 Expand content│
    │  #2 sitemap.xml   │  #9 Privacy page  │
    │  #3 JSON-LD       │  #13 Blog/CL      │
    │  #4 OG image      │                   │
    │  #5 Canonical     │                   │
    │  #7 H1 keyword    │                   │
    │  #8 llms.txt      │                   │
    │                   │                   │
LOW ├───────────────────┼───────────────────┤ HIGH
EFFORT                  │                   EFFORT
    │  #10 og:url fix   │  #16 More pages   │
    │  #14 Alt text     │  #19 SSR switch   │
    │  #17 Twitter tags │                   │
    │  #15 Favicon set  │                   │
    │                   │                   │
    └───────────────────┼───────────────────┘
                        │
                    LOW IMPACT
```

---

## Estimated Score After Critical + High Fixes

| Category | Current | Projected |
|----------|---------|-----------|
| Technical SEO | 25 | 70 |
| Content Quality | 30 | 60 |
| On-Page SEO | 45 | 80 |
| Schema | 0 | 70 |
| Performance | 60 | 65 |
| AI Readiness | 15 | 55 |
| Images | 30 | 70 |
| **Weighted Total** | **30** | **67** |

Completing all Critical and High items would approximately double the SEO score to ~67/100. Adding Medium items (blog, more pages, security headers) would push it to 80+.
