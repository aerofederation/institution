// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PageHeader } from '@/components/shared/page-header'

/**
 * Guards the breadcrumb markup.
 *
 * `BreadcrumbItem` and `BreadcrumbSeparator` both render an `<li>`. Nesting one
 * inside the other produces `<li><li>`, which is invalid HTML — the browser
 * silently repairs it during parsing, so the client tree stops matching the
 * server tree and React reports a hydration error on every HQ page with a
 * breadcrumb.
 *
 * It typechecks, lints and builds cleanly, and the only symptom is a runtime
 * console error. So the nesting is asserted directly.
 */

afterEach(cleanup)

describe('PageHeader breadcrumbs', () => {
  const crumbs = [
    { label: 'HQ', href: '/hq' },
    { label: 'Institutions', href: '/hq/institutions' },
    { label: 'Delhi Institute of Aeronautics' },
  ]

  it('never nests one list item inside another', () => {
    const { container } = render(
      <PageHeader title="Delhi Institute of Aeronautics" breadcrumbs={crumbs} />,
    )

    const nested = container.querySelectorAll('li li')
    expect(
      nested.length,
      'a <li> is nested inside another <li> — this is invalid HTML and causes a hydration error',
    ).toBe(0)
  })

  it('puts every item and separator directly under the list', () => {
    const { container } = render(<PageHeader title="Detail" breadcrumbs={crumbs} />)

    const list = container.querySelector('ol')
    expect(list).not.toBeNull()

    // Three crumbs → three items and two separators, all siblings.
    const children = [...list!.children]
    expect(children).toHaveLength(5)
    expect(children.every((child) => child.tagName === 'LI')).toBe(true)
  })

  it('places a separator between items and never after the last', () => {
    const { container } = render(<PageHeader title="Detail" breadcrumbs={crumbs} />)

    const children = [...container.querySelector('ol')!.children]
    const isSeparator = (element: Element) =>
      element.getAttribute('data-slot') === 'breadcrumb-separator'

    expect(children.map(isSeparator)).toEqual([false, true, false, true, false])
  })

  it('separates a middle crumb that has no link', () => {
    // Separators are keyed off position, not off whether a crumb is a link —
    // an unlinked middle crumb used to lose its separator entirely.
    const { container } = render(
      <PageHeader
        title="Detail"
        breadcrumbs={[
          { label: 'HQ', href: '/hq' },
          { label: 'Archived' },
          { label: 'Record' },
        ]}
      />,
    )

    const separators = container.querySelectorAll('[data-slot="breadcrumb-separator"]')
    expect(separators).toHaveLength(2)
  })

  it('marks the final crumb as the current page', () => {
    const { container } = render(<PageHeader title="Detail" breadcrumbs={crumbs} />)

    const current = container.querySelector('[data-slot="breadcrumb-page"]')
    expect(current?.textContent).toBe('Delhi Institute of Aeronautics')
    // Radix marks it aria-current="page"; assert the accessible signal exists.
    expect(current?.getAttribute('aria-current')).toBe('page')
  })

  it('renders exactly one h1 and no breadcrumb list when none is given', () => {
    const { container } = render(<PageHeader title="Overview" />)

    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(container.querySelector('ol')).toBeNull()
  })
})
