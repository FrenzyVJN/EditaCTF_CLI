import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabase()
    
    // First authenticate the user
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Check if user has admin role
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role, granted_at, is_active')
      .eq('user_id', authData.user.id)
      .eq('is_active', true)
      .single()

    if (roleError || !userRole || !['admin', 'super_admin'].includes(userRole.role)) {
      // Sign out the user if they don't have admin privileges
      await supabase.auth.signOut()
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Get user profile information
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, team_id')
      .eq('id', authData.user.id)
      .single()

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        display_name: profile?.display_name,
        role: userRole.role,
        team_id: profile?.team_id,
        role_assigned: userRole.granted_at
      },
      session: authData.session
    })

  } catch (error) {
    console.error('Admin auth error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Get current admin session and role info
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const supabase = createServerSupabase(token)
    const { data: userRes } = await supabase.auth.getUser()
    const user = userRes?.user
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has admin role
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role, granted_at, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (roleError || !userRole || !['admin', 'super_admin'].includes(userRole.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    // Get user profile information
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, team_id')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      admin: true,
      user: {
        id: user.id,
        email: user.email,
        display_name: profile?.display_name,
        role: userRole.role,
        team_id: profile?.team_id,
        role_assigned: userRole.granted_at
      }
    })
  } catch (error) {
    console.error('Admin session check error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
