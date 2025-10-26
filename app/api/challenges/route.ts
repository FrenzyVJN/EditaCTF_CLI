import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id") || searchParams.get("hint")

  const supabase = createServerSupabase()

  if (id) {
    const [{ data: challenge, error: challengeError }, { data: hintData, error: hintError }] = await Promise.all([
      supabase
        .from("challenges")
        .select("id,name,category,points,difficulty,description,daily,files")
        .eq("id", id)
        .single(),
      supabase
        .from("challenges")
        .select("hint")
        .eq("id", id)
        .single(),
    ])
    if (challengeError || !challenge) return new NextResponse("Not found", { status: 404 })
    // hintData may be null if not present
    return NextResponse.json({ challenge, hint: hintData?.hint ?? null })
  }

  // List all challenges (no hint)
  const { data, error } = await supabase
    .from("challenges")
    .select("id,name,category,points,difficulty,daily")
    .order("points", { ascending: true })
  if (error) return new NextResponse("Failed to load challenges", { status: 500 })
  return NextResponse.json({ challenges: data })
}
