import 'server-only'

import {
  bulletList,
  button,
  codeBlock,
  heading,
  layout,
  muted,
  panel,
  paragraph,
  textLayout,
  type EmailDocument,
} from '../render'

/**
 * The transactional templates the foundation needs.
 *
 * Phase 2 covers account lifecycle and the institution application
 * acknowledgements — the messages the authentication and onboarding flows
 * cannot work without. Assignment, exam, result and certificate notifications
 * arrive with the features that send them, rather than being written now
 * against workflows that do not exist.
 *
 * No template ever carries a password. Activation and reset both send a
 * single-use, expiring link; the recipient chooses the secret and the platform
 * never knows it.
 */

const APP = 'Aero Federation of India'

export type TemplateName =
  | 'account_activation'
  | 'password_reset'
  | 'password_changed'
  | 'application_received'
  | 'application_status_changed'
  | 'application_tracking_code'

export function accountActivation(data: {
  fullName: string
  roleLabel: string
  institutionName: string
  activationUrl: string
  expiresInHours: number
}): EmailDocument {
  const subject = `Activate your ${APP} account`

  return {
    subject,
    html: layout({
      title: subject,
      preheader: `Set your password and sign in to ${data.institutionName}.`,
      body: [
        heading(`Welcome, ${data.fullName}`),
        paragraph(
          `An account has been created for you at ${data.institutionName} on the ${APP} platform as ${data.roleLabel}.`,
        ),
        paragraph('Choose a password to activate it. The link below works once.'),
        button(data.activationUrl, 'Set your password'),
        muted(
          `This link expires in ${data.expiresInHours} hours. If it has expired, ask your institution administrator to send a new invitation.`,
        ),
        muted(
          'If you were not expecting this, you can ignore this message — the account cannot be used until a password is set.',
        ),
      ].join('\n'),
    }),
    text: textLayout([
      `Welcome, ${data.fullName}`,
      '',
      `An account has been created for you at ${data.institutionName} as ${data.roleLabel}.`,
      'Open the link below to choose a password and activate it. The link works once.',
      '',
      data.activationUrl,
      '',
      `This link expires in ${data.expiresInHours} hours.`,
      'If you were not expecting this, you can ignore this message.',
    ]),
  }
}

export function passwordReset(data: {
  fullName: string
  resetUrl: string
  expiresInMinutes: number
}): EmailDocument {
  const subject = `Reset your ${APP} password`

  return {
    subject,
    html: layout({
      title: subject,
      preheader: 'A password reset was requested for your account.',
      body: [
        heading('Reset your password'),
        paragraph(`Hello ${data.fullName}, a password reset was requested for your account.`),
        button(data.resetUrl, 'Choose a new password'),
        muted(`This link expires in ${data.expiresInMinutes} minutes and can be used once.`),
        muted(
          'If you did not request this, no action is needed — your current password still works and nothing has changed.',
        ),
      ].join('\n'),
    }),
    text: textLayout([
      'Reset your password',
      '',
      `Hello ${data.fullName}, a password reset was requested for your account.`,
      '',
      data.resetUrl,
      '',
      `This link expires in ${data.expiresInMinutes} minutes and can be used once.`,
      'If you did not request this, no action is needed.',
    ]),
  }
}

export function passwordChanged(data: { fullName: string; when: string }): EmailDocument {
  const subject = `Your ${APP} password was changed`

  return {
    subject,
    html: layout({
      title: subject,
      preheader: 'Confirmation of a password change on your account.',
      body: [
        heading('Your password was changed'),
        paragraph(`Hello ${data.fullName}, the password on your account was changed on ${data.when}.`),
        paragraph(
          'If this was you, nothing further is needed. If it was not, contact your institution administrator immediately.',
        ),
      ].join('\n'),
    }),
    text: textLayout([
      'Your password was changed',
      '',
      `Hello ${data.fullName}, the password on your account was changed on ${data.when}.`,
      'If this was not you, contact your institution administrator immediately.',
    ]),
  }
}

