import { Building2, GraduationCap, Radio, Users } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The federation, drawn.
 *
 * HQ at the centre, institutions orbiting it, teachers and students hanging off
 * the institutions — the hierarchy the whole platform is built around, with
 * live counts on it. Every number is passed in from a database count; nothing
 * here invents a figure, and a network with nothing in it says so rather than
 * drawing a decorative graph of imaginary nodes.
 *
 * Rendered as inline SVG plus CSS, so it costs no client JavaScript. The
 * animations are declared in `globals.css` and are disabled wholesale under
 * `prefers-reduced-motion`.
 */
export function EcosystemGraph({
  institutions,
  teachers,
  students,
  activeInstitutions,
  className,
}: {
  institutions: number
  teachers: number
  students: number
  activeInstitutions: number
  className?: string
}) {
  const empty = institutions === 0

  // Ring positions are fixed; only how many are lit reflects the data.
  const nodes = [
    { angle: -90, label: 'North' },
    { angle: -30, label: 'East' },
    { angle: 30, label: 'South-east' },
    { angle: 90, label: 'South' },
    { angle: 150, label: 'South-west' },
    { angle: -150, label: 'West' },
  ]
  const lit = Math.min(nodes.length, activeInstitutions)

  return (
    <div
      className={cn(
        'bg-card relative overflow-hidden rounded-lg border',
        className,
      )}
    >

      <div className="relative flex flex-col gap-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="afi-eyebrow">Federation topology</span>
            <h2 className="font-heading text-base font-semibold">Network at a glance</h2>
          </div>
          <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
            <Radio className="text-success size-3 shrink-0" aria-hidden="true" />
            Live
          </span>
        </div>

        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          {/* ── Orbital diagram ───────────────────────────────────────────── */}
          <div className="relative mx-auto aspect-square w-full max-w-[320px]">
            <svg
              viewBox="0 0 320 320"
              className="size-full"
              role="img"
              aria-label={`Federation topology: ${institutions} institutions, ${teachers} teachers, ${students} students`}
            >
              {/* Orbits */}
              {[70, 108, 146].map((radius, index) => (
                <circle
                  key={radius}
                  cx="160"
                  cy="160"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-border"
                  strokeDasharray={index === 1 ? '3 7' : undefined}
                  opacity={0.9 - index * 0.2}
                />
              ))}

              {/* Spokes from HQ to each institution node */}
              <g className={empty ? 'opacity-25' : ''}>
                {nodes.map((node, index) => {
                  const radians = (node.angle * Math.PI) / 180
                  const x = 160 + Math.cos(radians) * 108
                  const y = 160 + Math.sin(radians) * 108
                  const isLit = index < lit
                  return (
                    <line
                      key={node.angle}
                      x1="160"
                      y1="160"
                      x2={x}
                      y2={y}
                      stroke="currentColor"
                      strokeWidth="1"
                      className={isLit ? 'text-primary afi-trace' : 'text-border'}
                      opacity={isLit ? 0.7 : 0.4}
                    />
                  )
                })}
              </g>

              {/* Institution nodes */}
              {nodes.map((node, index) => {
                const radians = (node.angle * Math.PI) / 180
                const x = 160 + Math.cos(radians) * 108
                const y = 160 + Math.sin(radians) * 108
                const isLit = index < lit
                return (
                  <g key={`node-${node.angle}`}>
                    <circle
                      cx={x}
                      cy={y}
                      r={isLit ? 7 : 5}
                      className={isLit ? 'fill-primary' : 'fill-muted-foreground/25'}
                    />
                    {isLit ? (
                      <circle
                        cx={x}
                        cy={y}
                        r="12"
                        className="fill-primary/25 afi-pulse-node"
                        style={{ animationDelay: `${index * 0.4}s` }}
                      />
                    ) : null}
                  </g>
                )
              })}

              {/* HQ core */}
              <circle cx="160" cy="160" r="34" className="fill-primary/12 stroke-primary/40" />
              <circle cx="160" cy="160" r="22" className="fill-primary" />
              <text
                x="160"
                y="164"
                textAnchor="middle"
                className="fill-primary-foreground font-mono text-[10px] font-semibold tracking-wider"
              >
                HQ
              </text>
            </svg>
          </div>

          {/* ── Layer readout ─────────────────────────────────────────────── */}
          <ol className="flex flex-col gap-3">
            <Layer
              icon={Building2}
              label="Institutions"
              value={institutions}
              caption={
                institutions === 0
                  ? 'No institutions approved yet'
                  : `${activeInstitutions.toLocaleString('en-IN')} active in the network`
              }
              depth={0}
            />
            <Layer
              icon={Users}
              label="Teachers"
              value={teachers}
              caption={
                teachers === 0
                  ? 'Provisioned by institution administrators'
                  : 'Across all registered institutions'
              }
              depth={1}
            />
            <Layer
              icon={GraduationCap}
              label="Students"
              value={students}
              caption={
                students === 0
                  ? 'Enrolled once institutions onboard'
                  : 'Learning across the federation'
              }
              depth={1}
            />
          </ol>
        </div>

        {empty ? (
          <p className="text-muted-foreground border-t pt-4 text-sm">
            The network is empty. Approved institutions, and the teachers and students they
            provision, appear here as the federation grows.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function Layer({
  icon: Icon,
  label,
  value,
  caption,
  depth,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  label: string
  value: number
  caption: string
  depth: 0 | 1
}) {
  return (
    <li
      className={cn(
        'bg-background/60 flex items-center gap-4 rounded-md border p-4',
        depth === 1 && 'ml-0 sm:ml-6',
      )}
    >
      <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
        <Icon className="size-4" aria-hidden={true} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-muted-foreground text-xs tracking-wide uppercase">{label}</span>
        <span className="text-muted-foreground truncate text-xs">{caption}</span>
      </div>
      <span className="afi-metric text-2xl font-semibold">{value.toLocaleString('en-IN')}</span>
    </li>
  )
}
