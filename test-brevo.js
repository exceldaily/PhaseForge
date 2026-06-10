const BREVO_API_KEY = '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'
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

const payload = {
  sender: { email: 'noreply@phase-forge.com', name: 'PhaseForge' },
  to: [{ email: 'test@example.com' }],
  subject: 'Test Email',
  htmlContent: '<p>Hello, this is a test.</p>'
}

console.log('Sending test email to Brevo...')
console.log('API Key:', BREVO_API_KEY.slice(0, 20) + '...')
console.log('Payload:', JSON.stringify(payload, null, 2))

fetch(BREVO_API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'api-key': BREVO_API_KEY,
  },
  body: JSON.stringify(payload),
})
  .then(res => res.json())
  .then(data => {
    console.log('\nBrevo Response:')
    console.log(JSON.stringify(data, null, 2))
  })
  .catch(err => {
    console.error('\nError:', err.message)
  })
