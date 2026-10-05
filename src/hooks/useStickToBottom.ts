import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";

/**
 * Keeps a growing log (chat, live transcript) pinned to its newest line while
 * the reader is at the bottom, and leaves them be once they scroll up to
 * re-read. Render `<div ref={sentinelRef} />` as the log's last child;
 * `following` turns false while it's out of view, so a "Jump to latest"
 * button can call `jumpToBottom`.
 */
export function useStickToBottom(
  viewportRef: RefObject<HTMLElement | null>,
  content: unknown,
) {
  const [sentinel, sentinelRef] = useState<HTMLElement | null>(null);
  const [following, setFollowing] = useState(true);

  // Watching a marker avoids reading scroll geometry on every scroll event.
  useEffect(() => {
    const root = viewportRef.current;
    if (!root || !sentinel) return;
    setFollowing(true);
    const observer = new IntersectionObserver(
      ([entry]) => setFollowing(entry.isIntersecting),
      { root, rootMargin: "0px 0px 40px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [viewportRef, sentinel]);

  // Layout effect: scroll before paint, so the observer never sees the
  // new line push the marker out of view.
  useLayoutEffect(() => {
    const root = viewportRef.current;
    if (following && root) root.scrollTop = root.scrollHeight;
  }, [viewportRef, content, following, sentinel]);

  const jumpToBottom = useCallback(() => {
    const root = viewportRef.current;
    root?.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
  }, [viewportRef]);

  return { following, sentinelRef, jumpToBottom };
}
