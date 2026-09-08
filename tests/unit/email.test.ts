// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { button, escapeHtml, layout, paragraph } from '@/lib/email/render'
import {
  accountActivation,
  applicationReceived,
  applicationTrackingCode,
  passwordReset,
} from '@/lib/email/templates'

describe('escaping', () => {
  it('neutralises markup in interpolated text', () => {
    const html = paragraph('<script>alert("x")</script> & "quotes"')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
  })

  it('escapes the five characters that matter', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })
})

describe('link safety', () => {
  it('refuses a non-http(s) URL rather than rendering it', () => {
    for (const hostile of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
      expect(() => button(hostile, 'Click'), hostile).toThrow(/non-http/i)
    }
  })

  it('renders an https URL', () => {
    expect(button('https://afi.test/activate?token=abc', 'Set password')).toContain(
      'https://afi.test/activate?token=abc',
    )
  })
})

describe('layout', () => {
  it('includes a preheader that is hidden from the rendered body', () => {
    const html = layout({ title: 'T', preheader: 'Peek at this', body: paragraph('Body') })
    expect(html).toContain('Peek at this')
    expect(html).toMatch(/display:none!important/)
  })

  it('declares a charset and a viewport', () => {
    const html = layout({ title: 'T', preheader: 'P', body: '' })
    expect(html).toContain('charset="utf-8"')
    expect(html).toContain('name="viewport"')
  })
})

describe('templates', () => {
  const activation = accountActivation({
    fullName: 'Aditi Ramesh',
    roleLabel: 'Teacher',
    institutionName: 'Demo Aerospace Academy',
    activationUrl: 'https://afi.test/auth/callback?code=abc&next=/activate',
    expiresInHours: 72,
  })

  it('always produces a subject, HTML and a plain-text alternative', () => {
    for (const document of [
      activation,
      passwordReset({ fullName: 'A', resetUrl: 'https://afi.test/r', expiresInMinutes: 60 }),
      applicationReceived({
        institutionName: 'Demo Aerospace Academy',
        applicationRef: 'AFI-2026-7K3QP9ZX',
        submittedAt: '26 August 2026',
        trackingUrl: 'https://afi.test/application-status',
      }),
      applicationTrackingCode({
        applicationRef: 'AFI-2026-7K3QP9ZX',
        code: '481902',
        expiresInMinutes: 15,
      }),
    ]) {
      expect(document.subject.length).toBeGreaterThan(0)
      expect(document.html).toContain('<!doctype html>')
      expect(document.text.length).toBeGreaterThan(0)
      expect(document.text).not.toContain('<')
    }
  })

  it('carries the activation link in both the HTML and the text part', () => {
    expect(activation.html).toContain('https://afi.test/auth/callback?code=abc&amp;next=/activate')
    expect(activation.text).toContain('https://afi.test/auth/callback?code=abc&next=/activate')
  })

  /**
   * The platform never transmits a password. Activation and reset both send a
   * single-use link and let the recipient choose the secret, so no template
   * should ever contain a credential-shaped phrase.
   */
  it('never contains a password', () => {
    for (const document of [
      activation,
      passwordReset({ fullName: 'A', resetUrl: 'https://afi.test/r', expiresInMinutes: 60 }),
    ]) {
      const body = `${document.html} ${document.text}`.toLowerCase()
      expect(body).not.toMatch(/temporary password/)
      expect(body).not.toMatch(/your password is/)
      expect(body).not.toMatch(/password:\s*\S/)
    }
  })

  it('tells the recipient how long a link lasts', () => {
    expect(activation.text).toContain('72 hours')
    expect(
      passwordReset({ fullName: 'A', resetUrl: 'https://afi.test/r', expiresInMinutes: 60 }).text,
    ).toContain('60 minutes')
  })

  it('escapes a hostile institution name coming from application data', () => {
    const document = applicationReceived({
      institutionName: '<img src=x onerror=alert(1)>',
      applicationRef: 'AFI-2026-7K3QP9ZX',
      submittedAt: 'today',
      trackingUrl: 'https://afi.test/application-status',
    })
    expect(document.html).not.toContain('<img src=x')
    expect(document.html).toContain('&lt;img')
  })
})

/**
 * These stub the environment rather than reading it.
 *
 * The first version of this suite asserted "SMTP is not configured", which was
 * true on the machine it was written on and became false the moment real
 * credentials were added — a test whose result depended on the developer's
 * `.env` rather than on the code. Both states are now pinned explicitly.
 */
describe('transport configuration reporting', () => {
  /** Everything serverEnv() requires, so neither case depends on ambient env. */
  const FULL_ENV: Record<string, string> = {
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'mailer@example.test',
    SMTP_PASSWORD: 'super-secret-password-value',
    SMTP_FROM: 'noreply@example.test',
    SMTP_FROM_NAME: 'AFI Test',
    WORKER_SECRET: 'worker-secret-at-least-16',
    AI_PROVIDER: 'anthropic',
    AI_API_KEY: 'test-ai-key',
    AI_MODEL_CHAT: 'model-chat',
    AI_MODEL_REASONING: 'model-reasoning',
    AI_MODEL_FAST: 'model-fast',
    AI_EMBEDDING_MODEL: 'model-embedding',
    TOKEN_SIGNING_SECRET: 'token-signing-secret-at-least-32-chars',
  }

  async function describeWith(env: Record<string, string | undefined>) {
    const { describeTransport, resetTransporter } = await import('@/lib/email/transporter')
    const { resetServerEnv } = await import('@/lib/env/server')

    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value as string)
    }
    resetServerEnv()
    resetTransporter()

    return describeTransport()
  }

  afterEach(async () => {
    vi.unstubAllEnvs()
    const { resetServerEnv } = await import('@/lib/env/server')
    const { resetTransporter } = await import('@/lib/email/transporter')
    resetServerEnv()
    resetTransporter()
  })

  it('reports missing configuration without inventing values', async () => {
    const description = await describeWith({
      ...FULL_ENV,
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
    })

    expect(description.configured).toBe(false)
    expect(description.host).toBeUndefined()
    expect(description.missing?.length ?? 0).toBeGreaterThan(0)
  })

  it('never exposes the password when configuration IS present', async () => {
    const description = await describeWith(FULL_ENV)

    expect(description.configured).toBe(true)
    expect(description.host).toBe('smtp.example.test')
    expect(description.port).toBe(587)

    const serialised = JSON.stringify(description)
    expect(serialised).not.toContain(FULL_ENV.SMTP_PASSWORD)
    expect(description).not.toHaveProperty('password')
    expect(description).not.toHaveProperty('pass')
  })

  it('masks the SMTP username rather than printing it', async () => {
    const description = await describeWith(FULL_ENV)

    expect(description.user).not.toBe(FULL_ENV.SMTP_USER)
    expect(description.user).toContain('***')
    // The domain is kept: it identifies a misconfiguration without exposing
    // the account name.
    expect(description.user).toContain('@example.test')
  })
})
