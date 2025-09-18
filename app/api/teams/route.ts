import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase()
  const { data, error } = await supabase.from("teams").select("*")
  if (error) return new NextResponse("Failed to load teams", { status: 500 })

  const teams = (data ?? []).map((r: any) => ({
    name: String(r.name),
    members: Number(r.members ?? 0),
    score: Number(r.score ?? 0),
  }))

  teams.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  return NextResponse.json({
    teams,
    updatedAt: new Date().toISOString(),
  })
}
