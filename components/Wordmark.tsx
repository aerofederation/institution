/* ══════════════════════════════════════════════════════════════
   WORDMARK
   ──────────────────────────────────────────────────────────────
   The federation's bilingual lockup, exactly as it appears on
   aerofederation.org: the Hindi name above the English one, set
   at twice its size, with the English line uppercase and tracked.

   Defined once so the header, auth screens, pricing bar and
   footer can never drift apart.
   ══════════════════════════════════════════════════════════════ */

/** भारतीय एयरो फेडरेशन — the registered Hindi name. */
const HINDI = "भारतीय एयरो फेडरेशन";
const ENGLISH = "AERO FEDERATION OF INDIA";

export default function Wordmark({
  tone = "dark",
  /** Optional second line replacing the English name, e.g. a console label. */
  english = ENGLISH,
  size = 9.5,
}: {
  tone?: "dark" | "light";
  english?: string;
  size?: number;
}) {
  return (
    <span
      className="afi-lockup inline-flex flex-col gap-[2px] leading-none"
      style={{ "--afi-en-size": `${size}px` } as React.CSSProperties}
    >
      {/* lang marks the script for screen readers and font selection */}
      <span
        className={`afi-lockup-hi ${
          tone === "light" ? "text-white" : "text-navy-900"
        }`}
        lang="hi"
      >
        {HINDI}
      </span>
      <span
        className={`afi-lockup-en ${
          tone === "light" ? "text-[#8fb0c7]" : "text-muted-foreground"
        }`}
      >
        {english.toUpperCase()}
      </span>
    </span>
  );
}
