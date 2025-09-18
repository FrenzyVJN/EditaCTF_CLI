import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

// Simple admin check - you can enhance this with proper admin roles
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || []

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token) return new NextResponse("Unauthorized", { status: 401 })

  try {
    const supabase = createServerSupabase(token)
    const { data: userRes } = await supabase.auth.getUser()
    const user = userRes?.user
    if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    return NextResponse.json({
      admin: true,
      user: { id: user.id, email: user.email },
    })
  } catch {
    return new NextResponse("Unauthorized", { status: 401 })
  }
}
