import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ArrowLeft, Building2, Calendar, Globe, MapPin } from 'lucide-react'

import { Container, PublicSection, SectionHeading } from '@/components/public/sections'
import { Button } from '@/components/ui/button'
import { humaniseEnum } from '@/lib/constants/enums'
import { getPublicInstitution } from '@/services/public/network'

export async function generateMetadata({
  params,
}: PageProps<'/institutions/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const institution = await getPublicInstitution(slug)

  if (!institution) {
    return { title: 'Institution not found', robots: { index: false, follow: false } }
  }

  const location = [institution.city, institution.state].filter(Boolean).join(', ')
  const description =
    institution.description?.slice(0, 200) ??
    `${institution.name} — ${humaniseEnum(institution.institution_type)}${location ? ` in ${location}` : ''}, a member of the Aero Federation of India network.`

  return {
    title: institution.name,
    description,
    alternates: { canonical: `/institutions/${slug}` },
    openGraph: { url: `/institutions/${slug}`, title: institution.name, description },
  }
}

/**
 * Public institution profile.
 *
 * Reads through `public_institution_by_slug()`, which returns rows only for
 * ACTIVE institutions. A pending, suspended or unknown slug therefore produces
 * the same 404 — the page cannot be used to discover which institutions have
 * applied or been suspended.
 */
export default async function InstitutionProfilePage({
  params,
}: PageProps<'/institutions/[slug]'>) {
  const { slug } = await params
  const institution = await getPublicInstitution(slug)

  if (!institution) notFound()

  const location = [institution.city, institution.state, institution.country]
    .filter(Boolean)
    .join(', ')

  return (
    <PublicSection label={institution.name} className="pt-12 sm:pt-16">
      <Container>
        <Button asChild variant="ghost" size="sm" className="mb-8 -ml-3">
          <Link href="/institutions">
            <ArrowLeft className="size-4" aria-hidden="true" />
            All institutions
          </Link>
        </Button>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="size-8" aria-hidden="true" />
          </span>

          <div className="flex min-w-0 flex-col gap-3">
            <SectionHeading
              eyebrow={humaniseEnum(institution.institution_type)}
              title={institution.name}
              as="h1"
            />

            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {location ? (
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Location</dt>
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  <dd>{location}</dd>
                </div>
              ) : null}
              {institution.year_established ? (
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Established</dt>
                  <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
                  <dd>Established {institution.year_established}</dd>
                </div>
              ) : null}
              {institution.website ? (
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Website</dt>
                  <Globe className="size-3.5 shrink-0" aria-hidden="true" />
                  <dd>
                    <a
                      href={institution.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Visit website
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            {institution.description ? (
              <>
                <h2 className="font-heading text-lg font-semibold">About the institution</h2>
                <p className="leading-relaxed text-muted-foreground">{institution.description}</p>
              </>
            ) : (
              <p className="text-muted-foreground">
                This institution has not yet published a public description.
              </p>
            )}
          </div>

          <aside className="flex h-fit flex-col gap-4 rounded-lg border bg-card p-6">
            <h2 className="font-heading text-sm font-semibold">Membership</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs tracking-wide text-muted-foreground uppercase">Type</dt>
                <dd>{humaniseEnum(institution.institution_type)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs tracking-wide text-muted-foreground uppercase">Category</dt>
                <dd>{humaniseEnum(institution.category)}</dd>
              </div>
              {institution.field_of_work ? (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                    Field of work
                  </dt>
                  <dd>{institution.field_of_work}</dd>
                </div>
              ) : null}
              {institution.approved_at ? (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                    Joined AFI
                  </dt>
                  <dd>
                    {new Date(institution.approved_at).toLocaleDateString('en-IN', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </dd>
                </div>
              ) : null}
            </dl>
          </aside>
        </div>
      </Container>
    </PublicSection>
  )
}
