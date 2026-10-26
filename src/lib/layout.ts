/**
 * The app shell's layout breakpoint. The layout check
 * (scripts/screenshots/layout-check.mjs) tests either side of it, so update
 * its sizes if this moves. See docs/layout.md for the rules every page
 * follows so it fits any window size.
 */

/** Below this window width the sidebar collapses to an icon rail. */
export const COMPACT_WIDTH = 800;
export const COMPACT_QUERY = `(max-width: ${COMPACT_WIDTH - 1}px)`;
