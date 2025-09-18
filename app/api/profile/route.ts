import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token) return new NextResponse("Unauthorized", { status: 401 })
  try {
    const supabase = createServerSupabase(token)
    const { data: userRes } = await supabase.auth.getUser()
    const user = userRes?.user
    if (!user) return new NextResponse("Unauthorized", { status: 401 })
    const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle()
    if (error) throw error
    return NextResponse.json({ profile: data ?? null })
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "profiles table not found. Run DB setup."
    return new NextResponse(msg, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  // Team changes are not allowed here; use /api/team/* endpoints.
  const body = await req.json().catch(() => ({}))
  if (body?.team || body?.team_name) {
    return new NextResponse("Use /api/team/create or /api/team/join to change team.", { status: 400 })
  }

  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token) return new NextResponse("Unauthorized", { status: 401 })

  try {
    const supabase = createServerSupabase(token)
    const { data: userRes } = await supabase.auth.getUser()
    const user = userRes?.user
    if (!user) return new NextResponse("Unauthorized", { status: 401 })

    const displayNameRaw = body?.display_name
    if (typeof displayNameRaw !== "string") {
      return new NextResponse("Missing display_name", { status: 400 })
    }
    const displayName = displayNameRaw.trim()
    if (displayName.length < 3 || displayName.length > 32) {
      return new NextResponse("display_name must be 3-32 characters", { status: 400 })
    }
    if (!/^[\w .-]+$/.test(displayName)) {
      return new NextResponse("display_name allows letters, numbers, space, underscore, dot, and dash", { status: 400 })
    }

    // Check if display name is already taken by another user
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("display_name", displayName)
      .neq("user_id", user.id)
      .maybeSingle()

    if (existingProfile) {
      return new NextResponse("Display name already taken. Please choose a different name.", { status: 400 })
    }

    // Always ensure we have a team_name for the NOT NULL constraint
    let teamName = `guest_${user.id}` // Individual guest team by default

    // Try to get existing team_name
    const { data: existing } = await supabase.from("profiles").select("team_name").eq("user_id", user.id).maybeSingle()

    if (existing?.team_name && existing.team_name !== "guest") {
      teamName = existing.team_name
    } else {
      // User doesn't have a profile yet or is on old "guest" team, check if they're in any real team via solves
      const { data: recentSolve } = await supabase
        .from("solves")
        .select("team_name")
        .eq("user_id", user.id)
        .not("team_name", "like", "guest%") // Exclude guest teams
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (recentSolve?.team_name) {
        teamName = recentSolve.team_name
      }
    }

    const payload: any = { user_id: user.id, team_name: teamName, display_name: displayName }

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" })
    if (error) {
      // Handle unique constraint violation for display_name
      if (error.code === "23505" && error.message.includes("display_name")) {
        return new NextResponse("Display name already taken. Please choose a different name.", { status: 400 })
      }
      throw error
    }

    // Return the updated profile
    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle()
    return NextResponse.json({ ok: true, profile })
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "profiles table not found. Run DB setup."
    return new NextResponse(msg, { status: 500 })
  }
}
