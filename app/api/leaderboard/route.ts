import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

type Row = {
  team: string
  score: number
  solves: number
  first_solve_at: string | null
}

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase()
  const { data, error } = await supabase.from("leaderboard").select("*")
  if (error) return new NextResponse("Failed to load leaderboard", { status: 500 })

  const rows: Row[] = (data as any[])?.map((r) => ({
    team: r.team,
    score: Number(r.score ?? 0),
    solves: Number(r.solves ?? 0),
    first_solve_at: r.first_solve_at ?? null,
  })) ?? []

  rows.sort((a, b) => {
    const byScore = b.score - a.score
    if (byScore !== 0) return byScore
    const at = a.first_solve_at ? new Date(a.first_solve_at).getTime() : Number.POSITIVE_INFINITY
    const bt = b.first_solve_at ? new Date(b.first_solve_at).getTime() : Number.POSITIVE_INFINITY
    return at - bt
  })

  return NextResponse.json({
    leaderboard: rows.map((r, idx) => ({
      rank: idx + 1,
      team: r.team,
      score: r.score,
      solves: r.solves,
    })),
    updatedAt: new Date().toISOString(),
  })
}
