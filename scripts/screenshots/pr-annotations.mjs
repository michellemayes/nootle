import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { M1_ANNOTATIONS } from "./demo-data.mjs";
import { launchBrowser, newDemoContext, openPage, repoRoot, startDevServer } from "./app.mjs";

const outDir = path.join(repoRoot, ".github/pr-assets/agent-annotations");
await mkdir(outDir, { recursive: true });
const server = await startDevServer();
const browser = await launchBrowser();
try {
  for (const theme of ["light", "dark"]) {
    const context = await newDemoContext(browser, { theme, viewport: { width: 1440, height: 900 }, scale: 2 });
    await context.addInitScript(
      `window.__NOOTLE_FIXTURES__.list_meeting_annotations = { m1: ${JSON.stringify(M1_ANNOTATIONS)} };`,
    );
    const page = await openPage(context, "/meeting/m1", "text=Agent notes");
    await page.getByTitle("Show transcript").click();
    // The demo audio never loads, so announce its (overridden) length.
    await page.evaluate(() => document.querySelector("audio").dispatchEvent(new Event("loadedmetadata")));
    await page.waitForTimeout(1200);
    await writeFile(path.join(outDir, `meeting-${theme}.png`), await page.screenshot());
    // Close-up of the player's seek bar with its markers.
    const bar = page.getByRole("slider", { name: "Seek" });
    await bar.locator("button").first().hover();
    await page.waitForTimeout(400);
    const box = await page.locator("div.shrink-0.border-t").filter({ has: page.getByText("Agent notes") }).boundingBox();
    const player = await bar.boundingBox();
    await writeFile(
      path.join(outDir, `agent-notes-${theme}.png`),
      await page.screenshot({ clip: { x: 0, y: box.y - 8, width: 1440, height: player.y + player.height + 20 - box.y } }),
    );
    console.log(`✓ ${theme}`);
    await context.close();
  }
} finally {
  await browser.close();
  server?.kill();
}
