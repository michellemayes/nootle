# Compact Note Mode Design

## Summary

A responsive compact mode that activates when the window is resized below 25% of the user's screen width. Strips the UI down to just notes + collapsible transcript + icon-only sidebar, so the app can be tucked alongside a Zoom call during meetings.

## Trigger

- Query screen width via Tauri monitor API on launch and display change
- Threshold: `screenWidth * 0.25`
- Listen to Tauri window resize events; set `isCompact = true` when `windowWidth < threshold`
- Lower minimum window width in `tauri.conf.json` from 900px to ~300px
- Store `isCompact` in a React context for all components to consume

## Sidebar (Compact)

- Collapses from 240px to ~48px
- Icons only, no labels; tooltips on hover
- Logo shrinks to icon mark
- LLM selector and theme toggle hidden
- 200ms ease-out width transition; labels fade out simultaneously

## Main Content (Compact)

### Recording View

- Notes editor full width
- Live transcript hidden by default, expandable via toggle at bottom
- Template selector and toolbar items hidden
- Animated sound wave indicator in top-right corner

### Meeting Detail View

- Notes tab shown by default, full width
- Tab bar icons only, no labels
- Transcript collapsed by default, expandable via toggle
- All tabs (Summary, Insights, Analytics, Workflows) still accessible
- Audio player compacted to minimal play/pause bar

### Other Pages

- Content reflows to single column via flexbox
- No special handling beyond Tailwind responsive utilities

## Sound Wave Recording Indicator

- Position: top-right of content area
- 3-4 vertical bars, ~3px wide, ~2px spacing
- CSS keyframe animation (no JS overhead), bars animate at different speeds
- Accent or green color
- Size: ~24x16px
- Hidden when not recording

## Transitions & Edge Cases

- Sidebar collapse: 200ms ease-out, labels fade simultaneously
- Content reflow: natural flexbox behavior as sidebar shrinks
- Editor state preserved during resize (no re-mount)
- Transcript expanded/collapsed state preserved when crossing threshold
- Global chat panel hidden in compact mode
- Threshold recalculated when window moves between displays
