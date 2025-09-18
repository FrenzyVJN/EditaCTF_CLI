import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { rulesText as fallbackRules } from "@/lib/ctf-data"

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase()
  // Optional: load rules from a "docs" table where key='rules'
  const { data } = await supabase.from("docs").select("value").eq("key", "rules").maybeSingle()
  const rules = (data?.value as string | undefined) ?? fallbackRules
  return new NextResponse(rules, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
