import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { ReplaceStep } from "@tiptap/pm/transform";
import type { Node as PMNode } from "@tiptap/pm/model";
import { KBD_CLASS } from "@/components/Kbd";

/** What to show at the cursor: `text` finishes the line being written and
 * `bullets` are sub-points that go under it, both without list markers. */
export interface Suggestion {
  text: string;
  bullets: string[];
}

/** Asks for a suggestion at the cursor, given the notes either side of it as
 * Markdown lines. Resolves to null when there's nothing to add. */
export type FetchSuggestion = (before: string, after: string) => Promise<Suggestion | null>;

/** How long typing pauses before a suggestion is asked for. */
export const SUGGEST_DEBOUNCE_MS = 450;

/** What's left of a suggestion once `typed` is typed over it: its rest when
 * `typed` matches its start, otherwise null. */
export function consumeGhost(ghost: string, typed: string): string | null {
  return typed && ghost.startsWith(typed) && ghost !== typed ? ghost.slice(typed.length) : null;
}

const LINE = /^(\s*)((?:[-*•]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?(.*)$/;

/** A Markdown line split into its indentation, list marker and words. */
export function lineShape(line: string) {
  const [, indent = "", marker = "", content = ""] = LINE.exec(line) ?? [];
  return { indent, marker, content };
}

/** The marker for the item after one marked `marker`. */
export function nextMarker(marker: string) {
  const n = /^(\d+)([.)])/.exec(marker);
  return n ? `${Number(n[1]) + 1}${n[2]} ` : marker.replace(/\[[xX]\]/, "[ ]");
}

/**
 * A suggestion as plain-text ghost for a Markdown textarea whose text before
 * the caret is `before`. Bullets nest one level under the line being written.
 */
export function ghostText(before: string, { text, bullets }: Suggestion): string {
  const { indent, marker } = lineShape(before.slice(before.lastIndexOf("\n") + 1));
  const child = `${indent}${marker ? "  " : ""}${/^[*•]/.test(marker) ? marker[0] : "-"} `;
  return text + bullets.map((b) => `\n${child}${b}`).join("");
}

/**
 * Asks for suggestions as typing pauses, one request at a time. A reply that
 * comes back after more typing is still shown when the new characters match
 * its start, so slow models keep up; otherwise it asks again.
 */
export class SuggestionRunner {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private stale = false;
  private generation = 0;

  constructor(
    private readonly hooks: {
      fetch: () => FetchSuggestion | null;
      /** The text either side of the caret, or null when there's nowhere to suggest. */
      read: () => { before: string; after: string } | null;
      /** Shows a reply for `before`, with `typed` typed since. Returns whether it showed. */
      show: (suggestion: Suggestion, before: string, typed: string) => boolean;
      pending: (on: boolean) => void;
    },
  ) {}

  /** Typing happened: ask once it pauses. */
  schedule() {
    if (this.timer) clearTimeout(this.timer);
    if (this.inFlight) this.stale = true;
    this.timer = setTimeout(() => this.ask(), SUGGEST_DEBOUNCE_MS);
  }

  /** Drop any pending ask and ignore the reply in flight. */
  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stale = false;
    this.generation++;
    if (this.inFlight) this.hooks.pending(false);
  }

  private ask() {
    this.timer = null;
    if (this.inFlight) return;
    const fetch = this.hooks.fetch();
    const ctx = this.hooks.read();
    if (!fetch || !ctx || (!ctx.before.trim() && !ctx.after.trim())) return;
    const generation = this.generation;
    this.inFlight = true;
    this.stale = false;
    this.hooks.pending(true);
    fetch(ctx.before, ctx.after)
      .catch(() => null)
      .then((suggestion) => {
        this.inFlight = false;
        if (generation !== this.generation) return;
        this.hooks.pending(false);
        const now = this.hooks.read();
        const typed = now?.before.startsWith(ctx.before) ? now.before.slice(ctx.before.length) : null;
        const fits = suggestion && now && typed !== null && !typed.includes("\n") && now.after === ctx.after;
        const shown = fits ? this.hooks.show(suggestion, ctx.before, typed) : false;
        if (!shown && this.stale && !this.timer) this.ask();
      });
  }
}

