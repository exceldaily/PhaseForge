import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { GantticLogo } from '@/components/branding/GantticLogo'

// Global fallback for any URL outside the authenticated /app section — a
// typo'd marketing link, an old bookmark, etc. Signed-in users hitting a bad
// URL inside /app get src/app/app/not-found.tsx instead (keeps the sidebar).
export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 p-8 text-center">
      <GantticLogo variant="lockup" width={160} alt="PhaseForge" />
      <div className="rounded-full bg-white/5 p-4">
        <SearchX size={32} className="text-slate-400" />
      </div>
      <div>
        <p className="text-lg font-semibold text-white">Page not found</p>
        <p className="mt-1 max-w-sm text-sm text-slate-400">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Link
        href="/login"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Go to Sign In
      </Link>
    </div>
  )
}
