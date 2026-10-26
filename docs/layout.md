# Layout rules

Nootle's window can be anything from 300 × 600 (the minimum in `src-tauri/tauri.conf.json`) to a full external display, so every page has to fit any size. These rules keep it that way, and `pnpm check:layout` enforces them.

## The rules

1. **Respond to the space you have, not the screen.** The main pane (`<main>` in `src/App.tsx`) is a container named `main`, so lay pages out with container queries: `@3xl/main:flex-row`, `@max-2xl/main:hidden`. The sidebar collapsing or the chat panel opening changes the room a page has without the window changing size, and container queries see that.
2. **The sidebar turns into an icon rail below 800 px** (`COMPACT_WIDTH` in `src/lib/layout.ts`). `useCompactMode().isCompact` is true then, or when someone collapses it by hand.
3. **Rows of controls wrap.** Use `Toolbar` (`src/components/Toolbar.tsx`) for a row of filters or actions, and `PageHeader` for a page's title, actions and tabs; both wrap rather than run off the edge. A control that should take the spare room gets `flex-1` plus a `basis-*` or `min-w-*` it can't usefully go below.
4. **Flex children that hold text need `min-w-0`.** A flex item won't shrink below its content without it, which is the usual reason a pane pushes past the window.
5. **Side-by-side panes stack or take turns when narrow.** People stacks its list over the details, the meeting page shows the transcript in place of the tabs, and the meeting's Ask Nootle panel covers the meeting. Don't give a pane a fixed width without saying what happens below it.
6. **Fixed sizes get a cap.** Anything with a fixed `w-[…]`/`h-[…]` (floating panels, popovers) also gets `max-w-[calc(100vw-…)]` / `max-h-[…]`. Popovers and dropdown menus already cap themselves to the room Radix reports.
7. **Tab strips scroll sideways** (built into `TabsList`), so adding a tab never breaks the header.

## Checking it

```bash
pnpm check:layout                       # every page at 300, 480, 720, 900, 1200 and 1920 px wide
pnpm check:layout --only /meeting       # just the pages whose name or route matches
pnpm check:layout --shots /tmp/layout   # also save a screenshot of each page at each size
```

It boots the real frontend against the demo library (see [`scripts/screenshots`](../scripts/screenshots)) and fails when content is cut off by the window or a container that doesn't scroll, when a pane scrolls sideways because something in it is too wide, or when content spills out of a bordered box such as a card or button. Each failure names the element and where it is. CI runs it on every pull request.

When a new page or a new state of a page (a panel open, a tab selected) matters, add it to `PAGES` in `scripts/screenshots/layout-check.mjs`. Mark an element `data-layout-scroll-x` when it scrolls sideways on purpose (a wide table) and `data-layout-ignore` when clipping it is the point.
