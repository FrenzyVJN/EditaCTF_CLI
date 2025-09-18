import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

// Helper function to check admin permissions with role-based access
async function checkAdminPermission(req: NextRequest, requiredRole: string[] = ['admin', 'super_admin', 'moderator']) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  
  if (!token) {
    return { error: "Unauthorized", status: 401 }
  }

  try {
    const supabase = createServerSupabase(token)
    const { data: userRes } = await supabase.auth.getUser()
    const user = userRes?.user
    
    if (!user) {
      return { error: "Unauthorized", status: 401 }
    }

    // Check for hardcoded admin emails as fallback
    const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || []
    
    // Try to get role from user_roles table, fallback to admin emails
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role, granted_at, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    // Check database role first, fallback to hardcoded emails
    const isAuthorized = userRole ? 
      requiredRole.includes(userRole.role) : 
      ADMIN_EMAILS.includes(user.email || "")

    if (!isAuthorized) {
      return { error: "Insufficient permissions", status: 403 }
    }

    return { 
      supabase, 
      user, 
      role: userRole?.role || 'admin'
    }
  } catch (error) {
    return { error: "Internal server error", status: 500 }
  }
}

// GET /api/admin/roles - List all user roles
export async function GET(req: NextRequest) {
  const authCheck = await checkAdminPermission(req)
  if ('error' in authCheck) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
  }

  const { supabase } = authCheck
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  try {
    if (userId) {
      // Get specific user's role
      const { data: userRole, error } = await supabase
        .from('user_roles')
        .select(`
          *,
          profiles!inner(
            display_name,
            email,
            created_at
          )
        `)
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }

      return NextResponse.json({ role: userRole })
    } else {
      // Get all user roles with user info
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select(`
          *,
          profiles!inner(
            display_name,
            email,
            created_at,
            team_id,
            teams(name, display_name)
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 })
      }

      // Get role statistics
      const roleStats: Record<string, number> = {}
      roles?.forEach(role => {
        roleStats[role.role] = (roleStats[role.role] || 0) + 1
      })

      return NextResponse.json({ 
        roles: roles || [],
        statistics: roleStats,
        total: roles?.length || 0
      })
    }
  } catch (error) {
    console.error('Error in GET /api/admin/roles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/roles - Assign or update user role
export async function POST(req: NextRequest) {
  const authCheck = await checkAdminPermission(req, ['super_admin']) // Only super admins can assign roles
  if ('error' in authCheck) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
  }

  const { supabase, user: currentUser } = authCheck

  try {
    const body = await req.json()
    const { userId, role, reason } = body

    if (!userId || !role) {
      return NextResponse.json({ error: 'User ID and role are required' }, { status: 400 })
    }

    const validRoles = ['user', 'moderator', 'admin', 'super_admin']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Prevent users from assigning super_admin unless they are super_admin
    if (role === 'super_admin' && authCheck.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can assign super admin role' }, { status: 403 })
    }

    // Check if user exists
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('id', userId)
      .single()

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Upsert the role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .upsert({
        user_id: userId,
        role: role,
        granted_by: currentUser.id,
        granted_at: new Date().toISOString(),
        is_active: true
      })
      .select()
      .single()

    if (roleError) {
      console.error('Error assigning role:', roleError)
      return NextResponse.json({ error: 'Failed to assign role' }, { status: 500 })
    }

    // Log the role assignment
    await supabase
      .from('user_activity_logs')
      .insert({
        user_id: currentUser.id,
        action_type: 'role_assignment',
        details: {
          target_user: userId,
          target_email: targetUser.email,
          old_role: 'user', // We could track this better
          new_role: role,
          reason: reason
        }
      })

    return NextResponse.json({
      success: true,
      role: roleData,
      message: `Successfully assigned ${role} role to ${targetUser.display_name || targetUser.email}`
    })

  } catch (error) {
    console.error('Error in POST /api/admin/roles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/admin/roles - Remove user role (revert to default user)
export async function DELETE(req: NextRequest) {
  const authCheck = await checkAdminPermission(req, ['super_admin'])
  if ('error' in authCheck) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
  }

  const { supabase, user: currentUser } = authCheck
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
  }

  try {
    // Get user info for logging
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('email, display_name')
      .eq('id', userId)
      .single()

    // Get current role for logging
    const { data: currentRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single()

    // Delete the role (user reverts to default user role)
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)

    if (error) {
      return NextResponse.json({ error: 'Failed to remove role' }, { status: 500 })
    }

    // Log the role removal
    await supabase
      .from('user_activity_logs')
      .insert({
        user_id: currentUser.id,
        action_type: 'role_removal',
        details: {
          target_user: userId,
          target_email: targetUser?.email,
          removed_role: currentRole?.role || 'unknown'
        }
      })

    return NextResponse.json({
      success: true,
      message: `Successfully removed role from ${targetUser?.display_name || targetUser?.email || 'user'}`
    })

  } catch (error) {
    console.error('Error in DELETE /api/admin/roles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}