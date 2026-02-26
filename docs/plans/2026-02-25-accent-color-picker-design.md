# Accent Color Picker Design

## Goal

Let users change the theme accent color that tints buttons, focus rings, active states, and all elements using the `primary` color token.

## Approach: OKLCH Hue Rotation

Store a hue (0-360) and chroma value. Derive light/dark variants by adjusting lightness. All `--primary-*` CSS variables reference these values.

- **Light mode:** `oklch(0.45 <chroma> <hue>)` — dark enough for white foreground text
- **Dark mode:** `oklch(0.75 <chroma> <hue>)` — bright enough to pop on dark backgrounds
- **Default (neutral):** hue 0, chroma 0 — preserves the existing gray look

## UI

An `AccentColorPicker` component inside the Appearance card on Settings:

- Row of 6-8 preset color swatches (small filled circles) with a check mark on the active one
- A "Custom" swatch that opens a native `<input type="color">` picker
- Hex from custom picker is converted to OKLCH hue/chroma

### Presets

| Name    | Hue | Chroma |
|---------|-----|--------|
| Default | 0   | 0      |
| Blue    | 260 | 0.18   |
| Purple  | 300 | 0.18   |
| Green   | 155 | 0.15   |
| Orange  | 55  | 0.18   |
| Pink    | 350 | 0.18   |
| Teal    | 195 | 0.12   |
| Red     | 25  | 0.20   |

## Data Flow

1. User clicks swatch or picks custom color
2. `setAccentColor(hue, chroma)` called on ThemeProvider context
3. Values saved to localStorage (`accent-hue`, `accent-chroma`)
4. CSS custom properties `--accent-h` and `--accent-c` set on root element via `style.setProperty`
5. CSS variables in `index.css` reference them — all primary/ring/sidebar-primary colors update instantly

## Affected CSS Variables

These variables change from static OKLCH values to dynamic expressions:

- `--primary`
- `--primary-foreground`
- `--ring`
- `--sidebar-primary`
- `--sidebar-primary-foreground`
- `--sidebar-ring`

## Files Changed

- `src/index.css` — rewrite primary/ring/sidebar-primary to use `var(--accent-h)` / `var(--accent-c)`
- `src/hooks/useTheme.tsx` — add accentHue/accentChroma/setAccentColor to context; apply CSS properties on mount and change
- `src/pages/Settings.tsx` — add AccentColorPicker below theme toggle
- `src/components/AccentColorPicker.tsx` — new swatch grid + custom picker component

## Persistence

localStorage keys: `accent-hue`, `accent-chroma`. Read on ThemeProvider mount.
