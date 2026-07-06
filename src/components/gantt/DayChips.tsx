'use client'

// Weekday toggle chips shared by the phase panel and project sync bar.
// Solid indigo = shown on calendar; red with strikethrough = skipped.
// Codes are RFC-5545 weekday abbreviations, Monday-first display.
const DAYS: { code: string; label: string }[] = [
  { code: 'MO', label: 'Mo' }, { code: 'TU', label: 'Tu' }, { code: 'WE', label: 'We' },
  { code: 'TH', label: 'Th' }, { code: 'FR', label: 'Fr' }, { code: 'SA', label: 'Sa' },
  { code: 'SU', label: 'Su' },
]

export function DayChips({ value, onChange, size = 'md' }: {
  value: string[]
  onChange: (next: string[]) => void
  size?: 'sm' | 'md'
}) {
  const toggle = (code: string) => {
    onChange(value.includes(code) ? value.filter((d) => d !== code) : [...value, code])
  }
  const dims = size === 'sm' ? 'h-6 w-7 text-[10px]' : 'h-7 w-8 text-[11px]'
  return (
    <span className="inline-flex gap-1">
      {DAYS.map(({ code, label }) => {
        const skipped = value.includes(code)
        return (
          <button
            key={code}
            type="button"
            onClick={() => toggle(code)}
            title={skipped ? `${label}: skipped — not shown on calendar` : `${label}: shown on calendar`}
            className={`${dims} rounded-md font-semibold transition-all ${
              skipped
                ? 'bg-rose-50 text-rose-400 line-through ring-1 ring-inset ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-900'
                : 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
            }`}
          >
            {label}
          </button>
        )
      })}
    </span>
  )
}
