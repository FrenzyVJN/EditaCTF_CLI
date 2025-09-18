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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  if (!token || !(await checkAdmin(token))) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  try {
    const admin = getAdminClient()

    // Get all profiles with solve counts
    const { data: profiles } = await admin
      .from("profiles")
      .select(`
        user_id,
        display_name,
        team_name,
        created_at
      `)
      .order("created_at", { ascending: false })

    // Get auth users data
    const { data: authUsers } = await admin.auth.admin.listUsers()

    // Get solve counts per user
    const { data: solveCounts } = await admin
      .from("solves")
      .select("user_id")
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        data?.forEach((solve) => {
          counts[solve.user_id] = (counts[solve.user_id] || 0) + 1
        })
        return { data: counts }
      })

    // Combine profile and auth data
    const users = (profiles || []).map((profile) => {
      const authUser = authUsers.users.find((u) => u.id === profile.user_id)
      return {
        ...profile,
        email: authUser?.email || "Unknown",
        email_confirmed: authUser?.email_confirmed_at ? true : false,
        last_sign_in: authUser?.last_sign_in_at,
        solveCount: solveCounts?.data?.[profile.user_id] || 0,
      }
    })

    // Also include users who have auth accounts but no profiles
    const usersWithoutProfiles = authUsers.users
      .filter((authUser) => !profiles?.some((p) => p.user_id === authUser.id))
      .map((authUser) => ({
        user_id: authUser.id,
        display_name: null,
        team_name: "guest",
        created_at: authUser.created_at,
        email: authUser.email || "Unknown",
        email_confirmed: authUser.email_confirmed_at ? true : false,
        last_sign_in: authUser.last_sign_in_at,
        solveCount: 0,
      }))

    const allUsers = [...users, ...usersWithoutProfiles]

    return NextResponse.json({ users: allUsers })
  } catch (e) {
    console.error("Admin users error:", e)
    return new NextResponse("Internal error", { status: 500 })
  }
}
