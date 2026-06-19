'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

// Helper: Check if user is super admin
async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_super_admin) {
    throw new Error('Not authorized - super admin access required')
  }

  return user.id
}

// Log admin actions to audit trail
async function logAdminAction(
  actorId: string,
  action: string,
  targetType: 'user' | 'company' | 'project',
  targetId: string,
  targetEmail?: string,
  changes?: Record<string, unknown>
) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('admin_audit_logs')
    .insert({
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId,
      target_email: targetEmail,
      changes: changes || {},
    })

  if (error) {
    logger.warn('Failed to log admin action', error)
  }
}

export async function deactivateUser(userId: string, reason?: string) {
  try {
    const actorId = await requireSuperAdmin()
    const admin = createAdminClient()

    // Get user details before update
    const { data: user } = await admin
      .from('profiles')
      .select('email, is_active')
      .eq('id', userId)
      .single()

    if (!user) {
      throw new Error('User not found')
    }

    // Update user
    const { error } = await admin
      .from('profiles')
      .update({ is_active: false })
      .eq('id', userId)

    if (error) throw error

    // Log action
    await logAdminAction(actorId, 'deactivate_user', 'user', userId, user.email, { reason })

    return { success: true, message: `User ${user.email} deactivated` }
  } catch (error) {
    logger.error('Error deactivating user', error)
    throw error
  }
}

export async function deleteUser(userId: string, reason?: string) {
  try {
    const actorId = await requireSuperAdmin()
    const admin = createAdminClient()

    // Get user details before delete
    const { data: user } = await admin
      .from('profiles')
      .select('email, id')
      .eq('id', userId)
      .single()

    if (!user) {
      throw new Error('User not found')
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      const { error: profileDeleteError } = await admin
        .from('profiles')
        .delete()
        .eq('id', userId)

      if (profileDeleteError) {
        throw authDeleteError
      }
    }

    // Log action
    await logAdminAction(actorId, 'delete_user', 'user', userId, user.email, { reason })

    return { success: true, message: `User ${user.email} deleted` }
  } catch (error) {
    logger.error('Error deleting user', error)
    throw error
  }
}

export async function promoteToSuperAdmin(userId: string) {
  try {
    const actorId = await requireSuperAdmin()
    const admin = createAdminClient()

    // Get user details
    const { data: user } = await admin
      .from('profiles')
      .select('email, is_super_admin')
      .eq('id', userId)
      .single()

    if (!user) {
      throw new Error('User not found')
    }

    if (user.is_super_admin) {
      throw new Error('User is already a super admin')
    }

    // Update user
    const { error } = await admin
      .from('profiles')
      .update({ is_super_admin: true })
      .eq('id', userId)

    if (error) throw error

    // Log action
    await logAdminAction(actorId, 'promote_to_super_admin', 'user', userId, user.email)

    return { success: true, message: `User ${user.email} promoted to super admin` }
  } catch (error) {
    logger.error('Error promoting user', error)
    throw error
  }
}

export async function demoteFromSuperAdmin(userId: string) {
  try {
    const actorId = await requireSuperAdmin()
    const admin = createAdminClient()

    // Get user details
    const { data: user } = await admin
      .from('profiles')
      .select('email, is_super_admin')
      .eq('id', userId)
      .single()

    if (!user) {
      throw new Error('User not found')
    }

    if (!user.is_super_admin) {
      throw new Error('User is not a super admin')
    }

    // Prevent demoting yourself
    if (userId === actorId) {
      throw new Error('You cannot demote yourself from super admin')
    }

    // Update user
    const { error } = await admin
      .from('profiles')
      .update({ is_super_admin: false })
      .eq('id', userId)

    if (error) throw error

    // Log action
    await logAdminAction(actorId, 'demote_from_super_admin', 'user', userId, user.email)

    return { success: true, message: `User ${user.email} demoted from super admin` }
  } catch (error) {
    logger.error('Error demoting user', error)
    throw error
  }
}

export async function updateUserProfile(userId: string, updates: { full_name?: string; email?: string; job_title?: string }) {
  try {
    const actorId = await requireSuperAdmin()
    const admin = createAdminClient()

    // Get old data
    const { data: oldUser } = await admin
      .from('profiles')
      .select('email, full_name, job_title')
      .eq('id', userId)
      .single()

    if (!oldUser) {
      throw new Error('User not found')
    }

    // Update user
    const { error } = await admin
      .from('profiles')
      .update(updates)
      .eq('id', userId)

    if (error) throw error

    // Log action
    await logAdminAction(actorId, 'update_user_profile', 'user', userId, oldUser.email, {
      old: { email: oldUser.email, full_name: oldUser.full_name, job_title: oldUser.job_title },
      new: updates,
    })

    return { success: true, message: 'User updated' }
  } catch (error) {
    logger.error('Error updating user', error)
    throw error
  }
}

