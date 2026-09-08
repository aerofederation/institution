import { Container } from '@/components/public/sections'
import type { PlatformStats } from '@/services/public/network'
import { hasMeaningfulScale } from '@/services/public/network'

/**
 * The trust strip beneath the hero.
 *
 * Two presentations, chosen by what is actually in the database.
 *
 * Once the network has real scale, it shows real counts. Before that it shows a
 * qualitative treatment instead — because "1 institution, 0 students" as a
 * headline statistic is accurate and unhelpful, and inventing a bigger number
 * would be dishonest on the most public page the platform has. The brief is
 * explicit on this point, and the rule is enforced here rather than left to
 * whoever edits the page next.
 */
export function NetworkStrip({ stats }: { stats: PlatformStats }) {
  const showFigures = hasMeaningfulScale(stats)

  return (
    <div className="relative border-t border-white/10 bg-white/[0.02]">
      <Container>
        {showFigures ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 py-10 lg:grid-cols-4">
            {[
              { label: 'Institutions', value: stats.institutions },
              { label: 'Educators', value: stats.educators },
              { label: 'Students', value: stats.learners },
              { label: 'Programmes', value: stats.programs },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-1.5">
                <dd className="afi-metric text-3xl font-semibold text-white sm:text-4xl">
                  {item.value.toLocaleString('en-IN')}
                </dd>
                <dt className="font-mono text-[10px] tracking-[0.16em] text-white/45 uppercase">
                  {item.label}
                </dt>
              </div>
            ))}
          </dl>
        ) : (
          <div className="flex flex-col gap-6 py-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] tracking-[0.16em] text-white/45 uppercase">
                A growing network
              </span>
              <p className="max-w-2xl text-base text-white/70">
                AFI is admitting its founding institutions. Membership figures are published here
                once the network reaches a scale where they mean something — we would rather show
                you nothing than show you a number we invented.
              </p>
            </div>

            <ul className="flex flex-wrap gap-x-8 gap-y-3">
              {[
                'Verified membership',
                'Institution-level isolation',
                'AI-assisted learning',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-white/55">
                  <span className="bg-aero-400 size-1.5 rounded-full" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Container>
    </div>
  )
}
