import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { ReplaceStep } from "@tiptap/pm/transform";
import { KBD_CLASS } from "@/components/Kbd";

/** Asks for what comes next at the cursor, given the notes' text on either
 * side of it (one line per block). Resolves to null when there's nothing. */
export type FetchSuggestion = (before: string, after: string) => Promise<string | null>;

interface Ghost {
  text: string;
  pos: number;
}

const key = new PluginKey<Ghost | null>("noteSuggestion");

/** How long typing pauses before a suggestion is asked for. */
export const SUGGEST_DEBOUNCE_MS = 700;

/** What's left of a suggestion once `typed` is typed over it: its rest when
 * `typed` matches its start, otherwise null. */
export function consumeGhost(ghost: string, typed: string): string | null {
  return typed && ghost.startsWith(typed) && ghost !== typed ? ghost.slice(typed.length) : null;
}

/** The ghost left once a typed edit is applied: kept, minus the typed
 * characters, when they match its start; gone after any other change. */
function follow(ghost: Ghost | null, tr: Transaction): Ghost | null {
  if (!ghost) return null;
  if (!tr.docChanged) return tr.selectionSet && tr.selection.head !== ghost.pos ? null : ghost;
  const [step, ...more] = tr.steps;
  if (more.length || !(step instanceof ReplaceStep)) return null;
  const { from, to, slice } = step;
  if (from !== ghost.pos || to !== ghost.pos) return null;
  const typed = slice.content.textBetween(0, slice.content.size);
  const rest = consumeGhost(ghost.text, typed);
  return rest ? { text: rest, pos: ghost.pos + typed.length } : null;
}

/** Where a suggestion can go: an empty selection at the end of a text block
 * outside code, in a focused editor. */
function suggestionPoint(state: EditorState): number | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $pos = selection.$head;
  if (!$pos.parent.isTextblock || $pos.parent.type.spec.code) return null;
  if ($pos.parentOffset !== $pos.parent.content.size) return null;
  return $pos.pos;
}

function ghostWidget(text: string) {
  const el = document.createElement("span");
  el.className = "note-ghost";
  el.setAttribute("aria-hidden", "true");
  el.textContent = text;
  const hint = document.createElement("kbd");
  hint.className = `${KBD_CLASS} note-ghost-key`;
  hint.textContent = "Tab";
  el.appendChild(hint);
  return el;
}

/** Inline AI suggestions as ghost text after the cursor: Tab accepts,
 * Escape dismisses, and typing what it says keeps the rest. */
export const NoteSuggestion = Extension.create<{ fetch: { current: FetchSuggestion | null } }>({
  name: "noteSuggestion",
  priority: 1000,

  addOptions() {
    return { fetch: { current: null } };
  },

  addKeyboardShortcuts() {
    const accept = () => {
      const ghost = key.getState(this.editor.state);
      if (!ghost) return false;
      const { tr } = this.editor.state;
      this.editor.view.dispatch(
        tr.insertText(ghost.text, ghost.pos).setMeta(key, null).scrollIntoView(),
      );
      return true;
    };
    const dismiss = () => {
      if (!key.getState(this.editor.state)) return false;
      this.editor.view.dispatch(this.editor.state.tr.setMeta(key, null));
      return true;
    };
    return { Tab: accept, Escape: dismiss };
  },

  addProseMirrorPlugins() {
    const fetchRef = this.options.fetch;
    return [
      new Plugin<Ghost | null>({
        key,
        state: {
          init: () => null,
          apply(tr, ghost) {
            const meta = tr.getMeta(key) as Ghost | null | undefined;
            return meta !== undefined ? meta : follow(ghost, tr);
          },
        },
        props: {
          decorations(state) {
            const ghost = key.getState(state);
            if (!ghost) return null;
            return DecorationSet.create(state.doc, [
              Decoration.widget(ghost.pos, () => ghostWidget(ghost.text), {
                side: 1,
                key: `ghost:${ghost.pos}:${ghost.text}`,
                ignoreSelection: true,
              }),
            ]);
          },
          handleDOMEvents: {
            blur(view) {
              if (key.getState(view.state)) view.dispatch(view.state.tr.setMeta(key, null));
              return false;
            },
          },
        },
        view() {
          let timer: ReturnType<typeof setTimeout> | null = null;
          let request = 0;
          const cancel = () => {
            if (timer) clearTimeout(timer);
            timer = null;
            request++;
          };
          const ask = (view: EditorView) => {
            const fetch = fetchRef.current;
            const pos = suggestionPoint(view.state);
            if (!fetch || pos === null || !view.hasFocus()) return;
            const { doc } = view.state;
            const before = doc.textBetween(0, pos, "\n", " ");
            const after = doc.textBetween(pos, doc.content.size, "\n", " ");
            if (!before.trim() && !after.trim()) return;
            const id = ++request;
            fetch(before, after)
              .then((text) => {
                if (id !== request || !text || view.isDestroyed) return;
                if (!view.state.doc.eq(doc) || suggestionPoint(view.state) !== pos) return;
                view.dispatch(view.state.tr.setMeta(key, { text, pos }));
              })
              .catch(() => {});
          };
          return {
            update(view, prev) {
              if (view.state.doc.eq(prev.doc)) {
                if (!view.state.selection.eq(prev.selection)) cancel();
                return;
              }
              cancel();
              if (key.getState(view.state)) return;
              timer = setTimeout(() => ask(view), SUGGEST_DEBOUNCE_MS);
            },
            destroy: cancel,
          };
        },
      }),
    ];
  },
});
