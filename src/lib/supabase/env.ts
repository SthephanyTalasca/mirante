// Aceita as chaves novas do Supabase (publishable/secret) e as antigas (anon/service_role).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Chave secreta: só no servidor e no worker. Nunca com prefixo NEXT_PUBLIC_. */
export function supabaseSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Defina SUPABASE_SECRET_KEY (Supabase → Project Settings → API Keys → Secret keys).");
  return key;
}
