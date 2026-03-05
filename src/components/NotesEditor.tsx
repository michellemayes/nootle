import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown as TiptapMarkdown } from "tiptap-markdown";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

interface NotesEditorProps {
  content: string;
  hasHighlights: boolean;
  onChange: (markdown: string) => void;
}

// Convert markdown with [[highlight]] markers → HTML with <mark> tags
function markdownToHtml(text: string, hasHighlights: boolean): string {
  let src = text;
  if (hasHighlights) {
    src = src
      .replace(/\[\[highlight\]\]/g, "<mark>")
      .replace(/\[\[\/highlight\]\]/g, "</mark>");
  }
  const raw = marked.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ["p","br","ul","ol","li","h1","h2","h3","h4","h5","h6","strong","em","mark","code","pre","blockquote","a","hr","table","thead","tbody","tr","th","td","del","sup","sub"],
    ALLOWED_ATTR: ["href","target","rel"],
  });
}

// Set TipTap content from HTML, bypassing tiptap-markdown's string parsing
function setHtmlContent(editor: ReturnType<typeof useEditor>, html: string) {
  if (!editor) return;
  const el = document.createElement("div");
  el.innerHTML = html;
  const doc = ProseMirrorDOMParser.fromSchema(editor.schema).parse(el);
  editor.commands.setContent(doc.toJSON());
}

// Convert ==...== (tiptap-markdown output for highlights) back to [[highlight]] for DB
function fromEditorMarkdown(text: string): string {
  return text.replace(/==(.*?)==/gs, "[[highlight]]$1[[/highlight]]");
}

export function NotesEditor({ content, hasHighlights, onChange }: NotesEditorProps) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExternalUpdate = useRef(false);
  const lastContentRef = useRef(content);
  const initialHtml = useRef(markdownToHtml(content, hasHighlights));

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({
        placeholder: "Start typing...",
      }),
      TiptapMarkdown.configure({
        html: false,
        transformPastedText: true,
      }),
    ],
    content: "", // set via onCreate
    editorProps: {
      attributes: {
        class: "focus:outline-none min-h-[200px]",
      },
    },
    onCreate: ({ editor: ed }) => {
      // Use ProseMirror DOM parser so <mark> maps to Highlight marks
      const el = document.createElement("div");
      el.innerHTML = initialHtml.current;
      const doc = ProseMirrorDOMParser.fromSchema(ed.schema).parse(el);
      ed.commands.setContent(doc.toJSON());
    },
    onUpdate: ({ editor: ed }) => {
      if (isExternalUpdate.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const md = (ed.storage as any).markdown.getMarkdown() as string;
        const output = hasHighlights ? fromEditorMarkdown(md) : md;
        lastContentRef.current = output;
        onChange(output);
      }, 600);
    },
  });

  // Sync when content changes externally (e.g. after AI enrichment)
  useEffect(() => {
    if (!editor) return;
    // Skip if this is content we just saved ourselves
    if (content === lastContentRef.current) return;
    lastContentRef.current = content;
    isExternalUpdate.current = true;
    const html = markdownToHtml(content, hasHighlights);
    setHtmlContent(editor, html);
    requestAnimationFrame(() => {
      isExternalUpdate.current = false;
    });
  }, [content, hasHighlights, editor]);

  return (
    <div className="notes-editor prose prose-invert prose-sm max-w-none [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5 [&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-4 [&_p]:mb-3 [&_p]:text-sm [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:text-sm [&_li]:mb-1 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:mb-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline [&_hr]:my-4 [&_hr]:border-border [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_mark]:bg-primary/15 [&_mark]:text-primary [&_mark]:rounded [&_mark]:px-0.5">
      <EditorContent editor={editor} />
    </div>
  );
}
