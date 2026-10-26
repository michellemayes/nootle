/**
 * Checks that every page fits the window at the sizes people actually use,
 * from the narrowest window Nootle allows up to a large display.
 *
 *   pnpm check:layout                 # every page at every size
 *   pnpm check:layout --shots out/    # also save a screenshot of each
 *   pnpm check:layout --only /chat    # just the pages whose name or route contains "/chat"
 *
 * It boots the real frontend against the demo library (see app.mjs) and, for
 * each page and window size, fails on content you can't fully see or reach:
 * cut off by the window or by a container that doesn't scroll, pushing a pane
 * into scrolling sideways, or spilling out of a bordered box such as a card.
 * Truncation with an ellipsis is fine. CI runs it, so a new feature that only
 * fits at the size it was built at fails the PR. The rules it backs up are in
 * docs/layout.md.
 *
 * Mark an element `data-layout-ignore` when clipping it is the point (an
 * off-screen panel, a decorative bleed), and `data-layout-scroll-x` when it
 * scrolls sideways on purpose (a wide table).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  emitLiveTranscript,
  launchBrowser,
  newDemoContext,
  openPage,
  repoRoot,
  startDevServer,
} from "./app.mjs";

const tauriWindow = JSON.parse(
  await readFile(path.join(repoRoot, "src-tauri/tauri.conf.json"), "utf8"),
).app.windows[0];

/**
 * Window sizes: the smallest window Nootle allows, either side of the
 * sidebar's compact width (COMPACT_WIDTH in src/lib/layout.ts, 800 px), a
 * short laptop window, the default window, and a large display.
 */
const VIEWPORTS = [
  { name: "min", width: tauriWindow.minWidth, height: tauriWindow.minHeight },
  { name: "narrow", width: 480, height: 700 },
  { name: "compact", width: 720, height: 640 },
  { name: "short", width: 900, height: 600 },
  { name: "default", width: 1200, height: 800 },
  { name: "wide", width: 1920, height: 1080 },
];

/** Every top-level page, driven into its busiest state. */
const PAGES = [
  { route: "/", ready: "text=Design Review — Onboarding Flow" },
  {
    route: "/meeting/m1",
    ready: "role=tab[name='Summaries']",
    async prepare(page) {
      const show = page.getByTitle("Show transcript");
      if (await show.isVisible()) await show.click();
    },
  },
  {
    name: "meeting-summary-tabs",
    route: "/meeting/m1",
    ready: "role=tab[name='Summaries']",
    async prepare(page) {
      await page.getByRole("button", { name: "A follow-up email" }).click();
      await page.getByRole("tab", { name: /Follow-up/ }).first().waitFor();
    },
  },
  {
    name: "meeting-ask",
    route: "/meeting/m1",
    ready: "role=tab[name='Summaries']",
    async prepare(page) {
      await page.getByRole("button", { name: "Ask Nootle" }).click();
    },
  },
  {
    name: "library-chat",
    route: "/",
    ready: "text=Design Review — Onboarding Flow",
    async prepare(page) {
      const open = page.getByRole("button", { name: "Ask across meetings" });
      if (await open.isVisible()) await open.click();
    },
  },
  { route: "/insights", ready: "text=Draft two copy variants for the permissions explainer" },
  { route: "/people", ready: "h1" },
  { route: "/chat", ready: "text=Onboarding drop-off" },
  { route: "/knowledge", ready: "h1" },
  {
    route: "/recording",
    ready: "text=Live transcript",
    prepare: emitLiveTranscript,
  },
  { route: "/templates", ready: "text=Standard Summary" },
  { route: "/settings", ready: "h1" },
  { route: "/help", ready: "h1" },
];

/**
 * Runs in the page. Returns the outermost elements that are cut off: they
 * reach past an ancestor that clips without scrolling (or past the window),
 * so part of them can't be seen or scrolled to.
 */
