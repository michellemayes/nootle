# Screenshots and demo GIF

Generates the landing page's app screenshots and the root `README.md`'s demo GIF,
and runs the layout check (`pnpm check:layout`, see [docs/layout.md](../../docs/layout.md)).

```bash
pnpm install
pnpm exec playwright install chromium   # once
pnpm screenshots   # site/public/screenshots/*.png
pnpm demo-gif      # docs/demo.gif (needs ffmpeg)
```

Screenshots are 2x PNGs framed in macOS window chrome; the site serves them
from `/screenshots/`. The demo GIF is a short tour (library → live recording
with Live Assist → finished meeting → Ask) recorded from Chromium's screencast
and encoded with ffmpeg.

## How it works

The app is a Tauri frontend, so it runs fine in a plain browser as long as
something answers its IPC calls. `app.mjs` starts the Vite dev server and
injects `mock-tauri.js`, which implements just enough of
`window.__TAURI_INTERNALS__` to serve `demo-data.mjs` and to fire backend events
(the live recording view is driven that way). Playwright then walks each route,
clicks it into the state we want, and screenshots it in both light and dark mode.

Because the components are the real ones, a UI change shows up in the
screenshots the next time this runs — no mockup to keep in sync.

## Editing

- **Demo content** — `demo-data.mjs`. Every value is fictional. Dates are fixed,
  and the browser's `Date` starts at `DEMO_NOW`, so relative dates and the
  streak render the same on every run.
- **Which screens get captured** — the `SHOTS` array in `capture.mjs`.
- **The demo tour** — `tour()` in `demo.mjs`.
- **Window chrome** — `frame()` in `capture.mjs`; the traffic lights, shared
  with the demo GIF, are `TRAFFIC_LIGHTS` in `app.mjs`.

## Fonts

The app inherits the OS UI font, so run this on macOS to get SF Pro. Elsewhere,
install [Inter](https://rsms.me/inter/) and alias it to `system-ui` in
fontconfig — that is what the committed screenshots were captured with.

## Environment overrides

- `CHROMIUM_EXECUTABLE` — path to an existing Chromium build.
- `SCREENSHOT_BASE_URL` — capture against an already-running server instead of
  starting Vite.
- `SCREENSHOT_PORT` — port for the Vite dev server (default `1420`).

## Open Graph image

`site/app/opengraph-image.png` (the card shown when nootle.ai is shared) is
built from `scripts/og-image/og-image.html` and the dark meeting screenshot:

```bash
pnpm og-image
```

Re-run it after regenerating the screenshots. Next serves the image with a
content-hashed URL, so link previews update without any cache-busting.
