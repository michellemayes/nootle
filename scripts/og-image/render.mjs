/**
 * Renders og-image.html to site/public/og-image.png (1200x630, the Open Graph
 * card shown when nootle.ai is shared).
 *
 *   pnpm og-image
 *
 * Needs network access for the Google Fonts the template loads.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../site/public/og-image.png");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(path.join(here, "og-image.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
