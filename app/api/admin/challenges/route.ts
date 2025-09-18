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

    // Get challenges with flags and solve counts
    const { data: challenges } = await admin
      .from("challenges")
      .select(`
        *,
        challenge_flags(flag)
      `)
      .order("category", { ascending: true })
      .order("points", { ascending: true })

    // Get solve counts per challenge
    const { data: solveCounts } = await admin
      .from("solves")
      .select("challenge_id")
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        data?.forEach((solve) => {
          counts[solve.challenge_id] = (counts[solve.challenge_id] || 0) + 1
        })
        return { data: counts }
      })

    const enrichedChallenges =
      challenges?.map((challenge) => ({
        ...challenge,
        flag: challenge.challenge_flags?.[0]?.flag || null,
        solveCount: solveCounts?.data?.[challenge.id] || 0,
      })) || []

    return NextResponse.json({ challenges: enrichedChallenges })
  } catch (e) {
    console.error("Admin challenges error:", e)
    return new NextResponse("Internal error", { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token || !(await checkAdmin(token))) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  try {
    const body = await req.json()
    const { id, name, category, points, difficulty, description, daily, files, hint, flag } = body

    if (!id || !name || !category || !points || !flag) {
      return new NextResponse("Missing required fields", { status: 400 })
    }

    const admin = getAdminClient()

    // Insert/update challenge
    const { error: challengeError } = await admin.from("challenges").upsert({
      id,
      name,
      category,
      points: Number(points),
      difficulty: difficulty || "medium",
      description: description || "",
      daily: Boolean(daily),
      files: files || [],
      hint: hint || "",
    })

    if (challengeError) throw challengeError

    // Insert/update flag
    const { error: flagError } = await admin.from("challenge_flags").upsert({
      challenge_id: id,
      flag,
    })

    if (flagError) throw flagError

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Admin challenge create error:", e)
    return new NextResponse("Failed to create challenge", { status: 500 })
  }
}