interface Ghost {
  text: string;
  bullets: string[];
  pos: number;
}

interface SuggestionState {
  ghost: Ghost | null;
  pending: boolean;
}

type Meta = Partial<SuggestionState>;

const key = new PluginKey<SuggestionState>("noteSuggestion");

/** A ghost minus `typed` typed over its start, or null if that doesn't match. */
function typedOver(ghost: Ghost, typed: string): Ghost | null {
  if (!typed) return ghost;
  if (typed === ghost.text && ghost.bullets.length) {
    return { ...ghost, text: "", pos: ghost.pos + typed.length };
  }
  const rest = consumeGhost(ghost.text, typed);
  return rest ? { ...ghost, text: rest, pos: ghost.pos + typed.length } : null;
}

/** The ghost left once a transaction applies: kept, minus any typed
 * characters that match its start; gone after any other change. */
function follow(ghost: Ghost | null, tr: Transaction): Ghost | null {
  if (!ghost) return null;
  if (!tr.docChanged) return tr.selectionSet && tr.selection.head !== ghost.pos ? null : ghost;
  const [step, ...more] = tr.steps;
  if (more.length || !(step instanceof ReplaceStep)) return null;
  const { from, to, slice } = step;
  if (from !== ghost.pos || to !== ghost.pos) return null;
  return typedOver(ghost, slice.content.textBetween(0, slice.content.size));
}

/** Where a suggestion can go: an empty selection at the end of a text block
 * outside code. */
function suggestionPoint(state: EditorState): number | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $pos = selection.$head;
  if (!$pos.parent.isTextblock || $pos.parent.type.spec.code) return null;
  if ($pos.parentOffset !== $pos.parent.content.size) return null;
  return $pos.pos;
}

/** The document between `from` and `to` as Markdown lines, with list markers
 * and nesting, so the model sees the notes' structure. */
export function markdownBetween(doc: PMNode, from: number, to: number): string {
  const lines: string[] = [];
  doc.nodesBetween(from, to, (node, start) => {
    if (!node.isTextblock) return true;
    const contentStart = start + 1;
    const text = node.textBetween(
      Math.max(from, contentStart) - contentStart,
      Math.min(to, contentStart + node.content.size) - contentStart,
      undefined,
      " ",
    );
    if (from > contentStart) {
      lines.push(text);
      return false;
    }
    const $start = doc.resolve(contentStart);
    let level = 0;
    let marker = "";
    for (let d = $start.depth - 1; d > 0; d--) {
      const ancestor = $start.node(d);
      if (!/^(listItem|taskItem)$/.test(ancestor.type.name)) continue;
      level++;
      if (level === 1 && $start.index(d) === 0) {
        const list = $start.node(d - 1);
        if (list.type.name === "orderedList") {
          marker = `${(list.attrs.start ?? 1) + $start.index(d - 1)}. `;
        } else if (ancestor.type.name === "taskItem") {
          marker = ancestor.attrs.checked ? "- [x] " : "- [ ] ";
        } else {
          marker = "- ";
        }
      }
    }
    const indent = "  ".repeat(Math.max(0, marker ? level - 1 : level));
    const heading = node.type.name === "heading" ? `${"#".repeat(node.attrs.level ?? 1)} ` : "";
    lines.push(indent + marker + heading + text);
    return false;
  });
  return lines.join("\n");
}

function ghostWidget({ text, bullets }: Ghost) {
  const el = document.createElement("span");
  el.className = "note-ghost";
  el.setAttribute("aria-hidden", "true");
  el.append(text);
  for (const bullet of bullets) {
    const line = document.createElement("span");
    line.className = "note-ghost-bullet";
    line.textContent = bullet;
    el.appendChild(line);
  }
  const hint = document.createElement("kbd");
  hint.className = `${KBD_CLASS} note-ghost-key`;
  hint.textContent = "Tab";
  (el.lastElementChild ?? el).appendChild(hint);
  return el;
}

function pendingWidget() {
  const el = document.createElement("span");
  el.className = "note-ghost-pending";
  el.setAttribute("aria-hidden", "true");
  return el;
}

/** Inserts a ghost: its text at the cursor and its bullets as a list nested
 * under the cursor's line, leaving the cursor at the end of what went in. */
