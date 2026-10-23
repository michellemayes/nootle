"use client";

import { useRef, type ComponentProps } from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { EASE_OUT } from "@/components/motion";

gsap.registerPlugin(useGSAP, CustomEase, ScrollTrigger, SplitText);

const [x1, y1, x2, y2] = EASE_OUT;
const ease = CustomEase.create("site", `M0,0 C${x1},${y1} ${x2},${y2} 1,1`);

/**
 * The <main> of a landing page, animated with GSAP. Children opt in with data attributes:
 * - `data-hero`: plays in on load, in document order. The headline rises in word by word.
 * - `data-reveal`: fades up once it scrolls into view.
 * - `data-reveal-stagger`: its direct children fade up one after another once they scroll into view.
 * - `data-parallax`: drifts gently as the page scrolls.
 *
 * Only transform and opacity animate, so nothing reflows. Visitors who prefer reduced motion get
 * the page as-is: the `matchMedia` condition below never runs, and the hero's CSS start state is
 * gated by the same media query in globals.css.
 */
export function LandingMotion({ children, ...props }: ComponentProps<"main">) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(ref);

        gsap.fromTo(q("[data-hero]:not(h1)"), { y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease, stagger: 0.1 });

        const [headline] = q("h1[data-hero]");
        if (headline) {
          const split = SplitText.create(headline, { type: "words" });
          gsap.set(headline, { opacity: 1 });
          gsap.from(split.words, {
            opacity: 0,
            y: "0.4em",
            duration: 0.9,
            ease,
            stagger: 0.05,
            delay: 0.1,
            onComplete: () => split.revert(),
          });
        }

        const reveals = q("[data-reveal], [data-reveal-stagger] > *");
        gsap.set(reveals, { opacity: 0, y: 24 });
        ScrollTrigger.batch(reveals, {
          start: "top 85%",
          once: true,
          onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease, stagger: 0.08 }),
        });

        q("[data-parallax]").forEach((el) => {
          gsap.to(el, {
            yPercent: 30,
            ease: "none",
            scrollTrigger: { trigger: el.parentElement, start: "top top", end: "bottom top", scrub: true },
          });
        });
      });
    },
    { scope: ref },
  );

  return (
    <main ref={ref} {...props}>
      {children}
    </main>
  );
}
