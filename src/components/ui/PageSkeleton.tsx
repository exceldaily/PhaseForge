// Route-level loading skeletons. Next renders a segment's loading.tsx the
// instant navigation starts, so these are what people see during the server
// round trip instead of a frozen page. Keep them dumb: grey blocks in the
// rough shape of the page, no data, no logic.

function Block({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className ?? ''}`} />
}

/** Generic app page: title row, toolbar, then content cards. */
export function PageSkeleton() {
  return (
    <div className="p-4 sm:p-6" aria-busy="true" aria-label="Loading page">
      <Block className="h-7 w-56" />
      <div className="mt-2 flex gap-2">
        <Block className="h-4 w-32" />
        <Block className="h-4 w-20" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Block className="h-24" />
        <Block className="h-24" />
        <Block className="h-24" />
        <Block className="h-24" />
      </div>
      <div className="mt-4 space-y-3">
        <Block className="h-40" />
        <Block className="h-40" />
      </div>
    </div>
  )
}

/** Project detail: header strip, tab bar, then the overview shapes. */
export function ProjectSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading project">
      <div className="border-b border-slate-200 bg-white px-4 pt-4 sm:px-6">
        <div className="flex items-center justify-between">
          <Block className="h-5 w-72" />
          <Block className="h-8 w-24" />
        </div>
        <div className="mt-3 flex gap-3">
          <Block className="h-4 w-28" />
          <Block className="h-4 w-36" />
          <Block className="h-4 w-24" />
        </div>
        <div className="mt-3 flex gap-4 pb-1">
          {Array.from({ length: 6 }, (_, i) => <Block key={i} className="h-8 w-20" />)}
        </div>
      </div>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
        <Block className="h-32" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Block className="h-24" /><Block className="h-24" /><Block className="h-24" /><Block className="h-24" />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Block className="h-48" /><Block className="h-48" />
        </div>
      </div>
    </div>
  )
}

/** Kanban board: header, then column lanes. */
export function BoardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden" aria-busy="true" aria-label="Loading board">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <Block className="h-6 w-48" />
        <Block className="mt-2 h-4 w-32" />
      </div>
      <div className="flex gap-4 overflow-hidden p-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="w-[320px] shrink-0 space-y-3">
            <Block className="h-20" />
            <Block className="h-36" />
            <Block className="h-36" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Gantt: toolbar, then sidebar + timeline rows. */
export function GanttSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden" aria-busy="true" aria-label="Loading schedule">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Block className="h-8 w-40" />
        <Block className="h-8 w-56" />
        <Block className="ml-auto h-8 w-32" />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 space-y-2 border-r border-slate-200 p-3">
          {Array.from({ length: 10 }, (_, i) => <Block key={i} className="h-8" />)}
        </div>
        <div className="flex-1 space-y-2 p-3">
          {Array.from({ length: 10 }, (_, i) => (
            <Block key={i} className="h-8" />
          ))}
        </div>
      </div>
    </div>
  )
}
