import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import bcrypt from "bcryptjs"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token) return new NextResponse("Unauthorized", { status: 401 })

  const { name, password } = await req.json().catch(() => ({}))
  const teamName = typeof name === "string" ? name.trim() : ""
  const pwd = typeof password === "string" ? password : ""
  if (!teamName || !pwd) return new NextResponse("Missing name or password", { status: 400 })
  if (!/^[a-z0-9:_-]{3,32}$/i.test(teamName)) return new NextResponse("Invalid team name", { status: 400 })

  const supabase = createServerSupabase(token)
  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes?.user
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { data: existing, error: selErr } = await supabase.from("ctf_teams").select("name").eq("name", teamName).maybeSingle()
  if (selErr) return new NextResponse("Team lookup failed", { status: 500 })
  if (existing) return new NextResponse("Team already exists", { status: 400 })

  const hash = await bcrypt.hash(pwd, 10)

  const { error: insErr } = await supabase
    .from("ctf_teams")
    .insert({ name: teamName, password_hash: hash, created_by: user.id })
  if (insErr) return new NextResponse("Failed to create team", { status: 500 })

  // Upsert profile to new team
  const { error: upErr } = await supabase.from("profiles").upsert(
    { user_id: user.id, team_name: teamName },
    { onConflict: "user_id" },
  )
  if (upErr) return new NextResponse("Failed to update profile", { status: 500 })

  // Optional: update historical solves for audit consistency
  await supabase.from("solves").update({ team_name: teamName }).eq("user_id", user.id)

  return NextResponse.json({ ok: true })
}
