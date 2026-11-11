import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("full_name,role,organizations(name)").eq("id", user.id).single();

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[232px_1fr]">
      <Sidebar
        user={{ name: profile?.full_name ?? user.email ?? "", role: profile?.role ?? "leitor" }}
        org={(profile?.organizations as unknown as { name: string } | null)?.name ?? ""}
      />
      <main className="min-w-0 px-5 py-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