function acceptGhost(state: EditorState, { text, bullets, pos }: Ghost): Transaction {
  const tr = state.tr;
  if (text) tr.insertText(text, pos);
  const end = pos + text.length;
  const { bulletList, listItem, paragraph } = state.schema.nodes;
  if (!bullets.length || !bulletList || !listItem || !paragraph) {
    return tr.setSelection(TextSelection.create(tr.doc, end)).setMeta(key, { ghost: null });
  }
  const items = bullets.map((b) => listItem.create(null, paragraph.create(null, state.schema.text(b))));
  const $end = tr.doc.resolve(end);
  const afterLine = $end.after();
  const next = tr.doc.nodeAt(afterLine);
  const inItem = $end.depth > 1 && $end.node(-1).type === listItem;
  let lastText: number;
  if (inItem && next?.type === bulletList) {
    tr.insert(afterLine + 1, items);
    lastText = afterLine + 1 + items.reduce((n, item) => n + item.nodeSize, 0) - 2;
  } else {
    const list = bulletList.create(null, items);
    tr.insert(afterLine, list);
    lastText = afterLine + list.nodeSize - 3;
  }
  return tr
    .setSelection(TextSelection.create(tr.doc, lastText))
    .setMeta(key, { ghost: null })
    .scrollIntoView();
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
    return {
      Tab: () => {
        const ghost = key.getState(this.editor.state)?.ghost;
        if (!ghost) return false;
        this.editor.view.dispatch(acceptGhost(this.editor.state, ghost));
        return true;
      },
      Escape: () => {
        if (!key.getState(this.editor.state)?.ghost) return false;
        this.editor.view.dispatch(this.editor.state.tr.setMeta(key, { ghost: null }));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const fetchRef = this.options.fetch;
    let runner: SuggestionRunner | null = null;
    return [
      new Plugin<SuggestionState>({
        key,
        state: {
          init: () => ({ ghost: null, pending: false }),
          apply(tr, value) {
            const meta = tr.getMeta(key) as Meta | undefined;
            const ghost = meta && "ghost" in meta ? (meta.ghost ?? null) : follow(value.ghost, tr);
            const pending = meta?.pending ?? value.pending;
            return ghost === value.ghost && pending === value.pending ? value : { ghost, pending };
          },
        },
        props: {
          decorations(state) {
            const { ghost, pending } = key.getState(state) ?? {};
            if (ghost) {
              return DecorationSet.create(state.doc, [
                Decoration.widget(ghost.pos, () => ghostWidget(ghost), {
                  side: 1,
                  key: `ghost:${ghost.pos}:${ghost.text}:${ghost.bullets.join("|")}`,
                  ignoreSelection: true,
                }),
              ]);
            }
            const at = pending ? suggestionPoint(state) : null;
            if (at === null) return null;
            return DecorationSet.create(state.doc, [
              Decoration.widget(at, pendingWidget, { side: 1, key: "pending", ignoreSelection: true }),
            ]);
          },
          handleDOMEvents: {
            blur(view) {
              runner?.cancel();
              if (key.getState(view.state)?.ghost) view.dispatch(view.state.tr.setMeta(key, { ghost: null }));
              return false;
            },
          },
        },
        view(view: EditorView) {
          const read = () => {
            const pos = suggestionPoint(view.state);
            if (pos === null || !view.hasFocus()) return null;
            const { doc } = view.state;
            return { before: markdownBetween(doc, 0, pos), after: markdownBetween(doc, pos, doc.content.size) };
          };
          runner = new SuggestionRunner({
            fetch: () => fetchRef.current,
            read,
            show: (suggestion, _before, typed) => {
              const pos = suggestionPoint(view.state);
              if (pos === null || key.getState(view.state)?.ghost) return false;
              const ghost = typedOver({ ...suggestion, pos: pos - typed.length }, typed);
              if (!ghost) return false;
              view.dispatch(view.state.tr.setMeta(key, { ghost }));
              return true;
            },
            pending: (on) => {
              if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, { pending: on }));
            },
          });
          return {
            update(v, prev) {
              if (v.state.doc === prev.doc) return;
              if (!key.getState(v.state)?.ghost) runner?.schedule();
            },
            destroy: () => runner?.cancel(),
          };
        },
      }),
    ];
  },
});
