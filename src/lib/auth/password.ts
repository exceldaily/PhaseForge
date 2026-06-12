export const MIN_PASSWORD_LENGTH = 8

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase()
}

export function validatePassword(password: string, confirmPassword?: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return 'Passwords do not match.'
  }

  return null
}

export function getFriendlyAuthError(message: string) {
  const normalized = message.toLowerCase()

  if (normalized.includes('user already registered')) {
    return 'An account with this email already exists. Try signing in or resetting your password.'
  }

  if (normalized.includes('invalid login credentials')) {
    return 'Email or password is incorrect.'
  }

  if (normalized.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.'
  }

  if (normalized.includes('email rate limit exceeded') || normalized.includes('over_email_send_rate_limit')) {
    return 'Too many signup emails have been sent recently. Please wait about 15 minutes and try again.'
  }

  if (normalized.includes('database error saving new user')) {
    return 'We could not finish creating the account just yet. Please try again in a minute.'
  }

  if (normalized.includes('same password')) {
    return 'Choose a new password that is different from your current password.'
  }

  if (normalized.includes('expired') || normalized.includes('invalid')) {
    return 'This link is no longer valid. Request a new one and try again.'
  }

  if (normalized.includes('password')) {
    return message.replace(/^auth:\s*/i, '')
  }

  return message
}
