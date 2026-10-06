import { marked } from "marked";
import DOMPurify from "dompurify";

const ALLOWED_TAGS = ["p","br","ul","ol","li","h1","h2","h3","h4","h5","h6","strong","em","mark","code","pre","blockquote","a","hr","table","thead","tbody","tr","th","td","del","sup","sub"];
const ALLOWED_ATTR = ["href","target","rel"];

/**
 * Markdown → sanitized HTML. With `hasHighlights`, [[highlight]] markers
 * become <mark> tags (enriched notes use them).
 */
export function markdownToHtml(text: string, hasHighlights = false): string {
  let src = text;
  if (hasHighlights) {
    src = src
      .replace(/\[\[highlight\]\]/g, "<mark>")
      .replace(/\[\[\/highlight\]\]/g, "</mark>");
  }
  const raw = marked.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR });
}