function findClipped() {
  const TOLERANCE = 1;
  const IGNORED = "[data-layout-ignore], [aria-hidden='true']";
  const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const describe = (el) => {
    const label =
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 4).join(".") : "";
    return `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}>${label ? ` "${label}"` : ""}`;
  };
  const isRendered = (el, rect) => {
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "contents";
  };

  // For one axis, the box this element has to fit in: its nearest ancestor that
  // clips or scrolls on that axis, or the window. A scroller lets you reach
  // anything inside it, so only clipping ancestors (and the window) count.
  const clipBox = (el, axis) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const style = getComputedStyle(a);
      const overflow = axis === "x" ? style.overflowX : style.overflowY;
      if (overflow === "auto" || overflow === "scroll") return null;
      if (overflow === "hidden" || overflow === "clip") {
        if (a === document.body || a === document.documentElement || a.id === "root") return viewport;
        return a.getBoundingClientRect();
      }
      // Fixed elements are positioned against the window, not their parents.
      if (style.position === "fixed") return viewport;
    }
    return viewport;
  };

  const offenders = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest(`${IGNORED}, .sr-only, svg *, [data-radix-popper-content-wrapper]`)) continue;
    const rect = el.getBoundingClientRect();
    if (!isRendered(el, rect)) continue;
    // Inside text the component truncates with an ellipsis, clipping is the point.
    if (el.parentElement && getComputedStyle(el.parentElement).textOverflow === "ellipsis") continue;

    const x = clipBox(el, "x");
    const y = clipBox(el, "y");
    const overX = x && (rect.right > x.right + TOLERANCE || rect.left < x.left - TOLERANCE);
    const overY = y && (rect.bottom > y.bottom + TOLERANCE || rect.top < y.top - TOLERANCE);
    // Entirely outside its box means it's parked off-screen (a closed drawer),
    // not cut off.
    const outsideX = x && (rect.left >= x.right || rect.right <= x.left);
    const outsideY = y && (rect.top >= y.bottom || rect.bottom <= y.top);
    if (outsideX || outsideY) continue;
    if (overX || overY) offenders.add(el);
  }
  // A pane that scrolls sideways only because something in it is too wide
  // counts too: nobody expects to scroll a page of text sideways. Tab strips,
  // code blocks and anything marked data-layout-scroll-x scroll sideways on
  // purpose.
  for (const el of document.body.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    if (style.overflowX !== "auto" && style.overflowX !== "scroll") continue;
    if (el.closest(`${IGNORED}, [data-layout-scroll-x], [role='tablist'], pre`)) continue;
    if (el.scrollWidth <= el.clientWidth + TOLERANCE) continue;
    // Blame the elements that stick out of the pane while their parent doesn't.
    const box = el.getBoundingClientRect();
    const sticksOut = (n) => {
      const r = n.getBoundingClientRect();
      return r.width >= 1 && (r.right > box.right + TOLERANCE || r.left < box.left - TOLERANCE);
    };
    for (const child of el.querySelectorAll("*")) {
      if (sticksOut(child) && (child.parentElement === el || !sticksOut(child.parentElement))) offenders.add(child);
    }
  }

  // Content spilling out of a bordered box (a card, a button, a field) reads
  // as broken even where nothing clips it.
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest(IGNORED)) continue;
    const style = getComputedStyle(el);
    if (style.overflowX !== "visible" || parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth) === 0) continue;
    const box = el.getBoundingClientRect();
    if (!isRendered(el, box)) continue;
    for (const child of el.children) {
      const r = child.getBoundingClientRect();
      if (!isRendered(child, r) || getComputedStyle(child).position === "absolute") continue;
      if (r.right > box.right + TOLERANCE || r.left < box.left - TOLERANCE) offenders.add(child);
    }
  }

  // Report only the outermost offender of each subtree.
  return [...offenders]
    .filter((el) => {
      for (let a = el.parentElement; a; a = a.parentElement) if (offenders.has(a)) return false;
      return true;
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      return `${describe(el)} at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`;
    });
}

function shotPath(dir, pageSpec, viewport) {
  const slug = pageSpec.name ?? (pageSpec.route === "/" ? "library" : pageSpec.route.split("/").filter(Boolean).join("-"));
  return path.join(dir, `${slug}-${viewport.name}.png`);
}

/** Opens every page at one window size and returns what it found, in page order. */
async function checkViewport(browser, viewport, pages, shotsDir) {
  const context = await newDemoContext(browser, { theme: "light", viewport, scale: 1 });
  const results = [];
  for (const pageSpec of pages) {
    let problems;
    try {
      const page = await openPage(context, pageSpec.route, pageSpec.ready);
      if (pageSpec.prepare) {
        await pageSpec.prepare(page);
        await page.waitForTimeout(800);
      }
      problems = await page.evaluate(findClipped);
    } catch {
      // Its content never became visible: squeezed to nothing, or hidden.
      problems = [`page content never became visible (${pageSpec.ready})`];
    }
    const page = context.pages().at(-1);
    if (shotsDir) await writeFile(shotPath(shotsDir, pageSpec, viewport), await page.screenshot());
    await page.close();
    results.push({ label: `${pageSpec.name ?? pageSpec.route} @ ${viewport.width}×${viewport.height}`, problems });
  }
  await context.close();
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const shotsDir = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  if (shotsDir) await mkdir(shotsDir, { recursive: true });
  const pages = PAGES.filter((p) => !only || (p.name ?? p.route).includes(only));

  const [server, browser] = await Promise.all([startDevServer(), launchBrowser()]);
  let results;
  try {
    // Each size gets its own browser context, so they run side by side.
    results = (await Promise.all(VIEWPORTS.map((v) => checkViewport(browser, v, pages, shotsDir)))).flat();
  } finally {
    await browser.close();
    server?.kill();
  }

  for (const { label, problems } of results) {
    console.log(`${problems.length ? "✗" : "✓"} ${label}`);
    for (const line of problems) console.log(`    ${line}`);
  }
  const failures = results.filter((r) => r.problems.length).length;
  if (failures) {
    console.log(`\n${failures} page/size combination(s) cut content off.`);
    process.exit(1);
  }
  console.log("\nEvery page fits at every size.");
}

await main();