export async function updateCompanyPlan(
  companyId: string,
  newPlan: 'free' | 'individual' | 'pro' | 'business' | 'enterprise',
  reason?: string
) {
  try {
    const actorId = await requireSuperAdmin()
    const admin = createAdminClient()

    // Get company details before update
    const { data: company } = await admin
      .from('companies')
      .select('id, name, plan')
      .eq('id', companyId)
      .single()

    if (!company) {
      throw new Error('Company not found')
    }

    const oldPlan = company.plan

    // Validate plan
    const validPlans = ['free', 'individual', 'pro', 'business', 'enterprise']
    if (!validPlans.includes(newPlan)) {
      throw new Error(`Invalid plan: ${newPlan}`)
    }

    // Update company
    const { error } = await admin
      .from('companies')
      .update({ plan: newPlan })
      .eq('id', companyId)

    if (error) throw error

    // Log action
    await logAdminAction(actorId, 'update_company_plan', 'company', companyId, undefined, {
      company_name: company.name,
      old_plan: oldPlan,
      new_plan: newPlan,
      reason,
    })

    return { success: true, message: `Plan updated from ${oldPlan} to ${newPlan} for ${company.name}` }
  } catch (error) {
    logger.error('Error updating company plan', error)
    throw error
  }
}

export async function reactivateUser(userId: string) {
  try {
    const actorId = await requireSuperAdmin()
    const admin = createAdminClient()

    // Get user details before update
    const { data: user } = await admin
      .from('profiles')
      .select('email, is_active')
      .eq('id', userId)
      .single()

    if (!user) {
      throw new Error('User not found')
    }

    // Update user
    const { error } = await admin
      .from('profiles')
      .update({ is_active: true })
      .eq('id', userId)

    if (error) throw error

    // Log action
    await logAdminAction(actorId, 'reactivate_user', 'user', userId, user.email)

    return { success: true, message: `User ${user.email} reactivated` }
  } catch (error) {
    logger.error('Error reactivating user', error)
    throw error
  }
}

export async function updateUserCompany(userId: string, newCompanyId: string | null) {
  try {
    const actorId = await requireSuperAdmin()
    const admin = createAdminClient()

    // Get user details before update
    const { data: user } = await admin
      .from('profiles')
      .select('email, company_id, company:companies(name)')
      .eq('id', userId)
      .single()

    if (!user) {
      throw new Error('User not found')
    }

    const oldCompany = Array.isArray(user.company) ? user.company[0] : user.company
    const oldCompanyName = oldCompany?.name || 'No company'

    // Get new company name if provided
    let newCompanyName = 'No company'
    if (newCompanyId) {
      const { data: newCompany } = await admin
        .from('companies')
        .select('name')
        .eq('id', newCompanyId)
        .single()

      if (newCompany) {
        newCompanyName = newCompany.name
      }
    }

    // Update user
    const { error } = await admin
      .from('profiles')
      .update({ company_id: newCompanyId })
      .eq('id', userId)

    if (error) throw error

    // Log action
    await logAdminAction(actorId, 'update_user_company', 'user', userId, user.email, {
      old_company: oldCompanyName,
      new_company: newCompanyName,
    })

    return { success: true, message: `User company changed from ${oldCompanyName} to ${newCompanyName}` }
  } catch (error) {
    logger.error('Error updating user company', error)
    throw error
  }
}

export async function updateUserRole(userId: string, newRole: string) {
  try {
    const actorId = await requireSuperAdmin()
    const admin = createAdminClient()

    // Validate role
    const validRoles = ['owner', 'manager', 'member']
    if (!validRoles.includes(newRole)) {
      throw new Error(`Invalid role: ${newRole}`)
    }

    // Get user details before update
    const { data: user } = await admin
      .from('profiles')
      .select('email, role')
      .eq('id', userId)
      .single()

    if (!user) {
      throw new Error('User not found')
    }

    const oldRole = user.role

    // Update user
    const { error } = await admin
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) throw error

    // Log action
    await logAdminAction(actorId, 'update_user_role', 'user', userId, user.email, {
      old_role: oldRole,
      new_role: newRole,
    })

    return { success: true, message: `User role changed from ${oldRole} to ${newRole}` }
  } catch (error) {
    logger.error('Error updating user role', error)
    throw error
  }
}
