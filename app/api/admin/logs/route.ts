import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || []

async function checkAdmin(token: string) {
  const supabase = createServerSupabase(token)
  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes?.user
  return user && ADMIN_EMAILS.includes(user.email || "")
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token || !(await checkAdmin(token))) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 1000)
  const offset = Number(searchParams.get("offset")) || 0

  try {
    const admin = getAdminClient()

    // Get recent solves with user and challenge info
    const { data: solves } = await admin
      .from("solves")
      .select(`
        id,
        user_id,
        team_name,
        challenge_id,
        points,
        created_at,
        profiles!inner(display_name),
        challenges!inner(name, category)
      `)
      .order("created_at", { ascending: false })
      .limit(limit)

    // Get admin logs if the table exists
    let adminLogs: any[] = []
    try {
      const { data: logs } = await admin
        .from("admin_logs")
        .select(`
          id,
          admin_user_id,
          action,
          target_type,
          target_id,
          details,
          created_at
        `)
        .order("created_at", { ascending: false })
        .limit(50)

      adminLogs = logs || []
    } catch (e) {
      console.log("Admin logs table not available:", e)
    }

    // Transform solves into activity format
    const solveActivities = (solves || []).map((solve: any) => ({
      id: `solve_${solve.id}`,
      type: "solve",
      user_id: solve.user_id,
      user_name: solve.profiles?.display_name || "Unknown User",
      team_name: solve.team_name,
      challenge_id: solve.challenge_id,
      challenge_name: solve.challenges?.name || solve.challenge_id,
      points: solve.points,
      created_at: solve.created_at,
      description: `${solve.profiles?.display_name || "Unknown User"} solved "${solve.challenges?.name || solve.challenge_id}" (+${solve.points} pts) for team ${solve.team_name}`,
    }))

    // Transform admin logs into activity format
    const adminActivities = adminLogs.map((log: any) => ({
      id: `admin_${log.id}`,
      type: "admin",
      admin_user_id: log.admin_user_id,
      action: log.action,
      target_type: log.target_type,
      target_id: log.target_id,
      details: log.details,
      created_at: log.created_at,
      description: `Admin performed ${log.action.replace(/_/g, " ")} on ${log.target_type}: ${log.target_id}`,
    }))

    // Combine and sort all activities by timestamp
    const allActivities = [...solveActivities, ...adminActivities]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(offset, offset + limit)

    console.log(
      `Returning ${allActivities.length} activities (${solveActivities.length} solves, ${adminActivities.length} admin actions)`,
    )

    return NextResponse.json({
      activities: allActivities,
      pagination: { limit, offset, total: allActivities.length },
      debug: {
        solvesFound: solveActivities.length,
        adminLogsFound: adminActivities.length,
        totalActivities: allActivities.length,
      },
    })
  } catch (e) {
    console.error("Admin logs error:", e)
    return new NextResponse(`Internal error: ${e.message}`, { status: 500 })
  }
}
