import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  const hintId = searchParams.get("hint")

  const supabase = createServerSupabase()

  if (id) {
    const { data, error } = await supabase
      .from("challenges")
      .select("id,name,category,points,difficulty,description,daily,files")
      .eq("id", id)
      .single()
    if (error || !data) return new NextResponse("Not found", { status: 404 })
    return NextResponse.json({ challenge: data })
  }

  if (hintId) {
    const { data, error } = await supabase.from("challenges").select("hint").eq("id", hintId).single()
    if (error || !data) return new NextResponse("Not found", { status: 404 })
    return NextResponse.json({ hint: data.hint })
  }

  const { data, error } = await supabase
    .from("challenges")
    .select("id,name,category,points,difficulty,daily")
    .order("points", { ascending: true })
  if (error) return new NextResponse("Failed to load challenges", { status: 500 })
  return NextResponse.json({ challenges: data })
}
