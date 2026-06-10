/**
 * Brevo (Sendinblue) email sending utility
 * Handles transactional emails for signup, invites, password resets, and notifications
 */

const BREVO_API_KEY = process.env.BREVO_API_KEY
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'
const SENDER_EMAIL = 'noreply@phaseforge.com'
const SENDER_NAME = 'PhaseForge'

interface EmailPayload {
  sender: { email: string; name: string }
  to: { email: string; name?: string }[]
  subject: string
  htmlContent: string
  textContent?: string
}

async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (!BREVO_API_KEY) {
    console.error('BREVO_API_KEY not set')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Brevo API error:', error)
      return { success: false, error: error.message || 'Failed to send email' }
    }

    const result = await response.json()
    return { success: true, messageId: result.messageId }
  } catch (err) {
    console.error('Email send error:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ── Email Templates ────────────────────────────────────────────────────────

export async function sendWelcomeEmail(email: string, name: string) {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #0f172a;">Welcome to PhaseForge, ${name}! 🚀</h1>
      <p style="color: #64748b; font-size: 16px;">Plan smarter. Build faster.</p>

      <p style="margin-top: 20px; color: #0f172a;">You're now set up and ready to start managing your projects with our interactive Gantt charts.</p>

      <p style="margin-top: 20px;">
        <a href="https://phaseforge.vercel.app/app/dashboard"
           style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Go to Dashboard
        </a>
      </p>

      <p style="margin-top: 30px; color: #94a3b8; font-size: 12px;">
        Need help? Check out our docs at phaseforge.vercel.app
      </p>
    </div>
  `

  return sendEmail({
    sender: { email: SENDER_EMAIL, name: SENDER_NAME },
    to: [{ email, name }],
    subject: `Welcome to PhaseForge, ${name}! 🚀`,
    htmlContent,
  })
}

export async function sendInviteEmail(
  email: string,
  inviteLink: string,
  companyName: string,
  role: string,
  invitedBy: string
) {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #0f172a;">You've been invited to PhaseForge</h1>
      <p style="color: #64748b; font-size: 16px;"><strong>${invitedBy}</strong> invited you to join <strong>${companyName}</strong></p>

      <p style="margin-top: 20px; color: #0f172a;">
        You've been assigned the role: <strong style="color: #4f46e5;">${role}</strong>
      </p>

      <p style="margin-top: 20px;">
        <a href="${inviteLink}"
           style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Accept Invitation
        </a>
      </p>

      <p style="margin-top: 20px; color: #94a3b8; font-size: 14px;">
        This link expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.
      </p>
    </div>
  `

  return sendEmail({
    sender: { email: SENDER_EMAIL, name: SENDER_NAME },
    to: [{ email }],
    subject: `${invitedBy} invited you to join ${companyName} on PhaseForge`,
    htmlContent,
  })
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #0f172a;">Reset Your PhaseForge Password</h1>
      <p style="color: #64748b; font-size: 16px;">We received a request to reset your password.</p>

      <p style="margin-top: 20px;">
        <a href="${resetLink}"
           style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Reset Password
        </a>
      </p>

      <p style="margin-top: 20px; color: #94a3b8; font-size: 14px;">
        This link expires in 24 hours. If you didn't request a password reset, please ignore this email.
      </p>
    </div>
  `

  return sendEmail({
    sender: { email: SENDER_EMAIL, name: SENDER_NAME },
    to: [{ email }],
    subject: 'Reset Your PhaseForge Password',
    htmlContent,
  })
}

export async function sendNotificationEmail(
  email: string,
  subject: string,
  title: string,
  content: string,
  actionUrl?: string,
  actionLabel?: string
) {
  const actionHtml = actionUrl && actionLabel
    ? `<p style="margin-top: 20px;"><a href="${actionUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">${actionLabel}</a></p>`
    : ''

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #0f172a;">${title}</h1>
      <div style="color: #0f172a; line-height: 1.6; margin-top: 20px;">
        ${content}
      </div>
      ${actionHtml}
      <p style="margin-top: 30px; color: #94a3b8; font-size: 12px;">
        Manage your notification preferences at https://phaseforge.vercel.app/app/settings
      </p>
    </div>
  `

  return sendEmail({
    sender: { email: SENDER_EMAIL, name: SENDER_NAME },
    to: [{ email }],
    subject,
    htmlContent,
  })
}
