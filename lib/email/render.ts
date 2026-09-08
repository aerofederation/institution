import 'server-only'

/**
 * A small, typed HTML email renderer.
 *
 * Deliberately hand-rolled. `@react-email/*` is deprecated across the board,
 * and building the platform's transactional mail on an unmaintained dependency
 * tree is a poor trade for what it saves — email HTML is table-based 1998
 * markup with inline styles either way, and the surface needed here is a
 * layout, a few blocks and an escaper.
 *
 * Every template returns HTML *and* a hand-written plain-text alternative.
 * Auto-stripping tags produces text that reads like a broken web page; writing
 * the text version explicitly keeps it legible for text-only clients, screen
 * readers and spam filters that weigh the alternative part.
 */

const BRAND = {
  navy: '#0B1D36',
  navyDeep: '#071224',
  ink: '#1B2430',
  muted: '#5B6774',
  line: '#DCE3EB',
  surface: '#F5F7FA',
  gold: '#B8862F',
  white: '#FFFFFF',
} as const

/** Escapes text before it is interpolated into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Only http(s) URLs are allowed into a link or button.
 *
 * Template data reaches these helpers from application code, but a link target
 * is exactly the kind of value that quietly becomes user-influenced later.
 * Rejecting `javascript:` and `data:` here means that never turns into a
 * problem in someone's mail client.
 */
function safeUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Refusing to render a non-http(s) URL in an email: ${url}`)
  }
  return escapeHtml(url)
}

export const heading = (text: string) =>
  `<h1 style="margin:0 0 16px;font:600 22px/1.3 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.navy};">${escapeHtml(text)}</h1>`

export const paragraph = (text: string) =>
  `<p style="margin:0 0 16px;font:400 15px/1.65 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">${escapeHtml(text)}</p>`

export const muted = (text: string) =>
  `<p style="margin:0 0 12px;font:400 13px/1.6 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.muted};">${escapeHtml(text)}</p>`

export const button = (url: string, label: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
    <tr><td style="border-radius:6px;background:${BRAND.navy};">
      <a href="${safeUrl(url)}" style="display:inline-block;padding:13px 26px;border-radius:6px;font:600 15px/1 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.white};text-decoration:none;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`

export const panel = (rows: [label: string, value: string][]) => `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;border:1px solid ${BRAND.line};border-radius:8px;background:${BRAND.surface};">
    ${rows
      .map(
        ([label, value], index) => `
      <tr>
        <td style="padding:12px 16px;${index ? `border-top:1px solid ${BRAND.line};` : ''}font:600 12px/1.4 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.06em;width:42%;">${escapeHtml(label)}</td>
        <td style="padding:12px 16px;${index ? `border-top:1px solid ${BRAND.line};` : ''}font:400 14px/1.5 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">${escapeHtml(value)}</td>
      </tr>`,
      )
      .join('')}
  </table>`

export const bulletList = (items: string[]) => `
  <ul style="margin:0 0 20px;padding-left:20px;font:400 15px/1.7 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
    ${items.map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`).join('')}
  </ul>`

/** A code the recipient reads aloud or types, rendered for legibility. */
export const codeBlock = (code: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    <tr><td style="padding:14px 22px;border:1px solid ${BRAND.line};border-radius:8px;background:${BRAND.surface};font:600 26px/1.2 'SFMono-Regular',Consolas,'Liberation Mono',monospace;letter-spacing:.18em;color:${BRAND.navy};">${escapeHtml(code)}</td></tr>
  </table>`

export type EmailDocument = {
  subject: string
  html: string
  text: string
}

/**
 * Wraps body blocks in the AFI shell.
 *
 * `preheader` is the snippet a mail client shows next to the subject. It is
 * hidden in the body itself; without one, clients scrape whatever text comes
 * first, which is usually the header.
 */
export function layout(options: {
  title: string
  preheader: string
  body: string
  footerNote?: string
}): string {
  const { title, preheader, body, footerNote } = options

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.surface};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:${BRAND.white};border:1px solid ${BRAND.line};border-radius:12px;overflow:hidden;">

        <tr><td style="padding:22px 32px;background:${BRAND.navyDeep};">
          <div style="font:700 15px/1.2 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.white};letter-spacing:.02em;">Aero Federation of India</div>
          <div style="margin-top:5px;font:600 10px/1.2 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.gold};letter-spacing:.22em;text-transform:uppercase;">Digital Institution &amp; AI Education Platform</div>
        </td></tr>

        <tr><td style="padding:32px;">
          ${body}
        </td></tr>

        <tr><td style="padding:20px 32px;border-top:1px solid ${BRAND.line};background:${BRAND.surface};">
          ${footerNote ? `<p style="margin:0 0 10px;font:400 12px/1.6 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.muted};">${escapeHtml(footerNote)}</p>` : ''}
          <p style="margin:0;font:400 12px/1.6 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.muted};">
            This is an automated message from the Aero Federation of India platform. Please do not reply to this address.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/** Assembles the plain-text alternative with a consistent header and footer. */
export function textLayout(lines: (string | null | undefined)[]): string {
  return [
    'AERO FEDERATION OF INDIA',
    'Digital Institution & AI Education Platform',
    '',
    ...lines.filter((line): line is string => line !== null && line !== undefined),
    '',
    '--',
    'This is an automated message. Please do not reply to this address.',
  ].join('\n')
}
