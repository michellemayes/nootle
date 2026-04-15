import { useRef } from "react";
import { Check } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

const PRESETS = [
  { name: "Default", hue: 0, chroma: 0 },
  { name: "Blue", hue: 260, chroma: 0.18 },
  { name: "Purple", hue: 293, chroma: 0.24 },
  { name: "Green", hue: 155, chroma: 0.15 },
  { name: "Orange", hue: 55, chroma: 0.18 },
  { name: "Pink", hue: 350, chroma: 0.18 },
  { name: "Teal", hue: 195, chroma: 0.12 },
  { name: "Red", hue: 25, chroma: 0.20 },
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

function isActive(presetHue: number, presetChroma: number, currentHue: number, currentChroma: number): boolean {
  return Math.abs(presetHue - currentHue) < 1 && Math.abs(presetChroma - currentChroma) < 0.005;
}

export function AccentColorPicker() {
  const { accentHue, accentChroma, setAccentColor } = useTheme();
  const colorInputRef = useRef<HTMLInputElement>(null);

  const isCustom = !PRESETS.some((p) => isActive(p.hue, p.chroma, accentHue, accentChroma));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Accent color</p>
      <p className="text-sm text-muted-foreground">
        Tints buttons, focus rings, and active elements
      </p>
      <div className="flex items-center gap-2 pt-1">
        {PRESETS.map((preset) => {
          const active = isActive(preset.hue, preset.chroma, accentHue, accentChroma);
          const bg = preset.chroma === 0
            ? "oklch(0.35 0 0)"
            : `oklch(0.55 ${preset.chroma} ${preset.hue})`;
          return (
            <button
              key={preset.name}
              type="button"
              title={preset.name}
              onClick={() => setAccentColor(preset.hue, preset.chroma)}
              className="relative h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style={{
                backgroundColor: bg,
                borderColor: active ? bg : "transparent",
              }}
            >
              {active && (
                <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white" strokeWidth={3} />
              )}
            </button>
          );
        })}

        <div className="relative">
          <button
            type="button"
            title="Custom color"
            onClick={() => colorInputRef.current?.click()}
            className="relative h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            style={{
              background: isCustom
                ? `oklch(0.55 ${accentChroma} ${accentHue})`
                : "conic-gradient(from 0deg, oklch(0.65 0.2 0), oklch(0.65 0.2 60), oklch(0.65 0.2 120), oklch(0.65 0.2 180), oklch(0.65 0.2 240), oklch(0.65 0.2 300), oklch(0.65 0.2 360))",
              borderColor: isCustom
                ? `oklch(0.55 ${accentChroma} ${accentHue})`
                : "transparent",
            }}
          >
            {isCustom && (
              <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white" strokeWidth={3} />
            )}
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="absolute top-0 left-0 h-7 w-7 cursor-pointer opacity-0"
            tabIndex={-1}
            onChange={(e) => {
              const { hue, chroma } = hexToHueChroma(e.target.value);
              setAccentColor(hue, Math.max(chroma, 0.05));
            }}
          />
        </div>
      </div>
    </div>
  );
}
