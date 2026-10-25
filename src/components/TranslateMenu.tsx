import { memo } from "react";
import { Check, ChevronDown, Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MeetingTranslation } from "@/types";

/** Languages offered to translate into; the AI is told the name as written. */
export const TRANSLATION_LANGUAGES = [
  "Arabic",
  "Chinese (Simplified)",
  "Dutch",
  "English",
  "French",
  "German",
  "Hebrew",
  "Hindi",
  "Indonesian",
  "Italian",
  "Japanese",
  "Korean",
  "Polish",
  "Portuguese",
  "Russian",
  "Spanish",
  "Swedish",
  "Turkish",
  "Ukrainian",
  "Vietnamese",
];

/**
 * Shows the meeting in another language: a saved translation, or a new one
 * made with the selected model, or the original.
 */
export const TranslateMenu = memo(function TranslateMenu({
  translations,
  showing,
  translating,
  canTranslate,
  onShow,
  onTranslate,
}: {
  translations: MeetingTranslation[];
  /** The language on screen, or null for the original. */
  showing: string | null;
  /** The language being translated into, while it runs. */
  translating: string | null;
  /** Whether a model is selected to translate with. */
  canTranslate: boolean;
  onShow: (language: string | null) => void;
  onTranslate: (language: string) => void;
}) {
  const saved = new Set(translations.map((t) => t.language));
  const cantTranslate = !canTranslate || translating !== null;
  const label = translating ? `Translating into ${translating}…` : (showing ?? "Translate");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 px-2"
          title={showing ? `Showing the meeting in ${showing}` : "Translate the transcript and summaries"}
          aria-label={label}
        >
          {translating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
          {(showing || translating) && <span className="max-w-32 truncate text-xs">{showing ?? translating}</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-60 overflow-y-auto">
        <DropdownMenuItem onClick={() => onShow(null)}>
          <Check className={showing ? "invisible" : ""} />
          Original
        </DropdownMenuItem>
        {translations.map((t) => (
          <DropdownMenuItem key={t.language} onClick={() => onShow(t.language)}>
            <Check className={showing === t.language ? "" : "invisible"} />
            {t.language}
          </DropdownMenuItem>
        ))}
        {showing && (
          <DropdownMenuItem disabled={cantTranslate} onClick={() => onTranslate(showing)}>
            <span className="w-4" />
            Translate into {showing} again
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {canTranslate ? "Translate with your selected model into" : "Select a model in Settings to translate"}
        </DropdownMenuLabel>
        {TRANSLATION_LANGUAGES.filter((l) => !saved.has(l)).map((language) => (
          <DropdownMenuItem
            key={language}
            disabled={cantTranslate}
            onClick={() => onTranslate(language)}
          >
            <span className="w-4" />
            {language}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
