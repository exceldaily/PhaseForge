import { cn } from '@/lib/utils'
import { forwardRef, SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  className, label, error, id, children, ...props
}, ref) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      )}
      <select
        ref={ref}
        id={id}
        className={cn(
          'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
          'transition-all appearance-none cursor-pointer',
          error && 'border-rose-500',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  )
})

Select.displayName = 'Select'
