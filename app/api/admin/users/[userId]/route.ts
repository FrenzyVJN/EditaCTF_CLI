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

async function logAdminAction(
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: any,
) {
  try {
    const admin = getAdminClient()
    await admin.from("admin_logs").insert({
      admin_user_id: adminUserId,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details || {},
    })
  } catch (e) {
    console.error("Failed to log admin action:", e)
  }
}

// Update user profile
export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token || !(await checkAdmin(token))) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  try {
    const body = await req.json()
    const { display_name, team_name } = body
    const userId = params.userId

    const admin = getAdminClient()
    const supabase = createServerSupabase(token)
    const { data: adminUser } = await supabase.auth.getUser()

    // Update profile
    const updates: any = {}
    if (display_name !== undefined) updates.display_name = display_name
    if (team_name !== undefined) updates.team_name = team_name

    const { error } = await admin.from("profiles").upsert({ user_id: userId, ...updates }, { onConflict: "user_id" })

    if (error) throw error

    await logAdminAction(adminUser?.user?.id || "unknown", "update_user", "user", userId, { updates })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Admin user update error:", e)
    return new NextResponse("Failed to update user", { status: 500 })
  }
}

// Delete user
export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
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

    // Delete user's solves
    await admin.from("solves").delete().eq("user_id", userId)

    // Delete user's profile
    await admin.from("profiles").delete().eq("user_id", userId)

    // Delete auth user
    await admin.auth.admin.deleteUser(userId)

    await logAdminAction(adminUser?.user?.id || "unknown", "delete_user", "user", userId)

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Admin user delete error:", e)
    return new NextResponse("Failed to delete user", { status: 500 })
  }
}
