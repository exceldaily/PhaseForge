// Who can do what.
//
// There are two role fields on a profile and they answer different questions:
//   role      — the workspace role: owner | admin | manager | member | viewer
//   ops_role  — the operations role, only set when the ops modules are in use:
//               owner | admin | dispatcher | project_manager | billing |
//               staff | read_only
//
// Most checks used to be written inline as
//     ['owner','admin','manager','dispatcher'].includes(ops_role)
//       || ['owner','admin'].includes(role)
// which silently left a plain manager (role = 'manager', no ops_role) unable to
// edit anything, because 'manager' was missing from the second half. That is
// why managers had to be promoted to owner just to do their job. Route every
// check through here instead of rewriting the lists at each call site.
//
// The two fields are OR'd, as they always have been: whichever grants more
// wins. Someone with role = 'manager' is an editor even if their ops_role is
// 'read_only', so use role = 'member' when you mean to restrict a person.

export interface RoleBearer {
  role?: string | null
  ops_role?: string | null
}

/** Workspace roles that may edit company data. */
export const EDITOR_ROLES = ['owner', 'admin', 'manager'] as const

/** Operations roles that may edit company data. */
export const OPS_EDITOR_ROLES = ['owner', 'admin', 'dispatcher', 'project_manager'] as const

/** Workspace roles that administer the organization itself. */
export const ORG_ADMIN_ROLES = ['owner', 'admin'] as const

/**
 * Can this person create, edit, and delete company data — projects, phases,
 * boards, schedules, plans, punch items, change orders, quotes, customers?
 *
 * This is the check for nearly everything. Reach for a narrower one only when
 * the action changes who has access or costs money.
 */
export function canEditCompanyData(p: RoleBearer | null | undefined): boolean {
  if (!p) return false
  return (OPS_EDITOR_ROLES as readonly string[]).includes(p.ops_role ?? '')
    || (EDITOR_ROLES as readonly string[]).includes(p.role ?? '')
}

/**
 * Can this person administer the organization: invite people, change someone's
 * role, edit billing, rename or delete the organization?
 *
 * Deliberately excludes managers. A manager who could change roles could make
 * themselves an owner, which would make the distinction meaningless.
 */
export function canAdminOrg(p: RoleBearer | null | undefined): boolean {
  if (!p) return false
  return (ORG_ADMIN_ROLES as readonly string[]).includes(p.ops_role ?? '')
    || (ORG_ADMIN_ROLES as readonly string[]).includes(p.role ?? '')
}

/** Strictly the owner: billing, plan changes, deleting the organization. */
export function isOwner(p: RoleBearer | null | undefined): boolean {
  return p?.role === 'owner' || p?.ops_role === 'owner'
}
