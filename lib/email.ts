import 'server-only'

type Payload = Record<string, unknown>
export type RenderedEmail = { subject: string; heading: string; paragraphs: string[]; cta?: { label: string; path: string } }

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const n = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
const dollars = (cents: unknown) => `$${(n(cents) / 100).toFixed(2)}`

export function renderEmail(kind: string, p: Payload): RenderedEmail {
  switch (kind) {
    case 'reply':
      return {
        subject: `${s(p.contact_name) || 'A family'} replied to ${s(p.home_name)}`,
        heading: `${s(p.contact_name) || 'A family'} sent a reply`,
        paragraphs: [
          `Family of ${s(p.deceased_name) || 'your loved one'} wrote:`,
          `“${s(p.body)}”`,
          'Reply from the Family Messages screen so the conversation stays in one place.',
        ],
        cta: { label: 'Open Family Messages', path: `/?section=Inbox${p.family_id ? `&family=${s(p.family_id)}` : ''}` },
      }
    case 'welcome':
      return {
        subject: `Welcome to NAVA Memorial Family Follow-Up`,
        heading: `${s(p.home_name)} is set up`,
        paragraphs: [
          `Hello${p.name ? ` ${s(p.name)}` : ''}, your account is ready.`,
          'Next steps: 1) review your follow-up templates, 2) invite your team, 3) start your subscription under Billing, and 4) complete texting registration under Texting so NAVA can assign your dedicated number.',
          'Until texting is approved, every message is simulated and nothing reaches families.',
        ],
        cta: { label: 'Open your dashboard', path: '/?section=Overview' },
      }
    case 'joined':
      return {
        subject: `You now have access to ${s(p.home_name)}`,
        heading: `Welcome to ${s(p.home_name)}`,
        paragraphs: [`You were added as ${p.role === 'admin' ? 'an administrator' : 'staff'}.`],
        cta: { label: 'Open dashboard', path: '/?section=Overview' },
      }
    case 'invitation':
      return {
        subject: `You're invited to ${s(p.home_name)} on NAVA Memorial`,
        heading: `Join ${s(p.home_name)}`,
        paragraphs: [
          `You were invited as ${p.role === 'admin' ? 'an administrator' : 'staff'}.`,
          'Create an account with this email address and you will be added automatically.',
        ],
        cta: { label: 'Create your account', path: '/auth/sign-up' },
      }
    case 'allowance_80':
      return {
        subject: `You've enrolled ${n(p.used)} of ${n(p.included)} included families this year`,
        heading: 'Approaching your yearly allowance',
        paragraphs: [
          `Your plan includes ${n(p.included)} newly enrolled families per subscription year. You have used ${n(p.used)}.`,
          'After that, each additional family is $1.00, up to the spending limit you set under Billing.',
        ],
        cta: { label: 'Review billing', path: '/?section=Billing' },
      }
    case 'allowance_100':
      return {
        subject: `You've reached your ${n(p.included)} included families`,
        heading: 'Yearly allowance reached',
        paragraphs: [
          `Additional families are now ${dollars(p.overage_cents)} each${p.spending_limit_cents != null ? `, up to your ${dollars(p.spending_limit_cents)} limit` : ''}.`,
          'Families already enrolled keep receiving every scheduled message.',
        ],
        cta: { label: 'Adjust spending limit', path: '/?section=Billing' },
      }
    case 'spending_80':
      return {
        subject: 'Nearing your additional-family spending limit',
        heading: 'Spending limit almost reached',
        paragraphs: [`Additional families this year: ${dollars(p.spent_cents)} of your ${dollars(p.spending_limit_cents)} limit.`],
        cta: { label: 'Adjust spending limit', path: '/?section=Billing' },
      }
    case 'spending_limit_reached':
      return {
        subject: 'New families are paused: spending limit reached',
        heading: 'Spending limit reached',
        paragraphs: [
          'A staff member tried to add a family but your additional-family spending limit has been reached.',
          'Raise the limit under Billing to keep enrolling. Existing families are not affected.',
        ],
        cta: { label: 'Raise limit', path: '/?section=Billing' },
      }
    case 'monthly_report': {
      const sent = n(p.messages_sent)
      const replied = n(p.families_replied)
      const period = new Date(`${s(p.period_start)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      return {
        subject: `${s(p.home_name)} · ${period} follow-up report`,
        heading: `${period} at a glance`,
        paragraphs: [
          `New families enrolled: ${n(p.new_families)}`,
          `Messages sent: ${sent}`,
          `Family replies: ${n(p.replies)} from ${replied} ${replied === 1 ? 'family' : 'families'}`,
          `Opt-outs: ${n(p.opt_outs)} · Failed sends: ${n(p.failed)}`,
          `Families currently receiving follow-ups: ${n(p.active_families)}`,
        ],
        cta: { label: 'View reports', path: '/?section=Reports' },
      }
    }
    case 'registration_status':
      return {
        subject: `Texting registration: ${s(p.status).replace('_', ' ')}`,
        heading: 'Texting registration update',
        paragraphs: [
          `Your registration status is now “${s(p.status).replace('_', ' ')}”.`,
          ...(p.note ? [`Note from NAVA: ${s(p.note)}`] : []),
        ],
        cta: { label: 'View texting setup', path: '/?section=Texting' },
      }
    case 'registration_submitted':
      return {
        subject: `Texting registration submitted: ${s(p.home_name)}`,
        heading: 'Registration ready for review',
        paragraphs: [`${s(p.home_name)} submitted its texting registration.`],
        cta: { label: 'Open NAVA admin', path: '/nava' },
      }
    case 'new_home':
      return {
        subject: `New funeral home: ${s(p.home_name)}`,
        heading: 'A new funeral home signed up',
        paragraphs: [`${s(p.home_name)} was created by ${s(p.admin_email)}.`],
        cta: { label: 'Open NAVA admin', path: '/nava' },
      }
    case 'payment_failed':
      return {
        subject: 'Your NAVA Memorial payment did not go through',
        heading: 'Payment problem',
        paragraphs: [
          `We could not collect your subscription payment${p.amount_cents ? ` of ${dollars(p.amount_cents)}` : ''}. Please update your card under Billing.`,
          p.next_attempt ? `Stripe will automatically try again on ${s(p.next_attempt)}.` : 'Stripe will automatically retry the payment.',
          `Scheduled messages to families keep sending for ${n(p.grace_days) || 7} days while this is resolved. After that, automated texting pauses until payment succeeds.`,
        ],
        cta: { label: 'Update payment method', path: '/?section=Billing' },
      }
    case 'payment_action_required':
      return {
        subject: 'Your bank needs you to confirm a NAVA Memorial payment',
        heading: 'Confirm your payment',
        paragraphs: [
          `Your bank asked for extra verification on a ${dollars(p.amount_cents)} payment. Open the invoice to confirm it.`,
        ],
        cta: { label: 'Open Billing', path: '/?section=Billing' },
      }
    case 'payment_receipt':
      return {
        subject: `Receipt: ${dollars(p.amount_cents)} paid to NAVA Memorial`,
        heading: 'Payment received',
        paragraphs: [
          `We received ${dollars(p.amount_cents)}${p.paid_on ? ` on ${s(p.paid_on)}` : ''}${p.invoice_number ? ` for invoice ${s(p.invoice_number)}` : ''}. Thank you.`,
          'You can download every invoice and receipt from the Billing page.',
        ],
        cta: { label: 'View invoices', path: '/?section=Billing' },
      }
    case 'payment_reminder':
      return {
        subject: 'Upcoming NAVA Memorial payment',
        heading: 'Payment reminder',
        paragraphs: [
          `Your next payment of about ${dollars(p.amount_cents)} will be collected${p.due_on ? ` on ${s(p.due_on)}` : ' soon'}.`,
          'No action is needed if your card on file is current.',
        ],
        cta: { label: 'Review billing', path: '/?section=Billing' },
      }
    case 'subscription_canceling':
      return {
        subject: 'Your NAVA Memorial subscription is set to end',
        heading: 'Cancellation scheduled',
        paragraphs: [
          `Your service stays fully active until ${s(p.ends_on) || 'the end of your paid period'}. You will not be charged again.`,
          'After that date, scheduled texts will not send. Your families, message history and settings are kept, and you can reactivate any time from Billing.',
        ],
        cta: { label: 'Open Billing', path: '/?section=Billing' },
      }
    case 'subscription_reactivated':
      return {
        subject: 'Your NAVA Memorial subscription will continue',
        heading: 'Subscription reactivated',
        paragraphs: ['Your cancellation was removed. Billing and automated follow-ups continue as normal.'],
        cta: { label: 'Open Billing', path: '/?section=Billing' },
      }
    case 'subscription_ended':
      return {
        subject: 'Your NAVA Memorial subscription has ended',
        heading: 'Subscription ended',
        paragraphs: [
          'Automated texting has stopped. Scheduled messages will not send.',
          'Your records are kept. If you subscribe again, messages that came due while service was off will not be sent automatically; you can reschedule any that are still appropriate.',
        ],
        cta: { label: 'Reactivate', path: '/?section=Billing' },
      }
    case 'service_suspended':
      return {
        subject: `Automated texting is paused for ${s(p.home_name)}`,
        heading: 'Texting paused',
        paragraphs: [
          'Your subscription is not active, so scheduled follow-ups are not sending.',
          'Update your payment method or reactivate under Billing to restore service. Messages that come due while paused will not be sent late automatically.',
        ],
        cta: { label: 'Restore service', path: '/?section=Billing' },
      }
    case 'service_restored':
      return {
        subject: `Automated texting restored for ${s(p.home_name)}`,
        heading: 'Service restored',
        paragraphs: [
          'Payment succeeded and automated follow-ups are running again.',
          'Messages that came due while service was paused were held and not sent. Review them under Schedule and reschedule any that are still appropriate.',
        ],
        cta: { label: 'Review schedule', path: '/?section=Schedule' },
      }
    case 'alert':
      return {
        subject: 'Action needed: a follow-up message did not send',
        heading: 'Message alert',
        paragraphs: [s(p.message)],
        cta: { label: 'Review schedule', path: '/?section=Schedule' },
      }
    default:
      return { subject: 'NAVA Memorial notification', heading: 'Notification', paragraphs: [s(p.message)] }
  }
}

function toHtml(email: RenderedEmail, baseUrl: string | null) {
  const body = email.paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.6">${escapeHtml(p)}</p>`).join('')
  const button =
    email.cta && baseUrl
      ? `<p style="margin:22px 0 0"><a href="${escapeHtml(baseUrl + email.cta.path)}" style="display:inline-block;background:#2f4a43;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none">${escapeHtml(email.cta.label)}</a></p>`
      : ''
  return `<div style="background:#f3f1ec;padding:24px;font-family:Georgia,serif;color:#1f2a27"><div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px"><p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;color:#6b7470">NAVA MEMORIAL FAMILY FOLLOW-UP</p><h1 style="font-size:22px;margin:0 0 16px;font-weight:normal">${escapeHtml(email.heading)}</h1>${body}${button}</div></div>`
}

export type SendResult = { status: 'sent' | 'simulated' | 'failed'; error?: string }

export async function sendEmail(to: string, email: RenderedEmail, baseUrl: string | null): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { status: 'simulated' }
  const from = process.env.RESEND_FROM_EMAIL || 'NAVA Memorial <onboarding@resend.dev>'
  const text = [email.heading, '', ...email.paragraphs, ...(email.cta && baseUrl ? ['', `${email.cta.label}: ${baseUrl}${email.cta.path}`] : [])].join('\n')
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: email.subject, html: toHtml(email, baseUrl), text }),
    })
    if (!res.ok) return { status: 'failed', error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` }
    return { status: 'sent' }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'Network error' }
  }
}
