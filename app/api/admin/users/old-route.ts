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

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role, granted_at, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!userRole || !requiredRole.includes(userRole.role)) {
      return { error: "Insufficient permissions", status: 403 }
    }

    return { supabase, user, role: userRole.role }
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
      query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: users, error, count } = await query
      .range((page - 1) * limit, page * limit - 1)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching users:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    })

  } catch (error) {
    console.error('Error in GET /api/admin/users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
