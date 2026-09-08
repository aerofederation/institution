/**
 * The hero composition.
 *
 * A custom SVG rather than stock imagery: an orbital network with AFI at the
 * centre and institution nodes on the rings, crossed by an ascent trajectory.
 * It says "network" and "flight" in one figure, which is exactly what the
 * federation is.
 *
 * Rendered as inline SVG on the server — no client JavaScript, no image
 * request, sharp at any size. Motion comes from CSS classes declared in
 * `globals.css`, all of which are disabled under `prefers-reduced-motion`.
 */
export function HeroVisual() {
  // Fixed positions, deliberately irregular so the ring does not read as a
  // clock face.
  const nodes = [
    { angle: -105, radius: 118, size: 5 },
    { angle: -35, radius: 168, size: 7 },
    { angle: 28, radius: 118, size: 5 },
    { angle: 74, radius: 210, size: 6 },
    { angle: 140, radius: 168, size: 7 },
    { angle: 196, radius: 118, size: 4 },
    { angle: 236, radius: 210, size: 5 },
  ]

  const point = (angle: number, radius: number) => {
    const radians = (angle * Math.PI) / 180
    return { x: 250 + Math.cos(radians) * radius, y: 250 + Math.sin(radians) * radius }
  }

  return (
    <div className="relative aspect-square w-full max-w-[560px]">
      <svg
        viewBox="0 0 500 500"
        className="size-full text-white"
        role="img"
        aria-label="An orbital network diagram: the Aero Federation of India at the centre, connected to institution nodes on surrounding orbits, with an ascent trajectory rising through them."
      >
        <defs>
          <radialGradient id="afi-hero-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--color-aero-300)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--color-aero-600)" stopOpacity="0.15" />
          </radialGradient>
          <linearGradient id="afi-hero-trace" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-amber-accent)" stopOpacity="0" />
            <stop offset="55%" stopColor="var(--color-amber-accent)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--color-amber-accent)" stopOpacity="0" />
          </linearGradient>
          <clipPath id="afi-hero-logo-clip">
            <circle cx="250" cy="250" r="42" />
          </clipPath>
        </defs>

        {/* Orbits */}
        {[118, 168, 210, 244].map((radius, index) => (
          <circle
            key={radius}
            cx="250"
            cy="250"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.75"
            strokeDasharray={index % 2 ? '3 9' : undefined}
            opacity={0.3 - index * 0.045}
          />
        ))}

        {/* Spokes */}
        <g opacity="0.22">
          {nodes.map((node) => {
            const { x, y } = point(node.angle, node.radius)
            return (
              <line
                key={`spoke-${node.angle}`}
                x1="250"
                y1="250"
                x2={x}
                y2={y}
                stroke="currentColor"
                strokeWidth="0.75"
              />
            )
          })}
        </g>

        {/* Institution nodes */}
        {nodes.map((node, index) => {
          const { x, y } = point(node.angle, node.radius)
          return (
            <g key={`node-${node.angle}`}>
              <circle
                cx={x}
                cy={y}
                r={node.size * 2.4}
                fill="var(--color-aero-400)"
                opacity="0.16"
                className="afi-pulse-node"
                style={{ animationDelay: `${index * 0.45}s` }}
              />
              <circle cx={x} cy={y} r={node.size} fill="currentColor" opacity="0.85" />
            </g>
          )
        })}

        {/* Ascent trajectory */}
        <path
          d="M40 452 C 170 430, 268 344, 322 214 C 348 152, 400 96, 462 60"
          fill="none"
          stroke="url(#afi-hero-trace)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M40 452 C 170 430, 268 344, 322 214 C 348 152, 400 96, 462 60"
          fill="none"
          stroke="var(--color-amber-accent)"
          strokeWidth="1"
          strokeLinecap="round"
          className="afi-trace"
          opacity="0.65"
        />

        {/* Delta wing at the head of the trajectory */}
        <g transform="translate(462 60) rotate(-38)">
          <path d="M0 -11 L8 9 L0 4 L-8 9 Z" fill="var(--color-amber-accent)" />
        </g>

        {/* Core */}
        <circle cx="250" cy="250" r="86" fill="url(#afi-hero-core)" />
        <circle
          cx="250"
          cy="250"
          r="56"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.4"
        />

        {/* Center circle with Aero Federation emblem */}
        <circle cx="250" cy="250" r="47" fill="var(--color-aero-500)" />
        <circle cx="250" cy="250" r="42" fill="#ffffff" />
        <image
          href="/logo-emblem.png"
          x="208"
          y="208"
          width="84"
          height="84"
          clipPath="url(#afi-hero-logo-clip)"
          preserveAspectRatio="xMidYMid meet"
          aria-label="Aero Federation of India emblem"
        />
      </svg>
    </div>
  )
}
