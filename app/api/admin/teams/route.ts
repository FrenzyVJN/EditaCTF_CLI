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

    // Get all teams with member details and solve counts
    const { data: teams } = await admin.from("teams").select("*").order("score", { ascending: false })

    // Get team members with user details
    const { data: profiles } = await admin
      .from("profiles")
      .select(`
        user_id,
        display_name,
        team_name,
        created_at
      `)
      .order("team_name", { ascending: true })

    // Get password-protected teams
    const { data: ctfTeams } = await admin.from("ctf_teams").select("name, created_by, created_at")

    // Organize data
    const teamData = (teams || []).map((team) => {
      const members = (profiles || []).filter((p) => p.team_name === team.name)
      const isPasswordProtected = ctfTeams?.some((ct) => ct.name === team.name)
      const createdAt = ctfTeams?.find((ct) => ct.name === team.name)?.created_at

      return {
        ...team,
        members: members.map((m) => ({
          user_id: m.user_id,
          display_name: m.display_name,
          joined_at: m.created_at,
        })),
        isPasswordProtected,
        created_at: createdAt,
      }
    })

    return NextResponse.json({ teams: teamData })
  } catch (e) {
    console.error("Admin teams error:", e)
    return new NextResponse("Internal error", { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token || !(await checkAdmin(token))) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const teamName = searchParams.get("name")
    if (!teamName) {
      return new NextResponse("Missing team name", { status: 400 })
    }

    const admin = getAdminClient()

    // Move all team members to guest status
    await admin.from("profiles").update({ team_name: "guest" }).eq("team_name", teamName)

    // Update solves to guest team
    await admin.from("solves").update({ team_name: "guest" }).eq("team_name", teamName)

    // Delete password-protected team entry
    await admin.from("ctf_teams").delete().eq("name", teamName)

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Admin team delete error:", e)
    return new NextResponse("Failed to delete team", { status: 500 })
  }
}
