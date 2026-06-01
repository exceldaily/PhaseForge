'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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
  const supabase = await createClient()
  const { error } = await supabase.rpc('bypass_rls', {
    query: 'INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, target_email, changes) VALUES ($1, $2, $3, $4, $5, $6)',
    params: [actorId, action, targetType, targetId, targetEmail, JSON.stringify(changes)],
  }).catch(() => {
    // Fallback: insert directly without bypass if RPC doesn't exist
    return supabase
      .from('admin_audit_logs')
      .insert({
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId,
        target_email: targetEmail,
        changes: changes || {},
      })
  })

  if (error) {
    console.error('Failed to log admin action:', error)
  }
}

export async function deactivateUser(userId: string, reason?: string) {
  try {
    const actorId = await requireSuperAdmin()
    const supabase = await createClient()

    // Get user details before update
    const { data: user } = await supabase
      .from('profiles')
      .select('email, is_active')
      .eq('id', userId)
      .single()

    if (!user) {
      throw new Error('User not found')
    }

    // Update user
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('id', userId)

    if (error) throw error

    // Log action
    await logAdminAction(actorId, 'deactivate_user', 'user', userId, user.email, { reason })

    return { success: true, message: `User ${user.email} deactivated` }
  } catch (error) {
    console.error('Error deactivating user:', error)
    throw error
  }
}

export async function deleteUser(userId: string, reason?: string) {
  try {
    const actorId = await requireSuperAdmin()
    const supabase = await createClient()

    // Get user details before delete
    const { data: user } = await supabase
      .from('profiles')
      .select('email, id')
      .eq('id', userId)
      .single()

    if (!user) {
      throw new Error('User not found')
    }

    // Delete user (they'll need to re-signup)
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (error) throw error

    // Log action
    await logAdminAction(actorId, 'delete_user', 'user', userId, user.email, { reason })

    return { success: true, message: `User ${user.email} deleted` }
  } catch (error) {
    console.error('Error deleting user:', error)
    throw error
  }
}

export async function promoteToSuperAdmin(userId: string) {
  try {
    const actorId = await requireSuperAdmin()
    const supabase = await createClient()

    // Get user details
    const { data: user } = await supabase
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
    const { error } = await supabase
      .from('profiles')
      .update({ is_super_admin: true })
      .eq('id', userId)

    if (error) throw error

    // Log action
    await logAdminAction(actorId, 'promote_to_super_admin', 'user', userId, user.email)

    return { success: true, message: `User ${user.email} promoted to super admin` }
  } catch (error) {
    console.error('Error promoting user:', error)
    throw error
  }
}

export async function demoteFromSuperAdmin(userId: string) {
  try {
    const actorId = await requireSuperAdmin()
    const supabase = await createClient()

    // Get user details
    const { data: user } = await supabase
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
    const { error } = await supabase
      .from('profiles')
      .update({ is_super_admin: false })
      .eq('id', userId)

    if (error) throw error

    // Log action
    await logAdminAction(actorId, 'demote_from_super_admin', 'user', userId, user.email)

    return { success: true, message: `User ${user.email} demoted from super admin` }
  } catch (error) {
    console.error('Error demoting user:', error)
    throw error
  }
}

export async function updateUserProfile(userId: string, updates: { full_name?: string; email?: string; job_title?: string }) {
  try {
    const actorId = await requireSuperAdmin()
    const supabase = await createClient()

    // Get old data
    const { data: oldUser } = await supabase
      .from('profiles')
      .select('email, full_name, job_title')
      .eq('id', userId)
      .single()

    if (!oldUser) {
      throw new Error('User not found')
    }

    // Update user
    const { error } = await supabase
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
    console.error('Error updating user:', error)
    throw error
  }
}
