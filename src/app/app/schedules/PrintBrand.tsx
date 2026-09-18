// Top-left brand mark on printed schedules: the PhaseForge icon with
// phase-forge.com beside it. Plain <img> loaded eagerly so it is always
// there by the time the print dialog renders the page.

import { BRAND_ICON_SRC } from '@/lib/branding'

export function PrintBrand() {
  return (
    <div className="absolute left-0 top-0 flex items-center gap-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BRAND_ICON_SRC} alt="PhaseForge" width={28} height={28} loading="eager" className="h-7 w-7 object-contain" />
      <span className="text-[11px] font-semibold tracking-wide text-slate-700">phase-forge.com</span>
    </div>
  )
}
