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

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token || !(await checkAdmin(token))) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  try {
    const userId = params.userId
    const admin = getAdminClient()
    const supabase = createServerSupabase(token)
    const { data: adminUser } = await supabase.auth.getUser()

    // Get user's email
    const { data: user } = await admin.auth.admin.getUserById(userId)
    if (!user.user?.email) {
      return new NextResponse("User email not found", { status: 404 })
    }

    // Send password reset email
    const { error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: user.user.email,
    })

    if (error) throw error

    // Log admin action
    await admin.from("admin_logs").insert({
      admin_user_id: adminUser?.user?.id || "unknown",
      action: "send_password_reset",
      target_type: "user",
      target_id: userId,
      details: { email: user.user.email },
    })

    return NextResponse.json({
      success: true,
      message: `Password reset link sent to ${user.user.email}`,
    })
  } catch (e) {
    console.error("Password reset error:", e)
    return new NextResponse("Failed to send password reset", { status: 500 })
  }
}
