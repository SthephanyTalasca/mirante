import { SettingsForm, TeamPanel } from "@/components/settings";
import { PageHeader } from "@/components/ui";
import { withDefaults } from "@/lib/analysis/types";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Configurações" };

export default async function Configuracoes() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("org_id,role").eq("id", user!.id).single();
  const isAdmin = profile?.role === "admin";
  const [{ data: org }, { data: team }, { data: invites }, { data: logs }] = await Promise.all([
    supabase.from("organizations").select("name,settings").eq("id", profile!.org_id).single(),
    supabase.from("profiles").select("id,full_name,role,created_at").order("created_at"),
    isAdmin ? supabase.from("org_invites").select("email,role,created_at") : Promise.resolve({ data: [] }),
    isAdmin ? supabase.from("audit_logs").select("action,entity,created_at,details,actor").order("created_at", { ascending: false }).limit(40) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map((team ?? []).map((t) => [t.id, t.full_name ?? "—"]));

  return (
    <>
      <PageHeader title="Configurações" subtitle={isAdmin ? "Análise, privacidade, equipe e auditoria." : "Somente administradores alteram estas configurações."} />
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SettingsForm orgName={org?.name ?? ""} settings={withDefaults(org?.settings)} canEdit={isAdmin} />
        <div className="space-y-6">
          <TeamPanel me={user!.id} team={team ?? []} invites={invites ?? []} canEdit={isAdmin} />
          {isAdmin && (
            <section className="panel p-6">
              <h2 className="mb-3 font-semibold">Auditoria recente</h2>
              <ul className="divide-y divide-line-soft text-sm">
                {(logs ?? []).map((l, i) => (
                  <li key={i} className="flex justify-between gap-4 py-2">
                    <span><span className="font-medium">{names.get(l.actor) ?? "Sistema"}</span> <span className="text-slate">{String(l.action).replace(/_/g, " ")}</span></span>
                    <time className="tabular shrink-0 text-xs text-mute">{new Date(l.created_at).toLocaleString("pt-BR")}</time>
                  </li>
                ))}
                {!logs?.length && <li className="py-2 text-slate">Nada registrado ainda.</li>}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