export function applicationReceived(data: {
  institutionName: string
  applicationRef: string
  submittedAt: string
  trackingUrl: string
}): EmailDocument {
  const subject = `Application received — ${data.applicationRef}`

  return {
    subject,
    html: layout({
      title: subject,
      preheader: `We have received the application for ${data.institutionName}.`,
      body: [
        heading('Application received'),
        paragraph(
          `Thank you. The application for ${data.institutionName} has been received and is queued for review by AEROFEDERATION HEAD QUARTERS.`,
        ),
        panel([
          ['Reference', data.applicationRef],
          ['Institution', data.institutionName],
          ['Submitted', data.submittedAt],
          ['Status', 'Submitted'],
        ]),
        paragraph('You can check progress at any time using the reference above.'),
        button(data.trackingUrl, 'Track this application'),
        muted(
          'Tracking asks for this reference together with the email address on the application, then sends a one-time code to that address.',
        ),
      ].join('\n'),
    }),
    text: textLayout([
      'Application received',
      '',
      `The application for ${data.institutionName} has been received and is queued for review.`,
      '',
      `Reference:   ${data.applicationRef}`,
      `Institution: ${data.institutionName}`,
      `Submitted:   ${data.submittedAt}`,
      'Status:      Submitted',
      '',
      `Track it here: ${data.trackingUrl}`,
      'Tracking asks for this reference plus the email address on the application.',
    ]),
  }
}

export function applicationStatusChanged(data: {
  institutionName: string
  applicationRef: string
  status: string
  statusLabel: string
  comments?: string | null
  requiredActions?: string[]
  trackingUrl: string
}): EmailDocument {
  const subject = `${data.statusLabel} — ${data.applicationRef}`
  const needsAction = (data.requiredActions?.length ?? 0) > 0

  return {
    subject,
    html: layout({
      title: subject,
      preheader: `The application for ${data.institutionName} is now ${data.statusLabel.toLowerCase()}.`,
      body: [
        heading(data.statusLabel),
        paragraph(
          `The application for ${data.institutionName} has moved to "${data.statusLabel}".`,
        ),
        panel([
          ['Reference', data.applicationRef],
          ['Institution', data.institutionName],
          ['Status', data.statusLabel],
        ]),
        data.comments ? paragraph(data.comments) : '',
        needsAction ? paragraph('The following is needed before the review can continue:') : '',
        needsAction ? bulletList(data.requiredActions!) : '',
        button(data.trackingUrl, 'View application status'),
      ]
        .filter(Boolean)
        .join('\n'),
    }),
    text: textLayout([
      data.statusLabel,
      '',
      `The application for ${data.institutionName} has moved to "${data.statusLabel}".`,
      '',
      `Reference: ${data.applicationRef}`,
      `Status:    ${data.statusLabel}`,
      data.comments ? '' : null,
      data.comments ?? null,
      needsAction ? '' : null,
      needsAction ? 'Required before review can continue:' : null,
      ...(data.requiredActions ?? []).map((item) => `  - ${item}`),
      '',
      `View status: ${data.trackingUrl}`,
    ]),
  }
}

export function applicationTrackingCode(data: {
  applicationRef: string
  code: string
  expiresInMinutes: number
}): EmailDocument {
  const subject = `Your tracking code — ${data.applicationRef}`

  return {
    subject,
    html: layout({
      title: subject,
      preheader: `One-time code to view application ${data.applicationRef}.`,
      body: [
        heading('Your one-time code'),
        paragraph(`Enter this code to view the status of application ${data.applicationRef}.`),
        codeBlock(data.code),
        muted(`The code expires in ${data.expiresInMinutes} minutes and can be used once.`),
        muted(
          'If you did not request this, you can ignore it. Nobody can view the application without this code.',
        ),
      ].join('\n'),
    }),
    text: textLayout([
      'Your one-time code',
      '',
      `Enter this code to view the status of application ${data.applicationRef}:`,
      '',
      `    ${data.code}`,
      '',
      `The code expires in ${data.expiresInMinutes} minutes and can be used once.`,
      'If you did not request this, you can ignore it.',
    ]),
  }
}
