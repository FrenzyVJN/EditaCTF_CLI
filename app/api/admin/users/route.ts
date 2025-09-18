import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

// Helper function to check admin permissions
async function checkAdminPermission(req: NextRequest, requiredRole: string[] = ['admin', 'super_admin']) {
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

    const hasRole = userRole && requiredRole.includes(userRole.role)
    const hasAdminEmail = ADMIN_EMAILS.includes(user.email || "")

    if (!hasRole && !hasAdminEmail) {
      return { error: "Insufficient permissions", status: 403 }
    }

    return { supabase, user, role: userRole?.role || 'admin' }
  } catch (error) {
    return { error: "Internal server error", status: 500 }
  }
}

// GET /api/admin/users - List all users with their roles and stats
export async function GET(req: NextRequest) {
  const authCheck = await checkAdminPermission(req)
  if ('error' in authCheck) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
  }

  const { supabase } = authCheck
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const search = searchParams.get('search') || ''

  try {
    // Get profiles data
    let query = supabase
      .from('profiles')
      .select(`
        user_id,
        display_name,
        team_name,
        created_at
      `)

    // Apply search filter
    if (search) {
      query = query.or(`display_name.ilike.%${search}%`)
    }

    const { data: profiles, error } = await query
      .range((page - 1) * limit, page * limit - 1)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching users:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Get solve counts
    const { data: solves } = await supabase
      .from('solves')
      .select('user_id')

    const solveCounts: Record<string, number> = {}
    solves?.forEach((solve) => {
      solveCounts[solve.user_id] = (solveCounts[solve.user_id] || 0) + 1
    })

    // Format the response
    const users = (profiles || []).map((profile) => ({
      ...profile,
      email: 'Email hidden',
      solveCount: solveCounts[profile.user_id] || 0,
    }))

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total: profiles?.length || 0,
        pages: Math.ceil((profiles?.length || 0) / limit)
      }
    })

  } catch (error) {
    console.error('Error in GET /api/admin/users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/users - Update user roles or create users
export async function POST(req: NextRequest) {
  const authCheck = await checkAdminPermission(req, ['super_admin'])
  if ('error' in authCheck) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
  }

  const { supabase, user } = authCheck

  try {
    const body = await req.json()
    const { action, userId, role, email } = body

    if (action === 'update_role') {
      if (!userId || !role) {
        return NextResponse.json({ error: 'User ID and role are required' }, { status: 400 })
      }

      // Check if role record exists
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .single()

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from('user_roles')
          .update({ 
            role,
            granted_at: new Date().toISOString(),
            is_active: true
          })
          .eq('user_id', userId)

        if (error) {
          return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
        }
      } else {
        // Create new role
        const { error } = await supabase
          .from('user_roles')
          .insert({
            user_id: userId,
            role,
            granted_by: user.id,
            is_active: true
          })

        if (error) {
          return NextResponse.json({ error: 'Failed to create role' }, { status: 500 })
        }
      }

      return NextResponse.json({ success: true, message: 'Role updated successfully' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Error in POST /api/admin/users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}