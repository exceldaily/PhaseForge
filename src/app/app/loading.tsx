import { PageSkeleton } from '@/components/ui/PageSkeleton'

// Instant feedback for every /app route the moment navigation starts; the
// heavier pages below override this with a skeleton shaped like themselves.
export default function Loading() {
  return <PageSkeleton />
}
