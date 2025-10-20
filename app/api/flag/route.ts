import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { createServerSupabase } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/rate-limiter"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body?.id ?? "").trim()
    const flag = String(body?.flag ?? "").trim()

    if (!id || !flag) {
      return new NextResponse("Missing id or flag", { status: 400 })
    }
    if (!/^editaCTF\{.*\}$/.test(flag)) {
      return NextResponse.json({ correct: false, message: "Invalid flag format. Expected editaCTF{...}" })
    }

    // Require authentication for flag submissions
    const authHeader = req.headers.get("authorization") || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
    if (!token) {
      return NextResponse.json({
        correct: false,
        message:
          "Please register and login first to submit flags. Use 'auth register <email> <password>' then 'auth login <email> <password>'",
      })
    }

    // Verify user and get profile
    const supabase = createServerSupabase(token)
    const { data: userRes } = await supabase.auth.getUser()
    const user = userRes?.user
    if (!user) {
      return NextResponse.json({
        correct: false,
        message: "Invalid session. Please login again with 'auth login <email> <password>'",
      })
    }

    // Check if user has set a display name
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, team_name")
      .eq("user_id", user.id)
      .maybeSingle()

    if (!profile?.display_name) {
      return NextResponse.json({
        correct: false,
        message: "Please set your display name first with 'profile name <your_name>' before submitting flags.",
      })
    }

    // Rate limiting - 5 submissions per minute per user
    const rateLimitKey = `user:${user.id}`
    if (!checkRateLimit(rateLimitKey, 5, 60000)) {
      return new NextResponse("Rate limit exceeded. Try again in a minute.", { status: 429 })
    }

    // Verify flag via admin client
    const admin = getAdminClient()
    const { data: secret, error: secErr } = await admin
      .from("challenge_flags")
      .select("flag")
      .eq("challenge_id", id)
      .single()
    if (secErr || !secret) {
      console.error("Flag verification error:", secErr, "Challenge ID:", id)
      return new NextResponse(`Unknown challenge id: ${id}. Error: ${secErr?.message || 'No flag found'}`, { status: 400 })
    }

    const correct = secret.flag === flag
    if (!correct) {
      return NextResponse.json({ correct: false, message: "Incorrect flag. Keep trying!" })
    }

    // Fetch challenge points
    const { data: ch } = await admin.from("challenges").select("points").eq("id", id).single()
    const points = Number(ch?.points ?? 0)

    // Handle team logic - if user doesn't have a real team, create individual guest team
    let teamName = profile?.team_name ?? `guest_${user.id}`
    let awarded = points

    // If user is still on default "guest" team, upgrade them to individual guest team
    if (teamName === "guest") {
      teamName = `guest_${user.id}`
      // Update their profile with the individual guest team
      await supabase
        .from("profiles")
        .upsert(
          { user_id: user.id, team_name: teamName, display_name: profile.display_name },
          { onConflict: "user_id" },
        )
    }

    // Check if this specific team already solved this challenge
    const { data: existingTeamSolve } = await supabase
      .from("solves")
      .select("id")
      .eq("team_name", teamName)
      .eq("challenge_id", id)
      .limit(1)

    if (existingTeamSolve && existingTeamSolve.length > 0) {
      awarded = 0
    }

    // Insert solve (ignore duplicates)
    await supabase.from("solves").insert({ user_id: user.id, team_name: teamName, challenge_id: id, points }, {
      onConflict: "user_id,challenge_id",
      ignoreDuplicates: true,
    } as any)

    return NextResponse.json({
      correct: true,
      points,
      awarded,
      message: awarded > 0 ? "Correct! Points awarded to your team." : "Correct! You already solved this challenge.",
    })
  } catch (e) {
    console.error("Flag submission error:", e)
    return new NextResponse("Invalid request", { status: 400 })
  }
}
