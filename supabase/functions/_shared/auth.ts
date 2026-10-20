import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function isAuthenticated(request: Request): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase auth environment is not configured");
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(match[1]);
  return !error && Boolean(data.user);
}
