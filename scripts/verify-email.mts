/**
 * Nodemailer transport verification.
 *
 *     npm run verify:email
 *
 * Opens a connection to the configured SMTP server and completes the handshake
 * and authentication. It does NOT send a message.
 *
 * That distinction is deliberate: a verification script that emails somebody is
 * a verification script that can be pointed at an arbitrary address. `verify()`
 * proves the credentials, host, port and TLS mode are correct, which is the
 * whole question here. Template rendering is already covered by
 * `tests/unit/email.test.ts` without a network.
 *
 * If SMTP is not configured, this reports NOT CONFIGURED and exits 0 — an
 * unconfigured optional service is not a failure. A configured but broken one
 * exits 1.
 *
 * No credential is printed. The username is reduced to a shape and the password
 * is never read outside the transport itself.
 */

import './load-env.mts'
import { describeTransport, resetTransporter, verifyTransport } from '../lib/email/transporter'

const description = describeTransport()

if (!description.configured) {
  console.log('\nNodemailer: NOT CONFIGURED\n')
  console.log('  Missing:', description.missing?.join(', ') || 'SMTP environment variables')
  console.log('\n  Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD,')
  console.log('  SMTP_FROM and SMTP_FROM_NAME in .env.local, then re-run.\n')
  process.exit(0)
}

console.log('\nNodemailer configuration (credentials masked):')
console.log(`  host        ${description.host}`)
console.log(`  port        ${description.port}`)
console.log(`  secure      ${description.secure}`)
console.log(`  user        ${description.user}`)
console.log(`  from        ${description.from}`)

console.log('\nOpening the SMTP connection (no message will be sent)…')

const result = await verifyTransport()
resetTransporter()

if (result.ok) {
  console.log('\nNodemailer: VERIFIED — connection and authentication succeeded.\n')
  process.exit(0)
}

console.error(`\nNodemailer: FAILED — ${result.reason}\n`)
console.error('  Common causes: wrong port for the TLS mode (465 implicit, 587 STARTTLS),')
console.error('  an app-specific password required, or the host blocking this network.\n')
process.exit(1)
