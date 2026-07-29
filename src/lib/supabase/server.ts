import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/env";

/**
 * Server-side Supabase client bound to the request's auth cookies.
 * Queries run as the signed-in user, so RLS is always enforced.
 *
 * Returns null when Supabase is not configured — callers must degrade to
 * an explicit "not configured" state instead of crashing.
 *
 * The client is intentionally untyped until database types are generated
 * from the live project (see README); data-access modules type every row at
 * the mapping boundary using src/lib/supabase/types.ts.
 */
export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component where cookies are read-only;
            // middleware refreshes the session instead.
          }
        },
      },
    }
  );
}
