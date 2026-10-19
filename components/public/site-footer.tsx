import Link from "next/link";

import Wordmark from "@/components/Wordmark";
import { Reveal } from "@/components/motion";

/* ══════════════════════════════════════════════════════════════
   SITE FOOTER
   ──────────────────────────────────────────────────────────────
   Two halves:

   1. the institution platform's own footer — registration, sign-in
      and the public pages that exist in this app, plus support details.
      The career portal is a separate site; its candidate and partner
      links do not belong here and led only to 404s when they were.
   2. the federation-wide footer carried over from the main site
      (aerofederation.org), so both sites end the same way

   Every link, address and identifier below is one the federation
   already publishes. Nothing here is invented to fill a column.
   ══════════════════════════════════════════════════════════════ */

/**
 * The main site's origin. Its own footer links are relative; here they have to
 * be absolute. If the new main site is deployed to a different host, this is
 * the only line that needs changing.
 */
const MAIN = "https://www.aerofederation.org";

const ORG = {
  legalName: "Aero Emerging Research & Ontology Federation of India",
  /*
   * Platform copy rather than the organisation's published tagline, which names
   * aerospace, aeronautics and space. This platform is open to every department
   * a member institution teaches, and that line would read as a limit.
   */
  tagline:
    "One digital ecosystem for member institutions — academic structure, teaching, assessment and AI-assisted learning, across every department they teach.",
  darpanId: "DL/2025/0759007",
  established: 2024,
  support: "support@aerofederation.org",
  airlab: "airlab@aerofederation.org",
  hq: {
    label: "Bengaluru — Headquarters (CMS)",
    address:
      "#10, 1st Floor, 1st Cross, New Manjunatha Layout, Sacred Hearts Main Road, T C Palya, near Patakki Godown, Bengaluru (North) 560036, Krishnarajapuram, Karnataka, India",
  },
};

