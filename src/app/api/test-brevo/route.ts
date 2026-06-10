import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const apiKey = process.env.BREVO_API_KEY
  const apiUrl = 'https://api.brevo.com/v3/smtp/email'

  if (!apiKey) {
    return NextResponse.json({
      error: 'BREVO_API_KEY not set',
      message: 'The BREVO_API_KEY environment variable is missing in Vercel',
    }, { status: 500 })
  }

  // Test payload
  const payload = {
    sender: { email: 'noreply@phase-forge.com', name: 'PhaseForge' },
    to: [{ email: 'test@example.com' }],
    subject: 'Brevo Test',
    htmlContent: '<p>Test email from PhaseForge</p>',
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      apiKeySet: !!apiKey,
      apiKeyPrefix: apiKey.slice(0, 20) + '...',
      response: data,
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
      apiKeySet: !!apiKey,
    }, { status: 500 })
  }
}
