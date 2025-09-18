import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

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

export async function GET(req: NextRequest) {
  const authCheck = await checkAdminPermission(req)
  if ('error' in authCheck) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
  }

  const { supabase } = authCheck

  try {
    // Get database statistics
    const [
      { count: totalUsers },
      { count: totalTeams },
      { count: totalChallenges },
      { count: totalSubmissions },
      { count: activeUsers }
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('teams').select('*', { count: 'exact', head: true }),
      supabase.from('challenges').select('*', { count: 'exact', head: true }),
      supabase.from('solves').select('*', { count: 'exact', head: true }),
      supabase
        .from('user_activity_logs')
        .select('user_id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
    ])

    // Get competition settings if table exists
    let competitionSettings = null
    try {
      const { data } = await supabase
        .from('competition_settings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      competitionSettings = data
    } catch (error) {
      // Table might not exist yet
      competitionSettings = null
    }

    // Get recent activity logs if table exists
    let recentActivity: any[] = []
    try {
      const { data } = await supabase
        .from('user_activity_logs')
        .select(`
          id,
          user_id,
          action_type,
          details,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(10)
      recentActivity = data || []
    } catch (error) {
      // Table might not exist yet
      recentActivity = []
    }

    // Get role distribution
    let roleStats: Record<string, number> = {}
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
      
      if (data) {
        data.forEach(role => {
          roleStats[role.role] = (roleStats[role.role] || 0) + 1
        })
      }
    } catch (error) {
      // Table might not exist yet
      roleStats = {}
    }

    return NextResponse.json({
      system: {
        version: "1.0.0",
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
      },
      statistics: {
        users: {
          total: totalUsers || 0,
          active24h: activeUsers || 0,
          roleDistribution: roleStats
        },
        teams: {
          total: totalTeams || 0
        },
        challenges: {
          total: totalChallenges || 0
        },
        submissions: {
          total: totalSubmissions || 0
        }
      },
      competition: competitionSettings || {
        name: "EditaCTF",
        status: "active",
        registration_open: true,
        allow_team_creation: true,
        max_team_size: 4
      },
      recentActivity: recentActivity
    })

  } catch (error) {
    console.error('Error in GET /api/admin/system:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
