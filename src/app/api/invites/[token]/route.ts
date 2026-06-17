import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse, NextRequest } from 'next/server'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const admin = createAdminClient()

    const { data: invite, error } = await admin
      .from('company_invites')
      .select('email, status, companies(name)')
      .eq('token', token)
      .eq('status', 'pending')
      .single()

    if (error || !invite) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
    }

    return NextResponse.json({
      email: invite.email,
      companyName: (invite.companies as any)?.name || 'Unknown Company',
    })
  } catch (err) {
    console.error('Failed to fetch invite:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
