import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import bcrypt from "bcryptjs"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token) return new NextResponse("Unauthorized", { status: 401 })

  const { name, password, description, isPublic = false } = await req.json().catch(() => ({}))
  const teamName = typeof name === "string" ? name.trim() : ""
  const pwd = typeof password === "string" ? password : ""
  const teamDescription = typeof description === "string" ? description.trim().slice(0, 500) : ""
  
  if (!teamName || !pwd) return new NextResponse("Missing name or password", { status: 400 })
  if (!/^[a-z0-9:_-]{3,32}$/i.test(teamName)) return new NextResponse("Invalid team name", { status: 400 })
  if (pwd.length < 4) return new NextResponse("Password too short (minimum 4 characters)", { status: 400 })

  const supabase = createServerSupabase(token)
  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes?.user
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  // Check if user already has a real team (not guest)
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("team_name")
    .eq("user_id", user.id)
    .single()

  if (currentProfile?.team_name && !currentProfile.team_name.startsWith("guest_")) {
    return new NextResponse("You must leave your current team first", { status: 400 })
  }

  // Check if team name already exists
  const { data: existing, error: selErr } = await supabase.from("ctf_teams").select("name").eq("name", teamName).maybeSingle()
  if (selErr) return new NextResponse("Team lookup failed", { status: 500 })
  if (existing) return new NextResponse("Team already exists", { status: 400 })

  const hash = await bcrypt.hash(pwd, 10)

  try {
    // Create team with enhanced data
    const { error: insErr } = await supabase
      .from("ctf_teams")
      .insert({ 
        name: teamName, 
        password_hash: hash, 
        created_by: user.id,
        description: teamDescription,
        is_public: isPublic,
        max_members: 4, // Default max team size
        created_at: new Date().toISOString()
      })
    if (insErr) return new NextResponse("Failed to create team", { status: 500 })

    // Update user profile to join the team as captain
    const { error: upErr } = await supabase.from("profiles").upsert(
      { user_id: user.id, team_name: teamName },
      { onConflict: "user_id" },
    )
    if (upErr) return new NextResponse("Failed to update profile", { status: 500 })

    // Create team membership record with role
    try {
      await supabase
        .from("team_memberships")
        .insert({
          team_name: teamName,
          user_id: user.id,
          role: "captain",
          joined_at: new Date().toISOString()
        })
    } catch (error) {
      // Don't fail if table doesn't exist yet
      console.warn('Team memberships table not ready:', error)
    }

    // Initialize team statistics
    try {
      await supabase
        .from("team_statistics")
        .insert({
          team_name: teamName,
          total_points: 0,
          challenges_solved: 0,
          members_count: 1,
          first_blood_count: 0,
          last_activity: new Date().toISOString()
        })
    } catch (error) {
      // Don't fail if table doesn't exist yet
      console.warn('Team statistics table not ready:', error)
    }

    // Update historical solves for audit consistency
    await supabase.from("solves").update({ team_name: teamName }).eq("user_id", user.id)

    // Log team creation activity
    try {
      await supabase
        .from("user_activity_logs")
        .insert({
          user_id: user.id,
          action_type: "team_created",
          details: {
            team_name: teamName,
            is_public: isPublic,
            has_description: !!teamDescription
          }
        })
    } catch (error) {
      // Don't fail if logging fails
      console.warn('Activity logging failed:', error)
    }

    return NextResponse.json({ 
      ok: true, 
      team: {
        name: teamName,
        description: teamDescription,
        isPublic,
        role: "captain",
        membersCount: 1
      }
    })

  } catch (error) {
    console.error("Team creation error:", error)
    return new NextResponse("Failed to create team", { status: 500 })
  }
}
