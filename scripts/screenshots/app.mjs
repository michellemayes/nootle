/**
 * Shared setup for capture.mjs and demo.mjs: boots the real Vite frontend and
 * opens browser contexts where a mocked Tauri IPC layer (mock-tauri.js) serves
 * demo-data.mjs.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { AUDIO_DURATION_SECONDS, DEMO_NOW, FIXTURES } from "./demo-data.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../..");

const PORT = Number(process.env.SCREENSHOT_PORT ?? 1420);
export const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? `http://localhost:${PORT}`;

/** macOS window traffic lights, positioned in their parent's top-left corner. */
export const TRAFFIC_LIGHTS = `
  <div style="position: absolute; top: 19px; left: 20px; display: flex; gap: 8px; pointer-events: none;">
    ${["#FF5F57", "#FEBC2E", "#28C840"]
      .map(
        (color) =>
          `<span style="width: 12px; height: 12px; border-radius: 50%; background: ${color}; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);"></span>`,
      )
      .join("")}
  </div>`;

export async function startDevServer() {
  if (process.env.SCREENSHOT_BASE_URL) return null;
  const server = spawn(
    "node",
    [path.join(repoRoot, "node_modules/vite/bin/vite.js"), "--port", String(PORT)],
    { cwd: repoRoot, stdio: "ignore" },
  );
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE_URL);
      if (res.ok) return server;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  server.kill();
  throw new Error(`Vite did not start on ${BASE_URL}`);
}

export function launchBrowser() {
  // Escape hatch for environments with a preinstalled Chromium.
  return chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
}

/** A browser context in which the app renders the demo library. */
export async function newDemoContext(browser, { theme, viewport, scale }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    colorScheme: theme,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });
  await context.addInitScript(
    `window.__NOOTLE_FIXTURES__ = ${JSON.stringify(FIXTURES)};
     localStorage.setItem("onboarding_complete", "true");
     localStorage.setItem("theme", ${JSON.stringify(theme)});
     localStorage.setItem("llm_provider", "anthropic");
     localStorage.setItem("llm_model", "claude-opus-4-6");
     localStorage.setItem("meetingViewMode", "grid");
     localStorage.setItem("nootle-sidebar-collapsed", "false");`,
  );
  // Start "now" just after the demo library's latest meeting so relative
  // dates, the greeting, and the streak render the same on every run.
  // Only Date is shifted: any of Playwright's clock APIs also swap in fake
  // timers and requestAnimationFrame, under which framer-motion entrance
  // animations never finish and pages capture blank.
  await context.addInitScript(
    `(() => {
       const RealDate = Date;
       const offset = ${DEMO_NOW.getTime()} - RealDate.now();
       class DemoDate extends RealDate {
         constructor(...args) {
           super(...(args.length ? args : [DemoDate.now()]));
         }
         static now() {
           return RealDate.now() + offset;
         }
       }
       globalThis.Date = DemoDate;
     })();`,
  );
  await context.addInitScript({ path: path.join(here, "mock-tauri.js") });
  // The demo audio is a one-second placeholder; report the meeting's real
  // length so the player reads like a finished recording.
  await context.addInitScript(
    `Object.defineProperty(HTMLMediaElement.prototype, "duration", {
       get: () => ${AUDIO_DURATION_SECONDS},
     });`,
  );
  return context;
}

/**
 * Opens `route` and waits for `ready` to show and entrance animations to
 * settle, with text carets and spellcheck underlines off.
 */
export async function openPage(context, route, ready) {
  const page = await context.newPage();
  page.on("pageerror", (err) => console.warn(`  ! ${route}: ${err.message}`));
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "*, *::after { caret-color: transparent !important; }" });
  // Fields inherit this, so typed demo notes never get a red underline.
  await page.evaluate(() => (document.documentElement.spellcheck = false));
  await page.waitForSelector(ready, { timeout: 15_000 });
  await page.waitForTimeout(1200);
  return page;
}
