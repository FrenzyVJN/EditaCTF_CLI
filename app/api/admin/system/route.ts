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

  try {
    const admin = getAdminClient()

    // Get system stats
    const [
      { count: totalUsers },
      { count: totalChallenges },
      { count: totalSolves },
      { count: totalTeams },
      { data: recentActivity },
    ] = await Promise.all([
      admin.from("profiles").select("*", { count: "exact", head: true }),
      admin.from("challenges").select("*", { count: "exact", head: true }),
      admin.from("solves").select("*", { count: "exact", head: true }),
      admin.from("teams").select("*", { count: "exact", head: true }),
      admin.from("solves").select("created_at").order("created_at", { ascending: false }).limit(10),
    ])

    // Calculate activity in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: recentSolves } = await admin
      .from("solves")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneDayAgo)

    return NextResponse.json({
      stats: {
        totalUsers: totalUsers || 0,
        totalChallenges: totalChallenges || 0,
        totalSolves: totalSolves || 0,
        totalTeams: totalTeams || 0,
        recentSolves: recentSolves || 0,
        lastActivity: recentActivity?.[0]?.created_at || null,
      },
      environment: {
        adminEmails: ADMIN_EMAILS,
        nodeEnv: process.env.NODE_ENV,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, "").split(".")[0] + ".supabase.co",
      },
    })
  } catch (e) {
    console.error("System stats error:", e)
    return new NextResponse("Failed to get system stats", { status: 500 })
  }
}
