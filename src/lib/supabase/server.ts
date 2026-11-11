import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL, supabaseSecretKey } from "./env";

/** Cliente com a sessão do usuário: tudo passa pela RLS. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* Server Component */ }
      },
    },
  });
}

/** Service role: SOMENTE no servidor, e sempre depois de verificar a permissão do usuário. */
export function supabaseAdmin() {
  return createClient(SUPABASE_URL, supabaseSecretKey(), {
    auth: { persistSession: false },
  });
}
