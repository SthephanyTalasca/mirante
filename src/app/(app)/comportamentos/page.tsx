import { BehaviorCatalog } from "@/components/behavior-catalog";
import { PageHeader } from "@/components/ui";
import { loadCategories } from "@/lib/server/data";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Comportamentos" };

export default async function Comportamentos() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("org_id,role").eq("id", user!.id).single();
  const cats = await loadCategories(supabase, profile!.org_id);
  return (
    <>
      <PageHeader title="Banco de comportamentos"
        subtitle="O que a IA procura nos vídeos. Os critérios entram no pedido enviado ao modelo: alterar aqui muda a próxima análise, sem mexer em código." />
      <BehaviorCatalog initial={cats} canEdit={profile!.role === "admin"} />
    </>
  );
}
