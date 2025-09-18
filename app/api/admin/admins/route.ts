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

// Get current admins
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token || !(await checkAdmin(token))) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  try {
    const admin = getAdminClient()

    // Get admin users from auth
    const { data: authUsers } = await admin.auth.admin.listUsers()
    const adminUsers = authUsers.users.filter((user) => ADMIN_EMAILS.includes(user.email || ""))

    // Get their profiles
    const adminProfiles = await Promise.all(
      adminUsers.map(async (user) => {
        const { data: profile } = await admin
          .from("profiles")
          .select("display_name, team_name")
          .eq("user_id", user.id)
          .maybeSingle()

        return {
          user_id: user.id,
          email: user.email,
          display_name: profile?.display_name,
          created_at: user.created_at,
          last_sign_in: user.last_sign_in_at,
        }
      }),
    )

    return NextResponse.json({ admins: adminProfiles })
  } catch (e) {
    console.error("Get admins error:", e)
    return new NextResponse("Failed to get admins", { status: 500 })
  }
}

// Add new admin
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token || !(await checkAdmin(token))) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  try {
    const body = await req.json()
    const { email } = body

    if (!email || typeof email !== "string") {
      return new NextResponse("Valid email required", { status: 400 })
    }

    const supabase = createServerSupabase(token)
    const { data: adminUser } = await supabase.auth.getUser()

    // Note: This requires updating the ADMIN_EMAILS environment variable
    // For now, we'll just log the action and return instructions
    const admin = getAdminClient()
    await admin.from("admin_logs").insert({
      admin_user_id: adminUser?.user?.id || "unknown",
      action: "request_add_admin",
      target_type: "admin",
      target_id: email,
      details: { requested_email: email },
    })

    return NextResponse.json({
      success: true,
      message: `Admin request logged for ${email}. Update ADMIN_EMAILS environment variable to: ${[...ADMIN_EMAILS, email].join(",")}`,
      instruction: "Add this email to your ADMIN_EMAILS environment variable and restart the application.",
    })
  } catch (e) {
    console.error("Add admin error:", e)
    return new NextResponse("Failed to add admin", { status: 500 })
  }
}
