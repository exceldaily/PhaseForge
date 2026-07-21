import { DispatchNav } from '@/components/dispatch/DispatchNav'

export default function DispatchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <DispatchNav />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
