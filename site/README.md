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

## Accounts and billing

Accounts (email magic links), Nootle Pro billing with [Polar](https://polar.sh) and referrals live in `lib/account/`, `lib/billing/` and the routes under `app/api/{auth,account,checkout,billing,polar}`. The plan is in `docs/plans/2026-11-24-paid-plans.md`.

| Variable | What it's for |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, where accounts are stored. Unset, accounts live in memory until the dev server restarts. |
| `AUTH_SECRET` | Seals sign-in links, sessions and the app's device tokens. Defaults to one derived from the Blob token; unset in dev, a random one per server run. Changing it signs everyone out. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sends the sign-in email. Without a key, `next dev` returns the link as `{ devLink }` instead. |
| `POLAR_ACCESS_TOKEN` | Polar organization access token. Unset, checkout sends people to `/pricing?unavailable=1`. |
| `POLAR_SERVER` | `sandbox` (default) or `production`. |
| `POLAR_PRODUCT_MONTHLY`, `POLAR_PRODUCT_YEARLY`, `POLAR_PRODUCT_LIFETIME` | Polar product ids for the three prices. |
| `POLAR_REFERRAL_DISCOUNT_ID` | The 30% once-off discount a referred friend gets. |
| `POLAR_WEBHOOK_SECRET` | The `whsec_…` secret of the webhook endpoint pointed at `/api/polar/webhook`. |

To try billing locally against Polar's sandbox:

1. In [sandbox.polar.sh](https://sandbox.polar.sh), create the three products and the discount, and an organization access token.
2. Put the variables above in `.env.local`, leaving `POLAR_SERVER` unset (or `sandbox`).
3. Forward webhooks to the dev server with the [Polar CLI](https://polar.sh/docs/integrate/cli/webhooks) (`polar webhook listen http://localhost:3000/api/polar/webhook`), or a tunnel, and set `POLAR_WEBHOOK_SECRET` to its secret.
4. `pnpm dev`, sign in from `/signin` (the link comes back as `devLink` without Resend), and pay with Stripe's test card `4242 4242 4242 4242`.

`pnpm test` runs the unit tests in `tests/` (webhook handling, signatures, referral rewards) with Node's test runner against the in-memory store.

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
