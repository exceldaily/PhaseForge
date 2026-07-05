import type { ModuleKey, OpsRole } from './types'

// Single registry driving sidebar visibility, route guards, and settings toggles.
// Route access is enforced server-side via requireModule() — hiding a link is never
// the only gate (see MODULES_AND_PERMISSIONS.md).
export interface ModuleDef {
  key: ModuleKey
  label: string
  href: string
  description: string
  // ops_roles allowed to open the module at all (RLS enforces data-level rules too)
  roles: OpsRole[] | 'all'
}

export const OPERATIONS_MODULES: ModuleDef[] = [
  {
    key: 'customers',
    label: 'Customers',
    href: '/app/customers',
    description: 'Customer companies, locations, assets, and contacts',
    roles: 'all',
  },
  {
    key: 'staff',
    label: 'Staff',
    href: '/app/staff',
    description: 'Team profiles, divisions, skills, and certifications',
    roles: ['owner', 'admin', 'dispatcher', 'project_manager'],
  },
  {
    key: 'vendors',
    label: 'Vendors',
    href: '/app/vendors',
    description: 'Subcontractors and service partners',
    roles: ['owner', 'admin', 'dispatcher', 'project_manager'],
  },
  {
    key: 'calls',
    label: 'Calls',
    href: '/app/calls',
    description: 'Service calls / work orders and dispatch',
    roles: 'all',
  },
  {
    key: 'files',
    label: 'Files',
    href: '/app/files',
    description: 'Company file library and record attachments',
    roles: 'all',
  },
  {
    key: 'invoices',
    label: 'Invoices',
    href: '/app/invoices',
    description: 'Invoice-ready drafts and PDF generation',
    roles: ['owner', 'admin', 'billing', 'project_manager', 'dispatcher'],
  },
]

export function moduleAllowsRole(def: ModuleDef, role: OpsRole): boolean {
  return def.roles === 'all' || def.roles.includes(role)
}

export function getModuleDef(key: ModuleKey): ModuleDef | undefined {
  return OPERATIONS_MODULES.find((m) => m.key === key)
}
