This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Landing pages

SEO landing pages (`app/granola-alternative`, `app/otter-alternative`, `app/for/*`) each pass a content object to `components/LandingPage.tsx` and build their metadata with `landingMetadata()`. When you add one, also add it to `public/sitemap.xml`, `public/llms.txt` and the links in `components/SiteFooter.tsx`.

Each content object also sets:

- `answer`: the reader's main question, as they'd type it (on comparison pages, "Which is better, Nootle or X?"), and an "it depends" answer of 100 words or less. It renders as the page's first H2, right below the headline.
- `published` and `updated`: ISO dates shown in the byline. Bump `updated`, and the page's `lastmod` in `public/sitemap.xml`, whenever you change the page.

## Writing for AI crawlers and agents

AI assistants read the raw HTML and the accessibility tree, so:

- Keep key facts (pricing, features, platform support) in server-rendered text, not images or text set by client-side scripts. Hidden-until-clicked content, like screenshot tabs, should still render in the HTML.
- Give icon-only buttons an `aria-label`, give images descriptive alt text, and use `<header>`, `<nav>`, `<button>` and `<figure>` rather than generic `<div>`s.
- Date facts that change with "as of" (for example, competitor pricing).
- `public/robots.txt` allows AI crawlers, including Meta's `meta-webindexer`.
