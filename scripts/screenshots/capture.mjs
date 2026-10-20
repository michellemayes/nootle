/**
 * Captures the marketing screenshots used by the README and the landing page.
 *
 *   pnpm screenshots
 *
 * It boots the real Vite frontend with a mocked Tauri IPC layer (mock-tauri.js)
 * backed by demo-data.mjs, drives each screen with Playwright, and writes 2x
 * PNGs framed in macOS window chrome to site/public/screenshots/.
 *
 * Fidelity note: the app inherits the OS UI font, so run this on macOS to get
 * SF Pro. On other platforms install Inter and alias it to `system-ui` in
 * fontconfig — that is what the committed screenshots were captured with.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LIVE_TRANSCRIPT } from "./demo-data.mjs";
import {
  TRAFFIC_LIGHTS,
  launchBrowser,
  newDemoContext,
  openPage,
  repoRoot,
  startDevServer,
} from "./app.mjs";

const outDir = path.join(repoRoot, "site/public/screenshots");

const WINDOW = { width: 1440, height: 900 };
const SCALE = 2;
const THEMES = ["light", "dark"];

/** One capture per screen. `prepare` drives the UI into the state we want. */
const SHOTS = [
  {
    name: "library",
    route: "/",
    ready: "text=Design Review — Onboarding Flow",
  },
  {
    name: "meeting",
    route: "/meeting/m1",
    ready: "role=tab[name='Summaries']",
    async prepare(page) {
      await page.getByTitle("Show transcript").click();
      await page.getByRole("tab", { name: "Summaries" }).click();
    },
  },
  {
    name: "insights",
    route: "/insights",
    ready: "text=Draft two copy variants for the permissions explainer",
  },
  {
    name: "chat",
    route: "/chat",
    ready: "text=Onboarding drop-off",
  },
  {
    name: "recording",
    route: "/recording",
    ready: "text=Live transcript",
    async prepare(page) {
      await page.evaluate((segments) => {
        window.__NOOTLE_EMIT__("transcription-status", { meeting_id: "m-live", available: true });
        window.__NOOTLE_EMIT__("transcript-update", segments);
      }, LIVE_TRANSCRIPT);
      // The title comes from start_recording's meeting, as it would from
      // the calendar event underway.
      await page.getByRole("button", { name: "Design Review — Onboarding Flow" }).waitFor();
      await page.getByLabel("Summary template").selectOption({ label: "Standard Summary" });
      await page.getByLabel("Meeting notes").fill(
        "Permissions screen is the big leak — 31% drop\n" +
          "Try inline copy instead of the docs link, one sentence above the button\n" +
          "Two variants if traffic allows, behind the existing flag\n\n" +
          "Calendar permission: move it out of onboarding? Ask again on an empty library",
      );
      await page.getByRole("button", { name: /Live transcript/ }).click();
      // Let the timer run so the recording reads as in-progress.
      await page.waitForTimeout(8000);
    },
  },
  {
    name: "automations",
    route: "/templates",
    ready: "text=Standard Summary",
  },
];

/** Renders a screenshot inside macOS window chrome and returns the framed PNG. */
async function frame(browser, rawPng, theme) {
  const page = await browser.newPage({
    viewport: { width: WINDOW.width + 160, height: WINDOW.height + 160 },
    deviceScaleFactor: SCALE,
  });
  const dark = theme === "dark";
  await page.setContent(`
    <style>
      html, body { margin: 0; background: transparent; }
      .stage { padding: 64px 80px 96px; width: max-content; }
      .window {
        position: relative;
        width: ${WINDOW.width}px;
        border-radius: 12px;
        overflow: hidden;
        box-shadow:
          0 48px 96px -24px rgba(0, 0, 0, ${dark ? 0.75 : 0.4}),
          0 16px 40px -16px rgba(0, 0, 0, ${dark ? 0.6 : 0.28}),
          0 0 0 1px rgba(${dark ? "255, 255, 255, 0.09" : "0, 0, 0, 0.09"});
      }
      .window img { display: block; width: ${WINDOW.width}px; height: ${WINDOW.height}px; }
    </style>
    <div class="stage">
      <div class="window">
        <img src="data:image/png;base64,${rawPng.toString("base64")}" />
        ${TRAFFIC_LIGHTS}
      </div>
    </div>
  `);
  const png = await page.locator(".stage").screenshot({ omitBackground: true });
  await page.close();
  return png;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = await startDevServer();
  const browser = await launchBrowser();

  try {
    for (const theme of THEMES) {
      const context = await newDemoContext(browser, { theme, viewport: WINDOW, scale: SCALE });
      for (const shot of SHOTS) {
        const page = await openPage(context, shot.route, shot.ready);
        if (shot.prepare) {
          await shot.prepare(page);
          // Let what it set off settle before capturing.
          await page.waitForTimeout(1200);
        }

        const raw = await page.screenshot();
        const framed = await frame(browser, raw, theme);
        const file = path.join(outDir, `${shot.name}-${theme}.png`);
        await writeFile(file, framed);
        console.log(`✓ ${path.relative(repoRoot, file)}`);
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server?.kill();
  }
}

await main();
