import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export function createServerSupabase(authBearerToken?: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error(
      "Supabase is not configured on server. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    )
  }

  // Validate token format if provided
  if (authBearerToken && !authBearerToken.match(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)) {
    throw new Error("Invalid JWT token format")
  }

  return createClient(url, anon, {
    global: {
      headers: authBearerToken
        ? {
            Authorization: `Bearer ${authBearerToken}`,
          }
        : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
