// The brand mark on printed schedules, on every page: the PhaseForge icon
// with phase-forge.com in the top left corner.
//
// PrintBrand is fixed-position in print, which the browser repeats on every
// page. Room for it comes from a real <thead> row at the top of the sheet's
// table (PrintHeaderBand): browsers repeat a table header on every page when
// the table breaks between rows, so each page gets the band, and the schedule
// title printed in it, with the logo sitting in the band's left corner.
// Tested with headless Chromium on a multi-page sheet: div-based table
// display does NOT repeat, only real table elements do.

import { BRAND_ICON_SRC } from '@/lib/branding'

export function PrintBrand() {
  return (
    <div className="pointer-events-none fixed left-0 top-0 hidden items-center gap-1.5 print:flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BRAND_ICON_SRC} alt="PhaseForge" width={28} height={28} loading="eager" className="h-7 w-7 object-contain" />
      <span className="text-[11px] font-semibold tracking-wide text-slate-700">phase-forge.com</span>
    </div>
  )
}

/** The repeating title band: tall enough to clear the logo, title centered. */
export function PrintHeaderBand({ title, tag }: { title: string; tag: string }) {
  return (
    <div className="pb-2 text-center" style={{ minHeight: 44 }}>
      <p className="text-lg font-bold leading-6 text-black">{title}</p>
      <p className="mt-0.5 inline-block bg-yellow-300 px-3 py-0.5 text-sm font-bold text-black">{tag}</p>
    </div>
  )
}
