"use client";

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

/* ══════════════════════════════════════════════════════════════
   MOTION
   ──────────────────────────────────────────────────────────────
   Scroll-triggered reveals and split typography, built on
   IntersectionObserver with no animation dependency.

   Three things keep this safe rather than decorative:
   • `prefers-reduced-motion` short-circuits every component to
     its finished state, on the server render as well as the client
   • if IntersectionObserver is missing, content shows immediately
   • elements reveal once and then stop being observed
   ══════════════════════════════════════════════════════════════ */

/** True when the visitor has asked for reduced motion. */
function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Reveals `ref` once it scrolls into view.
 * Returns whether the element should be shown.
 */
function useInView(
  ref: React.RefObject<HTMLElement | null>,
  { threshold = 0.18, rootMargin = "0px 0px -8% 0px" } = {}
) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Reduced motion, or a browser without IO: show it and stop.
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    // Already on screen at mount (above the fold) — reveal without waiting.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      // A frame's delay lets the initial hidden state paint first, so the
      // transition actually runs instead of being skipped.
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, threshold, rootMargin]);

  return visible;
}

export type RevealVariant = "up" | "down" | "left" | "right" | "scale" | "blur" | "fade";

/**
 * Fades and slides its children in when they scroll into view.
 *
 *   <Reveal delay={120}>…</Reveal>
 *   <Reveal as="section" variant="blur">…</Reveal>
 */
export function Reveal({
  children,
  as = "div",
  variant = "up",
  /** milliseconds */
  delay = 0,
  className = "",
  style,
  threshold,
  ...rest
}: {
  children: ReactNode;
  as?: ElementType;
  variant?: RevealVariant;
  delay?: number;
  threshold?: number;
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "style"> & {
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  const visible = useInView(ref, threshold ? { threshold } : undefined);

  return createElement(
    as,
    {
      ref,
      className: `afi-reveal${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`,
      "data-variant": variant,
      style: { ...style, ["--afi-reveal-delay" as string]: `${delay}ms` },
      ...rest,
    },
    children
  );
}

/**
 * Animates a line of text in word by word, each word rising out of its own
 * mask. Used for section headings.
 *
 * Words are split on whitespace only — never per character — so screen
 * readers and text selection still get whole words.
 */
export function SplitText({
  text,
  as = "span",
  className = "",
  /** ms between consecutive words */
  stagger = 55,
  delay = 0,
  style,
  ...rest
}: {
  text: string;
  as?: ElementType;
  stagger?: number;
  delay?: number;
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "style"> & {
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  const visible = useInView(ref);

  const words = text.split(/(\s+)/);

  return createElement(
    as,
    {
      ref,
      className: `afi-split${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`,
      style,
      ...rest,
    },
    words.map((word, index) => {
      // Preserve the original whitespace runs verbatim.
      if (/^\s+$/.test(word)) return word;

      return (
        <span className="afi-split-word" key={`${word}-${index}`}>
          <span
            style={{
              ["--afi-split-delay" as string]: `${delay + (index / 2) * stagger}ms`,
            }}
          >
            {word}
          </span>
        </span>
      );
    })
  );
}

/**
 * Counts from zero up to `value` the first time it scrolls into view.
 * Falls straight to the final number under reduced motion.
 */
export function CountUp({
  value,
  duration = 1100,
  className = "",
  suffix = "",
}: {
  value: number;
  duration?: number;
  className?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { threshold: 0.4 });
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!visible) return;

    if (prefersReducedMotion() || !Number.isFinite(value)) {
      setShown(value);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // ease-out cubic, so it settles rather than stopping dead
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, value, duration]);

  return (
    <span ref={ref} className={`afi-count${className ? ` ${className}` : ""}`}>
      {shown.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}

/**
 * Wraps an inline SVG so its strokes draw themselves in on reveal.
 * `length` should comfortably exceed the longest path in the icon.
 */
export function DrawIcon({
  children,
  length = 140,
  className = "",
  style,
}: {
  children: ReactNode;
  length?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { threshold: 0.3 });

  return (
    <span
      ref={ref}
      className={`afi-icon-draw${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={{ ...style, display: "inline-flex", ["--afi-draw-len" as string]: length }}
    >
      {children}
    </span>
  );
}

/** Convenience arrow that nudges when its parent link/button is hovered. */
export function Arrow({ size = 14 }: { size?: number }) {
  return (
    <svg
      className="afi-arrow"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