const SOCIAL = [
  { label: "Instagram", href: "https://www.instagram.com/aerofederation" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/aerofederation/" },
  { label: "YouTube", href: "https://www.youtube.com/@aerofederation" },
  { label: "X", href: "https://x.com/aerofederation" },
  { label: "Facebook", href: "https://www.facebook.com/aerofederation" },
];

/** A spec with no `href` is a category not yet published — rendered as plain text. */
type FooterLinkSpec = { href?: string; label: string; external?: boolean };
type FooterColumn = { heading: string; links: FooterLinkSpec[] };

/* ── This platform's own sections ─────────────────────────── */
/*
 * Every internal href below is a route in this application — app/(public),
 * /apply, /application-status, /login. Nothing points at the career portal.
 */
const PORTAL_COLUMNS: FooterColumn[] = [
  {
    heading: "For institutions",
    links: [
      { href: "/apply", label: "Register your institution" },
      { href: "/application-status", label: "Track your application" },
      { href: "/institutions", label: "Institution network" },
      { href: "/login", label: "Administrator sign in" },
    ],
  },
  {
    heading: "For educators & students",
    links: [
      { href: "/login", label: "Portal sign in" },
      { href: "/education", label: "What institutions teach" },
      { href: "/ai-classroom", label: "AI Classroom" },
    ],
  },
  {
    heading: "This platform",
    links: [
      { href: "/about", label: "About the federation" },
      { href: "/announcements", label: "Announcements" },
      { href: "/events", label: "Events" },
      { href: "/contact", label: "Contact" },
      {
        href: "https://verify.aerofederation.org",
        label: "Verify a credential",
        external: true,
      },
    ],
  },
  {
    heading: "Queries & Support",
    links: [
      { href: `mailto:${ORG.support}`, label: ORG.support },
      { href: `mailto:${ORG.airlab}`, label: ORG.airlab },
      { href: MAIN, label: "aerofederation.org", external: true },
    ],
  },
];

/* ── The federation-wide footer from the main site ────────── */
/* Declared in any order; FEDERATION_COLUMNS sorts the columns, and the links
   inside each one, alphabetically — as the main site does. */
const FEDERATION: FooterColumn[] = [
  {
    heading: "Careers",
    links: [
      {
        href: "https://careers.aerofederation.org",
        label: "Careers Portal",
        external: true,
      },
      { href: `${MAIN}/academia/atom`, label: "ATOM Programme" },
      {
        href: `${MAIN}/copy-of-registrations`,
        label: "Apply",
        external: true,
      },
    ],
  },
  {
    heading: "Downloads",
    links: [{ label: "Android" }, { label: "iOS" }, { label: "macOS" }, { label: "Windows" }],
  },
  {
    heading: "Exclusive",
    links: [{ label: "Arcade" }, { label: "Celestial" }, { label: "e-Library" }],
  },
  {
    heading: "Academia",
    links: [
      { href: `${MAIN}/academia#programs`, label: "Training Programs" },
      { href: `${MAIN}/academia/atom`, label: "ATOM" },
      { href: `${MAIN}/academia#scholarships`, label: "Scholarships" },
      { href: `${MAIN}/students#resources`, label: "Learning Resources" },
    ],
  },
  {
    heading: "Assessments",
    links: [
      { href: `${MAIN}/assessments`, label: "Overview" },
      { href: `${MAIN}/academia`, label: "NSQF & NCVET Alignment" },
      {
        href: "https://verify.aerofederation.org",
        label: "Verify a Credential",
        external: true,
      },
    ],
  },
  {
    heading: "Events",
    links: [
      { href: `${MAIN}/initiatives#events`, label: "All Events" },
      {
        href: `${MAIN}/initiatives/aeromanthan`,
        label: "Aeromanthan Bharat 2026",
      },
      { href: `${MAIN}/aeroscope`, label: "Aeroscope" },
    ],
  },
  {
    heading: "Gallery",
    links: [
      { href: `${MAIN}/gallery#3d-sphere`, label: "3D Sphere" },
      { href: `${MAIN}/gallery#events`, label: "Events" },
      { href: `${MAIN}/gallery#airshows`, label: "Airshows" },
      { href: `${MAIN}/gallery#aircraft`, label: "Aircraft" },
      { href: `${MAIN}/gallery#pilots`, label: "Pilots" },
    ],
  },
  {
    heading: "Media",
    links: [
      { href: `${MAIN}/aeroscope`, label: "Blog" },
      { href: `${MAIN}/aeroscope`, label: "Latest News" },
      { href: `${MAIN}/press-releases`, label: "Press Release" },
    ],
  },
  {
    heading: "Memberships",
    links: [
      { href: `${MAIN}/membership`, label: "All Tiers" },
      { href: `${MAIN}/membership#membership`, label: "Individual" },
      { href: `${MAIN}/membership#membership`, label: "Organisation" },
      { href: `${MAIN}/registrations`, label: "Join AFI", external: true },
    ],
  },
  {
    heading: "Organisation",
    links: [
      { href: `${MAIN}/aeroscope`, label: "Aeroscope" },
      { href: `${MAIN}/contact`, label: "Contact" },
      { href: `${MAIN}/contact#locations`, label: "Locations" },
    ],
  },
  {
    heading: "Our Team",
    links: [
      { href: `${MAIN}/team`, label: "Overview" },
      { href: `${MAIN}/research`, label: "Researchers" },
    ],
  },
  {
    heading: "Participate",
    links: [
      { href: `${MAIN}/students`, label: "Students" },
      {
        href: `${MAIN}/initiatives/aeromanthan`,
        label: "Aeromanthan Bharat 2026",
      },
      { href: `${MAIN}/support`, label: "Support Us" },
    ],
  },
  {
    heading: "Research",
    links: [
      { href: `${MAIN}/research`, label: "R&D Domains" },
      { href: `${MAIN}/research#model`, label: "Collaboration" },
      { href: `${MAIN}/research/publications#whitepapers`, label: "Whitepapers" },
      {
        href: `${MAIN}/research/publications#case-studies`,
        label: "Case Studies",
      },
      {
        href: "https://journal.aerofederation.org",
        label: "Publications",
        external: true,
      },
    ],
  },
  {
    heading: "Verifications",
    links: [
      {
        href: "https://verify.aerofederation.org",
        label: "Verification Portal",
        external: true,
      },
      { href: `${MAIN}/contact`, label: "DARPAN Registration" },
    ],
  },
];

const byName = (a: string, b: string) =>
  a.localeCompare(b, "en", { sensitivity: "base" });

const FEDERATION_COLUMNS: FooterColumn[] = FEDERATION.map((column) => ({
  ...column,
  links: [...column.links].sort((a, b) => byName(a.label, b.label)),
})).sort((a, b) => byName(a.heading, b.heading));

const POLICIES = [
  { href: `${MAIN}/terms-and-conditions`, label: "Terms & Conditions" },
  { href: `${MAIN}/privacy-policy`, label: "Privacy Policy" },
  { href: `${MAIN}/accessibility-statement`, label: "Accessibility Statement" },
  { href: `${MAIN}/cancellation-and-refund`, label: "Cancellation and Refund" },
  { href: `${MAIN}/shipping-and-exchange`, label: "Shipping and Exchange" },
];

const ASSURANCES = [
  { label: "Encrypted document submission", icon: "shield" },
  { label: "Session-bound access control", icon: "lock" },
  { label: "HQ-verified institution network", icon: "check" },
  { label: "Institution application tracking", icon: "activity" },
];

const ICONS: Record<string, string> = {
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  check: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
};

/** Internal paths use Link; anything off-site (or mailto) uses a plain anchor. */
function FooterLink({ href, label, external }: FooterLinkSpec) {
  if (!href) {
    return (
      <span className="inline-block text-[14px] leading-[1.4] text-[#b9cddd]">
        {label}
      </span>
    );
  }

  const offSite = external || /^(https?:|mailto:)/.test(href);

  if (!offSite) {
    return (
      <Link
        href={href}
        className="afi-footer-link inline-block text-[14px] leading-[1.4]"
      >
        {label}
      </Link>
    );
  }

  if (href.startsWith("mailto:")) {
    return (
      <a
        href={href}
        className="afi-footer-link inline-block text-[14px] leading-[1.4]"
      >
        {label}
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="afi-footer-link inline-flex items-center gap-1 text-[14px] leading-[1.4]"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="text-xs text-white/40">
        ↗
      </span>
    </a>
  );
}

function FooterColumns({
  columns,
  label,
  gridColsClass = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
}: {
  columns: FooterColumn[];
  label: string;
  gridColsClass?: string;
}) {
  return (
    <nav className={`afi-footer-grid grid gap-8 ${gridColsClass}`} aria-label={label}>
      {columns.map((column) => (
        <div className="afi-footer-col flex flex-col gap-3" key={column.heading}>
          <h4 className="font-mono text-xs font-bold tracking-[0.16em] uppercase text-[#ff671f] mb-1">
            {column.heading}
          </h4>
          <ul className="flex flex-col gap-2.5">
            {column.links.map((link) => (
              <li key={`${column.heading}-${link.label}`}>
                <FooterLink {...link} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="afi-footer bg-[#032541] text-white border-t border-white/10">
      <div className="afi-footer-inner mx-auto w-full max-w-7xl px-6 py-14 lg:px-8 lg:py-18 flex flex-col gap-10">
        {/* ── Brand + social ───────────────────────────────── */}
        <Reveal className="afi-footer-top flex flex-col gap-8 pb-10 border-b border-white/10 lg:flex-row lg:items-start lg:justify-between" variant="fade">
          <div className="afi-footer-brand flex max-w-xl flex-col gap-4">
            <div className="afi-footer-brandrow afi-nav-logo flex items-center gap-3">
              <img
                src="/logo.png"
                alt="Aero Federation of India"
                className="h-11 w-11 shrink-0 rounded-full object-contain"
                aria-hidden="true"
              />
              <Wordmark tone="light" />
            </div>
            <p className="afi-footer-tagline text-sm leading-relaxed text-[#b4cbe0]">
              {ORG.tagline}
            </p>
          </div>

          <div className="afi-footer-social flex flex-wrap items-center gap-2">
            {SOCIAL.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="afi-footer-social-pill inline-flex rounded-full border border-white/20 px-3.5 py-1.5 text-xs text-[#dceaf5] transition-colors hover:border-white/50 hover:bg-white/10"
              >
                {item.label}
              </a>
            ))}
          </div>
        </Reveal>

        {/* ── This platform ────────────────────────────────── */}
        <Reveal as="section" className="afi-footer-section flex flex-col gap-6" delay={60}>
          <h2 className="afi-footer-section-h font-mono text-xs font-bold tracking-[0.2em] uppercase text-white">
            INSTITUTION PLATFORM
          </h2>
          <FooterColumns
            columns={PORTAL_COLUMNS}
            label="Institution platform"
            gridColsClass="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
          />

          {/* Assurances row matching Image 1 */}
          <div className="afi-footer-badges flex flex-wrap items-center gap-x-8 gap-y-3 pt-8 mt-2 border-t border-white/10 text-xs text-[#8eaec9]">
            {ASSURANCES.map((item) => (
              <span
                className="afi-footer-badge inline-flex items-center gap-2"
                key={item.label}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                  className="shrink-0 text-[#8eaec9]"
                >
                  <path d={ICONS[item.icon]} />
                </svg>
                <span>{item.label}</span>
              </span>
            ))}
          </div>
        </Reveal>

        {/* ── The federation ───────────────────────────────── */}
        <Reveal as="section" className="afi-footer-section flex flex-col gap-6 pt-10 border-t border-white/10" delay={90}>
          <h2 className="afi-footer-section-h font-mono text-xs font-bold tracking-[0.2em] uppercase text-white">
            AERO FEDERATION OF INDIA
          </h2>
          <FooterColumns
            columns={FEDERATION_COLUMNS}
            label="Federation"
            gridColsClass="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-x-6 gap-y-10"
          />
        </Reveal>

        {/* ── Registered office & Support ─────────────────── */}
        <Reveal className="afi-footer-hq flex flex-col gap-6 pt-8 border-t border-white/10 lg:flex-row lg:items-start lg:justify-between" delay={60}>
          <div className="flex flex-col gap-1.5 max-w-2xl">
            <h4 className="font-semibold text-sm text-white mb-1">
              {ORG.hq.label}
            </h4>
            <p className="text-xs leading-relaxed text-[#8ba5be]">
              {ORG.hq.address}
            </p>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <h5 className="font-mono text-xs font-bold tracking-[0.16em] uppercase text-[#ff671f]">
              For Any Queries, Support or Help
            </h5>
            <div className="flex flex-col sm:flex-row lg:flex-col gap-2 text-sm">
              <a
                href={`mailto:${ORG.support}`}
                className="inline-flex items-center gap-2 text-[#c8dbe9] hover:text-white transition-colors"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-[#ff671f] shrink-0"
                  aria-hidden="true"
                >
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <span>{ORG.support}</span>
              </a>
              <a
                href={`mailto:${ORG.airlab}`}
                className="inline-flex items-center gap-2 text-[#c8dbe9] hover:text-white transition-colors"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-[#ff671f] shrink-0"
                  aria-hidden="true"
                >
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <span>{ORG.airlab}</span>
              </a>
            </div>
          </div>
        </Reveal>

        {/* ── Policies ─────────────────────────────────────── */}
        <div className="afi-footer-policies flex flex-wrap items-center gap-6 pt-6 border-t border-white/10 text-xs text-[#8ba5be]">
          {POLICIES.map((policy) => (
            <a
              key={policy.label}
              href={policy.href}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white"
            >
              {policy.label}
            </a>
          ))}
        </div>

        {/* ── Legal ────────────────────────────────────────── */}
        <div className="afi-footer-legal flex flex-col gap-3 text-[11px] font-mono tracking-wider text-[#6384a3] uppercase sm:flex-row sm:items-center sm:justify-between pt-2">
          <span>
            NITI AAYOG, GOVERNMENT OF INDIA REGISTERED DARPAN ID : {ORG.darpanId}
          </span>
          <span>
            © {ORG.established}–{year} {ORG.legalName.toUpperCase()}. ALL RIGHTS RESERVED.
          </span>
        </div>
      </div>
    </footer>
  );
}

export { SiteFooter };
