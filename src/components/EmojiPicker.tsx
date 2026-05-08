import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Common",
    emojis: ["⚡", "✨", "🚀", "✅", "📝", "📋", "📅", "📌", "🔔", "🎯", "💡", "🔥", "⭐", "🏷️"],
  },
  {
    label: "Communication",
    emojis: ["💬", "📨", "📤", "📥", "📧", "📣", "🗣️", "💭", "📢", "🔗"],
  },
  {
    label: "Work",
    emojis: ["💼", "📊", "📈", "📉", "🗂️", "🗃️", "📁", "📎", "🖇️", "✏️", "🖊️", "🖋️"],
  },
  {
    label: "Status",
    emojis: ["🟢", "🟡", "🔴", "⚪", "⚫", "🆕", "🆗", "🆘", "❓", "❗", "‼️"],
  },
  {
    label: "Faces",
    emojis: ["🙂", "😀", "😎", "🤖", "🧠", "👀", "👋", "🙌", "👍", "💪"],
  },
];

interface EmojiPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function EmojiPicker({ value, onChange, placeholder = "Pick an icon" }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  const handlePick = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 px-3 gap-2 font-normal text-sm justify-start"
        >
          {value ? (
            <span className="text-base leading-none">{value}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          {value && (
            <span
              role="button"
              aria-label="Clear icon"
              className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={12}
        className="w-72 p-3 max-h-[min(60vh,360px)] overflow-y-auto"
      >
        <div className="space-y-3">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                {group.label}
              </p>
              <div className="grid grid-cols-7 gap-1">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handlePick(emoji)}
                    className={`h-7 w-7 rounded text-base leading-none flex items-center justify-center hover:bg-muted transition-colors ${
                      value === emoji ? "bg-muted" : ""
                    }`}
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
