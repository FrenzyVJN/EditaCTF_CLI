import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null = null

export function getSupabaseClient() {
  if (client) return client
  const url = process.env.NEXT_PRIVATE_SUPABASE_URL
  const anon = process.env.NEXT_PRIVATE_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error("Supabase is not configured. Add NEXT_PRIVATE_SUPABASE_URL and NEXT_PRIVATE_SUPABASE_ANON_KEY.")
  }
  client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  return client
}
