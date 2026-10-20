/** `[slide 4]`, `[Slide 4, slide 5]`, `[slides 4 and 5]`: how summaries cite slides. */
const CITATION = /\[slides? (\d+(?:\s*(?:,|and|&)\s*(?:slide\s+)?\d+)*)\](?!\()/gi;

/**
 * Turns slide citations into `#slide-N` links, which the summary view
 * renders as thumbnails. Numbers past the last slide stay plain text.
 */
export function linkSlideCitations(markdown: string, slideCount: number): string {
  if (slideCount === 0) return markdown;
  return markdown.replace(CITATION, (match, list: string) => {
    const numbers = (list.match(/\d+/g) ?? []).map(Number);
    if (!numbers.every((n) => n >= 1 && n <= slideCount)) return match;
    return numbers.map((n) => `[slide ${n}](#slide-${n})`).join(" ");
  });
}

/** The slide a citation link points at; the sanitizer may prefix the fragment. */
export function citedSlide(href: string | undefined): number | null {
  const match = href?.match(/^#(?:user-content-)?slide-(\d+)$/);
  return match ? Number(match[1]) : null;
}
