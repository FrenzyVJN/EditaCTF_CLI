import { createClient } from "@supabase/supabase-js"

export function getAdminClient() {
  const url = process.env.NEXT_PRIVATE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error("Supabase Admin not configured. Add NEXT_PRIVATE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
