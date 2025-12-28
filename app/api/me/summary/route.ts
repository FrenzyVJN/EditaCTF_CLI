import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token) return new NextResponse("Unauthorized", { status: 401 })

  try {
    const supabase = createServerSupabase(token)
    const { data: userRes, error: userError } = await supabase.auth.getUser()
    if (userError || !userRes?.user) {
      return new NextResponse("Invalid token", { status: 401 })
    }
    const user = userRes.user

    // Profile (team) with error handling
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("team_name, display_name")
      .eq("user_id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("Profile fetch error:", profileError)
    }

    const team = profile?.team_name ?? "guest"

    // Team score (from view) with error handling
    const { data: lbRow, error: lbError } = await supabase
      .from("leaderboard")
      .select("team, score, solves")
      .eq("team", team)
      .maybeSingle()

    if (lbError) {
      console.error("Leaderboard fetch error:", lbError)
    }

    const teamScore = Number(lbRow?.score ?? 0)
    const teamSolvesCount = Number(lbRow?.solves ?? 0)

    // User solved challenge IDs with error handling
    const { data: userSolves, error: userSolvesError } = await supabase
      .from("solves")
      .select("challenge_id")
      .eq("user_id", user.id)

    if (userSolvesError) {
      console.error("User solves fetch error:", userSolvesError)
    }

    const userSolvedIds = (userSolves ?? []).map((r: any) => String(r.challenge_id))

    // Team solved challenge IDs with error handling
    const { data: teamSolves, error: teamSolvesError } = await supabase
      .from("solves")
      .select("challenge_id")
      .eq("team_name", team)

    if (teamSolvesError) {
      console.error("Team solves fetch error:", teamSolvesError)
    }

    const teamSolvedIds = Array.from(new Set((teamSolves ?? []).map((r: any) => String(r.challenge_id))))

    // Fetch team members if in a team
    let teamMembers: string[] = []
    if (team !== "guest") {
      const { data: members, error: membersError } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("team_name", team)

      if (membersError) {
        console.error("Team members fetch error:", membersError)
      } else {
        teamMembers = members.map((m: any) => m.display_name).filter(Boolean)
      }
    }

    return NextResponse.json({
      team,
      display_name: profile?.display_name ?? null,
      teamMembers,
      teamScore,
      teamSolvedCount: teamSolvesCount,
      userSolvedIds,
      teamSolvedIds,
    })
  } catch (e: any) {
    console.error("Summary fetch error:", e)
    const msg = typeof e?.message === "string" ? e.message : "Failed to fetch user summary"
    return new NextResponse(msg, { status: 500 })
  }
}
