"use client";

import { useRef, type ComponentProps } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

const bounce = "back.out(1.7)";

/**
 * A page's <main>, animated with GSAP for a playful feel. Children opt in with data attributes:
 * - `data-hero`: bounces in on load, in document order. A hero `h1`'s letters tumble in one by one.
 * - `data-squiggle` (see Doodles.tsx): its underline draws on after the headline lands, then the word wiggles.
 * - `data-doodle`: pops in, bobs, and drifts away from the cursor by its `data-depth`.
 * - `data-wiggle`: pops in with the hero and wiggles again on hover.
 * - `data-jelly`: its children squash and stretch once the hero has landed.
 * - `data-reveal`: bounces up once it scrolls into view, tilted a little.
 * - `data-reveal-stagger`: its direct children do the same one after another, tilting alternate ways.
 * - `data-pop`: spins in once it scrolls into view.
 * - `data-parallax`: drifts gently as the page scrolls.
 *
 * Only transform and opacity animate, so nothing reflows. Visitors who prefer reduced motion get
 * the page as-is: the `matchMedia` condition below never runs, and the CSS start states in
 * globals.css sit behind the same media query.
 */
export function PageMotion({ children, ...props }: ComponentProps<"main">) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    (_, contextSafe) => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(ref);
        const hero = gsap.timeline();

        const [headline] = q("h1[data-hero]");
        if (headline) {
          const split = SplitText.create(headline, { type: "words,chars" });
          hero
            .set(headline, { opacity: 1 })
            .from(split.chars, {
              opacity: 0,
              y: "-0.6em",
              rotation: () => gsap.utils.random(-30, 30),
              duration: 0.7,
              ease: "back.out(2.5)",
              stagger: 0.025,
            });
        }

        hero.fromTo(
          q("[data-hero]:not(h1, [data-wiggle])"),
          { y: 28, scale: 0.96 },
          { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: bounce, stagger: 0.08 },
          0.15,
        );

        hero.to(q("[data-squiggle] path"), { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" }, "-=0.3");
        hero.to(q("[data-squiggle]"), {
          keyframes: { rotation: [0, -4, 3, -1.5, 0] },
          duration: 0.6,
          ease: "sine.inOut",
          transformOrigin: "50% 100%",
        });

        // The buttons transition `transform` for their own hover; that would smear the squash, so it's off meanwhile.
        const jellies = q("[data-jelly] > *");
        hero.to(
          jellies,
          {
            keyframes: { scaleX: [1, 1.12, 0.94, 1.03, 1], scaleY: [1, 0.88, 1.06, 0.98, 1] },
            duration: 0.7,
            ease: "none",
            stagger: 0.1,
            onStart: () => gsap.set(jellies, { transition: "none" }),
            onComplete: () => gsap.set(jellies, { clearProps: "transition,transform" }),
          },
          "<",
        );

        hero.fromTo(
          q("[data-wiggle]"),
          { scale: 0.4, rotation: -20 },
          { opacity: 1, scale: 1, rotation: 0, duration: 0.9, ease: "elastic.out(1, 0.45)", stagger: 0.1 },
          0,
        );
        const wiggle = contextSafe!((e: Event) =>
          gsap.to(e.currentTarget as Element, {
            keyframes: { rotation: [0, -10, 8, -4, 0] },
            duration: 0.6,
            overwrite: true,
          }),
        );
        q("[data-wiggle]").forEach((el) => el.addEventListener("mouseenter", wiggle));

        const doodles = q("[data-doodle]");
        hero.fromTo(
          doodles,
          { scale: 0, rotation: -90 },
          { opacity: 1, scale: 1, rotation: 0, duration: 0.8, ease: "back.out(3)", stagger: { each: 0.08, from: "random" } },
          0.3,
        );
        const bobs = q("[data-doodle-bob]").map((el) =>
          gsap.to(el, {
            y: () => gsap.utils.random(-14, 14),
            rotation: () => gsap.utils.random(-15, 15),
            duration: () => gsap.utils.random(2.2, 3.6),
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
            repeatRefresh: true,
          }),
        );
        // Bobbing stops while the hero is off screen.
        if (doodles[0]) {
          ScrollTrigger.create({
            trigger: doodles[0].parentElement,
            onToggle: (self) => bobs.forEach((t) => t.paused(!self.isActive)),
          });
        }
        const nudges = doodles.map((el) => {
          const depth = Number(el.dataset.depth ?? 1);
          return { depth, x: gsap.quickTo(el, "x", { duration: 0.8, ease: "power3" }), y: gsap.quickTo(el, "y", { duration: 0.8, ease: "power3" }) };
        });
        const onMove = (e: PointerEvent) => {
          const dx = e.clientX / window.innerWidth - 0.5;
          const dy = e.clientY / window.innerHeight - 0.5;
          nudges.forEach((n) => {
            n.x(dx * -40 * n.depth);
            n.y(dy * -40 * n.depth);
          });
        };
        if (nudges.length) window.addEventListener("pointermove", onMove, { passive: true });

        const reveals = q("[data-reveal], [data-reveal-stagger] > *");
        gsap.set(reveals, { opacity: 0, y: 40, rotation: (i) => (i % 2 ? 2 : -2) });
        ScrollTrigger.batch(reveals, {
          start: "top 88%",
          once: true,
          onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, rotation: 0, duration: 0.8, ease: bounce, stagger: 0.09 }),
        });

        const pops = q("[data-pop]");
        gsap.set(pops, { scale: 0, rotation: -180 });
        ScrollTrigger.batch(pops, {
          start: "top 88%",
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, { scale: 1, rotation: 0, duration: 1, ease: "elastic.out(1, 0.5)", stagger: 0.1, delay: 0.15 }),
        });

        q("[data-parallax]").forEach((el) => {
          gsap.to(el, {
            yPercent: 30,
            ease: "none",
            scrollTrigger: { trigger: el.parentElement, start: "top top", end: "bottom top", scrub: true },
          });
        });

        return () => {
          window.removeEventListener("pointermove", onMove);
          q("[data-wiggle]").forEach((el) => el.removeEventListener("mouseenter", wiggle));
        };
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
