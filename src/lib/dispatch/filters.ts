// Client-side filtering + search over prioritized calls (ported from DispatchForge).
import type { PrioritizedCall, CallStatus, Urgency, PartStatus, ProposalStatus } from './types'

export interface CallFilters {
  customerId: string
  storeId: string
  status: CallStatus | ''
  urgencies: Urgency[]
  vendorId: string
  minDaysOpen: number
  partStatus: PartStatus | ''
  proposalStatus: ProposalStatus | ''
  dateFrom: string
  dateTo: string
}

export const EMPTY_FILTERS: CallFilters = {
  customerId: '',
  storeId: '',
  status: '',
  urgencies: [],
  vendorId: '',
  minDaysOpen: 0,
  partStatus: '',
  proposalStatus: '',
  dateFrom: '',
  dateTo: '',
}

export function applyCallFilters(calls: PrioritizedCall[], filters: CallFilters): PrioritizedCall[] {
  return calls.filter((call) => {
    if (filters.customerId && call.store.customer_id !== filters.customerId) return false
    if (filters.storeId && call.store_id !== filters.storeId) return false
    if (filters.status && call.status !== filters.status) return false
    if (filters.urgencies.length && !filters.urgencies.includes(call.urgency)) return false
    if (filters.vendorId && !call.vendors.some((v) => v.id === filters.vendorId)) return false
    if (filters.minDaysOpen && call.days_open < filters.minDaysOpen) return false
    if (filters.partStatus && call.part_status !== filters.partStatus) return false
    if (filters.proposalStatus && call.proposal_status !== filters.proposalStatus) return false
    if (filters.dateFrom && new Date(call.date_started) < new Date(filters.dateFrom)) return false
    if (filters.dateTo && new Date(call.date_started) > new Date(filters.dateTo)) return false
    return true
  })
}

export function matchesSearch(call: PrioritizedCall, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    call.store.store_number.toLowerCase().includes(q) ||
    call.store.store_name.toLowerCase().includes(q) ||
    call.service_call_number.toLowerCase().includes(q) ||
    (call.internal_job_number ?? '').toLowerCase().includes(q) ||
    call.vendors.some((v) => v.name.toLowerCase().includes(q) || (v.company ?? '').toLowerCase().includes(q)) ||
    (call.manager_note ?? '').toLowerCase().includes(q) ||
    call.description.toLowerCase().includes(q)
  )
}
