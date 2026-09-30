import { useRef } from "react";
import { Check } from "lucide-react";
import { DEFAULT_SURFACE, useTheme } from "@/hooks/useTheme";

const ACCENT_PRESETS = [
  { name: "Default", hue: 0, chroma: 0 },
  { name: "Blue", hue: 260, chroma: 0.18 },
  { name: "Purple", hue: 293, chroma: 0.24 },
  { name: "Green", hue: 155, chroma: 0.15 },
  { name: "Orange", hue: 55, chroma: 0.18 },
  { name: "Pink", hue: 350, chroma: 0.18 },
  { name: "Teal", hue: 195, chroma: 0.12 },
  { name: "Red", hue: 25, chroma: 0.20 },
  { name: "Indigo", hue: 275, chroma: 0.2 },
  { name: "Yellow", hue: 85, chroma: 0.16 },
  { name: "Graphite", hue: 260, chroma: 0.02 },
] as const;

// Background themes: hue plus a multiplier on the base surface chroma.
const SURFACE_PRESETS = [
  { name: "Lavender (default)", hue: DEFAULT_SURFACE.hue, tint: DEFAULT_SURFACE.tint },
  { name: "White", hue: 0, tint: 0 },
  { name: "Slate", hue: 250, tint: 0.8 },
  { name: "Ocean", hue: 230, tint: 1.6 },
  { name: "Sage", hue: 150, tint: 1.2 },
  { name: "Sand", hue: 75, tint: 1.5 },
  { name: "Mocha", hue: 50, tint: 1.8 },
  { name: "Rose", hue: 10, tint: 1.2 },
] as const;

/** Convert hex (#rrggbb) to OKLCH hue and chroma. */
function hexToHueChroma(hex: string): { hue: number; chroma: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_cbrt = Math.cbrt(l_);
  const m_cbrt = Math.cbrt(m_);
  const s_cbrt = Math.cbrt(s_);

  const a = 1.9779984951 * l_cbrt - 2.4285922050 * m_cbrt + 0.4505937099 * s_cbrt;
  const bOk = 0.0259040371 * l_cbrt + 0.7827717662 * m_cbrt - 0.8086757660 * s_cbrt;

  const chroma = Math.sqrt(a * a + bOk * bOk);
  let hue = (Math.atan2(bOk, a) * 180) / Math.PI;
  if (hue < 0) hue += 360;

  return { hue: Math.round(hue), chroma: Math.round(chroma * 1000) / 1000 };
}

const RAINBOW =
  "conic-gradient(from 0deg, oklch(0.65 0.2 0), oklch(0.65 0.2 60), oklch(0.65 0.2 120), oklch(0.65 0.2 180), oklch(0.65 0.2 240), oklch(0.65 0.2 300), oklch(0.65 0.2 360))";

const SWATCH_CLASS =
  "relative h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

interface Swatch {
  name: string;
  color: string;
  active: boolean;
  onSelect: () => void;
}

interface SwatchPickerProps {
  label: string;
  description: string;
  swatches: Swatch[];
  /** Border for inactive swatches — light swatches need one to stay visible. */
  idleBorder: string;
  /** Checkmark color that reads on top of the swatches. */
  checkClass: string;
  customColor: string | null;
  onCustom: (hex: string) => void;
}

function SwatchPicker({ label, description, swatches, idleBorder, checkClass, customColor, onCustom }: SwatchPickerProps) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const check = <Check className={`absolute inset-0 m-auto h-3.5 w-3.5 ${checkClass}`} strokeWidth={3} />;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {swatches.map((s) => (
          <button
            key={s.name}
            type="button"
            title={s.name}
            aria-label={s.name}
            aria-pressed={s.active}
            onClick={s.onSelect}
            className={SWATCH_CLASS}
            style={{ backgroundColor: s.color, borderColor: s.active ? "var(--primary)" : idleBorder }}
          >
            {s.active && check}
          </button>
        ))}

        <div className="relative flex">
          <button
            type="button"
            title="Custom color"
            aria-label="Custom color"
            aria-pressed={customColor !== null}
            onClick={() => colorInputRef.current?.click()}
            className={SWATCH_CLASS}
            style={{
              background: customColor ?? RAINBOW,
              borderColor: customColor ? "var(--primary)" : "transparent",
            }}
          >
            {customColor && check}
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="absolute top-0 left-0 h-7 w-7 cursor-pointer opacity-0"
            tabIndex={-1}
            onChange={(e) => onCustom(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

const near = (a: number, b: number, eps: number) => Math.abs(a - b) < eps;

export function AccentColorPicker() {
  const { accentHue, accentChroma, setAccentColor } = useTheme();
  const swatches = ACCENT_PRESETS.map((p) => ({
    name: p.name,
    color: p.chroma === 0 ? "oklch(0.35 0 0)" : `oklch(0.55 ${p.chroma} ${p.hue})`,
    active: near(p.hue, accentHue, 1) && near(p.chroma, accentChroma, 0.005),
    onSelect: () => setAccentColor(p.hue, p.chroma),
  }));
  const isCustom = !swatches.some((s) => s.active);

  return (
    <SwatchPicker
      label="Accent color"
      description="Tints buttons, focus rings, and active elements"
      swatches={swatches}
      idleBorder="transparent"
      checkClass="text-white"
      customColor={isCustom ? `oklch(0.55 ${accentChroma} ${accentHue})` : null}
      onCustom={(hex) => {
        const { hue, chroma } = hexToHueChroma(hex);
        setAccentColor(hue, Math.max(chroma, 0.05));
      }}
    />
  );
}

export function BackgroundThemePicker() {
  const { theme, surfaceHue, surfaceTint, setSurfaceColor } = useTheme();
  // Preview each theme as it would look in the current mode.
  const preview = (hue: number, tint: number) =>
    theme === "dark" ? `oklch(0.3 ${0.04 * tint} ${hue})` : `oklch(${tint === 0 ? 1 : 0.93} ${0.03 * tint} ${hue})`;
  const swatches = SURFACE_PRESETS.map((p) => ({
    name: p.name,
    color: preview(p.hue, p.tint),
    active: near(p.tint, surfaceTint, 0.01) && (p.tint === 0 || near(p.hue, surfaceHue, 1)),
    onSelect: () => setSurfaceColor(p.hue, p.tint),
  }));
  const isCustom = !swatches.some((s) => s.active);

  return (
    <SwatchPicker
      label="Background theme"
      description="Tints the window, sidebar, cards, and borders — separate from the accent color"
      swatches={swatches}
      idleBorder="var(--border)"
      checkClass="text-foreground"
      customColor={isCustom ? preview(surfaceHue, surfaceTint) : null}
      onCustom={(hex) => {
        const { hue, chroma } = hexToHueChroma(hex);
        // Map the picked color's saturation onto a subtle surface tint.
        setSurfaceColor(hue, Math.min(Math.max(chroma / 0.08, 0.5), 3));
      }}
    />
  );
}
