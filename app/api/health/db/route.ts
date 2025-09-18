import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

// Tries simple selects to verify tables/views exist.
// Returns booleans and error messages for quick diagnosis.
export async function GET() {
  const supabase = createServerSupabase()

  async function checkTable(name: string) {
    try {
      const { error } = await supabase.from(name as any).select("*").limit(1)
      return { exists: !error, error: error?.message ?? null }
    } catch (e: any) {
      return { exists: false, error: e?.message ?? "unknown error" }
    }
  }

  const checks = await Promise.all([
    checkTable("challenges"),
    checkTable("challenge_flags"),
    checkTable("profiles"),
    checkTable("solves"),
    checkTable("leaderboard"),
    checkTable("teams"),
    checkTable("docs"),
  ])

  const [challenges, challenge_flags, profiles, solves, leaderboard, teams, docs] = checks

  return NextResponse.json({
    ok:
      challenges.exists &&
      profiles.exists &&
      solves.exists &&
      leaderboard.exists &&
      teams.exists &&
      docs.exists,
    details: {
      challenges,
      challenge_flags,
      profiles,
      solves,
      leaderboard,
      teams,
      docs,
    },
    hints: [
      "If a table/view shows exists=false, run the SQL setup scripts in order.",
      "If only challenge_flags is missing, run the seed or insert flags with the service key.",
    ],
  })
}
