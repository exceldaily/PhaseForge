import 'server-only'

// What an import is compared against: the stores and PM records already there.

import type { ExistingCycle, ExistingStore } from './importers'
import { mapRows, type PmContext } from './server'
import type { PmStore, PmTech } from './types'

export function existingStoresFor(stores: PmStore[], techs: PmTech[]): ExistingStore[] {
  const name = new Map(techs.map((t) => [t.id, t.name]))
  return stores.map((s) => ({
    id: s.id, storeNumber: s.storeNumber, address: s.address, city: s.city, county: s.county, state: s.state, postalCode: s.postalCode, region: s.region,
    facilityManager: s.facilityManager, fmPhone: s.fmPhone, fmEmail: s.fmEmail, storePhone: s.storePhone,
    primaryTech: name.get(s.primaryTechId ?? '') ?? null, secondaryTech: name.get(s.secondaryTechId ?? '') ?? null,
    systemType: s.systemType, refrigerant: s.refrigerant, notes: s.notes, isActive: s.isActive,
  }))
}

const CYCLE_COLS = 'id, store_id, year, quarter, job_number, sc_work_order, job_received_date, priority, due_date, tech_id, scheduled_date, actual_start, actual_end, status, coordinator_notes'

/** Every PM record for the company, paged past the 1000 row limit. */
export async function loadExistingCycles(ctx: Pick<PmContext, 'supabase' | 'companyId'>): Promise<ExistingCycle[]> {
  const out: ExistingCycle[] = []
  for (let page = 0; page < 20; page++) {
    const { data } = await ctx.supabase.from('pm_cycles').select(CYCLE_COLS).eq('company_id', ctx.companyId).order('id').range(page * 1000, page * 1000 + 999)
    out.push(...mapRows<ExistingCycle>(data))
    if (!data || data.length < 1000) break
  }
  return out
}
