import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request, { params }: { params: { token: string } }) {
  try {
    const admin = createAdminClient()

    const { data: invite, error } = await admin
      .from('company_invites')
      .select('email, status, companies(name)')
      .eq('token', params.token)
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
