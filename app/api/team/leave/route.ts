import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token) return new NextResponse("Unauthorized", { status: 401 })

  const supabase = createServerSupabase(token)
  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes?.user
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const solo = `solo-${String(user.id).slice(0, 8)}`

  const { error: upErr } = await supabase.from("profiles").upsert(
    { user_id: user.id, team_name: solo },
    { onConflict: "user_id" },
  )
  if (upErr) return new NextResponse("Failed to leave team", { status: 500 })

  // Optional: update historical solves for audit consistency
  await supabase.from("solves").update({ team_name: solo }).eq("user_id", user.id)

  return NextResponse.json({ ok: true, team: solo })
}
