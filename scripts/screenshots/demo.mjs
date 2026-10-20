/**
 * Records the README's demo GIF: a short tour from the library through a live
 * recording to the finished meeting and Ask.
 *
 *   pnpm demo-gif
 *
 * It drives the same demo app as capture.mjs, records Chromium's screencast,
 * and encodes docs/demo.gif with ffmpeg (which must be on PATH).
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
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

const out = path.join(repoRoot, "docs/demo.gif");
const VIEWPORT = { width: 1280, height: 800 };
const SCALE = 2;
// Wider than the README shows it, so it stays sharp on Retina screens.
const GIF_WIDTH = 1600;
const FPS = 12;

/** Asked mid-meeting so Live Assist answers it from the knowledge base. */
const QUESTION = {
  ...LIVE_TRANSCRIPT[0],
  id: "t-ask",
  speaker_label: "Speaker 2",
  text: "Remind me, what did the usability study find about the permissions screen?",
};

/**
 * Headless Chromium draws no pointer, so the page gets a stand-in that follows
 * the mouse, plus the window's traffic lights.
 */
const CHROME = `
  const style = document.createElement("style");
  style.textContent = \`
    #demo-cursor {
      position: fixed; z-index: 2147483647; pointer-events: none;
      width: 22px; height: 22px; margin: -3px 0 0 -4px;
      transition: transform 120ms ease-out;
    }
    #demo-cursor.down { transform: scale(0.85); }
    #demo-lights { position: fixed; z-index: 2147483646; inset: 0 auto auto 0; pointer-events: none; }
  \`;
  document.head.append(style);
  const lights = document.createElement("div");
  lights.id = "demo-lights";
  lights.innerHTML = ${JSON.stringify(TRAFFIC_LIGHTS)};
  const cursor = document.createElement("div");
  cursor.id = "demo-cursor";
  cursor.style.left = "-40px";
  cursor.innerHTML = '<svg viewBox="0 0 22 22" width="22" height="22"><path d="M4 2l14 9.5-6.2 1.1 3.6 6.9-2.6 1.3-3.6-6.9L4 18z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  document.body.append(lights, cursor);
  addEventListener("mousemove", (e) => {
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";
  }, true);
  addEventListener("mousedown", () => cursor.classList.add("down"), true);
  addEventListener("mouseup", () => cursor.classList.remove("down"), true);
`;

/** Glides the pointer to `locator` and clicks it. */
async function click(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}

const emit = (page, event, payload) =>
  page.evaluate(([e, p]) => window.__NOOTLE_EMIT__(e, p), [event, payload]);
const say = (page, segment) => emit(page, "transcript-update", [segment]);

async function tour(page) {
  const pause = (ms) => page.waitForTimeout(ms);
  await page.evaluate(CHROME);
  await page.mouse.move(700, 450);
  await pause(1800);

  // Start a recording; the live transcript builds while notes are typed.
  await click(page, page.getByRole("button", { name: "New recording" }).first());
  await page.getByRole("button", { name: "Design Review — Onboarding Flow" }).waitFor();
  await emit(page, "transcription-status", { meeting_id: "m-live", available: true });
  await pause(500);
  await click(page, page.getByRole("button", { name: /Live transcript/ }));
  for (const segment of LIVE_TRANSCRIPT.slice(0, 3)) {
    await say(page, segment);
    await pause(900);
  }
  await click(page, page.getByLabel("Meeting notes"));
  await page.keyboard.type("Permissions screen: 31% drop", { delay: 35 });
  await say(page, LIVE_TRANSCRIPT[3]);
  await page.keyboard.type("\nInline copy, not the docs link", { delay: 35 });
  // Live Assist answers a question it hears from the knowledge base. The
  // mock answers any question, so Auto goes on just before this one.
  await click(page, page.getByLabel("Answer questions automatically"));
  await say(page, QUESTION);
  await pause(2800);
  for (const segment of LIVE_TRANSCRIPT.slice(4, 6)) {
    await say(page, segment);
    await pause(800);
  }

  // Stopping summarizes the meeting.
  await click(page, page.getByRole("button", { name: /^Stop/ }));
  await page.getByRole("tab", { name: "Summaries" }).waitFor();
  await pause(2600);
  await click(page, page.getByTitle("Show transcript"));
  await pause(2400);

  // Ask across every meeting, with sources.
  await click(page, page.getByRole("link", { name: "Chat" }));
  await page.getByText("Onboarding drop-off").first().waitFor();
  await pause(3200);
}

/**
 * Records the page's screencast into `dir` while `run` drives it, and returns
 * an ffmpeg concat list that holds each frame for as long as it was on screen.
 */
async function record(page, dir, run) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = path.join(dir, `${String(frames.length).padStart(5, "0")}.png`);
    frames.push({ file, time: metadata.timestamp });
    writes.push(writeFile(file, data, "base64"));
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "png" });
  await run();
  await cdp.send("Page.stopScreencast");
  await Promise.all(writes);
  // The concat demuxer ignores the last entry's duration, so repeat it.
  frames.push({ ...frames.at(-1), time: frames.at(-1).time + 1 });
  const list = [];
  for (const [i, frame] of frames.entries()) {
    list.push(`file '${frame.file}'`);
    const next = frames[i + 1];
    if (next) list.push(`duration ${(next.time - frame.time).toFixed(3)}`);
  }
  return list.join("\n");
}

/** Encodes a concat list of frames as a palette-optimised GIF. */
function encode(listFile) {
  const filters =
    `fps=${FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];` +
    `[a]palettegen=max_colors=256:stats_mode=diff[p];` +
    `[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`;
  const ffmpeg = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-filter_complex", filters, out],
    { stdio: "inherit" },
  );
  if (ffmpeg.status !== 0) throw new Error("ffmpeg failed");
}

async function main() {
  const server = await startDevServer();
  const browser = await launchBrowser();
  const dir = await mkdtemp(path.join(os.tmpdir(), "nootle-demo-"));
  try {
    const context = await newDemoContext(browser, { theme: "light", viewport: VIEWPORT, scale: SCALE });
    const page = await openPage(context, "/", "text=Design Review — Onboarding Flow");
    const listFile = path.join(dir, "frames.txt");
    await writeFile(listFile, await record(page, dir, () => tour(page)));
    encode(listFile);
    console.log(`✓ ${path.relative(repoRoot, out)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await browser.close();
    server?.kill();
  }
}

await main();
