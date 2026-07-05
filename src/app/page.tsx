import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Signed-in users land in the app; everyone else gets the marketing/landing
// experience (the login page carries the full landing).
export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/app/dashboard' : '/login')
}
