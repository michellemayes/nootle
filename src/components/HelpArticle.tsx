import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

import { CopyButton } from "@/components/CopyButton";
import { SafeLink, rehypePlugins, remarkPlugins } from "@/components/Markdown";
import { cn } from "@/lib/utils";

type HastNode = { type: string; value?: string; children?: HastNode[] };

const hastText = (node?: HastNode): string =>
  node?.type === "text" ? (node.value ?? "") : (node?.children ?? []).map(hastText).join("");

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The guide's `## ` sections, skipping `#` lines inside code fences. */
function sectionHeadings(md: string) {
  let inFence = false;
  const headings: { id: string; title: string }[] = [];
  for (const line of md.split("\n")) {
    if (line.startsWith("```")) inFence = !inFence;
    else if (!inFence && line.startsWith("## ")) {
      const title = line.slice(3).replace(/[*_`]/g, "").trim();
      headings.push({ id: slugify(title), title });
    }
  }
  return headings;
}

const components: Components = {
  a: (props) => (
    <SafeLink {...props} className="font-medium text-primary underline-offset-4 hover:underline" />
  ),
  h2: ({ node, children }) => (
    <h2
      id={slugify(hastText(node as HastNode))}
      className="mt-10 mb-4 scroll-mt-8 border-t pt-8 text-xl font-semibold tracking-tight text-foreground"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-8 mb-3 text-base font-semibold tracking-tight text-foreground">{children}</h3>
  ),
  p: ({ children }) => <p className="my-4 leading-7">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-4 list-disc space-y-2 pl-5 marker:text-muted-foreground/50">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 list-decimal space-y-2 pl-5 marker:text-muted-foreground">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  pre: ({ node, children }) => (
    <div className="group relative my-5">
      <pre className="overflow-x-auto rounded-xl border bg-muted/50 p-4 pr-12 font-mono text-[13px] leading-6 text-foreground">
        {children}
      </pre>
      <CopyButton
        text={hastText(node as HastNode).replace(/\n$/, "")}
        className="absolute top-2.5 right-2.5 bg-background/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      />
    </div>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-5 rounded-r-lg border-l-2 border-primary/50 bg-muted/40 py-1 pr-4 pl-4">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto rounded-xl border">
      <table className="w-full text-sm [&_td:first-child]:whitespace-nowrap [&_tr:last-child_td]:border-b-0">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b bg-muted/50 px-4 py-2.5 text-left font-medium text-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="border-b px-4 py-2.5 align-top">{children}</td>,
  hr: () => <hr className="my-10 border-border" />,
};

interface HelpArticleProps {
  content: string;
  /** Rendered between the guide's opening paragraph and its first section. */
  afterLead?: ReactNode;
}

/** A help guide set as a readable article, with an "On this page" outline that tracks scrolling. */
export function HelpArticle({ content, afterLead }: HelpArticleProps) {
  const [lead, body] = useMemo(() => {
    const end = content.indexOf("\n\n");
    return end === -1 ? [content, ""] : [content.slice(0, end), content.slice(end)];
  }, [content]);
  const headings = useMemo(() => sectionHeadings(content), [content]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState(headings[0]?.id);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || headings.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = scroller.getBoundingClientRect().top;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      let current = headings[0].id;
      for (const { id } of headings) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - top <= 96) current = id;
      }
      setActiveId(atBottom ? headings[headings.length - 1].id : current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [headings]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="flex gap-12 px-6 py-8">
        <article className="min-w-0 max-w-[680px] flex-1 text-[15px] text-muted-foreground [&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:border [&_:not(pre)>code]:bg-muted/60 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em] [&_:not(pre)>code]:text-foreground">
          <div className="text-base text-foreground/80 [&>p:first-child]:mt-0">
            <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
              {lead}
            </ReactMarkdown>
          </div>
          {afterLead && <div className="my-8">{afterLead}</div>}
          <div>
            <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
              {body}
            </ReactMarkdown>
          </div>
          <div className="h-16" />
        </article>

        {headings.length > 1 && (
          <nav aria-label="On this page" className="sticky top-8 hidden w-52 shrink-0 self-start lg:block">
            <p className="mb-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              On this page
            </p>
            <ul className="border-l">
              {headings.map(({ id, title }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })}
                    className={cn(
                      "-ml-px block w-full border-l py-1.5 pl-4 text-left text-[13px] leading-snug transition-colors",
                      activeId === id
                        ? "border-primary font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
